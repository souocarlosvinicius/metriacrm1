/**
 * ==============================================================================
 * METRIA CRM - TIPOS E INTERFACES DE ASSINATURA E COBRANÇA (ASAAS)
 * ==============================================================================
 */

export type BillingPlanId = "start" | "pro" | "max" | "pro_max";
export type BillingCycle = "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
export type BillingPaymentMethod = "PIX" | "CREDIT_CARD" | "BOLETO" | "UNDEFINED";

export type SubscriptionStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELED";

export type ChargeStatus =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "RECEIVED_IN_CASH"
  | "REFUND_REQUESTED"
  | "CHARGEBACK_REQUESTED"
  | "CHARGEBACK_DISPUTE"
  | "AWAITING_CHARGEBACK_REVERSAL"
  | "DUNNING_REQUESTED"
  | "DUNNING_RECEIVED"
  | "AWAITING_RISK_ANALYSIS"
  | "CANCELED"
  | "DELETED";

export type WebhookProcessStatus =
  | "pending"
  | "processing"
  | "processed"
  | "ignored"
  | "failed";

export interface SubscriptionRecord {
  id: string;
  organization_id: string;
  asaas_subscription_id: string | null;
  asaas_customer_id: string | null;
  plan: BillingPlanId;
  billing_cycle: BillingCycle;
  value: number;
  status: SubscriptionStatus;
  payment_method: BillingPaymentMethod;
  next_due_date: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  paid_through: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ChargeRecord {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  asaas_payment_id: string;
  asaas_subscription_id: string | null;
  asaas_customer_id: string | null;
  value: number;
  net_value: number | null;
  status: ChargeStatus;
  billing_type: BillingPaymentMethod;
  due_date: string;
  payment_date: string | null;
  client_payment_date: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  coverage_period_start: string | null;
  coverage_period_end: string | null;
  raw_payload: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventRecord {
  id: string;
  event_id: string;
  event: string;
  organization_id: string | null;
  asaas_payment_id: string | null;
  asaas_subscription_id: string | null;
  status: WebhookProcessStatus;
  error_message: string | null;
  payload: Record<string, any>;
  processed_at: string | null;
  created_at: string;
}

export interface AsaasConfig {
  apiKey: string;
  webhookToken: string;
  environment: "sandbox" | "production";
  baseUrl: string;
  isConfigured: boolean;
}
