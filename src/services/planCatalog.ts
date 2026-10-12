/**
 * ==============================================================================
 * METRIA CRM - CATÁLOGO DE PLANOS E PREÇOS DO SERVIDOR (AUTORITATIVO)
 * ==============================================================================
 * O navegador NUNCA dita preço, ciclo de cobrança ou limites.
 * O navegador envia apenas o identificador do plano (planId) e ciclo desejado.
 * Os valores reais de cobrança vêm exclusivamente desta fonte da verdade.
 */

import { BillingPlanId, BillingCycle } from "../types/billing";

export interface ServerPlanDefinition {
  id: BillingPlanId;
  name: string;
  displayName: string;
  description: string;
  maxMembers: number;
  features: {
    hasFullPipeline: boolean;
    hasWhatsappTemplates: boolean;
    hasCalendarTasks: boolean;
    hasGeminiAI: boolean;
    hasPropertyMatching: boolean;
    hasCommissionReports: boolean;
    hasAdvancedReports: boolean;
    hasTeamManagement: boolean;
    hasLeadDistribution: boolean;
    hasManagerDashboard: boolean;
    hasAdvancedManagerDashboard: boolean;
    hasLeadTransfer: boolean;
    hasMultipleManagers: boolean;
  };
  prices: Record<BillingCycle, number>;
}

export const SERVER_PLAN_CATALOG: Record<BillingPlanId, ServerPlanDefinition> = {
  start: {
    id: "start",
    name: "Plano Start",
    displayName: "Start",
    description: "Ideal para o corretor independente com pipeline ilimitado e agenda.",
    maxMembers: 1,
    features: {
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
    prices: {
      MONTHLY: 39.90,
      QUARTERLY: 109.90,
      SEMIANNUALLY: 209.90,
      YEARLY: 399.00
    }
  },
  pro: {
    id: "pro",
    name: "Plano Pro",
    displayName: "Pro",
    description: "Para corretores de alta performance com IA Gemini e cruzamento de imóveis.",
    maxMembers: 1,
    features: {
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
    prices: {
      MONTHLY: 79.90,
      QUARTERLY: 219.90,
      SEMIANNUALLY: 419.90,
      YEARLY: 799.00
    }
  },
  max: {
    id: "max",
    name: "Plano Max",
    displayName: "Max",
    description: "Para imobiliárias e gestores com até 5 corretores e painel de gestão.",
    maxMembers: 5,
    features: {
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
    prices: {
      MONTHLY: 149.90,
      QUARTERLY: 419.90,
      SEMIANNUALLY: 799.90,
      YEARLY: 1499.00
    }
  },
  pro_max: {
    id: "pro_max",
    name: "Plano PRO MAX",
    displayName: "PRO MAX",
    description: "Estrutura corporativa avançada para grandes imobiliárias e redes (até 99 corretores).",
    maxMembers: 99,
    features: {
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
    },
    prices: {
      MONTHLY: 349.90,
      QUARTERLY: 989.90,
      SEMIANNUALLY: 1899.90,
      YEARLY: 3499.00
    }
  }
};

/**
 * Retorna os detalhes de um plano do catálogo oficial do servidor
 */
export function getServerPlan(planId: string): ServerPlanDefinition | null {
  if (!planId) return null;
  const normalized = planId.toLowerCase() as BillingPlanId;
  return SERVER_PLAN_CATALOG[normalized] || null;
}

/**
 * Retorna o preço oficial do servidor para um dado plano e ciclo
 */
export function getServerPlanPrice(planId: string, cycle: BillingCycle = "MONTHLY"): number | null {
  const plan = getServerPlan(planId);
  if (!plan) return null;
  return plan.prices[cycle] ?? plan.prices.MONTHLY;
}
