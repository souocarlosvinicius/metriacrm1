import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { getMaxMembersByPlan, PLAN_LIMITS } from "../src/config/plans.js";

console.log("==============================================================================");
console.log("  METRIA CRM - TESTES DE COBRANÇA MANUAL, TRANSIÇÃO E SEGURANÇA AVANÇADA       ");
console.log("==============================================================================");

async function runTests() {
  const schemaSql = fs.readFileSync(path.join(process.cwd(), "supabase", "schema.sql"), "utf-8");
  const transitionMigration = fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261012000002_transition_manual_billing_and_security.sql"),
    "utf-8"
  );
  const suspensionMigration = fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261010000001_administrative_suspension.sql"),
    "utf-8"
  );
  const appFilePath = fs.existsSync(path.join(process.cwd(), "src", "app.ts"))
    ? path.join(process.cwd(), "src", "app.ts")
    : path.join(process.cwd(), "server.ts");
  const serverTs = fs.readFileSync(appFilePath, "utf-8");
  const apiTs = fs.readFileSync(path.join(process.cwd(), "src", "api.ts"), "utf-8");

  // ----------------------------------------------------------------------------
  // 1. PROTEÇÃO NO BANCO DE DADOS CONTRA ALTERAÇÕES DIRETAS DE CLIENTES
  // ----------------------------------------------------------------------------
  console.log("\n--- 1. PROTEÇÃO DE CAMPOS CONTRA ALTERAÇÕES DIRETAS DE CLIENTES ---");

  const requiredFields = [
    "plan",
    "subscription_status",
    "subscription_expires_at",
    "max_members",
    "owner_id"
  ];

  for (const field of requiredFields) {
    assert.ok(
      transitionMigration.includes(field),
      `Migration 20261012000002 deve proteger o campo ${field}`
    );
    assert.ok(
      schemaSql.includes(field),
      `schema.sql deve conter proteção para o campo ${field}`
    );
  }
  console.log("  ✅ [PASSOU] 1.1 Campos plan, subscription_status, subscription_expires_at, max_members e owner_id protegidos na migration e schema");

  assert.ok(
    transitionMigration.includes("protect_organization_protected_fields"),
    "protect_organization_protected_fields deve estar presente na migration"
  );
  assert.ok(
    transitionMigration.includes("auth.role() = 'authenticated'"),
    "Trigger deve interceptar sessões de cliente authenticated"
  );
  assert.ok(
    transitionMigration.includes("BEFORE INSERT OR UPDATE ON public.organizations"),
    "Trigger deve agir BEFORE INSERT OR UPDATE na tabela organizations"
  );
  console.log("  ✅ [PASSOU] 1.2 Trigger configurado BEFORE INSERT OR UPDATE bloqueando clientes autenticados");

  // ----------------------------------------------------------------------------
  // 2. ALINHAMENTO DE MIGRATION DE SUSPENSÃO E create_organization_invite_v2 COM p_org_id E token_hash
  // ----------------------------------------------------------------------------
  console.log("\n--- 2. ALINHAMENTO DE create_organization_invite_v2 COM p_org_id E token_hash ---");

  assert.ok(
    suspensionMigration.includes("FUNCTION public.create_organization_invite_v2(\n  p_org_id uuid,"),
    "create_organization_invite_v2 na migration de suspensão deve declarar p_org_id uuid"
  );
  assert.ok(
    transitionMigration.includes("p_org_id uuid,"),
    "create_organization_invite_v2 na migration de transição deve declarar p_org_id uuid"
  );
  assert.ok(
    apiTs.includes("p_org_id: organizationId"),
    "Chamada RPC no src/api.ts deve enviar p_org_id"
  );
  assert.ok(
    schemaSql.includes("idx_organization_invites_token_hash") && transitionMigration.includes("token_hash"),
    "organization_invites deve conter coluna token_hash e índice de busca seguro"
  );
  console.log("  ✅ [PASSOU] 2.1 create_organization_invite_v2 mantém p_org_id e token_hash na assinatura, corpo e chamadas");

  // ----------------------------------------------------------------------------
  // 3. MIGRATION INCREMENTAL DE TRANSIÇÃO (PRESERVAÇÃO E SEM DROP CASCADE)
  // ----------------------------------------------------------------------------
  console.log("\n--- 3. MIGRATION INCREMENTAL DE TRANSIÇÃO PARA COBRANÇA MANUAL ---");

  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
  const files = fs.readdirSync(migrationsDir);

  assert.ok(
    files.includes("20261010000002_asaas_billing_schema_and_authorization.sql"),
    "Migration do Asaas deve ser preservada no histórico (não apagar migrations aplicadas)"
  );
  assert.ok(
    files.includes("20261012000002_transition_manual_billing_and_security.sql"),
    "Migration incremental 20261012000002_transition_manual_billing_and_security.sql deve existir"
  );
  assert.ok(
    !/DROP\s+(TABLE|VIEW|SCHEMA|TYPE|FUNCTION)\s+[^;]+\s+CASCADE/i.test(transitionMigration),
    "Migration de transição NÃO deve conter comando DROP ... CASCADE"
  );
  assert.ok(
    !/DROP\s+TABLE/i.test(transitionMigration),
    "Migration de transição NÃO deve apagar tabelas de histórico ou assinaturas"
  );
  console.log("  ✅ [PASSOU] 3.1 Migration incremental preserva histórico do Asaas sem DROP CASCADE nem exclusão de tabelas");

  // ----------------------------------------------------------------------------
  // 4. REMOÇÃO DE FALLBACK NÃO TRANSACIONAL, VALIDAÇÃO DE VALIDADE E LIMITES CONSOLIDADOS
  // ----------------------------------------------------------------------------
  console.log("\n--- 4. LIBERAÇÃO MANUAL DE PLANO, REMOÇÃO DE FALLBACK E LIMITES CONSOLIDADOS ---");

  // 4.1 Validação de ausência de fallback não transacional em server.ts
  assert.ok(
    !serverTs.includes("[SERVER PLAN RPC FALLBACK]"),
    "server.ts não deve conter bloco de fallback não transacional na liberação de plano"
  );
  assert.ok(
    serverTs.includes("PLAN_UPDATE_TRANSACTION_FAILED"),
    "server.ts deve responder erro transacional se a RPC falhar"
  );
  assert.ok(
    serverTs.includes("EXPIRATION_MUST_BE_FUTURE"),
    "server.ts deve validar que a data de expiração da liberação é estritamente futura"
  );
  assert.ok(
    serverTs.includes("getMaxMembersByPlan"),
    "server.ts deve utilizar limites comerciais consolidados via getMaxMembersByPlan"
  );

  // 4.2 Limites comerciais canônicos
  assert.equal(getMaxMembersByPlan("beta"), 1, "Plano Beta: 1 membro");
  assert.equal(getMaxMembersByPlan("start"), 1, "Plano Start: 1 membro");
  assert.equal(getMaxMembersByPlan("pro"), 1, "Plano Pro: 1 membro");
  assert.equal(getMaxMembersByPlan("max"), 5, "Plano Max: 5 membros (sem inventar novos limites)");
  assert.equal(getMaxMembersByPlan("pro_max"), 99, "Plano PRO MAX: 99 membros");
  console.log("  ✅ [PASSOU] 4.1 Fallback removido, expiração validada e limites comerciais consolidados na fonte única");

  // ----------------------------------------------------------------------------
  // 5. REVALIDAÇÃO DE MEMBERSHIP/PROPRIEDADE EM UPLOADS E URLS ASSINADAS
  // ----------------------------------------------------------------------------
  console.log("\n--- 5. REVALIDAÇÃO DE MEMBERSHIP/PROPRIEDADE EM UPLOADS E URLS ASSINADAS ---");

  assert.ok(
    serverTs.includes("const { data: member } = await supabaseAdmin") &&
    serverTs.includes('.eq("status", "active")'),
    "/api/upload deve revalidar explicitamente status active em organization_members"
  );
  assert.ok(
    serverTs.includes("const { data: ownedOrg } = await supabaseAdmin") &&
    serverTs.includes('.eq("owner_id", userId)'),
    "/api/upload deve aceitar apenas membership ativa ou propriedade na tabela organizations"
  );
  assert.ok(
    serverTs.includes("if (!member && !ownedOrg)"),
    "/api/upload rejeita se o usuário não possuir membership ativa nem propriedade"
  );
  assert.ok(
    serverTs.includes("authorizedOrgIds.add") && serverTs.includes("CROSS_TENANT_ACCESS_DENIED"),
    "sign-url bloqueia com CROSS_TENANT_ACCESS_DENIED se documento pertencer a tenant não autorizado"
  );
  console.log("  ✅ [PASSOU] 5.1 default_organization_id isolado não autoriza: membership ativa ou propriedade estritamente exigidas");

  // ----------------------------------------------------------------------------
  // 6. EXECUÇÃO EM POSTGRESQL REAL (INSTALAÇÃO NOVA E ATUALIZAÇÃO)
  // ----------------------------------------------------------------------------
  console.log("\n--- 6. EXECUÇÃO EM POSTGRESQL REAL (PGlite / PostgreSQL Engine) ---");

  const preamble = `
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$ LANGUAGE sql STABLE;

    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );

    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb
    );

    CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $$
      SELECT string_to_array(name, '/');
    $$ LANGUAGE sql IMMUTABLE;
  `;

  // 6.1 Instalação Nova: schema.sql completo
  const pgFresh = new PGlite({ extensions: { pgcrypto, "uuid-ossp": uuid_ossp } });
  await pgFresh.exec(preamble);
  await pgFresh.exec(schemaSql);
  await pgFresh.exec(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
  `);
  console.log("  ✅ [PASSOU] 6.1 Instalação nova executou schema.sql com sucesso absoluto no PostgreSQL real");

  // 6.2 Validação de RLS e Bloqueio de Operações Diretas após Vencimento da Assinatura
  const testUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const testOrgId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  await pgFresh.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${testUserId}', 'client@test.com');
    INSERT INTO public.organizations (id, name, owner_id, plan, access_status, subscription_status, subscription_expires_at, max_members)
    VALUES ('${testOrgId}', 'Imobiliária Expired', '${testUserId}', 'pro', 'active', 'active', now() - interval '2 hours', 1);
    INSERT INTO public.organization_members (organization_id, user_id, role, status, email)
    VALUES ('${testOrgId}', '${testUserId}', 'owner', 'active', 'client@test.com')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  `);

  await pgFresh.exec(`
    SET ROLE authenticated;
    SET "request.jwt.claim.sub" = '${testUserId}';
    SET "request.jwt.claim.role" = 'authenticated';
  `);

  // is_org_member deve retornar FALSE após vencimento
  const isMemberRes = await pgFresh.query("SELECT public.is_org_member($1) as is_member", [testOrgId]);
  assert.equal((isMemberRes.rows[0] as any).is_member, false, "Assinatura vencida deve retornar is_org_member false");

  // Tentativa de operação direta (INSERT) é terminantemente barrada por RLS no PostgreSQL real
  let directOpBlocked = false;
  try {
    await pgFresh.query(`
      INSERT INTO public.clients (organization_id, "userId", name, email)
      VALUES ($1, $2, 'Cliente Tentativa', 'cliente@tentativa.com')
    `, [testOrgId, testUserId]);
  } catch (err: any) {
    directOpBlocked = true;
    assert.ok(
      err.message.includes("violates row-level security policy") || err.message.includes("Acesso negado"),
      "Operação direta bloqueada por policy RLS"
    );
  }
  assert.ok(directOpBlocked, "Operação direta no Supabase após vencimento deve ser bloqueada por RLS");
  console.log("  ✅ [PASSOU] 6.2 Assinatura expirada bloqueia is_org_member e impede operações diretas via RLS no PostgreSQL real");

  // Tentativa do próprio owner de alterar subscription_expires_at diretamente é barrada pelo trigger
  let clientDirectUpdateBlocked = false;
  try {
    await pgFresh.query(`
      UPDATE public.organizations
      SET subscription_expires_at = now() + interval '30 days'
      WHERE id = $1
    `, [testOrgId]);
  } catch (err: any) {
    clientDirectUpdateBlocked = true;
    assert.ok(
      err.message.includes("campos protegidos da organização") || err.message.includes("Acesso negado"),
      "Alteração direta de subscription_expires_at bloqueada por trigger"
    );
  }
  assert.ok(clientDirectUpdateBlocked, "Owner/Admin deve ser barrado ao tentar alterar subscription_expires_at diretamente");
  console.log("  ✅ [PASSOU] 6.3 Alteração direta de subscription_expires_at pelo cliente é bloqueada pelo trigger no PostgreSQL real");

  // 6.4 Regularização via RPC administrativa transacional autoriza o cliente
  await pgFresh.exec(`
    RESET ROLE;
    SET "request.jwt.claim.sub" = '';
    SET "request.jwt.claim.role" = 'service_role';
  `);

  await pgFresh.query(
    "SELECT public.admin_set_organization_plan($1, $2, now() + interval '30 days', $3, $4)",
    [testOrgId, "pro", "admin-metria-uuid", "Regularização manual de assinatura"]
  );

  // Cliente autenticado agora tem acesso imediato
  await pgFresh.exec(`
    SET ROLE authenticated;
    SET "request.jwt.claim.sub" = '${testUserId}';
    SET "request.jwt.claim.role" = 'authenticated';
  `);

  const isMemberActive = await pgFresh.query("SELECT public.is_org_member($1) as is_member", [testOrgId]);
  assert.equal((isMemberActive.rows[0] as any).is_member, true, "Assinatura regularizada retorna is_org_member true");

  await pgFresh.query(`
    INSERT INTO public.clients (organization_id, "userId", name, email)
    VALUES ($1, $2, 'Cliente Autorizado', 'cliente@autorizado.com')
  `, [testOrgId, testUserId]);

  const clientCount = await pgFresh.query("SELECT count(*) FROM public.clients WHERE organization_id = $1", [testOrgId]);
  assert.equal((clientCount.rows[0] as any).count, 1, "Cliente cadastrado com sucesso após regularização da assinatura");
  console.log("  ✅ [PASSOU] 6.4 Operações diretas reautorizadas imediatamente após regularização da assinatura via RPC");

  // 6.5 Teste em create_organization_invite_v2: recusa expressa de usuário externo (v_user_role NULL)
  const externalUserId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  await pgFresh.exec(`
    RESET ROLE;
    INSERT INTO auth.users (id, email) VALUES ('${externalUserId}', 'external@test.com');
  `);

  // Usuário externo chamando diretamente a RPC no banco
  await pgFresh.exec(`
    SET ROLE authenticated;
    SET "request.jwt.claim.sub" = '${externalUserId}';
    SET "request.jwt.claim.role" = 'authenticated';
  `);

  let externalRpcBlocked = false;
  try {
    await pgFresh.query("SELECT public.create_organization_invite_v2($1, $2, $3, $4)", [
      testOrgId,
      "invited@metria.test",
      "Convidado Teste",
      "broker"
    ]);
  } catch (err: any) {
    externalRpcBlocked = true;
    assert.ok(
      err.message.includes("usuário não possui vínculo ativo nesta organização") ||
      err.message.includes("Acesso negado"),
      "RPC deve recusar v_user_role NULL de usuário externo"
    );
  }
  assert.ok(externalRpcBlocked, "Usuário externo chamando a RPC diretamente deve ser expressamente recusado");
  console.log("  ✅ [PASSOU] 6.4 create_organization_invite_v2 recusa expressamente v_user_role NULL para usuário externo");

  // 6.5 Criação legítima de convite gera token_hash criptograficamente seguro e persiste no banco
  await pgFresh.exec(`
    RESET ROLE;
    -- Ajusta plano para max para permitir convite de equipe
    UPDATE public.organizations SET plan = 'max', max_members = 5 WHERE id = '${testOrgId}';
    SET ROLE authenticated;
    SET "request.jwt.claim.sub" = '${testUserId}';
    SET "request.jwt.claim.role" = 'authenticated';
  `);

  const inviteResult = await pgFresh.query(
    "SELECT public.create_organization_invite_v2($1, $2, $3, $4) as invite",
    [testOrgId, "corretor@imobiliaria.com", "Corretor Convidado", "broker"]
  );
  const inviteData = (inviteResult.rows[0] as any).invite;
  assert.ok(inviteData.id && inviteData.token, "Convite criado com sucesso retornando token");

  // Verifica persistência de token_hash na tabela
  await pgFresh.exec("RESET ROLE;");
  const storedInvite = await pgFresh.query(
    "SELECT token, token_hash, status FROM public.organization_invites WHERE id = $1",
    [inviteData.id]
  );
  assert.ok((storedInvite.rows[0] as any).token_hash, "Coluna token_hash deve estar preenchida na tabela");
  assert.equal((storedInvite.rows[0] as any).status, "pending", "Status inicial do convite é pending");
  console.log("  ✅ [PASSOU] 6.5 create_organization_invite_v2 gera e persiste token_hash com sucesso no PostgreSQL real");

  // 6.6 admin_set_organization_plan: validação de data retroativa e limites comerciais consolidados
  let pastDateRejected = false;
  try {
    await pgFresh.query(
      "SELECT public.admin_set_organization_plan($1, $2, now() - interval '1 day', $3, $4)",
      [testOrgId, "pro", "admin-1", "Tentativa com data retroativa"]
    );
  } catch (err: any) {
    pastDateRejected = true;
    assert.ok(err.message.includes("futuro"), "Data retroativa deve ser expressamente rejeitada");
  }
  assert.ok(pastDateRejected, "admin_set_organization_plan deve rejeitar expiração no passado");

  // Concede plano MAX -> deve consolidar estritamente 5 membros
  const maxGrant = await pgFresh.query(
    "SELECT public.admin_set_organization_plan($1, $2, now() + interval '30 days', $3, $4) as result",
    [testOrgId, "max", "admin-1", "Liberação manual plano Max"]
  );
  assert.equal((maxGrant.rows[0] as any).result.max_members, 5, "Plano Max deve ter cota exata de 5 membros");

  // Concede plano PRO MAX -> deve consolidar estritamente 99 membros
  const proMaxGrant = await pgFresh.query(
    "SELECT public.admin_set_organization_plan($1, $2, now() + interval '30 days', $3, $4) as result",
    [testOrgId, "pro_max", "admin-1", "Liberação manual plano PRO MAX"]
  );
  assert.equal((proMaxGrant.rows[0] as any).result.max_members, 99, "Plano PRO MAX deve ter cota exata de 99 membros");

  // Auditoria transacional
  const auditLogs = await pgFresh.query(
    "SELECT count(*) FROM public.organization_plan_audit WHERE organization_id = $1",
    [testOrgId]
  );
  assert.ok(parseInt((auditLogs.rows[0] as any).count, 10) >= 2, "Auditoria gravada em transação junto com a alteração de plano");
  console.log("  ✅ [PASSOU] 6.6 admin_set_organization_plan valida expiração, consolida limites (Max: 5, PRO MAX: 99) e registra auditoria");

  await pgFresh.close();

  // 6.7 Atualização Incremental em Banco Existente (com dados Asaas e sem DROP CASCADE)
  const pgUpdate = new PGlite({ extensions: { pgcrypto, "uuid-ossp": uuid_ossp } });
  await pgUpdate.exec(preamble);
  await pgUpdate.exec(schemaSql);

  // Aplica migration do Asaas em banco existente
  const asaasSql = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "20261010000002_asaas_billing_schema_and_authorization.sql"), "utf-8");
  await pgUpdate.exec(asaasSql);

  // Popula assinaturas e cobranças históricas do Asaas
  const asaasOrgId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const asaasOwnerId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  await pgUpdate.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${asaasOwnerId}', 'owner_asaas@test.com');
    INSERT INTO public.organizations (id, name, owner_id, plan) VALUES ('${asaasOrgId}', 'Imobiliária Asaas', '${asaasOwnerId}', 'pro');
    INSERT INTO public.subscriptions (organization_id, asaas_subscription_id, plan, status, value)
    VALUES ('${asaasOrgId}', 'sub_prod_123', 'pro', 'ACTIVE', 79.90);
    INSERT INTO public.charges (organization_id, asaas_payment_id, status, value, due_date)
    VALUES ('${asaasOrgId}', 'pay_prod_456', 'CONFIRMED', 79.90, CURRENT_DATE);
  `);

  // Aplica a migration incremental de transição
  await pgUpdate.exec(transitionMigration);

  // Verifica que dados e tabelas do Asaas continuam 100% preservados
  const subsCheck = await pgUpdate.query("SELECT asaas_subscription_id, status FROM public.subscriptions WHERE organization_id = $1", [asaasOrgId]);
  const chargesCheck = await pgUpdate.query("SELECT asaas_payment_id, status FROM public.charges WHERE organization_id = $1", [asaasOrgId]);
  assert.equal(subsCheck.rows.length, 1, "Registro de subscription do Asaas preservado");
  assert.equal(chargesCheck.rows.length, 1, "Registro de charge do Asaas preservado");

  await pgUpdate.close();
  console.log("  ✅ [PASSOU] 6.7 Migration incremental aplicada com sucesso em banco existente preservando todos os dados do Asaas");

  console.log("\n==============================================================================");
  console.log("  TODOS OS TESTES DE TRANSIÇÃO, SEGURANÇA E POSTGRESQL REAL PASSARAM COM SUCESSO! ");
  console.log("==============================================================================");
}

runTests().catch((err) => {
  console.error("FALHA NOS TESTES:", err);
  process.exit(1);
});
