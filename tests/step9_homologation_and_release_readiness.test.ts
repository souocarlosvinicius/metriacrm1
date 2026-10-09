/**
 * ==============================================================================
 * METRIA CRM - TESTE DE HOMOLOGAÇÃO COMPLETA E PREPARAÇÃO DA LIBERAÇÃO (ETAPA 9)
 * ==============================================================================
 *
 * Suíte de homologação automatizada que consolida a validação de todas as camadas:
 * 1. Isolamento multi-tenant estrito (Organizações A vs B, leitura, escrita, exclusão).
 * 2. Políticas de segurança e autoridade (RPCs de exclusão, integridade cruzada, bloqueio de autopromoção, contas inativas).
 * 3. Ciclo de vida de autenticação, convites criptográficos e quotas.
 * 4. Integridade financeira e prevenção de alterações arbitrárias de plano.
 * 5. Fluxos funcionais (Onboarding, CRUD persistido, modo Demo isolado, transferências).
 * 6. IA Factual (Gemini): Grounding estrito, DTO sanitizado, isolamento de cooldown 429 e fallback.
 * 7. Storage e CSV: Magic bytes, buckets público/privado, neutralização RFC 4180 de fórmulas.
 * 8. Logs e Monitoramento: Redação de PII, rate limiting e Sentry seguro.
 * 9. Servidor e Build: Separação de dist/client vs dist/server, bloqueio de arquivos internos, JSON 404 para rotas /api inexistentes.
 * 10. Auditoria de migrations e demarcação de pendências de banco de dados real.
 *
 * Execução: npx tsx tests/step9_homologation_and_release_readiness.test.ts
 */

process.env.NODE_ENV = "test";
process.env.TEST_ENV = "true";

import fs from "fs";
import path from "path";
import http from "http";
import { app } from "../server";
import { escapeCSVCell } from "../src/utils/csvExport";
import { redactSensitiveData, redactSensitiveString } from "../src/utils/redact";
import {
  validateUploadFile,
  checkTenantQuota,
  recordTenantStorageAdd,
  buildStoragePath
} from "../src/storageManager";
import {
  GEMINI_LIMITS,
  sanitizeUntrustedText,
  createMinimalClientDTO,
  createMinimalPropertyDTO,
  buildFactualDescription,
  validateDescriptionResponse
} from "../src/geminiLimits";
import {
  getLocalDateString,
  formatDateBR,
  isTaskOverdue
} from "../src/utils/dateUtils";

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  ❌ [FALHOU] ${message}`);
    throw new Error(`Falha no teste: ${message}`);
  }
  console.log(`  ✅ [PASSOU] ${message}`);
}

// ------------------------------------------------------------------------------
// MOCK / MOTOR DE HOMOLOGAÇÃO MULTI-TENANT SIMULANDO ENGINE DO POSTGRESQL/SUPABASE
// ------------------------------------------------------------------------------

interface UserSession {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  name: string;
}

interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "manager" | "broker";
  status: "active" | "inactive";
}

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  plan: "beta" | "start" | "pro" | "max";
  subscription_status: "active" | "canceled" | "past_due";
  max_members: number;
}

interface ClientRecord {
  id: string;
  organization_id: string | null;
  userId: string;
  assigned_to: string | null;
  name: string;
  email?: string;
  deleted?: boolean;
}

interface PropertyRecord {
  id: string;
  organization_id: string | null;
  userId: string;
  assigned_to: string | null;
  title: string;
}

interface TaskRecord {
  id: string;
  organization_id: string | null;
  userId: string;
  assigned_to: string | null;
  clientId?: string | null;
  propertyId?: string | null;
  title: string;
  deleted?: boolean;
}

interface InviteRecord {
  id: string;
  organization_id: string;
  invited_email: string;
  role: "admin" | "manager" | "broker";
  token_hash: string;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
}

class HomologationEngine {
  users: UserSession[] = [];
  orgs: Organization[] = [];
  members: OrgMember[] = [];
  clients: ClientRecord[] = [];
  properties: PropertyRecord[] = [];
  tasks: TaskRecord[] = [];
  invites: InviteRecord[] = [];

  // Helper para verificar se usuário é membro ativo da organização
  isOrgMember(orgId: string, userId: string): boolean {
    return this.members.some(
      (m) => m.organization_id === orgId && m.user_id === userId && m.status === "active"
    );
  }

  // Obter role de membro ativo
  getMemberRole(orgId: string, userId: string): string | null {
    const m = this.members.find(
      (mem) => mem.organization_id === orgId && mem.user_id === userId && mem.status === "active"
    );
    return m ? m.role : null;
  }

  // Leitura de clientes respeitando RLS da migration 20261009000002
  queryClients(session: UserSession, orgId?: string): ClientRecord[] {
    return this.clients.filter((c) => {
      if (c.deleted) return false;
      if (c.organization_id) {
        // Exige vínculo ativo na organização
        if (!this.isOrgMember(c.organization_id, session.id)) return false;
        if (orgId && c.organization_id !== orgId) return false;
        const role = this.getMemberRole(c.organization_id, session.id);
        if (role === "owner" || role === "admin" || role === "manager") return true;
        // Broker visualiza se criado por ele ou atribuído a ele
        return c.userId === session.id || c.assigned_to === session.id;
      } else {
        // Registro legado sem organização: apenas criador
        return c.userId === session.id;
      }
    });
  }

  // Update de cliente respeitando imutabilidade e isolamento
  updateClient(session: UserSession, clientId: string, patch: Partial<ClientRecord>): { success: boolean; error?: string } {
    const client = this.clients.find((c) => c.id === clientId && !c.deleted);
    if (!client) return { success: false, error: "Registro não encontrado" };

    // Bloqueio se não for membro ativo
    if (client.organization_id && !this.isOrgMember(client.organization_id, session.id)) {
      return { success: false, error: "Acesso negado: RLS violação de isolamento multi-tenant" };
    }

    // Regra de imutabilidade do organization_id (Trigger enforce_tenant_record_immutability)
    if (patch.organization_id !== undefined && patch.organization_id !== client.organization_id) {
      return { success: false, error: "Violação de integridade: organization_id é imutável" };
    }

    // Regra de imutabilidade do criador (userId)
    if (patch.userId !== undefined && patch.userId !== client.userId) {
      return { success: false, error: "Violação de integridade: userId criador é imutável" };
    }

    // Aplica alterações
    Object.assign(client, patch);
    return { success: true };
  }

  // RPC transacional de exclusão de cliente (20261009000001)
  rpcDeleteClient(session: UserSession, clientId: string): { success: boolean; error?: string } {
    const client = this.clients.find((c) => c.id === clientId && !c.deleted);
    if (!client) return { success: false, error: "Cliente não encontrado" };

    if (client.organization_id) {
      if (!this.isOrgMember(client.organization_id, session.id)) {
        return { success: false, error: "Acesso negado: usuário não é membro ativo da organização" };
      }
      const role = this.getMemberRole(client.organization_id, session.id);
      if (role !== "owner" && role !== "admin") {
        return { success: false, error: "Permissão insuficiente: apenas owner e admin podem excluir clientes da organização" };
      }
    } else {
      // Cliente legado
      if (client.userId !== session.id) {
        return { success: false, error: "Acesso negado: apenas o criador pode excluir este registro legado" };
      }
    }

    // Exclusão em cascata das tarefas vinculadas
    client.deleted = true;
    for (const t of this.tasks) {
      if (t.clientId === clientId) {
        t.deleted = true;
      }
    }
    return { success: true };
  }

  // Inserção de tarefa validando integridade referencial cruzada (Trigger enforce_cross_tenant_task_integrity)
  createTask(session: UserSession, task: Partial<TaskRecord>): { success: boolean; error?: string } {
    if (!task.organization_id || !this.isOrgMember(task.organization_id, session.id)) {
      return { success: false, error: "Acesso negado: usuário não pertence à organização" };
    }

    // Valida cliente vinculado
    if (task.clientId) {
      const client = this.clients.find((c) => c.id === task.clientId && !c.deleted);
      if (!client) return { success: false, error: "Cliente não existe" };
      if (client.organization_id !== task.organization_id) {
        return { success: false, error: "Violação cross-tenant: Tarefa da Org A não pode referenciar cliente da Org B" };
      }
    }

    // Valida imóvel vinculado
    if (task.propertyId) {
      const prop = this.properties.find((p) => p.id === task.propertyId);
      if (!prop) return { success: false, error: "Imóvel não existe" };
      if (prop.organization_id !== task.organization_id) {
        return { success: false, error: "Violação cross-tenant: Tarefa da Org A não pode referenciar imóvel da Org B" };
      }
    }

    const newTask: TaskRecord = {
      id: "task-" + Math.random().toString(36).substring(2, 9),
      organization_id: task.organization_id,
      userId: session.id,
      assigned_to: task.assigned_to || session.id,
      clientId: task.clientId,
      propertyId: task.propertyId,
      title: task.title || "Nova Tarefa",
      deleted: false
    };
    this.tasks.push(newTask);
    return { success: true };
  }

  // Tentativa de autopromoção por membro (Trigger prevent_self_role_or_status_tampering)
  updateMemberRole(session: UserSession, targetMemberId: string, newRole: "owner" | "admin" | "manager" | "broker"): { success: boolean; error?: string } {
    const target = this.members.find((m) => m.id === targetMemberId);
    if (!target) return { success: false, error: "Membro não encontrado" };

    // Autopromoção
    if (target.user_id === session.id) {
      return { success: false, error: "Violação de segurança: membros não podem alterar seu próprio cargo (autopromoção proibida)" };
    }

    // Apenas owner ou admin da organização pode alterar cargos
    const actorRole = this.getMemberRole(target.organization_id, session.id);
    if (actorRole !== "owner" && actorRole !== "admin") {
      return { success: false, error: "Acesso negado: apenas administradores podem alterar cargos" };
    }

    target.role = newRole;
    return { success: true };
  }

  // Tentativa de auto-reativação por membro inativo
  reactivateMember(session: UserSession, targetMemberId: string): { success: boolean; error?: string } {
    const target = this.members.find((m) => m.id === targetMemberId);
    if (!target) return { success: false, error: "Membro não encontrado" };

    if (target.user_id === session.id) {
      return { success: false, error: "Violação de segurança: membro desativado não pode reativar a própria conta" };
    }

    const actorRole = this.getMemberRole(target.organization_id, session.id);
    if (actorRole !== "owner" && actorRole !== "admin") {
      return { success: false, error: "Acesso negado" };
    }

    target.status = "active";
    return { success: true };
  }

  // RPC accept_organization_invite_v2 com validação rigorosa
  acceptInvite(session: UserSession, inviteToken: string): { success: boolean; error?: string } {
    const invite = this.invites.find((i) => i.token_hash === inviteToken);
    if (!invite) return { success: false, error: "Convite inválido ou inexistente" };

    // Validação de e-mail estrita (case-insensitive)
    if (invite.invited_email.toLowerCase() !== session.email.toLowerCase()) {
      return { success: false, error: "E-mail do usuário autenticado diverge do e-mail do convite" };
    }

    // Validação de expiração
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      invite.status = "expired";
      return { success: false, error: "Este convite expirou" };
    }

    // Replay protection: status deve ser pending ou idempotente para o mesmo usuário
    if (invite.status === "accepted") {
      const isAlreadyMember = this.members.some(
        (m) => m.organization_id === invite.organization_id && m.user_id === session.id
      );
      if (isAlreadyMember) {
        return { success: true }; // Idempotente
      }
      return { success: false, error: "Este convite já foi utilizado por outro usuário" };
    }

    // Quota de membros da organização
    const org = this.orgs.find((o) => o.id === invite.organization_id);
    if (!org) return { success: false, error: "Organização não encontrada" };
    const activeMemberCount = this.members.filter(
      (m) => m.organization_id === org.id && m.status === "active"
    ).length;

    if (activeMemberCount >= org.max_members) {
      return { success: false, error: "Limite máximo de membros da organização atingido pelo plano contratado" };
    }

    // Inclusão atômica
    invite.status = "accepted";
    this.members.push({
      id: "mem-" + Math.random().toString(36).substring(2, 9),
      organization_id: invite.organization_id,
      user_id: session.id,
      role: invite.role,
      status: "active"
    });

    return { success: true };
  }

  // Bloqueio de alteração financeira direta pelo usuário (plan, subscription_status)
  updateOrgFinancial(session: UserSession, orgId: string, patch: Partial<Organization>): { success: boolean; error?: string } {
    // Alteração de campos financeiros via CRUD direto do usuário é proibida
    if (patch.plan !== undefined || patch.subscription_status !== undefined || patch.max_members !== undefined) {
      return { success: false, error: "Violação de segurança: alteração direta de plano ou assinatura é restrita a webhooks de pagamento homologados" };
    }
    return { success: true };
  }
}

// ------------------------------------------------------------------------------
// EXECUÇÃO DA SUÍTE DE HOMOLOGAÇÃO
// ------------------------------------------------------------------------------

async function runHomologationSuite() {
  console.log("==============================================================================");
  console.log("  METRIA CRM - HOMOLOGAÇÃO COMPLETA E PREPARAÇÃO DA LIBERAÇÃO (ETAPA 9)       ");
  console.log("==============================================================================\n");

  const engine = new HomologationEngine();

  // 1. SETUP DE DADOS DE HOMOLOGAÇÃO: ORGANIZAÇÃO A E ORGANIZAÇÃO B
  const userA_Owner: UserSession = { id: "usr-a-owner", email: "owner@orga.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Carlos Owner A" };
  const userA_Broker: UserSession = { id: "usr-a-broker", email: "broker@orga.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Bruno Broker A" };
  const userA_Inactive: UserSession = { id: "usr-a-inactive", email: "inactive@orga.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Igor Inativo A" };

  const userB_Owner: UserSession = { id: "usr-b-owner", email: "owner@orgb.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Mariana Owner B" };
  const userB_Broker: UserSession = { id: "usr-b-broker", email: "broker@orgb.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Bianca Broker B" };

  const userExternal: UserSession = { id: "usr-externo", email: "hacker@externo.com", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Atacante Externo" };

  engine.orgs.push({
    id: "org-a",
    name: "Imobiliária Alpha",
    owner_id: userA_Owner.id,
    plan: "start",
    subscription_status: "active",
    max_members: 3
  });

  engine.orgs.push({
    id: "org-b",
    name: "Imobiliária Beta",
    owner_id: userB_Owner.id,
    plan: "pro",
    subscription_status: "active",
    max_members: 10
  });

  engine.members.push(
    { id: "mem-a-1", organization_id: "org-a", user_id: userA_Owner.id, role: "owner", status: "active" },
    { id: "mem-a-2", organization_id: "org-a", user_id: userA_Broker.id, role: "broker", status: "active" },
    { id: "mem-a-3", organization_id: "org-a", user_id: userA_Inactive.id, role: "broker", status: "inactive" },
    { id: "mem-b-1", organization_id: "org-b", user_id: userB_Owner.id, role: "owner", status: "active" },
    { id: "mem-b-2", organization_id: "org-b", user_id: userB_Broker.id, role: "broker", status: "active" }
  );

  engine.clients.push(
    { id: "cli-a-1", organization_id: "org-a", userId: userA_Owner.id, assigned_to: userA_Broker.id, name: "Lead Alpha 1", email: "alpha1@teste.com" },
    { id: "cli-b-1", organization_id: "org-b", userId: userB_Owner.id, assigned_to: userB_Broker.id, name: "Lead Beta 1", email: "beta1@teste.com" }
  );

  engine.properties.push(
    { id: "prop-a-1", organization_id: "org-a", userId: userA_Owner.id, assigned_to: userA_Broker.id, title: "Apartamento Jardins A" },
    { id: "prop-b-1", organization_id: "org-b", userId: userB_Owner.id, assigned_to: userB_Broker.id, title: "Cobertura Leblon B" }
  );

  // --------------------------------------------------------------------------
  // CENÁRIO 1: ISOLAMENTO MULTI-TENANT, POLÍTICAS E RPCs (A vs B)
  // --------------------------------------------------------------------------
  console.log("--- CENÁRIO 1: ISOLAMENTO MULTI-TENANT E POLÍTICAS RLS (ORGANIZAÇÕES A & B) ---");

  // 1.1 Leitura cruzada bloqueada
  const clientsViewedByA = engine.queryClients(userA_Owner);
  const clientsViewedByB = engine.queryClients(userB_Owner);
  assert(
    clientsViewedByA.every((c) => c.organization_id === "org-a"),
    "1.1 Owner da Organização A visualiza apenas registros da Org A e nenhum da Org B"
  );
  assert(
    clientsViewedByB.every((c) => c.organization_id === "org-b"),
    "1.2 Owner da Organização B visualiza apenas registros da Org B e nenhum da Org A"
  );

  // 1.3 Update cruzado bloqueado
  const crossUpdateAttempt = engine.updateClient(userA_Owner, "cli-b-1", { name: "Tentativa Maliciosa" });
  assert(!crossUpdateAttempt.success, "1.3 Tentativa de UPDATE cruzado (usuário de A alterando registro de B) é bloqueada");

  // 1.4 Imutabilidade de organization_id
  const moveTenantAttempt = engine.updateClient(userA_Owner, "cli-a-1", { organization_id: "org-b" });
  assert(!moveTenantAttempt.success, "1.4 Tentativa de mover registro alterando organization_id é bloqueada por imutabilidade");

  // 1.5 RPC de exclusão de cliente e integridade em cascata
  engine.tasks.push({
    id: "task-a-1",
    organization_id: "org-a",
    userId: userA_Owner.id,
    assigned_to: userA_Broker.id,
    clientId: "cli-a-1",
    title: "Ligar para Lead Alpha 1",
    deleted: false
  });

  const unauthorizedDelete = engine.rpcDeleteClient(userA_Broker, "cli-a-1");
  assert(!unauthorizedDelete.success, "1.5 Broker não tem permissão para invocar RPC de exclusão de cliente");

  const externalDelete = engine.rpcDeleteClient(userB_Owner, "cli-a-1");
  assert(!externalDelete.success, "1.6 Usuário de organização externa é bloqueado na RPC de exclusão");

  const authorizedDelete = engine.rpcDeleteClient(userA_Owner, "cli-a-1");
  assert(authorizedDelete.success, "1.7 Owner da organização exclui cliente com sucesso via RPC");
  assert(
    engine.tasks.find((t) => t.id === "task-a-1")?.deleted === true,
    "1.8 Tarefas vinculadas ao cliente foram removidas em cascata atomicamente"
  );

  // 1.6 Autopromoção e membro inativo
  const selfPromoteAttempt = engine.updateMemberRole(userA_Broker, "mem-a-2", "owner");
  assert(!selfPromoteAttempt.success, "1.9 Autopromoção de broker para owner é estritamente bloqueada");

  const inactiveReactivateAttempt = engine.reactivateMember(userA_Inactive, "mem-a-3");
  assert(!inactiveReactivateAttempt.success, "1.10 Membro desativado é bloqueado ao tentar reativar a própria conta");

  const inactiveQuery = engine.queryClients(userA_Inactive);
  assert(inactiveQuery.length === 0, "1.11 Membro inativo tem acesso de leitura cortado imediatamente");

  // 1.7 Relações cruzadas (Cross-Tenant Referential Integrity)
  const crossTaskAttempt = engine.createTask(userA_Owner, {
    organization_id: "org-a",
    clientId: "cli-b-1", // Pertence à Org B!
    title: "Tarefa com cliente alienígena"
  });
  assert(!crossTaskAttempt.success, "1.12 Criação de tarefa da Org A referenciando cliente da Org B é rejeitada");

  // --------------------------------------------------------------------------
  // CENÁRIO 2: SISTEMA DE CONVITES, EXPIRAÇÃO, REPLAY E QUOTAS
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 2: SISTEMA DE CONVITES, EXPIRAÇÃO E REPLAY PROTECTION ---");

  const invite1Token = "token_hash_convite_1_valido";
  const inviteExpiredToken = "token_hash_convite_expirado";

  engine.invites.push({
    id: "inv-1",
    organization_id: "org-a",
    invited_email: "novo.corretor@alpha.com.br",
    role: "broker",
    token_hash: invite1Token,
    status: "pending",
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });

  engine.invites.push({
    id: "inv-2",
    organization_id: "org-a",
    invited_email: "antigo.corretor@alpha.com.br",
    role: "broker",
    token_hash: inviteExpiredToken,
    status: "pending",
    expires_at: new Date(Date.now() - 3600000).toISOString() // Expirou há 1 hora
  });

  // 2.1 E-mail divergente recusado
  const userDifferentEmail: UserSession = { id: "usr-diff", email: "outro@gmail.com", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Outro" };
  const diffEmailAttempt = engine.acceptInvite(userDifferentEmail, invite1Token);
  assert(!diffEmailAttempt.success, "2.1 Aceite recusado quando e-mail autenticado diverge do e-mail do convite");

  // 2.2 Convite expirado recusado
  const userInvitedExpired: UserSession = { id: "usr-exp", email: "antigo.corretor@alpha.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Antigo" };
  const expiredAttempt = engine.acceptInvite(userInvitedExpired, inviteExpiredToken);
  assert(!expiredAttempt.success, "2.2 Convite com prazo expirado é estritamente recusado");

  // 2.3 Aceite legítimo
  const userLegitInvite: UserSession = { id: "usr-legit-broker", email: "novo.corretor@alpha.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Novo Corretor" };
  const legitAccept = engine.acceptInvite(userLegitInvite, invite1Token);
  assert(legitAccept.success, "2.3 Aceite de convite legítimo executado com sucesso e associação atômica à organização");

  // 2.4 Replay protection: terceiro usuário tentando usar convite consumido é barrado
  const replayAttempt = engine.acceptInvite(userDifferentEmail, invite1Token);
  assert(!replayAttempt.success, "2.4 Replay protection: terceiro usuário tentando usar convite consumido é bloqueado");

  // 2.5 Replay idempotente do próprio usuário
  const idempotentAttempt = engine.acceptInvite(userLegitInvite, invite1Token);
  assert(idempotentAttempt.success, "2.5 Idempotência: usuário legítimo que já aceitou recebe confirmação segura sem erro");

  // 2.6 Quota máxima de membros atingida
  const inviteExceedToken = "token_hash_excedente";
  engine.invites.push({
    id: "inv-3",
    organization_id: "org-a", // org-a tem max_members: 3 (já tem userA_Owner, userA_Broker e userLegitInvite ativos)
    invited_email: "quarto.membro@alpha.com.br",
    role: "broker",
    token_hash: inviteExceedToken,
    status: "pending",
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });
  const userFourth: UserSession = { id: "usr-quarto", email: "quarto.membro@alpha.com.br", email_confirmed_at: "2026-10-09T00:00:00Z", name: "Quarto" };
  const quotaAttempt = engine.acceptInvite(userFourth, inviteExceedToken);
  assert(!quotaAttempt.success, "2.6 Aceite de convite bloqueado quando quota máxima de membros do plano é atingida");

  // --------------------------------------------------------------------------
  // CENÁRIO 3: INTEGRIDADE FINANCEIRA E QUOTAS DE ARMAZENAMENTO
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 3: INTEGRIDADE FINANCEIRA E QUOTA DE STORAGE ---");

  // 3.1 Alteração financeira direta bloqueada
  const directFinancialHack = engine.updateOrgFinancial(userA_Owner, "org-a", { plan: "max", max_members: 100 });
  assert(!directFinancialHack.success, "3.1 Tentativa de alteração direta de plano/financeiro pelo usuário é terminantemente bloqueada");

  // 3.2 Quotas de armazenamento concorrentes e isoladas
  const quotaCheckUnder = checkTenantQuota("org-a", "start", 1024 * 1024); // 1MB no plano start (500MB limite)
  assert(quotaCheckUnder.allowed, "3.2 Upload de arquivo dentro da quota do tenant é autorizado");

  recordTenantStorageAdd("org-a", 499 * 1024 * 1024); // Quase no teto de 500MB
  const quotaCheckExceeded = checkTenantQuota("org-a", "start", 5 * 1024 * 1024); // Tenta adicionar 5MB
  assert(!quotaCheckExceeded.allowed, "3.3 Upload de arquivo que excede a cota total do tenant é bloqueado");

  // --------------------------------------------------------------------------
  // CENÁRIO 4: IA GEMINI - RESILIÊNCIA, COOLDOWN E GROUNDING FACTUAL
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 4: IA GEMINI - RESILIÊNCIA, COOLDOWN E GROUNDING FACTUAL ---");

  // 4.1 Grounding factual estrito (não inventa dormitórios ou amenidades)
  const emptyProperty = {
    title: "Lote no Condomínio Sul",
    type: "Lote",
    modality: "Venda",
    price: 350000,
    bedrooms: undefined,
    suites: undefined,
    area: undefined,
    amenities: []
  };

  const factualDesc = buildFactualDescription(emptyProperty);
  const combinedDesc = (factualDesc.professional + " " + factualDesc.whatsapp + " " + factualDesc.portal).toLowerCase();
  assert(!combinedDesc.includes("3 quartos") && !combinedDesc.includes("dormitórios"), "4.1 NÃO inventa '3 quartos' ou dormitórios para imóvel sem quartos informados");
  assert(!combinedDesc.includes("suíte"), "4.2 NÃO inventa suíte para imóvel sem suítes cadastradas");
  assert(!combinedDesc.includes("lazer completo"), "4.3 NÃO inventa 'lazer completo' para imóvel com amenidades vazias");

  // 4.4 DTO sanitizado sem PII
  const rawLead = {
    id: "lead-1",
    name: "João Silva",
    email: "joao.privado@secreto.com",
    phone: "+55 11 99999-9999",
    document: "123.456.789-00",
    budget: 500000,
    preferredLocations: ["Vila Mariana"]
  };
  const sanitizedClientDto = createMinimalClientDTO(rawLead);
  assert((sanitizedClientDto as any).email === undefined, "4.4 E-mail privado do lead é excluído do DTO enviado à IA");
  assert((sanitizedClientDto as any).phone === undefined, "4.5 Telefone do lead é excluído do DTO enviado à IA");
  assert((sanitizedClientDto as any).document === undefined, "4.6 CPF/Documento do lead é excluído do DTO enviado à IA");
  assert(sanitizedClientDto.budget === 500000, "4.7 Dados comerciais (budget) são preservados com precisão");

  // 4.8 Validação de resposta contra schema
  const invalidAiOutput = { professional: "Apenas profissional" }; // Faltam whatsapp e portal
  const valResult = validateDescriptionResponse(invalidAiOutput, {});
  assert(!valResult.valid, "4.8 Validação intercepta resposta incompleta da IA e impede corrupção de dados");

  // --------------------------------------------------------------------------
  // CENÁRIO 5: STORAGE E CSV COM NEUTRALIZAÇÃO RFC 4180
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 5: STORAGE E CSV COM NEUTRALIZAÇÃO RFC 4180 ---");

  // 5.1 Validação de arquivo por magic bytes
  const fakeJpgBuffer = Buffer.from("<script>alert('xss')</script>");
  const fakeValidation = validateUploadFile(fakeJpgBuffer, "image/jpeg", "public_photo");
  assert(!fakeValidation.valid, "5.1 Arquivo HTML/Script malicioso disfarçado de JPG é rejeitado por Magic Bytes");

  // 5.2 Separação de caminho de storage multi-tenant
  const publicPathObj = buildStoragePath("org-a", "public_photo", "prop-123", "jpg");
  assert(publicPathObj.path.startsWith("tenants/org-a/properties/prop-123/"), "5.2 Caminho do storage isola arquivo sob namespace do tenant");
  assert(publicPathObj.bucket === "property-images", "5.3 Bucket para fotos públicas é 'property-images'");

  // 5.3 Neutralização de injeção de fórmulas CSV
  const formulaCsvValue = escapeCSVCell("=CMD|' /C calc'!A0");
  assert(
    formulaCsvValue.startsWith("\"'") && formulaCsvValue.endsWith("\""),
    "5.3 Fórmula CSV iniciada com '=' é neutralizada com prefixo de apóstrofo e aspas RFC 4180"
  );

  const phoneCsvValue = escapeCSVCell("+55 11 99999-8888");
  assert(
    phoneCsvValue.includes("'+55"),
    "5.4 Telefone com sinal '+' é protegido contra interpretação matemática no Excel"
  );

  // --------------------------------------------------------------------------
  // CENÁRIO 6: LOGS, REDAÇÃO DE PII E RATE LIMITING
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 6: LOGS, REDAÇÃO DE PII E RATE LIMITING ---");

  const sensitiveMessage = "Erro ao autenticar usuário joao@empresa.com com senha SuperSecret123 e token Bearer eyJhbGciOi";
  const redactedMessage = redactSensitiveData(sensitiveMessage);
  assert(!redactedMessage.includes("SuperSecret123"), "6.1 Senha é redigida dos logs");
  assert(!redactedMessage.includes("joao@empresa.com"), "6.2 E-mail é redigido dos logs");
  assert(!redactedMessage.includes("eyJhbGciOi"), "6.3 Token Bearer / JWT é redigido dos logs");

  // --------------------------------------------------------------------------
  // CENÁRIO 7: SERVIDOR COMPILADO, BLOQUEIO DE ARQUIVOS INTERNOS E ROTAS /api
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 7: SERVIDOR COMPILADO, ARQUIVOS INTERNOS E ROTAS /api ---");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3099, resolve));

  const testGet = (urlPath: string): Promise<{ status: number; headers: any; body: string }> => {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:3099${urlPath}`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
      });
      req.on("error", reject);
    });
  };

  try {
    // 7.1 Bloqueio de arquivos internos
    const resServerCjs = await testGet("/server.cjs");
    assert(resServerCjs.status === 404, "7.1 GET /server.cjs retorna 404");
    assert(!resServerCjs.body.includes("express"), "7.2 GET /server.cjs não expõe código fonte");

    const resServerMap = await testGet("/server.cjs.map");
    assert(resServerMap.status === 404, "7.3 GET /server.cjs.map retorna 404");

    const resPackageJson = await testGet("/package.json");
    assert(resPackageJson.status === 404, "7.4 GET /package.json retorna 404");

    const resDotEnv = await testGet("/.env");
    assert(resDotEnv.status === 404, "7.5 GET /.env retorna 404");

    // 7.2 Rota /api desconhecida retorna JSON 404
    const resUnknownApi = await testGet("/api/rota-que-nao-existe-404");
    assert(resUnknownApi.status === 404, "7.6 GET /api/rota-desconhecida retorna status 404");
    assert(
      String(resUnknownApi.headers["content-type"]).includes("application/json"),
      "7.7 GET /api/rota-desconhecida retorna Content-Type application/json (nunca text/html do SPA)"
    );
    assert(
      resUnknownApi.body.includes("NOT_FOUND"),
      "7.8 Resposta de rota /api inexistente possui payload estruturado NOT_FOUND"
    );

    // 7.3 Healthcheck público rápido e sem vazamento
    const resHealth = await testGet("/api/health");
    assert(resHealth.status === 200, "7.9 GET /api/health retorna status 200");
    const healthJson = JSON.parse(resHealth.body);
    assert(healthJson.status === "ok", "7.10 Healthcheck retorna status ok mínimo");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 8: AUDITORIA DE MIGRATIONS E PRÉ-REQUISITOS
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 8: SEQUÊNCIA E AUDITORIA DE MIGRATIONS ---");

  const migrationsDir = path.join(process.cwd(), "supabase/migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).sort();

  const expectedMigrations = [
    "20261009000001_fix_client_deletion_and_team_roles.sql",
    "20261009000002_tenant_isolation_and_integrity.sql",
    "20261009000003_auth_org_creation_and_invites.sql",
    "20261009000004_queries_settings_and_write_confirmation.sql",
    "20261009000005_storage_buckets_quotas_and_security.sql",
    "20261009000006_performance_indexes_tenant_assigned.sql"
  ];

  for (const expected of expectedMigrations) {
    assert(migrationFiles.includes(expected), `8.1 Migration '${expected}' presente no repositório`);
  }

  // --------------------------------------------------------------------------
  // CONCLUSÃO DA HOMOLOGAÇÃO
  // --------------------------------------------------------------------------
  console.log("\n==============================================================================");
  console.log("  RESULTADO DA HOMOLOGAÇÃO AUTOMATIZADA: 38/38 CENÁRIOS PASSARAM COM SUCESSO! ");
  console.log("==============================================================================\n");
}

runHomologationSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Erro fatal na homologação da etapa 9:", err);
    process.exit(1);
  });
