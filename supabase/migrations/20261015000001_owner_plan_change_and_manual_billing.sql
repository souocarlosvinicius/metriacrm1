-- ==========================================
-- MIGRATION: MUDANÇA DE PLANO PELO TITULAR E COBRANÇAS MANUAIS
-- 20261015000001_owner_plan_change_and_manual_billing.sql
-- ==========================================

-- 1. Garante as colunas plan_changed_at e next_plan_change_at em organizations
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS plan_changed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS next_plan_change_at timestamp with time zone;

-- 2. Tabela de histórico das alterações de plano
CREATE TABLE IF NOT EXISTS public.organization_plan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  previous_plan text NOT NULL,
  new_plan text NOT NULL,
  changed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  next_allowed_change_at timestamp with time zone NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0.00,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  source text NOT NULL DEFAULT 'owner_self_service',
  idempotency_key text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_plan_changes_org_date 
  ON public.organization_plan_changes(organization_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_plan_changes_idempotency
  ON public.organization_plan_changes(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.organization_plan_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization plan changes SELECT" ON public.organization_plan_changes;
CREATE POLICY "Organization plan changes SELECT" ON public.organization_plan_changes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_plan_changes.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.organization_plan_changes FROM authenticated, anon;
GRANT SELECT ON public.organization_plan_changes TO authenticated;
GRANT ALL ON public.organization_plan_changes TO service_role;

-- 3. Tabela de cobranças manuais e pendências financeiras
CREATE TABLE IF NOT EXISTS public.manual_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_change_id uuid REFERENCES public.organization_plan_changes(id) ON DELETE SET NULL,
  reference_period text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0.00,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_date timestamp with time zone DEFAULT NULL,
  notes text DEFAULT NULL,
  reviewed_by text DEFAULT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manual_charges_org_status
  ON public.manual_charges(organization_id, status, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_manual_charges_plan_change
  ON public.manual_charges(plan_change_id)
  WHERE plan_change_id IS NOT NULL;

ALTER TABLE public.manual_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manual charges SELECT" ON public.manual_charges;
CREATE POLICY "Manual charges SELECT" ON public.manual_charges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = manual_charges.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.manual_charges FROM authenticated, anon;
GRANT SELECT ON public.manual_charges TO authenticated;
GRANT ALL ON public.manual_charges TO service_role;

-- 4. RPC transacional: mudança de plano pelo titular com trava de 30 dias
CREATE OR REPLACE FUNCTION public.change_organization_plan_by_owner(
  p_organization_id uuid,
  p_target_plan text,
  p_idempotency_key text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_caller_role text;
  v_org RECORD;
  v_target_max_members integer;
  v_target_price numeric(10,2);
  v_active_members integer;
  v_now timestamp with time zone;
  v_next_allowed timestamp with time zone;
  v_change_id uuid;
  v_charge_id uuid;
  v_existing_change RECORD;
BEGIN
  -- 1. Identifica o ator autenticado com proteção anti-spoofing
  IF current_setting('role', true) = 'authenticated' AND auth.uid() IS NOT NULL THEN
    v_user_id := auth.uid();
  ELSE
    v_user_id := COALESCE(p_actor_id, auth.uid());
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado: faça login para alterar o plano da organização.';
  END IF;

  -- 2. Valida o plano de destino
  p_target_plan := LOWER(TRIM(COALESCE(p_target_plan, '')));
  IF p_target_plan NOT IN ('beta', 'start', 'pro', 'max', 'pro_max') THEN
    RAISE EXCEPTION 'Plano inválido: "%". Utilize beta, start, pro, max ou pro_max.', p_target_plan;
  END IF;

  -- 3. Bloqueia a linha da organização com SELECT FOR UPDATE
  SELECT id, name, owner_id, plan, max_members, access_status, subscription_status,
         subscription_expires_at, plan_changed_at, next_plan_change_at
  INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada.';
  END IF;

  -- 4. Valida se a organização está suspensa administrativamente
  IF v_org.access_status = 'suspended' THEN
    RAISE EXCEPTION 'Acesso negado: a organização está temporariamente suspensa por pendência administrativa ou financeira.';
  END IF;

  -- 5. Valida propriedade e membership ativo do chamador (não usa current_role do perfil)
  SELECT role INTO v_caller_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    IF v_org.owner_id <> v_user_id THEN
      RAISE EXCEPTION 'Acesso negado: apenas o proprietário legítimo com vínculo ativo pode alterar o plano da organização.';
    END IF;
  END IF;

  -- 6. Idempotência: repetição da mesma solicitação
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT id, previous_plan, new_plan, changed_at, next_allowed_change_at, price
    INTO v_existing_change
    FROM public.organization_plan_changes
    WHERE organization_id = p_organization_id
      AND idempotency_key = TRIM(p_idempotency_key)
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN json_build_object(
        'success', true,
        'idempotent', true,
        'changed', true,
        'change_id', v_existing_change.id,
        'organization_id', p_organization_id,
        'previous_plan', v_existing_change.previous_plan,
        'new_plan', v_existing_change.new_plan,
        'plan_changed_at', v_existing_change.changed_at,
        'next_plan_change_at', v_existing_change.next_allowed_change_at,
        'price', v_existing_change.price,
        'message', 'Solicitação já processada anteriormente (idempotente).'
      );
    END IF;
  END IF;

  -- 7. Selecionar o plano já ativo NÃO é uma alteração
  IF v_org.plan = p_target_plan THEN
    RETURN json_build_object(
      'success', true,
      'changed', false,
      'organization_id', p_organization_id,
      'plan', v_org.plan,
      'plan_changed_at', v_org.plan_changed_at,
      'next_plan_change_at', v_org.next_plan_change_at,
      'message', 'O plano ' || p_target_plan || ' já está ativo nesta organização. Nenhuma alteração realizada.'
    );
  END IF;

  -- 8. Confere o prazo de 30 dias após adquirir a trava
  v_now := timezone('utc'::text, now());
  IF v_org.next_plan_change_at IS NOT NULL AND v_org.next_plan_change_at > v_now THEN
    RAISE EXCEPTION 'Mudança de plano bloqueada: intervalo mínimo de 30 dias entre alterações não atingido. Próxima alteração permitida em %.',
      to_char(v_org.next_plan_change_at, 'DD/MM/YYYY HH24:MI:SS');
  END IF;

  -- 9. Define cotas comerciais consolidadas sem inventar valores
  IF p_target_plan = 'max' THEN
    v_target_max_members := 5;
    v_target_price := 149.90;
  ELSIF p_target_plan = 'pro_max' THEN
    v_target_max_members := 99;
    v_target_price := 0.00;
  ELSIF p_target_plan = 'pro' THEN
    v_target_max_members := 1;
    v_target_price := 79.90;
  ELSIF p_target_plan = 'start' THEN
    v_target_max_members := 1;
    v_target_price := 39.90;
  ELSE -- 'beta'
    v_target_max_members := 1;
    v_target_price := 0.00;
  END IF;

  -- 10. Valida se o uso atual excede os limites do plano de destino
  SELECT count(*) INTO v_active_members
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND status = 'active';

  IF v_active_members > v_target_max_members THEN
    RAISE EXCEPTION 'Não é possível mudar para o plano %: a organização possui % membros ativos, excedendo a capacidade de % membros deste plano. Desative membros excedentes antes de efetuar a troca.',
      p_target_plan, v_active_members, v_target_max_members;
  END IF;

  -- Validação de limites adicionais para downgrade ao plano Beta (máx 10 clientes e 5 imóveis)
  IF p_target_plan = 'beta' THEN
    DECLARE
      v_client_count integer := 0;
      v_property_count integer := 0;
    BEGIN
      SELECT count(*) INTO v_client_count FROM public.clients WHERE organization_id = p_organization_id;
      IF v_client_count > 10 THEN
        RAISE EXCEPTION 'Não é possível realizar o downgrade para o plano Beta: a organização possui % clientes ativos (limite do Beta: 10). Exclua ou arquive clientes excedentes antes de alterar.', v_client_count;
      END IF;

      SELECT count(*) INTO v_property_count FROM public.properties WHERE organization_id = p_organization_id;
      IF v_property_count > 5 THEN
        RAISE EXCEPTION 'Não é possível realizar o downgrade para o plano Beta: a organização possui % imóveis cadastrados (limite do Beta: 5). Remova imóveis excedentes antes de alterar.', v_property_count;
      END IF;
    END;
  END IF;

  -- 11. Calcula a próxima data permitida (30 dias exatos no banco)
  v_next_allowed := v_now + interval '30 days';

  -- 12. Atualiza plano, limite de membros e datas com trava de override da RPC
  PERFORM set_config('metria.internal_rpc_override', 'true', true);

  UPDATE public.organizations
  SET plan = p_target_plan,
      max_members = v_target_max_members,
      plan_changed_at = v_now,
      next_plan_change_at = v_next_allowed,
      updated_at = v_now
  WHERE id = p_organization_id;

  -- 13. Grava histórico da alteração
  INSERT INTO public.organization_plan_changes (
    organization_id,
    user_id,
    previous_plan,
    new_plan,
    changed_at,
    next_allowed_change_at,
    price,
    billing_cycle,
    source,
    idempotency_key,
    metadata
  ) VALUES (
    p_organization_id,
    v_user_id,
    v_org.plan,
    p_target_plan,
    v_now,
    v_next_allowed,
    v_target_price,
    'monthly',
    'owner_self_service',
    NULLIF(TRIM(p_idempotency_key), ''),
    jsonb_build_object(
      'previous_max_members', v_org.max_members,
      'new_max_members', v_target_max_members,
      'active_members', v_active_members
    )
  ) RETURNING id INTO v_change_id;

  -- 14. Registra pendência de cobrança manual para conferência financeira
  INSERT INTO public.manual_charges (
    organization_id,
    plan_change_id,
    reference_period,
    amount,
    due_date,
    status,
    notes
  ) VALUES (
    p_organization_id,
    v_change_id,
    to_char(v_now, 'YYYY-MM'),
    v_target_price,
    (v_now + interval '5 days')::date,
    'pending',
    'Mudança de plano pelo titular: ' || v_org.plan || ' -> ' || p_target_plan || '. Pendência financeira gerada para conferência manual.'
  ) RETURNING id INTO v_charge_id;

  -- 15. Auditoria transacional
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
    performed_at,
    metadata
  ) VALUES (
    p_organization_id,
    'owner_plan_change',
    v_org.plan,
    p_target_plan,
    v_org.subscription_expires_at,
    v_org.subscription_expires_at,
    v_org.subscription_status,
    v_org.subscription_status,
    'Mudança de plano confirmada pelo titular da conta',
    v_user_id::text,
    v_now,
    jsonb_build_object('plan_change_id', v_change_id, 'charge_id', v_charge_id)
  );

  RETURN json_build_object(
    'success', true,
    'changed', true,
    'change_id', v_change_id,
    'charge_id', v_charge_id,
    'organization_id', p_organization_id,
    'previous_plan', v_org.plan,
    'new_plan', p_target_plan,
    'max_members', v_target_max_members,
    'plan_changed_at', v_now,
    'next_plan_change_at', v_next_allowed,
    'price', v_target_price,
    'message', 'Plano alterado com sucesso para ' || p_target_plan || '. Próxima alteração disponível em 30 dias.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_organization_plan_by_owner(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_organization_plan_by_owner(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_organization_plan_by_owner(uuid, text, text, uuid) TO service_role;

-- 5. RPC administrativa para criar cobrança manual
CREATE OR REPLACE FUNCTION public.admin_create_manual_charge(
  p_organization_id uuid,
  p_reference_period text,
  p_amount numeric,
  p_due_date date,
  p_notes text DEFAULT NULL,
  p_admin_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_charge_id uuid;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Valor da cobrança não pode ser negativo.';
  END IF;

  INSERT INTO public.manual_charges (
    organization_id,
    reference_period,
    amount,
    due_date,
    status,
    notes,
    reviewed_by
  ) VALUES (
    p_organization_id,
    TRIM(p_reference_period),
    p_amount,
    p_due_date,
    'pending',
    p_notes,
    p_admin_id
  ) RETURNING id INTO v_charge_id;

  INSERT INTO public.organization_plan_audit (
    organization_id,
    action,
    previous_plan,
    new_plan,
    reason,
    performed_by,
    metadata
  ) VALUES (
    p_organization_id,
    'manual_charge_created',
    '',
    '',
    COALESCE(p_notes, 'Nova cobrança manual registrada'),
    COALESCE(p_admin_id, 'admin'),
    jsonb_build_object('charge_id', v_charge_id, 'amount', p_amount, 'reference_period', p_reference_period)
  );

  RETURN json_build_object(
    'success', true,
    'charge_id', v_charge_id,
    'amount', p_amount,
    'reference_period', p_reference_period
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_manual_charge(uuid, text, numeric, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_charge(uuid, text, numeric, date, text, text) TO service_role;

-- 6. RPC administrativa para atualizar status de cobrança manual
CREATE OR REPLACE FUNCTION public.admin_update_manual_charge_status(
  p_charge_id uuid,
  p_status text,
  p_payment_date timestamp with time zone DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_admin_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_charge RECORD;
  v_pay_date timestamp with time zone;
BEGIN
  p_status := LOWER(TRIM(p_status));
  IF p_status NOT IN ('pending', 'paid', 'cancelled') THEN
    RAISE EXCEPTION 'Status inválido: "%". Utilize pending, paid ou cancelled.', p_status;
  END IF;

  SELECT * INTO v_charge
  FROM public.manual_charges
  WHERE id = p_charge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança manual não encontrada.';
  END IF;

  IF p_status = 'paid' THEN
    v_pay_date := COALESCE(p_payment_date, timezone('utc'::text, now()));
  ELSE
    v_pay_date := NULL;
  END IF;

  UPDATE public.manual_charges
  SET status = p_status,
      payment_date = v_pay_date,
      notes = COALESCE(p_notes, notes),
      reviewed_by = COALESCE(p_admin_id, reviewed_by),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_charge_id;

  INSERT INTO public.organization_plan_audit (
    organization_id,
    action,
    previous_plan,
    new_plan,
    previous_status,
    new_status,
    reason,
    performed_by,
    metadata
  ) VALUES (
    v_charge.organization_id,
    'manual_charge_' || p_status,
    '',
    '',
    v_charge.status,
    p_status,
    COALESCE(p_notes, 'Status de cobrança alterado para ' || p_status),
    COALESCE(p_admin_id, 'admin'),
    jsonb_build_object('charge_id', p_charge_id, 'amount', v_charge.amount, 'payment_date', v_pay_date)
  );

  RETURN json_build_object(
    'success', true,
    'charge_id', p_charge_id,
    'status', p_status,
    'payment_date', v_pay_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_manual_charge_status(uuid, text, timestamp with time zone, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_manual_charge_status(uuid, text, timestamp with time zone, text, text) TO service_role;
