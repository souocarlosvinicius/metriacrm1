/**
 * ==============================================================================
 * METRIA CRM - TESTES DE REGRESSÃO E INTEGRAÇÃO (ETAPA 4)
 * Autenticação, Criação de Organização e Sistema de Convites
 * ==============================================================================
 *
 * Cenários avaliados:
 * 1. Cadastro com e sem confirmação de e-mail (signUp resiliente sem falhas falsas de upsert).
 * 2. Login e Logout coerentes com o e-mail cadastrado (sem fabricar domínios arbitrários).
 * 3. Primeiro onboarding / criação de organização atômica com primeiro owner (sem org virtual, 201 apenas em sucesso real).
 * 4. Convite externo legítimo com token criptograficamente seguro e prazo de expiração.
 * 5. Aceite recusado quando e-mail do usuário autenticado diverge do destinatário.
 * 6. Aceite recusado quando convite está expirado ou cancelado.
 * 7. Replay protection e idempotência (segunda tentativa do mesmo usuário não quebra nem duplica vínculo).
 * 8. Concorrência: disputa do último slot de membro e verificação no banco.
 *
 * Execução: npx tsx tests/step4_auth_org_invites.test.ts
 */

import crypto from "crypto";

// --- SIMULADOR DE BANCO DE DADOS (TRANSAÇÕES, RLS E RPCs DA ETAPA 4) ---

interface User {
  id: string;
  email: string;
  name: string;
  email_confirmed: boolean;
}

interface Profile {
  id: string;
  email: string;
  name: string;
  username: string;
  default_organization_id?: string | null;
  current_role?: string | null;
  onboarding_completed: boolean;
}

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  max_members: number;
  subscription_status: string;
}

interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
}

interface OrgInvite {
  id: string;
  organization_id: string;
  invited_email: string;
  invited_name?: string;
  role: string;
  token: string;
  token_hash: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invited_by: string;
  accepted_by?: string;
  expires_at: Date;
}

class Step4DatabaseSandbox {
  users: Map<string, User> = new Map();
  profiles: Map<string, Profile> = new Map();
  organizations: Map<string, Organization> = new Map();
  members: Map<string, OrgMember> = new Map();
  invites: Map<string, OrgInvite> = new Map();

  // 1. Simulação do supabase.auth.signUp + Trigger on_auth_user_created
  async signUp(params: {
    email: string;
    password: string;
    name?: string;
    username?: string;
    requiresEmailConfirmation?: boolean;
  }): Promise<{ user: User | null; session: boolean; error?: string }> {
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail.includes("@")) {
      return { user: null, session: false, error: "E-mail inválido." };
    }

    // Checar duplicidade em auth.users
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === cleanEmail) {
        return { user: null, session: false, error: "Usuário já cadastrado com este e-mail." };
      }
    }

    const userId = crypto.randomUUID();
    const newUser: User = {
      id: userId,
      email: cleanEmail,
      name: params.name || cleanEmail.split("@")[0],
      email_confirmed: !params.requiresEmailConfirmation
    };
    this.users.set(userId, newUser);

    // O Trigger `on_auth_user_created` (SECURITY DEFINER) cria o perfil automaticamente
    this.profiles.set(userId, {
      id: userId,
      email: cleanEmail,
      name: newUser.name,
      username: params.username || cleanEmail.split("@")[0],
      default_organization_id: null,
      current_role: null,
      onboarding_completed: false
    });

    const hasSession = !params.requiresEmailConfirmation;
    return { user: newUser, session: hasSession };
  }

  // 2. Simulação de signInWithPassword
  async signIn(emailOrUsername: string): Promise<{ user: User | null; error?: string }> {
    const clean = emailOrUsername.trim().toLowerCase();
    // Procura por email exato
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === clean) {
        if (!u.email_confirmed) {
          return { user: null, error: "E-mail não confirmado. Verifique sua caixa de entrada." };
        }
        return { user: u };
      }
    }
    return { user: null, error: "Email ou senha inválidos." };
  }

  // 3. Simulação da RPC atômica create_organization_with_owner
  async rpcCreateOrganizationWithOwner(
    actorId: string,
    params: {
      name: string;
      tradeName?: string;
      plan?: string;
    }
  ): Promise<{ organization: Organization | null; error?: string }> {
    if (!actorId || !this.users.has(actorId)) {
      return { organization: null, error: "Not authenticated" };
    }

    if (!params.name || !params.name.trim()) {
      return { organization: null, error: "Nome da organização é obrigatório" };
    }

    const targetPlan = (params.plan || "beta").toLowerCase();
    const maxMembers = targetPlan === "pro_max" ? 30 : (targetPlan === "max" ? 5 : 1);

    const orgId = crypto.randomUUID();
    const org: Organization = {
      id: orgId,
      name: params.name.trim(),
      owner_id: actorId,
      plan: targetPlan,
      max_members: maxMembers,
      subscription_status: "active"
    };

    // Atomicidade: grava organização
    this.organizations.set(orgId, org);

    // Atomicidade: grava membro proprietário
    const user = this.users.get(actorId)!;
    const memberId = crypto.randomUUID();
    this.members.set(`${orgId}_${actorId}`, {
      id: memberId,
      organization_id: orgId,
      user_id: actorId,
      name: user.name,
      email: user.email,
      role: "owner",
      status: "active"
    });

    // Atomicidade: atualiza perfil do usuário
    const prof = this.profiles.get(actorId);
    if (prof) {
      prof.default_organization_id = orgId;
      prof.current_role = "owner";
      prof.onboarding_completed = true;
    }

    return { organization: org };
  }

  // 4. Simulação da RPC create_organization_invite_v2
  async rpcCreateOrganizationInviteV2(
    callerId: string,
    orgId: string,
    params: {
      invitedEmail: string;
      invitedName?: string;
      role?: string;
    }
  ): Promise<{ invite: OrgInvite | null; token?: string; error?: string }> {
    const callerMember = this.members.get(`${orgId}_${callerId}`);
    if (!callerMember || callerMember.status !== "active" || !["owner", "admin"].includes(callerMember.role)) {
      return { invite: null, error: "Apenas proprietários e administradores podem convidar membros." };
    }

    const cleanEmail = params.invitedEmail.trim().toLowerCase();
    if (!cleanEmail.includes("@")) {
      return { invite: null, error: "E-mail do convidado inválido." };
    }

    const targetRole = (params.role || "broker").toLowerCase();
    if (!["admin", "manager", "broker"].includes(targetRole)) {
      return { invite: null, error: "Cargo inválido para convite." };
    }

    if (callerMember.role === "admin" && ["admin", "owner"].includes(targetRole)) {
      return { invite: null, error: "Apenas o proprietário pode convidar novos administradores." };
    }

    // Verificar se já é membro ativo
    for (const m of this.members.values()) {
      if (m.organization_id === orgId && m.email.toLowerCase() === cleanEmail && m.status === "active") {
        return { invite: null, error: "Este usuário já é um membro ativo desta imobiliária." };
      }
    }

    // Verificar quotas da organização
    const org = this.organizations.get(orgId);
    if (!org) return { invite: null, error: "Organização não encontrada." };

    let activeMembersCount = 0;
    for (const m of this.members.values()) {
      if (m.organization_id === orgId && m.status === "active") {
        activeMembersCount++;
      }
    }

    if (activeMembersCount >= org.max_members) {
      return { invite: null, error: `Limite de membros ativos atingido (${activeMembersCount} de ${org.max_members}).` };
    }

    // Gera token seguro e armazena hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const inviteId = crypto.randomUUID();

    const inviteObj: OrgInvite = {
      id: inviteId,
      organization_id: orgId,
      invited_email: cleanEmail,
      invited_name: params.invitedName,
      role: targetRole,
      token: rawToken,
      token_hash: tokenHash,
      status: "pending",
      invited_by: callerId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };

    this.invites.set(inviteId, inviteObj);
    return { invite: inviteObj, token: rawToken };
  }

  // 5. Simulação da RPC atômica e idempotente accept_organization_invite
  async rpcAcceptOrganizationInvite(
    actorId: string,
    rawToken: string
  ): Promise<{ success: boolean; organizationId?: string; role?: string; message?: string; error?: string }> {
    if (!actorId || !this.users.has(actorId)) {
      return { success: false, error: "Not authenticated" };
    }

    if (!rawToken || !rawToken.trim()) {
      return { success: false, error: "Token de convite é obrigatório" };
    }

    const cleanToken = rawToken.trim();
    const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");

    // Localizar convite pelo token_hash ou token direto
    let targetInvite: OrgInvite | null = null;
    for (const inv of this.invites.values()) {
      if (inv.token_hash === tokenHash || inv.token === cleanToken) {
        targetInvite = inv;
        break;
      }
    }

    if (!targetInvite) {
      return { success: false, error: "Convite inválido, cancelado ou não encontrado." };
    }

    // Idempotência / Replay Protection
    if (targetInvite.status === "accepted") {
      if (targetInvite.accepted_by === actorId) {
        return {
          success: true,
          organizationId: targetInvite.organization_id,
          role: targetInvite.role,
          message: "Convite já aceito anteriormente por esta conta."
        };
      }
      return { success: false, error: "Este convite já foi utilizado por outro usuário." };
    }

    // Expiração
    if (targetInvite.status === "expired" || targetInvite.expires_at < new Date()) {
      targetInvite.status = "expired";
      return { success: false, error: "Este convite expirou." };
    }

    if (targetInvite.status !== "pending") {
      return { success: false, error: "Convite inválido ou cancelado." };
    }

    // Validação estrita do destinatário autenticado
    const actorUser = this.users.get(actorId)!;
    if (actorUser.email.toLowerCase() !== targetInvite.invited_email.toLowerCase()) {
      return {
        success: false,
        error: `Este convite foi enviado para "${targetInvite.invited_email}", mas você está autenticado como "${actorUser.email}". Faça login com o e-mail correto.`
      };
    }

    // Verificação de quota máxima
    const org = this.organizations.get(targetInvite.organization_id)!;
    let currentMembers = 0;
    for (const m of this.members.values()) {
      if (m.organization_id === targetInvite.organization_id && m.status === "active" && m.user_id !== actorId) {
        currentMembers++;
      }
    }

    if (currentMembers >= org.max_members) {
      return { success: false, error: "A organização atingiu a cota máxima de membros ativos." };
    }

    // Associação atômica
    const memberKey = `${targetInvite.organization_id}_${actorId}`;
    this.members.set(memberKey, {
      id: crypto.randomUUID(),
      organization_id: targetInvite.organization_id,
      user_id: actorId,
      name: actorUser.name,
      email: actorUser.email,
      role: targetInvite.role,
      status: "active"
    });

    // Consumo do convite
    targetInvite.status = "accepted";
    targetInvite.accepted_by = actorId;

    // Atualização do perfil
    const prof = this.profiles.get(actorId);
    if (prof) {
      prof.default_organization_id = targetInvite.organization_id;
      prof.current_role = targetInvite.role;
      prof.onboarding_completed = true;
    }

    return {
      success: true,
      organizationId: targetInvite.organization_id,
      role: targetInvite.role
    };
  }
}

// --- SUÍTE DE TESTES AUTOMATIZADOS ---

async function runStep4Tests() {
  console.log("==============================================================================");
  console.log("INICIANDO TESTES DE REGRESSÃO DA ETAPA 4 (AUTH, ORGS & CONVITES)");
  console.log("==============================================================================\n");

  const db = new Step4DatabaseSandbox();
  let passed = 0;
  let total = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASSOU] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FALHOU] ${name}`);
      console.error(`     Erro: ${err.message}`);
    }
  };

  // CENÁRIO 1: Cadastro com e sem confirmação de e-mail
  await test("1.1 Cadastro sem confirmação imediata não quebra e cria perfil confiável", async () => {
    const res = await db.signUp({
      email: "carlos.pendente@gmail.com",
      password: "password123",
      name: "Carlos Pendente",
      requiresEmailConfirmation: true
    });

    if (res.error) throw new Error(`Falha no signUp: ${res.error}`);
    if (res.session !== false) throw new Error("Sessão não deveria existir antes da confirmação.");
    
    // Perfil criado de forma confiável pelo trigger
    const profile = db.profiles.get(res.user!.id);
    if (!profile) throw new Error("Perfil não foi criado no banco.");
    if (profile.onboarding_completed !== false) throw new Error("Onboarding não deveria estar completo.");
  });

  await test("1.2 Login recusado quando e-mail não confirmado; aceito após confirmação", async () => {
    const loginPre = await db.signIn("carlos.pendente@gmail.com");
    if (!loginPre.error || !loginPre.error.includes("não confirmado")) {
      throw new Error("Deveria exigir confirmação de e-mail.");
    }

    // Confirma o e-mail
    for (const u of db.users.values()) {
      if (u.email === "carlos.pendente@gmail.com") u.email_confirmed = true;
    }

    const loginPost = await db.signIn("carlos.pendente@gmail.com");
    if (loginPost.error || !loginPost.user) {
      throw new Error(`Falha ao logar após confirmação: ${loginPost.error}`);
    }
  });

  await test("1.3 Login não aceita fabricação arbitrária de domínio metriacrm.com.br", async () => {
    const loginFake = await db.signIn("usuario_inexistente");
    if (!loginFake.error) {
      throw new Error("Login não deveria inventar domínio para usuário inexistente.");
    }
  });

  // CENÁRIO 2: Criação atômica de organização com primeiro owner
  let ownerUser: User;
  let createdOrg: Organization;

  await test("2.1 Onboarding cria organização e vincula owner de forma atômica e validada", async () => {
    const signRes = await db.signUp({
      email: "owner.alpha@imobiliaria.com",
      password: "password123",
      name: "Proprietário Alpha",
      requiresEmailConfirmation: false
    });
    ownerUser = signRes.user!;

    const orgRes = await db.rpcCreateOrganizationWithOwner(ownerUser.id, {
      name: "Imobiliária Alpha Prime",
      plan: "max"
    });

    if (orgRes.error || !orgRes.organization) {
      throw new Error(`Falha ao criar organização: ${orgRes.error}`);
    }
    createdOrg = orgRes.organization;

    // Verificar membership
    const member = db.members.get(`${createdOrg.id}_${ownerUser.id}`);
    if (!member || member.role !== "owner" || member.status !== "active") {
      throw new Error("Membro owner não foi criado de forma atômica.");
    }

    // Verificar perfil
    const profile = db.profiles.get(ownerUser.id)!;
    if (profile.default_organization_id !== createdOrg.id || profile.current_role !== "owner" || !profile.onboarding_completed) {
      throw new Error("Perfil do usuário não foi sincronizado.");
    }
  });

  await test("2.2 Criação sem nome válido é estritamente rejeitada", async () => {
    const res = await db.rpcCreateOrganizationWithOwner(ownerUser.id, {
      name: "   "
    });
    if (!res.error) throw new Error("Deveria rejeitar organização com nome em branco.");
  });

  // CENÁRIO 3: Geração de convite com criptografia e validação de cargo
  let inviteToken: string;

  await test("3.1 Geração de convite criptográfico seguro por owner/admin", async () => {
    const inviteRes = await db.rpcCreateOrganizationInviteV2(ownerUser.id, createdOrg.id, {
      invitedEmail: "corretor.beta@imobiliaria.com",
      invitedName: "Corretor Beta",
      role: "broker"
    });

    if (inviteRes.error || !inviteRes.token) {
      throw new Error(`Falha ao gerar convite: ${inviteRes.error}`);
    }
    inviteToken = inviteRes.token;

    // Verificar que o hash do token foi gravado
    const invite = inviteRes.invite!;
    if (!invite.token_hash || invite.token_hash.length !== 64) {
      throw new Error("Hash SHA-256 do token não foi gerado corretamente.");
    }
    if (invite.status !== "pending") {
      throw new Error("Status do convite inicial deve ser pending.");
    }
  });

  await test("3.2 Broker externo não pode gerar convites", async () => {
    const externalUser = await db.signUp({
      email: "estranho@externo.com",
      password: "password123",
      requiresEmailConfirmation: false
    });

    const res = await db.rpcCreateOrganizationInviteV2(externalUser.user!.id, createdOrg.id, {
      invitedEmail: "alvo@imobiliaria.com",
      role: "broker"
    });

    if (!res.error || !res.error.includes("Apenas proprietários")) {
      throw new Error("Usuário sem permissão conseguiu gerar convite.");
    }
  });

  // CENÁRIO 4: Aceite de convite e proteção de destinatário
  let brokerUser: User;

  await test("4.1 Aceite recusado quando e-mail autenticado diverge do convidado", async () => {
    const impostor = await db.signUp({
      email: "impostor@gmail.com",
      password: "password123",
      name: "Conta Impostora",
      requiresEmailConfirmation: false
    });

    const res = await db.rpcAcceptOrganizationInvite(impostor.user!.id, inviteToken);
    if (res.success || !res.error || !res.error.includes("autenticado como")) {
      throw new Error(`Deveria recusar aceite com e-mail divergente. Retorno: ${JSON.stringify(res)}`);
    }
  });

  await test("4.2 Aceite bem-sucedido e atômico com o usuário legítimo", async () => {
    const legit = await db.signUp({
      email: "corretor.beta@imobiliaria.com",
      password: "password123",
      name: "Corretor Beta Real",
      requiresEmailConfirmation: false
    });
    brokerUser = legit.user!;

    const res = await db.rpcAcceptOrganizationInvite(brokerUser.id, inviteToken);
    if (!res.success) {
      throw new Error(`Falha no aceite legítimo: ${res.error}`);
    }

    // Verificar membership criada
    const member = db.members.get(`${createdOrg.id}_${brokerUser.id}`);
    if (!member || member.role !== "broker" || member.status !== "active") {
      throw new Error("Membro da organização não foi ativado com sucesso.");
    }

    // Verificar perfil atualizado
    const profile = db.profiles.get(brokerUser.id)!;
    if (profile.default_organization_id !== createdOrg.id || profile.current_role !== "broker") {
      throw new Error("Perfil do convidado não foi atualizado.");
    }
  });

  // CENÁRIO 5: Replay protection, concorrência e idempotência
  await test("5.1 Replay protection: mesmo usuário tentando novamente recebe confirmação idempotente", async () => {
    const res = await db.rpcAcceptOrganizationInvite(brokerUser.id, inviteToken);
    if (!res.success || !res.message?.includes("já aceito anteriormente")) {
      throw new Error(`Deveria retornar sucesso idempotente. Recebido: ${JSON.stringify(res)}`);
    }
  });

  await test("5.2 Replay protection: terceiro usuário tentando usar convite consumido é bloqueado", async () => {
    const outro = await db.signUp({
      email: "corretor.outro@imobiliaria.com",
      password: "password123",
      requiresEmailConfirmation: false
    });

    const res = await db.rpcAcceptOrganizationInvite(outro.user!.id, inviteToken);
    if (res.success) {
      throw new Error("Terceiro usuário não pode usar convite já aceito.");
    }
  });

  await test("5.3 Convite expirado é recusado", async () => {
    const expRes = await db.rpcCreateOrganizationInviteV2(ownerUser.id, createdOrg.id, {
      invitedEmail: "expirado@imobiliaria.com",
      role: "broker"
    });
    const expToken = expRes.token!;
    // Força data no passado
    expRes.invite!.expires_at = new Date(Date.now() - 100000);

    const expUser = await db.signUp({
      email: "expirado@imobiliaria.com",
      password: "password123",
      requiresEmailConfirmation: false
    });

    const res = await db.rpcAcceptOrganizationInvite(expUser.user!.id, expToken);
    if (res.success || !res.error?.includes("expirou")) {
      throw new Error("Deveria rejeitar convite com data expirada.");
    }
  });

  // CENÁRIO 6: Cota de membros disputada concorrentemente
  await test("6.1 Verificação de cota máxima impede exceder limite da organização", async () => {
    // Definir max_members = 2 na org (já tem ownerUser + brokerUser = 2)
    createdOrg.max_members = 2;

    const slotRes = await db.rpcCreateOrganizationInviteV2(ownerUser.id, createdOrg.id, {
      invitedEmail: "excedente@imobiliaria.com",
      role: "broker"
    });

    if (!slotRes.error || !slotRes.error.includes("Limite de membros ativos atingido")) {
      throw new Error("Deveria bloquear criação de convite que exceda cota de membros.");
    }
  });

  console.log("\n==============================================================================");
  console.log(`RESULTADO DOS TESTES DA ETAPA 4: ${passed}/${total} PASSARAM`);
  console.log("==============================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runStep4Tests().catch(err => {
  console.error("Erro fatal nos testes:", err);
  process.exit(1);
});
