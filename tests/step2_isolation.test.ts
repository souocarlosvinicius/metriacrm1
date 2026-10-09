/**
 * ==============================================================================
 * METRIA CRM - TESTES DE REGRESSÃO DE ISOLAMENTO E INTEGRIDADE (ETAPA 2)
 * ==============================================================================
 *
 * Cenários avaliados:
 * 1. Usuário de A não consulta nem modifica registros da Organização B.
 * 2. Criador não move registro para B (imutabilidade de organization_id e userId).
 * 3. Atividade de A não referencia cliente ou imóvel da Organização B (integridade de tenant).
 * 4. Corretor inativo perde acesso mesmo com token/sessão válido.
 * 5. Transferência legítima de leads funciona e NÃO concede cargo ao destinatário.
 * 6. Nenhum update parcial é informado como sucesso (transacionalidade total).
 *
 * Execução: npx tsx tests/step2_isolation.test.ts
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
  organization_id: string | null;
  assigned_to: string | null;
  name: string;
  history: any[];
}

interface Property {
  id: string;
  userId: string;
  organization_id: string | null;
  assigned_to: string | null;
  ownerId?: string | null;
  title: string;
}

interface Task {
  id: string;
  userId: string;
  organization_id: string | null;
  assigned_to: string | null;
  clientId?: string | null;
  propertyId?: string | null;
  title: string;
}

// Sandbox com implementação das regras dos triggers e políticas RLS da Etapa 2
class IsolationSandbox {
  organizations: Organization[] = [];
  members: OrgMember[] = [];
  clients: Client[] = [];
  properties: Property[] = [];
  tasks: Task[] = [];

  // Helper para verificar associação ativa
  isOrgMember(orgId: string, userId: string): boolean {
    return this.members.some(
      m => m.organization_id === orgId && m.user_id === userId && m.status === 'active'
    );
  }

  getMemberRole(orgId: string, userId: string): string | null {
    const m = this.members.find(
      m => m.organization_id === orgId && m.user_id === userId && m.status === 'active'
    );
    return m ? m.role : null;
  }

  isManagerOrHigher(orgId: string, userId: string): boolean {
    const role = this.getMemberRole(orgId, userId);
    return role ? ['owner', 'admin', 'manager'].includes(role) : false;
  }

  // 1. SELECT Clients (RLS)
  selectClients(actor: UserSession, orgFilter?: string): Client[] {
    return this.clients.filter(c => {
      if (c.organization_id === null) {
        return c.userId === actor.id;
      }
      if (orgFilter && c.organization_id !== orgFilter) {
        return false;
      }
      // EXIGE vínculo ativo antes de avaliar papéis ou criador
      if (!this.isOrgMember(c.organization_id, actor.id)) {
        return false;
      }
      if (this.isManagerOrHigher(c.organization_id, actor.id)) {
        return true;
      }
      return c.assigned_to === actor.id || c.userId === actor.id;
    });
  }

  // 2. UPDATE Client com validação de RLS e Triggers
  updateClient(
    actor: UserSession,
    clientId: string,
    updates: Partial<Client>
  ): Client {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) throw new Error('Cliente não encontrado');

    // RLS check
    if (client.organization_id !== null) {
      if (!this.isOrgMember(client.organization_id, actor.id)) {
        throw new Error('RLS VIOLATION: Acesso negado: vínculo inativo ou ausente na organização');
      }
      const isManager = this.isManagerOrHigher(client.organization_id, actor.id);
      if (!isManager && client.assigned_to !== actor.id && client.userId !== actor.id) {
        throw new Error('RLS VIOLATION: Permissão insuficiente para editar cliente');
      }
    } else {
      if (client.userId !== actor.id) {
        throw new Error('RLS VIOLATION: Apenas o criador pode editar cliente legado');
      }
    }

    // Trigger de imutabilidade: enforce_tenant_record_immutability
    if (client.organization_id !== null && updates.organization_id !== undefined && updates.organization_id !== client.organization_id) {
      throw new Error('TRIGGER VIOLATION: organization_id é imutável: movimentação direta de registro entre organizações é proibida');
    }
    if (updates.userId !== undefined && updates.userId !== client.userId) {
      throw new Error('TRIGGER VIOLATION: O criador original do registro (userId) é imutável');
    }

    // Trigger de integridade: check_cross_tenant_integrity
    if (updates.assigned_to !== undefined && updates.assigned_to !== null) {
      if (client.organization_id !== null && !this.isOrgMember(client.organization_id, updates.assigned_to)) {
        throw new Error('TRIGGER VIOLATION: Violação de tenant: o usuário responsável (assigned_to) não é membro ativo desta organização');
      }
    }

    Object.assign(client, updates);
    return client;
  }

  // 3. INSERT Task com validação de RLS e Triggers
  insertTask(actor: UserSession, taskData: Omit<Task, 'id'>): Task {
    if (taskData.organization_id !== null) {
      if (!this.isOrgMember(taskData.organization_id, actor.id)) {
        throw new Error('RLS VIOLATION: Acesso negado: não é membro ativo da organização');
      }
      if (taskData.userId !== actor.id) {
        throw new Error('RLS VIOLATION: userId deve corresponder ao usuário autenticado');
      }

      // Trigger de integridade cross-tenant
      if (taskData.clientId) {
        const client = this.clients.find(c => c.id === taskData.clientId);
        if (!client || client.organization_id !== taskData.organization_id) {
          throw new Error('TRIGGER VIOLATION: Violação de tenant: o cliente relacionado não pertence a esta organização');
        }
      }

      if (taskData.propertyId) {
        const prop = this.properties.find(p => p.id === taskData.propertyId);
        if (!prop || prop.organization_id !== taskData.organization_id) {
          throw new Error('TRIGGER VIOLATION: Violação de tenant: o imóvel relacionado não pertence a esta organização');
        }
      }

      if (taskData.assigned_to) {
        if (!this.isOrgMember(taskData.organization_id, taskData.assigned_to)) {
          throw new Error('TRIGGER VIOLATION: Violação de tenant: o usuário responsável não é membro ativo desta organização');
        }
      }
    } else {
      if (taskData.userId !== actor.id) {
        throw new Error('RLS VIOLATION: userId deve corresponder ao usuário');
      }
    }

    const newTask: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ...taskData
    };
    this.tasks.push(newTask);
    return newTask;
  }

  // 4. RPC de transferência atômica de leads (transfer_client_assignment)
  transferClientAssignment(
    actor: UserSession,
    clientIds: string[],
    targetBrokerId: string,
    orgId: string
  ): { success: boolean; transferredCount: number } {
    // Valida autenticação e cargo do ator
    const actorRole = this.getMemberRole(orgId, actor.id);
    if (!actorRole || !['owner', 'admin', 'manager'].includes(actorRole)) {
      throw new Error('RPC VIOLATION: Acesso negado: apenas proprietários, administradores ou gestores ativos podem transferir clientes');
    }

    // Valida plano da organização
    const org = this.organizations.find(o => o.id === orgId);
    if (!org || !['max', 'pro_max'].includes(org.plan)) {
      throw new Error('RPC VIOLATION: Transferência de leads está disponível apenas nos planos Max e PRO MAX');
    }

    // Valida destinatário: deve ser membro ATIVO da MESMA organização
    const targetMember = this.members.find(
      m => m.organization_id === orgId && m.user_id === targetBrokerId && m.status === 'active'
    );
    if (!targetMember) {
      throw new Error('RPC VIOLATION: O corretor destinatário não é um membro ativo desta organização');
    }

    // Guardar o cargo original do corretor para certificar que NÃO é alterado
    const originalRoleBeforeTransfer = targetMember.role;

    // PRE-FLIGHT CHECK ATÔMICO: Todos os clientes devem existir e pertencer estritamente à orgId
    for (const cId of clientIds) {
      const client = this.clients.find(c => c.id === cId);
      if (!client) {
        throw new Error(`RPC VIOLATION: Cliente ${cId} não encontrado`);
      }
      if (client.organization_id !== orgId) {
        throw new Error(`RPC VIOLATION: Cliente ${cId} não pertence à organização informada`);
      }
    }

    // Execução da transferência se todos foram validados
    for (const cId of clientIds) {
      const client = this.clients.find(c => c.id === cId)!;
      client.assigned_to = targetBrokerId;
      client.history.push({
        type: 'transfer',
        date: new Date().toISOString(),
        description: `Lead transferido para o corretor ${targetMember.name}`,
        userName: actor.name
      });
    }

    // Garante que o papel do corretor destinatário permanece inalterado
    if (targetMember.role !== originalRoleBeforeTransfer) {
      throw new Error('CRITICAL INVARIANT VIOLATION: A transferência alterou indevidamente o cargo do membro');
    }

    return { success: true, transferredCount: clientIds.length };
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

async function runStep2TestSuite() {
  console.log('\n===============================================================');
  console.log(' METRIA CRM - TESTES DE ISOLAMENTO E INTEGRIDADE (ETAPA 2)');
  console.log('===============================================================\n');

  const sandbox = new IsolationSandbox();

  // Usuários de teste
  const userOwnerA: UserSession = { id: 'usr_owner_a', email: 'owner_a@alpha.com', name: 'Alfeu Owner A' };
  const userBrokerA: UserSession = { id: 'usr_broker_a', email: 'broker_a@alpha.com', name: 'Bernardo Broker A' };
  const userBrokerA2: UserSession = { id: 'usr_broker_a2', email: 'broker_a2@alpha.com', name: 'Caio Broker A2' };
  const userOwnerB: UserSession = { id: 'usr_owner_b', email: 'owner_b@beta.com', name: 'Beatriz Owner B' };
  const userBrokerB: UserSession = { id: 'usr_broker_b', email: 'broker_b@beta.com', name: 'Breno Broker B' };

  // Organizações
  const orgA: Organization = { id: 'org_alpha', name: 'Imobiliária Alpha', owner_id: userOwnerA.id, plan: 'pro_max' };
  const orgB: Organization = { id: 'org_beta', name: 'Imobiliária Beta', owner_id: userOwnerB.id, plan: 'pro_max' };
  sandbox.organizations.push(orgA, orgB);

  // Membros da Org A
  const memberOwnerA: OrgMember = { id: 'm_oa', organization_id: orgA.id, user_id: userOwnerA.id, name: userOwnerA.name, email: userOwnerA.email, role: 'owner', status: 'active' };
  const memberBrokerA: OrgMember = { id: 'm_ba', organization_id: orgA.id, user_id: userBrokerA.id, name: userBrokerA.name, email: userBrokerA.email, role: 'broker', status: 'active' };
  const memberBrokerA2: OrgMember = { id: 'm_ba2', organization_id: orgA.id, user_id: userBrokerA2.id, name: userBrokerA2.name, email: userBrokerA2.email, role: 'broker', status: 'active' };
  sandbox.members.push(memberOwnerA, memberBrokerA, memberBrokerA2);

  // Membros da Org B
  const memberOwnerB: OrgMember = { id: 'm_ob', organization_id: orgB.id, user_id: userOwnerB.id, name: userOwnerB.name, email: userOwnerB.email, role: 'owner', status: 'active' };
  const memberBrokerB: OrgMember = { id: 'm_bb', organization_id: orgB.id, user_id: userBrokerB.id, name: userBrokerB.name, email: userBrokerB.email, role: 'broker', status: 'active' };
  sandbox.members.push(memberOwnerB, memberBrokerB);

  // Dados iniciais de A e B
  const clientA1: Client = { id: 'cli_a1', userId: userOwnerA.id, organization_id: orgA.id, assigned_to: userBrokerA.id, name: 'Cliente de Alpha', history: [] };
  const clientB1: Client = { id: 'cli_b1', userId: userOwnerB.id, organization_id: orgB.id, assigned_to: userBrokerB.id, name: 'Cliente de Beta', history: [] };
  sandbox.clients.push(clientA1, clientB1);

  const propA1: Property = { id: 'prop_a1', userId: userOwnerA.id, organization_id: orgA.id, assigned_to: userBrokerA.id, title: 'Apartamento Jardins Alpha' };
  const propB1: Property = { id: 'prop_b1', userId: userOwnerB.id, organization_id: orgB.id, assigned_to: userBrokerB.id, title: 'Casa Centro Beta' };
  sandbox.properties.push(propA1, propB1);

  // ----------------------------------------------------------------------------
  // CENÁRIO 1: USUÁRIO DE A NÃO CONSULTA NEM MODIFICA DADOS DE B
  // ----------------------------------------------------------------------------
  console.log('🧪 Cenário 1: Isolamento de Leitura e Escrita entre Organizações A e B');
  
  // 1a. Usuário de A consulta clientes
  const clientsSeenByOwnerA = sandbox.selectClients(userOwnerA);
  assert(
    clientsSeenByOwnerA.some(c => c.id === clientA1.id) && !clientsSeenByOwnerA.some(c => c.id === clientB1.id),
    'Owner de A visualiza cliente de A e NÃO visualiza cliente de B'
  );

  const clientsSeenByBrokerA = sandbox.selectClients(userBrokerA);
  assert(
    clientsSeenByBrokerA.some(c => c.id === clientA1.id) && !clientsSeenByBrokerA.some(c => c.id === clientB1.id),
    'Broker de A visualiza lead atribuído em A e NÃO visualiza lead de B'
  );

  // 1b. Usuário de A tenta modificar cliente de B diretamente
  let crossOrgUpdateBlocked = false;
  try {
    sandbox.updateClient(userOwnerA, clientB1.id, { name: 'Tentativa de Hack por A' });
  } catch (err: any) {
    crossOrgUpdateBlocked = err.message.includes('RLS VIOLATION');
  }
  assert(crossOrgUpdateBlocked, 'Usuário de A é bloqueado ao tentar modificar registro pertencente a B');
  assert(clientB1.name === 'Cliente de Beta', 'Registro de B permanece inalterado');

  // ----------------------------------------------------------------------------
  // CENÁRIO 2: CRIADOR NÃO MOVE REGISTRO PARA OUTRA ORGANIZAÇÃO
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 2: Imutabilidade de organization_id e userId no CRUD Comum');

  let moveOrgBlocked = false;
  try {
    // Criador tenta mover clientA1 para orgB
    sandbox.updateClient(userOwnerA, clientA1.id, { organization_id: orgB.id });
  } catch (err: any) {
    moveOrgBlocked = err.message.includes('TRIGGER VIOLATION') && err.message.includes('organization_id é imutável');
  }
  assert(moveOrgBlocked, 'Criador é impedido de mover registro para outra organização via CRUD');

  let changeCreatorBlocked = false;
  try {
    // Tentativa de alterar criador original
    sandbox.updateClient(userOwnerA, clientA1.id, { userId: userBrokerA.id });
  } catch (err: any) {
    changeCreatorBlocked = err.message.includes('TRIGGER VIOLATION') && err.message.includes('userId');
  }
  assert(changeCreatorBlocked, 'Tentativa de alterar o criador original (userId) é bloqueada');

  // ----------------------------------------------------------------------------
  // CENÁRIO 3: ATIVIDADE DE A NÃO REFERENCIA CLIENTE OU IMÓVEL DE B
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 3: Integridade Referencial Multi-Tenant (Cross-Tenant Reference Block)');

  // 3a. Atividade de A tenta referenciar cliente de B
  let taskCrossClientBlocked = false;
  try {
    sandbox.insertTask(userOwnerA, {
      userId: userOwnerA.id,
      organization_id: orgA.id,
      assigned_to: userBrokerA.id,
      clientId: clientB1.id, // Cliente de B!
      title: 'Visita suspeita'
    });
  } catch (err: any) {
    taskCrossClientBlocked = err.message.includes('Violação de tenant: o cliente relacionado não pertence a esta organização');
  }
  assert(taskCrossClientBlocked, 'Atividade da Org A é terminantemente impedida de referenciar cliente da Org B');

  // 3b. Atividade de A tenta referenciar imóvel de B
  let taskCrossPropertyBlocked = false;
  try {
    sandbox.insertTask(userOwnerA, {
      userId: userOwnerA.id,
      organization_id: orgA.id,
      assigned_to: userBrokerA.id,
      clientId: clientA1.id,
      propertyId: propB1.id, // Imóvel de B!
      title: 'Vistoria ilegal'
    });
  } catch (err: any) {
    taskCrossPropertyBlocked = err.message.includes('Violação de tenant: o imóvel relacionado não pertence a esta organização');
  }
  assert(taskCrossPropertyBlocked, 'Atividade da Org A é terminantemente impedida de referenciar imóvel da Org B');

  // 3c. Atividade de A tenta atribuir responsável da Org B
  let taskCrossAssigneeBlocked = false;
  try {
    sandbox.insertTask(userOwnerA, {
      userId: userOwnerA.id,
      organization_id: orgA.id,
      assigned_to: userBrokerB.id, // Corretor de B!
      clientId: clientA1.id,
      title: 'Tarefa com corretor externo'
    });
  } catch (err: any) {
    taskCrossAssigneeBlocked = err.message.includes('não é membro ativo desta organização');
  }
  assert(taskCrossAssigneeBlocked, 'Atividade da Org A é impedida de designar responsável de outra organização');

  // ----------------------------------------------------------------------------
  // CENÁRIO 4: CORRETOR INATIVO PERDE ACESSO MESMO COM TOKEN VÁLIDO
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 4: Corte Imediato de Acesso para Corretor Desativado');

  // Desativa o corretor Bernardo da Org A
  memberBrokerA.status = 'inactive';

  // Corretor inativo tenta consultar clientes
  const clientsSeenByInactive = sandbox.selectClients(userBrokerA);
  assert(clientsSeenByInactive.length === 0, 'Corretor desativado tem acesso de leitura cortado imediatamente (0 registros)');

  // Corretor inativo tenta modificar cliente
  let inactiveUpdateBlocked = false;
  try {
    sandbox.updateClient(userBrokerA, clientA1.id, { name: 'Update por inativo' });
  } catch (err: any) {
    inactiveUpdateBlocked = err.message.includes('RLS VIOLATION') && err.message.includes('vínculo inativo');
  }
  assert(inactiveUpdateBlocked, 'Corretor inativo tem atualização bloqueada por RLS e camada de serviço');

  // Reativa para os testes subsequentes
  memberBrokerA.status = 'active';

  // ----------------------------------------------------------------------------
  // CENÁRIO 5: TRANSFERÊNCIA LEGÍTIMA DE LEADS (E NÃO CONCEDE CARGO)
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 5: Transferência Legítima de Leads e Preservação de Cargos');

  const clientA2: Client = { id: 'cli_a2', userId: userOwnerA.id, organization_id: orgA.id, assigned_to: userBrokerA.id, name: 'Lead Secundário Alpha', history: [] };
  sandbox.clients.push(clientA2);

  // Owner transfere leads cli_a1 e cli_a2 para o corretor Caio (userBrokerA2)
  const transferRes = sandbox.transferClientAssignment(
    userOwnerA,
    [clientA1.id, clientA2.id],
    userBrokerA2.id,
    orgA.id
  );

  assert(transferRes.success === true && transferRes.transferredCount === 2, 'Transferência de 2 leads executada com sucesso');
  assert(clientA1.assigned_to === userBrokerA2.id && clientA2.assigned_to === userBrokerA2.id, 'Leads foram corretamente atribuídos ao corretor destino');
  assert(memberBrokerA2.role === 'broker', 'INVARIANTE CONFIRMADO: Corretor destino permaneceu como broker e NÃO recebeu cargo administrativo');
  assert(clientA1.history.some(h => h.type === 'transfer'), 'Histórico do lead registrou a transferência adequadamente');

  // ----------------------------------------------------------------------------
  // CENÁRIO 6: NENHUM UPDATE PARCIAL É INFORMADO COMO SUCESSO (TRANSAÇÃO TOTAL)
  // ----------------------------------------------------------------------------
  console.log('\n🧪 Cenário 6: Bloqueio de Sucesso Parcial em Lote (Transacionalidade Estrita)');

  const clientA3: Client = { id: 'cli_a3', userId: userOwnerA.id, organization_id: orgA.id, assigned_to: userBrokerA.id, name: 'Lead Alpha 3', history: [] };
  sandbox.clients.push(clientA3);

  // Tentativa de transferir lote contendo cli_a3 (de A) e cli_b1 (de B)
  let batchWithAlienFailed = false;
  try {
    sandbox.transferClientAssignment(
      userOwnerA,
      [clientA3.id, clientB1.id], // Lote contaminado com cliente de B!
      userBrokerA2.id,
      orgA.id
    );
  } catch (err: any) {
    batchWithAlienFailed = err.message.includes('não pertence à organização informada');
  }

  assert(batchWithAlienFailed, 'Transferência em lote com cliente alienígena é completamente rejeitada');
  assert(clientA3.assigned_to === userBrokerA.id, 'Rollback total: o lead válido de A NÃO foi alterado (nenhum update parcial)');

  // ----------------------------------------------------------------------------
  // SUMÁRIO DOS TESTES
  // ----------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(` RESULTADO FINAL (ETAPA 2): ${passedTests}/${totalTests} testes aprovados.`);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runStep2TestSuite().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
