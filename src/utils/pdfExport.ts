import { jsPDF } from "jspdf";
import { Client, Proposal, Visit, Property } from "../types";

/**
 * Generates and downloads a beautiful, formatted PDF report of a client's profile,
 * associated proposals, visits, and interaction history.
 */
export function exportClientReportToPDF(
  client: Client,
  allProposals: Proposal[] = [],
  allVisits: Visit[] = []
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageHeight = 285;
  const margin = 15;
  const contentWidth = 210 - margin * 2; // A4 is 210mm wide
  let y = 20;

  // Helper function to check page limit and add a new page if necessary
  const checkPageLimit = (neededHeight: number) => {
    if (y + neededHeight > pageHeight) {
      doc.addPage();
      y = margin + 10;
      // Draw a subtle header on new pages
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Relatório do Cliente: ${client.name} | Metria CRM`, margin, margin);
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, margin + 2, margin + contentWidth, margin + 2);
    }
  };

  // Helper to format currency
  const formatCurrency = (val: number) => {
    return val.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0
    });
  };

  // Helper to draw section title
  const drawSectionTitle = (title: string) => {
    checkPageLimit(12);
    y += 4;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // Primary slate-900 color
    doc.text(title.toUpperCase(), margin, y);
    y += 2.5;
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentWidth, y);
    y += 5;
  };

  // --- HEADER SECTION ---
  doc.setFillColor(15, 23, 42); // Dark Navy / Slate 900
  doc.rect(0, 0, 210, 32, "F");

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("METRIA CRM", margin, 15);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240); // slate-200
  doc.text("Relatório Individual de Atendimento e Histórico", margin, 21);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  const dateStr = new Date().toLocaleString("pt-BR");
  doc.text(`Gerado em: ${dateStr}`, 210 - margin - 45, 15);
  doc.text("Apoio ao Corretor & Gestão Comercial", 210 - margin - 51, 21);

  y = 42;

  // --- CLIENT DETAILS SECTION ---
  drawSectionTitle("Dados Principais do Cliente");

  // Grid background for general info
  checkPageLimit(50);
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(241, 245, 249); // slate-100
  doc.rect(margin, y, contentWidth, 42, "FD");

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600

  // Column 1
  let col1X = margin + 4;
  let col2X = margin + (contentWidth / 2) + 2;

  doc.text("Nome Completo:", col1X, y + 6);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(client.name || "Não informado", col1X + 28, y + 6);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Telefone:", col1X, y + 13);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(client.phone || "Não informado", col1X + 28, y + 13);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("E-mail:", col1X, y + 20);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(client.email || "Não informado", col1X + 28, y + 20);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Documento:", col1X, y + 27);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(`${client.document || "Não informado"} (${client.clientType || "PF"})`, col1X + 28, y + 27);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Endereço:", col1X, y + 34);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  const addrText = client.address || "Não informado";
  const truncatedAddr = addrText.length > 35 ? addrText.substring(0, 35) + "..." : addrText;
  doc.text(truncatedAddr, col1X + 28, y + 34);

  // Column 2
  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Perfil:", col2X, y + 6);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(client.profileType || "Não informado", col2X + 38, y + 6);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Interesse:", col2X, y + 13);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(`${client.interest || "Compra"} • ${client.desiredPropertyType || "Qualquer"}`, col2X + 38, y + 13);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Orçamento:", col2X, y + 20);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(client.budgetRange || `${formatCurrency(client.minBudget || 0)} - ${formatCurrency(client.maxBudget || 0)}`, col2X + 38, y + 20);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Canal de Origem:", col2X, y + 27);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(client.leadSource || "Não informado", col2X + 38, y + 27);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Fase na Esteira:", col2X, y + 34);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(`${client.pipelineStatus || "Novo lead"} (${client.status || "Ativo"})`, col2X + 38, y + 34);

  y += 46;

  // Potential values & commission if available
  if (client.potentialValue || client.commissionForecast) {
    checkPageLimit(15);
    doc.setFillColor(240, 253, 250); // teal-50
    doc.setDrawColor(204, 251, 241); // teal-100
    doc.rect(margin, y, contentWidth, 10, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(13, 148, 136); // teal-600
    doc.text("Previsão Comercial:", col1X, y + 6.5);

    doc.setFont("Helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    const potentialStr = client.potentialValue ? `Valor Negócio: ${formatCurrency(client.potentialValue)}` : "";
    const commStr = client.commissionForecast ? `Prev. Comissão (${client.commissionPercent || 0}%): ${formatCurrency(client.commissionForecast)}` : "";
    const probabilityStr = client.closingProbability ? `Probabilidade: ${client.closingProbability}` : "";

    const combinedStr = [potentialStr, commStr, probabilityStr].filter(Boolean).join("  |  ");
    doc.text(combinedStr, col1X + 32, y + 6.5);
    y += 14;
  }

  // Lead temperatures and next action follow up
  if (client.temperature || client.nextAction) {
    checkPageLimit(15);
    doc.setFillColor(254, 243, 199); // amber-50
    doc.setDrawColor(253, 230, 138); // amber-100
    doc.rect(margin, y, contentWidth, 10, "FD");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(217, 119, 6); // amber-600
    doc.text("Follow-up Planejado:", col1X, y + 6.5);

    doc.setFont("Helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    
    const tempStr = client.temperature ? `Temperatura: ${client.temperature}` : "";
    const actionStr = client.nextAction ? `Próxima Ação: ${client.nextAction}` : "";
    
    let dateStr = "";
    if (client.nextFollowUpDate) {
      const d = new Date(client.nextFollowUpDate + "T12:00:00");
      if (!isNaN(d.getTime())) {
        dateStr = `Data: ${d.toLocaleDateString("pt-BR")}`;
      }
    }

    const combinedStr = [tempStr, actionStr, dateStr].filter(Boolean).join("  |  ");
    
    // Draw string with truncate if too long
    const availableWidth = contentWidth - 36;
    const truncatedCombinedStr = doc.getTextWidth(combinedStr) > availableWidth 
      ? combinedStr.substring(0, Math.floor(availableWidth / 1.8)) + "..."
      : combinedStr;
    
    doc.text(truncatedCombinedStr, col1X + 32, y + 6.5);
    y += 14;
  }

  // Observations wrapped
  if (client.observations && client.observations.trim() !== "") {
    checkPageLimit(25);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Observações e Preferências:", margin, y);
    y += 4;
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    
    const splitObservations = doc.splitTextToSize(client.observations, contentWidth - 4);
    splitObservations.forEach((line: string) => {
      checkPageLimit(6);
      doc.text(line, margin + 2, y);
      y += 5;
    });
    y += 4;
  }

  // Filter associated proposals and visits
  const clientId = client.id || client._id || "";
  const clientProposals = allProposals.filter(
    (p) => p.clientId === clientId && clientId !== ""
  );
  const clientVisits = allVisits.filter(
    (v) => v.clientId === clientId && clientId !== ""
  );

  // --- PROPOSALS (PROPOSTAS) SECTION ---
  drawSectionTitle("Propostas Registradas");
  if (clientProposals.length === 0) {
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Nenhuma proposta comercial ativa ou encerrada para este cliente.", margin + 2, y);
    y += 8;
  } else {
    clientProposals.forEach((prop, index) => {
      checkPageLimit(35);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 22, "D");

      // Draw left color bar depending on status
      let statusColor = [148, 163, 184]; // grey
      if (prop.status === "Aceita") statusColor = [16, 185, 129]; // emerald
      else if (prop.status === "Recusada") statusColor = [239, 68, 68]; // red
      else if (prop.status === "Pendente" || prop.status === "Em Análise") statusColor = [245, 158, 11]; // amber

      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.rect(margin, y, 1.5, 22, "F");

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Proposta #${index + 1}: Imóvel "${prop.propertyTitle || "Imóvel"}"`, margin + 4, y + 6);

      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Valor Proposto:", margin + 4, y + 12);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(formatCurrency(prop.proposedValue || 0), margin + 28, y + 12);

      doc.setFont("Helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      doc.text("Data:", margin + 65, y + 12);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(prop.date ? new Date(prop.date).toLocaleDateString("pt-BR") : "Não informada", margin + 75, y + 12);

      doc.setFont("Helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      doc.text("Status:", margin + 115, y + 12);
      doc.setFont("Helvetica", "normal");
      // status text color
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.text(prop.status, margin + 128, y + 12);

      if (prop.observations) {
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("Obs:", margin + 4, y + 18);
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        const wrappedObs = prop.observations.length > 85 ? prop.observations.substring(0, 85) + "..." : prop.observations;
        doc.text(wrappedObs, margin + 13, y + 18);
      }

      y += 26;
    });
  }

  // --- VISITS (VISITAS) SECTION ---
  drawSectionTitle("Visitas e Vistorias Agendadas/Realizadas");
  if (clientVisits.length === 0) {
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Nenhuma visita ao imóvel ou vistoria foi registrada para este cliente.", margin + 2, y);
    y += 8;
  } else {
    clientVisits.forEach((visit, index) => {
      checkPageLimit(35);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 22, "D");

      // Draw left color bar
      let statusColor = [148, 163, 184]; // grey
      if (visit.status === "Realizada") statusColor = [16, 185, 129]; // emerald
      else if (visit.status === "Cancelada") statusColor = [239, 68, 68]; // red
      else if (visit.status === "Agendada") statusColor = [59, 130, 246]; // blue

      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.rect(margin, y, 1.5, 22, "F");

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Visita #${index + 1}: "${visit.propertyTitle || "Imóvel"}"`, margin + 4, y + 6);

      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Agendado para:", margin + 4, y + 12);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      const visitDate = visit.date ? new Date(visit.date).toLocaleDateString("pt-BR") : "";
      const visitTime = visit.time || "";
      doc.text(`${visitDate} às ${visitTime}`, margin + 28, y + 12);

      doc.setFont("Helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      doc.text("Status:", margin + 85, y + 12);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.text(visit.status, margin + 98, y + 12);

      const feedbackOrObs = visit.feedback || visit.observations || "";
      if (feedbackOrObs) {
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("Feedback:", margin + 4, y + 18);
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        const wrappedFeedback = feedbackOrObs.length > 85 ? feedbackOrObs.substring(0, 85) + "..." : feedbackOrObs;
        doc.text(wrappedFeedback, margin + 21, y + 18);
      }

      y += 26;
    });
  }

  // --- INTERACTION LOGS / HISTÓRICO SECTION ---
  drawSectionTitle("Histórico Cronológico de Atendimento");
  const historyItems = client.history && client.history.length > 0
    ? client.history
    : [
        {
          id: "creation-default",
          type: "creation",
          date: client.createdAt || new Date().toISOString(),
          description: "Lead criado no sistema",
          userName: client.leadSource ? `Origem: ${client.leadSource}` : undefined
        }
      ];

  const sortedItems = [...historyItems].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  sortedItems.forEach((item) => {
    checkPageLimit(16);
    
    // Draw bullet dot
    doc.setFillColor(15, 23, 42);
    doc.circle(margin + 2, y + 3, 1, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const dateFormatted = new Date(item.date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    
    let typeLabel = "Interação";
    if (item.type === "creation") typeLabel = "Criação";
    else if (item.type === "status_change") typeLabel = "Fase";
    else if (item.type === "pipeline_change") typeLabel = "Esteira";
    else if (item.type === "observation") typeLabel = "Anotação";
    else if (item.type === "whatsapp") typeLabel = "WhatsApp";

    doc.text(`[${typeLabel}]  ${dateFormatted}`, margin + 6, y + 3.5);

    if (item.userName) {
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`por: ${item.userName}`, margin + 120, y + 3.5);
    }

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    
    // Support multi-line wrapped descriptions
    const splitDesc = doc.splitTextToSize(item.description, contentWidth - 10);
    splitDesc.forEach((line: string) => {
      checkPageLimit(6);
      doc.text(line, margin + 6, y + 8.5);
      y += 4.5;
    });
    
    y += 6;
  });

  // --- FOOTER NOTE ---
  checkPageLimit(15);
  y += 5;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, margin + contentWidth, y);
  y += 4;
  doc.setFont("Helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Este documento é confidencial e propriedade exclusiva da imobiliária operadora do Metria CRM.",
    margin,
    y
  );
  doc.text(
    "Desenvolvido sob normas da LGPD - Todos os dados de clientes são de guarda e segurança da organização titular.",
    margin,
    y + 3.5
  );

  // Trigger download of the generated PDF
  const filename = `relatorio_crm_${client.name.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

/**
 * Generates and downloads a beautiful list of all clients in PDF format.
 */
export function exportClientsListToPDF(clients: Client[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageHeight = 285;
  const margin = 12;
  const contentWidth = 210 - margin * 2; // 186mm
  let y = 35;
  let pageNum = 1;

  const drawHeader = () => {
    // Header Bar
    doc.setFillColor(0, 77, 62); // Metria Primary Green
    doc.rect(0, 0, 210, 24, "F");

    // Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("METRIA CRM", margin, 11);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(207, 168, 92); // Gold accent
    doc.text("Lista de Leads e Clientes Cadastrados", margin, 17);

    // Metadata right-aligned
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    const dateStr = new Date().toLocaleString("pt-BR");
    doc.text(`Gerado em: ${dateStr}`, 210 - margin - 45, 11);
    doc.text(`Total: ${clients.length} contatos`, 210 - margin - 45, 17);

    // Table Header Background
    y = 32;
    doc.setFillColor(240, 244, 241);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setDrawColor(0, 77, 62);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    doc.line(margin, y + 8, margin + contentWidth, y + 8);

    // Columns: Name (45), Profile (25), Contact (60), Details/Budget (56)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 77, 62);
    doc.text("Nome / Documento", margin + 3, y + 5.5);
    doc.text("Perfil / Fase", margin + 48, y + 5.5);
    doc.text("Contatos (E-mail e Cel)", margin + 78, y + 5.5);
    doc.text("Interesse & Orçamento", margin + 138, y + 5.5);
    
    y += 8;
  };

  const drawFooter = () => {
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${pageNum}`, 210 - margin - 15, 287);
    doc.text("Metria CRM - Gestão Inteligente de Imóveis e Leads", margin, 287);
  };

  drawHeader();
  drawFooter();

  if (clients.length === 0) {
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Nenhum cliente cadastrado para exibir.", margin + 4, y + 10);
  } else {
    clients.forEach((c, idx) => {
      const rowHeight = 11;
      if (y + rowHeight > pageHeight - 15) {
        doc.addPage();
        pageNum++;
        drawHeader();
        drawFooter();
      }

      // Zebra striping
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 248);
        doc.rect(margin, y, contentWidth, rowHeight, "F");
      }

      // Draw client info
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(40, 40, 40);
      
      const nameStr = c.name.length > 25 ? c.name.substring(0, 23) + "..." : c.name;
      doc.text(nameStr, margin + 3, y + 4.5);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      const docStr = c.document ? `${c.document} (${c.clientType || "PF"})` : "Sem documento";
      doc.text(docStr, margin + 3, y + 8.5);

      // Profile / Phase
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 77, 62);
      doc.text(c.profileType || "Lead", margin + 48, y + 4.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(110, 110, 110);
      doc.text(c.pipelineStatus || "Novo lead", margin + 48, y + 8.5);

      // Contact (Phone/Email)
      doc.setFont("Helvetica", "semibold");
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      doc.text(c.phone || "Sem telefone", margin + 78, y + 4.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      const emailStr = c.email && c.email.length > 32 ? c.email.substring(0, 29) + "..." : (c.email || "Sem e-mail");
      doc.text(emailStr, margin + 78, y + 8.5);

      // Interest & Budget
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 77, 62);
      const intStr = `${c.interest || "Compra"} • ${c.desiredPropertyType || "Qualquer"}`;
      const shortIntStr = intStr.length > 30 ? intStr.substring(0, 28) + "..." : intStr;
      doc.text(shortIntStr, margin + 138, y + 4.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(207, 168, 92); // Gold color for budget
      const budgetStr = c.budgetRange || (c.minBudget || c.maxBudget ? `${c.minBudget.toLocaleString("pt-BR")} - ${c.maxBudget.toLocaleString("pt-BR")}` : "N/A");
      doc.text(`Verba: R$ ${budgetStr}`, margin + 138, y + 8.5);

      // Thin divider line
      doc.setDrawColor(230, 235, 230);
      doc.setLineWidth(0.1);
      doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

      y += rowHeight;
    });
  }

  // Trigger download
  const filename = `lista_clientes_metria_crm_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

/**
 * Generates and downloads a beautiful list of all properties in PDF format.
 */
export function exportPropertiesListToPDF(properties: Property[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageHeight = 285;
  const margin = 10;
  const contentWidth = 210 - margin * 2; // 190mm
  let y = 35;
  let pageNum = 1;

  const drawHeader = () => {
    // Header Bar
    doc.setFillColor(0, 77, 62); // Metria Primary Green
    doc.rect(0, 0, 210, 24, "F");

    // Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("METRIA CRM", margin, 11);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(207, 168, 92); // Gold accent
    doc.text("Lista de Imóveis em Carteira", margin, 17);

    // Metadata right-aligned
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    const dateStr = new Date().toLocaleString("pt-BR");
    doc.text(`Gerado em: ${dateStr}`, 210 - margin - 45, 11);
    doc.text(`Total: ${properties.length} imóveis`, 210 - margin - 45, 17);

    // Table Header Background
    y = 32;
    doc.setFillColor(240, 244, 241);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setDrawColor(0, 77, 62);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    doc.line(margin, y + 8, margin + contentWidth, y + 8);

    // Columns: Title/Code (60), Type/Modality (30), Neighborhood/City (40), Config (25), Price/Condo (35)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 77, 62);
    doc.text("Cód / Título do Imóvel", margin + 3, y + 5.5);
    doc.text("Tipo / Finalidade", margin + 63, y + 5.5);
    doc.text("Bairro / Cidade", margin + 95, y + 5.5);
    doc.text("Características", margin + 137, y + 5.5);
    doc.text("Preço (R$)", margin + 164, y + 5.5);
    
    y += 8;
  };

  const drawFooter = () => {
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${pageNum}`, 210 - margin - 15, 287);
    doc.text("Metria CRM - Gestão Inteligente de Imóveis e Leads", margin, 287);
  };

  drawHeader();
  drawFooter();

  if (properties.length === 0) {
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Nenhum imóvel em carteira para exibir.", margin + 4, y + 10);
  } else {
    properties.forEach((p, idx) => {
      const rowHeight = 11;
      if (y + rowHeight > pageHeight - 15) {
        doc.addPage();
        pageNum++;
        drawHeader();
        drawFooter();
      }

      // Zebra striping
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 248);
        doc.rect(margin, y, contentWidth, rowHeight, "F");
      }

      // Title & Code
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      const codeStr = p.code || `IM-${Math.floor(1000 + Math.random() * 9000)}`;
      doc.text(codeStr, margin + 3, y + 4.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      const titleStr = p.title.length > 32 ? p.title.substring(0, 30) + "..." : p.title;
      doc.text(titleStr, margin + 3, y + 8.5);

      // Type & Modality
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 77, 62);
      doc.text(p.type || "Apartamento", margin + 63, y + 4.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(110, 110, 110);
      doc.text(p.modality || "Venda", margin + 63, y + 8.5);

      // Location
      doc.setFont("Helvetica", "semibold");
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      const neighStr = p.neighborhood.length > 18 ? p.neighborhood.substring(0, 16) + "..." : p.neighborhood;
      doc.text(neighStr, margin + 95, y + 4.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      const cityStr = p.city.length > 22 ? p.city.substring(0, 20) + "..." : p.city;
      doc.text(cityStr, margin + 95, y + 8.5);

      // Characteristics: Beds, area
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(70, 70, 70);
      const bedStr = `${p.bedrooms || 0}Q | ${p.suites || 0}S | ${p.parkingSpots || 0}V`;
      doc.text(bedStr, margin + 137, y + 4.5);
      doc.text(`${p.area || 0} m² total`, margin + 137, y + 8.5);

      // Price & Condo
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(0, 77, 62);
      const priceStr = p.price ? p.price.toLocaleString("pt-BR") : "0";
      doc.text(`R$ ${priceStr}`, margin + 164, y + 4.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      const condoVal = p.condo ? `Cond: R$ ${p.condo}` : "Sem cond.";
      doc.text(condoVal, margin + 164, y + 8.5);

      // Thin divider line
      doc.setDrawColor(230, 235, 230);
      doc.setLineWidth(0.1);
      doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

      y += rowHeight;
    });
  }

  // Trigger download
  const filename = `lista_imoveis_metria_crm_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
