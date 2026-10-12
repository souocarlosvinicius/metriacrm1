-- ==============================================================================
-- METRIA CRM - MIGRATION INCREMENTAL DE REPARO
-- Versão: 20261009000007
-- Descrição:
--   Consolidação e resolução de bloqueios estruturais em bancos existentes:
--   1. Correção dos identificadores sem aspas de "current_role" em UPDATEs e triggers.
--   2. Alinhamento e sincronização atômica de "onboardingCompleted" e onboarding_completed em profiles e RPCs.
--   3. Correção de check_cross_tenant_integrity para acesso estrito às colunas reais de cada tabela.
--   4. Remoção de triggers e funções duplicadas (validate_tenant_cross_references).
--   5. Correção dos índices de performance conforme catálogo canônico (assigned_to, "clientId", "propertyId", "createdAt").
--   6. Alinhamento da coluna canônica subscription_expires_at em organizations.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ALINHAMENTO DE ONBOARDING E CURRENT_ROLE EM PROFILES
-- ------------------------------------------------------------------------------

-- Garante existência das duas variantes de coluna para interoperabilidade segura
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "onboardingCompleted" boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "current_role" text;

-- Sincroniza dados históricos existentes
UPDATE public.profiles
SET "onboardingCompleted" = true
WHERE onboarding_completed IS TRUE AND "onboardingCompleted" IS NOT TRUE;

UPDATE public.profiles
SET onboarding_completed = true
WHERE "onboardingCompleted" IS TRUE AND onboarding_completed IS NOT TRUE;

-- Trigger para manter "onboardingCompleted" e onboarding_completed sempre sincronizados
CREATE OR REPLACE FUNCTION public.sync_profile_onboarding_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."onboardingCompleted" IS TRUE OR NEW.onboarding_completed IS TRUE THEN
    NEW."onboardingCompleted" := true;
    NEW.onboarding_completed := true;
  ELSIF NEW."onboardingCompleted" IS FALSE OR NEW.onboarding_completed IS FALSE THEN
    -- Preserva conclusão se já era true anteriormente
    IF OLD."onboardingCompleted" IS TRUE OR OLD.onboarding_completed IS TRUE THEN
      NEW."onboardingCompleted" := true;
      NEW.onboarding_completed := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_onboarding ON public.profiles;
CREATE TRIGGER trg_sync_profile_onboarding
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_onboarding_status();

-- ------------------------------------------------------------------------------
-- 2. PROTEÇÃO DE CAMPOS DE AUTORIDADE EM PROFILES COM "current_role" COTADO
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_authority_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
    NEW.id := OLD.id;
    IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
      SELECT email INTO NEW.email FROM auth.users WHERE id = OLD.id;
    END IF;
    IF NEW."current_role" IS DISTINCT FROM OLD."current_role" THEN
      NEW."current_role" := OLD."current_role";
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
    IF NEW.default_organization_id IS DISTINCT FROM OLD.default_organization_id AND NEW.default_organization_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = NEW.default_organization_id
          AND user_id = OLD.id
          AND status = 'active'
      ) THEN
        NEW.default_organization_id := OLD.default_organization_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. REMOÇÃO DE TRIGGERS E FUNÇÕES DUPLICADAS CONFLITANTES
-- ------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_cross_ref_tasks ON public.tasks;
DROP TRIGGER IF EXISTS trg_cross_ref_visits ON public.visits;
DROP TRIGGER IF EXISTS trg_cross_ref_proposals ON public.proposals;
DROP TRIGGER IF EXISTS trg_cross_ref_transactions ON public.transactions;
DROP TRIGGER IF EXISTS trg_cross_ref_history_events ON public.history_events;

-- Redefine validate_tenant_cross_references para delegar com segurança a check_cross_tenant_integrity
CREATE OR REPLACE FUNCTION public.validate_tenant_cross_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.check_cross_tenant_integrity();
END;
$$;

REVOKE ALL ON FUNCTION public.validate_tenant_cross_references() FROM PUBLIC;

-- ------------------------------------------------------------------------------
-- 4. INTEGRIDADE CROSS-TENANT COM CHECAGEM ESTREITA E SEGURA POR TABELA
-- Usa to_jsonb(NEW) e funções dedicadas para que nenhuma tabela avalie campos
-- que não possui (clients/tasks não têm ownerId, history_events não tem propertyId).
-- ------------------------------------------------------------------------------

-- Funções específicas por modelo para validação estrita sem colisão de catálogo
CREATE OR REPLACE FUNCTION public.check_client_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_active_member boolean;
BEGIN
  IF NEW.organization_id IS NOT NULL AND NEW.assigned_to IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = NEW.organization_id
        AND user_id = NEW.assigned_to
        AND status = 'active'
    ) INTO v_is_active_member;

    IF v_is_active_member IS NOT TRUE THEN
      RAISE EXCEPTION 'Violação de tenant: o usuário responsável (assigned_to) não é membro ativo desta organização';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_property_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref_org_id uuid;
  v_is_active_member boolean;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    IF NEW.assigned_to IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = NEW.organization_id
          AND user_id = NEW.assigned_to
          AND status = 'active'
      ) INTO v_is_active_member;

      IF v_is_active_member IS NOT TRUE THEN
        RAISE EXCEPTION 'Violação de tenant: o usuário responsável (assigned_to) não é membro ativo desta organização';
      END IF;
    END IF;

    IF NEW."ownerId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."ownerId";

      IF v_ref_org_id IS NULL OR v_ref_org_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'Violação de tenant: o cliente proprietário do imóvel não pertence a esta organização';
      END IF;
    END IF;
  ELSE
    IF NEW."ownerId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."ownerId";

      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar cliente proprietário de uma organização';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_task_activity_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref_org_id uuid;
  v_is_active_member boolean;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    IF NEW.assigned_to IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = NEW.organization_id
          AND user_id = NEW.assigned_to
          AND status = 'active'
      ) INTO v_is_active_member;

      IF v_is_active_member IS NOT TRUE THEN
        RAISE EXCEPTION 'Violação de tenant: o usuário responsável (assigned_to) não é membro ativo desta organização';
      END IF;
    END IF;

    IF NEW."clientId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."clientId";

      IF v_ref_org_id IS NULL OR v_ref_org_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'Violação de tenant: o cliente relacionado não pertence a esta organização';
      END IF;
    END IF;

    IF NEW."propertyId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.properties
      WHERE id = NEW."propertyId";

      IF v_ref_org_id IS NULL OR v_ref_org_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'Violação de tenant: o imóvel relacionado não pertence a esta organização';
      END IF;
    END IF;
  ELSE
    IF NEW."clientId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."clientId";

      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar cliente de uma organização';
      END IF;
    END IF;

    IF NEW."propertyId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.properties
      WHERE id = NEW."propertyId";

      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar imóvel de uma organização';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_history_event_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref_org_id uuid;
  v_is_active_member boolean;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    IF NEW.assigned_to IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = NEW.organization_id
          AND user_id = NEW.assigned_to
          AND status = 'active'
      ) INTO v_is_active_member;

      IF v_is_active_member IS NOT TRUE THEN
        RAISE EXCEPTION 'Violação de tenant: o usuário responsável (assigned_to) não é membro ativo desta organização';
      END IF;
    END IF;

    IF NEW."clientId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."clientId";

      IF v_ref_org_id IS NULL OR v_ref_org_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'Violação de tenant: o cliente relacionado não pertence a esta organização';
      END IF;
    END IF;
  ELSE
    IF NEW."clientId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."clientId";

      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar cliente de uma organização';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Função genérica canônica usando to_jsonb(NEW) para compatibilidade com qualquer trigger existente
CREATE OR REPLACE FUNCTION public.check_cross_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec jsonb;
  v_org_id uuid;
  v_assigned_to uuid;
  v_client_id uuid;
  v_property_id uuid;
  v_owner_id uuid;
  v_ref_org_id uuid;
  v_is_active_member boolean;
BEGIN
  v_rec := to_jsonb(NEW);
  v_org_id := CASE WHEN v_rec->>'organization_id' IS NOT NULL THEN (v_rec->>'organization_id')::uuid ELSE NULL END;
  v_assigned_to := CASE WHEN COALESCE(v_rec->>'assigned_to', v_rec->>'assigned_user_id') IS NOT NULL THEN (COALESCE(v_rec->>'assigned_to', v_rec->>'assigned_user_id'))::uuid ELSE NULL END;
  v_client_id := CASE WHEN COALESCE(v_rec->>'clientId', v_rec->>'client_id') IS NOT NULL THEN (COALESCE(v_rec->>'clientId', v_rec->>'client_id'))::uuid ELSE NULL END;
  v_property_id := CASE WHEN COALESCE(v_rec->>'propertyId', v_rec->>'property_id') IS NOT NULL THEN (COALESCE(v_rec->>'propertyId', v_rec->>'property_id'))::uuid ELSE NULL END;
  v_owner_id := CASE WHEN COALESCE(v_rec->>'ownerId', v_rec->>'owner_id') IS NOT NULL THEN (COALESCE(v_rec->>'ownerId', v_rec->>'owner_id'))::uuid ELSE NULL END;

  IF v_org_id IS NOT NULL THEN
    -- 1. Validação do responsável (assigned_to)
    IF v_assigned_to IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = v_org_id
          AND user_id = v_assigned_to
          AND status = 'active'
      ) INTO v_is_active_member;

      IF v_is_active_member IS NOT TRUE THEN
        RAISE EXCEPTION 'Violação de tenant: o usuário responsável (assigned_to) não é membro ativo desta organização';
      END IF;
    END IF;

    -- 2. Validação de cliente relacionado ("clientId"): apenas em tabelas que possuem clientId
    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals', 'transactions', 'history_events') THEN
      IF v_client_id IS NOT NULL THEN
        SELECT organization_id INTO v_ref_org_id
        FROM public.clients
        WHERE id = v_client_id;

        IF v_ref_org_id IS NULL OR v_ref_org_id <> v_org_id THEN
          RAISE EXCEPTION 'Violação de tenant: o cliente relacionado não pertence a esta organização';
        END IF;
      END IF;
    END IF;

    -- 3. Validação de imóvel relacionado ("propertyId"): apenas em tasks, visits, proposals, transactions
    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals', 'transactions') THEN
      IF v_property_id IS NOT NULL THEN
        SELECT organization_id INTO v_ref_org_id
        FROM public.properties
        WHERE id = v_property_id;

        IF v_ref_org_id IS NULL OR v_ref_org_id <> v_org_id THEN
          RAISE EXCEPTION 'Violação de tenant: o imóvel relacionado não pertence a esta organização';
        END IF;
      END IF;
    END IF;

    -- 4. Validação de proprietário do imóvel ("ownerId"): apenas em properties
    IF TG_TABLE_NAME = 'properties' THEN
      IF v_owner_id IS NOT NULL THEN
        SELECT organization_id INTO v_ref_org_id
        FROM public.clients
        WHERE id = v_owner_id;

        IF v_ref_org_id IS NULL OR v_ref_org_id <> v_org_id THEN
          RAISE EXCEPTION 'Violação de tenant: o cliente proprietário do imóvel não pertence a esta organização';
        END IF;
      END IF;
    END IF;

  ELSE
    -- Caso legado (organization_id IS NULL)
    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals', 'transactions', 'history_events') AND v_client_id IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id FROM public.clients WHERE id = v_client_id;
      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar cliente de uma organização';
      END IF;
    END IF;

    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals', 'transactions') AND v_property_id IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id FROM public.properties WHERE id = v_property_id;
      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar imóvel de uma organização';
      END IF;
    END IF;

    IF TG_TABLE_NAME = 'properties' AND v_owner_id IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id FROM public.clients WHERE id = v_owner_id;
      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar cliente proprietário de uma organização';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_cross_tenant_integrity() FROM PUBLIC;

-- Garante os triggers de integridade nos modelos relevantes
DROP TRIGGER IF EXISTS trg_tenant_integrity_clients ON public.clients;
CREATE TRIGGER trg_tenant_integrity_clients
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.check_client_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_properties ON public.properties;
CREATE TRIGGER trg_tenant_integrity_properties
BEFORE INSERT OR UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.check_property_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_tasks ON public.tasks;
CREATE TRIGGER trg_tenant_integrity_tasks
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.check_task_activity_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_visits ON public.visits;
CREATE TRIGGER trg_tenant_integrity_visits
BEFORE INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.check_task_activity_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_proposals ON public.proposals;
CREATE TRIGGER trg_tenant_integrity_proposals
BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.check_task_activity_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_transactions ON public.transactions;
CREATE TRIGGER trg_tenant_integrity_transactions
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.check_task_activity_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_history_events ON public.history_events;
CREATE TRIGGER trg_tenant_integrity_history_events
BEFORE INSERT OR UPDATE ON public.history_events
FOR EACH ROW EXECUTE FUNCTION public.check_history_event_integrity();

-- ------------------------------------------------------------------------------
-- 5. RECONSTRUÇÃO SEGURA DOS ÍNDICES DE PERFORMANCE COM NOMES DE COLUNA REAIS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.metria_find_col(p_table text, p_candidates text[])
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY p_candidates LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table
        AND column_name = c
    ) THEN
      RETURN c;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  v_col text;
  v_col_extra text;
BEGIN
  -- 1. Tasks
  v_col := pg_temp.metria_find_col('tasks', ARRAY['assigned_to', 'assigned_user_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assigned_date_completed ON public.tasks (organization_id, %I, date, completed)', v_col);
  END IF;

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_date ON public.tasks (organization_id, date)';

  v_col := pg_temp.metria_find_col('tasks', ARRAY['clientId', 'client_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_tasks_tenant_client ON public.tasks (organization_id, %I)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('tasks', ARRAY['propertyId', 'property_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_tasks_tenant_property ON public.tasks (organization_id, %I)', v_col);
  END IF;

  -- 2. Properties
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_properties_tenant_status ON public.properties (organization_id, status)';

  v_col := pg_temp.metria_find_col('properties', ARRAY['assigned_to', 'assigned_user_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_properties_tenant_assigned ON public.properties (organization_id, %I)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('properties', ARRAY['createdAt', 'created_at']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_properties_tenant_created ON public.properties (organization_id, %I DESC)', v_col);
  END IF;

  -- 3. Clients
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_tenant_status ON public.clients (organization_id, status)';

  v_col := pg_temp.metria_find_col('clients', ARRAY['assigned_to', 'assigned_user_id']);
  v_col_extra := pg_temp.metria_find_col('clients', ARRAY['updated_at', 'updatedAt']);
  IF v_col IS NOT NULL AND v_col_extra IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_clients_tenant_assigned_updated ON public.clients (organization_id, %I, %I DESC)', v_col, v_col_extra);
  ELSIF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_clients_tenant_assigned ON public.clients (organization_id, %I)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('clients', ARRAY['created_at', 'createdAt']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_clients_tenant_created ON public.clients (organization_id, %I DESC)', v_col);
  END IF;

  -- 4. Visits
  v_col := pg_temp.metria_find_col('visits', ARRAY['assigned_to', 'assigned_user_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_visits_tenant_assigned_date ON public.visits (organization_id, %I, date)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('visits', ARRAY['propertyId', 'property_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_visits_tenant_property ON public.visits (organization_id, %I)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('visits', ARRAY['clientId', 'client_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_visits_tenant_client ON public.visits (organization_id, %I)', v_col);
  END IF;

  -- 5. Proposals
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_proposals_tenant_status ON public.proposals (organization_id, status)';

  v_col := pg_temp.metria_find_col('proposals', ARRAY['clientId', 'client_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_proposals_tenant_client ON public.proposals (organization_id, %I)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('proposals', ARRAY['propertyId', 'property_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_proposals_tenant_property ON public.proposals (organization_id, %I)', v_col);
  END IF;

  -- 6. History Events
  v_col := pg_temp.metria_find_col('history_events', ARRAY['createdAt', 'created_at']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_history_tenant_created ON public.history_events (organization_id, %I DESC)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('history_events', ARRAY['clientId', 'client_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_history_tenant_client ON public.history_events (organization_id, %I)', v_col);
  END IF;

  -- 7. Organization Members
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_members_user_status ON public.organization_members (user_id, status)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON public.organization_members (organization_id, user_id)';
END $$;

DROP FUNCTION IF EXISTS pg_temp.metria_find_col(text, text[]);

-- ------------------------------------------------------------------------------
-- 6. COLUNA CANÔNICA DE ASSINATURA EM ORGANIZATIONS
-- ------------------------------------------------------------------------------

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "subscription_expires_at" timestamp with time zone;

-- Se o banco possuía subscription_end_at, transfere para a coluna canônica
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'subscription_end_at'
  ) THEN
    EXECUTE 'UPDATE public.organizations SET subscription_expires_at = COALESCE(subscription_expires_at, subscription_end_at) WHERE subscription_expires_at IS NULL AND subscription_end_at IS NOT NULL';
  END IF;
END $$;
