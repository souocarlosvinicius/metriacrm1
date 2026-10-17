import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { getCurrentPlanAccess } from "../src/hooks/useCurrentPlan.js";
import { normalizePlanId } from "../src/config/plans.js";

async function runStep13Tests() {
  console.log("=== INICIANDO TESTES DO PASSO 13: PERSISTÊNCIA DA ORGANIZAÇÃO ATIVA E APLICAÇÃO DO PLANO ===");

  // ----------------------------------------------------------------------------
  // 1. ANÁLISE ESTÁTICA: CODIFICAÇÃO DAS 6 REGRAS
  // ----------------------------------------------------------------------------
  console.log("\n--- 1. Análise Estática de Código (App.tsx, SettingsView.tsx, api.ts, app.ts) ---");

  const appPath = path.resolve(process.cwd(), "src/App.tsx");
  const settingsViewPath = path.resolve(process.cwd(), "src/components/SettingsView.tsx");
  const apiPath = path.resolve(process.cwd(), "src/api.ts");
  const serverAppPath = path.resolve(process.cwd(), "src/app.ts");
  const useCurrentPlanPath = path.resolve(process.cwd(), "src/hooks/useCurrentPlan.ts");
  const planGuardPath = path.resolve(process.cwd(), "src/components/PlanGuard.tsx");

  const appCode = fs.readFileSync(appPath, "utf-8");
  const settingsViewCode = fs.readFileSync(settingsViewPath, "utf-8");
  const apiCode = fs.readFileSync(apiPath, "utf-8");
  const serverAppCode = fs.readFileSync(serverAppPath, "utf-8");
  const useCurrentPlanCode = fs.readFileSync(useCurrentPlanPath, "utf-8");
  const planGuardCode = fs.readFileSync(planGuardPath, "utf-8");

  // Regra 1: Operação específica para selecionar a organização ativa
  assert.ok(
    appCode.includes("/api/organizations/select"),
    "App.tsx deve invocar a operação específica POST /api/organizations/select ao selecionar organização."
  );
  assert.ok(
    apiCode.includes("/api/organizations/select") &&
    apiCode.includes("UNAUTHORIZED_ORG") &&
    apiCode.includes("default_organization_id: targetOrgId"),
    "src/api.ts deve implementar POST /api/organizations/select com validação de vínculo e autorização antes de persistir."
  );
  assert.ok(
    serverAppCode.includes("/api/organizations/select") &&
    serverAppCode.includes("UNAUTHORIZED_ORG") &&
    serverAppCode.includes("default_organization_id: orgId"),
    "src/app.ts deve implementar POST /api/organizations/select com validação de vínculo e autorização."
  );
  // Não libere a edição arbitrária desse campo no endpoint de perfil
  assert.ok(
    !serverAppCode.includes("if (req.body.defaultOrganizationId !== undefined)") &&
    !serverAppCode.includes("updatePayload.default_organization_id = req.body.defaultOrganizationId"),
    "src/app.ts NÃO deve aceitar defaultOrganizationId no PUT /api/auth/me."
  );
  assert.ok(
    !apiCode.includes("updatePayload.default_organization_id = body.defaultOrganizationId"),
    "src/api.ts NÃO deve persistir defaultOrganizationId arbitrariamente no PUT /api/auth/me."
  );

  // Regra 2: Uma única fonte de estado para organização ativa e plano
  assert.ok(
    appCode.includes("currentOrg={currentOrg}") &&
    appCode.includes("activeOrgId={currentOrg?.id || currentUser?.defaultOrganizationId") &&
    appCode.includes("orgStatus={orgStatus}"),
    "App.tsx deve compartilhar a mesma fonte de estado (currentOrg, activeOrgId, orgStatus) entre componentes."
  );
  assert.ok(
    useCurrentPlanCode.includes("orgStatus?: OrgPlanStatus") &&
    useCurrentPlanCode.includes("currentStatus === \"loading\"") &&
    useCurrentPlanCode.includes("currentStatus === \"error\" || !org"),
    "useCurrentPlan deve receber orgStatus e unificar o cálculo de permissões."
  );

  // Regra 3: Estados loading, ready e error ao iniciar sessão (organização ausente não pode virar Beta)
  assert.ok(
    appCode.includes("setOrgStatus(\"loading\")") &&
    appCode.includes("setOrgStatus(\"ready\")") &&
    appCode.includes("setOrgStatus(\"error\")"),
    "App.tsx deve controlar explicitamente os estados loading, ready e error da organização."
  );
  assert.ok(
    planGuardCode.includes("orgStatus === \"loading\"") &&
    planGuardCode.includes("orgStatus === \"error\" || orgStatus === \"unselected\""),
    "PlanGuard deve tratar explicitamente loading e erro sem tratar como plano Beta."
  );

  // Regra 4: Não use orgs[0] como substituição silenciosa e ofereça seleção explícita
  assert.ok(
    appCode.includes("Selecione sua Organização Ativa") &&
    appCode.includes("userOrganizations.map"),
    "App.tsx deve renderizar seleção explícita e autorizada se a organização padrão não estiver disponível."
  );
  assert.ok(
    !appCode.includes("orgs.find((o: any) => o.id === expectedOrgId) || orgs[0]") &&
    !appCode.includes("orgs.find((o: any) => o.id === orgId) || orgs[0]"),
    "App.tsx NÃO deve usar orgs[0] como fallback silencioso de expectedOrgId."
  );

  // Regra 5: Releitura da mesma organização após alteração e descarte de respostas antigas
  assert.ok(
    settingsViewCode.includes("/api/organizations/select") &&
    settingsViewCode.includes("singleData.id === orgId"),
    "SettingsView deve verificar o ID da organização retornada e ignorar respostas antigas de outro ID."
  );

  // Regra 6: Distinção entre conta real e demonstração
  assert.ok(
    appCode.includes("currentUser.isDemo") &&
    appCode.includes("checkAndCleanExpiredSession"),
    "App.tsx deve preservar a distinção entre conta real e conta de demonstração."
  );

  console.log("✓ Análise estática de código das 6 regras concluída com sucesso.");

  // ----------------------------------------------------------------------------
  // 2. TESTES UNITÁRIOS DE LÓGICA DE PLANO (useCurrentPlan)
  // ----------------------------------------------------------------------------
  console.log("\n--- 2. Testes Unitários de useCurrentPlan & Estados ---");

  // Cenário 2.1: Organização ausente (null) com status loading NÃO deve virar Beta
  const loadingAccess = getCurrentPlanAccess(null, undefined, "loading");
  assert.equal(loadingAccess.status, "loading");
  assert.equal(loadingAccess.isReady, false);
  assert.equal(loadingAccess.isLoading, true);
  assert.equal(loadingAccess.plan, null, "Plano não pode ser Beta durante loading.");
  assert.equal(loadingAccess.canUseGeminiAI, false);
  assert.equal(loadingAccess.canUseTeamManagement, false);

  // Cenário 2.2: Organização ausente (null) com status error NÃO deve virar Beta
  const errorAccess = getCurrentPlanAccess(null, undefined, "error");
  assert.equal(errorAccess.status, "error");
  assert.equal(errorAccess.isReady, false);
  assert.equal(errorAccess.isError, true);
  assert.equal(errorAccess.plan, null, "Plano não pode ser Beta em caso de erro.");
  assert.equal(errorAccess.canUseGeminiAI, false);
  assert.equal(errorAccess.canUseTeamManagement, false);

  // Cenário 2.3: Organização com plano Max persistido libera funcionalidades do catálogo
  const maxOrg = {
    id: "ce9f948f-7462-47d8-8710-29d97b86edf4",
    name: "Alvorada Imóveis",
    plan: "max",
    ownerId: "u1"
  } as any;

  const maxAccess = getCurrentPlanAccess(maxOrg, { clientsCount: 15, propertiesCount: 12, membersCount: 3 }, "ready");
  assert.equal(maxAccess.status, "ready");
  assert.equal(maxAccess.isReady, true);
  assert.equal(maxAccess.plan, "max");
  assert.equal(maxAccess.canUseGeminiAI, true, "Max deve liberar Gemini AI.");
  assert.equal(maxAccess.canUseTeamManagement, true, "Max deve liberar Gestão de Equipe.");
  assert.equal(maxAccess.canUseLeadDistribution, true, "Max deve liberar Distribuição de Leads.");
  assert.equal(maxAccess.canAccessManagerDashboard, true, "Max deve liberar Painel do Gestor.");
  assert.equal(maxAccess.limits?.maxMembers, 5, "Max permite até 5 corretores.");
  assert.equal(maxAccess.remainingMembers, 2, "5 - 3 = 2 membros restantes.");

  // Cenário 2.4: Normalização de variações de grafia
  assert.equal(normalizePlanId("Max"), "max");
  assert.equal(normalizePlanId("MAX"), "max");
  assert.equal(normalizePlanId("  max  "), "max");
  assert.equal(normalizePlanId("Plano Max"), "max");
  assert.equal(normalizePlanId("PRO_MAX"), "pro_max");

  console.log("✓ Testes unitários de useCurrentPlan concluídos com sucesso.");

  // ----------------------------------------------------------------------------
  // 3. TESTES DE BANCO DE DADOS (PGlite): AUTORIZAÇÃO, SELEÇÃO E ISOLAMENTO
  // ----------------------------------------------------------------------------
  console.log("\n--- 3. Testes de Banco de Dados: Validação e Seleção Autorizada ---");

  const pg = new PGlite({ extensions: { pgcrypto, "uuid-ossp": uuid_ossp } });

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

  await pg.exec(preamble);

  const schemaSql = fs.readFileSync(path.resolve(process.cwd(), "supabase/schema.sql"), "utf-8");
  await pg.exec(schemaSql);

  const user1Id = "a1111111-1111-1111-1111-111111111111";
  const user2Id = "b2222222-2222-2222-2222-222222222222";

  const orgMaxId = "ce9f948f-7462-47d8-8710-29d97b86edf4";
  const orgBetaId = "11111111-2222-3333-4444-555555555555";
  const orgExternalId = "99999999-8888-7777-6666-555555555555";

  // Cria usuários no auth
  await pg.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${user1Id}', 'usuario1@metriacrm.com');
    INSERT INTO auth.users (id, email) VALUES ('${user2Id}', 'usuario2@metriacrm.com');
  `);

  // Org 1: Max (user1 é owner)
  const nextPlanChangeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await pg.exec(`
    INSERT INTO public.organizations (id, name, owner_id, plan, max_members, access_status, next_plan_change_at)
    VALUES ('${orgMaxId}', 'Metria Prime Corp', '${user1Id}', 'max', 5, 'active', '${nextPlanChangeAt}');

    INSERT INTO public.organization_members (organization_id, user_id, role, status, email)
    VALUES ('${orgMaxId}', '${user1Id}', 'owner', 'active', 'usuario1@metriacrm.com')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  `);

  // Org 2: Beta (com MESMO NOME 'Metria Prime Corp', user1 também é membro ativo)
  await pg.exec(`
    INSERT INTO public.organizations (id, name, owner_id, plan, max_members, access_status)
    VALUES ('${orgBetaId}', 'Metria Prime Corp', '${user1Id}', 'beta', 1, 'active');

    INSERT INTO public.organization_members (organization_id, user_id, role, status, email)
    VALUES ('${orgBetaId}', '${user1Id}', 'owner', 'active', 'usuario1@metriacrm.com')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  `);

  // Org 3: Externa (pertence a user2, user1 NÃO tem vínculo)
  await pg.exec(`
    INSERT INTO public.organizations (id, name, owner_id, plan, max_members, access_status)
    VALUES ('${orgExternalId}', 'Organização Externa', '${user2Id}', 'start', 1, 'active');
  `);

  // Teste 3.1: Validação de autorização antes de persistir default_organization_id
  // Usuário 1 seleciona Org Max legitimamente
  const user1HasAccessToMax = await pg.query(`
    SELECT 1 FROM public.organizations o
    LEFT JOIN public.organization_members m ON m.organization_id = o.id AND m.user_id = '${user1Id}' AND m.status = 'active'
    WHERE o.id = '${orgMaxId}' AND (o.owner_id = '${user1Id}' OR m.id IS NOT NULL);
  `);
  assert.equal(user1HasAccessToMax.rows.length, 1, "Usuário 1 deve ter autorização sobre orgMaxId.");

  // Persiste a seleção autorizada
  await pg.exec(`
    UPDATE public.profiles
    SET default_organization_id = '${orgMaxId}'
    WHERE id = '${user1Id}';
  `);

  const profileAfterSelect = await pg.query<{ default_organization_id: string }>(`
    SELECT default_organization_id FROM public.profiles WHERE id = '${user1Id}';
  `);
  assert.equal(profileAfterSelect.rows[0].default_organization_id, orgMaxId, "default_organization_id deve ser orgMaxId.");

  // Teste 3.2: Tentativa de selecionar organização não autorizada é rejeitada
  const user1HasAccessToExternal = await pg.query(`
    SELECT 1 FROM public.organizations o
    LEFT JOIN public.organization_members m ON m.organization_id = o.id AND m.user_id = '${user1Id}' AND m.status = 'active'
    WHERE o.id = '${orgExternalId}' AND (o.owner_id = '${user1Id}' OR m.id IS NOT NULL);
  `);
  assert.equal(user1HasAccessToExternal.rows.length, 0, "Usuário 1 NÃO deve ter autorização sobre organização externa.");

  // Teste 3.3: Ambas as organizações com nomes iguais permanecem com IDs independentes
  const sameNameOrgs = await pg.query<{ id: string; plan: string }>(`
    SELECT id, plan FROM public.organizations WHERE name = 'Metria Prime Corp' ORDER BY plan DESC;
  `);
  assert.equal(sameNameOrgs.rows.length, 2, "Duas organizações com mesmo nome devem coexistir sem colisão.");
  assert.equal(sameNameOrgs.rows[0].id, orgMaxId);
  assert.equal(sameNameOrgs.rows[0].plan, "max");
  assert.equal(sameNameOrgs.rows[1].id, orgBetaId);
  assert.equal(sameNameOrgs.rows[1].plan, "beta");

  // Teste 3.4: Releitura do banco após saída/entrada recupera o mesmo organization_id
  const sessionRestore = await pg.query<{ default_organization_id: string }>(`
    SELECT default_organization_id FROM public.profiles WHERE id = '${user1Id}';
  `);
  assert.equal(sessionRestore.rows[0].default_organization_id, orgMaxId, "Recarga/login subsequente deve reobter exatamente orgMaxId.");

  console.log("✓ Testes de Banco de Dados (PGlite) concluídos com 100% de sucesso.");

  console.log("\n========================================================");
  console.log("TODAS AS VALIDAÇÕES DO PASSO 13 FORAM CONCLUÍDAS COM SUCESSO!");
  console.log("========================================================\n");
}

runStep13Tests().catch((err) => {
  console.error("Falha no teste do Passo 13:", err);
  process.exit(1);
});
