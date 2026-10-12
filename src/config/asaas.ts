/**
 * ==============================================================================
 * METRIA CRM - CONFIGURAÇÃO ASAAS (EXCLUSIVO BACKEND)
 * ==============================================================================
 * Garante que chaves e tokens NUNCA vazem para o cliente e valida o ambiente.
 */

import { AsaasConfig } from "../types/billing";

export function getAsaasConfig(): AsaasConfig {
  const apiKey = process.env.ASAAS_API_KEY || "";
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN || "";
  const environment = (process.env.ASAAS_ENVIRONMENT || "sandbox").toLowerCase() as "sandbox" | "production";

  // URL padrão: sandbox vs produção conforme especificação Asaas v3
  const defaultBaseUrl =
    environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3";

  const baseUrl = process.env.ASAAS_BASE_URL || defaultBaseUrl;

  return {
    apiKey,
    webhookToken,
    environment,
    baseUrl,
    isConfigured: Boolean(apiKey && apiKey.trim().length > 0)
  };
}

/**
 * Validação segura de integridade do token de webhook
 */
export function verifyAsaasWebhookToken(receivedToken: string | undefined): boolean {
  const { webhookToken } = getAsaasConfig();
  if (!webhookToken) {
    return false;
  }
  return receivedToken === webhookToken;
}
