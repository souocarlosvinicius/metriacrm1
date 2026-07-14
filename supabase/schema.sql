CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. NEW TENANCY TABLES (ORGANIZATIONS & MEMBERSHIP)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.organizations (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "trade_name" text,
  "document" text,
  "creci" text,
  "phone" text,
  "email" text,
  "city" text,
  "state" text,
  "owner_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "plan" text DEFAULT 'beta' CHECK (plan IN ('beta', 'start', 'pro', 'max', 'pro_max')),
  "subscription_status" text DEFAULT 'active' CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  "subscription_started_at" timestamp with time zone DEFAULT now(),
  "subscription_expires_at" timestamp with time zone,
  "plan_updated_at" timestamp with time zone DEFAULT now(),
  "max_members" integer DEFAULT 1,
  "billing_email" text,
  "billing_document" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if the table was already created
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'beta';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "subscription_status" text DEFAULT 'active';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "subscription_started_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "subscription_expires_at" timestamp with time zone;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "plan_updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "max_members" integer DEFAULT 1;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "billing_email" text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "billing_document" text;

-- Remove and recreate plan check constraint to support pro_max
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'organizations_plan_check'
  ) then
    alter table public.organizations
    drop constraint organizations_plan_check;
  end if;

  alter table public.organizations
  add constraint organizations_plan_check
  check (plan in ('beta', 'start', 'pro', 'max', 'pro_max'));
end $$;

-- Recreate subscription status check constraint if needed
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'organizations_subscription_status_check'
  ) then
    alter table public.organizations
    drop constraint organizations_subscription_status_check;
  end if;

  alter table public.organizations
  add constraint organizations_subscription_status_check
  check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'expired'));
end $$;

-- Automatic adjustment of max_members based on plan
update public.organizations
set max_members = case
  when plan = 'max' then 5
  when plan = 'pro_max' then 30
  else 1
end
where max_members is null
   or max_members < case
      when plan = 'max' then 5
      when plan = 'pro_max' then 30
      else 1
   end;

-- Trigger function to automatically maintain max_members on insert or update of plan
CREATE OR REPLACE FUNCTION public.handle_organization_max_members()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan = 'max' THEN
    NEW.max_members := COALESCE(NEW.max_members, 5);
    IF NEW.max_members > 5 THEN
      NEW.max_members := 5;
    END IF;
  ELSIF NEW.plan = 'pro_max' THEN
    NEW.max_members := COALESCE(NEW.max_members, 30);
    IF NEW.max_members > 30 THEN
      NEW.max_members := 30;
    END IF;
  ELSE
    NEW.max_members := 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set/update max_members on insert or update
DROP TRIGGER IF EXISTS trg_handle_organization_max_members ON public.organizations;
CREATE TRIGGER trg_handle_organization_max_members
BEFORE INSERT OR UPDATE OF plan ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_organization_max_members();

CREATE TABLE IF NOT EXISTS public.organization_members (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  "user_id" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "name" text,
  "email" text,
  "phone" text,
  "creci" text,
  "role" text DEFAULT 'broker', -- 'owner' | 'admin' | 'manager' | 'broker'
  "status" text DEFAULT 'active', -- 'active' | 'inactive'
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_org_user UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  "invited_email" text NOT NULL,
  "invited_name" text,
  "role" text DEFAULT 'broker', -- 'owner' | 'admin' | 'manager' | 'broker'
  "token" text UNIQUE NOT NULL,
  "status" text DEFAULT 'pending', -- 'pending' | 'accepted' | 'expired'
  "invited_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "accepted_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "accepted_at" timestamp with time zone
);


-- ==========================================
-- 2. PROFILES TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.profiles (
  "id" uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "username" text,
  "name" text,
  "email" text,
  "avatarUrl" text,
  "role" text DEFAULT 'Corretor Sênior',
  "phone" text,
  "onboardingCompleted" boolean DEFAULT false,
  "commercialName" text,
  "creci" text,
  "primaryCity" text,
  "actingType" text DEFAULT 'Geral',
  "defaultCommissionPercent" numeric DEFAULT 0,
  "pipelineStages" text[] DEFAULT ARRAY['Novo', 'Em Atendimento', 'Visita Agendada', 'Proposta', 'Contrato', 'Ganho', 'Perdido'],
  "leadSources" text[] DEFAULT ARRAY['Indicação', 'Instagram', 'Facebook', 'OLX', 'Portal Imobiliário', 'Placa', 'WhatsApp', 'Tráfego Pago', 'Outro'],
  "messageTemplates" jsonb DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Tenant additions
  "default_organization_id" uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  "account_type" text DEFAULT 'broker', -- 'broker' | 'agency'
  "current_role" text -- 'owner' | 'admin' | 'manager' | 'broker'
);

-- Safe Alterations for profiles (in case the table already existed)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "default_organization_id" uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "account_type" text DEFAULT 'broker';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "current_role" text;


-- ==========================================
-- 3. CLIENTS TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.clients (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "client_type" text DEFAULT 'PF',
  "name" text NOT NULL,
  "phone" text,
  "document" text,
  "email" text,
  "profile_type" text DEFAULT 'Lead',
  "objective" text,
  "property_type" text,
  "min_budget" numeric DEFAULT 0,
  "max_budget" numeric DEFAULT 0,
  "observations" text,
  "birthday" date,
  "address" text,
  "status" text DEFAULT 'Novo',
  "temperature" text DEFAULT 'Morno',
  "source" text,
  "next_action" text,
  "next_follow_up" timestamp with time zone,
  "interest" text,
  "budget_range" text,
  "neighborhood_of_interest" text,
  "desired_property_type" text,
  "pipeline_status" text,
  "linked_property_id" uuid, -- linked property if any
  "loss_reason" text,
  "commission_forecast" numeric DEFAULT 0,
  "commission_percent" numeric DEFAULT 0,
  "potential_value" numeric DEFAULT 0,
  "closing_probability" text DEFAULT 'Média',
  "history" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Safe alterations
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ==========================================
-- 4. PROPERTIES TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.properties (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "code" text,
  "ownerId" uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  "title" text NOT NULL,
  "type" text,
  "condition" text,
  "description" text,
  "modality" text,
  "price" numeric DEFAULT 0,
  "condo" numeric DEFAULT 0,
  "iptu" numeric DEFAULT 0,
  "address" text,
  "neighborhood" text,
  "city" text,
  "bedrooms" integer DEFAULT 0,
  "suites" integer DEFAULT 0,
  "bathrooms" integer DEFAULT 0,
  "parkingSpots" integer DEFAULT 0,
  "area" numeric DEFAULT 0,
  "builtArea" numeric DEFAULT 0,
  "constructionYear" integer,
  "floor" text,
  "sunPosition" text,
  "documentStatus" text,
  "financialStatus" text,
  "acceptsExchange" boolean DEFAULT false,
  "photos" text[] DEFAULT '{}',
  "videoLink" text,
  "amenities" text[] DEFAULT '{}',
  "status" text DEFAULT 'Disponível',
  "captadorName" text,
  "captadorPhone" text,
  "estimatedCommission" numeric DEFAULT 0,
  "commissionPercent" numeric DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Safe alterations
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ==========================================
-- 5. TASKS TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.tasks (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "date" text,
  "time" text,
  "title" text NOT NULL,
  "clientId" uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  "clientName" text,
  "propertyId" uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  "propertyTitle" text,
  "type" text DEFAULT 'Outro',
  "priority" text DEFAULT 'média',
  "completed" boolean DEFAULT false,
  "description" text,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Safe alterations
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ==========================================
-- 6. VISITS TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.visits (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "clientId" uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  "clientName" text,
  "propertyId" uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  "propertyTitle" text,
  "date" text,
  "time" text,
  "status" text DEFAULT 'Agendada',
  "observations" text,
  "feedback" text,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Safe alterations
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ==========================================
-- 7. PROPOSALS TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.proposals (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "clientId" uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  "clientName" text,
  "propertyId" uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  "propertyTitle" text,
  "proposedValue" numeric DEFAULT 0,
  "status" text DEFAULT 'Pendente',
  "date" text,
  "observations" text,
  "nextAction" text,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Safe alterations
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ==========================================
-- 8. TRANSACTIONS TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.transactions (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "title" text,
  "amount" numeric DEFAULT 0,
  "status" text,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Safe alterations
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ==========================================
-- 9. SETTINGS TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.settings (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "key" text NOT NULL,
  "value" text,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "user_id" uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Safe alterations
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES auth.users(id) ON DELETE CASCADE;


-- ==========================================
-- 10. HISTORY EVENTS TABLE (MODIFIED)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.history_events (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  "clientId" uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  "type" text,
  "date" text,
  "description" text,
  "userName" text,
  "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Tenant additions
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Safe alterations
ALTER TABLE public.history_events ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.history_events ADD COLUMN IF NOT EXISTS "assigned_to" uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ==========================================
-- 11. TENANT SECURITY HELPER FUNCTIONS
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_user_role(p_org_id uuid)
RETURNS text
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active';
  
  RETURN v_role;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.get_user_role(p_org_id);
  RETURN v_role IN ('owner', 'admin');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_org_manager_or_higher(p_org_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.get_user_role(p_org_id);
  RETURN v_role IN ('owner', 'admin', 'manager');
END;
$$ LANGUAGE plpgsql;


-- ==========================================
-- 12. DATA MIGRATION FOR BACKWARD COMPATIBILITY
-- ==========================================

DO $$
DECLARE
  r_profile RECORD;
  v_org_id uuid;
BEGIN
  -- Iterates through profiles that don't have a default organization or any members record yet
  FOR r_profile IN 
    SELECT p.id, p.name, p.email 
    FROM public.profiles p
    LEFT JOIN public.organization_members m ON m.user_id = p.id
    WHERE p.default_organization_id IS NULL AND m.id IS NULL
  LOOP
    -- 1. Create a personal organization for this existing user
    INSERT INTO public.organizations (name, owner_id, plan)
    VALUES (COALESCE(r_profile.name, 'Organização Pessoal'), r_profile.id, 'beta')
    RETURNING id INTO v_org_id;

    -- 2. Add the user as the owner of this organization
    INSERT INTO public.organization_members (organization_id, user_id, name, email, role, status)
    VALUES (v_org_id, r_profile.id, r_profile.name, r_profile.email, 'owner', 'active');

    -- 3. Set this organization as default in profile
    UPDATE public.profiles
    SET default_organization_id = v_org_id,
        account_type = 'broker',
        "current_role" = 'owner'
    WHERE id = r_profile.id;

    -- 4. Link existing user data to this new organization
    UPDATE public.clients SET organization_id = v_org_id, assigned_to = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
    UPDATE public.properties SET organization_id = v_org_id, assigned_to = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
    UPDATE public.tasks SET organization_id = v_org_id, assigned_to = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
    UPDATE public.visits SET organization_id = v_org_id, assigned_to = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
    UPDATE public.proposals SET organization_id = v_org_id, assigned_to = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
    UPDATE public.transactions SET organization_id = v_org_id, assigned_to = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
    UPDATE public.history_events SET organization_id = v_org_id, assigned_to = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
    UPDATE public.settings SET organization_id = v_org_id, user_id = "userId" WHERE "userId" = r_profile.id AND organization_id IS NULL;
  END LOOP;
END;
$$;


-- ==========================================
-- 13. ENABLE ROW LEVEL SECURITY & POLICIES
-- ==========================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_events ENABLE ROW LEVEL SECURITY;

-- Clear previous policies if we are rebuilding
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can select own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can insert own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can CRUD own properties" ON public.properties;
DROP POLICY IF EXISTS "Users can CRUD own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can CRUD own visits" ON public.visits;
DROP POLICY IF EXISTS "Users can CRUD own proposals" ON public.proposals;
DROP POLICY IF EXISTS "Users can CRUD own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can CRUD own settings" ON public.settings;
DROP POLICY IF EXISTS "Users can CRUD own history_events" ON public.history_events;

-- ORGANIZATIONS POLICIES
CREATE POLICY "Organizations SELECT" ON public.organizations
  FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_org_member(id));

CREATE POLICY "Organizations INSERT" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Organizations UPDATE" ON public.organizations
  FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.is_org_admin(id));

CREATE POLICY "Organizations DELETE" ON public.organizations
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- MEMBERS POLICIES
CREATE POLICY "Members SELECT" ON public.organization_members
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY "Members INSERT" ON public.organization_members
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id) OR auth.uid() = user_id);

CREATE POLICY "Members UPDATE" ON public.organization_members
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

CREATE POLICY "Members DELETE" ON public.organization_members
  FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));

-- INVITES POLICIES
CREATE POLICY "Invites SELECT" ON public.organization_invites
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY "Invites INSERT" ON public.organization_invites
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Invites UPDATE" ON public.organization_invites
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id) OR status = 'pending');

CREATE POLICY "Invites DELETE" ON public.organization_invites
  FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));

-- PROFILES POLICIES
CREATE POLICY "Profiles SELECT" ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.organization_members m1 
      JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id 
      WHERE m1.user_id = auth.uid() AND m2.user_id = id
    )
  );

CREATE POLICY "Profiles INSERT" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles UPDATE" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- CLIENTS POLICIES
CREATE POLICY "Clients SELECT" ON public.clients
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Clients INSERT" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Clients UPDATE" ON public.clients
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Clients DELETE" ON public.clients
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

-- PROPERTIES POLICIES
CREATE POLICY "Properties SELECT" ON public.properties
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Properties INSERT" ON public.properties
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Properties UPDATE" ON public.properties
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Properties DELETE" ON public.properties
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

-- TASKS POLICIES
CREATE POLICY "Tasks SELECT" ON public.tasks
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Tasks INSERT" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Tasks UPDATE" ON public.tasks
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Tasks DELETE" ON public.tasks
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

-- VISITS POLICIES
CREATE POLICY "Visits SELECT" ON public.visits
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Visits INSERT" ON public.visits
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Visits UPDATE" ON public.visits
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Visits DELETE" ON public.visits
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

-- PROPOSALS POLICIES
CREATE POLICY "Proposals SELECT" ON public.proposals
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Proposals INSERT" ON public.proposals
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Proposals UPDATE" ON public.proposals
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Proposals DELETE" ON public.proposals
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

-- TRANSACTIONS POLICIES
CREATE POLICY "Transactions SELECT" ON public.transactions
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Transactions INSERT" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Transactions UPDATE" ON public.transactions
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Transactions DELETE" ON public.transactions
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

-- SETTINGS POLICIES
CREATE POLICY "Settings SELECT" ON public.settings
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Settings INSERT" ON public.settings
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "Settings UPDATE" ON public.settings
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "Settings DELETE" ON public.settings
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = "userId"
    )
  );

-- HISTORY EVENTS POLICIES
CREATE POLICY "History Events SELECT" ON public.history_events
  FOR SELECT TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "History Events INSERT" ON public.history_events
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND public.is_org_member(organization_id)
  );

CREATE POLICY "History Events UPDATE" ON public.history_events
  FOR UPDATE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );

CREATE POLICY "History Events DELETE" ON public.history_events
  FOR DELETE TO authenticated USING (
    organization_id IS NULL AND auth.uid() = "userId"
    OR organization_id IS NOT NULL AND (
      public.is_org_manager_or_higher(organization_id)
      OR auth.uid() = assigned_to
      OR auth.uid() = "userId"
    )
  );


-- ==========================================
-- 14. TRIGGER FOR CREATING PROFILE ON USER SIGNUP (PRESERVED)
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    "id",
    "email",
    "name",
    "avatarUrl",
    "role",
    "phone",
    "onboardingCompleted"
  ) VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'avatarUrl', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'),
    COALESCE(new.raw_user_meta_data->>'role', 'Corretor Sênior'),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- 15. TRIGGER FOR UPDATED_AT TIMESTAMPS
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'clients' THEN
    NEW.updated_at = now();
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    NEW.updated_at = now();
  ELSIF TG_TABLE_NAME = 'organization_members' THEN
    NEW.updated_at = now();
  ELSE
    NEW."updatedAt" = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON public.properties;
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_visits_updated_at ON public.visits;
CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_proposals_updated_at ON public.proposals;
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON public.settings;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ==========================================
-- 16. STORAGE BUCKET & POLICIES (Supabase Storage)
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public read access to property-images" ON storage.objects;
CREATE POLICY "Allow public read access to property-images" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'property-images');

DROP POLICY IF EXISTS "Allow authenticated users to upload to property-images" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload to property-images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'property-images' AND
    (storage.foldername(name))[1] = 'users' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Allow authenticated users to update own property-images" ON storage.objects;
CREATE POLICY "Allow authenticated users to update own property-images" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'property-images' AND
    (storage.foldername(name))[1] = 'users' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Allow authenticated users to delete own property-images" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete own property-images" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'property-images' AND
    (storage.foldername(name))[1] = 'users' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );


-- ==========================================
-- 17. CASCADE DELETE CLIENT RPC FUNCTION (MODIFIED)
-- ==========================================

DROP FUNCTION IF EXISTS public.delete_client_cascade(uuid);
CREATE OR REPLACE FUNCTION public.delete_client_cascade(p_client_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_client_owner uuid;
  v_client_org uuid;
  v_user_role text;
BEGIN
  -- Get current authenticated user
  v_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get client detail
  SELECT "userId", organization_id INTO v_client_owner, v_client_org
  FROM public.clients
  WHERE id = p_client_id;

  -- Verify client exists
  IF v_client_owner IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  -- Verify authorization
  -- If client has organization, check if user is manager or owner, or if assigned_to/creator
  IF v_client_org IS NOT NULL THEN
    v_user_role := public.get_user_role(v_client_org);
    IF v_user_role NOT IN ('owner', 'admin', 'manager') AND v_client_owner <> v_user_id THEN
      -- Also allow if they are the assigned broker
      IF NOT EXISTS (
        SELECT 1 FROM public.clients 
        WHERE id = p_client_id AND assigned_to = v_user_id
      ) THEN
        RAISE EXCEPTION 'Access denied';
      END IF;
    END IF;
  ELSE
    IF v_client_owner <> v_user_id THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  -- Cascade deletes
  -- 1. Tasks
  DELETE FROM public.tasks WHERE "clientId" = p_client_id;

  -- 2. Visits
  DELETE FROM public.visits WHERE "clientId" = p_client_id;

  -- 3. Proposals
  DELETE FROM public.proposals WHERE "clientId" = p_client_id;

  -- 4. History events
  DELETE FROM public.history_events WHERE "clientId" = p_client_id;

  -- 5. Delete the client itself
  DELETE FROM public.clients WHERE id = p_client_id;

  -- Return success json
  RETURN json_build_object(
    'success', true,
    'deletedId', p_client_id
  );
END;
$$;

-- Plan Limits and Usage Security Helper Functions
DROP FUNCTION IF EXISTS public.get_organization_usage(uuid);
CREATE OR REPLACE FUNCTION public.get_organization_usage(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clients_count integer;
  v_properties_count integer;
  v_members_count integer;
  v_plan text;
  v_max_members integer;
  v_max_clients integer;
  v_max_properties integer;
BEGIN
  -- Validate that the user belongs to the organization
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO v_clients_count FROM public.clients WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_properties_count FROM public.properties WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_members_count FROM public.organization_members WHERE organization_id = p_org_id AND status = 'active';
  
  SELECT plan, max_members INTO v_plan, v_max_members FROM public.organizations WHERE id = p_org_id;

  IF v_plan IS NULL THEN
    v_plan := 'beta';
  END IF;

  IF v_plan = 'beta' THEN
    v_max_clients := 10;
    v_max_properties := 5;
  ELSE
    v_max_clients := NULL;
    v_max_properties := NULL;
  END IF;

  RETURN json_build_object(
    'active_clients_count', v_clients_count,
    'properties_count', v_properties_count,
    'active_members_count', v_members_count,
    'plan', v_plan,
    'max_members', COALESCE(v_max_members, 1),
    'max_clients', v_max_clients,
    'max_properties', v_max_properties
  );
END;
$$;

DROP FUNCTION IF EXISTS public.can_create_client(uuid);
CREATE OR REPLACE FUNCTION public.can_create_client(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan text;
  v_clients_count integer;
BEGIN
  -- Validate that the user belongs to the organization
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN FALSE;
  END IF;

  SELECT plan INTO v_plan FROM public.organizations WHERE id = p_org_id;
  IF v_plan = 'beta' THEN
    SELECT count(*) INTO v_clients_count FROM public.clients WHERE organization_id = p_org_id;
    IF v_clients_count >= 10 THEN
      RETURN FALSE;
    END IF;
  END IF;
  RETURN TRUE;
END;
$$;

DROP FUNCTION IF EXISTS public.can_create_property(uuid);
CREATE OR REPLACE FUNCTION public.can_create_property(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan text;
  v_properties_count integer;
BEGIN
  -- Validate that the user belongs to the organization
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN FALSE;
  END IF;

  SELECT plan INTO v_plan FROM public.organizations WHERE id = p_org_id;
  IF v_plan = 'beta' THEN
    SELECT count(*) INTO v_properties_count FROM public.properties WHERE organization_id = p_org_id;
    IF v_properties_count >= 5 THEN
      RETURN FALSE;
    END IF;
  END IF;
  RETURN TRUE;
END;
$$;

DROP FUNCTION IF EXISTS public.can_invite_member(uuid);
CREATE OR REPLACE FUNCTION public.can_invite_member(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan text;
  v_members_count integer;
BEGIN
  -- Validate that the user belongs to the organization
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN FALSE;
  END IF;

  SELECT plan INTO v_plan FROM public.organizations WHERE id = p_org_id;
  IF v_plan = 'max' THEN
    SELECT count(*) INTO v_members_count FROM public.organization_members WHERE organization_id = p_org_id AND status = 'active';
    IF v_members_count >= 5 THEN
      RETURN FALSE;
    END IF;
  END IF;
  RETURN TRUE;
END;
$$;

DROP FUNCTION IF EXISTS public.can_use_feature(uuid, text);
CREATE OR REPLACE FUNCTION public.can_use_feature(p_org_id uuid, p_feature text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan text;
BEGIN
  -- Validate that the user belongs to the organization
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN FALSE;
  END IF;

  SELECT plan INTO v_plan FROM public.organizations WHERE id = p_org_id;
  IF v_plan IS NULL THEN
    v_plan := 'beta';
  END IF;

  CASE p_feature
    WHEN 'gemini_ai', 'hasGeminiAI', 'has_gemini_ai' THEN
      RETURN v_plan IN ('pro', 'max', 'pro_max');
    WHEN 'property_matching', 'hasPropertyMatching', 'has_property_matching' THEN
      RETURN v_plan IN ('pro', 'max', 'pro_max');
    WHEN 'commission_reports', 'hasCommissionReports', 'has_commission_reports' THEN
      RETURN v_plan IN ('pro', 'max', 'pro_max');
    WHEN 'advanced_reports', 'hasAdvancedReports', 'has_advanced_reports' THEN
      RETURN v_plan = 'pro_max';
    WHEN 'team_management', 'hasTeamManagement', 'has_team_management' THEN
      RETURN v_plan IN ('max', 'pro_max');
    WHEN 'lead_distribution', 'hasLeadDistribution', 'has_lead_distribution' THEN
      RETURN v_plan IN ('max', 'pro_max');
    WHEN 'manager_dashboard', 'hasManagerDashboard', 'has_manager_dashboard' THEN
      RETURN v_plan IN ('max', 'pro_max');
    WHEN 'advanced_manager_dashboard', 'hasAdvancedManagerDashboard', 'has_advanced_manager_dashboard' THEN
      RETURN v_plan = 'pro_max';
    WHEN 'lead_transfer', 'hasLeadTransfer', 'has_lead_transfer' THEN
      RETURN v_plan IN ('max', 'pro_max');
    WHEN 'multiple_managers', 'hasMultipleManagers', 'has_multiple_managers' THEN
      RETURN v_plan = 'pro_max';
    WHEN 'full_pipeline', 'hasFullPipeline', 'has_full_pipeline' THEN
      RETURN v_plan IN ('start', 'pro', 'max', 'pro_max');
    WHEN 'whatsapp_templates', 'hasWhatsappTemplates', 'has_whatsapp_templates' THEN
      RETURN v_plan IN ('start', 'pro', 'max', 'pro_max');
    WHEN 'calendar_tasks', 'hasCalendarTasks', 'has_calendar_tasks' THEN
      RETURN TRUE; -- all plans have calendar tasks
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_plan_access(uuid);
CREATE OR REPLACE FUNCTION public.get_user_plan_access(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan text;
  v_status text;
BEGIN
  SELECT plan, subscription_status INTO v_plan, v_status FROM public.organizations WHERE id = p_org_id;
  IF v_plan IS NULL THEN
    v_plan := 'beta';
  END IF;
  IF v_status IS NULL THEN
    v_status := 'active';
  END IF;

  RETURN json_build_object(
    'plan', v_plan,
    'status', v_status
  );
END;
$$;

-- Grant permissions for authenticated and service_role to execute the RPC functions
GRANT EXECUTE ON FUNCTION public.delete_client_cascade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_property(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_invite_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_plan_access(uuid) TO authenticated, service_role;

-- Reload PGRST Schema
notify pgrst, 'reload schema';
