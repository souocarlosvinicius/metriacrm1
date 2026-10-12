/**
 * ==============================================================================
 * METRIA CRM - SERVIÇO DE CLIENTE ASAAS (API v3 SANDBOX / PRODUÇÃO)
 * ==============================================================================
 * Centraliza as chamadas seguras à API do Asaas exclusivamente no backend.
 * Documentação Asaas v3:
 * - Customers: POST /customers, GET /customers?cpfCnpj=...
 * - Subscriptions: POST /subscriptions, GET /subscriptions/{id}
 * - Payments: GET /subscriptions/{id}/payments
 */

import { getAsaasConfig } from "../config/asaas";

export interface AsaasCustomerInput {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

export interface AsaasCustomerResponse {
  id: string;
  name: string;
  email: string;
  phone?: string;
  mobilePhone?: string;
  cpfCnpj?: string;
  dateCreated?: string;
  deleted?: boolean;
  [key: string]: any;
}

export interface AsaasSubscriptionInput {
  customer: string; // Asaas customer ID
  billingType: "PIX" | "CREDIT_CARD" | "BOLETO" | "UNDEFINED";
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  cycle: "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
  description?: string;
  externalReference?: string; // organization_id
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
    addressComplement?: string;
  };
  creditCardToken?: string;
}

export interface AsaasSubscriptionResponse {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string;
  cycle: string;
  description?: string;
  billingType: string;
  status: string;
  dateCreated?: string;
  [key: string]: any;
}

export interface AsaasPaymentResponse {
  id: string;
  customer: string;
  subscription?: string;
  value: number;
  netValue?: number;
  status: string;
  billingType: string;
  dueDate: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  [key: string]: any;
}

export interface AsaasPixQrCodeResponse {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
  [key: string]: any;
}

export class AsaasClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    const config = getAsaasConfig();
    this.apiKey = apiKey || config.apiKey;
    this.baseUrl = baseUrl || config.baseUrl;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "access_token": this.apiKey,
      "User-Agent": "MetriaCRM-AsaasClient/1.0"
    };
  }

  /**
   * Executa requisições HTTP para a API do Asaas com tratamento de erro detalhado
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
    const headers = { ...this.headers, ...(options.headers as Record<string, string> || {}) };

    const res = await fetch(url, {
      ...options,
      headers
    });

    const bodyText = await res.text();
    let bodyJson: any = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = { raw: bodyText };
    }

    if (!res.ok) {
      const errorMsg =
        bodyJson?.errors?.[0]?.description ||
        bodyJson?.message ||
        `Erro ${res.status} ao comunicar com a API Asaas.`;
      const err = new Error(errorMsg) as any;
      err.status = res.status;
      err.details = bodyJson;
      throw err;
    }

    return bodyJson as T;
  }

  /**
   * Busca cliente pelo email ou CPF/CNPJ
   */
  async findCustomer(query: { email?: string; cpfCnpj?: string }): Promise<AsaasCustomerResponse | null> {
    const params = new URLSearchParams();
    if (query.cpfCnpj) params.set("cpfCnpj", query.cpfCnpj.replace(/\D/g, ""));
    else if (query.email) params.set("email", query.email);

    const res = await this.request<{ data: AsaasCustomerResponse[] }>(`customers?${params.toString()}`);
    if (res.data && res.data.length > 0) {
      return res.data[0];
    }
    return null;
  }

  /**
   * Obtém cliente por ID
   */
  async getCustomer(customerId: string): Promise<AsaasCustomerResponse> {
    return this.request<AsaasCustomerResponse>(`customers/${customerId}`);
  }

  /**
   * Cria um novo cliente pagador no Asaas
   */
  async createCustomer(input: AsaasCustomerInput): Promise<AsaasCustomerResponse> {
    return this.request<AsaasCustomerResponse>("customers", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  /**
   * Atualiza dados de um cliente existente
   */
  async updateCustomer(customerId: string, input: Partial<AsaasCustomerInput>): Promise<AsaasCustomerResponse> {
    return this.request<AsaasCustomerResponse>(`customers/${customerId}`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  /**
   * Reutiliza ou cadastra o pagador no Asaas
   */
  async getOrCreateCustomer(input: AsaasCustomerInput): Promise<AsaasCustomerResponse> {
    // 1. Tenta buscar por CPF/CNPJ se fornecido
    if (input.cpfCnpj) {
      const existing = await this.findCustomer({ cpfCnpj: input.cpfCnpj });
      if (existing) {
        return existing;
      }
    }

    // 2. Tenta buscar por email
    if (input.email) {
      const existing = await this.findCustomer({ email: input.email });
      if (existing) {
        return existing;
      }
    }

    // 3. Cadastra novo
    return this.createCustomer(input);
  }

  /**
   * Cria uma nova assinatura no Asaas
   */
  async createSubscription(input: AsaasSubscriptionInput): Promise<AsaasSubscriptionResponse> {
    return this.request<AsaasSubscriptionResponse>("subscriptions", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  /**
   * Consulta uma assinatura por ID
   */
  async getSubscription(subscriptionId: string): Promise<AsaasSubscriptionResponse> {
    return this.request<AsaasSubscriptionResponse>(`subscriptions/${subscriptionId}`);
  }

  /**
   * Lista as cobranças geradas por uma assinatura
   */
  async getSubscriptionPayments(subscriptionId: string): Promise<{ data: AsaasPaymentResponse[] }> {
    return this.request<{ data: AsaasPaymentResponse[] }>(`subscriptions/${subscriptionId}/payments`);
  }

  /**
   * Obtém QR Code Pix de uma cobrança
   */
  async getPixQrCode(paymentId: string): Promise<AsaasPixQrCodeResponse> {
    return this.request<AsaasPixQrCodeResponse>(`payments/${paymentId}/pixQrCode`);
  }

  /**
   * Cancela assinatura no Asaas
   */
  async cancelSubscription(subscriptionId: string): Promise<any> {
    return this.request(`subscriptions/${subscriptionId}`, {
      method: "DELETE"
    });
  }
}
