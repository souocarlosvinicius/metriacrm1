/**
 * ==============================================================================
 * METRIA CRM - GERENCIAMENTO DE ARQUIVOS, STORAGE E SEGURANÇA MULTI-TENANT
 * ==============================================================================
 *
 * Funcionalidades:
 * 1. Restrições estritas de tamanho e MIME type (Magic Bytes / Buffer Inspection).
 *    MIME declarado não prova conteúdo: executáveis, scripts ou HTML são rejeitados.
 * 2. Separação de Fotos Publicadas vs. Documentos Privados:
 *    - Fotos de anúncios (bucket: property-images, público) para portais e vitrines.
 *    - Documentos confidenciais (bucket: private-documents, privado) acessíveis
 *      apenas via URLs assinadas temporárias com verificação de tenant.
 * 3. Isolamento multi-tenant por caminho estruturado (tenants/<orgId>/...).
 * 4. Controle de quotas por plano/organização.
 * 5. Detecção e limpeza de arquivos órfãos não associados.
 */

export interface StorageConfig {
  MAX_PHOTO_SIZE_BYTES: number;
  MAX_DOCUMENT_SIZE_BYTES: number;
  ALLOWED_PHOTO_MIMES: string[];
  ALLOWED_DOCUMENT_MIMES: string[];
  PLAN_STORAGE_QUOTAS_BYTES: Record<string, number>;
}

export const STORAGE_LIMITS: StorageConfig = {
  MAX_PHOTO_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  MAX_DOCUMENT_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_PHOTO_MIMES: ["image/jpeg", "image/png", "image/webp"],
  ALLOWED_DOCUMENT_MIMES: ["application/pdf", "image/jpeg", "image/png"],
  PLAN_STORAGE_QUOTAS_BYTES: {
    beta: 50 * 1024 * 1024, // 50MB
    start: 200 * 1024 * 1024, // 200MB
    pro: 1 * 1024 * 1024 * 1024, // 1GB
    max: 5 * 1024 * 1024 * 1024, // 5GB
    pro_max: 20 * 1024 * 1024 * 1024 // 20GB
  }
};

/**
 * Inspeciona os Magic Bytes (assinatura binária) do cabeçalho do arquivo
 */
export function inspectMagicBytes(buffer: Uint8Array): { detectedMime: string | null; isValid: boolean } {
  if (!buffer || buffer.length < 4) {
    return { detectedMime: null, isValid: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { detectedMime: "image/jpeg", isValid: true };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { detectedMime: "image/png", isValid: true };
  }

  // WEBP: RIFF (bytes 0-3) e WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { detectedMime: "image/webp", isValid: true };
  }

  // PDF: %PDF- (25 50 44 46 2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return { detectedMime: "application/pdf", isValid: true };
  }

  return { detectedMime: null, isValid: false };
}

/**
 * Converte DataURL Base64 em Uint8Array com extração do mime declarado
 */
export function parseDataUrl(dataUrl: string): { buffer: Uint8Array; declaredMime: string } {
  const parts = dataUrl.split(",");
  if (parts.length !== 2) {
    throw new Error("Formato DataURL inválido.");
  }

  const mimeMatch = parts[0].match(/:(.*?);/);
  const declaredMime = mimeMatch ? mimeMatch[1].toLowerCase() : "application/octet-stream";

  const binaryString = typeof Buffer !== "undefined"
    ? Buffer.from(parts[1], "base64").toString("binary")
    : atob(parts[1]);

  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return { buffer: bytes, declaredMime };
}

/**
 * Valida integridade física do arquivo: tamanho, MIME declarado e Magic Bytes
 */
export function validateUploadFile(
  buffer: Uint8Array,
  declaredMime: string,
  category: "public_photo" | "private_document"
): { valid: boolean; error?: string; verifiedMime?: string } {
  const maxSizeBytes =
    category === "public_photo"
      ? STORAGE_LIMITS.MAX_PHOTO_SIZE_BYTES
      : STORAGE_LIMITS.MAX_DOCUMENT_SIZE_BYTES;

  if (buffer.length > maxSizeBytes) {
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `O arquivo excede o limite máximo permitido de ${maxMb}MB para esta categoria.`
    };
  }

  const allowedMimes =
    category === "public_photo"
      ? STORAGE_LIMITS.ALLOWED_PHOTO_MIMES
      : STORAGE_LIMITS.ALLOWED_DOCUMENT_MIMES;

  const normalizedDeclared = declaredMime.toLowerCase().replace("image/jpg", "image/jpeg");

  if (!allowedMimes.includes(normalizedDeclared)) {
    return {
      valid: false,
      error: `Tipo MIME '${declaredMime}' não é permitido para esta operação.`
    };
  }

  // Verificação de conteúdo real via Magic Bytes
  const { detectedMime, isValid } = inspectMagicBytes(buffer);

  if (!isValid || !detectedMime) {
    return {
      valid: false,
      error: "O conteúdo binário do arquivo não corresponde a um formato de mídia válido suportado."
    };
  }

  if (detectedMime !== normalizedDeclared) {
    return {
      valid: false,
      error: `Incompatibilidade de conteúdo: O cabeçalho real (${detectedMime}) diverge do MIME declarado (${declaredMime}).`
    };
  }

  return {
    valid: true,
    verifiedMime: detectedMime
  };
}

// Rastreamento de cota de armazenamento por organização (em memória e persistente)
export const tenantStorageUsage = new Map<string, number>();

export function getTenantStorageQuota(plan: string): number {
  return STORAGE_LIMITS.PLAN_STORAGE_QUOTAS_BYTES[plan.toLowerCase()] || STORAGE_LIMITS.PLAN_STORAGE_QUOTAS_BYTES.beta;
}

export function checkTenantQuota(orgId: string, plan: string, additionalBytes: number): { allowed: boolean; error?: string } {
  const quota = getTenantStorageQuota(plan);
  const currentUsage = tenantStorageUsage.get(orgId) || 0;

  if (currentUsage + additionalBytes > quota) {
    const quotaMb = Math.round(quota / (1024 * 1024));
    return {
      allowed: false,
      error: `Cota de armazenamento da organização excedida (${quotaMb}MB no Plano ${plan.toUpperCase()}). Faça upgrade nas Configurações.`
    };
  }

  return { allowed: true };
}

export function recordTenantStorageAdd(orgId: string, bytes: number) {
  const current = tenantStorageUsage.get(orgId) || 0;
  tenantStorageUsage.set(orgId, current + bytes);
}

export function recordTenantStorageRemove(orgId: string, bytes: number) {
  const current = tenantStorageUsage.get(orgId) || 0;
  tenantStorageUsage.set(orgId, Math.max(0, current - bytes));
}

/**
 * Gera caminho estruturado com isolamento de tenant
 */
export function buildStoragePath(
  orgId: string,
  category: "public_photo" | "private_document",
  entityId: string,
  extension: string
): { path: string; bucket: string } {
  const safeExt = extension.replace(".", "").toLowerCase();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `${timestamp}_${random}.${safeExt}`;

  if (category === "public_photo") {
    return {
      bucket: "property-images",
      path: `tenants/${orgId}/properties/${entityId}/${filename}`
    };
  }

  return {
    bucket: "private-documents",
    path: `tenants/${orgId}/documents/${entityId}/${filename}`
  };
}

/**
 * Validação de acesso a documento privado entre tenants
 */
export function validateDocumentTenantAccess(
  callerOrgId: string,
  documentStoragePath: string
): { allowed: boolean; error?: string } {
  if (!documentStoragePath.startsWith(`tenants/${callerOrgId}/`)) {
    return {
      allowed: false,
      error: "Acesso negado: o documento solicitado pertence a outro tenant ou caminho é inválido."
    };
  }
  return { allowed: true };
}

/**
 * Identifica arquivos órfãos para limpeza (arquivos presentes no storage mas sem vínculo em banco)
 */
export function findOrphanFiles(
  allStorageFiles: { path: string; size: number }[],
  referencedPaths: Set<string>
): { orphanFiles: { path: string; size: number }[]; totalFreedBytes: number } {
  const orphanFiles: { path: string; size: number }[] = [];
  let totalFreedBytes = 0;

  for (const file of allStorageFiles) {
    if (!referencedPaths.has(file.path)) {
      orphanFiles.push(file);
      totalFreedBytes += file.size;
    }
  }

  return { orphanFiles, totalFreedBytes };
}
