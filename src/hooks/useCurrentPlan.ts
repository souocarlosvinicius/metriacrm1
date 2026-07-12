import { PLAN_LIMITS, PlanId, PlanLimits, Organization } from "../types";

export interface PlanAccess {
  plan: PlanId;
  planName: string;
  limits: PlanLimits;
  features: PlanLimits;
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
  }
): PlanAccess {
  const plan: PlanId = (org?.plan as PlanId) || "beta";
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
  }
): PlanAccess {
  return getCurrentPlanAccess(org, usage);
}
