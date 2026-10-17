import { PLAN_LIMITS, PlanId, PlanLimits, Organization } from "../types";
import { normalizePlanId } from "../config/plans";

export type OrgPlanStatus = "loading" | "ready" | "error" | "unselected";

export interface PlanAccess {
  status: OrgPlanStatus;
  isReady: boolean;
  isLoading: boolean;
  isError: boolean;
  plan: PlanId | null;
  planName: string;
  limits: PlanLimits | null;
  features: PlanLimits | null;
  canUseGeminiAI: boolean;
  canUsePropertyMatching: boolean;
  canUseCommissionReports: boolean;
  canUseTeamManagement: boolean;
  canInviteBroker: boolean;
  canCreateClient: boolean;
  canCreateProperty: boolean;
  canAccessManagerDashboard: boolean;
  canUseLeadDistribution: boolean;
  remainingClients: number | null;
  remainingProperties: number | null;
  remainingMembers: number;
}

export function getCurrentPlanAccess(
  org: Organization | null | undefined,
  usage?: {
    clientsCount?: number;
    propertiesCount?: number;
    membersCount?: number;
  },
  orgStatus?: OrgPlanStatus
): PlanAccess {
  const currentStatus: OrgPlanStatus = orgStatus || (org ? "ready" : "unselected");

  // Regra 3: Organização em carregamento ou ausente/erro NUNCA pode virar Beta
  if (currentStatus === "loading") {
    return {
      status: "loading",
      isReady: false,
      isLoading: true,
      isError: false,
      plan: null,
      planName: "Carregando...",
      limits: null,
      features: null,
      canUseGeminiAI: false,
      canUsePropertyMatching: false,
      canUseCommissionReports: false,
      canUseTeamManagement: false,
      canInviteBroker: false,
      canCreateClient: false,
      canCreateProperty: false,
      canAccessManagerDashboard: false,
      canUseLeadDistribution: false,
      remainingClients: null,
      remainingProperties: null,
      remainingMembers: 0
    };
  }

  if (currentStatus === "error" || !org) {
    return {
      status: currentStatus === "error" ? "error" : "unselected",
      isReady: false,
      isLoading: false,
      isError: true,
      plan: null,
      planName: currentStatus === "error" ? "Falha ao carregar plano" : "Nenhuma organização selecionada",
      limits: null,
      features: null,
      canUseGeminiAI: false,
      canUsePropertyMatching: false,
      canUseCommissionReports: false,
      canUseTeamManagement: false,
      canInviteBroker: false,
      canCreateClient: false,
      canCreateProperty: false,
      canAccessManagerDashboard: false,
      canUseLeadDistribution: false,
      remainingClients: null,
      remainingProperties: null,
      remainingMembers: 0
    };
  }

  // Organização persistida confirmada e ativa
  const plan: PlanId = normalizePlanId(org.plan);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.beta;

  const clientsCount = usage?.clientsCount || 0;
  const propertiesCount = usage?.propertiesCount || 0;
  const membersCount = usage?.membersCount || 1; // current user is at least 1 member

  const remainingClients = limits.maxActiveClients === null 
    ? null 
    : Math.max(0, limits.maxActiveClients - clientsCount);

  const remainingProperties = limits.maxProperties === null 
    ? null 
    : Math.max(0, limits.maxProperties - propertiesCount);

  const remainingMembers = Math.max(0, limits.maxMembers - membersCount);

  const canCreateClient = limits.maxActiveClients === null || clientsCount < limits.maxActiveClients;
  const canCreateProperty = limits.maxProperties === null || propertiesCount < limits.maxProperties;
  const canInviteBroker = limits.hasTeamManagement && membersCount < limits.maxMembers;

  return {
    status: "ready",
    isReady: true,
    isLoading: false,
    isError: false,
    plan,
    planName: limits.name,
    limits,
    features: limits, // alias
    canUseGeminiAI: limits.hasGeminiAI,
    canUsePropertyMatching: limits.hasPropertyMatching,
    canUseCommissionReports: limits.hasCommissionReports,
    canUseTeamManagement: limits.hasTeamManagement,
    canInviteBroker,
    canCreateClient,
    canCreateProperty,
    canAccessManagerDashboard: limits.hasManagerDashboard,
    canUseLeadDistribution: limits.hasLeadDistribution,
    remainingClients,
    remainingProperties,
    remainingMembers
  };
}

export function useCurrentPlan(
  org: Organization | null | undefined,
  usage?: {
    clientsCount?: number;
    propertiesCount?: number;
    membersCount?: number;
  },
  orgStatus?: OrgPlanStatus
): PlanAccess {
  return getCurrentPlanAccess(org, usage, orgStatus);
}

