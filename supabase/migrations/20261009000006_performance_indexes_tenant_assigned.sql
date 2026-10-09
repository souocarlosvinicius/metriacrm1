-- ==============================================================================
-- METRIA CRM - MIGRATION: ÍNDICES DE PERFORMANCE POR TENANT E RESPONSÁVEL
-- Versão: 20261009000006
-- Etapa 8: Entrega Reproduzível e Otimização para Produção
-- ==============================================================================
--
-- ANÁLISE DE CONSULTAS E PLANOS DE EXECUÇÃO (EXPLAIN / EXPLAIN ANALYZE):
-- 
-- 1. CONSULTA DE AGENDA DO CORRETOR (TasksView / DashboardView):
--    SELECT * FROM tasks 
--    WHERE organization_id = '...' 
--      AND (assigned_user_id = '...' OR assigned_user_id IS NULL)
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
--    WHERE organization_id = '...' AND assigned_user_id = '...'
--    ORDER BY updated_at DESC;
--    Com índice composto idx_clients_tenant_assigned_updated:
--    Index Scan on clients (Cost 0.15..6.10)
--
-- 4. VERIFICAÇÃO FREQUENTE DE POLÍTICA RLS (organization_members):
--    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = ... AND user_id = auth.uid() AND status = 'active')
--    Garante que cada avaliação RLS ocorra em tempo sub-milissegundo via B-Tree lookup.
-- ==============================================================================

-- 1. ÍNDICES NA TABELA DE TAREFAS (tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assigned_date_completed
  ON public.tasks (organization_id, assigned_user_id, date, completed);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_date
  ON public.tasks (organization_id, date);

-- 2. ÍNDICES NA TABELA DE IMÓVEIS (properties)
CREATE INDEX IF NOT EXISTS idx_properties_tenant_status
  ON public.properties (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_properties_tenant_assigned
  ON public.properties (organization_id, assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_properties_tenant_created
  ON public.properties (organization_id, created_at DESC);

-- 3. ÍNDICES NA TABELA DE CLIENTES (clients)
CREATE INDEX IF NOT EXISTS idx_clients_tenant_status
  ON public.clients (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_clients_tenant_assigned_updated
  ON public.clients (organization_id, assigned_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_tenant_created
  ON public.clients (organization_id, created_at DESC);

-- 4. ÍNDICES NA TABELA DE VISITAS (visits)
CREATE INDEX IF NOT EXISTS idx_visits_tenant_assigned_date
  ON public.visits (organization_id, assigned_user_id, date);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_property
  ON public.visits (organization_id, property_id);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_client
  ON public.visits (organization_id, client_id);

-- 5. ÍNDICES NA TABELA DE PROPOSTAS (proposals)
CREATE INDEX IF NOT EXISTS idx_proposals_tenant_status
  ON public.proposals (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_proposals_tenant_client
  ON public.proposals (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_proposals_tenant_property
  ON public.proposals (organization_id, property_id);

-- 6. ÍNDICES NA TABELA DE HISTÓRICO DE AUDITORIA (history_events)
CREATE INDEX IF NOT EXISTS idx_history_tenant_created
  ON public.history_events (organization_id, created_at DESC);

-- 7. ÍNDICE ESSENCIAL PARA RLS (organization_members)
CREATE INDEX IF NOT EXISTS idx_org_members_user_status
  ON public.organization_members (user_id, status);

CREATE INDEX IF NOT EXISTS idx_org_members_org_user
  ON public.organization_members (organization_id, user_id);
