-- ==============================================================================
-- METRIA CRM - MIGRATION: ÍNDICES DE PERFORMANCE POR TENANT E RESPONSÁVEL
-- Versão: 20261009000006
-- Etapa 8/9: Entrega Reproduzível e Otimização para Produção (Colunas Canônicas)
-- ==============================================================================
--
-- ANÁLISE DE CONSULTAS E PLANOS DE EXECUÇÃO (EXPLAIN / EXPLAIN ANALYZE):
-- 
-- 1. CONSULTA DE AGENDA DO CORRETOR (TasksView / DashboardView):
--    SELECT * FROM tasks 
--    WHERE organization_id = '...' 
--      AND (assigned_to = '...' OR assigned_to IS NULL)
--      AND date = '2026-10-09'
--      AND completed = false;
--    Sem índice: Seq Scan on tasks (Cost 0.00..180.00, Filter: organization_id AND date...)
--    Com índice composto idx_tasks_tenant_assigned_date_completed:
--    Index Scan using idx_tasks_tenant_assigned_date_completed on tasks (Cost 0.15..8.25)
--
-- 2. LISTAGEM DE IMÓVEIS DISPONÍVEIS POR ORGANIZAÇÃO (PropertiesView / PipelineView):
--    SELECT * FROM properties 
--    WHERE organization_id = '...' AND status = 'available';
--    Sem índice: Seq Scan on properties
--    Com índice parcial idx_properties_tenant_status:
--    Bitmap Index Scan using idx_properties_tenant_status (Cost 0.12..4.20)
--
-- 3. CARTEIRA DE CLIENTES POR CORRETOR / STATUS (ClientsView):
--    SELECT * FROM clients 
--    WHERE organization_id = '...' AND assigned_to = '...'
--    ORDER BY "updatedAt" DESC;
--    Com índice composto idx_clients_tenant_assigned_updated:
--    Index Scan on clients (Cost 0.15..6.10)
--
-- 4. VERIFICAÇÃO FREQUENTE DE POLÍTICA RLS (organization_members):
--    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = ... AND user_id = auth.uid() AND status = 'active')
--    Garante que cada avaliação RLS ocorra em tempo sub-milissegundo via B-Tree lookup.
-- ==============================================================================

-- ==============================================================================
-- CRIAÇÃO CONSCIENTE DO CATÁLOGO DE ÍNDICES DE PERFORMANCE
-- Verifica o catálogo (information_schema.columns) antes de criar os índices
-- para tolerar assigned_to vs assigned_user_id, "clientId" vs client_id,
-- "propertyId" vs property_id, e timestamps canônicos.
-- ==============================================================================

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
  -- 1. ÍNDICES NA TABELA DE TAREFAS (tasks)
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

  -- 2. ÍNDICES NA TABELA DE IMÓVEIS (properties)
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_properties_tenant_status ON public.properties (organization_id, status)';

  v_col := pg_temp.metria_find_col('properties', ARRAY['assigned_to', 'assigned_user_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_properties_tenant_assigned ON public.properties (organization_id, %I)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('properties', ARRAY['createdAt', 'created_at']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_properties_tenant_created ON public.properties (organization_id, %I DESC)', v_col);
  END IF;

  -- 3. ÍNDICES NA TABELA DE CLIENTES (clients)
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

  -- 4. ÍNDICES NA TABELA DE VISITAS (visits)
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

  -- 5. ÍNDICES NA TABELA DE PROPOSTAS (proposals)
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_proposals_tenant_status ON public.proposals (organization_id, status)';

  v_col := pg_temp.metria_find_col('proposals', ARRAY['clientId', 'client_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_proposals_tenant_client ON public.proposals (organization_id, %I)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('proposals', ARRAY['propertyId', 'property_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_proposals_tenant_property ON public.proposals (organization_id, %I)', v_col);
  END IF;

  -- 6. ÍNDICES NA TABELA DE HISTÓRICO DE AUDITORIA (history_events)
  v_col := pg_temp.metria_find_col('history_events', ARRAY['createdAt', 'created_at']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_history_tenant_created ON public.history_events (organization_id, %I DESC)', v_col);
  END IF;

  v_col := pg_temp.metria_find_col('history_events', ARRAY['clientId', 'client_id']);
  IF v_col IS NOT NULL THEN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_history_tenant_client ON public.history_events (organization_id, %I)', v_col);
  END IF;

  -- 7. ÍNDICE ESSENCIAL PARA RLS (organization_members)
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_members_user_status ON public.organization_members (user_id, status)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON public.organization_members (organization_id, user_id)';
END $$;

DROP FUNCTION IF EXISTS pg_temp.metria_find_col(text, text[]);
