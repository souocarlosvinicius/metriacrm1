export type PlanId = "beta" | "start" | "pro" | "max" | "pro_max";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired";

export type UserRole = "owner" | "admin" | "manager" | "broker";

export type AccountType = "broker" | "agency" | "team";

export type ClientStatus =
  | "active"
  | "new"
  | "contacted"
  | "qualified"
  | "negotiation"
  | "proposal"
  | "closed"
  | "lost"
  | "inactive"
  | string;

export type ClientTemperature = "cold" | "warm" | "hot" | string;

export type PropertyStatus =
  | "available"
  | "reserved"
  | "sold"
  | "rented"
  | "inactive"
  | string;

export type TaskStatus = "pending" | "completed" | "cancelled" | string;

export type TaskPriority = "low" | "medium" | "high" | string;

export type VisitStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | string;

export type ProposalStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "cancelled"
  | string;

export type TransactionStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled"
  | string;

export type PlanFeature =
  | "full_pipeline"
  | "whatsapp_templates"
  | "calendar_tasks"
  | "gemini_ai"
  | "property_matching"
  | "commission_reports"
  | "advanced_reports"
  | "team_management"
  | "lead_distribution"
  | "manager_dashboard"
  | "advanced_manager_dashboard"
  | "lead_transfer"
  | "multiple_managers";

export interface PlanLimits {
  id: PlanId;
  name: string;
  displayName: string;
  price: number;
  maxActiveClients: number | null;
  maxProperties: number | null;
  maxMembers: number;
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
}

export interface Organization {
  id: string;
  _id?: string;
  name: string;
  tradeName?: string;
  document?: string;
  creci?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  ownerId?: string;
  plan: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionStartedAt?: string;
  subscriptionExpiresAt?: string | null;
  planUpdatedAt?: string;
  maxMembers: number;
  billingEmail?: string;
  billingDocument?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationMember {
  id: string;
  _id?: string;
  organizationId: string;
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
  creci?: string;
  role: UserRole;
  status: "active" | "inactive" | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationInvite {
  id: string;
  _id?: string;
  organizationId: string;
  invitedEmail: string;
  invitedName?: string;
  role: UserRole;
  token?: string;
  status: "pending" | "accepted" | "expired" | "cancelled" | string;
  invitedBy?: string;
  acceptedBy?: string;
  expiresAt?: string | null;
  createdAt?: string;
  acceptedAt?: string | null;
}

export interface User {
  id: string;
  _id?: string;
  name?: string;
  email: string;
  avatarUrl?: string;
  role?: string;
  phone?: string;
  whatsapp?: string;
  creci?: string;
  commercialName?: string;
  primaryCity?: string;
  actingType?: string;
  onboardingCompleted?: boolean;
  defaultOrganizationId?: string;
  currentOrganizationId?: string;
  organizationId?: string;
  accountType?: AccountType | string;
  currentRole?: UserRole | string;
  plan?: PlanId;
  isDemo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  document?: string;
  clientType?: string;
  profileType?: string;
  objective?: string;
  propertyType?: string;
  minBudget?: number | null;
  maxBudget?: number | null;
  observations?: string;
  birthday?: string | null;
  address?: string;
  status?: ClientStatus;
  temperature?: ClientTemperature;
  source?: string;
  nextAction?: string;
  nextFollowUp?: string | null;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Property {
  id: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  title: string;
  type?: string;
  modality?: string;
  price?: number | null;
  neighborhood?: string;
  city?: string;
  state?: string;
  address?: string;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  parkingSpots?: number | null;
  area?: number | null;
  photos?: string[];
  status?: PropertyStatus;
  ownerId?: string | null;
  ownerName?: string;
  commissionPercent?: number | null;
  estimatedCommission?: number | null;
  description?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  clientId?: string | null;
  clientName?: string | null;
  propertyId?: string | null;
  propertyTitle?: string | null;
  title: string;
  description?: string;
  dueDate?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Visit {
  id: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  clientId?: string | null;
  clientName?: string | null;
  propertyId?: string | null;
  propertyTitle?: string | null;
  date?: string | null;
  time?: string | null;
  scheduledAt?: string | null;
  status?: VisitStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Proposal {
  id: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  clientId?: string | null;
  clientName?: string | null;
  propertyId?: string | null;
  propertyTitle?: string | null;
  value?: number | null;
  commissionValue?: number | null;
  commissionPercent?: number | null;
  status?: ProposalStatus;
  notes?: string;
  sentAt?: string | null;
  acceptedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Transaction {
  id: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  clientId?: string | null;
  propertyId?: string | null;
  proposalId?: string | null;
  title?: string;
  value?: number | null;
  commissionValue?: number | null;
  commissionPercent?: number | null;
  status?: TransactionStatus;
  closedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface HistoryEvent {
  id: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  clientId?: string | null;
  propertyId?: string | null;
  type?: string;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Settings {
  id?: string;
  userId?: string;
  organizationId?: string;
  companyName?: string;
  commercialName?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  logoUrl?: string;
  theme?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardMetrics {
  totalClients: number;
  totalProperties: number;
  totalTasks: number;
  totalVisits: number;
  totalProposals: number;
  totalTransactions?: number;
  activeClients?: number;
  potentialCommission?: number;
  overdueTasks?: number;
}

export interface OrganizationUsage {
  activeClientsCount: number;
  propertiesCount: number;
  activeMembersCount: number;
  plan: PlanId;
  maxMembers: number;
}

export interface ApiErrorResponse {
  error: string;
  details?: string;
}

export interface ApiSuccessResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}
