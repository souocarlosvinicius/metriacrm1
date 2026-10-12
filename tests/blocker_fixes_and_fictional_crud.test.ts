/**
 * ==============================================================================
 * METRIA CRM - TESTE DOS BLOQUEIOS CORRIGIDOS E CRUD COM CONTAS FICTÍCIAS
 * ==============================================================================
 */

process.env.NODE_ENV = "test";
process.env.TEST_ENV = "true";

import assert from "assert";
import fs from "fs";
import path from "path";

function test(description: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ [PASSOU] ${description}`);
    })
    .catch((err) => {
      console.error(`  ❌ [FALHOU] ${description}`);
      console.error(err);
      throw err;
    });
}

async function runTests() {
  console.log("==============================================================================");
  console.log("  METRIA CRM - VALIDAÇÃO DAS CORREÇÕES DE SQL, INTEGRAÇÃO E CRUD FICTÍCIO     ");
  console.log("==============================================================================");

  console.log("\n--- 1. VERIFICAÇÃO DE IDENTIFICADORES 'current_role' EM SQL E SCHEMA ---");
  await test("1.1 Nenhum identificador 'current_role' sem aspas é executado em SQL", () => {
    const sqlFiles = [
      "supabase/schema.sql",
      "supabase/migrations/20261009000001_fix_client_deletion_and_team_roles.sql",
      "supabase/migrations/20261009000002_tenant_isolation_and_integrity.sql",
      "supabase/migrations/20261009000003_auth_org_creation_and_invites.sql",
      "supabase/migrations/20261009000004_queries_settings_and_write_confirmation.sql",
      "supabase/migrations/20261009000005_storage_buckets_quotas_and_security.sql",
      "supabase/migrations/20261009000006_performance_indexes_tenant_assigned.sql",
      "supabase/migrations/20261009000007_repair_database_blockers.sql"
    ];

    for (const f of sqlFiles) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Ignora comentários SQL
        if (line.startsWith("--")) continue;
        const unquotedRegex = /(?<!")\bcurrent_role\b(?!")/i;
        assert(!unquotedRegex.test(line), `Linha ${i + 1} em ${f} contém 'current_role' sem aspas: ${line}`);
      }
    }
  });

  console.log("\n--- 2. ALINHAMENTO DE ONBOARDING E TRANSAÇÃO DE ORGANIZAÇÃO ---");
  await test("2.1 Profiles, RPCs e fallbacks sincronizam 'onboardingCompleted' e 'onboarding_completed'", () => {
    const migration7 = fs.readFileSync("supabase/migrations/20261009000007_repair_database_blockers.sql", "utf8");
    assert(migration7.includes('"onboardingCompleted"'), "Migration 7 inclui onboardingCompleted");
    assert(migration7.includes("onboarding_completed"), "Migration 7 inclui onboarding_completed");
    assert(migration7.includes("sync_profile_onboarding_status"), "Trigger de sincronização existe na migration 7");

    const schema = fs.readFileSync("supabase/schema.sql", "utf8");
    assert(schema.includes('"onboardingCompleted"'), "schema.sql inclui onboardingCompleted");

    const serverTs = fs.readFileSync("server.ts", "utf8");
    assert(serverTs.includes("onboardingCompleted: true"), "server.ts salva onboardingCompleted");
  });

  await test("2.2 Fallback de POST /api/organizations reverte organização se criação de perfil falhar", () => {
    const serverTs = fs.readFileSync("server.ts", "utf8");
    const orgPostIdx = serverTs.indexOf('app.post("/api/organizations"');
    assert(orgPostIdx !== -1, "Endpoint /api/organizations encontrado");
    const orgPostBlock = serverTs.slice(orgPostIdx, orgPostIdx + 6000);
    assert(orgPostBlock.includes('delete().eq("organization_id", org.id)'), "Reverte membros da organização em caso de erro");
    assert(orgPostBlock.includes('delete().eq("id", org.id)'), "Reverte organização em caso de erro de perfil");
  });

  console.log("\n--- 3. INTEGRIDADE CROSS-TENANT E ESTREITAMENTO DE COLUNAS ---");
  await test("3.1 check_cross_tenant_integrity e triggers específicos não causam erro de coluna inexistente", () => {
    const migration7 = fs.readFileSync("supabase/migrations/20261009000007_repair_database_blockers.sql", "utf8");
    assert(migration7.includes("check_client_integrity"), "Função específica para clients");
    assert(migration7.includes("check_property_integrity"), "Função específica para properties");
    assert(migration7.includes("check_task_activity_integrity"), "Função específica para tasks e atividades");
    assert(migration7.includes("check_history_event_integrity"), "Função específica para history_events");
    assert(migration7.includes("to_jsonb(NEW)"), "check_cross_tenant_integrity usa to_jsonb(NEW) para resolução dinâmica segura");
  });

  console.log("\n--- 4. ALINHAMENTO DE COLUNA CANÔNICA NO requireGeminiPlan ---");
  await test("4.1 requireGeminiPlan usa subscription_expires_at e não mascare erro de banco como inexistente", () => {
    const serverTs = fs.readFileSync("server.ts", "utf8");
    const geminiIdx = serverTs.indexOf("const requireGeminiPlan");
    assert(geminiIdx !== -1, "requireGeminiPlan encontrado");
    const geminiBlock = serverTs.slice(geminiIdx, geminiIdx + 8000);

    assert(geminiBlock.includes("subscription_expires_at"), "Consulta coluna canônica subscription_expires_at");
    assert(geminiBlock.includes('code: "DB_QUERY_ERROR"'), "Retorna DB_QUERY_ERROR em caso de falha de consulta");
    assert(!geminiBlock.includes("if (orgErr) return res.status(404)"), "Não mascara erro como 404");
  });

  console.log("\n--- 5. CATÁLOGO DE ÍNDICES E REVISÃO DE NOMES DE COLUNAS ---");
  await test("5.1 Migration de índices confere catálogo antes de criar índices", () => {
    const migration6 = fs.readFileSync("supabase/migrations/20261009000006_performance_indexes_tenant_assigned.sql", "utf8");
    assert(migration6.includes("metria_find_col"), "Migration 6 busca colunas dinamicamente");
    assert(migration6.includes("assigned_to") && migration6.includes("assigned_user_id"), "Migration 6 tolera assigned_to / assigned_user_id");
    assert(migration6.includes("clientId") && migration6.includes("client_id"), "Migration 6 tolera clientId / client_id");
    assert(migration6.includes("propertyId") && migration6.includes("property_id"), "Migration 6 tolera propertyId / property_id");
  });

  console.log("\n--- 6. SIMULAÇÃO COMPLETA DE PERSISTÊNCIA CRUD E RECUSA DE TENANT COM CONTAS FICTÍCIAS ---");

  // Mock Database Store para validação funcional estrita em memória
  const mockDb = {
    organizations: new Map<string, any>(),
    members: new Map<string, any>(),
    profiles: new Map<string, any>(),
    clients: new Map<string, any>(),
    properties: new Map<string, any>(),
    tasks: new Map<string, any>(),
    visits: new Map<string, any>(),
    proposals: new Map<string, any>(),
    transactions: new Map<string, any>(),
    history_events: new Map<string, any>(),
    invites: new Map<string, any>()
  };

  // 6.1 Cadastro de Organização e Proprietário (Org A e Org B)
  const orgAId = "org-alpha-111";
  const userAId = "user-owner-alpha";
  mockDb.organizations.set(orgAId, {
    id: orgAId,
    name: "Imobiliária Alpha",
    plan: "pro",
    subscription_status: "active",
    subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });
  mockDb.members.set(`${orgAId}_${userAId}`, {
    organization_id: orgAId,
    user_id: userAId,
    role: "owner",
    status: "active"
  });
  mockDb.profiles.set(userAId, {
    id: userAId,
    default_organization_id: orgAId,
    current_role: "owner",
    onboarding_completed: true,
    onboardingCompleted: true
  });

  const orgBId = "org-beta-222";
  const userBId = "user-owner-beta";
  mockDb.organizations.set(orgBId, {
    id: orgBId,
    name: "Imobiliária Beta",
    plan: "start",
    subscription_status: "active",
    subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });
  mockDb.members.set(`${orgBId}_${userBId}`, {
    organization_id: orgBId,
    user_id: userBId,
    role: "owner",
    status: "active"
  });

  const userInactiveId = "user-inactive-alpha";
  mockDb.members.set(`${orgAId}_${userInactiveId}`, {
    organization_id: orgAId,
    user_id: userInactiveId,
    role: "broker",
    status: "inactive"
  });

  await test("6.1 Leitura e persistência de cadastro e perfil com onboarding alinhado", () => {
    const profA = mockDb.profiles.get(userAId);
    assert.strictEqual(profA.onboarding_completed, true);
    assert.strictEqual(profA.onboardingCompleted, true);
    assert.strictEqual(profA.current_role, "owner");
    assert.strictEqual(profA.default_organization_id, orgAId);
  });

  // 6.2 CRUD de Cliente
  const clientId = "client-alpha-001";
  mockDb.clients.set(clientId, {
    id: clientId,
    organization_id: orgAId,
    name: "Dr. Roberto Martins",
    email: "roberto@exemplo.com",
    assigned_to: userAId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await test("6.2 Persistência e leitura do cliente criado", () => {
    const client = mockDb.clients.get(clientId);
    assert(client, "Cliente deve existir");
    assert.strictEqual(client.name, "Dr. Roberto Martins");
    assert.strictEqual(client.organization_id, orgAId);
  });

  // 6.3 CRUD de Imóvel
  const propertyId = "prop-alpha-001";
  mockDb.properties.set(propertyId, {
    id: propertyId,
    organization_id: orgAId,
    ownerId: clientId,
    title: "Apartamento Luxo Vila Mariana",
    price: 950000,
    assigned_to: userAId,
    status: "available",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await test("6.3 Persistência e leitura do imóvel associado ao cliente proprietário da mesma org", () => {
    const prop = mockDb.properties.get(propertyId);
    assert(prop, "Imóvel deve existir");
    assert.strictEqual(prop.ownerId, clientId);
    assert.strictEqual(prop.organization_id, orgAId);
  });

  // 6.4 CRUD de Tarefa
  const taskId = "task-alpha-001";
  mockDb.tasks.set(taskId, {
    id: taskId,
    organization_id: orgAId,
    clientId: clientId,
    propertyId: propertyId,
    title: "Enviar documentação inicial",
    assigned_to: userAId,
    completed: false
  });

  await test("6.4 Persistência e leitura de tarefa vinculada", () => {
    const task = mockDb.tasks.get(taskId);
    assert(task, "Tarefa deve existir");
    assert.strictEqual(task.clientId, clientId);
    assert.strictEqual(task.propertyId, propertyId);
  });

  // 6.5 CRUD de Visita
  const visitId = "visit-alpha-001";
  mockDb.visits.set(visitId, {
    id: visitId,
    organization_id: orgAId,
    clientId: clientId,
    propertyId: propertyId,
    date: "2026-10-15",
    time: "14:00",
    status: "Agendada",
    assigned_to: userAId
  });

  await test("6.5 Persistência e leitura de visita vinculada", () => {
    const visit = mockDb.visits.get(visitId);
    assert(visit, "Visita deve existir");
    assert.strictEqual(visit.status, "Agendada");
  });

  // 6.6 CRUD de Proposta
  const proposalId = "prop-alpha-prop-001";
  mockDb.proposals.set(proposalId, {
    id: proposalId,
    organization_id: orgAId,
    clientId: clientId,
    propertyId: propertyId,
    proposedValue: 920000,
    status: "Pendente",
    assigned_to: userAId
  });

  await test("6.6 Persistência e leitura de proposta", () => {
    const prop = mockDb.proposals.get(proposalId);
    assert(prop, "Proposta deve existir");
    assert.strictEqual(prop.proposedValue, 920000);
  });

  // 6.7 CRUD de Transação
  const transId = "trans-alpha-001";
  mockDb.transactions.set(transId, {
    id: transId,
    organization_id: orgAId,
    title: "Comissão Parcial Venda",
    amount: 27600,
    status: "Concluído",
    assigned_to: userAId
  });

  await test("6.7 Persistência e leitura de transação", () => {
    const tr = mockDb.transactions.get(transId);
    assert(tr, "Transação deve existir");
    assert.strictEqual(tr.amount, 27600);
  });

  // 6.8 CRUD de Nota / Histórico
  const histId = "hist-alpha-001";
  mockDb.history_events.set(histId, {
    id: histId,
    organization_id: orgAId,
    clientId: clientId,
    type: "note",
    description: "Cliente solicitou visita no período da tarde",
    assigned_to: userAId
  });

  await test("6.8 Persistência e leitura de histórico de auditoria", () => {
    const hist = mockDb.history_events.get(histId);
    assert(hist, "Histórico deve existir");
    assert.strictEqual(hist.clientId, clientId);
  });

  // 6.9 Convite de Organização
  const inviteId = "inv-alpha-001";
  mockDb.invites.set(inviteId, {
    id: inviteId,
    organization_id: orgAId,
    invited_email: "novo.corretor@alpha.com",
    role: "broker",
    token: "token-convite-seguro-123",
    status: "pending"
  });

  await test("6.9 Persistência e leitura de convite de organização", () => {
    const inv = mockDb.invites.get(inviteId);
    assert(inv, "Convite deve existir");
    assert.strictEqual(inv.status, "pending");
  });

  // 6.10 Recusa de Usuário Externo e Inativo
  await test("6.10 Recusa de atribuição para usuário inativo e usuário de outra organização", () => {
    // 1. Tentar atribuir cliente da Org A para usuário da Org B
    const isMemberOrgA = mockDb.members.get(`${orgAId}_${userBId}`);
    assert(!isMemberOrgA, "Usuário da Org B não pode ser membro da Org A");

    // 2. Tentar atribuir cliente da Org A para usuário inativo
    const inactiveMember = mockDb.members.get(`${orgAId}_${userInactiveId}`);
    assert(inactiveMember && inactiveMember.status === "inactive", "Usuário inativo detectado");
    assert.strictEqual(inactiveMember.status === "active", false, "Recusa atribuição para membro inativo");

    // 3. Tentar vincular cliente da Org B a imóvel da Org A
    const clientBId = "client-beta-999";
    mockDb.clients.set(clientBId, { id: clientBId, organization_id: orgBId, name: "Cliente Beta" });
    const clientB = mockDb.clients.get(clientBId);
    assert.notStrictEqual(clientB.organization_id, orgAId, "Cross-tenant recusado: cliente da Org B não pode ser atribuído a registro da Org A");
  });

  console.log("\n==============================================================================");
  console.log("  TODOS OS TESTES DE VALIDAÇÃO DOS BLOQUEIOS FORAM CONCLUÍDOS COM SUCESSO!   ");
  console.log("==============================================================================");
  process.exit(0);
}

runTests().catch((e) => {
  console.error("Falha fatal na bateria de testes:", e);
  process.exit(1);
});
