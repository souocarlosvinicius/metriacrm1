CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- METRIA CRM - SUPABASE SCHEMA
-- =========================================================
-- Este arquivo cria/atualiza a estrutura principal do Metria CRM.
-- O banco usa snake_case.
-- O frontend pode usar camelCase com funções de mapeamento.
-- =========================================================

-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- PROFILES
-- =========================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  avatar_url text,
  role text DEFAULT 'user',
  phone text,
  creci text,
  commercial_name text,
  primary_city text,
  acting_type text,
  onboarding_completed boolean DEFAULT false,
  default_organization_id uuid,
  current_organization_id uuid,
  account_type text DEFAULT 'broker',
  "current_role" text DEFAULT 'owner',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- =========================================================
-- ORGANIZATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade_name text,
  document text,
  creci text,
  phone text,
  email text,
  city text,
  state text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan text DEFAULT 'beta',
  subscription_status text DEFAULT 'active',
  subscription_started_at timestamptz DEFAULT now(),
  subscription_expires_at timestamptz,
  plan_updated_at timestamptz DEFAULT now(),
  max_members integer DEFAULT 1,
  billing_email text,
  billing_document text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_default_organization_id_fkey
FOREIGN KEY (default_organization_id)
REFERENCES public.organizations(id)
ON DELETE SET NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_default_organization_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_default_organization_id_fkey
FOREIGN KEY (default_organization_id)
REFERENCES public.organizations(id)
ON DELETE SET NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_current_organization_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_current_organization_id_fkey
FOREIGN KEY (current_organization_id)
REFERENCES public.organizations(id)
ON DELETE SET NULL;

ALTER TABLE public.organizations
DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE public.organizations
ADD CONSTRAINT organizations_plan_check
CHECK (plan IN ('beta', 'start', 'pro', 'max', 'pro_max'));

ALTER TABLE public.organizations
DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
ADD CONSTRAINT organizations_subscription_status_check
CHECK (
  subscription_status IN (
    'active',
    'trialing',
    'past_due',
    'canceled',
    'expired'
  )
);

-- =========================================================
-- ORGANIZATION MEMBERS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  phone text,
  creci text,
  role text DEFAULT 'broker',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT organization_members_unique_org_user UNIQUE (organization_id, user_id)
);

ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_role_check
CHECK (role IN ('owner', 'admin', 'manager', 'broker'));

ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_status_check;

ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_status_check
CHECK (status IN ('active', 'inactive'));

-- =========================================================
-- ORGANIZATION INVITES
-- =========================================================

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_name text,
  role text DEFAULT 'broker',
  token text UNIQUE,
  status text DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  accepted_at timestamptz
);

ALTER TABLE public.organization_invites
DROP CONSTRAINT IF EXISTS organization_invites_role_check;

ALTER TABLE public.organization_invites
ADD CONSTRAINT organization_invites_role_check
CHECK (role IN ('owner', 'admin', 'manager', 'broker'));

ALTER TABLE public.organization_invites
DROP CONSTRAINT IF EXISTS organization_invites_status_check;

ALTER TABLE public.organization_invites
ADD CONSTRAINT organization_invites_status_check
CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'));

-- =========================================================
-- COMMERCIAL TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  whatsapp text,
  email text,
  document text,
  client_type text,
  profile_type text,
  objective text,
  property_type text,
  min_budget numeric,
  max_budget numeric,
  observations text,
  birthday date,
  address text,
  status text DEFAULT 'active',
  temperature text,
  source text,
  next_action text,
  next_follow_up timestamptz,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  type text,
  modality text,
  price numeric,
  neighborhood text,
  city text,
  state text,
  address text,
  bedrooms integer,
  suites integer,
  bathrooms integer,
  parking_spots integer,
  area numeric,
  photos jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'available',
  owner_id uuid,
  owner_name text,
  commission_percent numeric,
  estimated_commission numeric,
  description text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_title text,
  title text NOT NULL,
  description text,
  due_date timestamptz,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  type text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_title text,
  date date,
  time text,
  scheduled_at timestamptz,
  status text DEFAULT 'scheduled',
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_title text,
  value numeric,
  commission_value numeric,
  commission_percent numeric,
  status text DEFAULT 'draft',
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  title text,
  value numeric,
  commission_value numeric,
  commission_percent numeric,
  status text DEFAULT 'open',
  closed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  type text,
  title text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name text,
  commercial_name text,
  phone text,
  email text,
  city text,
  state text,
  logo_url text,
  theme text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- =========================================================
-- ADD MISSING COLUMNS SAFELY
-- =========================================================

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS max_members integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS billing_email text,
ADD COLUMN IF NOT EXISTS billing_document text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS creci text,
ADD COLUMN IF NOT EXISTS commercial_name text,
ADD COLUMN IF NOT EXISTS primary_city text,
ADD COLUMN IF NOT EXISTS acting_type text,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS default_organization_id uuid,
ADD COLUMN IF NOT EXISTS current_organization_id uuid,
ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'broker',
ADD COLUMN IF NOT EXISTS "current_role" text DEFAULT 'owner';

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_profiles_default_organization_id
ON public.profiles(default_organization_id);

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
ON public.organizations(owner_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_organization_id
ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id
ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_invites_organization_id
ON public.organization_invites(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_invites_token
ON public.organization_invites(token);

CREATE INDEX IF NOT EXISTS idx_clients_organization_id
ON public.clients(organization_id);

CREATE INDEX IF NOT EXISTS idx_clients_assigned_to
ON public.clients(assigned_to);

CREATE INDEX IF NOT EXISTS idx_properties_organization_id
ON public.properties(organization_id);

CREATE INDEX IF NOT EXISTS idx_tasks_organization_id
ON public.tasks(organization_id);

CREATE INDEX IF NOT EXISTS idx_visits_organization_id
ON public.visits(organization_id);

CREATE INDEX IF NOT EXISTS idx_proposals_organization_id
ON public.proposals(organization_id);

CREATE INDEX IF NOT EXISTS idx_transactions_organization_id
ON public.transactions(organization_id);

CREATE INDEX IF NOT EXISTS idx_history_events_organization_id
ON public.history_events(organization_id);

-- =========================================================
-- TRIGGERS
-- =========================================================

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER update_organization_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON public.properties;
CREATE TRIGGER update_properties_updated_at
BEFORE UPDATE ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_visits_updated_at ON public.visits;
CREATE TRIGGER update_visits_updated_at
BEFORE UPDATE ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_proposals_updated_at ON public.proposals;
CREATE TRIGGER update_proposals_updated_at
BEFORE UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_history_events_updated_at ON public.history_events;
CREATE TRIGGER update_history_events_updated_at
BEFORE UPDATE ON public.history_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON public.settings;
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_org_role(org_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.role
  FROM public.organization_members om
  WHERE om.organization_id = org_id
    AND om.user_id = auth.uid()
    AND om.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner_or_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  );
$$;

-- =========================================================
-- PLAN VALIDATION FUNCTIONS
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_organization_usage(p_org_id uuid)
RETURNS TABLE (
  active_clients_count integer,
  properties_count integer,
  active_members_count integer,
  plan text,
  max_members integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Usuário não pertence à organização.';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT count(*)::integer
      FROM public.clients c
      WHERE c.organization_id = p_org_id
        AND coalesce(c.status, 'active') <> 'inactive'
    ) AS active_clients_count,
    (
      SELECT count(*)::integer
      FROM public.properties p
      WHERE p.organization_id = p_org_id
    ) AS properties_count,
    (
      SELECT count(*)::integer
      FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.status = 'active'
    ) AS active_members_count,
    o.plan,
    o.max_members
  FROM public.organizations o
  WHERE o.id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_create_client(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count integer;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN false;
  END IF;

  SELECT o.plan INTO v_plan
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_plan IN ('start', 'pro', 'max', 'pro_max') THEN
    RETURN true;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.clients c
  WHERE c.organization_id = p_org_id
    AND coalesce(c.status, 'active') <> 'inactive';

  RETURN v_count < 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_create_property(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count integer;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN false;
  END IF;

  SELECT o.plan INTO v_plan
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_plan IN ('start', 'pro', 'max', 'pro_max') THEN
    RETURN true;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.properties p
  WHERE p.organization_id = p_org_id;

  RETURN v_count < 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_invite_member(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count integer;
BEGIN
  IF NOT public.is_org_owner_or_admin(p_org_id) THEN
    RETURN false;
  END IF;

  SELECT o.plan, o.max_members
  INTO v_plan, v_limit
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_plan NOT IN ('max', 'pro_max') THEN
    RETURN false;
  END IF;

  IF v_plan = 'max' THEN
    v_limit := 5;
  ELSIF v_plan = 'pro_max' THEN
    v_limit := 30;
  ELSE
    v_limit := 1;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.organization_members om
  WHERE om.organization_id = p_org_id
    AND om.status = 'active';

  RETURN v_count < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_use_feature(p_org_id uuid, p_feature text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN false;
  END IF;

  SELECT o.plan INTO v_plan
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF p_feature = 'gemini_ai' THEN
    RETURN v_plan IN ('pro', 'max', 'pro_max');
  END IF;

  IF p_feature = 'property_matching' THEN
    RETURN v_plan IN ('pro', 'max', 'pro_max');
  END IF;

  IF p_feature = 'commission_reports' THEN
    RETURN v_plan IN ('pro', 'max', 'pro_max');
  END IF;

  IF p_feature = 'advanced_reports' THEN
    RETURN v_plan = 'pro_max';
  END IF;

  IF p_feature = 'team_management' THEN
    RETURN v_plan IN ('max', 'pro_max');
  END IF;

  IF p_feature = 'lead_distribution' THEN
    RETURN v_plan IN ('max', 'pro_max');
  END IF;

  IF p_feature = 'manager_dashboard' THEN
    RETURN v_plan IN ('max', 'pro_max');
  END IF;

  IF p_feature = 'advanced_manager_dashboard' THEN
    RETURN v_plan = 'pro_max';
  END IF;

  IF p_feature = 'lead_transfer' THEN
    RETURN v_plan IN ('max', 'pro_max');
  END IF;

  IF p_feature = 'multiple_managers' THEN
    RETURN v_plan = 'pro_max';
  END IF;

  RETURN false;
END;
$$;

-- =========================================================
-- DELETE CLIENT CASCADE
-- =========================================================

CREATE OR REPLACE FUNCTION public.delete_client_cascade(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_user_role text;
  v_deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  SELECT c.organization_id
  INTO v_org_id
  FROM public.clients c
  WHERE c.id = p_client_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Usuário sem permissão para acessar esta organização.';
  END IF;

  SELECT public.get_org_role(v_org_id) INTO v_user_role;

  IF v_user_role = 'broker' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = p_client_id
        AND c.organization_id = v_org_id
        AND (
          c.assigned_to = auth.uid()
          OR c.created_by = auth.uid()
        )
    ) THEN
      RAISE EXCEPTION 'Corretor sem permissão para excluir este cliente.';
    END IF;
  END IF;

  UPDATE public.tasks
  SET client_id = NULL,
      client_name = NULL,
      updated_at = now()
  WHERE client_id = p_client_id
    AND organization_id = v_org_id;

  UPDATE public.visits
  SET client_id = NULL,
      client_name = NULL,
      updated_at = now()
  WHERE client_id = p_client_id
    AND organization_id = v_org_id;

  UPDATE public.proposals
  SET client_id = NULL,
      client_name = NULL,
      updated_at = now()
  WHERE client_id = p_client_id
    AND organization_id = v_org_id;

  DELETE FROM public.history_events
  WHERE client_id = p_client_id
    AND organization_id = v_org_id;

  DELETE FROM public.clients
  WHERE id = p_client_id
    AND organization_id = v_org_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION 'A exclusão do cliente não foi confirmada.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deletedId', p_client_id
  );
END;
$$;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- POLICIES - PROFILES
-- =========================================================

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- =========================================================
-- POLICIES - ORGANIZATIONS
-- =========================================================

DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member
ON public.organizations
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_org_member(id)
);

DROP POLICY IF EXISTS organizations_insert_owner ON public.organizations;
CREATE POLICY organizations_insert_owner
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS organizations_update_admin ON public.organizations;
CREATE POLICY organizations_update_admin
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_org_owner_or_admin(id)
)
WITH CHECK (
  owner_id = auth.uid()
  OR public.is_org_owner_or_admin(id)
);

-- =========================================================
-- POLICIES - ORGANIZATION MEMBERS
-- =========================================================

DROP POLICY IF EXISTS organization_members_select_member ON public.organization_members;
CREATE POLICY organization_members_select_member
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS organization_members_insert_admin ON public.organization_members;
CREATE POLICY organization_members_insert_admin
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_org_owner_or_admin(organization_id)
  OR (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_id
        AND o.owner_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS organization_members_update_admin ON public.organization_members;
CREATE POLICY organization_members_update_admin
ON public.organization_members
FOR UPDATE
TO authenticated
USING (public.is_org_owner_or_admin(organization_id))
WITH CHECK (public.is_org_owner_or_admin(organization_id));

DROP POLICY IF EXISTS organization_members_delete_admin ON public.organization_members;
CREATE POLICY organization_members_delete_admin
ON public.organization_members
FOR DELETE
TO authenticated
USING (public.is_org_owner_or_admin(organization_id));

-- =========================================================
-- POLICIES - ORGANIZATION INVITES
-- =========================================================

DROP POLICY IF EXISTS organization_invites_select ON public.organization_invites;
CREATE POLICY organization_invites_select
ON public.organization_invites
FOR SELECT
TO authenticated
USING (
  public.is_org_owner_or_admin(organization_id)
  OR invited_email = auth.jwt() ->> 'email'
);

DROP POLICY IF EXISTS organization_invites_insert_admin ON public.organization_invites;
CREATE POLICY organization_invites_insert_admin
ON public.organization_invites
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_owner_or_admin(organization_id));

DROP POLICY IF EXISTS organization_invites_update_admin_or_invited ON public.organization_invites;
CREATE POLICY organization_invites_update_admin_or_invited
ON public.organization_invites
FOR UPDATE
TO authenticated
USING (
  public.is_org_owner_or_admin(organization_id)
  OR invited_email = auth.jwt() ->> 'email'
)
WITH CHECK (
  public.is_org_owner_or_admin(organization_id)
  OR invited_email = auth.jwt() ->> 'email'
);

DROP POLICY IF EXISTS organization_invites_delete_admin ON public.organization_invites;
CREATE POLICY organization_invites_delete_admin
ON public.organization_invites
FOR DELETE
TO authenticated
USING (public.is_org_owner_or_admin(organization_id));

-- =========================================================
-- COMMERCIAL TABLE POLICIES
-- =========================================================

DROP POLICY IF EXISTS clients_select_org ON public.clients;
CREATE POLICY clients_select_org
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS clients_insert_org ON public.clients;
CREATE POLICY clients_insert_org
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_org_member(organization_id)
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS clients_update_org ON public.clients;
CREATE POLICY clients_update_org
ON public.clients
FOR UPDATE
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS clients_delete_org ON public.clients;
CREATE POLICY clients_delete_org
ON public.clients
FOR DELETE
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS properties_all_org ON public.properties;
CREATE POLICY properties_all_org
ON public.properties
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR public.is_org_member(organization_id)
)
WITH CHECK (
  public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS tasks_all_org ON public.tasks;
CREATE POLICY tasks_all_org
ON public.tasks
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS visits_all_org ON public.visits;
CREATE POLICY visits_all_org
ON public.visits
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS proposals_all_org ON public.proposals;
CREATE POLICY proposals_all_org
ON public.proposals
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS transactions_all_org ON public.transactions;
CREATE POLICY transactions_all_org
ON public.transactions
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS history_events_all_org ON public.history_events;
CREATE POLICY history_events_all_org
ON public.history_events
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS settings_all_org ON public.settings;
CREATE POLICY settings_all_org
ON public.settings
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR user_id = auth.uid()
)
WITH CHECK (
  public.is_org_member(organization_id)
);

-- =========================================================
-- STORAGE BUCKET
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS property_images_public_read ON storage.objects;
CREATE POLICY property_images_public_read
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'property-images');

DROP POLICY IF EXISTS property_images_authenticated_upload ON storage.objects;
CREATE POLICY property_images_authenticated_upload
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-images');

DROP POLICY IF EXISTS property_images_authenticated_update ON storage.objects;
CREATE POLICY property_images_authenticated_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'property-images')
WITH CHECK (bucket_id = 'property-images');

DROP POLICY IF EXISTS property_images_authenticated_delete ON storage.objects;
CREATE POLICY property_images_authenticated_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'property-images');

-- =========================================================
-- GRANTS
-- =========================================================

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_owner_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_property(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_invite_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_client_cascade(uuid) TO authenticated;

-- =========================================================
-- FINAL DATA NORMALIZATION
-- =========================================================

UPDATE public.organizations
SET
  subscription_status = coalesce(subscription_status, 'active'),
  subscription_started_at = coalesce(subscription_started_at, now()),
  plan_updated_at = coalesce(plan_updated_at, now()),
  max_members = CASE
    WHEN plan = 'pro_max' THEN 30
    WHEN plan = 'max' THEN 5
    ELSE 1
  END
WHERE true;

notify pgrst, 'reload schema';
