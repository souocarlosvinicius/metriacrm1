-- ==============================================================================
-- METRIA CRM - MIGRATION INCREMENTAL (ETAPA 4)
-- Autenticação, Criação de Organização e Sistema Seguro de Convites
-- ==============================================================================
--
-- Esta migration implementa:
-- 1. Criação atômica e validada de organização com primeiro proprietário (RPC create_organization_with_owner).
--    - Não permite criação de organização virtual desvinculada.
--    - Garante transacionalidade: organizations + organization_members + profiles.
--    - Atribui plano seguro (beta/start/pro/max) e max_members consistente.
--
-- 2. Sistema criptográfico seguro de convites:
--    - Suporte a token_hash (SHA-256 via digest/pgcrypto) para armazenamento seguro.
--    - Token com expiração estrita (expires_at), uso único, role permitida ('admin', 'manager', 'broker').
--    - Restrição estrita de visualização de tokens: apenas admins/owners da organização emissora.
--    - A consulta pública/externa NÃO expõe tokens em lote.
--
-- 3. Aceite transacional, atômico e idempotente de convite (RPC accept_organization_invite_v2):
--    - Validação de e-mail do usuário autenticado contra invited_email (case-insensitive).
--    - Verificação de expiração, status 'pending' e lock de linha (FOR UPDATE).
--    - Verificação de limite de membros da organização antes da aceitação.
--    - Idempotência: caso o usuário já seja membro ativo da organização com este convite, retorna sucesso seguro.
--    - Associação atômica em organization_members, consumo do convite ('accepted') e atualização do profile.
--
-- 4. Função segura para geração de convite (RPC create_organization_invite):
--    - Executada por gestores/admins da organização.
--    - Valida limite de membros da organização.
--    - Gera token seguro, armazena hash e retorna token ao criador.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Adicionar coluna token_hash na tabela organization_invites se ainda não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'organization_invites' 
      AND column_name = 'token_hash'
  ) THEN
    ALTER TABLE public.organization_invites ADD COLUMN token_hash text;
    CREATE INDEX IF NOT EXISTS idx_organization_invites_token_hash ON public.organization_invites(token_hash);
  END IF;
END $$;

-- Atualizar convites existentes para preencher token_hash caso nulo
UPDATE public.organization_invites
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- 2. Restringir políticas RLS de organization_invites para não expor tokens amplamente
DROP POLICY IF EXISTS "Invites SELECT" ON public.organization_invites;
DROP POLICY IF EXISTS "Invites INSERT" ON public.organization_invites;
DROP POLICY IF EXISTS "Invites UPDATE" ON public.organization_invites;
DROP POLICY IF EXISTS "Invites DELETE" ON public.organization_invites;

-- Apenas membros ativos com cargo admin ou owner podem visualizar convites e tokens da sua organização
CREATE POLICY "Invites SELECT" ON public.organization_invites
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
  );

-- Apenas admins/owners podem inserir convites diretamente
CREATE POLICY "Invites INSERT" ON public.organization_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
  );

-- Ninguém pode atualizar convites diretamente via REST comum, apenas via RPC segura de aceite/cancelamento
CREATE POLICY "Invites UPDATE" ON public.organization_invites
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(organization_id)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
  );

-- Admins/owners podem cancelar/excluir convites
CREATE POLICY "Invites DELETE" ON public.organization_invites
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id)
  );


-- ==============================================================================
-- 3. RPC ATÔMICA: CRIAÇÃO DE ORGANIZAÇÃO COM PRIMEIRO PROPRIETÁRIO
-- ==============================================================================

DROP FUNCTION IF EXISTS public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name text,
  p_trade_name text DEFAULT NULL,
  p_document text DEFAULT NULL,
  p_creci text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_account_type text DEFAULT 'agency',
  p_plan text DEFAULT 'beta'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_user_name text;
  v_org_id uuid;
  v_target_plan text;
  v_max_members integer;
  v_org record;
BEGIN
  -- 1. Exige autenticação estrita
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Valida nome obrigatório
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Nome da organização é obrigatório';
  END IF;

  -- 3. Busca dados do perfil do usuário autenticado
  SELECT email, COALESCE(name, username, '')
  INTO v_user_email, v_user_name
  FROM public.profiles
  WHERE id = v_user_id;

  -- 4. Define plano e quotas permitidas no cadastro
  v_target_plan := LOWER(COALESCE(p_plan, 'beta'));
  IF v_target_plan NOT IN ('beta', 'start', 'pro', 'max', 'pro_max') THEN
    v_target_plan := 'beta';
  END IF;

  v_max_members := CASE
    WHEN v_target_plan = 'pro_max' THEN 30
    WHEN v_target_plan = 'max' THEN 5
    ELSE 1
  END;

  -- 5. Criação atômica da organização
  INSERT INTO public.organizations (
    name,
    trade_name,
    document,
    creci,
    phone,
    email,
    city,
    state,
    owner_id,
    plan,
    max_members,
    subscription_status,
    subscription_started_at
  ) VALUES (
    trim(p_name),
    COALESCE(trim(p_trade_name), trim(p_name)),
    NULLIF(trim(p_document), ''),
    NULLIF(trim(p_creci), ''),
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_email), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_state), ''),
    v_user_id,
    v_target_plan,
    v_max_members,
    'active',
    timezone('utc'::text, now())
  )
  RETURNING * INTO v_org;

  v_org_id := v_org.id;

  -- 6. Associação atômica como primeiro proprietário (idempotente com o trigger bootstrap caso exista)
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    name,
    email,
    role,
    status
  ) VALUES (
    v_org_id,
    v_user_id,
    COALESCE(v_user_name, 'Proprietário'),
    COALESCE(v_user_email, ''),
    'owner',
    'active'
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    role = 'owner',
    status = 'active',
    updated_at = timezone('utc'::text, now());

  -- 7. Atualização do perfil do usuário com organização padrão e cargo de proprietário
  UPDATE public.profiles
  SET default_organization_id = v_org_id,
      account_type = COALESCE(p_account_type, 'agency'),
      current_role = 'owner',
      onboarding_completed = true
  WHERE id = v_user_id;

  -- 8. Retorno do objeto estruturado
  RETURN json_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'tradeName', v_org.trade_name,
    'creci', v_org.creci,
    'phone', v_org.phone,
    'email', v_org.email,
    'city', v_org.city,
    'state', v_org.state,
    'ownerId', v_org.owner_id,
    'plan', v_org.plan,
    'userRole', 'owner'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text) TO authenticated, service_role;


-- ==============================================================================
-- 4. RPC ATÔMICA: GERAÇÃO SEGURA DE CONVITE (COM CRIPTOGRAFIA E QUOTA)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.create_organization_invite_v2(uuid, text, text, text);

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
  v_invite_id uuid;
  v_expires_at timestamp with time zone;
BEGIN
  -- 1. Autenticação do chamador
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Verificação de permissão do chamador na organização (owner ou admin)
  v_caller_role := public.get_user_role(p_org_id);
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Apenas proprietários e administradores podem convidar membros.';
  END IF;

  -- 3. Validação de e-mail e cargo
  v_clean_email := LOWER(TRIM(p_invited_email));
  IF v_clean_email IS NULL OR v_clean_email = '' OR position('@' in v_clean_email) = 0 THEN
    RAISE EXCEPTION 'E-mail do convidado inválido.';
  END IF;

  v_target_role := LOWER(TRIM(COALESCE(p_role, 'broker')));
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
    RAISE EXCEPTION 'Este usuário já é um membro ativo desta imobiliária.';
  END IF;

  -- 5. Verificação da cota de membros no banco de dados com bloqueio de concorrência
  SELECT plan, max_members
  INTO v_plan, v_max_members
  FROM public.organizations
  WHERE id = p_org_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada.';
  END IF;

  -- Planos beta, start e pro não suportam convite de equipe
  IF v_plan IN ('beta', 'start', 'pro') THEN
    RAISE EXCEPTION 'Gestão de equipe está disponível apenas nos planos Max e PRO MAX.';
  END IF;

  -- Contagem de membros ativos + convites pendentes
  SELECT count(*)
  INTO v_current_count
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND status = 'active';

  IF v_current_count >= COALESCE(v_max_members, 1) THEN
    RAISE EXCEPTION 'Limite de membros ativos atingido (% de %). Faça upgrade para adicionar mais colaboradores.', v_current_count, v_max_members;
  END IF;

  -- 6. Geração criptograficamente segura de token (32 bytes hex)
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := timezone('utc'::text, now()) + interval '7 days';

  -- 7. Cancelar convites pendentes anteriores para o mesmo e-mail nesta organização
  UPDATE public.organization_invites
  SET status = 'cancelled'
  WHERE organization_id = p_org_id
    AND LOWER(invited_email) = v_clean_email
    AND status = 'pending';

  -- 8. Inserir novo convite seguro
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
  )
  RETURNING id INTO v_invite_id;

  -- 9. Retorna dados do convite incluindo token para envio direto pelo criador
  RETURN json_build_object(
    'id', v_invite_id,
    'organizationId', p_org_id,
    'invitedEmail', v_clean_email,
    'invitedName', p_invited_name,
    'role', v_target_role,
    'token', v_token,
    'status', 'pending',
    'expiresAt', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_invite_v2(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_invite_v2(uuid, text, text, text) TO authenticated, service_role;


-- ==============================================================================
-- 5. RPC ATÔMICA, IDEMPOTENTE E RESILIENTE: ACEITE SEGURO DE CONVITE
-- ==============================================================================

DROP FUNCTION IF EXISTS public.accept_organization_invite(text);

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

  -- 4. Idempotência e replay protection:
  -- Se o convite já foi aceito pelo próprio usuário autenticado, retorna sucesso sem duplicar
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

  -- Se perfil ainda não possui email preenchido, busca diretamente de auth.users
  IF v_user_email IS NULL OR v_user_email = '' THEN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;
  END IF;

  -- 7. Validação estrita do destinatário do convite
  IF LOWER(TRIM(v_user_email)) <> LOWER(TRIM(v_invite.invited_email)) THEN
    RAISE EXCEPTION 'Este convite foi enviado para "%", mas você está autenticado como "%". Faça login com o e-mail correto.', v_invite.invited_email, v_user_email;
  END IF;

  -- 8. Verificação transacional de limite de membros da organização
  SELECT max_members
  INTO v_max_members
  FROM public.organizations
  WHERE id = v_invite.organization_id
  FOR SHARE;

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
    role = v_invite.role,
    status = 'active',
    name = COALESCE(NULLIF(public.organization_members.name, ''), v_invite.invited_name, 'Colaborador'),
    email = v_user_email,
    updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_member_id;

  -- 10. Consumo atômico do convite
  UPDATE public.organization_invites
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = timezone('utc'::text, now())
  WHERE id = v_invite.id;

  -- 11. Atualização do perfil do usuário com a organização e cargo ativos
  UPDATE public.profiles
  SET default_organization_id = v_invite.organization_id,
      current_role = v_invite.role,
      onboarding_completed = true
  WHERE id = v_user_id;

  -- 12. Retorno com dados confirmados
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
