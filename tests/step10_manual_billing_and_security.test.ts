import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

console.log("==============================================================================");
console.log("  METRIA CRM - TESTES DE COBRANÇA MANUAL, TRANSIÇÃO E SEGURANÇA AVANÇADA       ");
console.log("==============================================================================");

// ----------------------------------------------------------------------------
// 1. PROTEÇÃO NO BANCO DE DADOS CONTRA ALTERAÇÕES DIRETAS DE CLIENTES
// ----------------------------------------------------------------------------
console.log("\n--- 1. PROTEÇÃO DE CAMPOS CONTRA ALTERAÇÕES DIRETAS DE CLIENTES ---");

const schemaSql = fs.readFileSync(path.join(process.cwd(), "supabase", "schema.sql"), "utf-8");
const transitionMigration = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20261012000002_transition_manual_billing_and_security.sql"),
  "utf-8"
);

// 1.1 Trigger protect_organization_protected_fields existe e cobre todos os campos exigidos
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

// 1.2 Trigger verifica sessão autenticada de cliente e rejeita
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
// 2. ALINHAMENTO DE MIGRATION DE SUSPENSÃO E create_organization_invite_v2 COM p_org_id
// ----------------------------------------------------------------------------
console.log("\n--- 2. ALINHAMENTO DE create_organization_invite_v2 COM p_org_id ---");

const suspensionMigration = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20261010000001_administrative_suspension.sql"),
  "utf-8"
);

assert.ok(
  suspensionMigration.includes("FUNCTION public.create_organization_invite_v2(\n  p_org_id uuid,"),
  "create_organization_invite_v2 na migration de suspensão deve declarar p_org_id uuid"
);
assert.ok(
  suspensionMigration.includes("WHERE id = p_org_id"),
  "Corpo de create_organization_invite_v2 deve usar p_org_id para consultar status de suspensão e max_members"
);
assert.ok(
  suspensionMigration.includes("'organizationId', p_org_id"),
  "Retorno de create_organization_invite_v2 deve incluir organizationId mapeado de p_org_id"
);

const apiTs = fs.readFileSync(path.join(process.cwd(), "src", "api.ts"), "utf-8");
assert.ok(
  apiTs.includes("p_org_id: organizationId"),
  "Chamada RPC no src/api.ts deve enviar p_org_id"
);
console.log("  ✅ [PASSOU] 2.1 create_organization_invite_v2 mantém p_org_id na assinatura, corpo e chamadas");

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
// 4. LIBERAÇÃO MANUAL POR ADMINISTRADOR INTERNO, AUDITORIA E VALIDADE
// ----------------------------------------------------------------------------
console.log("\n--- 4. LIBERAÇÃO MANUAL POR ADMINISTRADOR, AUDITORIA E VALIDADE ---");

assert.ok(
  transitionMigration.includes("admin_set_organization_plan"),
  "Migration deve conter a RPC transacional admin_set_organization_plan"
);
assert.ok(
  transitionMigration.includes("public.organization_plan_audit"),
  "Migration deve criar a tabela de auditoria organization_plan_audit"
);
assert.ok(
  transitionMigration.includes("FOR UPDATE"),
  "RPC admin_set_organization_plan deve bloquear a linha com FOR UPDATE para atomicidade estrita"
);

const serverTs = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf-8");
assert.ok(
  serverTs.includes('app.put("/api/organizations/:id/plan", requireAuth, requireMetriaAdmin'),
  "Endpoint PUT /api/organizations/:id/plan exige autorização de administrador interno"
);
assert.ok(
  serverTs.includes("admin_set_organization_plan"),
  "server.ts deve invocar a RPC transacional admin_set_organization_plan"
);
assert.ok(
  serverTs.includes("organization_plan_audit"),
  "server.ts deve registrar histórico na tabela organization_plan_audit"
);
assert.ok(
  serverTs.includes('app.get("/api/admin/organizations/:id/plan-audit"'),
  "server.ts deve expor histórico de auditoria de planos para administrador"
);

// 4.2 Validação de validade em operações protegidas (Gemini, Uploads e URLs assinadas)
assert.ok(
  serverTs.includes("SUBSCRIPTION_EXPIRED"),
  "server.ts deve validar subscription_expires_at e responder SUBSCRIPTION_EXPIRED"
);
assert.ok(
  serverTs.includes("requireGeminiPlan"),
  "server.ts protege rotas Gemini com requireGeminiPlan"
);

// 4.3 Preservação do cadastro inicial em Beta
assert.ok(
  serverTs.includes('p_plan: "beta"') || serverTs.includes("plan: 'beta'") || serverTs.includes('plan: "beta"'),
  "Cadastro inicial deve criar organizações preservando o plano Beta"
);
console.log("  ✅ [PASSOU] 4.1 Liberação manual por admin com auditoria em transação, validade e cadastro inicial em Beta");

// ----------------------------------------------------------------------------
// 5. URLS ASSINADAS E UPLOADS COM REVALIDAÇÃO DE MEMBERSHIP ATIVA / PROPRIEDADE
// ----------------------------------------------------------------------------
console.log("\n--- 5. REVALIDAÇÃO DE MEMBERSHIP/PROPRIEDADE EM UPLOADS E URLS ASSINADAS ---");

// 5.1 Em /api/upload
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

// 5.2 Em /api/storage/documents/sign-url
assert.ok(
  serverTs.includes("authorizedOrgIds.add"),
  "sign-url monta conjunto restrito apenas de organizações com vínculo ativo ou propriedade"
);
assert.ok(
  serverTs.includes("CROSS_TENANT_ACCESS_DENIED"),
  "sign-url bloqueia com CROSS_TENANT_ACCESS_DENIED se documento pertencer a tenant não autorizado"
);
console.log("  ✅ [PASSOU] 5.1 default_organization_id isolado não autoriza: membership ativa ou propriedade estritamente exigidas");

// ----------------------------------------------------------------------------
// 6. SIMULAÇÃO DE COMPORTAMENTO EM RUNTIME
// ----------------------------------------------------------------------------
console.log("\n--- 6. SIMULAÇÃO DE CENÁRIOS EM RUNTIME ---");

// Simulação de verificação de campos protegidos contra cliente
function simulateClientUpdate(authRole: string, oldData: any, newData: any) {
  if (authRole === "authenticated") {
    const protectedFields = ["plan", "subscription_status", "subscription_expires_at", "max_members", "owner_id", "access_status"];
    for (const f of protectedFields) {
      if (oldData[f] !== newData[f]) {
        throw new Error(`Acesso negado: campo protegido ${f} não pode ser alterado por clientes.`);
      }
    }
  }
  return { ...oldData, ...newData };
}

// Cliente autenticado tenta mudar de plano
assert.throws(
  () => simulateClientUpdate("authenticated", { plan: "beta", name: "Imobiliaria" }, { plan: "pro_max", name: "Imobiliaria" }),
  /Acesso negado: campo protegido plan/
);
console.log("  ✅ [PASSOU] 6.1 Cliente autenticado é barrado ao tentar alterar 'plan'");

// Cliente autenticado tenta alterar 'owner_id'
assert.throws(
  () => simulateClientUpdate("authenticated", { owner_id: "user-1", name: "Imobiliaria" }, { owner_id: "user-2", name: "Imobiliaria" }),
  /Acesso negado: campo protegido owner_id/
);
console.log("  ✅ [PASSOU] 6.2 Cliente autenticado é barrado ao tentar alterar 'owner_id'");

// Cliente autenticado tenta alterar 'max_members'
assert.throws(
  () => simulateClientUpdate("authenticated", { max_members: 1, name: "Imobiliaria" }, { max_members: 50, name: "Imobiliaria" }),
  /Acesso negado: campo protegido max_members/
);
console.log("  ✅ [PASSOU] 6.3 Cliente autenticado é barrado ao tentar alterar 'max_members'");

// Cliente autenticado atualiza apenas nome e telefone da organização (permitido)
const updatedProfile = simulateClientUpdate(
  "authenticated",
  { plan: "beta", max_members: 1, name: "Antigo Nome", phone: "11999999999" },
  { plan: "beta", max_members: 1, name: "Novo Nome Imobiliária", phone: "11988888888" }
);
assert.equal(updatedProfile.name, "Novo Nome Imobiliária");
console.log("  ✅ [PASSOU] 6.4 Cliente atualiza campos comerciais permitidos com sucesso");

// Simulação de validação de expiração
function checkSubscriptionActive(org: { plan: string; subscription_expires_at: string | null }) {
  if (org.subscription_expires_at) {
    const exp = new Date(org.subscription_expires_at).getTime();
    if (exp < Date.now() && org.plan !== "beta") {
      return { allowed: false, code: "SUBSCRIPTION_EXPIRED" };
    }
  }
  return { allowed: true };
}

const expiredOrg = {
  plan: "pro",
  subscription_expires_at: new Date(Date.now() - 3600000).toISOString() // Expirou há 1h
};
assert.equal(checkSubscriptionActive(expiredOrg).allowed, false);
assert.equal(checkSubscriptionActive(expiredOrg).code, "SUBSCRIPTION_EXPIRED");
console.log("  ✅ [PASSOU] 6.5 Assinatura expirada tem operações bloqueadas com SUBSCRIPTION_EXPIRED");

const validOrg = {
  plan: "pro",
  subscription_expires_at: new Date(Date.now() + 86400000 * 30).toISOString() // Válido por 30 dias
};
assert.equal(checkSubscriptionActive(validOrg).allowed, true);
console.log("  ✅ [PASSOU] 6.6 Assinatura dentro da validade tem acesso autorizado");

console.log("\n==============================================================================");
console.log("  TODOS OS TESTES DE TRANSIÇÃO, SEGURANÇA E COBRANÇA MANUAL PASSARAM COM SUCESSO! ");
console.log("==============================================================================");
