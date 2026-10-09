/**
 * ==============================================================================
 * METRIA CRM - TESTES DE REGRESSÃO DE SEGURANÇA E ISOLAMENTO (ETAPA 1)
 * ==============================================================================
 *
 * Cenários avaliados:
 * 1. Primeiro owner legítimo é criado corretamente (bootstrap atômico).
 * 2. Conta externa não cria associação na organização (autoassociação genérica proibida).
 * 3. Broker não vira owner (autopromoção proibida, imutabilidade de ids, preservação de owner).
 * 4. Conta externa e conta inativa não apagam cliente da Organização A.
 * 5. Exclusão permitida continua consistente (owner/gestor/responsável com deleção em cascata).
 * 6. Cliente legado sem organização: permissão exclusiva do seu criador.
 *
 * Execução: npx tsx tests/step1_regression.test.ts
 */

interface UserSession {
  id: string;
  email: string;
  name: string;
}

interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'broker';
  status: 'active' | 'inactive';
}

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
}

interface Client {
  id: string;
  userId: string;
  organization_id?: string | null;
  assigned_to?: string | null;
  name: string;
}

interface Task {
  id: string;
  clientId: string;
  title: string;
}

// Simulador em memória das regras RLS e Triggers validadas na Migration 20261009000001
class SecuritySandbox {
  organizations: Organization[] = [];
  members: OrgMember[] = [];
  clients: Client[] = [];
  tasks: Task[] = [];

  // 1. Simulação do trigger handle_organization_bootstrap
  createOrganization(actor: UserSession, orgName: string): { org: Organization; member: OrgMember } {
    const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const org: Organization = {
      id: orgId,
      name: orgName,
      owner_id: actor.id,
      plan: 'pro_max'
    };
    this.organizations.push(org);

    // Bootstrap atômico do owner na mesma operação
    const member: OrgMember = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      organization_id: org.id,
      user_id: actor.id,
      name: actor.name,
      email: actor.email,
      role: 'owner',
      status: 'active'
    };
    this.members.push(member);

    return { org, member };
  }

  // 2. Simulação da política RLS Members INSERT (sem auth.uid() = user_id genérico)
  insertMember(actor: UserSession, newMember: { organization_id: string; user_id: string; role: any; status: any }): OrgMember {
    const org = this.organizations.find(o => o.id === newMember.organization_id);
    if (!org) throw new Error('Organização não encontrada');

    const actorMembership = this.members.find(
      m => m.organization_id === newMember.organization_id && m.user_id === actor.id && m.status === 'active'
    );
    const isActorOrgAdmin = actorMembership && ['owner', 'admin'].includes(actorMembership.role);
    const isOrgOwnerBootstrapping = org.owner_id === actor.id && newMember.user_id === actor.id && newMember.role === 'owner';

    // RLS CHECK: public.is_org_admin(org_id) OR (is_owner AND user_id = auth.uid() AND role = 'owner')
    if (!isActorOrgAdmin && !isOrgOwnerBootstrapping) {
      throw new Error('RLS VIOLATION: Permissão negada para inserir membro na organização (autoassociação não permitida)');
    }

    if (!['owner', 'admin', 'manager', 'broker'].includes(newMember.role)) {
      throw new Error('CHECK CONSTRAINT VIOLATION: Role inválido');
    }
    if (!['active', 'inactive'].includes(newMember.status)) {
      throw new Error('CHECK CONSTRAINT VIOLATION: Status inválido');
    }

    const member: OrgMember = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      organization_id: newMember.organization_id,
      user_id: newMember.user_id,
      name: `User ${newMember.user_id}`,
      email: `${newMember.user_id}@test.com`,
      role: newMember.role,
      status: newMember.status
    };
    this.members.push(member);
    return member;
  }

  // 3. Simulação do trigger check_organization_member_update
  updateMember(
    actor: UserSession,
    memberId: string,
    updates: Partial<OrgMember>
  ): OrgMember {
    const target = this.members.find(m => m.id === memberId);
    if (!target) throw new Error('Membro não encontrado');

    const org = this.organizations.find(o => o.id === target.organization_id);
    if (!org) throw new Error('Organização não encontrada');

    // Imutabilidade
    if (updates.organization_id && updates.organization_id !== target.organization_id) {
      throw new Error('TRIGGER VIOLATION: organization_id não pode ser alterado');
    }
    if (updates.user_id && updates.user_id !== target.user_id) {
      throw new Error('TRIGGER VIOLATION: user_id não pode ser alterado');
    }

    // Preservação do proprietário legítimo
    if (target.user_id === org.owner_id) {
      if (updates.role && updates.role !== 'owner') {
        throw new Error('TRIGGER VIOLATION: O proprietário legítimo não pode ser rebaixado');
      }
      if (updates.status && updates.status !== 'active') {
        throw new Error('TRIGGER VIOLATION: O proprietário legítimo não pode ser inativado');
      }
    }

    // Proibição de autopromoção / alteração do próprio cargo
    if (target.user_id === actor.id && updates.role && updates.role !== target.role) {
      throw new Error('TRIGGER VIOLATION: Autopromoção é proibida: você não pode alterar seu próprio cargo');
    }

    // Proibição de reativação própria
    if (target.user_id === actor.id && target.status === 'inactive' && updates.status === 'active') {
      throw new Error('TRIGGER VIOLATION: Reativação própria é proibida: contate um administrador');
    }

    // Hierarquia
    if ((updates.role && updates.role !== target.role) || (updates.status && updates.status !== target.status)) {
      const actorMembership = this.members.find(
        m => m.organization_id === target.organization_id && m.user_id === actor.id && m.status === 'active'
      );
      if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
        throw new Error('TRIGGER VIOLATION: Apenas proprietário ou administrador podem alterar cargos e status');
      }
      if (updates.role === 'owner' && target.role !== 'owner' && actorMembership.role !== 'owner') {
        throw new Error('TRIGGER VIOLATION: Apenas o proprietário pode conceder o cargo de proprietário');
      }
      if (actorMembership.role === 'admin' && ['admin', 'owner'].includes(target.role) && target.user_id !== actor.id) {
        throw new Error('TRIGGER VIOLATION: Administradores não podem alterar outro administrador ou o proprietário');
      }
    }

    Object.assign(target, updates);
    return target;
  }

  // 4. Simulação da função delete_client_cascade (RPC) e RLS Clients DELETE
  deleteClientCascade(actor: UserSession, clientId: string): { success: boolean; deletedId: string } {
    if (!actor.id) throw new Error('Not authenticated');

    const client = this.clients.find(c => c.id === clientId);
    if (!client) throw new Error('Client not found');

    let isAuthorized = false;

    if (client.organization_id) {
      // Vínculo ativo obrigatório na organização
      const actorMembership = this.members.find(
        m => m.organization_id === client.organization_id && m.user_id === actor.id && m.status === 'active'
      );
      if (!actorMembership) {
        throw new Error('Access denied: not an active member of this organization');
      }

      // Autorização explícita por cargo ou responsabilidade
      const userRole = actorMembership.role;
      if (['owner', 'admin', 'manager'].includes(userRole)) {
        isAuthorized = true;
      } else if (client.assigned_to === actor.id) {
        isAuthorized = true;
      } else if (client.userId === actor.id) {
        isAuthorized = true;
      }

      if (isAuthorized !== true) {
        throw new Error('Access denied: insufficient permissions to delete client');
      }
    } else {
      // Cliente legado sem organização: permissão exclusiva do criador
      if (client.userId === actor.id) {
        isAuthorized = true;
      }

      if (isAuthorized !== true) {
        throw new Error('Access denied: only owner can delete legacy client');
      }
    }

    // Exclusão em cascata atômica
    this.tasks = this.tasks.filter(t => t.clientId !== clientId);
    this.clients = this.clients.filter(c => c.id !== clientId);

    return { success: true, deletedId: clientId };
  }
}

// ------------------------------------------------------------------------------
// EXECUÇÃO DA SUÍTE DE TESTES
// ------------------------------------------------------------------------------
let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

async function runRegressionSuite() {
  console.log('\n===============================================================');
  console.log(' METRIA CRM - SUÍTE DE TESTES DE REGRESSÃO (ETAPA 1)');
  console.log('===============================================================\n');

  const sandbox = new SecuritySandbox();

  // Usuários de teste
  const userOwnerA: UserSession = { id: 'usr_owner_a', email: 'owner_a@imob.com', name: 'Carlos Owner A' };
  const userBrokerA: UserSession = { id: 'usr_broker_a', email: 'broker_a@imob.com', name: 'Bruno Broker A' };
  const userInactiveA: UserSession = { id: 'usr_inactive_a', email: 'inactive_a@imob.com', name: 'Igor Inativo A' };
  const userExternal: UserSession = { id: 'usr_external_x', email: 'external@other.com', name: 'Eduardo Externo' };
  const userOwnerB: UserSession = { id: 'usr_owner_b', email: 'owner_b@imob.com', name: 'Beatriz Owner B' };

  // ----------------------------------------------------------------------------
  // CENÁRIO 1: BOOTSTRAP ATÔMICO DO PRIMEIRO OWNER LEGÍTIMO
  // ----------------------------------------------------------------------------
  console.log('🧪 Cenário 1: Bootstrap Atômico do Primeiro Owner');
  const { org: orgA, member: ownerMemberA } = sandbox.createOrganization(userOwnerA, 'Imobiliária Alpha');
  const { org: orgB, member: ownerMemberB } = sandbox.createOrganization(userOwnerB, 'Imobiliária Beta');

  assert(orgA.owner_id === userOwnerA.id, 'Organização A possui owner_id correto');
  assert(ownerMemberA.role === 'owner', 'Primeiro membro criado possui role=owner');
  assert(ownerMemberA.status === 'active', 'Primeiro membro criado possui status=active');
  assert(ownerMemberA.organization_id === orgA.id, 'Membro vinculado corretamente à Organização A');

  // Adiciona broker e membro inativo na Org A via admin
  const brokerMemberA = sandbox.insertMember(userOwnerA, {
    organization_id: orgA.id,
    user_id: userBrokerA.id,
    role: 'broker',
    status: 'active'
  });
  const inactiveMemberA = sandbox.insertMember(userOwnerA, {
    organization_id: orgA.id,
    user_id: userInactiveA.id,
    role: 'broker',
    status: 'inactive'
  });

  // ----------------------------------------------------------------------------
  // CENÁRIO 2: CONTA EXTERNA NÃO CRIA AUTOASSOCIAÇÃO
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 2: Proibição de Autoassociação Genérica (auth.uid() = user_id)');
  let externalJoinFailed = false;
  try {
    // Conta externa tenta se auto-associar à Organização A
    sandbox.insertMember(userExternal, {
      organization_id: orgA.id,
      user_id: userExternal.id,
      role: 'broker',
      status: 'active'
    });
  } catch (err: any) {
    externalJoinFailed = err.message.includes('RLS VIOLATION');
  }
  assert(externalJoinFailed, 'Conta externa é terminantemente impedida de se autoassociar à Organização A');

  // ----------------------------------------------------------------------------
  // CENÁRIO 3: BROKER NÃO VIRA OWNER (AUTOPROMOÇÃO E HIERARQUIA)
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 3: Proibição de Autopromoção, Reativação Própria e Preservação do Owner');
  
  // 3a. Broker tenta se autopromover para owner
  let brokerSelfPromotionFailed = false;
  try {
    sandbox.updateMember(userBrokerA, brokerMemberA.id, { role: 'owner' });
  } catch (err: any) {
    brokerSelfPromotionFailed = err.message.includes('Autopromoção é proibida');
  }
  assert(brokerSelfPromotionFailed, 'Broker é impedido de se autopromover para owner');

  // 3b. Membro inativo tenta se auto-reativar
  let selfReactivationFailed = false;
  try {
    sandbox.updateMember(userInactiveA, inactiveMemberA.id, { status: 'active' });
  } catch (err: any) {
    selfReactivationFailed = err.message.includes('Reativação própria é proibida');
  }
  assert(selfReactivationFailed, 'Membro inativo é impedido de se auto-reativar');

  // 3c. Tentativa de rebaixar ou inativar o owner legítimo
  let demoteOwnerFailed = false;
  try {
    sandbox.updateMember(userOwnerA, ownerMemberA.id, { role: 'broker' });
  } catch (err: any) {
    demoteOwnerFailed = err.message.includes('proprietário legítimo não pode ser rebaixado');
  }
  assert(demoteOwnerFailed, 'Proprietário legítimo não pode ser rebaixado');

  // 3d. Tentativa de alterar organization_id ou user_id (imutabilidade)
  let immutableOrgFailed = false;
  try {
    sandbox.updateMember(userOwnerA, brokerMemberA.id, { organization_id: orgB.id });
  } catch (err: any) {
    immutableOrgFailed = err.message.includes('organization_id não pode ser alterado');
  }
  assert(immutableOrgFailed, 'organization_id é estritamente imutável');

  // ----------------------------------------------------------------------------
  // CENÁRIO 4: CONTA EXTERNA E CONTA INATIVA NÃO APAGAM CLIENTE DE A
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 4: Bloqueio de Exclusão Indevida por Usuário Externo ou Inativo');
  
  // Cria cliente na Org A
  const clientA1: Client = {
    id: 'cli_org_a_1',
    userId: userBrokerA.id,
    organization_id: orgA.id,
    assigned_to: userBrokerA.id,
    name: 'Cliente Alpha 1'
  };
  sandbox.clients.push(clientA1);
  sandbox.tasks.push({ id: 'task_1', clientId: clientA1.id, title: 'Follow-up' });

  // 4a. Usuário externo tenta excluir cliente da Org A
  let externalDeleteFailed = false;
  try {
    sandbox.deleteClientCascade(userExternal, clientA1.id);
  } catch (err: any) {
    externalDeleteFailed = err.message.includes('Access denied');
  }
  assert(externalDeleteFailed, 'Conta externa não consegue apagar cliente da Organização A');
  assert(sandbox.clients.some(c => c.id === clientA1.id), 'Cliente de A permanece intacto após tentativa externa');

  // 4b. Membro inativo tenta excluir cliente da Org A
  let inactiveDeleteFailed = false;
  try {
    sandbox.deleteClientCascade(userInactiveA, clientA1.id);
  } catch (err: any) {
    inactiveDeleteFailed = err.message.includes('Access denied');
  }
  assert(inactiveDeleteFailed, 'Membro inativo não consegue apagar cliente de A mesmo com ID conhecido');

  // ----------------------------------------------------------------------------
  // CENÁRIO 5: EXCLUSÃO PERMITIDA CONTINUA CONSISTENTE (CASCADE ATÔMICO)
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 5: Exclusão Autorizada e Consistência de Cascata');
  
  // Owner de A exclui cliente de A
  const deleteResult = sandbox.deleteClientCascade(userOwnerA, clientA1.id);
  assert(deleteResult.success === true, 'Owner de A exclui cliente com sucesso');
  assert(!sandbox.clients.some(c => c.id === clientA1.id), 'Cliente removido da base');
  assert(!sandbox.tasks.some(t => t.clientId === clientA1.id), 'Dependências em cascata (tasks) removidas atomicamente');

  // ----------------------------------------------------------------------------
  // CENÁRIO 6: CLIENTE LEGADO SEM ORGANIZAÇÃO
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 6: Cliente Legado Sem Organização');
  const legacyClient: Client = {
    id: 'cli_legacy_1',
    userId: userBrokerA.id,
    organization_id: null,
    name: 'Cliente Legado de Bruno'
  };
  sandbox.clients.push(legacyClient);

  // Usuário externo tenta excluir cliente legado
  let externalLegacyFailed = false;
  try {
    sandbox.deleteClientCascade(userExternal, legacyClient.id);
  } catch (err: any) {
    externalLegacyFailed = err.message.includes('Access denied');
  }
  assert(externalLegacyFailed, 'Usuário externo não pode excluir cliente legado');

  // Criador original do cliente legado exclui com sucesso
  const legacyDeleteResult = sandbox.deleteClientCascade(userBrokerA, legacyClient.id);
  assert(legacyDeleteResult.success === true, 'Criador original do cliente legado exclui com sucesso');
  assert(!sandbox.clients.some(c => c.id === legacyClient.id), 'Cliente legado removido com sucesso');

  // ----------------------------------------------------------------------------
  // SUMÁRIO DOS TESTES
  // ----------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(` RESULTADO FINAL: ${passedTests}/${totalTests} testes aprovados.`);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runRegressionSuite().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
