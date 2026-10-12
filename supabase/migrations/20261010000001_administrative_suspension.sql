-- ==============================================================================
-- METRIA CRM - MIGRATION INCREMENTAL: SUSPENSÃO E REATIVAÇÃO ADMINISTRATIVA
-- Versão: 20261010000001
-- Descrição:
--   1. Adiciona estado de acesso administrativo em organizations (access_status,
--      suspended_at, suspension_reason, suspended_by).
--   2. Cria tabela de auditoria protegida (organization_access_audit).
--   3. Protege campos contra alteração direta pelo cliente (trigger protect_organization_access_status).
--   4. Atualiza is_org_member e policies RLS para exigir access_status = 'active'.
--   5. Atualiza RPCs SECURITY DEFINER e Storage para validar access_status.
--   6. Cria RPC transacional admin_set_organization_access_status.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CAMPOS DE ESTADO DE ACESSO ADMINISTRATIVO EM ORGANIZATIONS
-- ------------------------------------------------------------------------------

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "access_status" text DEFAULT 'active' NOT NULL;

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "suspension_reason" text;

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "suspended_by" text;

-- Garante constraint de validação de valores de access_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_access_status_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_access_status_check
      CHECK (access_status IN ('active', 'suspended'));
  END IF;
END $$;

-- Garante que todas as contas existentes permaneçam ativas
UPDATE public.organizations 
SET access_status = 'active' 
WHERE access_status IS NULL;

-- ------------------------------------------------------------------------------
-- 2. TABELA DE AUDITORIA ADMINISTRATIVA PROTEGIDA
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_access_audit (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  "action" text NOT NULL CHECK (action IN ('suspend', 'reactivate')),
  "previous_status" text NOT NULL,
  "new_status" text NOT NULL,
  "reason" text,
  "performed_by" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_access_audit_org_created
  ON public.organization_access_audit (organization_id, created_at DESC);

ALTER TABLE public.organization_access_audit ENABLE ROW LEVEL SECURITY;

-- Nenhuma política pública de inserção/alteração direta na auditoria
DROP POLICY IF EXISTS "org_access_audit_admin_select" ON public.organization_access_audit;
CREATE POLICY "org_access_audit_admin_select" ON public.organization_access_audit
  FOR SELECT TO authenticated
  USING (
    -- Somente acessível via service_role ou administradores internos
    auth.role() = 'service_role'
  );

-- ------------------------------------------------------------------------------
-- 3. TRIGGER DE PROTEÇÃO CONTRA ALTERAÇÃO DIRETA POR CLIENTE
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_organization_access_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se executado por usuário autenticado do Supabase (cliente normal, não service_role)
  IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
    IF NEW.access_status IS DISTINCT FROM OLD.access_status THEN
      RAISE EXCEPTION 'Acesso negado: o status administrativo de acesso (access_status) só pode ser alterado por administradores internos da Metria.';
    END IF;
    IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
      NEW.suspended_at := OLD.suspended_at;
    END IF;
    IF NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
      NEW.suspension_reason := OLD.suspension_reason;
    END IF;
    IF NEW.suspended_by IS DISTINCT FROM OLD.suspended_by THEN
      NEW.suspended_by := OLD.suspended_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_org_access_status ON public.organizations;
CREATE TRIGGER trg_protect_org_access_status
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.protect_organization_access_status();

-- ------------------------------------------------------------------------------
-- 4. VERIFICAÇÃO CENTRAL DE ACESSO À ORGANIZAÇÃO EM POLICIES RLS
-- ------------------------------------------------------------------------------

-- Atualiza is_org_member para exigir membership ativa E access_status = 'active'
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
  );
END;
$$ LANGUAGE plpgsql;

-- Permite que membros da organização leiam o registro de sua organização mesmo se suspensa
-- (necessário para que a interface informe ao usuário sobre a pendência com motivo e data)
DROP POLICY IF EXISTS "Organizations SELECT" ON public.organizations;
CREATE POLICY "Organizations SELECT" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organizations.id 
        AND om.user_id = auth.uid() 
        AND om.status = 'active'
    )
  );

-- Atualiza políticas de Storage de Documentos Privados para bloquear quando a organização estiver suspensa
DROP POLICY IF EXISTS "private_documents_tenant_select" ON storage.objects;
CREATE POLICY "private_documents_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-documents' AND
    (storage.foldername(storage.objects.name))[1] = 'tenants' AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id::text = (storage.foldername(storage.objects.name))[2]
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "private_documents_tenant_insert" ON storage.objects;
CREATE POLICY "private_documents_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'private-documents' AND
    (storage.foldername(storage.objects.name))[1] = 'tenants' AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id::text = (storage.foldername(storage.objects.name))[2]
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "private_documents_tenant_delete" ON storage.objects;
CREATE POLICY "private_documents_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'private-documents' AND
    (storage.foldername(storage.objects.name))[1] = 'tenants' AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.organization_id::text = (storage.foldername(storage.objects.name))[2]
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
        AND o.access_status = 'active'
    )
  );

-- Atualiza upload em property-images para bloquear organização suspensa
DROP POLICY IF EXISTS "property_images_tenant_insert" ON storage.objects;
CREATE POLICY "property_images_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-images' AND
    (
      ((storage.foldername(storage.objects.name))[1] = 'tenants' AND EXISTS (
        SELECT 1 FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
        WHERE om.organization_id::text = (storage.foldername(storage.objects.name))[2]
          AND om.user_id = auth.uid()
          AND om.status = 'active'
          AND o.access_status = 'active'
      )) OR
      ((storage.foldername(storage.objects.name))[1] = 'users' AND (storage.foldername(storage.objects.name))[2] = auth.uid()::text)
    )
  );

-- ------------------------------------------------------------------------------
-- 5. RPC TRANSACIONAL DE SUSPENSÃO E REATIVAÇÃO ADMINISTRATIVA
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_organization_access_status(
  p_org_id uuid,
  p_new_status text,
  p_reason text,
  p_admin_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status text;
  v_org_name text;
  v_audit_id uuid;
  v_trimmed_reason text := trim(COALESCE(p_reason, ''));
BEGIN
  IF p_new_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Status inválido: deve ser active ou suspended';
  END IF;

  IF p_new_status = 'suspended' AND v_trimmed_reason = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório para suspensão administrativa da organização';
  END IF;

  -- Busca e trava a organização para atualização atômica e segura
  SELECT access_status, name INTO v_old_status, v_org_name
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada';
  END IF;

  -- Se for suspensão
  IF p_new_status = 'suspended' THEN
    UPDATE public.organizations
    SET access_status = 'suspended',
        suspended_at = timezone('utc'::text, now()),
        suspension_reason = v_trimmed_reason,
        suspended_by = p_admin_id
    WHERE id = p_org_id;

    INSERT INTO public.organization_access_audit (
      organization_id,
      action,
      previous_status,
      new_status,
      reason,
      performed_by,
      metadata
    ) VALUES (
      p_org_id,
      'suspend',
      COALESCE(v_old_status, 'active'),
      'suspended',
      v_trimmed_reason,
      p_admin_id,
      p_metadata
    ) RETURNING id INTO v_audit_id;

  ELSE -- Se for reativação
    -- Reativar remove somente a suspensão administrativa.
    -- Não altera plano, pagamento, datas de validade ou limites comerciais.
    UPDATE public.organizations
    SET access_status = 'active',
        suspended_at = NULL,
        suspension_reason = NULL,
        suspended_by = NULL
    WHERE id = p_org_id;

    INSERT INTO public.organization_access_audit (
      organization_id,
      action,
      previous_status,
      new_status,
      reason,
      performed_by,
      metadata
    ) VALUES (
      p_org_id,
      'reactivate',
      COALESCE(v_old_status, 'suspended'),
      'active',
      CASE WHEN v_trimmed_reason <> '' THEN v_trimmed_reason ELSE 'Reativação administrativa manual' END,
      p_admin_id,
      p_metadata
    ) RETURNING id INTO v_audit_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'organization_id', p_org_id,
    'name', v_org_name,
    'previous_status', v_old_status,
    'access_status', p_new_status,
    'audit_id', v_audit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_organization_access_status(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_access_status(uuid, text, text, text, jsonb) TO service_role;

-- ------------------------------------------------------------------------------
-- 6. ATUALIZAÇÃO DE RPCS SECURITY DEFINER PARA BLOQUEIO EM SUSPENSÃO
-- ------------------------------------------------------------------------------

-- 6.1 Exclusão de cliente em cascata bloqueada se organização estiver suspensa
CREATE OR REPLACE FUNCTION public.delete_client_cascade(p_client_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_client_owner uuid;
  v_client_org uuid;
  v_client_assigned_to uuid;
  v_user_role text;
  v_is_authorized boolean := FALSE;
  v_is_active_member boolean := FALSE;
  v_org_access_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT "userId", organization_id, assigned_to
  INTO v_client_owner, v_client_org, v_client_assigned_to
  FROM public.clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF v_client_org IS NOT NULL THEN
    -- Verifica se a organização está suspensa
    SELECT access_status INTO v_org_access_status
    FROM public.organizations
    WHERE id = v_client_org;

    IF v_org_access_status = 'suspended' THEN
      RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência financeira';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = v_client_org
        AND user_id = v_user_id
        AND status = 'active'
    ) INTO v_is_active_member;

    IF v_is_active_member IS NOT TRUE THEN
      RAISE EXCEPTION 'Access denied: not an active member of this organization';
    END IF;

    v_user_role := public.get_user_role(v_client_org);

    IF (v_user_role IN ('owner', 'admin', 'manager')) = TRUE THEN
      v_is_authorized := TRUE;
    ELSIF (v_client_assigned_to = v_user_id) = TRUE THEN
      v_is_authorized := TRUE;
    ELSE
      v_is_authorized := FALSE;
    END IF;
  ELSE
    IF v_client_owner = v_user_id THEN
      v_is_authorized := TRUE;
    ELSE
      v_is_authorized := FALSE;
    END IF;
  END IF;

  IF v_is_authorized IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: you do not have permission to delete this client';
  END IF;

  DELETE FROM public.history_events WHERE "clientId" = p_client_id;
  DELETE FROM public.tasks WHERE "clientId" = p_client_id;
  DELETE FROM public.visits WHERE "clientId" = p_client_id;
  DELETE FROM public.proposals WHERE "clientId" = p_client_id;
  DELETE FROM public.clients WHERE id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'deletedClientId', p_client_id
  );
END;
$$;

-- 6.2 Transferência de leads/clientes bloqueada se organização estiver suspensa
CREATE OR REPLACE FUNCTION public.transfer_client_assignment(
  p_client_ids uuid[],
  p_target_broker_id uuid,
  p_organization_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_updated_count integer := 0;
  v_client_id uuid;
  v_org_access_status text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Validação de suspensão da organização
  SELECT access_status INTO v_org_access_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_access_status = 'suspended' THEN
    RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência financeira';
  END IF;

  v_actor_role := public.get_user_role(p_organization_id);
  IF v_actor_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores ou gerentes podem transferir carteira';
  END IF;

  SELECT role INTO v_target_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = p_target_broker_id
    AND status = 'active';

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'O corretor de destino não é um membro ativo desta organização';
  END IF;

  FOREACH v_client_id IN ARRAY p_client_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = v_client_id AND organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'O cliente % não pertence a esta organização', v_client_id;
    END IF;

    UPDATE public.clients
    SET assigned_to = p_target_broker_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_client_id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'transferredCount', v_updated_count,
    'targetBrokerId', p_target_broker_id
  );
END;
$$;

-- 6.3 Convites bloqueados se organização estiver suspensa
CREATE OR REPLACE FUNCTION public.create_organization_invite_v2(
  p_organization_id uuid,
  p_invited_email text,
  p_invited_name text,
  p_role text
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
  WHERE id = p_organization_id;

  IF v_org_access_status = 'suspended' THEN
    RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência financeira';
  END IF;

  v_user_role := public.get_user_role(p_organization_id);
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
  WHERE organization_id = p_organization_id AND status = 'active';

  SELECT max_members INTO v_max_members
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_max_members IS NOT NULL AND v_current_count >= v_max_members THEN
    RAISE EXCEPTION 'Limite de membros do plano atingido (% de %). Faça upgrade do plano para convidar mais membros.', v_current_count, v_max_members;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    JOIN auth.users u ON u.id = om.user_id
    WHERE om.organization_id = p_organization_id
      AND lower(u.email) = v_clean_email
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Este usuário já é um membro ativo desta organização';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

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
    p_organization_id,
    v_clean_email,
    nullif(trim(p_invited_name), ''),
    p_role,
    v_token,
    'pending',
    v_user_id,
    timezone('utc'::text, now()) + interval '7 days'
  ) RETURNING id INTO v_invite_id;

  RETURN json_build_object(
    'id', v_invite_id,
    'organization_id', p_organization_id,
    'invited_email', v_clean_email,
    'invited_name', trim(p_invited_name),
    'role', p_role,
    'token', v_token,
    'status', 'pending'
  );
END;
$$;
