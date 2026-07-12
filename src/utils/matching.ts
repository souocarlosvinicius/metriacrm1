import { Property, Client } from "../types";

export interface MatchResult {
  property: Property;
  score: number; // 0 to 100
  reasons: string[];
}

export interface ClientMatchResult {
  client: Client;
  score: number; // 0 to 100
  reasons: string[];
}

/**
 * Extracts a number of bedrooms requirement from a string (e.g. "Apartamento 3 quartos", "2 qtos")
 */
function extractBedrooms(text: string): number | null {
  if (!text) return null;
  // Match patterns like "3 quartos", "3 qtos", "3q", "3 dorm", "3d"
  const regexes = [
    /(\d+)\s*(?:quartos?|qtos?|q\b|dormitórios?|dorms?|d\b)/i,
    /(?:com|de)\s*(\d+)\s*(?:quartos?|qtos?|q\b|dormitórios?|dorms?|d\b)/i
  ];
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

/**
 * Calculates the compatibility score (0 - 100) between a client and a property.
 */
export function calculateMatchScore(client: Client, property: Property): { score: number; reasons: string[] } {
  // 1. Status must be available (Disponível / EM PROPOSTA is also partially acceptable, but let's prioritize Disponível)
  const propStatus = (property.status || "").toUpperCase();
  if (propStatus !== "DISPONÍVEL" && propStatus !== "DISPONIVEL") {
    return { score: 0, reasons: ["O imóvel não está disponível no momento."] };
  }

  let totalWeight = 0;
  let earnedScore = 0;
  const reasons: string[] = [];

  // 2. Finalidade / Modality Matching (Weight: 25)
  const clientInterest = (client.interest || "").toUpperCase(); // e.g. "COMPRA", "LOCAÇÃO", "ALUGUEL"
  const propModality = (property.modality || "").toUpperCase(); // e.g. "VENDA", "ALUGUEL", "AMBOS"
  
  let modalityMatch = false;
  if (clientInterest === "COMPRA" || client.profileType === "Comprador") {
    if (propModality === "VENDA" || propModality === "AMBOS") {
      modalityMatch = true;
    }
  } else if (clientInterest === "LOCAÇÃO" || clientInterest === "ALUGUEL" || client.profileType === "Locatário") {
    if (propModality === "ALUGUEL" || propModality === "AMBOS") {
      modalityMatch = true;
    }
  } else if (!clientInterest) {
    // If client interest is not defined, we count it as a partial match
    modalityMatch = true;
  }

  totalWeight += 25;
  if (modalityMatch) {
    earnedScore += 25;
    reasons.push(`Compatível com o objetivo do cliente (${client.interest || "Compra/Venda"}).`);
  } else {
    reasons.push(`Divergência de modalidade: cliente busca ${client.interest || "outra modalidade"} e imóvel é para ${property.modality}.`);
  }

  // 3. Tipo de imóvel Matching (Weight: 25)
  const clientPropType = (client.propertyType || "").toLowerCase();
  const propType = (property.type || "").toLowerCase();
  const desiredPropTypeText = (client.desiredPropertyType || "").toLowerCase();

  let typeMatch = false;
  if (clientPropType && propType) {
    if (clientPropType === propType || propType.includes(clientPropType) || clientPropType.includes(propType)) {
      typeMatch = true;
    }
  }
  
  if (!typeMatch && desiredPropTypeText && propType) {
    if (desiredPropTypeText.includes(propType) || propType.includes(desiredPropTypeText)) {
      typeMatch = true;
    }
  }

  totalWeight += 25;
  if (typeMatch) {
    earnedScore += 25;
    reasons.push(`Tipo de imóvel correspondente (${property.type}).`);
  } else if (client.propertyType) {
    reasons.push(`Tipo diferente: cliente prefere ${client.propertyType} e o imóvel é ${property.type}.`);
  } else {
    // If client hasn't specified property type
    earnedScore += 20; // Partial points
    reasons.push(`Compatibilidade de tipo aceitável (cliente sem preferência explícita).`);
  }

  // 4. Bairro/Cidade Matching (Weight: 25)
  const clientNeighborhood = (client.neighborhoodOfInterest || "").toLowerCase();
  const propNeighborhood = (property.neighborhood || "").toLowerCase();
  const propCity = (property.city || "").toLowerCase();

  let locationMatchScore = 0; // 0 to 25
  let hasLocationPreference = false;

  if (clientNeighborhood) {
    hasLocationPreference = true;
    if (propNeighborhood && (clientNeighborhood.includes(propNeighborhood) || propNeighborhood.includes(clientNeighborhood))) {
      locationMatchScore = 25;
      reasons.push(`Excelente localização: Bairro ${property.neighborhood} desejado pelo cliente.`);
    } else if (propCity && clientNeighborhood.includes(propCity)) {
      locationMatchScore = 15;
      reasons.push(`Na cidade desejada (${property.city}), embora em bairro diferente (${property.neighborhood}).`);
    } else {
      locationMatchScore = 5;
      reasons.push(`Bairro (${property.neighborhood}) fora da preferência principal do cliente.`);
    }
  }

  totalWeight += 25;
  if (hasLocationPreference) {
    earnedScore += locationMatchScore;
  } else {
    // No explicit preference, assume good matching
    earnedScore += 25;
    reasons.push(`Imóvel na cidade ${property.city} (cliente sem restrição de bairro).`);
  }

  // 5. Orçamento Matching (Weight: 20)
  const minBud = client.minBudget || 0;
  const maxBud = client.maxBudget || 0;
  const price = property.price || 0;

  let budgetScore = 0;
  let hasBudget = minBud > 0 || maxBud > 0;

  if (hasBudget) {
    if (price >= minBud && price <= maxBud) {
      budgetScore = 20;
      reasons.push(`Dentro da faixa de orçamento ideal (R$ ${price.toLocaleString("pt-BR")}).`);
    } else if (maxBud > 0 && price <= maxBud * 1.15 && price >= minBud * 0.85) {
      budgetScore = 12;
      reasons.push(`Preço (R$ ${price.toLocaleString("pt-BR")}) ligeiramente fora da faixa (margem de 15%).`);
    } else {
      budgetScore = 2;
      reasons.push(`Preço fora do orçamento do cliente (R$ ${price.toLocaleString("pt-BR")}).`);
    }
  }

  totalWeight += 20;
  if (hasBudget) {
    earnedScore += budgetScore;
  } else {
    earnedScore += 20;
    reasons.push(`Valor dentro do esperado (cliente sem orçamento explícito).`);
  }

  // 6. Quartos Matching (Weight: 10)
  const reqBedrooms = extractBedrooms(client.desiredPropertyType || "") || extractBedrooms(client.observations || "");
  const propBedrooms = property.bedrooms || 0;

  if (reqBedrooms !== null) {
    totalWeight += 10;
    if (propBedrooms >= reqBedrooms) {
      earnedScore += 10;
      reasons.push(`Atende ao número de quartos desejado (${propBedrooms} quartos, mínimo de ${reqBedrooms}).`);
    } else {
      reasons.push(`Quartos insuficientes: possui ${propBedrooms} e o cliente prefere ${reqBedrooms}.`);
    }
  }

  const finalScore = Math.round((earnedScore / totalWeight) * 100);

  return {
    score: Math.min(100, Math.max(0, finalScore)),
    reasons: reasons.slice(0, 4) // Show up to 4 clear, constructive reasons
  };
}

/**
 * Given a client, search through all properties and return matching list sorted by score.
 */
export function getMatchingProperties(client: Client, properties: Property[]): MatchResult[] {
  return properties
    .map(property => {
      const { score, reasons } = calculateMatchScore(client, property);
      return { property, score, reasons };
    })
    .filter(match => match.score >= 40) // Show matches of at least 40% compatibility
    .sort((a, b) => b.score - a.score);
}

/**
 * Given a property, search through all clients and return matching list sorted by score.
 */
export function getMatchingClients(property: Property, clients: Client[]): ClientMatchResult[] {
  return clients
    .map(client => {
      const { score, reasons } = calculateMatchScore(client, property);
      return { client, score, reasons };
    })
    .filter(match => match.score >= 40) // Show matches of at least 40% compatibility
    .sort((a, b) => b.score - a.score);
}
