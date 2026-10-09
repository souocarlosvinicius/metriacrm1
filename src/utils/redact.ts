/**
 * ==============================================================================
 * METRIA CRM - UTILITÁRIO DE REDAÇÃO DE DADOS SENSÍVEIS (LGPD / PRIVACIDADE)
 * ==============================================================================
 *
 * Redige com segurança antes de envio a servidores de logs, Sentry ou saídas de debug:
 * - Senhas e credenciais (password, senha, pass, secret, etc.)
 * - Tokens e chaves (Bearer tokens, JWTs, API keys, session tokens)
 * - Documentos de identificação pessoal (CPF, CNPJ, RG)
 * - Informações de contato direto (E-mails pessoais, telefones/WhatsApp)
 * - Links com tokens de convite e URLs com parâmetros sensíveis
 */

// Regex para padrões sensíveis
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-.\s]?\d{4}\b/g;
const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_REGEX = /\beyJ[A-Za-z0-9\-_]{10,}\.eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_.]{10,}\b/g;
const INVITE_URL_REGEX = /https?:\/\/[^\s]*\/invite\/[^\s/?#]+/gi;
const SENSITIVE_QUERY_URL_REGEX = /([?&](?:token|code|key|apiKey|invite_token|invitation)=)[^&\s]+/gi;

const SENSITIVE_KEYS = new Set([
  "password",
  "senha",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "apikey",
  "api_key",
  "secret",
  "authorization",
  "client_secret",
  "session_token",
  "cpf",
  "cnpj",
  "rg",
  "documento",
  "document"
]);

/**
 * Redige uma string sanitizando todos os padrões identificados
 */
export function redactSensitiveString(text: string): string {
  if (!text || typeof text !== "string") return text;

  let redacted = text;

  // Redige tokens e URLs primeiro
  redacted = redacted.replace(BEARER_TOKEN_REGEX, "Bearer [REDACTED_TOKEN]");
  redacted = redacted.replace(JWT_REGEX, "[REDACTED_JWT_TOKEN]");
  redacted = redacted.replace(INVITE_URL_REGEX, "[REDACTED_INVITE_URL]");
  redacted = redacted.replace(SENSITIVE_QUERY_URL_REGEX, "$1[REDACTED_TOKEN]");

  // Redige senhas em formatos como password: "abc", senha=xyz ou senha xyz
  redacted = redacted.replace(
    /((?:password|senha|secret)\s*(?:[:=]|\s)\s*["']?)([^"'\s,]+)(["']?)/gi,
    "$1[REDACTED_PASSWORD]$3"
  );

  // Redige CPFs e CNPJs
  redacted = redacted.replace(CPF_REGEX, "[REDACTED_CPF]");
  redacted = redacted.replace(CNPJ_REGEX, "[REDACTED_CNPJ]");

  // Redige E-mails
  redacted = redacted.replace(EMAIL_REGEX, "[REDACTED_EMAIL]");

  // Redige Telefones
  redacted = redacted.replace(PHONE_REGEX, "[REDACTED_PHONE]");

  return redacted;
}

/**
 * Redige recursivamente objetos, arrays e strings
 */
export function redactSensitiveData<T = any>(data: T, maxDepth: number = 5): T {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    return redactSensitiveString(data) as unknown as T;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (data instanceof Error) {
    const errObj: any = {
      name: data.name,
      message: redactSensitiveString(data.message),
      stack: data.stack ? redactSensitiveString(data.stack) : undefined
    };
    return errObj as unknown as T;
  }

  if (maxDepth <= 0) {
    return "[MAX_DEPTH_REACHED]" as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, maxDepth - 1)) as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Chave expressamente sensível
    if (SENSITIVE_KEYS.has(lowerKey)) {
      if (lowerKey.includes("password") || lowerKey.includes("senha")) {
        result[key] = "[REDACTED_PASSWORD]";
      } else if (lowerKey.includes("token") || lowerKey.includes("key") || lowerKey.includes("secret") || lowerKey.includes("auth")) {
        result[key] = "[REDACTED_TOKEN]";
      } else if (lowerKey.includes("cpf") || lowerKey.includes("cnpj") || lowerKey.includes("rg") || lowerKey.includes("document")) {
        result[key] = "[REDACTED_DOCUMENT]";
      } else {
        result[key] = "[REDACTED]";
      }
      continue;
    }

    if (lowerKey === "email" || lowerKey === "mail") {
      result[key] = "[REDACTED_EMAIL]";
      continue;
    }

    if (lowerKey === "phone" || lowerKey === "telefone" || lowerKey === "celular" || lowerKey === "whatsapp") {
      result[key] = "[REDACTED_PHONE]";
      continue;
    }

    result[key] = redactSensitiveData(value, maxDepth - 1);
  }

  return result as T;
}
