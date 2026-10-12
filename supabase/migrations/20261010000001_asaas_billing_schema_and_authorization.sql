-- ==============================================================================
-- METRIA CRM - MIGRATION: ASSINATURAS ASAAS, COBRANÇAS E AUTORIZAÇÃO (ETAPA 1)
-- Versão: 20261010000001
-- Descrição:
--   1. Tabela public.subscriptions vinculada por organization_id.
--   2. Tabela public.charges indexada por asaas_payment_id único.
--   3. Tabela public.webhook_events com identificador de evento único idempotente.
--   4. Colunas financeiras em public.organizations (asaas_customer_id, paid_through, financial_block).
--   5. Proteção rígida de campos financeiros contra edição direta pelo navegador (mesmo por owner/admin).
--   6. Políticas RLS estritas de leitura por tenant e isolamento de escrita exclusivo do backend (service_role).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENRIQUECIMENTO DA TABELA DE ORGANIZAÇÕES (PRESERVANDO DADOS EXISTENTES)
-- ------------------------------------------------------------------------------

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "asaas_customer_id" text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "paid_through" timestamp with time zone;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "financial_block" boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organizations_asaas_customer_id
  ON public.organizations (asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. TABELA DE ASSINATURAS (public.subscriptions)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asaas_subscription_id text UNIQUE,
  asaas_customer_id text,
  plan text NOT NULL CHECK (plan IN ('start', 'pro', 'max', 'pro_max')),
  billing_cycle text NOT NULL DEFAULT 'MONTHLY' CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
  value numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED')),
  payment_method text DEFAULT 'UNDEFINED' CHECK (payment_method IN ('PIX', 'CREDIT_CARD', 'BOLETO', 'UNDEFINED')),
  next_due_date date,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  paid_through timestamp with time zone,
  canceled_at timestamp with time zone,
  cancel_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_id
  ON public.subscriptions (organization_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_sub_id
  ON public.subscriptions (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_paid_through
  ON public.subscriptions (organization_id, paid_through);

-- ------------------------------------------------------------------------------
-- 3. TABELA DE COBRANÇAS (public.charges)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  asaas_payment_id text UNIQUE NOT NULL,
  asaas_subscription_id text,
  asaas_customer_id text,
  value numeric(10,2) NOT NULL DEFAULT 0,
  net_value numeric(10,2),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'RECEIVED',
    'CONFIRMED',
    'OVERDUE',
    'REFUNDED',
    'RECEIVED_IN_CASH',
    'REFUND_REQUESTED',
    'CHARGEBACK_REQUESTED',
    'CHARGEBACK_DISPUTE',
    'AWAITING_CHARGEBACK_REVERSAL',
    'DUNNING_REQUESTED',
    'DUNNING_RECEIVED',
    'AWAITING_RISK_ANALYSIS',
    'CANCELED',
    'DELETED'
  )),
  billing_type text DEFAULT 'UNDEFINED' CHECK (billing_type IN ('PIX', 'CREDIT_CARD', 'BOLETO', 'UNDEFINED')),
  due_date date NOT NULL,
  payment_date timestamp with time zone,
  client_payment_date date,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_copy_paste text,
  coverage_period_start timestamp with time zone,
  coverage_period_end timestamp with time zone,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_charges_organization_id
  ON public.charges (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_charges_asaas_payment_id
  ON public.charges (asaas_payment_id);

CREATE INDEX IF NOT EXISTS idx_charges_subscription_id
  ON public.charges (subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_charges_status
  ON public.charges (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_charges_due_date
  ON public.charges (organization_id, due_date DESC);

-- ------------------------------------------------------------------------------
-- 4. TABELA DE EVENTOS DE WEBHOOK (public.webhook_events)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  asaas_payment_id text,
  asaas_subscription_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'ignored', 'failed')),
  error_message text,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id
  ON public.webhook_events (event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON public.webhook_events (status);

CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_id
  ON public.webhook_events (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_sub_id
  ON public.webhook_events (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
  ON public.webhook_events (created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. TRIGGERS DE ATUALIZAÇÃO AUTOMÁTICA DE updated_at
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_financial_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_financial_updated_at();

DROP TRIGGER IF EXISTS trg_charges_updated_at ON public.charges;
CREATE TRIGGER trg_charges_updated_at
BEFORE UPDATE ON public.charges
FOR EACH ROW EXECUTE FUNCTION public.handle_financial_updated_at();

-- ------------------------------------------------------------------------------
-- 6. PROTEÇÃO DE CAMPOS FINANCEIROS CONTRA EDIÇÃO PELO NAVEGADOR
--    Inclusive por owner e admin da organização.
-- ------------------------------------------------------------------------------

-- 6.1 Proteção de campos financeiros em organizations
CREATE OR REPLACE FUNCTION public.protect_organization_financial_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se a alteração vier de uma sessão autenticada de cliente (navegador/PostgREST)
  IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
    -- Campos financeiros e de autoridade são estritamente mantidos dos valores anteriores (OLD)
    NEW.id := OLD.id;
    NEW.owner_id := OLD.owner_id;
    NEW.plan := OLD.plan;
    NEW.subscription_status := OLD.subscription_status;
    NEW.subscription_started_at := OLD.subscription_started_at;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    NEW.max_members := OLD.max_members;
    NEW.paid_through := OLD.paid_through;
    NEW.financial_block := OLD.financial_block;

    -- asaas_customer_id só pode ser criado ou alterado pelo backend com service_role
    IF OLD.asaas_customer_id IS NOT NULL THEN
      NEW.asaas_customer_id := OLD.asaas_customer_id;
    ELSIF NEW.asaas_customer_id IS DISTINCT FROM OLD.asaas_customer_id THEN
      NEW.asaas_customer_id := OLD.asaas_customer_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_organization_financial_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_organization_financial_fields ON public.organizations;
CREATE TRIGGER trg_protect_organization_financial_fields
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.protect_organization_financial_fields();

-- 6.2 Bloqueio de inserção/alteração/exclusão direta em tabelas financeiras por usuários do navegador
CREATE OR REPLACE FUNCTION public.protect_financial_table_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Usuários autenticados no navegador NUNCA podem criar, alterar ou excluir registros
  -- em subscriptions, charges ou webhook_events diretamente.
  IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Acesso negado: registros financeiros e de webhook não podem ser alterados diretamente pelo cliente.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.protect_financial_table_records() FROM PUBLIC;

-- Aplica trigger de proteção em subscriptions
DROP TRIGGER IF EXISTS trg_protect_subscriptions_records ON public.subscriptions;
CREATE TRIGGER trg_protect_subscriptions_records
BEFORE INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.protect_financial_table_records();

-- Aplica trigger de proteção em charges
DROP TRIGGER IF EXISTS trg_protect_charges_records ON public.charges;
CREATE TRIGGER trg_protect_charges_records
BEFORE INSERT OR UPDATE OR DELETE ON public.charges
FOR EACH ROW EXECUTE FUNCTION public.protect_financial_table_records();

-- Aplica trigger de proteção em webhook_events
DROP TRIGGER IF EXISTS trg_protect_webhook_events_records ON public.webhook_events;
CREATE TRIGGER trg_protect_webhook_events_records
BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_events
FOR EACH ROW EXECUTE FUNCTION public.protect_financial_table_records();

-- ------------------------------------------------------------------------------
-- 7. SEGURANÇA E POLÍTICAS RLS (ROW LEVEL SECURITY)
-- ------------------------------------------------------------------------------

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- SUBSCRIPTIONS:
-- Leitura autorizada apenas para membros ativos da mesma organização
DROP POLICY IF EXISTS "Subscriptions SELECT" ON public.subscriptions;
CREATE POLICY "Subscriptions SELECT" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
  );

-- Escrita e exclusão em subscriptions: apenas service_role (nenhuma policy para authenticated)
DROP POLICY IF EXISTS "Subscriptions INSERT service_role" ON public.subscriptions;
DROP POLICY IF EXISTS "Subscriptions UPDATE service_role" ON public.subscriptions;
DROP POLICY IF EXISTS "Subscriptions DELETE service_role" ON public.subscriptions;

-- CHARGES:
-- Leitura autorizada apenas para membros ativos da mesma organização
DROP POLICY IF EXISTS "Charges SELECT" ON public.charges;
CREATE POLICY "Charges SELECT" ON public.charges
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
  );

-- Escrita e exclusão em charges: apenas service_role (nenhuma policy para authenticated)
DROP POLICY IF EXISTS "Charges INSERT service_role" ON public.charges;
DROP POLICY IF EXISTS "Charges UPDATE service_role" ON public.charges;
DROP POLICY IF EXISTS "Charges DELETE service_role" ON public.charges;

-- WEBHOOK_EVENTS:
-- Usuários do cliente NÃO têm qualquer acesso de leitura ou escrita
-- Apenas o backend (service_role) acessa e processa webhooks.
DROP POLICY IF EXISTS "Webhook events SELECT" ON public.webhook_events;
DROP POLICY IF EXISTS "Webhook events INSERT" ON public.webhook_events;
DROP POLICY IF EXISTS "Webhook events UPDATE" ON public.webhook_events;
DROP POLICY IF EXISTS "Webhook events DELETE" ON public.webhook_events;
