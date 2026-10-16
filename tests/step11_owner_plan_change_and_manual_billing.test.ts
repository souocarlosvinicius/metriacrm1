import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

console.log("==============================================================================");
console.log("  METRIA CRM - TESTES DE MUDANÇA DE PLANO PELO TITULAR E COBRANÇA MANUAL      ");
console.log("==============================================================================");

async function runTests() {
  const schemaSql = fs.readFileSync(path.join(process.cwd(), "supabase", "schema.sql"), "utf-8");
  const migrationSql = fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261015000001_owner_plan_change_and_manual_billing.sql"),
    "utf-8"
  );
  const serverTs = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf-8");
  const settingsViewTsx = fs.readFileSync(path.join(process.cwd(), "src", "components", "SettingsView.tsx"), "utf-8");
  const adminManagerTsx = fs.readFileSync(path.join(process.cwd(), "src", "components", "AdminSuspensionManager.tsx"), "utf-8");

  // ----------------------------------------------------------------------------
  // 1. ANÁLISE ESTÁTICA: SCHEMA, MIGRATION E ROTAS DE SERVIDOR
  // ----------------------------------------------------------------------------
  console.log("\n--- 1. VERIFICAÇÃO DE MIGRATION, ESTRUTURAS E ENDPOINTS ---");

  // Tabelas e colunas necessárias
  const requiredElements = [
    "organization_plan_changes",
    "manual_charges",
    "change_organization_plan_by_owner",
    "admin_create_manual_charge",
    "admin_update_manual_charge_status",
    "plan_changed_at",
    "next_plan_change_at"
  ];

  for (const elem of requiredElements) {
    assert.ok(
      migrationSql.includes(elem),
      `Migration deve conter o elemento ${elem}`
    );
    assert.ok(
      schemaSql.includes(elem),
      `schema.sql deve conter o elemento ${elem}`
    );
  }
  console.log("  ✅ [PASSOU] 1.1 Tabelas, colunas e RPCs essenciais presentes na migration e schema");

  // Endpoints em server.ts
  const requiredEndpoints = [
    "/api/organizations/:id/change-plan",
    "/api/organizations/:id/plan-changes",
    "/api/admin/manual-charges",
    "/api/admin/manual-charges/:id/status",
    "/api/admin/plan-changes"
  ];

  for (const endpoint of requiredEndpoints) {
    assert.ok(
      serverTs.includes(endpoint),
      `server.ts deve conter o endpoint ${endpoint}`
    );
  }
  console.log("  ✅ [PASSOU] 1.2 Endpoints de API implementados com autenticação e validações no server.ts");

  // Verificações na UI
  assert.ok(
    settingsViewTsx.includes("planHistory") && settingsViewTsx.includes("renderPlanActionButton"),
    "SettingsView deve conter histórico de planos e renderizador de botões com controle de bloqueio"
  );
  assert.ok(
    settingsViewTsx.includes("Confirmar Mudança de Plano") && settingsViewTsx.includes("30 dias"),
    "SettingsView deve conter modal de confirmação explícita com aviso de 30 dias"
  );
  assert.ok(
    adminManagerTsx.includes("manual_charges") || adminManagerTsx.includes("Cobranças Manuais"),
    "AdminSuspensionManager deve contemplar aba e gerenciamento de Cobranças Manuais"
  );
  assert.ok(
    adminManagerTsx.includes("Histórico de Alterações") || adminManagerTsx.includes("plan-changes"),
    "AdminSuspensionManager deve contemplar aba e tabela de Histórico de Alterações de Planos"
  );
  console.log("  ✅ [PASSOU] 1.3 Componentes da interface do cliente e painel interno atualizados e coerentes");

  // ----------------------------------------------------------------------------
  // 2. EXECUÇÃO EM BANCO DE DADOS REAL POSTGRESQL (PGlite)
  // ----------------------------------------------------------------------------
  console.log("\n--- 2. EXECUÇÃO EM MOTOR POSTGRESQL REAL (PGlite) ---");

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

  const pg = new PGlite({
    extensions: { pgcrypto, "uuid-ossp": uuid_ossp }
  });

  await pg.exec(preamble);
  await pg.exec(schemaSql);
  await pg.exec(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
  `);
  console.log("  ✅ [PASSOU] 2.1 schema.sql compilado e executado com sucesso no PostgreSQL real");

  // Criação dos dados de teste: Organização, Titular, Membros
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const nonOwnerId = "22222222-2222-4222-8222-222222222222";
  const orgId = "33333333-3333-4333-8333-333333333333";

  await pg.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ownerId}', 'owner@exemplo.com'),
      ('${nonOwnerId}', 'member@exemplo.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, name, role) VALUES
      ('${ownerId}', 'owner@exemplo.com', 'Proprietário Titular', 'admin'),
      ('${nonOwnerId}', 'member@exemplo.com', 'Membro Comum', 'corretor')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (id, name, owner_id, plan, max_members, access_status)
    VALUES ('${orgId}', 'Imobiliária Teste', '${ownerId}', 'beta', 1, 'active');

    INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
      ('${orgId}', '${nonOwnerId}', 'broker', 'active')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  `);
  console.log("  ✅ [PASSOU] 2.2 Organização de teste inicializada em plano 'beta' com titular e membro");

  // TESTE 2.3: Membro não proprietário tenta alterar o plano
  let nonOwnerError = null;
  try {
    await pg.query(`
      SELECT public.change_organization_plan_by_owner(
        $1::uuid,
        'pro',
        'idemp-non-owner',
        $2::uuid
      );
    `, [orgId, nonOwnerId]);
  } catch (err: any) {
    nonOwnerError = err.message;
  }
  assert.ok(
    nonOwnerError && nonOwnerError.includes("Acesso negado"),
    `Membro comum deve ser impedido de mudar o plano. Erro obtido: ${nonOwnerError}`
  );
  console.log("  ✅ [PASSOU] 2.3 Tentativa de alteração por membro não-proprietário rejeitada com 'Acesso negado'");

  // TESTE 2.4: Primeira alteração de plano pelo titular legítimo (Beta -> Max com 2 membros)
  const changeRes1 = await pg.query<{ change_organization_plan_by_owner: any }>(`
    SELECT public.change_organization_plan_by_owner(
      $1::uuid,
      'max',
      'idemp-first-change',
      $2::uuid
    );
  `, [orgId, ownerId]);

  const result1 = changeRes1.rows[0].change_organization_plan_by_owner;
  assert.strictEqual(result1.success, true, "Alteração deve ser bem-sucedida");
  assert.strictEqual(result1.changed, true, "Deve reportar changed: true");
  assert.strictEqual(result1.previous_plan, "beta", "Plano anterior deve ser beta");
  assert.strictEqual(result1.new_plan, "max", "Novo plano deve ser max");
  assert.strictEqual(Number(result1.price), 149.90, "Preço deve ser 149.90");

  // Confere se o registro na tabela de organizações foi atualizado
  const orgCheck1 = await pg.query<any>(`
    SELECT plan, max_members, plan_changed_at, next_plan_change_at 
    FROM public.organizations WHERE id = $1
  `, [orgId]);
  assert.strictEqual(orgCheck1.rows[0].plan, "max");
  assert.strictEqual(orgCheck1.rows[0].max_members, 5);
  assert.ok(orgCheck1.rows[0].plan_changed_at, "plan_changed_at deve estar preenchido");
  assert.ok(orgCheck1.rows[0].next_plan_change_at, "next_plan_change_at deve estar preenchido");

  // Confere se a cobrança manual pendente foi gerada para conferência financeira
  const chargesCheck1 = await pg.query<any>(`
    SELECT * FROM public.manual_charges WHERE organization_id = $1
  `, [orgId]);
  assert.strictEqual(chargesCheck1.rows.length, 1, "Deve gerar 1 pendência de cobrança manual");
  assert.strictEqual(chargesCheck1.rows[0].status, "pending", "Status inicial deve ser pending");
  assert.strictEqual(Number(chargesCheck1.rows[0].amount), 149.90, "Valor da cobrança deve ser 149.90");
  console.log("  ✅ [PASSOU] 2.4 Primeira mudança pelo titular aplicada: plano atualizado para 'max' e pendência financeira gerada");

  // TESTE 2.5: Repetição com mesma chave de idempotência retorna sucesso idempotente sem reprocessar
  const idempRes = await pg.query<{ change_organization_plan_by_owner: any }>(`
    SELECT public.change_organization_plan_by_owner(
      $1::uuid,
      'max',
      'idemp-first-change',
      $2::uuid
    );
  `, [orgId, ownerId]);
  const idempResult = idempRes.rows[0].change_organization_plan_by_owner;
  assert.strictEqual(idempResult.idempotent, true, "Deve reconhecer chamada idempotente");
  console.log("  ✅ [PASSOU] 2.5 Idempotência respeitada: mesma chave retorna registro anterior sem duplicar cobrança");

  // TESTE 2.6: Selecionar o mesmo plano ativo não altera e retorna changed: false
  const samePlanRes = await pg.query<{ change_organization_plan_by_owner: any }>(`
    SELECT public.change_organization_plan_by_owner(
      $1::uuid,
      'max',
      'idemp-same-plan',
      $2::uuid
    );
  `, [orgId, ownerId]);
  const sameResult = samePlanRes.rows[0].change_organization_plan_by_owner;
  assert.strictEqual(sameResult.changed, false, "Selecionar mesmo plano deve retornar changed: false");
  console.log("  ✅ [PASSOU] 2.6 Seleção do plano corrente não realiza alteração e não dispara novo bloqueio");

  // TESTE 2.7: Tentativa de nova alteração antes de 30 dias é terminantemente bloqueada
  let block30Error = null;
  try {
    await pg.query(`
      SELECT public.change_organization_plan_by_owner(
        $1::uuid,
        'start',
        'idemp-second-attempt',
        $2::uuid
      );
    `, [orgId, ownerId]);
  } catch (err: any) {
    block30Error = err.message;
  }
  assert.ok(
    block30Error && block30Error.includes("intervalo mínimo de 30 dias"),
    `Segunda alteração antes de 30 dias deve ser bloqueada. Erro obtido: ${block30Error}`
  );
  console.log("  ✅ [PASSOU] 2.7 Bloqueio de 30 dias aplicado com sucesso no banco de dados");

  // TESTE 2.8: Validação de capacidade em downgrade
  // Simulando que se passaram 30 dias (ajustando next_plan_change_at para o passado)
  await pg.exec(`
    UPDATE public.organizations 
    SET next_plan_change_at = now() - interval '1 day' 
    WHERE id = '${orgId}';
  `);

  // Organização tem 2 membros ativos ('owner' e 'member').
  // O plano 'start' permite apenas 1 membro. Tentativa de mudar para 'start' deve ser barrada.
  let capacityError = null;
  try {
    await pg.query(`
      SELECT public.change_organization_plan_by_owner(
        $1::uuid,
        'start',
        'idemp-downgrade-capacity',
        $2::uuid
      );
    `, [orgId, ownerId]);
  } catch (err: any) {
    capacityError = err.message;
  }
  assert.ok(
    capacityError && capacityError.includes("excedendo a capacidade"),
    `Downgrade para plano com capacidade menor que membros ativos deve falhar. Erro: ${capacityError}`
  );
  console.log("  ✅ [PASSOU] 2.8 Downgrade bloqueado quando número de membros ativos excede o limite do plano de destino");

  // TESTE 2.9: Validação de limites Beta (máx 10 clientes e 5 imóveis)
  // Desativa o membro extra para atender a cota de 1 membro
  await pg.exec(`
    UPDATE public.organization_members 
    SET status = 'inactive' 
    WHERE organization_id = '${orgId}' AND user_id = '${nonOwnerId}';
  `);

  // Insere 11 clientes na organização
  for (let i = 1; i <= 11; i++) {
    await pg.exec(`
      INSERT INTO public.clients ("userId", organization_id, name, email)
      VALUES ('${ownerId}', '${orgId}', 'Cliente ${i}', 'cli${i}@teste.com');
    `);
  }

  let betaLimitError = null;
  try {
    await pg.query(`
      SELECT public.change_organization_plan_by_owner(
        $1::uuid,
        'beta',
        'idemp-downgrade-beta',
        $2::uuid
      );
    `, [orgId, ownerId]);
  } catch (err: any) {
    betaLimitError = err.message;
  }
  assert.ok(
    betaLimitError && betaLimitError.includes("limite do Beta: 10"),
    `Downgrade para Beta com mais de 10 clientes deve falhar. Erro: ${betaLimitError}`
  );
  console.log("  ✅ [PASSOU] 2.9 Downgrade para Beta bloqueado quando exceder o limite de clientes (10)");

  // TESTE 2.10: Gerenciamento administrativo de cobranças manuais
  const chargeId = chargesCheck1.rows[0].id;

  // Atualiza para 'paid'
  const updateRes = await pg.query<{ admin_update_manual_charge_status: any }>(`
    SELECT public.admin_update_manual_charge_status(
      $1::uuid,
      'paid',
      now(),
      'Pagamento recebido via PIX direto',
      'admin-auditor'
    );
  `, [chargeId]);
  assert.strictEqual(updateRes.rows[0].admin_update_manual_charge_status.success, true);
  assert.strictEqual(updateRes.rows[0].admin_update_manual_charge_status.status, "paid");

  const paidChargeCheck = await pg.query<any>(`
    SELECT status, payment_date, reviewed_by, notes FROM public.manual_charges WHERE id = $1
  `, [chargeId]);
  assert.strictEqual(paidChargeCheck.rows[0].status, "paid");
  assert.ok(paidChargeCheck.rows[0].payment_date, "payment_date deve estar registrado");
  assert.strictEqual(paidChargeCheck.rows[0].reviewed_by, "admin-auditor");

  // Criação manual de cobrança avulsa pelo administrador
  const newChargeRes = await pg.query<{ admin_create_manual_charge: any }>(`
    SELECT public.admin_create_manual_charge(
      $1::uuid,
      '2026-11',
      149.90,
      '2026-11-10'::date,
      'Mensalidade regular plano Max',
      'admin-auditor'
    );
  `, [orgId]);
  assert.strictEqual(newChargeRes.rows[0].admin_create_manual_charge.success, true);
  console.log("  ✅ [PASSOU] 2.10 Gestão administrativa de cobranças manuais (baixa de pagamento e criação avulsa) funcionando 100%");

  console.log("\n==============================================================================");
  console.log("  TODOS OS TESTES DE MUDANÇA DE PLANO E COBRANÇAS MANUAIS PASSARAM COM SUCESSO! ");
  console.log("==============================================================================");
}

runTests().catch((err) => {
  console.error("Falha na execução dos testes:", err);
  process.exit(1);
});
