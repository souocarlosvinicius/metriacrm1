import { Client, Task, Proposal, Visit } from "../types";

export interface Alert {
  id: string;
  title: string;
  description: string;
  level: "Atenção" | "Urgente" | "Crítico";
  ruleId: number;
}

// Helper to safely parse any date string into a timestamp
export function safeParseDate(dateStr?: string): number {
  if (!dateStr) return 0;
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) return parsed;
  
  // Try YYYY-MM-DD parsing manually if needed
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.getTime();
  }
  return 0;
}

/**
 * Evaluates the 5 commercial routine rules for a given client and returns all active alerts.
 */
export function getClientAlerts(
  client: Client,
  allTasks: Task[] = [],
  allProposals: Proposal[] = [],
  allVisits: Visit[] = []
): Alert[] {
  const alerts: Alert[] = [];
  const clientId = client.id || client._id?.toString() || "";
  const clientNameLower = (client.name || "").toLowerCase();

  // Helper to check if a task belongs to this client
  const clientTasks = allTasks.filter(t => {
    const matchesId = t.clientId === clientId || (client._id && t.clientId === client._id.toString());
    const matchesName = t.clientName && t.clientName.toLowerCase() === clientNameLower;
    return matchesId || matchesName;
  });

  // Helper to check if a proposal belongs to this client
  const clientProposals = allProposals.filter(p => {
    const matchesId = p.clientId === clientId || (client._id && p.clientId === client._id.toString());
    const matchesName = p.clientName && p.clientName.toLowerCase() === clientNameLower;
    return matchesId || matchesName;
  });

  // Helper to check if a visit belongs to this client
  const clientVisits = allVisits.filter(v => {
    const matchesId = v.clientId === clientId || (client._id && v.clientId === client._id.toString());
    const matchesName = v.clientName && v.clientName.toLowerCase() === clientNameLower;
    return matchesId || matchesName;
  });

  // General timestamps and values
  const now = Date.now();
  const todayStr = new Date().toISOString().split("T")[0];

  const clientCreationTime = client.createdAt 
    ? safeParseDate(client.createdAt) 
    : (client.history && client.history.length > 0 ? safeParseDate(client.history[0].date) : now);

  const hasCompletedTask = clientTasks.some(t => t.completed);
  const hasHistoryContact = client.history?.some(h => 
    h.type === "whatsapp" || h.type === "task_completed" || h.type === "visit_scheduled" || h.type === "proposal_sent" || h.type === "observation"
  );
  const hasAnyContact = hasCompletedTask || hasHistoryContact;

  const hasPendingTask = clientTasks.some(t => !t.completed);

  // Determine last interaction time
  let lastActivityTime = clientCreationTime;
  if (client.updatedAt) {
    lastActivityTime = Math.max(lastActivityTime, safeParseDate(client.updatedAt));
  }
  clientTasks.forEach(t => {
    if (t.completed && t.createdAt) {
      lastActivityTime = Math.max(lastActivityTime, safeParseDate(t.createdAt));
    }
  });
  client.history?.forEach(h => {
    lastActivityTime = Math.max(lastActivityTime, safeParseDate(h.date));
  });

  const timeSinceLastActivity = now - lastActivityTime;

  // -------------------------------------------------------------
  // RULE 1: Lead novo sem contato por mais de 24 horas deve aparecer como "Sem primeiro contato".
  // -------------------------------------------------------------
  const isLeadNovo = client.status && client.status.toLowerCase() === "novo";
  const over24hFromCreation = (now - clientCreationTime) > 24 * 60 * 60 * 1000;
  
  if (isLeadNovo && over24hFromCreation && !hasAnyContact) {
    alerts.push({
      id: `${clientId}-rule1`,
      title: "Sem primeiro contato",
      description: "Lead novo criado há mais de 24 horas sem nenhum registro de contato ou tarefa concluída.",
      level: "Urgente",
      ruleId: 1
    });
  }

  // -------------------------------------------------------------
  // RULE 2: Cliente em atendimento sem nova ação por mais de 48 horas deve aparecer como "Follow-up recomendado".
  // -------------------------------------------------------------
  const isInAtendimento = client.status && client.status.toLowerCase() === "em atendimento";
  const over48hFromLastActivity = timeSinceLastActivity > 48 * 60 * 60 * 1000;

  if (isInAtendimento && over48hFromLastActivity) {
    alerts.push({
      id: `${clientId}-rule2`,
      title: "Follow-up recomendado",
      description: "Cliente em atendimento sem nenhuma nova atividade comercial registrada há mais de 48 horas.",
      level: "Atenção",
      ruleId: 2
    });
  }

  // -------------------------------------------------------------
  // RULE 3: Proposta enviada sem retorno por mais de 72 horas deve aparecer como "Cobrar proposta".
  // -------------------------------------------------------------
  const hasStalledProposal = clientProposals.some(p => {
    const isAwaitingFeedback = p.status === "Pendente" || p.status === "Em Análise";
    const propTime = safeParseDate(p.date);
    const over72h = (now - propTime) > 72 * 60 * 60 * 1000;
    return isAwaitingFeedback && over72h;
  });

  if (hasStalledProposal) {
    alerts.push({
      id: `${clientId}-rule3`,
      title: "Cobrar proposta",
      description: "Proposta comercial enviada há mais de 72 horas sem retorno ou atualização de status.",
      level: "Crítico",
      ruleId: 3
    });
  }

  // -------------------------------------------------------------
  // RULE 4: Visita realizada sem pós-atendimento por mais de 24 horas deve aparecer como "Fazer pós-visita".
  // -------------------------------------------------------------
  const hasStalledVisit = clientVisits.some(v => {
    if (v.status !== "Realizada") return false;
    const visitTime = safeParseDate(v.date);
    const over24h = (now - visitTime) > 24 * 60 * 60 * 1000;
    if (!over24h) return false;

    const hasFeedback = v.feedback && v.feedback.trim().length > 0;
    // Check if there's any task completed on or after the visit date
    const hasSubsequentCompletedTask = clientTasks.some(t => t.completed && safeParseDate(t.date) >= visitTime);
    return !hasFeedback && !hasSubsequentCompletedTask;
  });

  if (hasStalledVisit) {
    alerts.push({
      id: `${clientId}-rule4`,
      title: "Fazer pós-visita",
      description: "Visita realizada há mais de 24 horas sem feedback registrado ou ação de pós-visita concluída.",
      level: "Urgente",
      ruleId: 4
    });
  }

  // -------------------------------------------------------------
  // RULE 5: Negociação sem próxima ação definida deve aparecer como "Sem próxima ação".
  // -------------------------------------------------------------
  const isActiveNegotiation = client.status && 
    client.status.toLowerCase() !== "ganho" && 
    client.status.toLowerCase() !== "perdido";

  if (isActiveNegotiation && !hasPendingTask) {
    alerts.push({
      id: `${clientId}-rule5`,
      title: "Sem próxima ação",
      description: "O negócio está ativo, mas não há nenhuma atividade comercial ou follow-up pendente na sua agenda.",
      level: "Atenção",
      ruleId: 5
    });
  }

  return alerts;
}

/**
 * Returns visual settings (colors, badges, icons) based on alert level
 */
export function getAlertBadgeStyles(level: "Atenção" | "Urgente" | "Crítico") {
  switch (level) {
    case "Crítico":
      return {
        bg: "bg-red-50 border-red-200 text-red-800",
        badge: "bg-red-600 text-white",
        text: "text-red-700",
        border: "border-red-200",
        iconColor: "text-red-600",
        ring: "ring-red-100"
      };
    case "Urgente":
      return {
        bg: "bg-orange-50 border-orange-200 text-orange-800",
        badge: "bg-orange-600 text-white",
        text: "text-orange-700",
        border: "border-orange-200",
        iconColor: "text-orange-600",
        ring: "ring-orange-100"
      };
    case "Atenção":
      return {
        bg: "bg-amber-50 border-amber-200 text-amber-800",
        badge: "bg-amber-500 text-white",
        text: "text-amber-700",
        border: "border-amber-200",
        iconColor: "text-amber-600",
        ring: "ring-amber-100"
      };
  }
}
