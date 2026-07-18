import { PlanId, PlanLimits } from "../types";

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
    hasMultipleManagers: false
  },
  start: {
    id: "start",
    name: "Plano Start",
    displayName: "Start",
    price: 39.90,
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
    hasMultipleManagers: false
  },
  pro: {
    id: "pro",
    name: "Plano Pro",
    displayName: "Pro",
    price: 79.90,
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
    hasMultipleManagers: false
  },
  max: {
    id: "max",
    name: "Plano Max",
    displayName: "Max",
    price: 149.90,
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
    hasMultipleManagers: false
  },
  pro_max: {
    id: "pro_max",
    name: "Plano PRO MAX",
    displayName: "PRO MAX",
    price: null,
    maxActiveClients: null,
    maxProperties: null,
    maxMembers: 99,
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
    hasMultipleManagers: true
  }
};

export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLAN_LIMITS[planId] || PLAN_LIMITS.beta;
}

export function canUseFeature(planId: PlanId, feature: keyof PlanLimits): boolean {
  const limits = getPlanLimits(planId);
  const value = limits[feature];
  return typeof value === "boolean" ? value : false;
}

export function getMaxMembersByPlan(planId: PlanId): number {
  return getPlanLimits(planId).maxMembers;
}

export function getPlanDisplayName(planId: PlanId): string {
  return getPlanLimits(planId).displayName;
}

export function getPlanPrice(planId: PlanId): number | null {
  return getPlanLimits(planId).price;
}
