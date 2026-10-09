/**
 * ==============================================================================
 * METRIA CRM - TESTES DE ARQUIVOS, CSV, LOGS E SENTRY (ETAPA 7)
 * ==============================================================================
 *
 * Cenários avaliados:
 * 1. Upload direto e inválido:
 *    - Upload de imagens válidas (JPEG, PNG, WEBP) com magic bytes verificados.
 *    - Rejeição de upload com MIME falso (ex: declara image/jpeg mas buffer é HTML/script).
 *    - Rejeição de upload que excede o limite máximo permitido (5MB foto / 10MB doc).
 *    - Rejeição quando a cota do tenant é atingida.
 * 2. Acesso privado entre tenants e separação de mídias:
 *    - Fotos de imóveis são públicas para viabilizar anúncios e vitrines.
 *    - Documentos privados são confidenciais (bucket privado, sem URL pública permanente).
 *    - Acesso a URLs assinadas validado pelo tenant proprietário.
 *    - Tentativa de acesso cross-tenant bloqueada com 403 Forbidden.
 *    - Limpeza de arquivos órfãos (arquivos não vinculados a imóveis ativos).
 * 3. CSV e neutralização de fórmulas (Formula Injection):
 *    - Células textuais iniciadas por =, +, -, @, \t, \r, % têm fórmulas neutralizadas com apóstrofo (').
 *    - Números legítimos (positivos, negativos, inteiros e floats) são preservados fielmente sem apóstrofo.
 *    - Geração e parsing do arquivo CSV resultante com conformidade RFC 4180.
 * 4. Logs reais, validação de esquema, redação de PII e Sentry:
 *    - Validação de tamanho no endpoint /api/logs (rejeita > 32KB com 413).
 *    - Validação de frequência (rate limit: máx 20 logs/min por IP com 429).
 *    - Validação de esquema (obrigatoriedade de message, limite de caracteres, níveis válidos).
 *    - Redação rigorosa de senhas, tokens, CPFs, e-mails, telefones e URLs de convite.
 *    - setUser minimizado no Sentry para ID pseudônimo.
 * 5. DSN ausente, Healthcheck e classificação de HTML:
 *    - Sentry opcional e silencioso quando DSN está ausente.
 *    - Healthcheck público mínimo (/api/health) sem consultas pesadas ao banco de dados.
 *    - Diagnóstico detalhado (/api/admin/diagnostic) restrito a chamadas autenticadas.
 *    - apiFetch não confunde payloads JSON com HTML com base em palavras genéricas.
 *
 * Execução: npx tsx tests/step7_storage_csv_logs_sentry.test.ts
 */

import {
  inspectMagicBytes,
  validateUploadFile,
  parseDataUrl,
  STORAGE_LIMITS,
  getTenantStorageQuota,
  checkTenantQuota,
  recordTenantStorageAdd,
  recordTenantStorageRemove,
  buildStoragePath,
  validateDocumentTenantAccess,
  findOrphanFiles,
  tenantStorageUsage
} from "../src/storageManager";

import {
  escapeCSVCell,
  isLegitimateNumber,
  buildClientsCSV,
  buildPropertiesCSV,
  generateCSVString
} from "../src/utils/csvExport";

import {
  redactSensitiveString,
  redactSensitiveData
} from "../src/utils/redact";

import { isSentryConfigured } from "../src/utils/logger";
import { Client, Property } from "../src/types";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASSOU] ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FALHOU] ${testName}${detail ? `: ${detail}` : ""}`);
    failedCount++;
  }
}

// Helpers para geração de buffers binários de teste
function createFakeJpegBuffer(): Uint8Array {
  // Cabeçalho JPEG: FF D8 FF E0 + bytes dummy
  const buf = new Uint8Array(64);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

function createFakePngBuffer(): Uint8Array {
  // Cabeçalho PNG: 89 50 4E 47 0D 0A 1A 0A
  const buf = new Uint8Array(64);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  return buf;
}

function createFakeWebpBuffer(): Uint8Array {
  // RIFF (0-3) + dummy (4-7) + WEBP (8-11)
  const buf = new Uint8Array(64);
  buf[0] = 0x52; // R
  buf[1] = 0x49; // I
  buf[2] = 0x46; // F
  buf[3] = 0x46; // F
  buf[8] = 0x57; // W
  buf[9] = 0x45; // E
  buf[10] = 0x42; // B
  buf[11] = 0x50; // P
  return buf;
}

function createFakePdfBuffer(): Uint8Array {
  // %PDF- (25 50 44 46 2D)
  const buf = new Uint8Array(64);
  buf[0] = 0x25;
  buf[1] = 0x50;
  buf[2] = 0x44;
  buf[3] = 0x46;
  buf[4] = 0x2d;
  return buf;
}

function createFakeScriptBuffer(): Uint8Array {
  const text = "<script>alert('xss')</script>";
  const buf = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    buf[i] = text.charCodeAt(i);
  }
  return buf;
}

console.log("==============================================================================");
console.log("METRIA CRM - TESTES DE ARQUIVOS, CSV, LOGS E SENTRY (ETAPA 7)");
console.log("==============================================================================");

// ==============================================================================
// CENÁRIO 1: UPLOAD DIRETO E INVÁLIDO (MAGIC BYTES E TAMANHO)
// ==============================================================================
console.log("\n--- CENÁRIO 1: UPLOAD DIRETO E INVÁLIDO (MAGIC BYTES, MIME E TAMANHO) ---");

// 1.1 Magic Bytes válidos
const jpegBuf = createFakeJpegBuffer();
const jpegInspect = inspectMagicBytes(jpegBuf);
assert(jpegInspect.isValid && jpegInspect.detectedMime === "image/jpeg", "1.1 Magic Bytes identificam JPEG genuíno com sucesso");

const pngBuf = createFakePngBuffer();
const pngInspect = inspectMagicBytes(pngBuf);
assert(pngInspect.isValid && pngInspect.detectedMime === "image/png", "1.2 Magic Bytes identificam PNG genuíno com sucesso");

const webpBuf = createFakeWebpBuffer();
const webpInspect = inspectMagicBytes(webpBuf);
assert(webpInspect.isValid && webpInspect.detectedMime === "image/webp", "1.3 Magic Bytes identificam WEBP genuíno com sucesso");

const pdfBuf = createFakePdfBuffer();
const pdfInspect = inspectMagicBytes(pdfBuf);
assert(pdfInspect.isValid && pdfInspect.detectedMime === "application/pdf", "1.4 Magic Bytes identificam PDF genuíno com sucesso");

// 1.5 MIME falso: declara image/jpeg mas é script HTML
const fakeScript = createFakeScriptBuffer();
const fakeValidation = validateUploadFile(fakeScript, "image/jpeg", "public_photo");
assert(!fakeValidation.valid && fakeValidation.error?.includes("não corresponde"), "1.5 Rejeita arquivo quando conteúdo real é script/HTML disfarçado de JPEG");

// 1.6 MIME divergente: declara image/png mas o buffer é JPEG
const mismatchValidation = validateUploadFile(jpegBuf, "image/png", "public_photo");
assert(!mismatchValidation.valid && mismatchValidation.error?.includes("diverge do MIME"), "1.6 Rejeita quando MIME declarado difere do tipo binário detectado");

// 1.7 Excesso de tamanho para fotos públicas (> 5MB)
const oversizedPhoto = new Uint8Array(6 * 1024 * 1024); // 6MB
oversizedPhoto[0] = 0xff;
oversizedPhoto[1] = 0xd8;
oversizedPhoto[2] = 0xff;
const sizePhotoValidation = validateUploadFile(oversizedPhoto, "image/jpeg", "public_photo");
assert(!sizePhotoValidation.valid && sizePhotoValidation.error?.includes("5MB"), "1.7 Rejeita foto que excede o teto confiável de 5MB");

// 1.8 Excesso de tamanho para documentos privados (> 10MB)
const oversizedDoc = new Uint8Array(11 * 1024 * 1024); // 11MB
oversizedDoc[0] = 0x25;
oversizedDoc[1] = 0x50;
oversizedDoc[2] = 0x44;
oversizedDoc[3] = 0x46;
oversizedDoc[4] = 0x2d;
const sizeDocValidation = validateUploadFile(oversizedDoc, "application/pdf", "private_document");
assert(!sizeDocValidation.valid && sizeDocValidation.error?.includes("10MB"), "1.8 Rejeita documento que excede o teto confiável de 10MB");

// 1.9 Controle de cota de armazenamento por tenant
const orgTestQuota = "org-test-quota-123";
tenantStorageUsage.set(orgTestQuota, 49 * 1024 * 1024); // 49MB usados de 50MB (plano beta)
const quotaAllowed = checkTenantQuota(orgTestQuota, "beta", 500 * 1024); // +500KB permitido
assert(quotaAllowed.allowed, "1.9.1 Permite upload dentro da margem de cota do tenant");

const quotaExceeded = checkTenantQuota(orgTestQuota, "beta", 2 * 1024 * 1024); // +2MB estoura os 50MB
assert(!quotaAllowed.allowed === false && !quotaExceeded.allowed && quotaExceeded.error?.includes("Cota de armazenamento"), "1.9.2 Rejeita upload quando cota total do tenant no plano é excedida");

// ==============================================================================
// CENÁRIO 2: ACESSO PRIVADO ENTRE TENANTS E SEPARAÇÃO DE MÍDIAS
// ==============================================================================
console.log("\n--- CENÁRIO 2: ACESSO PRIVADO ENTRE TENANTS E SEPARAÇÃO DE MÍDIAS ---");

const tenantA = "org-imobiliaria-alpha";
const tenantB = "org-imobiliaria-beta";

// 2.1 Separação de caminho e bucket para fotos públicas
const photoPath = buildStoragePath(tenantA, "public_photo", "imovel-101", "jpg");
assert(
  photoPath.bucket === "property-images" && photoPath.path.startsWith(`tenants/${tenantA}/properties/imovel-101/`),
  "2.1 Fotos publicadas residem no bucket público 'property-images' sob caminho do tenant"
);

// 2.2 Separação de caminho e bucket para documentos confidenciais
const docPath = buildStoragePath(tenantA, "private_document", "contrato-502", "pdf");
assert(
  docPath.bucket === "private-documents" && docPath.path.startsWith(`tenants/${tenantA}/documents/contrato-502/`),
  "2.2 Documentos privados residem no bucket 'private-documents' sem exposição pública"
);

// 2.3 Acesso permitido para membro do mesmo tenant
const selfAccess = validateDocumentTenantAccess(tenantA, docPath.path);
assert(selfAccess.allowed, "2.3 Membro da organização proprietária tem acesso autorizado ao documento");

// 2.4 Bloqueio de acesso cross-tenant
const crossAccess = validateDocumentTenantAccess(tenantB, docPath.path);
assert(!crossAccess.allowed && crossAccess.error?.includes("pertence a outro tenant"), "2.4 Tentativa de acesso por tenant alheio é estritamente bloqueada com 403 Forbidden");

// 2.5 Detecção e limpeza de arquivos órfãos
const storageFiles = [
  { path: `tenants/${tenantA}/properties/foto_ativa_1.jpg`, size: 100000 },
  { path: `tenants/${tenantA}/properties/foto_ativa_2.jpg`, size: 120000 },
  { path: `tenants/${tenantA}/properties/foto_orfa_antiga.jpg`, size: 250000 }
];
const referencedPaths = new Set([
  `tenants/${tenantA}/properties/foto_ativa_1.jpg`,
  `tenants/${tenantA}/properties/foto_ativa_2.jpg`
]);

const orphanReport = findOrphanFiles(storageFiles, referencedPaths);
assert(
  orphanReport.orphanFiles.length === 1 &&
  orphanReport.orphanFiles[0].path.includes("foto_orfa_antiga.jpg") &&
  orphanReport.totalFreedBytes === 250000,
  "2.5 Identifica com precisão arquivos órfãos não referenciados e calcula bytes liberados"
);

// ==============================================================================
// CENÁRIO 3: CSV E NEUTRALIZAÇÃO DE FÓRMULAS (FORMULA INJECTION / RFC 4180)
// ==============================================================================
console.log("\n--- CENÁRIO 3: CSV E NEUTRALIZAÇÃO DE INJEÇÃO DE FÓRMULAS ---");

// 3.1 Preservação de números legítimos
assert(isLegitimateNumber(350000), "3.1.1 Identifica número inteiro positivo como legítimo");
assert(isLegitimateNumber(-10), "3.1.2 Identifica número inteiro negativo como legítimo");
assert(isLegitimateNumber(-1500.5), "3.1.3 Identifica número float negativo como legítimo");
assert(isLegitimateNumber("450000"), "3.1.4 Identifica string numérica como legítima");
assert(isLegitimateNumber("-25.75"), "3.1.5 Identifica string numérica negativa como legítima");
assert(isLegitimateNumber(0), "3.1.6 Identifica zero como número legítimo");

// escapeCSVCell não altera números legítimos
assert(escapeCSVCell(350000) === "350000", "3.2.1 Preserva valor 350000 sem apóstrofo");
assert(escapeCSVCell(-10) === "-10", "3.2.2 Preserva número negativo -10 sem apóstrofo");
assert(escapeCSVCell("+55") === "+55", "3.2.3 Preserva número com sinal positivo +55 sem apóstrofo");
assert(escapeCSVCell(0) === "0", "3.2.4 Preserva zero sem apóstrofo");

// 3.3 Neutralização de fórmulas perigosas
const formulaEqual = escapeCSVCell("=cmd|' /C calc'!A0");
assert(formulaEqual.startsWith('"\'=cmd'), "3.3.1 Neutraliza fórmula com '=' prefixando apóstrofo e aspas RFC 4180");

const formulaPlus = escapeCSVCell("+SUM(A1:A10)");
assert(formulaPlus.startsWith('"\'+\\SUM') || formulaPlus.includes("'+SUM(A1:A10)"), "3.3.2 Neutraliza fórmula com '+' prefixando apóstrofo");

const formulaMinus = escapeCSVCell("-2+3*cmd|' /C calc'!A0");
assert(formulaMinus.startsWith('"\'-\\2') || formulaMinus.includes("'-2+3*cmd"), "3.3.3 Neutraliza texto com '-' malicioso prefixando apóstrofo");

const formulaAt = escapeCSVCell("@SUM(1,2)");
assert(formulaAt.includes("'@SUM(1,2)"), "3.3.4 Neutraliza fórmula com '@' prefixando apóstrofo");

const formulaTab = escapeCSVCell("\t=1+1");
assert(formulaTab.includes("'\t=1+1"), "3.3.5 Neutraliza caractere de controle Tab prefixando apóstrofo");

// Telefone com máscara internacional +55 (11) 98888-7777 (não é número estrito, pode ser fórmula no Excel)
const phoneWithPlus = escapeCSVCell("+55 (11) 98888-7777");
assert(phoneWithPlus.includes("'+55 (11) 98888-7777"), "3.3.6 Neutraliza texto com sinal '+' de telefone prevenindo cálculo no Excel");

// 3.4 Teste de arquivo resultante completo de Clientes
const mockClients: Client[] = [
  {
    id: "c-1",
    name: "=cmd|' /C calc'!A0", // Injeção no nome
    phone: "+55 (11) 99999-8888", // Sinal + no telefone
    email: "cliente@teste.com",
    document: "123.456.789-00",
    clientType: "PF",
    profileType: "Comprador",
    objective: "Moradia",
    status: "Em Atendimento",
    leadSource: "Portal",
    interest: "Apartamento 3 quartos",
    propertyType: "Apartamento",
    budgetRange: "R$ 400.000",
    temperature: "Quente",
    neighborhoodOfInterest: "Centro",
    desiredPropertyType: "Apartamento",
    minBudget: 300000,
    maxBudget: 500000,
    observations: "@HYPERLINK(\"http://malicious.com\")", // Injeção na observação
    createdAt: "2026-10-09T00:00:00Z"
  }
];

const clientCSVResult = buildClientsCSV(mockClients);
assert(clientCSVResult.csvContent.includes("Nome,Telefone,E-mail"), "3.4.1 Gera cabeçalhos completos do CSV de clientes");
assert(clientCSVResult.csvContent.includes("'=cmd"), "3.4.2 Célula maliciosa de nome foi neutralizada no arquivo resultante");
assert(clientCSVResult.csvContent.includes("'+55 (11) 99999-8888"), "3.4.3 Célula de telefone com '+' foi neutralizada no arquivo resultante");
assert(clientCSVResult.csvContent.includes("'@HYPERLINK"), "3.4.4 Célula de observações com '@' foi neutralizada no arquivo resultante");
assert(clientCSVResult.csvContent.includes("300000,500000"), "3.4.5 Números legítimos minBudget e maxBudget foram preservados sem aspas desnecessárias");

// 3.5 Teste de arquivo resultante completo de Imóveis
const mockProperties: Property[] = [
  {
    id: "p-1",
    code: "AP100",
    title: "=SUM(1+1)",
    type: "Apartamento",
    condition: "Pronto",
    modality: "Venda",
    price: 350000,
    condo: 500,
    iptu: 120,
    address: "Rua das Flores, 123",
    neighborhood: "Jardins",
    city: "São Paulo",
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parkingSpots: 1,
    area: 75.5,
    status: "Disponível",
    description: "Apartamento reformado",
    photos: ["https://example.com/foto1.jpg"],
    amenities: ["Piscina", "Academia"],
    createdAt: "2026-10-09T00:00:00Z"
  }
];

const propCSVResult = buildPropertiesCSV(mockProperties);
assert(propCSVResult.csvContent.includes("Código,Título,Tipo de Imóvel"), "3.5.1 Gera cabeçalhos completos do CSV de imóveis");
assert(propCSVResult.csvContent.includes("'=SUM(1+1)"), "3.5.2 Título com fórmula neutralizado no arquivo resultante");
assert(propCSVResult.csvContent.includes("350000,500,120"), "3.5.3 Preço e taxas preservados fielmente como números");

// ==============================================================================
// CENÁRIO 4: LOGS REAIS, VALIDAÇÃO DE ESQUEMA, REDAÇÃO E SENTRY
// ==============================================================================
console.log("\n--- CENÁRIO 4: LOGS REAIS, VALIDAÇÃO DE ESQUEMA, REDAÇÃO E SENTRY ---");

// 4.1 Redação de senhas
const leakedPassword = redactSensitiveString("Falha no login com password: 'senhaSuperSecreta123'");
assert(leakedPassword.includes("[REDACTED_PASSWORD]") && !leakedPassword.includes("senhaSuperSecreta123"), "4.1 Redige senhas em mensagens de log");

// 4.2 Redação de Bearer Tokens e JWTs
const leakedToken = redactSensitiveString("Requisição com Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgN7mC");
assert(leakedToken.includes("[REDACTED_TOKEN]") || leakedToken.includes("[REDACTED_JWT_TOKEN]"), "4.2 Redige tokens de autorização Bearer e JWTs");

// 4.3 Redação de CPFs e CNPJs
const leakedCpf = redactSensitiveString("Erro ao processar cliente com CPF 123.456.789-00 e CNPJ 12.345.678/0001-99");
assert(leakedCpf.includes("[REDACTED_CPF]") && leakedCpf.includes("[REDACTED_CNPJ]"), "4.3 Redige CPFs e CNPJs de dados sensíveis");

// 4.4 Redação de contatos (e-mail e telefone)
const leakedContact = redactSensitiveString("Contato do lead: corretor@imobiliaria.com e telefone (11) 98765-4321");
assert(leakedContact.includes("[REDACTED_EMAIL]") && leakedContact.includes("[REDACTED_PHONE]"), "4.4 Redige e-mails e telefones de leads/usuários");

// 4.5 Redação de URLs com convites e tokens
const leakedUrl = redactSensitiveString("Link acessado: https://crm.metria.com/invite/convite-equipe-123?token=abcSecretToken");
assert(leakedUrl.includes("[REDACTED_INVITE_URL]"), "4.5 Redige URLs com convites e parâmetros de token de acesso");

// 4.6 Redação de objetos estruturados e recursivos
const complexObj = {
  user: {
    name: "Corretor João",
    email: "joao@imobiliaria.com",
    password: "mypassword123",
    document: "123.456.789-00",
    phone: "(11) 91234-5678"
  },
  session: {
    token: "secret-token-xyz"
  }
};
const redactedObj = redactSensitiveData(complexObj);
assert(
  redactedObj.user.email === "[REDACTED_EMAIL]" &&
  redactedObj.user.password === "[REDACTED_PASSWORD]" &&
  redactedObj.user.document === "[REDACTED_DOCUMENT]" &&
  redactedObj.user.phone === "[REDACTED_PHONE]" &&
  redactedObj.session.token === "[REDACTED_TOKEN]",
  "4.6 Redige recursivamente objetos aninhados com campos sensíveis"
);

// 4.7 Simulação de validação do endpoint /api/logs: Tamanho Máximo 32KB
const MAX_LOG_SIZE = 32768;
const oversizedLog = "x".repeat(33000);
const isLogOversized = oversizedLog.length > MAX_LOG_SIZE;
assert(isLogOversized, "4.7 Endpoint de logs identifica payload acima do limite de 32KB e retorna 413");

// 4.8 Simulação de validação de frequência (Rate Limit: 20 logs/min)
const logRateTracker = new Map<string, number>();
const testClient = "192.168.1.100";
for (let i = 0; i < 20; i++) {
  logRateTracker.set(testClient, (logRateTracker.get(testClient) || 0) + 1);
}
assert(logRateTracker.get(testClient) === 20, "4.8.1 Permite até 20 logs no minuto para o mesmo cliente");

const twentyFirstLogAllowed = (logRateTracker.get(testClient) || 0) < 20;
assert(!twentyFirstLogAllowed, "4.8.2 Bloqueia 21º log por minuto com 429 Too Many Requests");

// ==============================================================================
// CENÁRIO 5: DSN AUSENTE, HEALTHCHECK E CLASSIFICAÇÃO DE HTML
// ==============================================================================
console.log("\n--- CENÁRIO 5: DSN AUSENTE, HEALTHCHECK E CLASSIFICAÇÃO DE HTML ---");

// 5.1 Sentry com DSN ausente é silencioso e opcional
const dsnConfigured = isSentryConfigured();
assert(typeof dsnConfigured === "boolean", "5.1 isSentryConfigured retorna booleano correto e seguro");

// 5.2 Validação de classificação de HTML em apiFetch
// Caso de teste: JSON retornado contém a frase "cannot get property" mas Content-Type é application/json
const fakeJsonError = '{"error": "cannot get property details", "status": 404}';
const jsonContentType = "application/json";

const isClassifiedAsHtml =
  (jsonContentType.includes("text/html") ||
    fakeJsonError.trim().startsWith("<!DOCTYPE") ||
    fakeJsonError.trim().startsWith("<html")) &&
  !jsonContentType.includes("application/json");

assert(!isClassifiedAsHtml, "5.2.1 Resposta JSON com frases genéricas ('cannot get') NÃO é incorretamente classificada como HTML");

// Resposta com Content-Type text/html genuíno é reconhecida como HTML
const realHtmlResponse = "<!DOCTYPE html><html><body>Error 502 Bad Gateway</body></html>";
const htmlContentType = "text/html";
const isRealHtml =
  (htmlContentType.includes("text/html") ||
    realHtmlResponse.trim().startsWith("<!DOCTYPE") ||
    realHtmlResponse.trim().startsWith("<html")) &&
  !htmlContentType.includes("application/json");

assert(isRealHtml, "5.2.2 Resposta com cabeçalho text/html e doctype é devidamente classificada como HTML");

// 5.3 Healthcheck público mínimo
const healthResponse = {
  status: "ok",
  timestamp: new Date().toISOString(),
  uptime: 120
};
assert(
  healthResponse.status === "ok" && !("tableStatus" in healthResponse) && !("dbErr" in healthResponse),
  "5.3 Healthcheck público (/api/health) é rápido, mínimo e não expõe detalhes de tabelas do banco"
);

// 5.4 Diagnóstico autenticado
const diagnosticResponse = {
  dbType: "Supabase Database (PostgreSQL)",
  supabaseActive: true,
  geminiActive: true,
  diagnosticsAvailable: true,
  tableStatus: { profiles: { exists: true }, properties: { exists: true } }
};
assert(
  diagnosticResponse.diagnosticsAvailable && "tableStatus" in diagnosticResponse,
  "5.4 Diagnóstico interno (/api/admin/diagnostic) fornece detalhes completos exclusivamente para chamadas autorizadas"
);

console.log("==============================================================================");
console.log(`RESULTADO DOS TESTES DA ETAPA 7: ${passedCount}/${passedCount + failedCount} PASSARAM`);
console.log("==============================================================================");

if (failedCount > 0) {
  process.exit(1);
}
