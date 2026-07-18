export interface Property {
  id?: string;
  _id?: string;
  userId?: string; // Partitioning key
  organizationId?: string; // Organization reference
  assignedTo?: string; // Assigned broker/user ID
  createdBy?: string; // Creator user ID
  code?: string; // Unique random code (e.g. IM-XXXX)
  ownerId?: string; // Reference to owner (Client)
  title: string;
  type: string; // 'Apartamento' | 'Casa' | 'Sobrado' | 'Terreno' | 'Comercial'
  condition: string; // 'Novo' | 'Usado'
  description: string;
  modality: string; // 'Venda' | 'Aluguel' | 'Ambos'
  price: number;
  condo: number;
  iptu: number;
  address: string;
  neighborhood: string;
  city: string;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpots: number;
  area: number;
  builtArea?: number;
  constructionYear?: number;
  floor?: string;
  sunPosition?: string;
  documentStatus?: string;
  financialStatus?: string; // 'quitado' | 'em financiamento' | 'não definida'
  acceptsExchange?: boolean;
  photos: string[];
  videoLink?: string; // YouTube or social media post link
  amenities: string[];
  status: string; // 'Disponível' | 'Reservado' | 'Em Negociação' | 'Vendido' | 'Alugado' | 'Inativo'
  captadorName?: string;
  captadorPhone?: string;
  estimatedCommission?: number; // Estimated commission in absolute BRL
  commissionPercent?: number; // Estimated commission percentage (%)
  createdAt?: string;
}

export interface HistoryEntry {
  id?: string;
  userId?: string;
  organizationId?: string;
  clientId?: string;
  type: string; // 'creation' | 'status_change' | 'pipeline_change' | 'whatsapp' | 'task_created' | 'task_completed' | 'visit_scheduled' | 'proposal_sent' | 'observation' | 'loss' | 'transfer'
  date: string; // YYYY-MM-DD HH:mm:ss or similar ISO string
  description: string;
  userName?: string;
}

export interface Client {
  id?: string;
  _id?: string;
  userId?: string; // Partitioning key
  organizationId?: string; // Organization reference
  assignedTo?: string; // Assigned broker/user ID
  createdBy?: string; // Creator user ID
  clientType?: "PF" | "PJ"; // PF = Pessoa Física, PJ = Pessoa Jurídica
  name: string;
  phone: string;
  document: string;
  email: string;
  profileType: string; // 'Lead' | 'Comprador' | 'Vendedor' | 'Locador' | 'Locatário' | 'Investidor'
  objective: string; // Legacy objective
  leadSource?: string; // 'Indicação' | 'Instagram' | 'Facebook' | 'OLX' | 'Portal Imobiliário' | 'Placa' | 'WhatsApp' | 'Tráfego Pago' | 'Outro'
  interest?: string; // 'Compra' | 'Venda' | 'Locação' | 'Avaliação' | 'Investimento'
  budgetRange?: string; // Faixa de orçamento (e.g. "R$ 300.000 - R$ 500.000")
  neighborhoodOfInterest?: string; // Bairro de interesse
  desiredPropertyType?: string; // Tipo de imóvel desejado (e.g. "Apartamento 3 quartos")
  status: string; // Status de atendimento: 'Novo' | 'Em Atendimento' | 'Proposta' | 'Contrato' | 'Ganho' | 'Perdido'
  temperature?: "Frio" | "Morno" | "Quente"; // Temperature of lead
  nextAction?: string; // Próxima ação a ser realizada
  nextFollowUpDate?: string; // Data do próximo follow-up (YYYY-MM-DD)
  propertyType: string;
  minBudget: number;
  maxBudget: number;
  observations: string;
  birthday?: string; // YYYY-MM-DD
  address?: string; // Client address
  pipelineStatus?: string; // Funnel stage
  linkedPropertyId?: string; // Reference key or Supabase ID of Property
  createdAt?: string;
  updatedAt?: string; // Track when client stage/status was last modified
  lossReason?: string; // Motivo de perda
  commissionForecast?: number; // Previsão de comissão (BRL)
  commissionPercent?: number; // Porcentagem de comissão (%)
  potentialValue?: number; // Valor potencial do negócio (BRL)
  closingProbability?: "Baixa" | "Média" | "Alta"; // Probabilidade de fechamento
  history?: HistoryEntry[];
}

export interface Proposal {
  id?: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  clientId: string;
  clientName: string;
  propertyId: string;
  propertyTitle: string;
  proposedValue: number;
  status: "Pendente" | "Aceita" | "Recusada" | "Em Análise";
  date: string; // YYYY-MM-DD
  observations: string;
  nextAction?: string;
  createdAt?: string;
}

export interface Visit {
  id?: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  clientId: string;
  clientName: string;
  propertyId: string;
  propertyTitle: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: "Agendada" | "Realizada" | "Cancelada";
  observations: string;
  feedback?: string;
  createdAt?: string;
}

export interface Task {
  id?: string;
  _id?: string;
  userId?: string; // Partitioning key
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  clientId?: string; // Linked client (required for new tasks, optional for legacy)
  clientName: string;
  propertyId?: string; // Linked property, optional
  propertyTitle?: string;
  type: string; // 'Ligar' | 'Enviar WhatsApp' | 'Enviar imóvel' | 'Confirmar visita' | 'Enviar proposta' | 'Cobrar retorno' | 'Documentação' | 'Outro'
  priority?: "baixa" | "média" | "alta"; // Priority
  completed: boolean;
  description: string;
  createdAt?: string;
  reminderActive?: boolean; // Whether automatic WhatsApp reminder is scheduled
  reminderMessage?: string; // Pre-formatted WhatsApp reminder text
  reminderSent?: boolean; // Whether the broker has sent the WhatsApp reminder
  reminderDate?: string; // When the reminder should be sent
}

export interface Transaction {
  id?: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  assignedTo?: string;
  createdBy?: string;
  title: string;
  amount: number;
  status: string;
  createdAt?: string;
}

export interface DBStatus {
  dbType: string;
  supabaseActive: boolean;
  geminiActive: boolean;
  schemaMissing?: boolean;
}

export interface MessageTemplates {
  primeiroContato?: string;
  followUp?: string;
  confirmacaoVisita?: string;
  posVisita?: string;
  proposta?: string;
  reminderPhone?: string;
  reminderEnabled?: boolean;
  reminderTemplate?: string;
  reminderTimeOffset?: string;
  reminderApiProvider?: string;
}

export interface User {
  id?: string;
  _id?: string;
  username: string;
  name: string;
  email: string;
  avatarUrl: string;
  role?: string;
  phone?: string;
  onboardingCompleted?: boolean;
  commercialName?: string;
  creci?: string;
  primaryCity?: string;
  actingType?: "Venda" | "Locação" | "Lançamentos" | "Usados" | "Alto padrão" | "Minha Casa Minha Vida" | "Geral";
  defaultCommissionPercent?: number; // Default commission percentage for properties and clients
  pipelineStages?: string[]; // Custom pipeline stages
  leadSources?: string[]; // Custom lead sources
  messageTemplates?: MessageTemplates; // Custom message templates
  isDemo?: boolean; // Demo mode flag
  sessionToken?: string; // Session token
  defaultOrganizationId?: string;
  accountType?: AccountType;
  currentRole?: UserRole;
}

export type UserRole = "owner" | "admin" | "manager" | "broker";
export type AccountType = "broker" | "agency";

export type PlanId = "beta" | "start" | "pro" | "max" | "pro_max";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired";

export interface PlanLimits {
  id: PlanId;
  name: string;
  displayName: string;
  price: number | null;
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

export { PLAN_LIMITS } from "./config/plans";

export interface Organization {
  id: string;
  name: string;
  tradeName?: string;
  document?: string;
  creci?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  ownerId: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartedAt?: string;
  subscriptionExpiresAt?: string;
  planUpdatedAt?: string;
  maxMembers: number;
  billingEmail?: string;
  billingDocument?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
  creci?: string;
  role: UserRole;
  status: "active" | "inactive";
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationInvite {
  id: string;
  organizationId: string;
  invitedEmail: string;
  invitedName?: string;
  role: UserRole;
  token: string;
  status: "pending" | "accepted" | "expired";
  invitedBy?: string;
  acceptedBy?: string;
  expiresAt?: string;
  createdAt?: string;
  acceptedAt?: string;
}
