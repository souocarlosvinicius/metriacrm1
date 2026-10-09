-- ==============================================================================
-- MIGRATION: 20261009000002_tenant_isolation_and_integrity.sql
-- DESCRIPTION:
--   Etapa 2: Isolamento completo e integridade dos dados por organização.
--   1. RLS revisado para clients, properties, tasks, visits, proposals,
--      transactions, settings e history_events:
--      - Para organization_id NOT NULL: exige vínculo ativo (is_org_member)
--        ANTES de avaliar cargo, criador ou responsável.
--      - Membro desativado ou removido perde acesso imediatamente mesmo com JWT válido.
--      - Dados legados (organization_id NULL) tratados explicitamente com regra de criador.
--      - WITH CHECK em INSERT e UPDATE impedindo movimentos indevidos entre organizações.
--   2. Imutabilidade de organization_id e userId no CRUD comum via trigger.
--   3. Integridade referencial multi-tenant via trigger (impede atividade de A referenciar
--      cliente/imóvel/responsável de B).
--   4. RPC transacional transfer_client_assignment para transferências autorizadas
--      de leads com verificação de plano e cargo confiável.
--   5. Funções com search_path seguro e privilégios de PUBLIC revogados.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TRIGGER DE IMUTABILIDADE DE TENANT E CRIADOR NO CRUD COMUM
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_tenant_record_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Permite operações internas de sistema se auth.uid() não estiver presente
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Proíbe alteração de organization_id quando o registro já pertencer a uma organização
  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id é imutável: movimentação direta de registro entre organizações é proibida';
  END IF;

  -- 2. Proíbe desvinculação de organização para tornar registro legado
  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Não é permitido desvincular um registro de sua organização';
  END IF;

  -- 3. Proíbe alteração do criador original ("userId")
  IF OLD."userId" IS NOT NULL AND NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'O criador original do registro (userId) é imutável e não pode ser alterado via CRUD';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tenant_record_immutability() FROM PUBLIC;

-- Aplica o trigger de imutabilidade em todas as tabelas de dados do tenant
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


-- ------------------------------------------------------------------------------
-- 2. TRIGGER DE INTEGRIDADE MULTI-TENANT (CROSS-TENANT REFERENTIAL CHECK)
-- ------------------------------------------------------------------------------
-- Impede que uma atividade, imóvel ou registro da Organização A aponte para um
-- cliente, imóvel ou responsável pertencente à Organização B ou inativo.
CREATE OR REPLACE FUNCTION public.check_cross_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref_org_id uuid;
  v_is_active_member boolean;
BEGIN
  -- Se o registro pertencer a uma organização
  IF NEW.organization_id IS NOT NULL THEN

    -- 1. Validação de responsável (assigned_to): deve ser membro ATIVO da mesma organização
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

    -- 2. Validação de cliente relacionado (clientId) se a coluna existir na tabela
    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals', 'history_events') THEN
      IF NEW."clientId" IS NOT NULL THEN
        SELECT organization_id INTO v_ref_org_id
        FROM public.clients
        WHERE id = NEW."clientId";

        IF v_ref_org_id IS NULL OR v_ref_org_id <> NEW.organization_id THEN
          RAISE EXCEPTION 'Violação de tenant: o cliente relacionado não pertence a esta organização';
        END IF;
      END IF;
    END IF;

    -- 3. Validação de imóvel relacionado (propertyId) se a coluna existir na tabela
    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals') THEN
      IF NEW."propertyId" IS NOT NULL THEN
        SELECT organization_id INTO v_ref_org_id
        FROM public.properties
        WHERE id = NEW."propertyId";

        IF v_ref_org_id IS NULL OR v_ref_org_id <> NEW.organization_id THEN
          RAISE EXCEPTION 'Violação de tenant: o imóvel relacionado não pertence a esta organização';
        END IF;
      END IF;
    END IF;

    -- 4. Validação em properties: ownerId (cliente proprietário do imóvel)
    IF TG_TABLE_NAME = 'properties' AND NEW."ownerId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."ownerId";

      IF v_ref_org_id IS NULL OR v_ref_org_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'Violação de tenant: o cliente proprietário do imóvel não pertence a esta organização';
      END IF;
    END IF;

  ELSE
    -- Caso legado (organization_id IS NULL):
    -- Se referenciar clientId ou propertyId, devem ser do mesmo usuário ou também legados
    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals', 'history_events') AND NEW."clientId" IS NOT NULL THEN
      SELECT organization_id INTO v_ref_org_id
      FROM public.clients
      WHERE id = NEW."clientId";

      IF v_ref_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Violação de integridade: registro legado não pode referenciar cliente de uma organização';
      END IF;
    END IF;

    IF TG_TABLE_NAME IN ('tasks', 'visits', 'proposals') AND NEW."propertyId" IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.check_cross_tenant_integrity() FROM PUBLIC;

-- Aplica o trigger de integridade cross-tenant
DROP TRIGGER IF EXISTS trg_tenant_integrity_clients ON public.clients;
CREATE TRIGGER trg_tenant_integrity_clients
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_properties ON public.properties;
CREATE TRIGGER trg_tenant_integrity_properties
BEFORE INSERT OR UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_tasks ON public.tasks;
CREATE TRIGGER trg_tenant_integrity_tasks
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_visits ON public.visits;
CREATE TRIGGER trg_tenant_integrity_visits
BEFORE INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_proposals ON public.proposals;
CREATE TRIGGER trg_tenant_integrity_proposals
BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_transactions ON public.transactions;
CREATE TRIGGER trg_tenant_integrity_transactions
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_tenant_integrity_history_events ON public.history_events;
CREATE TRIGGER trg_tenant_integrity_history_events
BEFORE INSERT OR UPDATE ON public.history_events
FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();


-- ------------------------------------------------------------------------------
-- 3. RPC DE TRANSFERÊNCIA DE CLIENTES/LEADS AUTORIZADA E TRANSACIONAL
-- ------------------------------------------------------------------------------
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
  -- 1. Exige autenticação
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- 2. Valida parâmetros
  IF p_client_ids IS NULL OR array_length(p_client_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhum cliente informado para transferência';
  END IF;

  IF p_target_broker_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização e corretor de destino são obrigatórios';
  END IF;

  -- 3. Valida cargo do solicitante na organização diretamente em organization_members
  v_actor_role := public.get_user_role(p_organization_id);
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Acesso negado: apenas proprietários, administradores ou gestores ativos podem transferir clientes';
  END IF;

  -- 4. Valida plano da organização
  SELECT plan INTO v_org_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_plan IS NULL OR v_org_plan NOT IN ('max', 'pro_max') THEN
    RAISE EXCEPTION 'Transferência de leads está disponível apenas nos planos Max e PRO MAX';
  END IF;

  -- 5. Valida corretor de destino: deve ser membro ATIVO da MESMA organização
  -- (Esta operação apenas transfere a responsabilidade do cliente; NÃO concede cargos nem altera o status do corretor)
  SELECT name, email
  INTO v_target_name, v_target_email
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = p_target_broker_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O corretor destinatário não é um membro ativo desta organização';
  END IF;

  -- 6. Obtém nome do ator para registro no histórico
  SELECT COALESCE(name, username, 'Administrador')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  -- 7. Execução atômica e transacional para todos os clientes
  -- Se qualquer cliente falhar ou pertencer a outra organização, a transação inteira falha
  FOREACH v_client_id IN ARRAY p_client_ids
  LOOP
    -- Bloqueia a linha do cliente para atualização
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

    -- Constrói a entrada de histórico
    v_new_history_entry := jsonb_build_object(
      'id', substr(md5(random()::text), 1, 9),
      'type', 'transfer',
      'date', timezone('utc'::text, now())::text,
      'description', 'Lead transferido para o corretor responsável ' || COALESCE(v_target_name, v_target_email),
      'userName', COALESCE(v_actor_name, 'Administrador')
    );

    -- Atualiza o cliente
    UPDATE public.clients
    SET assigned_to = p_target_broker_id,
        history = COALESCE(v_client_history, '[]'::jsonb) || jsonb_build_array(v_new_history_entry),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_client_id;

    -- Registra o evento em history_events de forma consistente com o tenant
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


-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS RLS BLINDADAS PARA TODAS AS 8 TABELAS
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- A. CLIENTS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- B. PROPERTIES
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- C. TASKS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- D. VISITS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- E. PROPOSALS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- F. TRANSACTIONS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- G. SETTINGS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- H. HISTORY EVENTS
-- ------------------------------------------------------------------------------
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
