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
  "access_status" text DEFAULT 'active' CHECK (access_status IN ('active', 'suspended')),
  "suspended_at" timestamp with time zone,
  "suspension_reason" text,
  "suspended_by" text,
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
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "access_status" text DEFAULT 'active';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "suspension_reason" text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "suspended_by" text;

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
  when plan = 'pro_max' then 99
  else 1
end
where max_members is null
   or max_members < case
      when plan = 'max' then 5
      when plan = 'pro_max' then 99
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
    NEW.max_members := COALESCE(NEW.max_members, 99);
    IF NEW.max_members > 99 THEN
      NEW.max_members := 99;
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
  "role" text DEFAULT 'broker' CHECK (role IN ('owner', 'admin', 'manager', 'broker')),
  "status" text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_org_user UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  "invited_email" text NOT NULL,
  "invited_name" text,
  "role" text DEFAULT 'broker' CHECK (role IN ('owner', 'admin', 'manager', 'broker')),
  "token" text UNIQUE NOT NULL,
  "token_hash" text,
  "status" text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "invited_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "accepted_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "accepted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_token_hash ON public.organization_invites(token_hash);

-- Trigger to atomically bootstrap the first owner upon organization creation
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
  IF auth.uid() IS NOT NULL AND NEW.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'owner_id deve corresponder ao usuário autenticado';
  END IF;

  SELECT COALESCE(name, username, 'Proprietário'), email
  INTO v_user_name, v_user_email
  FROM public.profiles
  WHERE id = NEW.owner_id;

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

  UPDATE public.profiles
  SET default_organization_id = COALESCE(default_organization_id, NEW.id),
      "current_role" = 'owner'
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

-- Trigger to prevent client from updating administrative access status directly
CREATE OR REPLACE FUNCTION public.protect_organization_access_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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

REVOKE ALL ON FUNCTION public.protect_organization_access_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_org_access_status ON public.organizations;
CREATE TRIGGER trg_protect_org_access_status
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.protect_organization_access_status();

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

DROP POLICY IF EXISTS "org_access_audit_admin_select" ON public.organization_access_audit;
CREATE POLICY "org_access_audit_admin_select" ON public.organization_access_audit
  FOR SELECT TO authenticated
  USING (auth.role() = 'service_role');

-- Trigger to prevent self-promotion, self-reactivation, and protect organization owner
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
  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id cannot be changed';
  END IF;

  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;

  IF NEW.role NOT IN ('owner', 'admin', 'manager', 'broker') THEN
    RAISE EXCEPTION 'Invalid role: %', NEW.role;
  END IF;

  IF NEW.status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;

  IF OLD.user_id = v_actor_id AND NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'Self-promotion is prohibited: you cannot modify your own role';
  END IF;

  IF OLD.user_id = v_actor_id AND OLD.status = 'inactive' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Self-reactivation is prohibited: only an administrator can reactivate your account';
  END IF;

  SELECT owner_id INTO v_org_owner_id
  FROM public.organizations
  WHERE id = OLD.organization_id;

  IF OLD.user_id = v_org_owner_id THEN
    IF NEW.role <> 'owner' THEN
      RAISE EXCEPTION 'Cannot demote the organization owner';
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'Cannot inactivate the organization owner';
    END IF;
  END IF;

  IF NEW.role <> OLD.role OR NEW.status <> OLD.status THEN
    v_actor_role := public.get_user_role(OLD.organization_id);

    IF v_actor_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'Access denied: only organization owner or admin can update member roles or status';
    END IF;

    IF NEW.role = 'owner' AND OLD.role <> 'owner' AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Access denied: only the organization owner can appoint another owner';
    END IF;

    IF v_actor_role = 'admin' AND OLD.role IN ('admin', 'owner') THEN
      RAISE EXCEPTION 'Access denied: admins cannot modify another admin or owner';
    END IF;
  END IF;

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
  FOR SELECT TO authenticated USING (
    owner_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organizations.id 
        AND om.user_id = auth.uid() 
        AND om.status = 'active'
    )
  );

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
  FOR INSERT TO authenticated WITH CHECK (
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

CREATE POLICY "Members DELETE" ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    AND user_id <> (SELECT owner_id FROM public.organizations WHERE id = organization_id)
  );

-- INVITES POLICIES
DROP POLICY IF EXISTS "Invites SELECT" ON public.organization_invites;
DROP POLICY IF EXISTS "Invites INSERT" ON public.organization_invites;
DROP POLICY IF EXISTS "Invites UPDATE" ON public.organization_invites;
DROP POLICY IF EXISTS "Invites DELETE" ON public.organization_invites;

CREATE POLICY "Invites SELECT" ON public.organization_invites
  FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));

CREATE POLICY "Invites INSERT" ON public.organization_invites
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Invites UPDATE" ON public.organization_invites
  FOR UPDATE TO authenticated 
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Invites DELETE" ON public.organization_invites
  FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));

-- PROFILES POLICIES
CREATE POLICY "Profiles SELECT" ON public.profiles
  FOR SELECT TO authenticated USING (
    profiles.id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.organization_members m1 
      JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id 
      WHERE m1.user_id = auth.uid() 
        AND m1.status = 'active'
        AND m2.user_id = profiles.id
        AND m2.status = 'active'
    )
  );

CREATE POLICY "Profiles INSERT" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles UPDATE" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- CLIENTS POLICIES
DROP POLICY IF EXISTS "Clients SELECT" ON public.clients;
CREATE POLICY "Clients SELECT" ON public.clients
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Clients INSERT" ON public.clients;
CREATE POLICY "Clients INSERT" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND auth.uid() = "userId"
    )
  );

DROP POLICY IF EXISTS "Clients UPDATE" ON public.clients;
CREATE POLICY "Clients UPDATE" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Clients DELETE" ON public.clients;
CREATE POLICY "Clients DELETE" ON public.clients
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

-- PROPERTIES POLICIES
DROP POLICY IF EXISTS "Properties SELECT" ON public.properties;
CREATE POLICY "Properties SELECT" ON public.properties
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
    )
  );

DROP POLICY IF EXISTS "Properties INSERT" ON public.properties;
CREATE POLICY "Properties INSERT" ON public.properties
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND auth.uid() = "userId"
    )
  );

DROP POLICY IF EXISTS "Properties UPDATE" ON public.properties;
CREATE POLICY "Properties UPDATE" ON public.properties
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Properties DELETE" ON public.properties;
CREATE POLICY "Properties DELETE" ON public.properties
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = "userId"
      )
    )
  );

-- TASKS POLICIES
DROP POLICY IF EXISTS "Tasks SELECT" ON public.tasks;
CREATE POLICY "Tasks SELECT" ON public.tasks
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Tasks INSERT" ON public.tasks;
CREATE POLICY "Tasks INSERT" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND auth.uid() = "userId"
    )
  );

DROP POLICY IF EXISTS "Tasks UPDATE" ON public.tasks;
CREATE POLICY "Tasks UPDATE" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Tasks DELETE" ON public.tasks;
CREATE POLICY "Tasks DELETE" ON public.tasks
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

-- VISITS POLICIES
DROP POLICY IF EXISTS "Visits SELECT" ON public.visits;
CREATE POLICY "Visits SELECT" ON public.visits
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Visits INSERT" ON public.visits;
CREATE POLICY "Visits INSERT" ON public.visits
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND auth.uid() = "userId"
    )
  );

DROP POLICY IF EXISTS "Visits UPDATE" ON public.visits;
CREATE POLICY "Visits UPDATE" ON public.visits
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Visits DELETE" ON public.visits;
CREATE POLICY "Visits DELETE" ON public.visits
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

-- PROPOSALS POLICIES
DROP POLICY IF EXISTS "Proposals SELECT" ON public.proposals;
CREATE POLICY "Proposals SELECT" ON public.proposals
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Proposals INSERT" ON public.proposals;
CREATE POLICY "Proposals INSERT" ON public.proposals
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND auth.uid() = "userId"
    )
  );

DROP POLICY IF EXISTS "Proposals UPDATE" ON public.proposals;
CREATE POLICY "Proposals UPDATE" ON public.proposals
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Proposals DELETE" ON public.proposals;
CREATE POLICY "Proposals DELETE" ON public.proposals
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

-- TRANSACTIONS POLICIES
DROP POLICY IF EXISTS "Transactions SELECT" ON public.transactions;
CREATE POLICY "Transactions SELECT" ON public.transactions
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Transactions INSERT" ON public.transactions;
CREATE POLICY "Transactions INSERT" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND auth.uid() = "userId"
    )
  );

DROP POLICY IF EXISTS "Transactions UPDATE" ON public.transactions;
CREATE POLICY "Transactions UPDATE" ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "Transactions DELETE" ON public.transactions;
CREATE POLICY "Transactions DELETE" ON public.transactions
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

-- SETTINGS POLICIES
DROP POLICY IF EXISTS "Settings SELECT" ON public.settings;
CREATE POLICY "Settings SELECT" ON public.settings
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = user_id
        OR auth.uid() = "userId"
      )
    )
  );

DROP POLICY IF EXISTS "Settings INSERT" ON public.settings;
CREATE POLICY "Settings INSERT" ON public.settings
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = user_id
        OR auth.uid() = "userId"
      )
    )
  );

DROP POLICY IF EXISTS "Settings UPDATE" ON public.settings;
CREATE POLICY "Settings UPDATE" ON public.settings
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = user_id
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = user_id
        OR auth.uid() = "userId"
      )
    )
  );

DROP POLICY IF EXISTS "Settings DELETE" ON public.settings;
CREATE POLICY "Settings DELETE" ON public.settings
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = user_id
        OR auth.uid() = "userId"
      )
    )
  );

-- HISTORY EVENTS POLICIES
DROP POLICY IF EXISTS "History Events SELECT" ON public.history_events;
CREATE POLICY "History Events SELECT" ON public.history_events
  FOR SELECT TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "History Events INSERT" ON public.history_events;
CREATE POLICY "History Events INSERT" ON public.history_events
  FOR INSERT TO authenticated WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND auth.uid() = "userId"
    )
  );

DROP POLICY IF EXISTS "History Events UPDATE" ON public.history_events;
CREATE POLICY "History Events UPDATE" ON public.history_events
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_manager_or_higher(organization_id)
        OR auth.uid() = assigned_to
        OR auth.uid() = "userId"
      )
    )
  )
  WITH CHECK (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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

DROP POLICY IF EXISTS "History Events DELETE" ON public.history_events;
CREATE POLICY "History Events DELETE" ON public.history_events
  FOR DELETE TO authenticated USING (
    (organization_id IS NULL AND auth.uid() = "userId")
    OR
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
    (storage.foldername(storage.objects.name))[1] = 'users' AND
    (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Allow authenticated users to update own property-images" ON storage.objects;
CREATE POLICY "Allow authenticated users to update own property-images" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'property-images' AND
    (storage.foldername(storage.objects.name))[1] = 'users' AND
    (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Allow authenticated users to delete own property-images" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete own property-images" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'property-images' AND
    (storage.foldername(storage.objects.name))[1] = 'users' AND
    (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );


-- ==========================================
-- 17. CASCADE DELETE CLIENT RPC FUNCTION (HARDENED)
-- ==========================================

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

  -- 2. Localiza e bloqueia o cliente na transação para garantir isolamento
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
    -- Exige que a organização não esteja suspensa
    IF EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = v_client_org AND access_status = 'suspended'
    ) THEN
      RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência financeira';
    END IF;

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
    IF (v_user_role IN ('owner', 'admin', 'manager')) = TRUE THEN
      v_is_authorized := TRUE;
    ELSIF (v_client_assigned_to = v_user_id) = TRUE THEN
      v_is_authorized := TRUE;
    ELSIF (v_client_owner = v_user_id) = TRUE THEN
      v_is_authorized := TRUE;
    END IF;

    -- Negação estrita quando autorização IS NOT TRUE
    IF v_is_authorized IS NOT TRUE THEN
      RAISE EXCEPTION 'Access denied: insufficient permissions to delete client';
    END IF;

  ELSE
    -- Caso legado: cliente sem organização associada
    IF (v_client_owner = v_user_id) = TRUE THEN
      v_is_authorized := TRUE;
    END IF;

    IF v_is_authorized IS NOT TRUE THEN
      RAISE EXCEPTION 'Access denied: only owner can delete legacy client';
    END IF;
  END IF;

  -- 4. Exclusão em cascata protegida na mesma transação atômica
  UPDATE public.properties
  SET "ownerId" = NULL
  WHERE "ownerId" = p_client_id;

  DELETE FROM public.tasks WHERE "clientId" = p_client_id;
  DELETE FROM public.visits WHERE "clientId" = p_client_id;
  DELETE FROM public.proposals WHERE "clientId" = p_client_id;
  DELETE FROM public.history_events WHERE "clientId" = p_client_id;
  DELETE FROM public.clients WHERE id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'deletedId', p_client_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_cascade(uuid) TO authenticated, service_role;

-- ==============================================================================
-- 17.5 AUTHENTICATION, ATOMIC ONBOARDING & SECURE INVITATIONS (ETAPA 4)
-- ==============================================================================

-- RPC ATÔMICA: CRIAÇÃO DE ORGANIZAÇÃO COM PRIMEIRO PROPRIETÁRIO (ONBOARDING)
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
  -- Garante serialização estrita para chamadas concorrentes/cliques duplos do mesmo usuário
  PERFORM pg_advisory_xact_lock(hashtext('onboarding_org_' || v_user_id::text));

  -- 4. Idempotência do onboarding em chamadas concorrentes/repetidas:
  -- Se o usuário já tiver uma organização criada com o mesmo nome sob sua propriedade, retorna a existente
  SELECT o.* INTO v_existing_org
  FROM public.organizations o
  WHERE o.owner_id = v_user_id
    AND lower(trim(o.name)) = lower(v_clean_name)
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_existing_org.id IS NOT NULL THEN
    -- Atualiza perfil garantindo conclusão do onboarding
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

  -- 6. Fixa estritamente o plano Beta no Onboarding (ignora p_plan)
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

  -- 9. Atualização do perfil utilizando exclusivamente a coluna versionada "onboardingCompleted"
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

REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text, text, text) TO authenticated, service_role;


-- RPC ATÔMICA: GERAÇÃO SEGURA DE CONVITE (COM CRIPTOGRAFIA E QUOTA)
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
    RAISE EXCEPTION 'Este usuário já é um membro ativo desta imobiliária.';
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

  -- Contagem de membros ativos
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


-- RPC ATÔMICA, IDEMPOTENTE E RESILIENTE: ACEITE SEGURO DE CONVITE
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
      "current_role" = v_invite.role,
      "onboardingCompleted" = true
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

-- ==========================================
-- 18. TENANT RECORD IMMUTABILITY & INTEGRITY TRIGGERS
-- ==========================================

CREATE OR REPLACE FUNCTION public.enforce_tenant_record_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id é imutável: movimentação direta de registro entre organizações é proibida';
  END IF;

  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Não é permitido desvincular um registro de sua organização';
  END IF;

  IF OLD."userId" IS NOT NULL AND NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'O criador original do registro (userId) é imutável e não pode ser alterado via CRUD';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tenant_record_immutability() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_immutability_clients ON public.clients;
CREATE TRIGGER trg_immutability_clients
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_properties ON public.properties;
CREATE TRIGGER trg_immutability_properties
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_tasks ON public.tasks;
CREATE TRIGGER trg_immutability_tasks
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_visits ON public.visits;
CREATE TRIGGER trg_immutability_visits
BEFORE UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_proposals ON public.proposals;
CREATE TRIGGER trg_immutability_proposals
BEFORE UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_transactions ON public.transactions;
CREATE TRIGGER trg_immutability_transactions
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_settings ON public.settings;
CREATE TRIGGER trg_immutability_settings
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_history_events ON public.history_events;
CREATE TRIGGER trg_immutability_history_events
BEFORE UPDATE ON public.history_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

-- CROSS-TENANT REFERENTIAL INTEGRITY TRIGGER
-- CROSS-TENANT REFERENTIAL INTEGRITY (ESTRITO POR MODELO E SEGURO)
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

-- Função genérica canônica usando to_jsonb(NEW) para compatibilidade
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

-- TRANSACTIONAL LEAD/CLIENT ASSIGNMENT TRANSFER RPC
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
  v_org_plan text;
  v_target_name text;
  v_target_email text;
  v_client_id uuid;
  v_client_org uuid;
  v_client_history jsonb;
  v_new_history_entry jsonb;
  v_actor_name text;
  v_transferred_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_client_ids IS NULL OR array_length(p_client_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhum cliente informado para transferência';
  END IF;

  IF p_target_broker_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização e corretor de destino são obrigatórios';
  END IF;

  v_actor_role := public.get_user_role(p_organization_id);
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Acesso negado: apenas proprietários, administradores ou gestores ativos podem transferir clientes';
  END IF;

  SELECT plan INTO v_org_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_plan IS NULL OR v_org_plan NOT IN ('max', 'pro_max') THEN
    RAISE EXCEPTION 'Transferência de leads está disponível apenas nos planos Max e PRO MAX';
  END IF;

  SELECT name, email
  INTO v_target_name, v_target_email
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = p_target_broker_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O corretor destinatário não é um membro ativo desta organização';
  END IF;

  SELECT COALESCE(name, username, 'Administrador')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  FOREACH v_client_id IN ARRAY p_client_ids
  LOOP
    SELECT organization_id, history
    INTO v_client_org, v_client_history
    FROM public.clients
    WHERE id = v_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente % não encontrado', v_client_id;
    END IF;

    IF v_client_org IS NULL OR v_client_org <> p_organization_id THEN
      RAISE EXCEPTION 'Cliente % não pertence à organização informada', v_client_id;
    END IF;

    v_new_history_entry := jsonb_build_object(
      'id', substr(md5(random()::text), 1, 9),
      'type', 'transfer',
      'date', timezone('utc'::text, now())::text,
      'description', 'Lead transferido para o corretor responsável ' || COALESCE(v_target_name, v_target_email),
      'userName', COALESCE(v_actor_name, 'Administrador')
    );

    UPDATE public.clients
    SET assigned_to = p_target_broker_id,
        history = COALESCE(v_client_history, '[]'::jsonb) || jsonb_build_array(v_new_history_entry),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_client_id;

    INSERT INTO public.history_events (
      "userId",
      "clientId",
      "type",
      "date",
      "description",
      "userName",
      "organization_id",
      "assigned_to"
    )
    VALUES (
      v_actor_id,
      v_client_id,
      'transfer',
      timezone('utc'::text, now())::text,
      'Lead transferido para o corretor ' || COALESCE(v_target_name, v_target_email),
      COALESCE(v_actor_name, 'Administrador'),
      p_organization_id,
      p_target_broker_id
    );

    v_transferred_count := v_transferred_count + 1;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'transferredCount', v_transferred_count,
    'targetBrokerId', p_target_broker_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_client_assignment(uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_client_assignment(uuid[], uuid, uuid) TO authenticated, service_role;

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

-- ==========================================
-- 20. TENANT IMMUTABILITY & CROSS-REFERENCE INTEGRITY (ETAPA 2)
-- ==========================================

-- Trigger to prevent mutating organization_id and original creator (userId)
CREATE OR REPLACE FUNCTION public.enforce_tenant_record_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id é imutável: movimentação direta de registro entre organizações é proibida';
  END IF;

  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Não é permitido desvincular um registro de sua organização';
  END IF;

  IF OLD."userId" IS NOT NULL AND NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'O criador original do registro (userId) é imutável e não pode ser alterado via CRUD';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tenant_record_immutability() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_immutability_clients ON public.clients;
CREATE TRIGGER trg_immutability_clients
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_properties ON public.properties;
CREATE TRIGGER trg_immutability_properties
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_tasks ON public.tasks;
CREATE TRIGGER trg_immutability_tasks
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_visits ON public.visits;
CREATE TRIGGER trg_immutability_visits
BEFORE UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_proposals ON public.proposals;
CREATE TRIGGER trg_immutability_proposals
BEFORE UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_transactions ON public.transactions;
CREATE TRIGGER trg_immutability_transactions
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_settings ON public.settings;
CREATE TRIGGER trg_immutability_settings
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

DROP TRIGGER IF EXISTS trg_immutability_history_events ON public.history_events;
CREATE TRIGGER trg_immutability_history_events
BEFORE UPDATE ON public.history_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_record_immutability();

-- Trigger to validate cross-tenant integrity on related records (delegates safely to check_cross_tenant_integrity)
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

-- Drop redundant duplicate triggers (trg_tenant_integrity_* already handles cross-tenant checks)
DROP TRIGGER IF EXISTS trg_cross_ref_tasks ON public.tasks;
DROP TRIGGER IF EXISTS trg_cross_ref_visits ON public.visits;
DROP TRIGGER IF EXISTS trg_cross_ref_proposals ON public.proposals;
DROP TRIGGER IF EXISTS trg_cross_ref_transactions ON public.transactions;
DROP TRIGGER IF EXISTS trg_cross_ref_history_events ON public.history_events;

-- Transacional RPC for client/lead assignment transfer
DROP FUNCTION IF EXISTS public.transfer_client_assignment(uuid[], uuid, uuid);
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
  v_caller_role text;
  v_target_role text;
  v_org_plan text;
  v_client_rec record;
  v_transferred_count int := 0;
  v_broker_name text;
  v_caller_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT plan INTO v_org_plan FROM public.organizations WHERE id = p_organization_id;
  IF v_org_plan IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada';
  END IF;

  IF v_org_plan NOT IN ('max', 'pro_max') THEN
    RAISE EXCEPTION 'Transferência de leads está disponível apenas nos planos Max e PRO MAX';
  END IF;

  SELECT role INTO v_caller_role FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = auth.uid() AND status = 'active';

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Permissão negada: apenas proprietários, administradores ou gestores ativos podem transferir clientes';
  END IF;

  SELECT role, COALESCE(name, 'Corretor') INTO v_target_role, v_broker_name
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = p_target_broker_id AND status = 'active';

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'O corretor destinatário não é membro ativo desta organização';
  END IF;

  SELECT COALESCE(name, email) INTO v_caller_name
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = auth.uid();

  -- Pre-flight validation: all client_ids must belong to p_organization_id
  FOR v_client_rec IN
    SELECT id, organization_id, history FROM public.clients WHERE id = ANY(p_client_ids)
  LOOP
    IF v_client_rec.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'Violação de tenant: o cliente % não pertence a esta organização', v_client_rec.id;
    END IF;
  END LOOP;

  -- Ensure exact count match (no missing IDs)
  IF (SELECT count(*) FROM public.clients WHERE id = ANY(p_client_ids) AND organization_id = p_organization_id) <> array_length(p_client_ids, 1) THEN
    RAISE EXCEPTION 'Um ou mais clientes não foram encontrados para transferência nesta organização';
  END IF;

  -- Atomic update
  FOR v_client_rec IN
    SELECT id, history FROM public.clients WHERE id = ANY(p_client_ids) FOR UPDATE
  LOOP
    UPDATE public.clients
    SET
      assigned_to = p_target_broker_id,
      history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'id', substr(md5(random()::text), 1, 9),
          'type', 'transfer',
          'date', timezone('utc'::text, now())::text,
          'description', 'Lead transferido para o corretor responsável ' || v_broker_name || '.',
          'userName', COALESCE(v_caller_name, 'Gestor')
        )
      ),
      updated_at = timezone('utc'::text, now())
    WHERE id = v_client_rec.id;

    v_transferred_count := v_transferred_count + 1;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'transferredCount', v_transferred_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_client_assignment(uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_client_assignment(uuid[], uuid, uuid) TO authenticated, service_role;

-- ==============================================================================
-- 18. COMMERCIAL SETTINGS, AUTHORITY PROTECTION & APPEND-ONLY HISTORY (ETAPA 5)
-- ==============================================================================

-- Trigger to protect authority fields in profiles
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

  NEW."updatedAt" := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_authority ON public.profiles;
CREATE TRIGGER trg_protect_profile_authority
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_authority_fields();

-- RPC append-only history event
CREATE OR REPLACE FUNCTION public.append_client_history_event(
  p_client_id uuid,
  p_type text,
  p_description text,
  p_user_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_rec record;
  v_actor_name text;
  v_new_event jsonb;
  v_now_iso text := timezone('utc'::text, now())::text;
  v_event_id text := substr(md5(random()::text), 1, 9);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: usuário não autenticado';
  END IF;

  SELECT id, "userId", organization_id, assigned_to, history
  INTO v_client_rec
  FROM public.clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF v_client_rec.organization_id IS NOT NULL THEN
    IF NOT public.is_org_member(v_client_rec.organization_id) THEN
      RAISE EXCEPTION 'Acesso negado: vínculo inativo ou ausente na organização';
    END IF;
    IF NOT public.is_org_manager_or_higher(v_client_rec.organization_id)
       AND v_client_rec.assigned_to != v_user_id
       AND v_client_rec."userId" != v_user_id THEN
      RAISE EXCEPTION 'Apenas o corretor responsável ou gestores podem registrar eventos neste lead';
    END IF;
  ELSE
    IF v_client_rec."userId" != v_user_id THEN
      RAISE EXCEPTION 'Acesso negado ao cliente legado';
    END IF;
  END IF;

  IF p_user_name IS NOT NULL AND length(trim(p_user_name)) > 0 THEN
    v_actor_name := trim(p_user_name);
  ELSE
    SELECT COALESCE(name, username, 'Corretor')
    INTO v_actor_name
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  v_new_event := jsonb_build_object(
    'id', v_event_id,
    'type', COALESCE(p_type, 'note'),
    'date', v_now_iso,
    'description', p_description,
    'userName', COALESCE(v_actor_name, 'Corretor')
  );

  INSERT INTO public.history_events (
    id, "userId", "clientId", type, date, description, "userName",
    "createdAt", organization_id, assigned_to
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    p_client_id,
    COALESCE(p_type, 'note'),
    v_now_iso,
    p_description,
    COALESCE(v_actor_name, 'Corretor'),
    now(),
    v_client_rec.organization_id,
    v_client_rec.assigned_to
  );

  UPDATE public.clients
  SET
    history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(v_new_event),
    updated_at = now()
  WHERE id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'event', v_new_event
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_client_history_event(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_client_history_event(uuid, text, text, text) TO authenticated, service_role;

-- Grant permissions for authenticated and service_role to execute the RPC functions
GRANT EXECUTE ON FUNCTION public.delete_client_cascade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_property(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_invite_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_plan_access(uuid) TO authenticated, service_role;

-- ==============================================================================
-- 18. RPC TRANSACIONAL DE SUSPENSÃO E REATIVAÇÃO ADMINISTRATIVA
-- ==============================================================================

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

  SELECT access_status, name INTO v_old_status, v_org_name
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada';
  END IF;

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

  ELSE
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

-- ==========================================
-- 20. PROTEÇÃO DE CAMPOS E LIBERAÇÃO MANUAL DE PLANOS
-- ==========================================

-- Trigger de proteção de campos restritos contra clientes
CREATE OR REPLACE FUNCTION public.protect_organization_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' AND auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
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

-- Tabela de auditoria de planos manuais
CREATE TABLE IF NOT EXISTS public.organization_plan_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
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

-- RPC transacional de liberação de plano
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

  -- Validação estrita da data de liberação
  IF p_expires_at IS NOT NULL AND p_expires_at <= timezone('utc'::text, now()) THEN
    RAISE EXCEPTION 'A data de expiração da liberação deve ser no futuro.';
  END IF;

  -- Consolidação dos limites comerciais (única fonte de verdade: max = 5, pro_max = 99, outros = 1)
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

  UPDATE public.organizations
  SET plan = p_target_plan,
      subscription_status = v_target_status,
      subscription_expires_at = p_expires_at,
      max_members = v_max_members,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_organization_id;

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

-- Reload PGRST Schema
notify pgrst, 'reload schema';


