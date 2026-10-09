import { Client, Property } from "../types";

/**
 * ==============================================================================
 * METRIA CRM - EXPORTAÇÃO CSV COM NEUTRALIZAÇÃO DE INJEÇÃO DE FÓRMULAS
 * ==============================================================================
 *
 * Proteções implementadas:
 * 1. Neutralização de injeção DDE/CSV (Formula Injection):
 *    - Células textuais iniciadas por =, +, -, @, \t, \r, % são prefixadas com apóstrofo (')
 * 2. Preservação de números legítimos:
 *    - Valores estritamente numéricos (inteiros, floats, negativos e positivos) não são
 *      corrompidos ou prefixados com apóstrofo.
 * 3. Formatação RFC 4180:
 *    - Células contendo delimitadores (vírgula, ponto e vírgula, quebras de linha ou aspas)
 *      são delimitadas entre aspas duplas, duplicando-se aspas internas.
 */

const STRICT_NUMBER_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Verifica se um valor é um número legítimo (numérico ou string estritamente numérica)
 */
export function isLegitimateNumber(value: any): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (typeof value === "number") {
    return !isNaN(value) && isFinite(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return false;
    // Checa formato numérico estrito sem caracteres alfabéticos, comandos ou pontuações de máscara
    return STRICT_NUMBER_REGEX.test(trimmed) && !isNaN(Number(trimmed));
  }
  return false;
}

/**
 * Escapa uma célula individual para o formato CSV prevenindo execução de fórmulas
 */
export function escapeCSVCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Se for um número legítimo, preserva representação numérica original sem apóstrofo
  if (isLegitimateNumber(value)) {
    return String(value).trim();
  }

  let rawString = String(value);
  const rawFirstChar = rawString.charAt(0);
  const isDangerousControl =
    rawFirstChar === "=" ||
    rawFirstChar === "+" ||
    rawFirstChar === "-" ||
    rawFirstChar === "@" ||
    rawFirstChar === "\t" ||
    rawFirstChar === "\r" ||
    rawFirstChar === "%";

  let stringValue = rawString.replace(/\r?\n|\r/g, " ");

  if (isDangerousControl) {
    // Preserva o caractere de controle malicioso no início e neutraliza com apóstrofo
    stringValue = `'${stringValue}`;
  } else {
    stringValue = stringValue.trim();
    const firstChar = stringValue.charAt(0);
    if (
      firstChar === "=" ||
      firstChar === "+" ||
      firstChar === "-" ||
      firstChar === "@" ||
      firstChar === "\t" ||
      firstChar === "\r" ||
      firstChar === "%"
    ) {
      stringValue = `'${stringValue}`;
    }
  }

  // Regra RFC 4180: Se contém aspas, vírgula, ponto e vírgula, tabulação ou apóstrofo em início, envolve com aspas duplas
  if (
    stringValue.includes('"') ||
    stringValue.includes(",") ||
    stringValue.includes(";") ||
    stringValue.includes("\t") ||
    stringValue.startsWith("'")
  ) {
    stringValue = `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Monta o conteúdo bruto de um arquivo CSV a partir dos cabeçalhos e linhas
 */
export function generateCSVString(headers: string[], rows: string[][]): string {
  return [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");
}

/**
 * Gera os dados de exportação de clientes em formato CSV estruturado
 */
export function buildClientsCSV(clients: Client[]): { headers: string[]; rows: string[][]; csvContent: string } {
  const headers = [
    "Nome",
    "Telefone",
    "E-mail",
    "Documento",
    "Tipo de Cliente (PF/PJ)",
    "Perfil",
    "Objetivo",
    "Status de Atendimento",
    "Origem do Lead",
    "Interesse",
    "Faixa de Orçamento",
    "Temperatura",
    "Bairro de Interesse",
    "Tipo de Imóvel Desejado",
    "Orçamento Mínimo",
    "Orçamento Máximo",
    "Observações",
    "Data de Cadastro"
  ];

  const rows = clients.map(c => [
    escapeCSVCell(c.name),
    escapeCSVCell(c.phone),
    escapeCSVCell(c.email),
    escapeCSVCell(c.document),
    escapeCSVCell(c.clientType || "PF"),
    escapeCSVCell(c.profileType),
    escapeCSVCell(c.objective),
    escapeCSVCell(c.status),
    escapeCSVCell(c.leadSource || ""),
    escapeCSVCell(c.interest || ""),
    escapeCSVCell(c.budgetRange || ""),
    escapeCSVCell(c.temperature || ""),
    escapeCSVCell(c.neighborhoodOfInterest || ""),
    escapeCSVCell(c.desiredPropertyType || ""),
    escapeCSVCell(c.minBudget),
    escapeCSVCell(c.maxBudget),
    escapeCSVCell(c.observations),
    escapeCSVCell(c.createdAt ? (() => {
      const d = new Date(c.createdAt);
      return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
    })() : "")
  ]);

  const csvContent = generateCSVString(headers, rows);
  return { headers, rows, csvContent };
}

/**
 * Gera os dados de exportação de imóveis em formato CSV estruturado
 */
export function buildPropertiesCSV(properties: Property[]): { headers: string[]; rows: string[][]; csvContent: string } {
  const headers = [
    "Código",
    "Título",
    "Tipo de Imóvel",
    "Condição",
    "Modalidade",
    "Preço (BRL)",
    "Condomínio (BRL)",
    "IPTU (BRL)",
    "Endereço",
    "Bairro",
    "Cidade",
    "Quartos",
    "Suítes",
    "Banheiros",
    "Vagas de Garagem",
    "Área Total (m²)",
    "Área Construída (m²)",
    "Ano de Construção",
    "Status",
    "Nome do Captador",
    "Telefone do Captador",
    "Comissão Estimada (BRL)",
    "Data de Cadastro"
  ];

  const rows = properties.map(p => [
    escapeCSVCell(p.code || ""),
    escapeCSVCell(p.title),
    escapeCSVCell(p.type),
    escapeCSVCell(p.condition),
    escapeCSVCell(p.modality),
    escapeCSVCell(p.price),
    escapeCSVCell(p.condo),
    escapeCSVCell(p.iptu),
    escapeCSVCell(p.address),
    escapeCSVCell(p.neighborhood),
    escapeCSVCell(p.city),
    escapeCSVCell(p.bedrooms),
    escapeCSVCell(p.suites),
    escapeCSVCell(p.bathrooms),
    escapeCSVCell(p.parkingSpots),
    escapeCSVCell(p.area),
    escapeCSVCell(p.builtArea || ""),
    escapeCSVCell(p.constructionYear || ""),
    escapeCSVCell(p.status),
    escapeCSVCell(p.captadorName || ""),
    escapeCSVCell(p.captadorPhone || ""),
    escapeCSVCell(p.estimatedCommission || ""),
    escapeCSVCell(p.createdAt ? (() => {
      const d = new Date(p.createdAt);
      return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
    })() : "")
  ]);

  const csvContent = generateCSVString(headers, rows);
  return { headers, rows, csvContent };
}

/**
 * Aciona o download do CSV no navegador com injeção do BOM UTF-8
 */
export function downloadCSV(headers: string[], rows: string[][], filename: string) {
  const csvContent = generateCSVString(headers, rows);

  if (typeof window === "undefined" || typeof document === "undefined") {
    return csvContent;
  }

  // UTF-8 BOM (\uFEFF) para exibição correta de acentuação no Excel
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return csvContent;
}

/**
 * Exporta clientes para CSV disparando o download
 */
export function exportClientsToCSV(clients: Client[], isFiltered: boolean = false) {
  const { headers, rows } = buildClientsCSV(clients);
  const suffix = isFiltered ? "filtrados" : "completo";
  const dateStr = new Date().toISOString().split("T")[0];
  return downloadCSV(headers, rows, `crm_clientes_${suffix}_${dateStr}.csv`);
}

/**
 * Exporta imóveis para CSV disparando o download
 */
export function exportPropertiesToCSV(properties: Property[], isFiltered: boolean = false) {
  const { headers, rows } = buildPropertiesCSV(properties);
  const suffix = isFiltered ? "filtrados" : "completo";
  const dateStr = new Date().toISOString().split("T")[0];
  return downloadCSV(headers, rows, `crm_imoveis_${suffix}_${dateStr}.csv`);
}
