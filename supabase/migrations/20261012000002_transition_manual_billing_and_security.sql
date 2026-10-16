-- ==============================================================================
-- METRIA CRM - MIGRATION INCREMENTAL DE TRANSIÇÃO: COBRANÇA MANUAL E SEGURANÇA
-- Versão: 20261012000002
-- Descrição:
--   1. Transição segura para bancos que já receberam a integração Asaas (preservando
--      dados e histórico existentes sem DROP CASCADE).
--   2. Proteção rígida no banco para plan, subscription_status, subscription_expires_at,
--      max_members e owner_id contra alterações diretas de clientes (inclusive owner/admin).
--   3. Criação da tabela de auditoria organization_plan_audit para liberações manuais.
--   4. Criação da RPC transacional admin_set_organization_plan (com validação de validade
--      e limites comerciais consolidados).
--   5. Atualização de is_org_member e get_user_role impondo status e validade de assinatura.
--   6. Alinhamento definitivo de create_organization_invite_v2 e accept_organization_invite
--      com p_org_id, token_hash e validações estritas de vínculo e validade.
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

-- Garante existência da coluna token_hash em organization_invites e respectivo índice
ALTER TABLE public.organization_invites 
  ADD COLUMN IF NOT EXISTS "token_hash" text;

CREATE INDEX IF NOT EXISTS idx_organization_invites_token_hash 
  ON public.organization_invites(token_hash);

-- Popula token_hash em convites legados se ainda for nulo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_invites' AND column_name = 'token_hash') THEN
    UPDATE public.organization_invites
    SET token_hash = encode(digest(token, 'sha256'), 'hex')
    WHERE token_hash IS NULL AND token IS NOT NULL;
  END IF;
END $$;

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
  IF current_setting('role', true) = 'authenticated' AND auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
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

  -- Validação estrita da data de liberação (não pode ser retroativa/no passado)
  IF p_expires_at IS NOT NULL AND p_expires_at <= timezone('utc'::text, now()) THEN
    RAISE EXCEPTION 'A data de expiração da liberação deve ser no futuro.';
  END IF;

  -- Consolidação dos limites comerciais em fonte única (max: 5, pro_max: 99, outros: 1)
  IF p_target_plan = 'max' THEN
    v_max_members := 5;
  ELSIF p_target_plan = 'pro_max' THEN
    v_max_members := 99;
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
-- 5. IMPOSIÇÃO DE STATUS E VALIDADE DA ASSINATURA EM get_user_role E is_org_member
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_role(p_org_id uuid)
RETURNS text
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT om.role INTO v_role
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.organization_id = p_org_id 
    AND om.user_id = auth.uid() 
    AND om.status = 'active'
    AND o.access_status = 'active'
    AND o.subscription_status = 'active'
    AND (
      o.plan = 'beta'
      OR o.subscription_expires_at IS NULL
      OR o.subscription_expires_at > timezone('utc'::text, now())
    );
  
  RETURN v_role;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.organization_id = p_org_id 
      AND om.user_id = auth.uid() 
      AND om.status = 'active'
      AND o.access_status = 'active'
      AND o.subscription_status = 'active'
      AND (
        o.plan = 'beta'
        OR o.subscription_expires_at IS NULL
        OR o.subscription_expires_at > timezone('utc'::text, now())
      )
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.get_user_role(p_org_id);
  RETURN COALESCE(v_role IN ('owner', 'admin'), false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_org_manager_or_higher(p_org_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.get_user_role(p_org_id);
  RETURN COALESCE(v_role IN ('owner', 'admin', 'manager'), false);
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 6. ALINHAMENTO DEFINITIVO DE create_organization_invite_v2 COM p_org_id E token_hash
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
  v_caller_role text;
  v_token text;
  v_token_hash text;
  v_target_role text;
  v_clean_email text;
  v_current_count integer;
  v_max_members integer;
  v_plan text;
  v_org_access_status text;
  v_sub_status text;
  v_sub_expires timestamp with time zone;
  v_invite_id uuid;
  v_expires_at timestamp with time zone;
BEGIN
  -- 1. Autenticação estrita do chamador
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Exigência estrita de vínculo ativo na organização e papel owner/admin (recusa explícita de NULL)
  v_caller_role := public.get_user_role(p_org_id);
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não possui vínculo ativo nesta organização.';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas proprietários e administradores com vínculo ativo podem convidar membros.';
  END IF;

  -- 3. Validação de e-mail e cargo
  v_clean_email := LOWER(TRIM(p_invited_email));
  IF v_clean_email IS NULL OR v_clean_email = '' OR position('@' in v_clean_email) = 0 THEN
    RAISE EXCEPTION 'E-mail do convidado inválido.';
  END IF;

  v_target_role := LOWER(TRIM(COALESCE(p_role, 'broker')));
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite another owner directly. Transfer ownership instead.';
  END IF;

  IF v_target_role NOT IN ('admin', 'manager', 'broker') THEN
    RAISE EXCEPTION 'Cargo inválido para convite. Escolha admin, manager ou broker.';
  END IF;

  -- Admin não pode convidar com cargo superior ou igual sem ser owner
  IF v_caller_role = 'admin' AND v_target_role IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Apenas o proprietário pode convidar novos administradores.';
  END IF;

  -- 4. Verificação de membro ativo já existente com esse e-mail na organização
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND LOWER(email) = v_clean_email
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Este usuário já é um membro ativo desta organização.';
  END IF;

  -- 5. Verificação da integridade, suspensão, validade de assinatura e cota de membros da organização
  SELECT plan, max_members, access_status, subscription_status, subscription_expires_at
  INTO v_plan, v_max_members, v_org_access_status, v_sub_status, v_sub_expires
  FROM public.organizations
  WHERE id = p_org_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada.';
  END IF;

  IF v_org_access_status = 'suspended' THEN
    RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência financeira.';
  END IF;

  IF v_sub_status <> 'active' THEN
    RAISE EXCEPTION 'Acesso negado: a assinatura da organização está inativa ou suspensa.';
  END IF;

  IF v_plan <> 'beta' AND v_sub_expires IS NOT NULL AND v_sub_expires <= timezone('utc'::text, now()) THEN
    RAISE EXCEPTION 'Acesso negado: a assinatura da organização expirou.';
  END IF;

  -- Planos beta, start e pro não suportam convite de equipe
  IF v_plan IN ('beta', 'start', 'pro') THEN
    RAISE EXCEPTION 'Gestão de equipe está disponível apenas nos planos Max e PRO MAX.';
  END IF;

  -- 6. Contagem de membros ativos contra max_members consolidado
  SELECT count(*)
  INTO v_current_count
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND status = 'active';

  IF v_current_count >= COALESCE(v_max_members, 1) THEN
    RAISE EXCEPTION 'Limite de membros do plano atingido (% de %). Faça upgrade do plano para convidar mais membros.', v_current_count, v_max_members;
  END IF;

  -- 7. Geração criptograficamente segura de token e token_hash (SHA-256)
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := timezone('utc'::text, now()) + interval '7 days';

  -- 8. Cancelamento de convites pendentes anteriores para o mesmo e-mail
  UPDATE public.organization_invites
  SET status = 'cancelled'
  WHERE organization_id = p_org_id
    AND LOWER(invited_email) = v_clean_email
    AND status = 'pending';

  -- 9. Inserção do convite contendo tanto token quanto token_hash
  INSERT INTO public.organization_invites (
    organization_id,
    invited_email,
    invited_name,
    role,
    token,
    token_hash,
    status,
    invited_by,
    expires_at,
    created_at
  ) VALUES (
    p_org_id,
    v_clean_email,
    NULLIF(TRIM(p_invited_name), ''),
    v_target_role,
    v_token,
    v_token_hash,
    'pending',
    v_user_id,
    v_expires_at,
    timezone('utc'::text, now())
  ) RETURNING id INTO v_invite_id;

  -- 10. Retorno padronizado com token e token_hash
  RETURN json_build_object(
    'id', v_invite_id,
    'organizationId', p_org_id,
    'invitedEmail', v_clean_email,
    'invitedName', TRIM(p_invited_name),
    'role', v_target_role,
    'token', v_token,
    'token_hash', v_token_hash,
    'status', 'pending',
    'expiresAt', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_invite_v2(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_invite_v2(uuid, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. ALINHAMENTO DEFINITIVO DE accept_organization_invite COM token_hash E ASSINATURA
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_organization_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_user_name text;
  v_invite record;
  v_member_id uuid;
  v_current_count integer;
  v_max_members integer;
  v_input_hash text;
  v_plan text;
  v_org_access_status text;
  v_sub_status text;
  v_sub_expires timestamp with time zone;
BEGIN
  -- 1. Exige autenticação estrita
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Validação básica do token
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Token de convite é obrigatório';
  END IF;

  v_input_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  -- 3. Busca e bloqueia o convite (FOR UPDATE) comparando por hash ou por token direto (retrocompatibilidade)
  SELECT *
  INTO v_invite
  FROM public.organization_invites
  WHERE (token_hash = v_input_hash OR token = trim(p_token))
    AND status IN ('pending', 'accepted')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido, cancelado ou não encontrado.';
  END IF;

  -- 4. Idempotência e replay protection
  IF v_invite.status = 'accepted' THEN
    IF v_invite.accepted_by = v_user_id THEN
      RETURN json_build_object(
        'success', true,
        'message', 'Convite já aceito anteriormente por esta conta.',
        'organizationId', v_invite.organization_id,
        'role', v_invite.role
      );
    ELSE
      RAISE EXCEPTION 'Este convite já foi utilizado por outro usuário.';
    END IF;
  END IF;

  -- 5. Validação de expiração temporal
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < timezone('utc'::text, now()) THEN
    UPDATE public.organization_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Este convite expirou.';
  END IF;

  -- 6. Obtém o e-mail e nome confirmados do usuário autenticado
  SELECT email, COALESCE(name, username, '')
  INTO v_user_email, v_user_name
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_email IS NULL OR v_user_email = '' THEN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;
  END IF;

  -- 7. Validação estrita do destinatário do convite
  IF LOWER(TRIM(v_user_email)) <> LOWER(TRIM(v_invite.invited_email)) THEN
    RAISE EXCEPTION 'Este convite foi enviado para "%", mas você está autenticado como "%". Faça login com o e-mail correto.', v_invite.invited_email, v_user_email;
  END IF;

  -- 8. Verificação transacional de status, suspensão, assinatura e limite de membros da organização
  SELECT plan, max_members, access_status, subscription_status, subscription_expires_at
  INTO v_plan, v_max_members, v_org_access_status, v_sub_status, v_sub_expires
  FROM public.organizations
  WHERE id = v_invite.organization_id
  FOR SHARE;

  IF v_org_access_status = 'suspended' THEN
    RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência financeira.';
  END IF;

  IF v_sub_status <> 'active' THEN
    RAISE EXCEPTION 'Acesso negado: a assinatura da organização está inativa ou suspensa.';
  END IF;

  IF v_plan <> 'beta' AND v_sub_expires IS NOT NULL AND v_sub_expires <= timezone('utc'::text, now()) THEN
    RAISE EXCEPTION 'Acesso negado: a assinatura da organização expirou.';
  END IF;

  SELECT count(*)
  INTO v_current_count
  FROM public.organization_members
  WHERE organization_id = v_invite.organization_id
    AND status = 'active'
    AND user_id <> v_user_id;

  IF v_max_members IS NOT NULL AND v_current_count >= v_max_members THEN
    RAISE EXCEPTION 'A organização atingiu a cota máxima de membros ativos. Contate o administrador.';
  END IF;

  -- 9. Inserção / reativação atômica em organization_members
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    name,
    email,
    role,
    status
  ) VALUES (
    v_invite.organization_id,
    v_user_id,
    COALESCE(NULLIF(v_user_name, ''), v_invite.invited_name, 'Colaborador'),
    v_user_email,
    v_invite.role,
    'active'
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_member_id;

  -- 10. Atualiza convite como aceito
  UPDATE public.organization_invites
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = timezone('utc'::text, now())
  WHERE id = v_invite.id;

  -- 11. Atualiza perfil do usuário se ainda não possui organização padrão
  UPDATE public.profiles
  SET default_organization_id = COALESCE(default_organization_id, v_invite.organization_id),
      "current_role" = COALESCE("current_role", v_invite.role),
      "onboardingCompleted" = true
  WHERE id = v_user_id;

  RETURN json_build_object(
    'success', true,
    'memberId', v_member_id,
    'organizationId', v_invite.organization_id,
    'role', v_invite.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_organization_invite(text) TO authenticated, service_role;

-- Recarrega o cache do PostgREST
NOTIFY pgrst, 'reload schema';
