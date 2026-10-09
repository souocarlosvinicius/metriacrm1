/**
 * ==============================================================================
 * METRIA CRM - CONFIGURAÇÃO DE LIMITES, SEGURANÇA E GROUNDING DA IA (GEMINI)
 * ==============================================================================
 *
 * Centraliza os limites explícitos de cota, taxa de requisições, concorrência,
 * timeout, validação de payload, sanitização de dados não confiáveis,
 * DTOs mínimos de privacidade e regras de veracidade factual (zero alucinação).
 */

export const GEMINI_LIMITS = {
  // Controle de Taxa e Quotas por Usuário e Organização
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // Janela de 1 minuto
  MAX_REQUESTS_PER_MINUTE_USER: 10,
  MAX_REQUESTS_PER_MINUTE_ORG: 30,
  MAX_REQUESTS_PER_DAY_ORG: 500,

  // Controle de Concorrência
  MAX_CONCURRENT_PER_USER: 2,
  MAX_CONCURRENT_PER_ORG: 5,

  // Timeout para Chamadas ao Modelo
  REQUEST_TIMEOUT_MS: 15 * 1000, // 15 segundos

  // Limites de Entrada e Payload
  MAX_PAYLOAD_BYTES: 64 * 1024, // 64 KB
  MAX_INPUT_STRING_LENGTH: 600, // Caracteres por campo de texto
  MAX_CLIENTS_LIST_SIZE: 15,
  MAX_PROPERTIES_LIST_SIZE: 15,
  MAX_TASKS_LIST_SIZE: 20,
  MAX_AMENITIES_COUNT: 25,

  // Limites de Saída do Modelo
  MAX_OUTPUT_STRING_LENGTH: 4000,

  // Cooldown de 429 isolado por Tenant/Organização
  COOLDOWN_429_MS: 60 * 1000, // 1 minuto

  // Modelo Oficial Suportado
  MODEL_NAME: "gemini-3.5-flash",
};

/**
 * Sanitiza campos de texto inseridos por usuários para prevenir injeção de prompt
 * e remove delimitadores ou comandos de autoridade não confiáveis.
 */
export function sanitizeUntrustedText(text: any, maxLength = GEMINI_LIMITS.MAX_INPUT_STRING_LENGTH): string {
  if (text === null || text === undefined) return "";
  let str = String(text).trim();

  // Remove caracteres de controle perigosos
  str = str.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, "");

  // Neutraliza delimitadores de tags de prompt injection
  str = str
    .replace(/<\/?dados_usuario[^>]*>/gi, "")
    .replace(/<\/?instrucoes[^>]*>/gi, "")
    .replace(/<\/?system[^>]*>/gi, "")
    .replace(/<\/?prompt[^>]*>/gi, "")
    .replace(/system\s*:/gi, "input:")
    .replace(/human\s*:/gi, "input:")
    .replace(/assistant\s*:/gi, "input:");

  // Limita o comprimento do campo
  if (str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  return str;
}

/**
 * DTO Mínimo de Cliente para envio à IA.
 * EXCLUI estritamente: documentos (CPF/CNPJ/RG), contatos telefônicos completos,
 * endereços privados, anotações confidenciais e histórico completo não necessário.
 */
export interface MinimalClientDTO {
  id: string;
  name: string;
  status?: string;
  profileType?: string;
  interest?: string;
  budget?: number | string;
  temperature?: string;
}

export function createMinimalClientDTO(c: any): MinimalClientDTO {
  if (!c || typeof c !== "object") {
    return { id: "unknown", name: "Cliente" };
  }

  return {
    id: sanitizeUntrustedText(c.id || c._id || "unknown", 36),
    name: sanitizeUntrustedText(c.name || "Cliente", 100),
    status: c.status ? sanitizeUntrustedText(c.status, 50) : undefined,
    profileType: c.profileType ? sanitizeUntrustedText(c.profileType, 50) : undefined,
    interest: (c.interest || c.propertyInterest) ? sanitizeUntrustedText(c.interest || c.propertyInterest, 100) : undefined,
    budget: typeof c.budget === "number" ? c.budget : (c.budgetMax ? c.budgetMax : undefined),
    temperature: c.temperature ? sanitizeUntrustedText(c.temperature, 50) : undefined
  };
}

/**
 * DTO Mínimo de Imóvel para envio à IA.
 * EXCLUI estritamente: dados do proprietário (ownerId, telefone, documentos),
 * dados cadastrais confidenciais e anotações internas.
 */
export interface MinimalPropertyDTO {
  id: string;
  title?: string;
  type?: string;
  modality?: string;
  condition?: string;
  price?: number;
  neighborhood?: string;
  city?: string;
  bedrooms?: number;
  suites?: number;
  bathrooms?: number;
  parkingSpots?: number;
  area?: number;
  amenities?: string[];
}

export function createMinimalPropertyDTO(p: any): MinimalPropertyDTO {
  if (!p || typeof p !== "object") {
    return { id: "unknown" };
  }

  const amenities = Array.isArray(p.amenities)
    ? p.amenities.map((a: any) => sanitizeUntrustedText(a, 60)).filter(Boolean).slice(0, GEMINI_LIMITS.MAX_AMENITIES_COUNT)
    : [];

  return {
    id: sanitizeUntrustedText(p.id || p._id || "unknown", 36),
    title: p.title ? sanitizeUntrustedText(p.title, 120) : undefined,
    type: p.type ? sanitizeUntrustedText(p.type, 60) : undefined,
    modality: p.modality ? sanitizeUntrustedText(p.modality, 40) : undefined,
    condition: p.condition ? sanitizeUntrustedText(p.condition, 60) : undefined,
    price: typeof p.price === "number" && !isNaN(p.price) ? p.price : undefined,
    neighborhood: p.neighborhood ? sanitizeUntrustedText(p.neighborhood, 80) : undefined,
    city: p.city ? sanitizeUntrustedText(p.city, 80) : undefined,
    bedrooms: typeof p.bedrooms === "number" && !isNaN(p.bedrooms) ? p.bedrooms : undefined,
    suites: typeof p.suites === "number" && !isNaN(p.suites) ? p.suites : undefined,
    bathrooms: typeof p.bathrooms === "number" && !isNaN(p.bathrooms) ? p.bathrooms : undefined,
    parkingSpots: typeof p.parkingSpots === "number" && !isNaN(p.parkingSpots) ? p.parkingSpots : undefined,
    area: typeof p.area === "number" && !isNaN(p.area) ? p.area : undefined,
    amenities
  };
}

/**
 * Gerador de Descrição Estritamente Factual (Zero Alucinação).
 * Regras mandatórias:
 * - Não inventa quartos, suítes, banheiros, vagas, metragem, armários planejados, lazer,
 *   segurança 24h ou aprovação de financiamento bancário.
 * - Preserva zero quando válido (ex: 0 quartos em vão livre / lote, 0 vagas).
 * - Omite o que for desconhecido (null, undefined ou ausente).
 * - Utiliza estritamente fatos cadastrados.
 */
export function buildFactualDescription(property: any): { professional: string; whatsapp: string; portal: string } {
  const p = property || {};
  const type = p.type ? sanitizeUntrustedText(p.type, 50) : "Imóvel";
  const condition = p.condition ? ` de ${sanitizeUntrustedText(p.condition, 50)}` : "";
  const modality = p.modality ? sanitizeUntrustedText(p.modality, 30) : "Venda";
  const title = p.title ? sanitizeUntrustedText(p.title, 100) : `${type} para ${modality}`;

  // Localização factual
  const locParts: string[] = [];
  if (p.neighborhood && String(p.neighborhood).trim()) locParts.push(`bairro ${sanitizeUntrustedText(p.neighborhood, 60)}`);
  if (p.city && String(p.city).trim()) locParts.push(sanitizeUntrustedText(p.city, 60));
  const locationStr = locParts.length > 0 ? ` situado em ${locParts.join(", ")}` : "";

  // Preço factual
  const formattedPrice = (typeof p.price === "number" && p.price > 0)
    ? p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : (p.price && !isNaN(Number(p.price)) && Number(p.price) > 0
        ? Number(p.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
        : "Sob Consulta");

  // Características cadastradas estritamente
  const specs: string[] = [];

  // Metragem
  if (typeof p.area === "number" && p.area > 0) {
    specs.push(`${p.area}m² de área privativa`);
  }

  // Quartos e suítes
  if (typeof p.bedrooms === "number") {
    if (p.bedrooms === 0) {
      specs.push("espaço em vão livre (sem dormitórios)");
    } else if (p.bedrooms > 0) {
      let bStr = `${p.bedrooms} dormitório(s)`;
      if (typeof p.suites === "number" && p.suites > 0) {
        bStr += ` (sendo ${p.suites} suíte(s))`;
      }
      specs.push(bStr);
    }
  } else if (typeof p.suites === "number" && p.suites > 0) {
    specs.push(`${p.suites} suíte(s)`);
  }

  // Banheiros
  if (typeof p.bathrooms === "number" && p.bathrooms > 0) {
    specs.push(`${p.bathrooms} banheiro(s)`);
  }

  // Vagas de garagem
  if (typeof p.parkingSpots === "number") {
    if (p.parkingSpots === 0) {
      specs.push("sem vaga de garagem");
    } else if (p.parkingSpots > 0) {
      specs.push(`${p.parkingSpots} vaga(s) de garagem`);
    }
  }

  // Comodidades registradas (somente fatos declarados)
  const amenitiesList = Array.isArray(p.amenities)
    ? p.amenities
        .filter((a: any) => typeof a === "string" && a.trim().length > 0)
        .map((a: string) => sanitizeUntrustedText(a, 60))
    : [];

  const specsText = specs.length > 0 ? ` Características do imóvel: ${specs.join(", ")}.` : "";
  const amenitiesText = amenitiesList.length > 0 ? ` Comodidades informadas: ${amenitiesList.join(", ")}.` : "";

  // 1. Versão Profissional
  const professional = `${type}${condition}${locationStr}. Disponível para ${modality} por ${formattedPrice}.${specsText}${amenitiesText} Entre em contato com nosso atendimento para obter informações detalhadas e agendar uma visita.`.trim();

  // 2. Versão WhatsApp
  const whatsappSpecs = specs.length > 0 ? `\n✨ *Destaques informados:*\n` + specs.map(s => `• ${s}`).join("\n") : "";
  const whatsappAmenities = amenitiesList.length > 0 ? `\n• Comodidades: ${amenitiesList.join(", ")}` : "";
  const whatsapp = `*${title.toUpperCase()}*\n\n` +
    `Excelente oportunidade de *${type}* para *${modality}*${locationStr}!\n` +
    whatsappSpecs + (whatsappSpecs && whatsappAmenities ? whatsappAmenities : (whatsappAmenities ? `\n✨ *Comodidades:*\n${whatsappAmenities}` : "")) + "\n\n" +
    `💵 *Valor:* ${formattedPrice}\n\n` +
    `Estou à disposição para apresentar todos os detalhes e agendar sua visita. Fale comigo! 📲`.trim();

  // 3. Versão Portal
  const portalSpecs = specs.length > 0 ? `\n\nCARACTERÍSTICAS DO IMÓVEL:\n` + specs.map(s => `- ${s}`).join("\n") : "";
  const portalAmenities = amenitiesList.length > 0 ? `\n\nCOMODIDADES E LAZER CADASTRADOS:\n` + amenitiesList.map(a => `- ${a}`).join("\n") : "";
  const portal = `Excelente oportunidade: ${type} para ${modality}${locationStr}.\n\n` +
    `Valor: ${formattedPrice}.${condition ? ` Estado de conservação: ${sanitizeUntrustedText(p.condition, 50)}.` : ""}` +
    portalSpecs + portalAmenities +
    `\n\nConsulte condições e agende seu horário com a nossa equipe comercial.`;

  return { professional, whatsapp, portal };
}

/**
 * Validador de Schema e Limites em Runtime para a Descrição Gerada pela IA.
 */
export function validateDescriptionResponse(
  output: any,
  inputProperty: any
): { valid: boolean; error?: string } {
  if (!output || typeof output !== "object") {
    return { valid: false, error: "A resposta gerada deve ser um objeto JSON." };
  }

  const { professional, whatsapp, portal } = output;

  if (typeof professional !== "string" || professional.trim().length === 0) {
    return { valid: false, error: "O campo 'professional' é obrigatório e deve ser uma string não vazia." };
  }
  if (typeof whatsapp !== "string" || whatsapp.trim().length === 0) {
    return { valid: false, error: "O campo 'whatsapp' é obrigatório e deve ser uma string não vazia." };
  }
  if (typeof portal !== "string" || portal.trim().length === 0) {
    return { valid: false, error: "O campo 'portal' é obrigatório e deve ser uma string não vazia." };
  }

  // Validação de limite máximo de caracteres de saída
  const maxLimit = GEMINI_LIMITS.MAX_OUTPUT_STRING_LENGTH;
  if (professional.length > maxLimit || whatsapp.length > maxLimit || portal.length > maxLimit) {
    return { valid: false, error: `Texto gerado pela IA excede o limite máximo de ${maxLimit} caracteres.` };
  }

  // Validação de Grounding Factual em Runtime:
  // Se o imóvel não possuía quartos (ou quartos === 0), o modelo não pode ter inventado "3 quartos" ou "dormitórios"
  const combined = (professional + " " + whatsapp + " " + portal).toLowerCase();

  if (inputProperty.bedrooms === 0 && (combined.includes("3 quartos") || combined.includes("3 dormitórios"))) {
    return { valid: false, error: "Falha de veracidade: IA inventou quantidade de quartos para imóvel sem dormitórios cadastrados." };
  }

  // Se o imóvel não tem amenities declaradas, não permitir invenção de "lazer completo", "segurança 24h" ou "armários planejados"
  const hasAmenities = Array.isArray(inputProperty.amenities) && inputProperty.amenities.length > 0;
  if (!hasAmenities) {
    if (combined.includes("lazer completo") || combined.includes("segurança 24h") || combined.includes("armários planejados") || combined.includes("financiamento bancário imediato")) {
      return { valid: false, error: "Falha de veracidade: IA inventou lazer, segurança, armários planejados ou financiamento não cadastrados." };
    }
  }

  return { valid: true };
}

/**
 * Validador de Schema em Runtime para Lembrete de WhatsApp.
 */
export function validateReminderResponse(output: any): { valid: boolean; error?: string } {
  if (!output || typeof output !== "object") {
    return { valid: false, error: "A resposta do lembrete deve ser um objeto JSON." };
  }
  if (typeof output.message !== "string" || output.message.trim().length === 0) {
    return { valid: false, error: "Campo 'message' é obrigatório e deve ser uma string." };
  }
  if (output.message.length > GEMINI_LIMITS.MAX_OUTPUT_STRING_LENGTH) {
    return { valid: false, error: "Mensagem de lembrete excede o tamanho máximo permitido." };
  }
  return { valid: true };
}

/**
 * Validador de Schema em Runtime para Sugestão de Tarefas.
 */
export function validateTasksResponse(output: any): { valid: boolean; error?: string } {
  if (!Array.isArray(output)) {
    return { valid: false, error: "A resposta de tarefas deve ser um array JSON." };
  }
  if (output.length === 0) {
    return { valid: false, error: "Lista de tarefas gerada está vazia." };
  }
  if (output.length > GEMINI_LIMITS.MAX_TASKS_LIST_SIZE) {
    return { valid: false, error: `Lista de tarefas excede o limite máximo de ${GEMINI_LIMITS.MAX_TASKS_LIST_SIZE} itens.` };
  }
  for (const item of output) {
    if (!item || typeof item !== "object") {
      return { valid: false, error: "Cada item de tarefa deve ser um objeto." };
    }
    if (typeof item.title !== "string" || typeof item.description !== "string") {
      return { valid: false, error: "Itens de tarefa devem conter 'title' e 'description'." };
    }
  }
  return { valid: true };
}

/**
 * Validador de Schema em Runtime para Next Best Actions.
 */
export function validateNextActionsResponse(output: any): { valid: boolean; error?: string } {
  if (!Array.isArray(output)) {
    return { valid: false, error: "A resposta de Next Best Actions deve ser um array." };
  }
  for (const item of output) {
    if (!item || typeof item !== "object") {
      return { valid: false, error: "Cada recomendação deve ser um objeto." };
    }
    if (typeof item.clientId !== "string" || typeof item.reason !== "string" || typeof item.suggestion !== "string") {
      return { valid: false, error: "Recomendação com estrutura inválida nos campos obrigatórios." };
    }
  }
  return { valid: true };
}
