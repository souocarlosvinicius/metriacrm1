-- ==============================================================================
-- MIGRATION: 20261009000001_fix_client_deletion_and_team_roles.sql
-- DESCRIPTION:
--   Etapa 1: Correção de exclusão de clientes e políticas de associação/cargo da equipe.
--   1. Reestrutura RPC delete_client_cascade e política RLS de Clients DELETE:
--      - Exige autenticação e vínculo ativo na organização do cliente.
--      - Autorização explícita por cargo (owner, admin, manager) ou responsabilidade (assigned_to, creator).
--      - Negação estrita quando a condição IS NOT TRUE (evita armadilha com NULL em NOT IN).
--      - Exclusão atômica de cliente e dependências na mesma transação.
--      - Trata cliente legado sem organização explicitamente (apenas creator/userId).
--   2. Remove autoassociação genérica baseada em auth.uid() = user_id.
--      - Bootstrap atômico do primeiro proprietário via trigger na criação da organização.
--      - Aceite de convites via função validada e transacional accept_organization_invite.
--   3. Impede autopromoção, reativação própria e troca de organization_id/user_id via trigger BEFORE UPDATE.
--      - Preserva o proprietário legítimo (não pode ser rebaixado nem inativado).
--      - Restringe valores de role e status com CHECK constraints.
--   4. Garante SECURITY DEFINER com search_path seguro, objetos qualificados,
--      verificação explícita de auth.uid() e revogação de privilégios de PUBLIC.
--   5. Corrige referência ambígua de coluna na política Profiles SELECT qualificando profiles.id.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CONSTRAINTS DE VALORES PERMITIDOS PARA ROLE E STATUS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Constraints para organization_members
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_organization_members_role'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT chk_organization_members_role
      CHECK (role IN ('owner', 'admin', 'manager', 'broker'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_organization_members_status'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT chk_organization_members_status
      CHECK (status IN ('active', 'inactive'));
  END IF;

  -- Constraints para organization_invites
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_organization_invites_role'
  ) THEN
    ALTER TABLE public.organization_invites
      ADD CONSTRAINT chk_organization_invites_role
      CHECK (role IN ('owner', 'admin', 'manager', 'broker'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_organization_invites_status'
  ) THEN
    ALTER TABLE public.organization_invites
      ADD CONSTRAINT chk_organization_invites_status
      CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. BOOTSTRAP ATÔMICO DO PRIMEIRO PROPRIETÁRIO NA CRIAÇÃO DA ORGANIZAÇÃO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_organization_bootstrap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_name text;
  v_user_email text;
BEGIN
  -- Valida se o owner_id corresponde ao usuário autenticado (ou execução privilegiada via backend)
  IF auth.uid() IS NOT NULL AND NEW.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'owner_id deve corresponder ao usuário autenticado';
  END IF;

  -- Obtém dados do perfil do proprietário
  SELECT COALESCE(name, username, 'Proprietário'), email
  INTO v_user_name, v_user_email
  FROM public.profiles
  WHERE id = NEW.owner_id;

  -- Cria atomicamente o registro de membro com papel de owner e status ativo
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    name,
    email,
    role,
    status
  )
  VALUES (
    NEW.id,
    NEW.owner_id,
    COALESCE(v_user_name, 'Proprietário'),
    COALESCE(v_user_email, ''),
    'owner',
    'active'
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    role = 'owner',
    status = 'active';

  -- Atualiza o perfil do usuário caso ainda não tenha organização padrão
  UPDATE public.profiles
  SET default_organization_id = COALESCE(default_organization_id, NEW.id),
      current_role = 'owner'
  WHERE id = NEW.owner_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_organization_bootstrap() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_handle_organization_bootstrap ON public.organizations;
CREATE TRIGGER trg_handle_organization_bootstrap
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_organization_bootstrap();

-- ------------------------------------------------------------------------------
-- 3. ACEITE SEGURO E ATÔMICO DE CONVITES DE ORGANIZAÇÃO (RPC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_organization_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invite record;
  v_user_name text;
  v_user_email text;
  v_member_id uuid;
BEGIN
  -- Exige usuário autenticado
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Token de convite é obrigatório';
  END IF;

  -- Localiza e trava o convite pendente na transação
  SELECT *
  INTO v_invite
  FROM public.organization_invites
  WHERE token = trim(p_token)
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido, expirado ou já aceito.';
  END IF;

  -- Verifica data de expiração
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    UPDATE public.organization_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Este convite expirou.';
  END IF;

  -- Dados do usuário que está aceitando
  SELECT COALESCE(name, username, ''), email
  INTO v_user_name, v_user_email
  FROM public.profiles
  WHERE id = v_user_id;

  -- Insere ou atualiza vínculo do membro com cargo definido pelo convite
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    name,
    email,
    role,
    status
  )
  VALUES (
    v_invite.organization_id,
    v_user_id,
    COALESCE(v_user_name, v_invite.invited_name, ''),
    COALESCE(v_user_email, v_invite.invited_email),
    v_invite.role,
    'active'
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    role = v_invite.role,
    status = 'active',
    updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_member_id;

  -- Marca convite como aceito
  UPDATE public.organization_invites
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = timezone('utc'::text, now())
  WHERE id = v_invite.id;

  -- Sincroniza organização padrão e cargo do usuário no perfil
  UPDATE public.profiles
  SET default_organization_id = v_invite.organization_id,
      current_role = v_invite.role,
      onboarding_completed = true
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

-- ------------------------------------------------------------------------------
-- 4. VALIDAÇÃO DE ATUALIZAÇÃO DE MEMBROS (BLOQUEIO DE AUTOPROMOÇÃO E HIERARQUIA)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_organization_member_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_org_owner_id uuid;
BEGIN
  -- Permite operações internas de serviço (ex: service_role) sem auth.uid()
  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. organization_id e user_id são estritamente imutáveis
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id cannot be changed';
  END IF;

  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;

  -- 2. Valida valores permitidos de role e status
  IF NEW.role NOT IN ('owner', 'admin', 'manager', 'broker') THEN
    RAISE EXCEPTION 'Invalid role: %', NEW.role;
  END IF;

  IF NEW.status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;

  -- 3. Impede autopromoção: nenhum usuário pode alterar seu próprio role
  IF OLD.user_id = v_actor_id AND NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'Self-promotion is prohibited: you cannot modify your own role';
  END IF;

  -- 4. Impede reativação própria: usuário inativo não pode se reativar
  IF OLD.user_id = v_actor_id AND OLD.status = 'inactive' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Self-reactivation is prohibited: only an administrator can reactivate your account';
  END IF;

  -- Identifica o proprietário legítimo da organização
  SELECT owner_id INTO v_org_owner_id
  FROM public.organizations
  WHERE id = OLD.organization_id;

  -- 5. Preservação do proprietário legítimo:
  -- O proprietário legítimo da organização nunca pode ser rebaixado nem inativado
  IF OLD.user_id = v_org_owner_id THEN
    IF NEW.role <> 'owner' THEN
      RAISE EXCEPTION 'Cannot demote the organization owner';
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'Cannot inactivate the organization owner';
    END IF;
  END IF;

  -- 6. Validação de hierarquia e autorização se cargo ou status foram modificados
  IF NEW.role <> OLD.role OR NEW.status <> OLD.status THEN
    v_actor_role := public.get_user_role(OLD.organization_id);

    -- Apenas owner ou admin ativos podem alterar cargos e status
    IF v_actor_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'Access denied: only organization owner or admin can update member roles or status';
    END IF;

    -- Apenas o proprietário legítimo pode promover outro usuário para owner
    IF NEW.role = 'owner' AND OLD.role <> 'owner' AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Access denied: only the organization owner can appoint another owner';
    END IF;

    -- Admins não podem alterar outros admins ou o proprietário
    IF v_actor_role = 'admin' AND OLD.role IN ('admin', 'owner') THEN
      RAISE EXCEPTION 'Access denied: admins cannot modify another admin or owner';
    END IF;
  END IF;

  -- Atualiza carimbo de tempo
  NEW.updated_at := timezone('utc'::text, now());

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_organization_member_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_check_organization_member_update ON public.organization_members;
CREATE TRIGGER trg_check_organization_member_update
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.check_organization_member_update();

-- ------------------------------------------------------------------------------
-- 5. POLÍTICAS RLS DE ORGANIZATION_MEMBERS
-- ------------------------------------------------------------------------------
-- SELECT: Apenas membros ativos da organização
DROP POLICY IF EXISTS "Members SELECT" ON public.organization_members;
CREATE POLICY "Members SELECT" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT: Remove autoassociação genérica baseada em auth.uid() = user_id.
-- Permitido apenas para admin/owner ativo da organização ou bootstrap do owner legítimo.
DROP POLICY IF EXISTS "Members INSERT" ON public.organization_members;
CREATE POLICY "Members INSERT" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = organization_id AND o.owner_id = auth.uid()
      )
      AND user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- UPDATE: Permitido para admin/owner da organização ou para o próprio usuário
-- (trigger check_organization_member_update protege contra autopromoção e troca de dados estruturais)
DROP POLICY IF EXISTS "Members UPDATE" ON public.organization_members;
CREATE POLICY "Members UPDATE" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR (user_id = auth.uid() AND public.is_org_member(organization_id))
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR (user_id = auth.uid() AND public.is_org_member(organization_id))
  );

-- DELETE: Apenas admin/owner da organização, e nunca pode excluir o proprietário legítimo
DROP POLICY IF EXISTS "Members DELETE" ON public.organization_members;
CREATE POLICY "Members DELETE" ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    AND user_id <> (SELECT owner_id FROM public.organizations WHERE id = organization_id)
  );

-- ------------------------------------------------------------------------------
-- 6. EXCLUSÃO DE CLIENTE BLINDADA (RPC delete_client_cascade)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_client_cascade(uuid);
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
BEGIN
  -- 1. Exige usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Localiza e bloqueia o cliente na transação para evitar concorrência
  SELECT "userId", organization_id, assigned_to
  INTO v_client_owner, v_client_org, v_client_assigned_to
  FROM public.clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  -- 3. Verificação de autorização explícita
  IF v_client_org IS NOT NULL THEN
    -- Exige vínculo ativo com a organização à qual o cliente pertence
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = v_client_org
        AND user_id = v_user_id
        AND status = 'active'
    ) INTO v_is_active_member;

    IF v_is_active_member IS NOT TRUE THEN
      RAISE EXCEPTION 'Access denied: not an active member of this organization';
    END IF;

    -- Obtém o cargo ativo do solicitante na organização
    v_user_role := public.get_user_role(v_client_org);

    -- Autorização explícita:
    -- a) Cargo de gestão (owner, admin, manager)
    IF (v_user_role IN ('owner', 'admin', 'manager')) = TRUE THEN
      v_is_authorized := TRUE;
    -- b) Responsabilidade como corretor atribuído ao cliente
    ELSIF (v_client_assigned_to = v_user_id) = TRUE THEN
      v_is_authorized := TRUE;
    -- c) Criador original do cliente dentro da organização
    ELSIF (v_client_owner = v_user_id) = TRUE THEN
      v_is_authorized := TRUE;
    END IF;

    -- Negação estrita quando a autorização IS NOT TRUE
    IF v_is_authorized IS NOT TRUE THEN
      RAISE EXCEPTION 'Access denied: insufficient permissions to delete client';
    END IF;

  ELSE
    -- Caso legado: cliente sem organização associada
    -- Permite única e exclusivamente o usuário criador/proprietário
    IF (v_client_owner = v_user_id) = TRUE THEN
      v_is_authorized := TRUE;
    END IF;

    IF v_is_authorized IS NOT TRUE THEN
      RAISE EXCEPTION 'Access denied: only owner can delete legacy client';
    END IF;
  END IF;

  -- 4. Exclusão em cascata protegida na mesma transação atômica
  -- a) Desvincula imóveis que tinham este cliente como proprietário
  UPDATE public.properties
  SET "ownerId" = NULL
  WHERE "ownerId" = p_client_id;

  -- b) Remove tarefas vinculadas
  DELETE FROM public.tasks
  WHERE "clientId" = p_client_id;

  -- c) Remove visitas vinculadas
  DELETE FROM public.visits
  WHERE "clientId" = p_client_id;

  -- d) Remove propostas vinculadas
  DELETE FROM public.proposals
  WHERE "clientId" = p_client_id;

  -- e) Remove eventos de histórico vinculados
  DELETE FROM public.history_events
  WHERE "clientId" = p_client_id;

  -- f) Remove o cliente
  DELETE FROM public.clients
  WHERE id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'deletedId', p_client_id
  );
END;
$$;

-- Revoga privilégios de PUBLIC e concede apenas a authenticated e service_role
REVOKE ALL ON FUNCTION public.delete_client_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_cascade(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. POLÍTICA RLS DE CLIENTS DELETE (REST E DIRECT QUERIES)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients DELETE" ON public.clients;
CREATE POLICY "Clients DELETE" ON public.clients
  FOR DELETE TO authenticated
  USING (
    -- Cliente legado sem organização: apenas o criador
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    -- Cliente da organização: exige vínculo ativo e autorização por cargo ou responsabilidade
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 8. CORREÇÃO DA REFERÊNCIA AMBÍGUA EM PROFILES SELECT
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles SELECT" ON public.profiles;
CREATE POLICY "Profiles SELECT" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    profiles.id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members m1
      JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
      WHERE m1.user_id = auth.uid()
        AND m1.status = 'active'
        AND m2.user_id = profiles.id
        AND m2.status = 'active'
    )
  );
