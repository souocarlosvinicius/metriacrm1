import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

async function runStep12Tests() {
  console.log("=== INICIANDO TESTES DO PASSO 12: SINCRONIZAÇÃO DE PLANO E ISOLAMENTO DE ORGANIZAÇÕES ===");

  // ----------------------------------------------------------------------------
  // 1. GARANTIAS DE CÓDIGO FONTE (ANÁLISE ESTÁTICA)
  // ----------------------------------------------------------------------------
  console.log("\n--- 1. Análise Estática de Código em SettingsView e App ---");

  const settingsViewPath = path.resolve(process.cwd(), "src/components/SettingsView.tsx");
  const appPath = path.resolve(process.cwd(), "src/App.tsx");

  const settingsViewCode = fs.readFileSync(settingsViewPath, "utf-8");
  const appCode = fs.readFileSync(appPath, "utf-8");

  // Regra 1: Não use Beta como plano confirmado enquanto dados carregam
  assert.ok(
    !settingsViewCode.includes('useState<"beta" | "start" | "pro" | "max" | "pro_max">("beta")'),
    "SettingsView não deve inicializar orgPlan com 'beta' como fallback estático."
  );
  assert.ok(
    settingsViewCode.includes("Carregando...") && settingsViewCode.includes("isPlanLoading"),
    "SettingsView deve apresentar estado de carregamento explícito e desabilitar botões durante a consulta."
  );
  assert.ok(
    settingsViewCode.includes("Tentar Novamente"),
    "SettingsView deve apresentar ação de retry caso a consulta falhe, sem mascarar como Beta."
  );

  // Regra 2: Unificar ID da organização ativa
  assert.ok(
    settingsViewCode.includes("effectiveOrgId") &&
    settingsViewCode.includes("activeOrgId || currentOrg?.id || currentUser.defaultOrganizationId"),
    "SettingsView deve utilizar effectiveOrgId unificado em todas as chamadas e consultas."
  );
  assert.ok(
    settingsViewCode.includes("/api/organizations/${effectiveOrgId}/change-plan") &&
    settingsViewCode.includes("/api/organizations/${effectiveOrgId}/plan-changes"),
    "SettingsView deve utilizar effectiveOrgId unificado para alteração de plano e histórico."
  );
  assert.ok(
    appCode.includes("activeOrgId={currentOrg?.id || currentUser?.defaultOrganizationId") ||
    appCode.includes("activeOrgId={currentOrg?.id"),
    "App.tsx deve repassar o ID da organização ativa unificado para o SettingsView."
  );

  // Regra 3: Não escolher silenciosamente orgs[0] quando o ID esperado não for encontrado
  assert.ok(
    !appCode.includes("orgs.find((o: any) => o.id === orgId) || orgs[0]") &&
    !appCode.includes("orgs.find((o: any) => o.id === expectedOrgId) || orgs[0]"),
    "App.tsx não deve fazer fallback silencioso para orgs[0] quando a organização esperada não for encontrada."
  );
  assert.ok(
    appCode.includes("setOrgInconsistencyError"),
    "App.tsx deve registrar inconsistência de organização explicitamente em caso de ID divergente."
  );

  // Regra 4: Depois da troca, releia a mesma organização e confirme plano e datas persistidos
  assert.ok(
    !settingsViewCode.includes("const confirmedPlan = data.new_plan || data.plan || targetPlan"),
    "SettingsView NÃO deve utilizar targetPlan como fallback de confirmação sem releitura do banco."
  );
  assert.ok(
    settingsViewCode.includes("persistedPlan !== targetPlan") &&
    settingsViewCode.includes("verifiedOrgs.find"),
    "SettingsView deve reler a organização do banco e rejeitar caso o plano persistido não corresponda ao solicitado."
  );

  // Regra 5: Preservar prazo de 30 dias ao atualizar página e ao sair/entrar
  assert.ok(
    settingsViewCode.includes("nextPlanChangeAt") &&
    settingsViewCode.includes("is30DayBlockActive"),
    "SettingsView deve manter cálculo de 30 dias ativo a partir de nextPlanChangeAt."
  );

  console.log("✓ Garantias de código fonte (Regras 1 a 5) validadas com sucesso.");

  // ----------------------------------------------------------------------------
  // 2. TESTES DE BANCO DE DADOS E ISOLAMENTO (PGlite)
  // ----------------------------------------------------------------------------
  console.log("\n--- 2. Testes de Banco de Dados: Isolamento de Organizações com Nomes Iguais ---");

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

  const ownerId = "a1111111-1111-1111-1111-111111111111";
  const orgMaxId = "ce9f948f-7462-47d8-8710-29d97b86edf4";
  const orgBetaId = "11111111-2222-3333-4444-555555555555";
  const sharedOrgName = "Imobiliária Alvorada"; // Mesmo nome!

  // Cria usuário titular (trigger on_auth_user_created cria profile automaticamente)
  await pg.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ownerId}', 'titular@alvorada.com');
  `);

  // Regra 6: Inserir duas organizações com NOMES IGUAIS e IDs DIFERENTES
  // Org 1: ce9f948f-7462-47d8-8710-29d97b86edf4 no Max, com datas de plano preenchidas
  const planChangedAt = new Date().toISOString();
  const nextPlanChangeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await pg.exec(`
    INSERT INTO public.organizations (id, name, owner_id, plan, max_members, access_status, plan_changed_at, next_plan_change_at)
    VALUES ('${orgMaxId}', '${sharedOrgName}', '${ownerId}', 'max', 5, 'active', '${planChangedAt}', '${nextPlanChangeAt}');

    INSERT INTO public.organization_members (organization_id, user_id, role, status, email)
    VALUES ('${orgMaxId}', '${ownerId}', 'owner', 'active', 'titular@alvorada.com')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  `);

  // Org 2: 11111111-2222-3333-4444-555555555555 no Beta com MESMO NOME
  await pg.exec(`
    INSERT INTO public.organizations (id, name, owner_id, plan, max_members, access_status)
    VALUES ('${orgBetaId}', '${sharedOrgName}', '${ownerId}', 'beta', 1, 'active');

    INSERT INTO public.organization_members (organization_id, user_id, role, status, email)
    VALUES ('${orgBetaId}', '${ownerId}', 'owner', 'active', 'titular@alvorada.com')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  `);

  // Vincula default_organization_id da conta ao org Max
  await pg.exec(`
    UPDATE public.profiles 
    SET default_organization_id = '${orgMaxId}', name = 'Titular Alvorada'
    WHERE id = '${ownerId}';
  `);

  // Registra alteração histórica para a organização Max
  await pg.exec(`
    INSERT INTO public.organization_plan_changes (
      organization_id, user_id, previous_plan, new_plan, next_allowed_change_at, price, idempotency_key
    ) VALUES (
      '${orgMaxId}', '${ownerId}', 'beta', 'max', '${nextPlanChangeAt}', 149.90, 'test-idemp-max'
    );
  `);

  console.log("✓ Organizações com nomes idênticos e IDs distintos criadas com sucesso.");

  // Teste 2.1: Consulta da organização ce9f948f-7462-47d8-8710-29d97b86edf4
  const resMax = await pg.query<{ id: string; name: string; plan: string; next_plan_change_at: string; plan_changed_at: string }>(`
    SELECT id, name, plan, next_plan_change_at, plan_changed_at
    FROM public.organizations 
    WHERE id = '${orgMaxId}';
  `);

  assert.equal(resMax.rows.length, 1);
  assert.equal(resMax.rows[0].id, orgMaxId);
  assert.equal(resMax.rows[0].name, sharedOrgName);
  assert.equal(resMax.rows[0].plan, "max", "A organização ce9f948f... deve estar no plano Max.");
  assert.ok(
    resMax.rows[0].next_plan_change_at,
    "next_plan_change_at deve estar preenchido para a organização no plano Max."
  );
  assert.ok(
    new Date(resMax.rows[0].next_plan_change_at).getTime() > Date.now(),
    "Prazo de 30 dias deve estar vigente no futuro."
  );

  // Teste 2.2: Consulta da organização 11111111-2222-3333-4444-555555555555
  const resBeta = await pg.query<{ id: string; name: string; plan: string; next_plan_change_at: string }>(`
    SELECT id, name, plan, next_plan_change_at 
    FROM public.organizations 
    WHERE id = '${orgBetaId}';
  `);

  assert.equal(resBeta.rows.length, 1);
  assert.equal(resBeta.rows[0].id, orgBetaId);
  assert.equal(resBeta.rows[0].name, sharedOrgName);
  assert.equal(resBeta.rows[0].plan, "beta", "A organização 11111111... deve estar no plano Beta.");
  assert.equal(resBeta.rows[0].next_plan_change_at, null, "Organização inicial não alterada deve ter next_plan_change_at nulo.");

  // Teste 2.3: Consulta com ID inexistente
  const missingId = "99999999-9999-9999-9999-999999999999";
  const resMissing = await pg.query(`
    SELECT id FROM public.organizations WHERE id = '${missingId}';
  `);
  assert.equal(resMissing.rows.length, 0, "ID não encontrado não deve retornar linhas.");

  // Teste 2.4: Ambas as organizações continuam existindo sem união ou exclusão automática
  const totalOrgs = await pg.query<{ count: string }>(`
    SELECT COUNT(*) as count FROM public.organizations;
  `);
  assert.equal(Number(totalOrgs.rows[0].count), 2, "As duas organizações devem permanecer intactas no banco.");

  console.log("✓ Testes no PostgreSQL (PGlite) concluídos com 100% de sucesso.");
  console.log("\n========================================================");
  console.log("TODAS AS VALIDAÇÕES DO PASSO 12 FORAM CONCLUÍDAS COM SUCESSO!");
  console.log("========================================================\n");
}

runStep12Tests().catch((err) => {
  console.error("Falha no teste do Passo 12:", err);
  process.exit(1);
});
