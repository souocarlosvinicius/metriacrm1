import { Client, Property } from "../types";

/**
 * Escapes a cell value for CSV format according to RFC 4180 rules:
 * - Wrap values containing commas, double quotes, or newlines in double quotes.
 * - Escape double quotes within values by doubling them.
 * - Clean up null/undefined values.
 */
function escapeCSVCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  
  let stringValue = String(value).trim();
  
  // Replace newlines with spaces to avoid breaking CSV structure
  stringValue = stringValue.replace(/\r?\n|\r/g, " ");

  // If the value contains double quotes, commas, or semicolons, we escape it
  if (stringValue.includes('"') || stringValue.includes(",") || stringValue.includes(";")) {
    // Double the double quotes
    stringValue = stringValue.replace(/"/g, '""');
    return `"${stringValue}"`;
  }
  
  return stringValue;
}

/**
 * Generates and triggers the download of a CSV file.
 * Automatically injects the UTF-8 BOM so Excel opens accented characters correctly.
 */
export function downloadCSV(headers: string[], rows: string[][], filename: string) {
  // Combine headers and rows with comma separation (or semicolon for Portuguese Excel)
  // Comma is the standard, but we'll use comma. To be safe, we wrap each item.
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");

  // UTF-8 BOM
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
}

/**
 * Exports clients data to CSV
 */
export function exportClientsToCSV(clients: Client[], isFiltered: boolean = false) {
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

  const suffix = isFiltered ? "filtrados" : "completo";
  const dateStr = new Date().toISOString().split("T")[0];
  downloadCSV(headers, rows, `crm_clientes_${suffix}_${dateStr}.csv`);
}

/**
 * Exports properties data to CSV
 */
export function exportPropertiesToCSV(properties: Property[], isFiltered: boolean = false) {
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

  const suffix = isFiltered ? "filtrados" : "completo";
  const dateStr = new Date().toISOString().split("T")[0];
  downloadCSV(headers, rows, `crm_imoveis_${suffix}_${dateStr}.csv`);
}
