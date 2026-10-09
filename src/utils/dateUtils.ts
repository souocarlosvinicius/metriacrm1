/**
 * ==============================================================================
 * METRIA CRM - UTILITÁRIOS DE DATA E FUSO HORÁRIO DO USUÁRIO
 * ==============================================================================
 * 
 * Evita a armadilha clássica de converter datas de calendário usando .toISOString()
 * (UTC) que retrocede ou avança dias no horário do usuário (ex: GMT-3 Brasil às 22h
 * vira o dia seguinte em UTC, e '2026-10-10' em UTC vira 21h do dia 9 em GMT-3).
 * 
 * Todas as operações de calendário preservam os componentes locais (ano, mês, dia)
 * garantindo integridade e consistência entre data e horário de agendamentos.
 */

/**
 * Retorna a data no formato ISO YYYY-MM-DD usando o fuso horário local do usuário.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Retorna o horário local no formato HH:mm usando o fuso horário local do usuário.
 */
export function getLocalTimeString(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Retorna data e hora combinadas no formato YYYY-MM-DDTHH:mm no fuso local.
 */
export function getLocalDateTimeString(date: Date = new Date()): string {
  return `${getLocalDateString(date)}T${getLocalTimeString(date)}`;
}

/**
 * Converte string 'YYYY-MM-DD' para objeto Date local (às 00:00:00 locais),
 * evitando o deslocamento que ocorre com new Date('YYYY-MM-DD') que assume UTC.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const parts = dateStr.split("T")[0].split("-").map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  return new Date(dateStr);
}

/**
 * Formata com segurança uma string 'YYYY-MM-DD' para 'DD/MM/YYYY' sem shift de fuso.
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const clean = dateStr.split("T")[0];
  const parts = clean.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Adiciona ou subtrai dias de uma string de data 'YYYY-MM-DD' mantendo o fuso local.
 */
export function addDaysToLocalDateString(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

/**
 * Determina se um compromisso/tarefa está atrasado, comparando data e horário locais
 * com a referência atual do usuário.
 */
export function isTaskOverdue(
  taskDate: string,
  taskTime?: string,
  referenceDate: Date = new Date()
): boolean {
  if (!taskDate) return false;
  const todayStr = getLocalDateString(referenceDate);

  if (taskDate < todayStr) {
    return true;
  }

  if (taskDate === todayStr && taskTime) {
    const currentHM = getLocalTimeString(referenceDate);
    return taskTime < currentHM;
  }

  return false;
}
