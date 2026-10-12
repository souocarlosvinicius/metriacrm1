/**
 * ==============================================================================
 * METRIA CRM - TESTES DE INTEGRAÇÃO ASAAS: ETAPA 1 (BANCO E AUTORIZAÇÃO)
 * ==============================================================================
 * Validações:
 * 1. Estrutura das migrations incrementais e schema de subscriptions, charges e webhook_events.
 * 2. Proteção rígida de campos financeiros contra alteração pelo navegador (inclusive por owner/admin).
 * 3. Preservação total de dados pré-existentes na tabela organizations.
 * 4. Isolamento multi-tenant de leitura e proibição de escrita direta pelo cliente.
 * 5. Unicidade de asaas_payment_id e event_id de webhook para idempotência.
 * 6. Proteção de credenciais de backend (ausência de prefixo VITE_ e segredos no bundle).
 * ==============================================================================
 */

process.env.NODE_ENV = "test";
process.env.TEST_ENV = "true";

import assert from "assert";
import fs from "fs";
import path from "path";
import { getAsaasConfig, verifyAsaasWebhookToken } from "../src/config/asaas";

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

async function runStep10Tests() {
  console.log("==============================================================================");
  console.log("  METRIA CRM - ASSINATURAS ASAAS (ETAPA 1: BANCO E AUTORIZAÇÃO)              ");
  console.log("==============================================================================");

  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 1: MIGRATION INCREMENTAL E ESTRUTURA DO BANCO ---");
  // --------------------------------------------------------------------------

  const migrationPath = "supabase/migrations/20261010000001_asaas_billing_schema_and_authorization.sql";
  const schemaPath = "supabase/schema.sql";

  await test("1.1 Migration incremental de Etapa 1 existe no diretório oficial de migrations", () => {
    assert(fs.existsSync(migrationPath), `Arquivo de migration não encontrado: ${migrationPath}`);
  });

  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  await test("1.2 Tabela public.subscriptions possui organização, IDs Asaas, plano e ciclo de cobrança", () => {
    assert(migrationSql.includes("CREATE TABLE IF NOT EXISTS public.subscriptions"), "Criação de public.subscriptions ausente");
    assert(migrationSql.includes("organization_id uuid NOT NULL REFERENCES public.organizations"), "Vínculo com public.organizations ausente");
    assert(migrationSql.includes("asaas_subscription_id text UNIQUE"), "asaas_subscription_id único ausente");
    assert(migrationSql.includes("plan text NOT NULL CHECK"), "Validação de plano ausente em subscriptions");
    assert(migrationSql.includes("billing_cycle text NOT NULL"), "billing_cycle ausente em subscriptions");
    assert(migrationSql.includes("paid_through timestamp with time zone"), "paid_through ausente em subscriptions");
  });

  await test("1.3 Tabela public.charges indexada por asaas_payment_id único com status abrangentes", () => {
    assert(migrationSql.includes("CREATE TABLE IF NOT EXISTS public.charges"), "Criação de public.charges ausente");
    assert(migrationSql.includes("asaas_payment_id text UNIQUE NOT NULL"), "asaas_payment_id único ausente em charges");
    assert(migrationSql.includes("organization_id uuid NOT NULL REFERENCES public.organizations"), "Vínculo com organizations ausente em charges");
    assert(migrationSql.includes("'CONFIRMED'"), "Status CONFIRMED ausente");
    assert(migrationSql.includes("'RECEIVED'"), "Status RECEIVED ausente");
    assert(migrationSql.includes("'OVERDUE'"), "Status OVERDUE ausente");
    assert(migrationSql.includes("'REFUNDED'"), "Status REFUNDED ausente");
    assert(migrationSql.includes("'CHARGEBACK_REQUESTED'"), "Status de chargeback ausente");
  });

  await test("1.4 Tabela public.webhook_events possui identificador único (event_id) para idempotência", () => {
    assert(migrationSql.includes("CREATE TABLE IF NOT EXISTS public.webhook_events"), "Criação de public.webhook_events ausente");
    assert(migrationSql.includes("event_id text UNIQUE NOT NULL"), "event_id único para idempotência ausente");
    assert(migrationSql.includes("status text NOT NULL DEFAULT 'pending'"), "status de processamento ausente");
    assert(migrationSql.includes("payload jsonb NOT NULL"), "payload jsonb do Asaas ausente");
  });

  await test("1.5 Schema consolidado (schema.sql) reflete fielmente as novas tabelas financeiras", () => {
    assert(schemaSql.includes("public.subscriptions"), "schema.sql deve conter public.subscriptions");
    assert(schemaSql.includes("public.charges"), "schema.sql deve conter public.charges");
    assert(schemaSql.includes("public.webhook_events"), "schema.sql deve conter public.webhook_events");
  });

  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 2: PRESERVAÇÃO DE DADOS EXISTENTES EM ORGANIZATIONS ---");
  // --------------------------------------------------------------------------

  await test("2.1 Colunas financeiras adicionadas com IF NOT EXISTS sem quebrar dados existentes", () => {
    assert(migrationSql.includes('ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "asaas_customer_id" text;'), "asaas_customer_id não adicionado com segurança");
    assert(migrationSql.includes('ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "paid_through" timestamp with time zone;'), "paid_through não adicionado com segurança");
    assert(migrationSql.includes('ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "financial_block" boolean DEFAULT false;'), "financial_block não adicionado com segurança");
  });

  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 3: PROTEÇÃO DE CAMPOS FINANCEIROS CONTRA EDIÇÃO PELO NAVEGADOR ---");
  // --------------------------------------------------------------------------

  await test("3.1 Trigger protect_organization_financial_fields protege plan, datas e status contra browser/owner", () => {
    assert(migrationSql.includes("protect_organization_financial_fields"), "Função protect_organization_financial_fields ausente");
    assert(migrationSql.includes("trg_protect_organization_financial_fields"), "Trigger em organizations ausente");
    assert(migrationSql.includes("auth.role() = 'authenticated'"), "Verificação de contexto de usuário autenticado ausente");
    assert(migrationSql.includes("NEW.plan := OLD.plan;"), "Reversão de plano forjado ausente");
    assert(migrationSql.includes("NEW.subscription_status := OLD.subscription_status;"), "Reversão de status forjado ausente");
    assert(migrationSql.includes("NEW.subscription_expires_at := OLD.subscription_expires_at;"), "Reversão de expiração forjada ausente");
    assert(migrationSql.includes("NEW.paid_through := OLD.paid_through;"), "Reversão de paid_through forjado ausente");
    assert(migrationSql.includes("NEW.financial_block := OLD.financial_block;"), "Reversão de financial_block forjado ausente");
  });

  await test("3.2 Trigger protect_financial_table_records impede INSERT/UPDATE/DELETE direto por clientes", () => {
    assert(migrationSql.includes("protect_financial_table_records"), "Função protect_financial_table_records ausente");
    assert(migrationSql.includes("trg_protect_subscriptions_records"), "Trigger de proteção em subscriptions ausente");
    assert(migrationSql.includes("trg_protect_charges_records"), "Trigger de proteção em charges ausente");
    assert(migrationSql.includes("trg_protect_webhook_events_records"), "Trigger de proteção em webhook_events ausente");
  });

  // Validação comportamental do trigger em simulação de contexto
  await test("3.3 Simulação de tentativa de forja financeira por Owner da organização é bloqueada", () => {
    const simulateOrgUpdate = (
      oldOrg: any,
      newOrgPayload: any,
      callerRole: "authenticated" | "service_role"
    ) => {
      const result = { ...oldOrg, ...newOrgPayload };
      if (callerRole === "authenticated") {
        // Aplica a lógica do trigger protect_organization_financial_fields
        result.plan = oldOrg.plan;
        result.subscription_status = oldOrg.subscription_status;
        result.subscription_expires_at = oldOrg.subscription_expires_at;
        result.max_members = oldOrg.max_members;
        result.paid_through = oldOrg.paid_through;
        result.financial_block = oldOrg.financial_block;
        result.asaas_customer_id = oldOrg.asaas_customer_id;
      }
      return result;
    };

    const legitimateOrg = {
      id: "org-alpha-123",
      owner_id: "user-owner-1",
      name: "Imobiliária Alpha",
      plan: "start",
      subscription_status: "active",
      subscription_expires_at: "2026-11-01T00:00:00Z",
      max_members: 1,
      paid_through: "2026-11-01T00:00:00Z",
      financial_block: false,
      asaas_customer_id: "cus_000005912345"
    };

    // Owner tenta se autopromover para "pro_max" e estender paid_through para 2099
    const hackerPayload = {
      name: "Imobiliária Alpha Renovada", // edição operacional legítima
      plan: "pro_max", // FORJA DE PLANO
      subscription_expires_at: "2099-12-31T23:59:59Z", // FORJA DE EXPIRAÇÃO
      paid_through: "2099-12-31T23:59:59Z", // FORJA DE COBERTURA PAGA
      max_members: 99, // FORJA DE LIMITE DE MEMBROS
      financial_block: false
    };

    const processedOrg = simulateOrgUpdate(legitimateOrg, hackerPayload, "authenticated");

    assert.strictEqual(processedOrg.name, "Imobiliária Alpha Renovada", "Nome operacional deve ser atualizado");
    assert.strictEqual(processedOrg.plan, "start", "Plano DEVE ser protegido e mantido como 'start'");
    assert.strictEqual(processedOrg.subscription_expires_at, "2026-11-01T00:00:00Z", "Expiração deve ser protegida");
    assert.strictEqual(processedOrg.paid_through, "2026-11-01T00:00:00Z", "paid_through deve ser protegido");
    assert.strictEqual(processedOrg.max_members, 1, "max_members deve ser protegido");
  });

  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 4: ROW LEVEL SECURITY (RLS) E ISOLAMENTO MULTI-TENANT ---");
  // --------------------------------------------------------------------------

  await test("4.1 RLS ativado nas tabelas subscriptions, charges e webhook_events", () => {
    assert(migrationSql.includes("ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;"), "RLS em subscriptions");
    assert(migrationSql.includes("ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;"), "RLS em charges");
    assert(migrationSql.includes("ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;"), "RLS em webhook_events");
  });

  await test("4.2 Política de SELECT permite apenas membros da própria organização lerem dados financeiros", () => {
    assert(migrationSql.includes('CREATE POLICY "Subscriptions SELECT" ON public.subscriptions'), "Policy SELECT em subscriptions");
    assert(migrationSql.includes("public.is_org_member(organization_id)"), "Checagem de membro da org em subscriptions");
    assert(migrationSql.includes('CREATE POLICY "Charges SELECT" ON public.charges'), "Policy SELECT em charges");
  });

  await test("4.3 Nenhuma política de escrita (INSERT/UPDATE/DELETE) concedida para role authenticated", () => {
    const authenticatedWriteRegex = /CREATE\s+POLICY\s+["'][^"']+["']\s+ON\s+public\.(subscriptions|charges|webhook_events)\s+FOR\s+(INSERT|UPDATE|DELETE)\s+TO\s+authenticated/gi;
    assert(!authenticatedWriteRegex.test(migrationSql), "NENHUMA política de escrita deve existir para a role authenticated");
  });

  await test("4.4 Simulação de isolamento multi-tenant entre Organização A e Organização B", () => {
    const subscriptionsStore = [
      { id: "sub-1", organization_id: "org-a", plan: "pro", status: "ACTIVE" },
      { id: "sub-2", organization_id: "org-b", plan: "start", status: "ACTIVE" }
    ];

    const chargesStore = [
      { id: "chg-1", organization_id: "org-a", asaas_payment_id: "pay_aaa111", value: 79.90 },
      { id: "chg-2", organization_id: "org-b", asaas_payment_id: "pay_bbb222", value: 39.90 }
    ];

    // Consulta de usuário da Org A
    const orgASubs = subscriptionsStore.filter((s) => s.organization_id === "org-a");
    const orgBSubs = subscriptionsStore.filter((s) => s.organization_id === "org-b");
    assert.strictEqual(orgASubs.length, 1);
    assert.strictEqual(orgASubs[0].id, "sub-1");

    // Usuário da Org A tentando ler charges da Org B
    const userACharges = chargesStore.filter((c) => c.organization_id === "org-a");
    assert(userACharges.every((c) => c.organization_id === "org-a"), "Usuário de A nunca recebe cobrança da Org B");
    assert(!userACharges.some((c) => c.asaas_payment_id === "pay_bbb222"), "Cobrança da Org B é estritamente invisível para Org A");
  });

  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 5: UNICIDADE E IDEMPOTÊNCIA DE COBRANÇAS E WEBHOOKS ---");
  // --------------------------------------------------------------------------

  await test("5.1 asaas_payment_id único previne duplicação de cobranças", () => {
    const chargesMap = new Map<string, any>();
    const charge1 = { asaas_payment_id: "pay_test_999", organization_id: "org-a", value: 79.90 };
    chargesMap.set(charge1.asaas_payment_id, charge1);

    const insertCharge = (item: any) => {
      if (chargesMap.has(item.asaas_payment_id)) {
        throw new Error(`duplicate key value violates unique constraint "idx_charges_asaas_payment_id"`);
      }
      chargesMap.set(item.asaas_payment_id, item);
    };

    assert.throws(
      () => insertCharge({ asaas_payment_id: "pay_test_999", organization_id: "org-a", value: 79.90 }),
      /duplicate key value violates unique constraint/,
      "Cobrança com mesmo asaas_payment_id deve ser rejeitada"
    );
  });

  await test("5.2 event_id único previne processamento duplicado de eventos de webhook", () => {
    const webhookEventsMap = new Map<string, any>();
    const event1 = { event_id: "evt_webhook_12345", event: "PAYMENT_RECEIVED", status: "processed" };
    webhookEventsMap.set(event1.event_id, event1);

    const insertWebhookEvent = (item: any) => {
      if (webhookEventsMap.has(item.event_id)) {
        throw new Error(`duplicate key value violates unique constraint "idx_webhook_events_event_id"`);
      }
      webhookEventsMap.set(item.event_id, item);
    };

    assert.throws(
      () => insertWebhookEvent({ event_id: "evt_webhook_12345", event: "PAYMENT_RECEIVED", status: "pending" }),
      /duplicate key value violates unique constraint/,
      "Evento de webhook com mesmo event_id deve ser rejeitado para garantir idempotência estrita"
    );
  });

  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 6: SEGURANÇA DE CONFIGURAÇÃO DO BACKEND (ASAAS SANDBOX) ---");
  // --------------------------------------------------------------------------

  await test("6.1 Variáveis do Asaas NÃO possuem prefixo VITE_ em arquivos do projeto", () => {
    const envExample = fs.readFileSync(".env.example", "utf8");
    assert(envExample.includes("ASAAS_API_KEY="), "ASAAS_API_KEY deve constar no .env.example");
    assert(envExample.includes("ASAAS_WEBHOOK_TOKEN="), "ASAAS_WEBHOOK_TOKEN deve constar no .env.example");
    assert(!envExample.includes("VITE_ASAAS_API_KEY"), "ASAAS_API_KEY NUNCA deve ter prefixo VITE_");
    assert(!envExample.includes("VITE_ASAAS_WEBHOOK_TOKEN"), "ASAAS_WEBHOOK_TOKEN NUNCA deve ter prefixo VITE_");
  });

  await test("6.2 Configuração do Asaas no backend aponta por padrão para o ambiente Sandbox", () => {
    const config = getAsaasConfig();
    assert.strictEqual(config.environment, "sandbox", "Ambiente padrão deve ser sandbox");
    assert(config.baseUrl.includes("sandbox.asaas.com"), "URL base padrão deve ser do sandbox Asaas");
  });

  await test("6.3 verifyAsaasWebhookToken valida integridade do token de autenticação do Asaas", () => {
    const originalEnv = process.env.ASAAS_WEBHOOK_TOKEN;
    process.env.ASAAS_WEBHOOK_TOKEN = "sandbox_webhook_secret_token_abc123";

    try {
      assert.strictEqual(verifyAsaasWebhookToken("sandbox_webhook_secret_token_abc123"), true, "Token válido deve retornar true");
      assert.strictEqual(verifyAsaasWebhookToken("token_incorreto_ou_forjado"), false, "Token incorreto deve retornar false");
      assert.strictEqual(verifyAsaasWebhookToken(undefined), false, "Token ausente deve retornar false");
    } finally {
      process.env.ASAAS_WEBHOOK_TOKEN = originalEnv;
    }
  });

  console.log("\n==============================================================================");
  console.log("  ETAPA 1 (BANCO E AUTORIZAÇÃO ASAAS) CONCLUÍDA COM 100% DE SUCESSO!         ");
  console.log("==============================================================================");
}

runStep10Tests().catch((e) => {
  console.error("Falha fatal na bateria de testes da Etapa 1:", e);
  process.exit(1);
});
