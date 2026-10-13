-- ==============================================================================
-- METRIA CRM - MIGRATION INCREMENTAL DE TRANSIÇÃO: COBRANÇA MANUAL E SEGURANÇA
-- Versão: 20261012000002
-- Descrição:
--   1. Transição segura para bancos que já receberam a integração Asaas (preservando
--      dados e histórico existentes sem DROP CASCADE).
--   2. Proteção rígida no banco para plan, subscription_status, subscription_expires_at,
--      max_members e owner_id contra alterações diretas de clientes (inclusive owner/admin).
--   3. Criação da tabela de auditoria organization_plan_audit para liberações manuais.
--   4. Criação da RPC transacional admin_set_organization_plan (plano, validade e auditoria).
--   5. Alinhamento definitivo de create_organization_invite_v2 com p_org_id.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PRESERVAÇÃO DE DADOS EXISTENTES E LIMPEZA DE TRIGGERS CONFLITANTES
-- ------------------------------------------------------------------------------

-- Remove triggers legados que bloqueavam operações administrativas sem usar DROP CASCADE
DROP TRIGGER IF EXISTS trg_protect_organization_financial_fields ON public.organizations;
DROP TRIGGER IF EXISTS trg_protect_subscriptions_records ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_protect_charges_records ON public.charges;
DROP TRIGGER IF EXISTS trg_protect_webhook_events_records ON public.webhook_events;

-- Garante existência da coluna canônica subscription_expires_at em organizations
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "subscription_expires_at" timestamp with time zone;

-- ------------------------------------------------------------------------------
-- 2. PROTEÇÃO NO BANCO CONTRA ALTERAÇÕES DIRETAS DE CLIENTES
--    Protege: plan, subscription_status, subscription_expires_at, max_members, owner_id
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_organization_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se a alteração vier de uma sessão autenticada de cliente (navegador/PostgREST)
  IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      -- Garante que o cadastro inicial de clientes seja estritamente no plano Beta
      NEW.plan := 'beta';
      NEW.subscription_status := 'active';
      NEW.subscription_expires_at := NULL;
      NEW.max_members := 1;
      NEW.access_status := 'active';
      NEW.suspended_at := NULL;
      NEW.suspension_reason := NULL;
      NEW.suspended_by := NULL;
      NEW.owner_id := auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
      IF (OLD.plan IS DISTINCT FROM NEW.plan) OR
         (OLD.subscription_status IS DISTINCT FROM NEW.subscription_status) OR
         (OLD.subscription_expires_at IS DISTINCT FROM NEW.subscription_expires_at) OR
         (OLD.max_members IS DISTINCT FROM NEW.max_members) OR
         (OLD.owner_id IS DISTINCT FROM NEW.owner_id) OR
         (OLD.id IS DISTINCT FROM NEW.id) OR
         (OLD.access_status IS DISTINCT FROM NEW.access_status) OR
         (OLD.suspended_at IS DISTINCT FROM NEW.suspended_at) OR
         (OLD.suspension_reason IS DISTINCT FROM NEW.suspension_reason) OR
         (OLD.suspended_by IS DISTINCT FROM NEW.suspended_by) THEN
        RAISE EXCEPTION 'Acesso negado: campos protegidos da organização (plano, assinatura, validade, membros, proprietário e status) não podem ser alterados diretamente por clientes.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_organization_protected_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_organization_protected_fields ON public.organizations;
CREATE TRIGGER trg_protect_organization_protected_fields
BEFORE INSERT OR UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.protect_organization_protected_fields();

-- ------------------------------------------------------------------------------
-- 3. TABELA DE AUDITORIA DE LIBERAÇÃO DE PLANOS (organization_plan_audit)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_plan_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'grant_plan', 'update_plan', 'expire_plan'
  previous_plan text NOT NULL,
  new_plan text NOT NULL,
  previous_expires_at timestamp with time zone,
  new_expires_at timestamp with time zone,
  previous_status text,
  new_status text,
  reason text NOT NULL,
  performed_by text NOT NULL,
  performed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_org_plan_audit_org_id 
  ON public.organization_plan_audit(organization_id, performed_at DESC);

ALTER TABLE public.organization_plan_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization plan audit SELECT" ON public.organization_plan_audit;
CREATE POLICY "Organization plan audit SELECT" ON public.organization_plan_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_plan_audit.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- ------------------------------------------------------------------------------
-- 4. RPC TRANSACIONAL: LIBERAÇÃO MANUAL DE PLANO POR ADMINISTRADOR INTERNO
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_organization_plan(
  p_organization_id uuid,
  p_target_plan text,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_admin_user_id text DEFAULT NULL,
  p_reason text DEFAULT 'Liberação manual de plano',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_plan text;
  v_old_expires_at timestamp with time zone;
  v_old_status text;
  v_org_name text;
  v_max_members integer;
  v_audit_id uuid;
  v_target_status text := 'active';
BEGIN
  IF p_target_plan NOT IN ('beta', 'start', 'pro', 'max', 'pro_max') THEN
    RAISE EXCEPTION 'Plano inválido: "%". Utilize beta, start, pro, max ou pro_max.', p_target_plan;
  END IF;

  -- Determina limite de membros com base no plano contratado
  IF p_target_plan = 'max' THEN
    v_max_members := 10;
  ELSIF p_target_plan = 'pro_max' THEN
    v_max_members := 50;
  ELSE
    v_max_members := 1;
  END IF;

  SELECT plan, subscription_expires_at, subscription_status, name
  INTO v_old_plan, v_old_expires_at, v_old_status, v_org_name
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização com ID "%" não encontrada.', p_organization_id;
  END IF;

  -- Atualização atômica na organização
  UPDATE public.organizations
  SET plan = p_target_plan,
      subscription_status = v_target_status,
      subscription_expires_at = p_expires_at,
      max_members = v_max_members,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_organization_id;

  -- Registro de auditoria na mesma transação
  INSERT INTO public.organization_plan_audit (
    organization_id,
    action,
    previous_plan,
    new_plan,
    previous_expires_at,
    new_expires_at,
    previous_status,
    new_status,
    reason,
    performed_by,
    metadata
  ) VALUES (
    p_organization_id,
    'grant_plan',
    COALESCE(v_old_plan, 'beta'),
    p_target_plan,
    v_old_expires_at,
    p_expires_at,
    COALESCE(v_old_status, 'active'),
    v_target_status,
    COALESCE(nullif(trim(p_reason), ''), 'Liberação manual de plano por administrador'),
    COALESCE(p_admin_user_id, 'admin'),
    p_metadata
  ) RETURNING id INTO v_audit_id;

  RETURN json_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'name', v_org_name,
    'previous_plan', v_old_plan,
    'plan', p_target_plan,
    'subscription_expires_at', p_expires_at,
    'subscription_status', v_target_status,
    'max_members', v_max_members,
    'audit_id', v_audit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_organization_plan(uuid, text, timestamp with time zone, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_plan(uuid, text, timestamp with time zone, text, text, jsonb) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. ALINHAMENTO DEFINITIVO DE create_organization_invite_v2 COM p_org_id
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_organization_invite_v2(
  p_org_id uuid,
  p_invited_email text,
  p_invited_name text DEFAULT NULL,
  p_role text DEFAULT 'broker'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_token text;
  v_invite_id uuid;
  v_current_count integer;
  v_max_members integer;
  v_clean_email text;
  v_org_access_status text;
  v_expires_at timestamp with time zone;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_clean_email := lower(trim(p_invited_email));
  IF v_clean_email = '' OR v_clean_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  -- Validação de suspensão da organização
  SELECT access_status INTO v_org_access_status
  FROM public.organizations
  WHERE id = p_org_id;

  IF v_org_access_status = 'suspended' THEN
    RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência financeira';
  END IF;

  v_user_role := public.get_user_role(p_org_id);
  IF v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Access denied: only organization owner or admin can invite members';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite another owner directly. Transfer ownership instead.';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'broker') THEN
    RAISE EXCEPTION 'Invalid role specified: %', p_role;
  END IF;

  SELECT count(*) INTO v_current_count
  FROM public.organization_members
  WHERE organization_id = p_org_id AND status = 'active';

  SELECT max_members INTO v_max_members
  FROM public.organizations
  WHERE id = p_org_id;

  IF v_max_members IS NOT NULL AND v_current_count >= v_max_members THEN
    RAISE EXCEPTION 'Limite de membros do plano atingido (% de %). Faça upgrade do plano para convidar mais membros.', v_current_count, v_max_members;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    JOIN auth.users u ON u.id = om.user_id
    WHERE om.organization_id = p_org_id
      AND lower(u.email) = v_clean_email
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Este usuário já é um membro ativo desta organização';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := timezone('utc'::text, now()) + interval '7 days';

  INSERT INTO public.organization_invites (
    organization_id,
    invited_email,
    invited_name,
    role,
    token,
    status,
    invited_by,
    expires_at
  ) VALUES (
    p_org_id,
    v_clean_email,
    nullif(trim(p_invited_name), ''),
    p_role,
    v_token,
    'pending',
    v_user_id,
    v_expires_at
  ) RETURNING id INTO v_invite_id;

  RETURN json_build_object(
    'id', v_invite_id,
    'organizationId', p_org_id,
    'invitedEmail', v_clean_email,
    'invitedName', trim(p_invited_name),
    'role', p_role,
    'token', v_token,
    'status', 'pending',
    'expiresAt', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_invite_v2(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_invite_v2(uuid, text, text, text) TO authenticated, service_role;

-- Recarrega o cache do PostgREST
NOTIFY pgrst, 'reload schema';
