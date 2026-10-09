import dotenv from "dotenv";

/**
 * ==============================================================================
 * METRIA CRM - VALIDAÇÃO E GESTÃO DE VARIÁVEIS DE AMBIENTE DO SERVIDOR
 * ==============================================================================
 * 
 * Responsabilidades:
 * 1. Carrega dotenv antes de qualquer inicialização de subsistemas (Gemini/Supabase).
 * 2. Valida porta configurável com fallback seguro para 3000 respeitando process.env.PORT.
 * 3. Normaliza NODE_ENV (production / development / test).
 * 4. Separa categoricamente variáveis públicas de build (VITE_*) de segredos de runtime.
 * 5. Bloqueia estritamente chaves administrativas que incorretamente utilizem prefixo VITE_
 *    (ex: VITE_SUPABASE_SERVICE_ROLE_KEY nunca deve existir).
 * 6. Sanitiza e mascara segredos para impedir impressão em logs ou diagnósticos.
 */

// 1. Carrega variáveis de ambiente imediatamente
if (typeof process !== "undefined" && process.env) {
  dotenv.config();
}

export interface ServerConfig {
  port: number;
  nodeEnv: "production" | "development" | "test";
  isProduction: boolean;
  geminiApiKey: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  supabaseServiceRoleKey: string | null;
  sentryDsn: string | null;
  appUrl: string;
}

export interface EnvValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  sanitizedConfigSummary: Record<string, any>;
}

export function validateAndLoadServerEnv(): { config: ServerConfig; validation: EnvValidationResult } {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Porta
  let port = 3000;
  if (process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      port = parsed;
    } else {
      warnings.push(`PORT inválida fornecida ('${process.env.PORT}'). Usando padrão 3000.`);
    }
  }

  // NODE_ENV
  const rawEnv = (process.env.NODE_ENV || "").toLowerCase();
  let nodeEnv: "production" | "development" | "test" = "development";
  if (rawEnv === "production" || rawEnv === "prod") {
    nodeEnv = "production";
  } else if (rawEnv === "test") {
    nodeEnv = "test";
  }

  // VIOLAÇÃO DE SEGURANÇA: Chaves administrativas com prefixo VITE_
  if (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SERVICE_ROLE_KEY) {
    errors.push("ALERTA CRÍTICO: Chave de service_role detectada com prefixo 'VITE_'. Chaves administrativas de backend NUNCA devem ter prefixo VITE_ para não serem expostas no bundle client-side!");
  }

  if (process.env.VITE_GEMINI_API_KEY) {
    warnings.push("VITE_GEMINI_API_KEY detectada. Recomenda-se usar GEMINI_API_KEY exclusivamente no backend para evitar vazamento do token.");
  }

  // Segredos de runtime (Backend apenas)
  const geminiApiKey = process.env.GEMINI_API_KEY || null;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

  // Variáveis de cliente
  const supabaseUrl = process.env.VITE_SUPABASE_URL || null;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || null;
  const sentryDsn = process.env.VITE_SENTRY_DSN || null;
  const appUrl = process.env.APP_URL || `http://localhost:${port}`;

  const config: ServerConfig = {
    port,
    nodeEnv,
    isProduction: nodeEnv === "production",
    geminiApiKey,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    sentryDsn,
    appUrl
  };

  // Resumo sanitizado (NUNCA imprime valores crus)
  const sanitizedConfigSummary = {
    port,
    nodeEnv,
    isProduction: config.isProduction,
    appUrl,
    hasGeminiKey: Boolean(geminiApiKey && geminiApiKey.length > 5),
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasSupabaseAnonKey: Boolean(supabaseAnonKey),
    hasSupabaseServiceRole: Boolean(supabaseServiceRoleKey),
    hasSentryDsn: Boolean(sentryDsn && sentryDsn.startsWith("http")),
    clientSecretsClean: !process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  };

  return {
    config,
    validation: {
      valid: errors.length === 0,
      warnings,
      errors,
      sanitizedConfigSummary
    }
  };
}

// Inicializa e exporta configuração singleton
export const { config: SERVER_CONFIG, validation: ENV_VALIDATION } = validateAndLoadServerEnv();
