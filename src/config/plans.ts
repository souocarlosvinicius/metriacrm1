import type { PlanFeature, PlanId, PlanLimits } from "../types";

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  beta: {
    id: "beta",
    name: "Plano Beta",
    displayName: "Beta",
    price: 0,
    maxActiveClients: 10,
    maxProperties: 5,
    maxMembers: 1,
    hasFullPipeline: false,
    hasWhatsappTemplates: false,
    hasCalendarTasks: true,
    hasGeminiAI: false,
    hasPropertyMatching: false,
    hasCommissionReports: false,
    hasAdvancedReports: false,
    hasTeamManagement: false,
    hasLeadDistribution: false,
    hasManagerDashboard: false,
    hasAdvancedManagerDashboard: false,
    hasLeadTransfer: false,
    hasMultipleManagers: false,
  },

  start: {
    id: "start",
    name: "Plano Start",
    displayName: "Start",
    price: 39.9,
    maxActiveClients: null,
    maxProperties: null,
    maxMembers: 1,
    hasFullPipeline: true,
    hasWhatsappTemplates: true,
    hasCalendarTasks: true,
    hasGeminiAI: false,
    hasPropertyMatching: false,
    hasCommissionReports: false,
    hasAdvancedReports: false,
    hasTeamManagement: false,
    hasLeadDistribution: false,
    hasManagerDashboard: false,
    hasAdvancedManagerDashboard: false,
    hasLeadTransfer: false,
    hasMultipleManagers: false,
  },

  pro: {
    id: "pro",
    name: "Plano Pro",
    displayName: "Pro",
    price: 79.9,
    maxActiveClients: null,
    maxProperties: null,
    maxMembers: 1,
    hasFullPipeline: true,
    hasWhatsappTemplates: true,
    hasCalendarTasks: true,
    hasGeminiAI: true,
    hasPropertyMatching: true,
    hasCommissionReports: true,
    hasAdvancedReports: false,
    hasTeamManagement: false,
    hasLeadDistribution: false,
    hasManagerDashboard: false,
    hasAdvancedManagerDashboard: false,
    hasLeadTransfer: false,
    hasMultipleManagers: false,
  },

  max: {
    id: "max",
    name: "Plano Max",
    displayName: "Max",
    price: 149.9,
    maxActiveClients: null,
    maxProperties: null,
    maxMembers: 5,
    hasFullPipeline: true,
    hasWhatsappTemplates: true,
    hasCalendarTasks: true,
    hasGeminiAI: true,
    hasPropertyMatching: true,
    hasCommissionReports: true,
    hasAdvancedReports: false,
    hasTeamManagement: true,
    hasLeadDistribution: true,
    hasManagerDashboard: true,
    hasAdvancedManagerDashboard: false,
    hasLeadTransfer: true,
    hasMultipleManagers: false,
  },

  pro_max: {
    id: "pro_max",
    name: "Plano PRO MAX",
    displayName: "PRO MAX",
    price: 999,
    maxActiveClients: null,
    maxProperties: null,
    maxMembers: 30,
    hasFullPipeline: true,
    hasWhatsappTemplates: true,
    hasCalendarTasks: true,
    hasGeminiAI: true,
    hasPropertyMatching: true,
    hasCommissionReports: true,
    hasAdvancedReports: true,
    hasTeamManagement: true,
    hasLeadDistribution: true,
    hasManagerDashboard: true,
    hasAdvancedManagerDashboard: true,
    hasLeadTransfer: true,
    hasMultipleManagers: true,
  },
};

const FEATURE_MAP: Record<PlanFeature, keyof PlanLimits> = {
  full_pipeline: "hasFullPipeline",
  whatsapp_templates: "hasWhatsappTemplates",
  calendar_tasks: "hasCalendarTasks",
  gemini_ai: "hasGeminiAI",
  property_matching: "hasPropertyMatching",
  commission_reports: "hasCommissionReports",
  advanced_reports: "hasAdvancedReports",
  team_management: "hasTeamManagement",
  lead_distribution: "hasLeadDistribution",
  manager_dashboard: "hasManagerDashboard",
  advanced_manager_dashboard: "hasAdvancedManagerDashboard",
  lead_transfer: "hasLeadTransfer",
  multiple_managers: "hasMultipleManagers",
};

export const PLAN_ORDER: PlanId[] = ["beta", "start", "pro", "max", "pro_max"];

export function getPlanLimits(planId?: PlanId | string | null): PlanLimits {
  if (!planId) {
    return PLAN_LIMITS.beta;
  }

  if (isValidPlanId(planId)) {
    return PLAN_LIMITS[planId];
  }

  return PLAN_LIMITS.beta;
}

export function isValidPlanId(planId: string): planId is PlanId {
  return ["beta", "start", "pro", "max", "pro_max"].includes(planId);
}

export function getPlanDisplayName(planId?: PlanId | string | null): string {
  return getPlanLimits(planId).displayName;
}

export function getPlanName(planId?: PlanId | string | null): string {
  return getPlanLimits(planId).name;
}

export function getPlanPrice(planId?: PlanId | string | null): number {
  return getPlanLimits(planId).price;
}

export function getMaxMembersByPlan(planId?: PlanId | string | null): number {
  return getPlanLimits(planId).maxMembers;
}

export function canUseFeature(
  planId: PlanId | string | null | undefined,
  feature: PlanFeature,
): boolean {
  const plan = getPlanLimits(planId);
  const key = FEATURE_MAP[feature];

  return Boolean(plan[key]);
}

export function canCreateClient(
  planId: PlanId | string | null | undefined,
  activeClientsCount: number,
): boolean {
  const plan = getPlanLimits(planId);

  if (plan.maxActiveClients === null) {
    return true;
  }

  return activeClientsCount < plan.maxActiveClients;
}

export function canCreateProperty(
  planId: PlanId | string | null | undefined,
  propertiesCount: number,
): boolean {
  const plan = getPlanLimits(planId);

  if (plan.maxProperties === null) {
    return true;
  }

  return propertiesCount < plan.maxProperties;
}

export function canInviteMember(
  planId: PlanId | string | null | undefined,
  activeMembersCount: number,
): boolean {
  const plan = getPlanLimits(planId);

  if (!plan.hasTeamManagement) {
    return false;
  }

  return activeMembersCount < plan.maxMembers;
}

export function formatPlanPrice(planId: PlanId | string | null | undefined): string {
  const price = getPlanPrice(planId);

  if (price === 0) {
    return "R$ 0/mês";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price) + "/mês";
}

export function getUpgradeMessage(feature: PlanFeature): string {
  switch (feature) {
    case "gemini_ai":
      return "Este recurso está disponível nos planos Pro, Max e PRO MAX.";

    case "property_matching":
      return "O cruzamento inteligente está disponível nos planos Pro, Max e PRO MAX.";

    case "commission_reports":
      return "Relatórios de comissão estão disponíveis nos planos Pro, Max e PRO MAX.";

    case "advanced_reports":
      return "Relatórios avançados estão disponíveis no Plano PRO MAX.";

    case "team_management":
      return "Gestão de equipe está disponível nos planos Max e PRO MAX.";

    case "lead_distribution":
      return "Distribuição inteligente de leads está disponível nos planos Max e PRO MAX.";

    case "manager_dashboard":
      return "Painel gestor está disponível nos planos Max e PRO MAX.";

    case "advanced_manager_dashboard":
      return "Painel gestor avançado está disponível no Plano PRO MAX.";

    case "lead_transfer":
      return "Transferência de leads está disponível nos planos Max e PRO MAX.";

    case "multiple_managers":
      return "Múltiplos gestores estão disponíveis no Plano PRO MAX.";

    default:
      return "Este recurso não está disponível no seu plano atual.";
  }
}

export function getPlanLimitMessage(
  planId: PlanId | string | null | undefined,
  limitType: "clients" | "properties" | "members",
): string {
  const plan = getPlanLimits(planId);

  if (limitType === "clients") {
    return `Seu ${plan.name} permite até ${plan.maxActiveClients ?? "clientes ilimitados"} leads ativos.`;
  }

  if (limitType === "properties") {
    return `Seu ${plan.name} permite até ${plan.maxProperties ?? "imóveis ilimitados"} imóveis cadastrados.`;
  }

  return `Seu ${plan.name} permite até ${plan.maxMembers} usuário(s) ativo(s).`;
}
