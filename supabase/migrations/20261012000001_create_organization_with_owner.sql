-- ==============================================================================
-- METRIA CRM - MIGRATION INCREMENTAL REVISADA: ONBOARDING & ORGANIZAÇÃO
-- Versão: 20261012000001
-- Descrição:
--   1. Garante existência da coluna organizations.access_status e suas restrições,
--      compatível com a funcionalidade de suspensão/reativação administrativa.
--   2. Corrige a função de trigger handle_organization_bootstrap() para usar
--      identificadores cotados e colunas estritamente alinhadas ao schema.
--   3. Cria a RPC atômica public.create_organization_with_owner com:
--      - Fixação de plano no onboarding: v_target_plan = 'beta' e v_max_members = 1
--        (desconsiderando p_plan para impedir ativação gratuita de plano pago).
--      - Escrita estrita na coluna versionada "onboardingCompleted" e "current_role" cotado.
--      - Idempotência robusta para a operação inteira de onboarding (com trava transacional
--        por usuário via advisory xact lock para absorver requisições concorrentes/duplicadas),
--        sem restringir a criação legítima de outras organizações posteriores pelo mesmo usuário.
--      - Identificação do proprietário estritamente via auth.uid().
--      - Privilégios restritos: REVOKE FROM PUBLIC; GRANT TO authenticated, service_role.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. GARANTIR ORGANIZATIONS.ACCESS_STATUS (COMPATIBILIDADE COM SUSPENSÃO)
-- ------------------------------------------------------------------------------
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "access_status" text DEFAULT 'active' NOT NULL;

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "suspension_reason" text;

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS "suspended_by" text;

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

UPDATE public.organizations 
SET access_status = 'active' 
WHERE access_status IS NULL;

-- ------------------------------------------------------------------------------
-- 2. CORREÇÃO DA FUNÇÃO DO TRIGGER DE BOOTSTRAP (handle_organization_bootstrap)
--    Garante que identificadores como "current_role" e as colunas de perfil
--    sejam manipulados sem erro caso um INSERT em organizations ocorra diretamente.
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
  -- Se executado em contexto de usuário autenticado, valida se owner_id é o próprio usuário
  IF auth.uid() IS NOT NULL AND NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'owner_id deve corresponder ao usuário autenticado';
  END IF;

  IF NEW.owner_id IS NOT NULL THEN
    -- Obtém nome e e-mail do perfil ou auth.users
    SELECT COALESCE(name, username, 'Proprietário'), email
    INTO v_user_name, v_user_email
    FROM public.profiles
    WHERE id = NEW.owner_id;

    IF v_user_email IS NULL OR v_user_email = '' THEN
      SELECT email INTO v_user_email
      FROM auth.users
      WHERE id = NEW.owner_id;
    END IF;

    -- Cria/garante registro do primeiro membro como owner ativo (idempotente)
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      name,
      email,
      phone,
      creci,
      role,
      status
    )
    VALUES (
      NEW.id,
      NEW.owner_id,
      COALESCE(NULLIF(v_user_name, ''), 'Proprietário'),
      COALESCE(v_user_email, ''),
      NULLIF(trim(NEW.phone), ''),
      NULLIF(trim(NEW.creci), ''),
      'owner',
      'active'
    )
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET
      role = 'owner',
      status = 'active',
      name = COALESCE(NULLIF(EXCLUDED.name, ''), organization_members.name),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), organization_members.email),
      phone = COALESCE(NULLIF(EXCLUDED.phone, ''), organization_members.phone),
      creci = COALESCE(NULLIF(EXCLUDED.creci, ''), organization_members.creci),
      updated_at = timezone('utc'::text, now());

    -- Atualiza default_organization_id caso o usuário ainda não possua uma definida
    UPDATE public.profiles
    SET default_organization_id = COALESCE(default_organization_id, NEW.id),
        "current_role" = COALESCE("current_role", 'owner'),
        "updatedAt" = timezone('utc'::text, now())
    WHERE id = NEW.owner_id;
  END IF;

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
-- 3. RPC ATÔMICA: CRIAÇÃO DE ORGANIZAÇÃO NO ONBOARDING
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_account_type text DEFAULT 'agency',
  p_city text DEFAULT NULL,
  p_creci text DEFAULT NULL,
  p_document text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_plan text DEFAULT 'beta',
  p_state text DEFAULT NULL,
  p_trade_name text DEFAULT NULL
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
  v_existing_org record;
  v_existing_profile record;
  v_org record;
  v_org_id uuid;
  v_target_plan text;
  v_max_members integer;
  v_clean_name text;
  v_clean_trade_name text;
BEGIN
  -- 1. Exige autenticação estrita: obtém proprietário exclusivamente por auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado: faça login para criar uma organização.';
  END IF;

  -- 2. Valida nome obrigatório
  v_clean_name := trim(COALESCE(p_name, ''));
  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Nome da organização é obrigatório.';
  END IF;

  v_clean_trade_name := COALESCE(NULLIF(trim(COALESCE(p_trade_name, '')), ''), v_clean_name);

  -- 3. Trava transacional exclusiva por usuário (Advisory Xact Lock)
  -- Garante serialização estrita para chamadas concorrentes/cliques duplos do mesmo usuário,
  -- sem travar nem impactar outros usuários do sistema.
  PERFORM pg_advisory_xact_lock(hashtext('onboarding_org_' || v_user_id::text));

  -- 4. Idempotência do onboarding em chamadas concorrentes/repetidas:
  -- Se o usuário estiver concluindo o onboarding e já tiver uma organização recém-criada
  -- com o mesmo nome sob sua propriedade, retorna a organização existente sem duplicar.
  SELECT o.* INTO v_existing_org
  FROM public.organizations o
  WHERE o.owner_id = v_user_id
    AND lower(trim(o.name)) = lower(v_clean_name)
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_existing_org.id IS NOT NULL THEN
    -- Garante que o perfil do usuário esteja com onboarding concluído e apontando para a organização
    UPDATE public.profiles
    SET default_organization_id = COALESCE(default_organization_id, v_existing_org.id),
        account_type = COALESCE(account_type, p_account_type, 'agency'),
        "current_role" = 'owner',
        "onboardingCompleted" = true,
        "updatedAt" = timezone('utc'::text, now())
    WHERE id = v_user_id;

    RETURN json_build_object(
      'id', v_existing_org.id,
      'name', v_existing_org.name,
      'tradeName', v_existing_org.trade_name,
      'creci', v_existing_org.creci,
      'phone', v_existing_org.phone,
      'email', v_existing_org.email,
      'city', v_existing_org.city,
      'state', v_existing_org.state,
      'ownerId', v_existing_org.owner_id,
      'plan', v_existing_org.plan,
      'userRole', 'owner'
    );
  END IF;

  -- 5. Busca dados do usuário autenticado para compor o membro owner
  SELECT * INTO v_existing_profile
  FROM public.profiles
  WHERE id = v_user_id;

  v_user_email := v_existing_profile.email;
  v_user_name := COALESCE(v_existing_profile.name, v_existing_profile.username, '');

  IF v_user_email IS NULL OR v_user_email = '' THEN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;
  END IF;

  -- 6. Regra 1: Fixa estritamente o plano Beta no Onboarding
  -- Ignora p_plan para impedir ativação ou liberação arbitrária de planos pagos no onboarding.
  v_target_plan := 'beta';
  v_max_members := 1;

  -- 7. Criação da nova organização
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
    subscription_started_at,
    access_status
  ) VALUES (
    v_clean_name,
    v_clean_trade_name,
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
    timezone('utc'::text, now()),
    'active'
  )
  RETURNING * INTO v_org;

  v_org_id := v_org.id;

  -- 8. Associação atômica como primeiro proprietário
  -- Idempotente com o trigger trg_handle_organization_bootstrap via ON CONFLICT
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    name,
    email,
    phone,
    creci,
    role,
    status
  ) VALUES (
    v_org_id,
    v_user_id,
    COALESCE(NULLIF(v_user_name, ''), 'Proprietário'),
    COALESCE(v_user_email, ''),
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_creci), ''),
    'owner',
    'active'
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    role = 'owner',
    status = 'active',
    name = COALESCE(NULLIF(EXCLUDED.name, ''), organization_members.name),
    email = COALESCE(NULLIF(EXCLUDED.email, ''), organization_members.email),
    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), organization_members.phone),
    creci = COALESCE(NULLIF(EXCLUDED.creci, ''), organization_members.creci),
    updated_at = timezone('utc'::text, now());

  -- 9. Regra 2: Atualização do perfil utilizando exclusivamente as colunas reais do schema
  -- Utiliza a coluna oficial versionada "onboardingCompleted" e o identificador "current_role" cotado.
  UPDATE public.profiles
  SET default_organization_id = v_org_id,
      account_type = COALESCE(p_account_type, 'agency'),
      "current_role" = 'owner',
      "onboardingCompleted" = true,
      "updatedAt" = timezone('utc'::text, now())
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      id,
      name,
      email,
      default_organization_id,
      account_type,
      "current_role",
      "onboardingCompleted",
      "createdAt",
      "updatedAt"
    ) VALUES (
      v_user_id,
      COALESCE(NULLIF(v_user_name, ''), 'Proprietário'),
      COALESCE(v_user_email, ''),
      v_org_id,
      COALESCE(p_account_type, 'agency'),
      'owner',
      true,
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    );
  END IF;

  -- 10. Retorno do payload JSON estruturado esperado pela aplicação
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

-- Restringe privilégios de execução adequadamente
REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text) TO authenticated, service_role;

-- Recarrega o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
