import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  ArrowLeft, 
  ArrowRight, 
  Link as LinkIcon, 
  Unlink, 
  Plus, 
  Home, 
  DollarSign, 
  Search, 
  X, 
  Check, 
  SlidersHorizontal,
  FolderSync,
  ChevronRight,
  TrendingUp,
  UserCheck,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Calendar,
  Clock,
  Edit2,
  MessageSquare,
  Send,
  Settings2
} from "lucide-react";
import { Client, Property, Task, Proposal, Visit } from "../types";
import { getClientAlerts, getAlertBadgeStyles } from "../utils/alerts";

// The 12 real estate pipeline stages
const PIPELINE_STAGES = [
  "Novo lead",
  "Primeiro contato",
  "Em atendimento",
  "Imóvel enviado",
  "Visita agendada",
  "Visita realizada",
  "Proposta enviada",
  "Em negociação",
  "Documentação",
  "Contrato",
  "Fechado",
  "Perdido"
];

// Normalize old pipeline status to new ones so no data is lost
const normalizeStage = (stage?: string, customStages?: string[]): string => {
  const stagesList = customStages && customStages.length > 0 ? customStages : PIPELINE_STAGES;
  if (!stage) return stagesList[0] || "Novo lead";
  const s = stage.trim();
  switch (s) {
    case "Em Atendimento":
      return stagesList.includes("Em atendimento") ? "Em atendimento" : stagesList[0];
    case "Em Visita":
      return stagesList.includes("Visita agendada") ? "Visita agendada" : stagesList[0];
    case "Em Proposta":
      return stagesList.includes("Proposta enviada") ? "Proposta enviada" : stagesList[0];
    case "Fase de Contrato":
      return stagesList.includes("Contrato") ? "Contrato" : stagesList[0];
    case "Contrato Assinado":
      return stagesList.includes("Fechado") ? "Fechado" : stagesList[0];
    case "Fase de Documentação":
      return stagesList.includes("Documentação") ? "Documentação" : stagesList[0];
    case "Finalização do Processo":
      return stagesList.includes("Fechado") ? "Fechado" : stagesList[0];
    default:
      // If it is already a valid stage, return it
      if (stagesList.includes(s)) return s;
      return stagesList[0] || "Novo lead";
  }
};

// Helper to get visual theme colors and icons for each stage
const getStageDetails = (stage: string) => {
  switch (stage) {
    case "Novo lead":
      return { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400", label: "Novo Lead", color: "blue" };
    case "Primeiro contato":
      return { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-600 dark:text-sky-400", label: "Contatado", color: "sky" };
    case "Em atendimento":
      return { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-600 dark:text-indigo-400", label: "Atendimento", color: "indigo" };
    case "Imóvel enviado":
      return { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-600 dark:text-pink-400", label: "Imóvel Enviado", color: "pink" };
    case "Visita agendada":
      return { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "Visita Agendada", color: "amber" };
    case "Visita realizada":
      return { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-600 dark:text-orange-400", label: "Visita Realizada", color: "orange" };
    case "Proposta enviada":
      return { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-600 dark:text-violet-400", label: "Proposta Enviada", color: "violet" };
    case "Em negociação":
      return { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-600 dark:text-purple-400", label: "Em Negociação", color: "purple" };
    case "Documentação":
      return { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-600 dark:text-teal-400", label: "Documentação", color: "teal" };
    case "Contrato":
      return { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-600 dark:text-cyan-400", label: "Contrato", color: "cyan" };
    case "Fechado":
      return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", label: "Fechado 🎉", color: "emerald" };
    case "Perdido":
      return { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-600 dark:text-rose-400", label: "Perdido ❌", color: "rose" };
    default:
      return { bg: "bg-gray-500/10", border: "border-gray-500/30", text: "text-gray-600", label: "Outro", color: "gray" };
  }
};

// Common reasons for a lost deal
const COMMON_LOSS_REASONS = [
  "Comprou com outro corretor",
  "Desistiu de comprar/alugar",
  "Sem orçamento suficiente",
  "Sem retorno / Lead sumiu",
  "Imóvel desejado indisponível",
  "Preço ou juros altos demais"
];

interface PipelineViewProps {
  clients: Client[];
  properties: Property[];
  tasks?: Task[];
  proposals?: Proposal[];
  visits?: Visit[];
  onUpdateClient: (client: Client) => Promise<void>;
  onSelectClient: (client: Client) => void;
  onAddClient: (client: Omit<Client, "id">) => Promise<void>;
  currentUser?: any;
}

export default function PipelineView({ 
  clients, 
  properties, 
  tasks = [], 
  proposals = [], 
  visits = [], 
  onUpdateClient, 
  onSelectClient,
  onAddClient,
  currentUser
}: PipelineViewProps) {
  const stages = currentUser?.pipelineStages && currentUser.pipelineStages.length > 0
    ? currentUser.pipelineStages
    : PIPELINE_STAGES;

  const DEFAULT_TEMPLATES = {
    primeiroContato: "Olá, {{nome}}! Tudo bem? Aqui é {{corretor}}. Vi seu interesse em imóveis e queria entender melhor o que você procura para te enviar as melhores opções.",
    followUp: "Olá, {{nome}}! Passando para saber se você conseguiu avaliar as opções que te enviei. Posso te ajudar com alguma dúvida?",
    confirmacaoVisita: "Olá, {{nome}}! Confirmando nossa visita ao imóvel {{imovel}} no dia {{data}} às {{hora}}. Qualquer coisa, estou à disposição.",
    enviarImovel: "Olá, {{nome}}! O que você achou do imóvel que visitamos? Posso te passar mais detalhes ou simular uma proposta.",
    retomarAtendimento: "Olá, {{nome}}! Conforme conversamos, posso te ajudar a formalizar uma proposta para o imóvel {{imovel}}. Quer que eu prepare os próximos passos?"
  };

  const [whatsappTemplates, setWhatsappTemplates] = useState(() => {
    const saved = localStorage.getItem("metria_crm_whatsapp_templates");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Erro ao ler modelos de WhatsApp:", e);
      }
    }
    return DEFAULT_TEMPLATES;
  });

  const [activeWhatsAppClient, setActiveWhatsAppClient] = useState<Client | null>(null);
  const [activeWhatsAppKey, setActiveWhatsAppKey] = useState<"primeiroContato" | "followUp" | "confirmacaoVisita" | "enviarImovel" | "retomarAtendimento" | null>(null);

  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingTemplates, setEditingTemplates] = useState(whatsappTemplates);

  const [whatsappMessageText, setWhatsappMessageText] = useState("");
  const [pName, setPName] = useState("");
  const [pCorretor, setPCorretor] = useState("");
  const [pImovel, setPImovel] = useState("");
  const [pData, setPData] = useState("");
  const [pHora, setPHora] = useState("");

  const compileMessage = (
    template: string,
    name: string,
    corretor: string,
    imovel: string,
    data: string,
    hora: string
  ) => {
    return template
      .replace(/\{\{nome\}\}/gi, name)
      .replace(/\{\{corretor\}\}/gi, corretor)
      .replace(/\{\{imobiliaria\}\}/gi, currentUser?.commercialName || "")
      .replace(/\{\{imovel\}\}/gi, imovel)
      .replace(/\{\{data\}\}/gi, data)
      .replace(/\{\{hora\}\}/gi, hora);
  };

  const getRawTemplate = (key: "primeiroContato" | "followUp" | "confirmacaoVisita" | "enviarImovel" | "retomarAtendimento") => {
    if (currentUser?.messageTemplates) {
      if (key === "primeiroContato" && currentUser.messageTemplates.primeiroContato) {
        return currentUser.messageTemplates.primeiroContato;
      }
      if (key === "followUp" && currentUser.messageTemplates.followUp) {
        return currentUser.messageTemplates.followUp;
      }
      if (key === "confirmacaoVisita" && currentUser.messageTemplates.confirmacaoVisita) {
        return currentUser.messageTemplates.confirmacaoVisita;
      }
      if (key === "enviarImovel" && currentUser.messageTemplates.posVisita) {
        return currentUser.messageTemplates.posVisita;
      }
      if (key === "retomarAtendimento" && currentUser.messageTemplates.proposta) {
        return currentUser.messageTemplates.proposta;
      }
    }
    return whatsappTemplates[key] || DEFAULT_TEMPLATES[key];
  };

  const handleOpenWhatsAppAction = (client: Client, key: "primeiroContato" | "followUp" | "confirmacaoVisita" | "enviarImovel" | "retomarAtendimento") => {
    setActiveWhatsAppClient(client);
    setActiveWhatsAppKey(key);

    const linkedProp = properties.find(
      (p) => p.id === client.linkedPropertyId || p._id === client.linkedPropertyId
    );

    const nameVal = client.name || "";
    const brokerVal = currentUser?.name || "seu corretor";
    const propertyVal = linkedProp?.title || "imóvel de interesse";
    let dateVal = new Date().toLocaleDateString("pt-BR");
    if (client.nextFollowUpDate && typeof client.nextFollowUpDate === "string") {
      const parts = client.nextFollowUpDate.split("-");
      if (parts.length === 3) {
        dateVal = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        const d = new Date(client.nextFollowUpDate);
        if (!isNaN(d.getTime())) {
          dateVal = d.toLocaleDateString("pt-BR");
        }
      }
    }
    const hourVal = "14:00";

    setPName(nameVal);
    setPCorretor(brokerVal);
    setPImovel(propertyVal);
    setPData(dateVal);
    setPHora(hourVal);

    const rawTemplate = getRawTemplate(key);
    const initialCompiled = compileMessage(rawTemplate, nameVal, brokerVal, propertyVal, dateVal, hourVal);
    setWhatsappMessageText(initialCompiled);
  };

  const handlePlaceholderChange = (field: string, val: string) => {
    if (!activeWhatsAppKey) return;
    
    let n = pName;
    let c = pCorretor;
    let i = pImovel;
    let d = pData;
    let h = pHora;

    if (field === "name") { setPName(val); n = val; }
    else if (field === "corretor") { setPCorretor(val); c = val; }
    else if (field === "imovel") { setPImovel(val); i = val; }
    else if (field === "data") { setPData(val); d = val; }
    else if (field === "hora") { setPHora(val); h = val; }

    const rawTemplate = getRawTemplate(activeWhatsAppKey);
    const recompiled = compileMessage(rawTemplate, n, c, i, d, h);
    setWhatsappMessageText(recompiled);
  };

  const handleSaveTemplates = () => {
    localStorage.setItem("metria_crm_whatsapp_templates", JSON.stringify(editingTemplates));
    setWhatsappTemplates(editingTemplates);
    setShowTemplateManager(false);
  };

  const handleSendWhatsApp = async () => {
    if (!activeWhatsAppClient || !activeWhatsAppKey) return;

    // Clean up telephone number
    let cleanPhone = activeWhatsAppClient.phone.replace(/\D/g, "");
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      if (!cleanPhone.startsWith("55")) {
        cleanPhone = "55" + cleanPhone;
      }
    }

    const encodedText = encodeURIComponent(whatsappMessageText);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");

    const now = new Date();
    const formattedDate = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const actionLabel = 
      activeWhatsAppKey === "primeiroContato" ? "Primeiro contato" :
      activeWhatsAppKey === "followUp" ? "Follow-up" :
      activeWhatsAppKey === "confirmacaoVisita" ? "Confirmação de visita" :
      activeWhatsAppKey === "enviarImovel" ? "Enviar imóvel" : "Retomar atendimento";

    const logEntry = `\n[${formattedDate}] WhatsApp: Mensagem de "${actionLabel}" iniciada.`;
    
    const newHistoryEntry = {
      id: Math.random().toString(36).substring(2, 11),
      type: "whatsapp",
      date: now.toISOString(),
      description: `Mensagem de "${actionLabel}" iniciada via WhatsApp`,
      userName: currentUser?.name || currentUser?.username || "Você"
    };

    const updatedClient = {
      ...activeWhatsAppClient,
      observations: (activeWhatsAppClient.observations || "") + logEntry,
      history: [...(activeWhatsAppClient.history || []), newHistoryEntry]
    };

    try {
      await onUpdateClient(updatedClient);
    } catch (err) {
      console.error("Erro ao registrar ação no histórico:", err);
    }

    setActiveWhatsAppClient(null);
    setActiveWhatsAppKey(null);
  };

  const [linkingClient, setLinkingClient] = useState<Client | null>(null);
  const [propertySearch, setPropertySearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Mobile selected stage
  const [mobileSelectedStage, setMobileSelectedStage] = useState("Novo lead");

  // Loss Reason trigger state
  const [lossReasonClient, setLossReasonClient] = useState<Client | null>(null);
  const [customLossReason, setCustomLossReason] = useState("");

  // Quick edit deal modal state
  const [quickEditClient, setQuickEditClient] = useState<Client | null>(null);
  const [editPotentialValue, setEditPotentialValue] = useState("");
  const [editCommissionPercent, setEditCommissionPercent] = useState("");
  const [editTemperature, setEditTemperature] = useState<"Frio" | "Morno" | "Quente">("Morno");
  const [editNextAction, setEditNextAction] = useState("");
  const [editNextFollowUpDate, setEditNextFollowUpDate] = useState("");

  // Quick Client Add states
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [newProfileType, setNewProfileType] = useState("Lead");
  const [newObjective, setNewObjective] = useState("Compra");
  const [newPropType, setNewPropType] = useState("Apartamento");
  const [newStage, setNewStage] = useState("Novo lead");
  const [isSubmittingQuickAdd, setIsSubmittingQuickAdd] = useState(false);

  // Safe client wrapper that normalizes the stages dynamically
  const normalizedClients = clients.map(c => ({
    ...c,
    pipelineStatus: normalizeStage(c.pipelineStatus, stages)
  }));

  // Open loss reason dialogue
  const triggerLossReasonModal = (client: Client) => {
    setLossReasonClient(client);
    setCustomLossReason("");
  };

  // Submit loss reason
  const handleSaveLossReason = async (reason: string) => {
    if (!lossReasonClient) return;
    const updated: Client = {
      ...lossReasonClient,
      pipelineStatus: "Perdido",
      status: "Perdido",
      lossReason: reason,
      updatedAt: new Date().toISOString()
    };
    await onUpdateClient(updated);
    setLossReasonClient(null);
  };

  // Handle stage movement
  const moveStage = async (client: Client, direction: "prev" | "next") => {
    const currentStage = normalizeStage(client.pipelineStatus, stages);
    const currentIndex = stages.indexOf(currentStage);
    
    let newIndex = currentIndex;
    if (direction === "prev" && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === "next" && currentIndex < stages.length - 1) {
      newIndex = currentIndex + 1;
    }

    if (newIndex !== currentIndex) {
      const nextStageName = stages[newIndex];
      
      // If moving to Perdido, show prompt
      if (nextStageName === "Perdido") {
        triggerLossReasonModal(client);
        return;
      }

      const updated: Client = {
        ...client,
        pipelineStatus: nextStageName,
        // Clear loss reason if moving away from Perdido
        lossReason: undefined,
        status: nextStageName === "Fechado" ? "Ganho" : client.status,
        updatedAt: new Date().toISOString()
      };
      await onUpdateClient(updated);
    }
  };

  // Set precise stage dropdown
  const setSpecificStage = async (client: Client, stage: string) => {
    if (stage === "Perdido") {
      triggerLossReasonModal(client);
      return;
    }

    const updated: Client = {
      ...client,
      pipelineStatus: stage,
      lossReason: undefined,
      status: stage === "Fechado" ? "Ganho" : client.status,
      updatedAt: new Date().toISOString()
    };
    await onUpdateClient(updated);
  };

  // Open deal quick-edit modal
  const openQuickEdit = (client: Client) => {
    const linkedProp = properties.find(p => p.id === client.linkedPropertyId || p._id === client.linkedPropertyId);
    const initialPotential = client.potentialValue || (linkedProp ? linkedProp.price : client.maxBudget) || 0;
    
    setQuickEditClient(client);
    setEditPotentialValue(initialPotential ? String(initialPotential) : "");
    setEditCommissionPercent(client.commissionPercent !== undefined ? String(client.commissionPercent) : "5");
    setEditTemperature(client.temperature || "Morno");
    setEditNextAction(client.nextAction || "");
    setEditNextFollowUpDate(client.nextFollowUpDate || "");
  };

  // Save deal quick-edit
  const saveQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditClient) return;

    const potVal = Number(editPotentialValue) || 0;
    const commPct = Number(editCommissionPercent) || 0;
    const calculatedForecast = Math.floor(potVal * (commPct / 100));

    const updated: Client = {
      ...quickEditClient,
      potentialValue: potVal,
      commissionPercent: commPct,
      commissionForecast: calculatedForecast,
      temperature: editTemperature,
      nextAction: editNextAction,
      nextFollowUpDate: editNextFollowUpDate || undefined,
      updatedAt: new Date().toISOString()
    };

    await onUpdateClient(updated);
    setQuickEditClient(null);
  };

  // Link property
  const handleLinkProperty = async (client: Client, propertyId: string | undefined) => {
    // Look up property to pre-fill potential value and commission if appropriate
    const prop = properties.find(p => p.id === propertyId || p._id === propertyId);
    let updatedPotential = client.potentialValue;
    let updatedCommission = client.commissionForecast;
    
    if (prop) {
      updatedPotential = prop.price;
      const commPct = client.commissionPercent ?? 5;
      updatedCommission = Math.floor(prop.price * (commPct / 100));
    }

    const updated: Client = {
      ...client,
      linkedPropertyId: propertyId,
      potentialValue: updatedPotential,
      commissionForecast: updatedCommission,
      updatedAt: new Date().toISOString()
    };
    await onUpdateClient(updated);
    setLinkingClient(null);
    setPropertySearch("");
  };

  // Quick create client in pipeline
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) {
      alert("Nome e telefone são necessários!");
      return;
    }

    setIsSubmittingQuickAdd(true);
    try {
      const budgetVal = Number(newBudget) || 0;
      const defaultCommPercent = 5;
      const clientPayload: Omit<Client, "id"> = {
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || "contato@exemplo.com",
        document: "",
        profileType: newProfileType,
        objective: newObjective,
        propertyType: newPropType,
        minBudget: Math.floor(budgetVal * 0.8),
        maxBudget: budgetVal || 1000000,
        potentialValue: budgetVal || 1000000,
        commissionPercent: defaultCommPercent,
        commissionForecast: Math.floor((budgetVal || 1000000) * (defaultCommPercent / 100)),
        observations: "Criado rapidamente pelo funil de vendas.",
        status: newStage === "Fechado" ? "Ganho" : newStage === "Perdido" ? "Perdido" : "Em Atendimento",
        pipelineStatus: newStage,
        temperature: "Morno",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await onAddClient(clientPayload);
      
      // Reset
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewBudget("");
      setShowQuickAdd(false);
    } catch (err) {
      console.error(err);
      alert("Falha ao criar lead na esteira.");
    } finally {
      setIsSubmittingQuickAdd(false);
    }
  };

  // Group clients by stage
  const getClientsInStage = (stage: string) => {
    return normalizedClients.filter(c => c.pipelineStatus === stage);
  };

  // Filter properties in linking popup
  const filteredProperties = properties.filter(p => {
    const q = propertySearch.toLowerCase();
    const shortCode = (p.id || p._id || "").substring(0, 5).toUpperCase();
    return (
      (p.title || "").toLowerCase().includes(q) ||
      (p.neighborhood || "").toLowerCase().includes(q) ||
      (p.city || "").toLowerCase().includes(q) ||
      shortCode.includes(q)
    );
  });

  // Calculate statistics across all active pipelines (excluding Lost "Perdido" column to focus on active revenue)
  const activeClients = normalizedClients.filter(c => c.pipelineStatus !== "Perdido");
  const totalLeads = activeClients.length;
  
  // Potential and commission math
  const totalPotentialVolume = activeClients.reduce((sum, c) => {
    const linkedProp = properties.find(p => p.id === c.linkedPropertyId || p._id === c.linkedPropertyId);
    const val = c.potentialValue || (linkedProp ? linkedProp.price : c.maxBudget) || 0;
    return sum + val;
  }, 0);

  const totalCommissionForecast = activeClients.reduce((sum, c) => {
    if (c.commissionForecast !== undefined) return sum + c.commissionForecast;
    const linkedProp = properties.find(p => p.id === c.linkedPropertyId || p._id === c.linkedPropertyId);
    const val = c.potentialValue || (linkedProp ? linkedProp.price : c.maxBudget) || 0;
    const pct = c.commissionPercent ?? 5;
    return sum + (val * pct / 100);
  }, 0);

  return (
    <div id="metria-pipeline-root" className="space-y-6 text-left animate-in fade-in duration-200 pb-16">
      
      {/* Header Area */}
      <div id="pipeline-header-container" className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm">
        <div>
          <h2 id="pipeline-title" className="font-display text-2xl font-black text-primary tracking-tight flex items-center gap-2">
            <FolderSync className="w-6 h-6 text-secondary animate-spin-slow" />
            Esteira Real de Vendas
          </h2>
          <p id="pipeline-description" className="text-xs text-on-surface-variant font-medium mt-1">
            Pipeline completo de 12 etapas para acompanhamento da jornada de vendas. Saiba exatamente onde seu dinheiro está parado e controle os follow-ups.
          </p>
        </div>

        <div id="pipeline-stats-badges" className="flex flex-wrap items-center gap-2">
          {/* Active Deals Counter */}
          <div id="stat-active-deals" className="px-3 py-1.5 bg-surface-container-high rounded-xl flex items-center gap-2 border border-outline-variant/20">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <span className="text-[9px] text-on-surface-variant font-bold block uppercase tracking-wider">Negócios Ativos</span>
              <span className="text-xs font-black text-on-surface">{totalLeads}</span>
            </div>
          </div>

          {/* Revenue Potential */}
          <div id="stat-potential-revenue" className="px-3 py-1.5 bg-secondary-container/20 rounded-xl flex items-center gap-2 border border-secondary/20">
            <TrendingUp className="w-4 h-4 text-secondary" />
            <div>
              <span className="text-[9px] text-on-surface-variant font-bold block uppercase tracking-wider">Valor Potencial Ativo</span>
              <span className="text-xs font-black text-primary">R$ {(totalPotentialVolume).toLocaleString("pt-BR")}</span>
            </div>
          </div>

          {/* Forecasted Commission */}
          <div id="stat-commission-forecast" className="px-3 py-1.5 bg-emerald-500/10 rounded-xl flex items-center gap-2 border border-emerald-500/20">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <span className="text-[9px] text-on-surface-variant font-bold block uppercase tracking-wider">Previsão de Comissão</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">R$ {Math.floor(totalCommissionForecast).toLocaleString("pt-BR")}</span>
            </div>
          </div>

          <button
            onClick={() => {
              setEditingTemplates({ ...whatsappTemplates });
              setShowTemplateManager(true);
            }}
            className="px-4 py-2.5 bg-emerald-600/10 dark:bg-emerald-500/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer lg:ml-2"
            title="Gerenciar Modelos do WhatsApp"
          >
            <Settings2 className="w-4 h-4" />
            Modelos WhatsApp
          </button>

          <button
            id="pipeline-btn-add-lead"
            onClick={() => setShowQuickAdd(true)}
            className="px-4 py-2.5 bg-primary text-on-primary font-bold text-xs rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-1.5 shadow-sm cursor-pointer lg:ml-2"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Novo Lead
          </button>
        </div>
      </div>

      {/* MOBILE OPTIMIZED LAYOUT (Tab Switcher + Selected Stage Cards List) */}
      <div id="pipeline-mobile-view" className="block md:hidden space-y-4">
        {/* Scrollable Stage Tab Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
          {stages.map((stage, idx) => {
            const stageClients = getClientsInStage(stage);
            const isSelected = mobileSelectedStage === stage;
            const details = getStageDetails(stage);
            
            return (
              <button
                key={`mobile-stage-tab-${stage}`}
                onClick={() => setMobileSelectedStage(stage)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                  isSelected 
                    ? `bg-primary text-on-primary border-primary shadow-sm` 
                    : `bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high`
                }`}
              >
                <span>{idx + 1}. {stage}</span>
                <span className={`px-1.5 py-0.5 text-[9px] rounded-full font-bold ${
                  isSelected ? "bg-on-primary/20 text-on-primary" : "bg-surface-container-highest text-on-surface"
                }`}>
                  {stageClients.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Mobile Header Card */}
        {(() => {
          const stageClients = getClientsInStage(mobileSelectedStage);
          const details = getStageDetails(mobileSelectedStage);
          const totalStageValue = stageClients.reduce((sum, c) => {
            const linkedProp = properties.find(p => p.id === c.linkedPropertyId || p._id === c.linkedPropertyId);
            const val = c.potentialValue || (linkedProp ? linkedProp.price : c.maxBudget) || 0;
            return sum + val;
          }, 0);
          const totalStageCommission = stageClients.reduce((sum, c) => {
            if (c.commissionForecast !== undefined) return sum + c.commissionForecast;
            const linkedProp = properties.find(p => p.id === c.linkedPropertyId || p._id === c.linkedPropertyId);
            const val = c.potentialValue || (linkedProp ? linkedProp.price : c.maxBudget) || 0;
            const pct = c.commissionPercent ?? 5;
            return sum + (val * pct / 100);
          }, 0);

          return (
            <div className={`p-4 rounded-xl border ${details.bg} ${details.border} flex justify-between items-center`}>
              <div>
                <h3 className="text-xs font-black uppercase text-on-surface-variant tracking-wider">Etapa Selecionada</h3>
                <p className={`text-base font-black ${details.text} mt-0.5`}>{mobileSelectedStage}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-on-surface">Vol: R$ {totalStageValue.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">Comissão: R$ {Math.floor(totalStageCommission).toLocaleString("pt-BR")}</p>
              </div>
            </div>
          );
        })()}

        {/* List of Cards for Mobile Stage */}
        <div className="space-y-3">
          {(() => {
            const stageClients = getClientsInStage(mobileSelectedStage);
            if (stageClients.length === 0) {
              return (
                <div className="py-12 text-center border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-low/20">
                  <p className="text-xs font-semibold text-on-surface-variant/70">Nenhum cliente nesta etapa atualmente.</p>
                </div>
              );
            }

            return stageClients.map((client, cIdx) => {
              const initials = (client.name || "").split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";
              const linkedProp = properties.find(p => p.id === client.linkedPropertyId || p._id === client.linkedPropertyId);
              
              // Financial estimations
              const finalPotentialVal = client.potentialValue || (linkedProp ? linkedProp.price : client.maxBudget) || 0;
              const finalCommissionPercent = client.commissionPercent ?? 5;
              const finalCommissionVal = client.commissionForecast || (finalPotentialVal * finalCommissionPercent / 100);

              // Calculate stagnant alerts
              const clientAlerts = getClientAlerts(client, tasks, proposals, visits);
              const hasCritical = clientAlerts.some(a => a.level === "Crítico");
              const hasUrgent = clientAlerts.some(a => a.level === "Urgente");
              const hasWarning = clientAlerts.some(a => a.level === "Atenção");

              // Stagnation Math (Threshold = 7 days)
              const lastUpdatedDateStr = client.updatedAt || client.createdAt || new Date().toISOString();
              const daysStalled = Math.floor((new Date().getTime() - new Date(lastUpdatedDateStr).getTime()) / (1000 * 60 * 60 * 24));
              const isStalled = daysStalled >= 7 && mobileSelectedStage !== "Fechado" && mobileSelectedStage !== "Perdido";

              // Border & background based on alerts
              let cardAlertClasses = "border-outline-variant/20";
              if (hasCritical) {
                cardAlertClasses = "border-red-500 bg-red-50/10 dark:bg-red-950/10";
              } else if (hasUrgent) {
                cardAlertClasses = "border-orange-400 bg-orange-50/10 dark:bg-orange-950/10";
              } else if (hasWarning) {
                cardAlertClasses = "border-amber-400 bg-amber-50/10 dark:bg-amber-950/10";
              } else if (isStalled) {
                cardAlertClasses = "border-amber-500 bg-amber-500/5 animate-pulse-slow";
              }

              return (
                <div 
                  key={`mobile-client-card-${client.id || client._id}-${cIdx}`}
                  className={`bg-surface p-4 rounded-xl border transition-all flex flex-col gap-3 relative shadow-sm ${cardAlertClasses}`}
                >
                  {/* Stale Warning Bar */}
                  {isStalled && clientAlerts.length === 0 && (
                    <div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1.5 border border-amber-500/20">
                      <Clock className="w-3.5 h-3.5 animate-spin-slow" />
                      Atenção: Negociação estagnada nesta etapa há {daysStalled} dias!
                    </div>
                  )}

                  {/* Render all active commercial alerts for mobile */}
                  {clientAlerts.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {clientAlerts.map(alert => {
                        const badgeStyles = getAlertBadgeStyles(alert.level);
                        return (
                          <div 
                            key={alert.id}
                            className={`text-[9px] font-bold uppercase px-2 py-1 rounded flex items-center gap-1 border border-current ${badgeStyles.bg}`}
                            title={alert.description}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-pulse"></span>
                            <span>{alert.title} ({alert.level})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Header: Name and Temp */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-display text-sm font-bold shadow-inner">
                        {initials}
                      </div>
                      <div className="text-left">
                        <h4 
                          onClick={() => onSelectClient(client)}
                          className="text-sm font-bold text-on-surface hover:text-primary hover:underline cursor-pointer transition-colors"
                        >
                          {client.name}
                        </h4>
                        <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">
                          {client.phone} • {client.profileType}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Temperature Badge */}
                      <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-full ${
                        client.temperature === "Quente" ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" :
                        client.temperature === "Frio" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                        "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}>
                        🔥 {client.temperature || "Morno"}
                      </span>

                      {/* Quick Edit Pencil */}
                      <button
                        onClick={() => openQuickEdit(client)}
                        className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant"
                        title="Editar Negociação"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                   {/* Financial metrics */}
                   <div className="grid grid-cols-3 gap-2 bg-surface-container-low/40 p-2.5 rounded-lg border border-outline-variant/10 text-left">
                     <div>
                       <span className="text-[9px] text-on-surface-variant font-bold block uppercase tracking-wider">Valor</span>
                       <span className="text-xs font-black text-primary">R$ {finalPotentialVal.toLocaleString("pt-BR")}</span>
                     </div>
                     <div>
                       <span className="text-[9px] text-on-surface-variant font-bold block uppercase tracking-wider">Comissão</span>
                       <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">R$ {Math.floor(finalCommissionVal).toLocaleString("pt-BR")} ({finalCommissionPercent}%)</span>
                     </div>
                     <div>
                       <span className="text-[9px] text-on-surface-variant font-bold block uppercase tracking-wider">Probab.</span>
                       <span className={`text-[10px] font-black block ${
                         client.closingProbability === "Alta" ? "text-emerald-600 dark:text-emerald-400" :
                         client.closingProbability === "Baixa" ? "text-rose-600 dark:text-rose-400" :
                         "text-amber-600 dark:text-amber-400"
                       }`}>
                         {client.closingProbability || "Média"}
                       </span>
                     </div>
                   </div>

                  {/* Lost Reason Display */}
                  {mobileSelectedStage === "Perdido" && client.lossReason && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-medium">
                      <span className="font-bold block text-[10px] uppercase tracking-wider mb-0.5">Motivo de Perda:</span>
                      "{client.lossReason}"
                    </div>
                  )}

                  {/* Property Interest */}
                  <div className="border-t border-outline-variant/30 pt-2.5 space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        <Home className="w-3 h-3 text-secondary" />
                        Imóvel de Interesse
                      </span>
                    </div>

                    {linkedProp ? (
                      <div className="bg-surface-container/50 border border-outline-variant/30 rounded-lg p-2 flex flex-col gap-1">
                        <div className="flex justify-between items-start gap-1">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-on-surface truncate">
                              {linkedProp.title}
                            </p>
                            <p className="text-[9px] text-on-surface-variant/80 truncate mt-0.5">
                              COD: #{(linkedProp.id || linkedProp._id || "").substring(0, 5).toUpperCase()} • {linkedProp.neighborhood}
                            </p>
                          </div>
                          <button
                            onClick={() => handleLinkProperty(client, undefined)}
                            className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                            title="Desvincular Imóvel"
                          >
                            <Unlink className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-[10px] font-black text-primary mt-1">
                          R$ {(linkedProp.price ?? 0).toLocaleString("pt-BR")}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setLinkingClient(client)}
                        className="w-full py-1.5 bg-surface-container-high hover:bg-primary/5 hover:text-primary text-on-surface-variant border border-dashed border-outline-variant rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                      >
                        <LinkIcon className="w-3 h-3" />
                        Vincular Imóvel
                      </button>
                    )}
                  </div>

                  {/* Next Action */}
                  <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/10 text-xs">
                    <span className="text-[9px] text-on-surface-variant font-bold block uppercase tracking-wider mb-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-primary" /> Próxima Ação
                    </span>
                    <p className="text-on-surface font-semibold truncate">
                      {client.nextAction || "Nenhuma ação planejada"}
                    </p>
                    {client.nextFollowUpDate && (() => {
                      const d = new Date(client.nextFollowUpDate + "T12:00:00");
                      if (isNaN(d.getTime())) return null;
                      return (
                        <p className="text-[9px] text-on-surface-variant font-bold mt-1">
                          Agendado para: {d.toLocaleDateString("pt-BR")}
                        </p>
                      );
                    })()}
                  </div>

                  {/* WhatsApp Quick Actions */}
                  <div className="border-t border-outline-variant/30 pt-2.5 space-y-1.5">
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp CRM Quick Links
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsAppAction(client, "primeiroContato")}
                        className="py-1 px-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-lg font-bold text-[10px] flex items-center gap-1.5 cursor-pointer transition-all truncate text-left"
                        title="Chamar no WhatsApp"
                      >
                        💬 Chamar WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsAppAction(client, "followUp")}
                        className="py-1 px-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-lg font-bold text-[10px] flex items-center gap-1.5 cursor-pointer transition-all truncate text-left"
                        title="Enviar follow-up"
                      >
                        ✉️ Enviar follow-up
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsAppAction(client, "confirmacaoVisita")}
                        className="py-1 px-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-lg font-bold text-[10px] flex items-center gap-1.5 cursor-pointer transition-all truncate text-left"
                        title="Confirmar visita"
                      >
                        📅 Confirmar visita
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsAppAction(client, "enviarImovel")}
                        className="py-1 px-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-lg font-bold text-[10px] flex items-center gap-1.5 cursor-pointer transition-all truncate text-left"
                        title="Enviar imóvel"
                      >
                        🏡 Enviar imóvel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsAppAction(client, "retomarAtendimento")}
                        className="col-span-2 py-1 px-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-lg font-bold text-[10px] flex items-center justify-center gap-1.5 cursor-pointer transition-all truncate"
                        title="Retomar atendimento"
                      >
                        🔁 Retomar atendimento
                      </button>
                    </div>
                  </div>

                  {/* Stage Stepper Navigation for Mobile */}
                  <div className="flex items-center justify-between border-t border-outline-variant/30 pt-2.5 mt-1 gap-2">
                    <button
                      disabled={stages.indexOf(mobileSelectedStage) === 0}
                      onClick={() => moveStage(client, "prev")}
                      className="flex-1 py-1 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <ArrowLeft className="w-3 h-3" /> Voltar
                    </button>

                    <select
                      value={mobileSelectedStage}
                      onChange={(e) => setSpecificStage(client, e.target.value)}
                      className="text-[10px] font-bold bg-surface-container-high border border-outline-variant rounded-lg py-1 px-2 text-center text-on-surface outline-none"
                    >
                      {stages.map((s, idx) => (
                        <option key={`opt-mob-stage-${s}`} value={s}>
                          {idx + 1}. {s}
                        </option>
                      ))}
                    </select>

                    <button
                      disabled={stages.indexOf(mobileSelectedStage) === stages.length - 1}
                      onClick={() => moveStage(client, "next")}
                      className="flex-1 py-1 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-xs font-bold flex items-center justify-center gap-1"
                    >
                      Avançar <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* DESKTOP FULL HORIZONTAL BOARD LAYOUT */}
      <div id="pipeline-desktop-view" className="hidden md:block overflow-x-auto pb-4 -mx-4 px-4 scrollbar-thin">
        <div className="flex gap-4 min-w-[2800px]">
          {stages.map((stage, idx) => {
            const stageClients = getClientsInStage(stage);
            const details = getStageDetails(stage);
            
            // Total stage calculation
            const totalStageValue = stageClients.reduce((sum, c) => {
              const linkedProp = properties.find(p => p.id === c.linkedPropertyId || p._id === c.linkedPropertyId);
              const val = c.potentialValue || (linkedProp ? linkedProp.price : c.maxBudget) || 0;
              return sum + val;
            }, 0);

            const totalStageCommission = stageClients.reduce((sum, c) => {
              if (c.commissionForecast !== undefined) return sum + c.commissionForecast;
              const linkedProp = properties.find(p => p.id === c.linkedPropertyId || p._id === c.linkedPropertyId);
              const val = c.potentialValue || (linkedProp ? linkedProp.price : c.maxBudget) || 0;
              const pct = c.commissionPercent ?? 5;
              return sum + (val * pct / 100);
            }, 0);

            return (
              <div 
                key={`desktop-stage-col-${stage}`} 
                id={`stage-col-${stage.replace(/\s+/g, "-")}`}
                className="w-80 flex-shrink-0 flex flex-col bg-surface-container-low/60 rounded-2xl border border-outline-variant/40 overflow-hidden min-h-[550px]"
              >
                {/* Stage Header */}
                <header className={`px-4 py-3.5 border-b border-outline-variant/30 ${details.bg} flex flex-col gap-1.5`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-extrabold font-display truncate max-w-[210px] ${details.text}`}>
                      {idx + 1}. {stage}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-mono text-[10px] font-black">
                      {stageClients.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-[10px] text-on-surface-variant font-bold leading-tight">
                    <span>Vol: R$ {(totalStageValue).toLocaleString("pt-BR")}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">Comiss: R$ {Math.floor(totalStageCommission).toLocaleString("pt-BR")}</span>
                  </div>
                </header>

                {/* Cards List container */}
                <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[620px] min-h-[450px]">
                  <AnimatePresence mode="popLayout">
                    {stageClients.map((client, cIdx) => {
                      const initials = (client.name || "").split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";
                      const linkedProp = properties.find(p => p.id === client.linkedPropertyId || p._id === client.linkedPropertyId);
                      
                      // Financial parameters
                      const finalPotentialVal = client.potentialValue || (linkedProp ? linkedProp.price : client.maxBudget) || 0;
                      const finalCommissionPercent = client.commissionPercent ?? 5;
                      const finalCommissionVal = client.commissionForecast || (finalPotentialVal * finalCommissionPercent / 100);

                       // Calculate stagnant alerts
                      const clientAlerts = getClientAlerts(client, tasks, proposals, visits);
                      const hasCritical = clientAlerts.some(a => a.level === "Crítico");
                      const hasUrgent = clientAlerts.some(a => a.level === "Urgente");
                      const hasWarning = clientAlerts.some(a => a.level === "Atenção");

                      // Stale / Stagnant logic (7 days limit)
                      const lastUpdatedDateStr = client.updatedAt || client.createdAt || new Date().toISOString();
                      const daysStalled = Math.floor((new Date().getTime() - new Date(lastUpdatedDateStr).getTime()) / (1000 * 60 * 60 * 24));
                      const isStalled = daysStalled >= 7 && stage !== "Fechado" && stage !== "Perdido";

                      // Border & background based on alerts
                      let cardAlertClasses = "border-outline-variant/20 hover:border-primary/25";
                      if (hasCritical) {
                        cardAlertClasses = "border-red-500 bg-red-50/10 dark:bg-red-950/10 hover:border-red-600";
                      } else if (hasUrgent) {
                        cardAlertClasses = "border-orange-400 bg-orange-50/10 dark:bg-orange-950/10 hover:border-orange-500";
                      } else if (hasWarning) {
                        cardAlertClasses = "border-amber-400 bg-amber-50/10 dark:bg-amber-950/10 hover:border-amber-500";
                      } else if (isStalled) {
                        cardAlertClasses = "border-amber-500 bg-amber-500/5 hover:border-amber-500";
                      }

                      return (
                        <motion.div
                          key={`desktop-card-${client.id || client._id || cIdx}`}
                          layout
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: "spring", duration: 0.3 }}
                          className={`bg-surface p-3.5 rounded-xl border transition-all flex flex-col gap-3 relative group shadow-sm hover:shadow-md ${cardAlertClasses}`}
                        >
                          {/* Stale warning banner inside card */}
                          {isStalled && clientAlerts.length === 0 && (
                            <div className="bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              Parado nesta etapa há {daysStalled} dias
                            </div>
                          )}

                          {/* Render all active commercial alerts */}
                          {clientAlerts.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {clientAlerts.map(alert => {
                                const badgeStyles = getAlertBadgeStyles(alert.level);
                                return (
                                  <div 
                                    key={alert.id}
                                    className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded flex items-center gap-1 border border-current ${badgeStyles.bg}`}
                                    title={alert.description}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-pulse"></span>
                                    <span>{alert.title}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-display text-[10px] font-bold shadow-inner flex-shrink-0 mt-0.5">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <h4 
                                  onClick={() => onSelectClient(client)}
                                  className="font-display text-xs font-black text-on-surface hover:text-primary hover:underline cursor-pointer truncate transition-colors"
                                  title="Ver ficha completa"
                                >
                                  {client.name}
                                </h4>
                                <p className="text-[9px] text-on-surface-variant font-semibold truncate mt-0.5">
                                  {client.phone} • {client.profileType}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => openQuickEdit(client)}
                              className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant flex-shrink-0"
                              title="Editar Negociação"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Temperature Indicator */}
                          <div className="flex justify-between items-center text-[9px] font-extrabold uppercase">
                            <span className="text-on-surface-variant font-bold">Temperatura:</span>
                            <span className={`px-1.5 py-0.5 rounded ${
                              client.temperature === "Quente" ? "bg-rose-500/10 text-rose-600" :
                              client.temperature === "Frio" ? "bg-blue-500/10 text-blue-600" :
                              "bg-amber-500/10 text-amber-600"
                            }`}>
                              🔥 {client.temperature || "Morno"}
                            </span>
                          </div>

                          {/* Deal Financials block */}
                          <div className="bg-surface-container-low/40 p-2 rounded-lg border border-outline-variant/10 text-[10px] flex flex-col gap-1 text-left">
                            <div className="flex justify-between items-center">
                              <span className="text-on-surface-variant font-bold">VALOR POTENCIAL:</span>
                              <span className="font-extrabold text-primary">R$ {finalPotentialVal.toLocaleString("pt-BR")}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-outline-variant/20 pt-1 mt-0.5">
                              <span className="text-on-surface-variant font-bold">COMISSÃO ({finalCommissionPercent}%):</span>
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">R$ {Math.floor(finalCommissionVal).toLocaleString("pt-BR")}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-outline-variant/20 pt-1 mt-0.5">
                              <span className="text-on-surface-variant font-bold">PROBABILIDADE:</span>
                              <span className={`font-extrabold ${
                                client.closingProbability === "Alta" ? "text-emerald-600 dark:text-emerald-400" :
                                client.closingProbability === "Baixa" ? "text-rose-600 dark:text-rose-400" :
                                "text-amber-600 dark:text-amber-400"
                              }`}>{client.closingProbability || "Média"}</span>
                            </div>
                          </div>

                          {/* Lost Reason Box */}
                          {stage === "Perdido" && client.lossReason && (
                            <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 rounded text-[10px] font-semibold">
                              <span className="font-extrabold block text-[9px] uppercase tracking-wider mb-0.5 text-rose-800">Motivo de Perda:</span>
                              "{client.lossReason}"
                            </div>
                          )}

                          {/* Property of interest block */}
                          <div className="border-t border-outline-variant/30 pt-2.5 space-y-1.5">
                            <div className="flex justify-between items-center text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">
                              <span className="flex items-center gap-1">
                                <Home className="w-3 h-3 text-secondary" />
                                Imóvel de Interesse
                              </span>
                            </div>

                            {linkedProp ? (
                              <div className="bg-surface-container/50 border border-outline-variant/30 rounded-lg p-2 flex flex-col gap-1">
                                <div className="flex justify-between items-start gap-1">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-on-surface truncate">
                                      {linkedProp.title}
                                    </p>
                                    <p className="text-[9px] text-on-surface-variant/80 truncate mt-0.5">
                                      Ref: #{(linkedProp.id || linkedProp._id || "").substring(0, 5).toUpperCase()} • {linkedProp.neighborhood}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleLinkProperty(client, undefined)}
                                    className="p-1 rounded-md text-on-surface-variant/70 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0"
                                    title="Desvincular Imóvel"
                                  >
                                    <Unlink className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-[10px] font-black text-primary mt-1">
                                  R$ {(linkedProp.price ?? 0).toLocaleString("pt-BR")}
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setLinkingClient(client)}
                                className="w-full py-1.5 bg-surface-container-high hover:bg-primary/5 hover:text-primary text-on-surface-variant border border-dashed border-outline-variant rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                              >
                                <LinkIcon className="w-3 h-3" />
                                Vincular por Código/Nome
                              </button>
                            )}
                          </div>

                          {/* Next Action Box */}
                          <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/10 text-[10px]">
                            <span className="text-[9px] text-on-surface-variant font-extrabold block uppercase tracking-wider mb-0.5">Próxima Ação:</span>
                            <p className="text-on-surface font-bold truncate">
                              {client.nextAction || "Nenhum follow-up planejado"}
                            </p>
                            {client.nextFollowUpDate && (() => {
                              const d = new Date(client.nextFollowUpDate + "T12:00:00");
                              if (isNaN(d.getTime())) return null;
                              return (
                                <p className="text-[8px] text-on-surface-variant font-bold mt-1">
                                  Prazo: {d.toLocaleDateString("pt-BR")}
                                </p>
                              );
                            })()}
                          </div>

                          {/* WhatsApp Quick Actions (Desktop) */}
                          <div className="border-t border-outline-variant/30 pt-2.5 space-y-1.5">
                            <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" /> WhatsApp CRM Quick Links
                            </p>
                            <div className="grid grid-cols-2 gap-1 text-[9px]">
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppAction(client, "primeiroContato")}
                                className="py-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-all truncate text-left"
                                title="Chamar no WhatsApp"
                              >
                                💬 Chamar WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppAction(client, "followUp")}
                                className="py-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-all truncate text-left"
                                title="Enviar follow-up"
                              >
                                ✉️ Enviar follow-up
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppAction(client, "confirmacaoVisita")}
                                className="py-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-all truncate text-left"
                                title="Confirmar visita"
                              >
                                📅 Confirmar visita
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppAction(client, "enviarImovel")}
                                className="py-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-all truncate text-left"
                                title="Enviar imóvel"
                              >
                                🏡 Enviar imóvel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppAction(client, "retomarAtendimento")}
                                className="col-span-2 py-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 rounded-md font-bold flex items-center justify-center gap-1 cursor-pointer transition-all truncate"
                                title="Retomar atendimento"
                              >
                                🔁 Retomar atendimento
                              </button>
                            </div>
                          </div>

                          {/* Stepper Navigation */}
                          <div className="flex items-center justify-between border-t border-outline-variant/30 pt-2.5 mt-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => moveStage(client, "prev")}
                              className="p-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                              title="Voltar Etapa"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>

                            {/* Precise dropdown select */}
                            <select
                              value={stage}
                              onChange={(e) => setSpecificStage(client, e.target.value)}
                              className="text-[10px] font-bold bg-transparent outline-none text-on-surface-variant max-w-[130px] border border-transparent hover:border-outline-variant rounded px-1 text-center cursor-pointer"
                            >
                              {stages.map((s, sIdx) => (
                                <option key={`opt-stage-${s}`} value={s}>
                                  {sIdx + 1}. {s}
                                </option>
                              ))}
                            </select>

                            <button
                              disabled={idx === stages.length - 1}
                              onClick={() => moveStage(client, "next")}
                              className="p-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                              title="Avançar Etapa"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Empty Stage Column */}
                  {stageClients.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 border border-dashed border-outline-variant/20 rounded-xl bg-surface-container-low/20">
                      <p className="text-[9px] text-on-surface-variant/50 font-bold uppercase tracking-wider">Vazio</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* POPUP MODAL: RECORD REASON FOR LOSS (PERDIDO) */}
      <AnimatePresence>
        {lossReasonClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-md rounded-2xl shadow-2xl p-6 border border-rose-500/30 flex flex-col"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-outline-variant/40 mb-4 text-rose-600">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-bounce" />
                <h3 className="font-display text-base font-black">Justificar Negócio Perdido</h3>
              </div>

              <p className="text-xs text-on-surface-variant mb-4 leading-relaxed font-semibold">
                Você está movendo <span className="text-on-surface font-black">{lossReasonClient.name}</span> para a coluna <span className="text-rose-600 font-bold">Perdido</span>. Registre o motivo para auxiliar na análise comercial e identificar gargalos na esteira:
              </p>

              {/* Suggestions Chips */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Motivos Comuns:</label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_LOSS_REASONS.map((reason) => (
                    <button
                      type="button"
                      key={reason}
                      onClick={() => handleSaveLossReason(reason)}
                      className="px-3 py-1.5 bg-surface-container-high border border-outline-variant/30 rounded-full text-[10px] font-bold text-on-surface-variant hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition-all cursor-pointer"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Reason Input */}
              <div className="mt-4 pt-4 border-t border-outline-variant/20 space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Outro Motivo Personalizado:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite um motivo personalizado..."
                    value={customLossReason}
                    onChange={(e) => setCustomLossReason(e.target.value)}
                    className="flex-1 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                  />
                  <button
                    disabled={!customLossReason.trim()}
                    onClick={() => handleSaveLossReason(customLossReason.trim())}
                    className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-700 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setLossReasonClient(null)}
                className="mt-5 py-2 text-center text-xs font-bold text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-lg bg-surface hover:bg-surface-container transition-all cursor-pointer"
              >
                Cancelar Alteração
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POPUP MODAL: QUICK EDIT DEAL (POTENTIAL VALUE, COMMISSION, TEMPERATURE, ACTION) */}
      <AnimatePresence>
        {quickEditClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-md rounded-2xl shadow-2xl p-6 border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40 mb-4 sticky top-0 bg-surface z-10">
                <div>
                  <h3 className="font-display text-base font-black text-primary">Editar Negociação</h3>
                  <p className="text-[10px] text-on-surface-variant font-bold mt-0.5">Cliente: {quickEditClient.name}</p>
                </div>
                <button
                  onClick={() => setQuickEditClient(null)}
                  className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={saveQuickEdit} className="space-y-4 overflow-y-auto pr-1">
                {/* Financial Value and Commission rate */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Valor Potencial (R$)
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 500000"
                      value={editPotentialValue}
                      onChange={(e) => setEditPotentialValue(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-xs text-on-surface focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Comissão Estimada (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 5"
                      value={editCommissionPercent}
                      onChange={(e) => setEditCommissionPercent(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-xs text-on-surface focus:border-primary"
                    />
                  </div>
                </div>

                {/* Real-time Forecast Visualizer */}
                {(() => {
                  const pot = Number(editPotentialValue) || 0;
                  const pct = Number(editCommissionPercent) || 0;
                  const forecast = Math.floor(pot * (pct / 100));
                  return (
                    <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20 text-xs flex justify-between items-center text-emerald-800 dark:text-emerald-300">
                      <span className="font-extrabold uppercase text-[9px] tracking-wider">Comissão Estimada:</span>
                      <span className="font-black text-sm">R$ {forecast.toLocaleString("pt-BR")}</span>
                    </div>
                  );
                })()}

                {/* Lead Temperature */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Temperatura do Lead
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Frio", "Morno", "Quente"].map((temp) => {
                      const isActive = editTemperature === temp;
                      return (
                        <button
                          type="button"
                          key={`temp-select-${temp}`}
                          onClick={() => setEditTemperature(temp as any)}
                          className={`py-2 px-3 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? temp === "Quente" ? "bg-rose-600 text-white border-rose-600 shadow-sm" :
                                temp === "Frio" ? "bg-blue-600 text-white border-blue-600 shadow-sm" :
                                "bg-amber-500 text-white border-amber-500 shadow-sm"
                              : "bg-white text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                          }`}
                        >
                          🔥 {temp}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Next Action Text */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Próxima Ação Planejada (Follow-up)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Ligar para agendar visita no sábado"
                    value={editNextAction}
                    onChange={(e) => setEditNextAction(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-xs text-on-surface focus:border-primary"
                  />
                </div>

                {/* Next Follow-Up Date */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Data do Próximo Follow-up
                  </label>
                  <input
                    type="date"
                    value={editNextFollowUpDate}
                    onChange={(e) => setEditNextFollowUpDate(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-xs text-on-surface focus:border-primary"
                  />
                </div>

                {/* Submit buttons */}
                <div className="flex gap-3 pt-4 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setQuickEditClient(null)}
                    className="flex-1 py-2.5 text-center text-xs font-bold border border-outline-variant/40 rounded-xl bg-white text-on-surface-variant hover:bg-surface-container transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-primary text-on-primary font-bold text-xs rounded-xl hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Check className="w-4 h-4 stroke-[3]" /> Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POPUP: PROPERTY LINK MODAL */}
      <AnimatePresence>
        {linkingClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-md rounded-2xl shadow-2xl p-6 border border-outline-variant/30 flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40 mb-4">
                <div>
                  <h3 className="font-display text-base font-bold text-primary">Vincular Imóvel ao Cliente</h3>
                  <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">Cliente: {linkingClient.name}</p>
                </div>
                <button
                  onClick={() => {
                    setLinkingClient(null);
                    setPropertySearch("");
                  }}
                  className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </div>

              {/* Search properties */}
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por código (ID) ou título..."
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-surface-container-low border border-outline-variant/50 rounded-lg outline-none text-xs text-on-surface"
                />
              </div>

              {/* Property list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[350px]">
                {filteredProperties.map((prop) => {
                  const shortId = (prop.id || prop._id || "").substring(0, 5).toUpperCase();
                  return (
                    <div
                      key={prop.id || prop._id}
                      onClick={() => handleLinkProperty(linkingClient, prop.id || prop._id)}
                      className="p-3 border border-outline-variant/30 rounded-xl bg-surface-container-low/40 hover:bg-secondary-container/10 hover:border-secondary/40 transition-all cursor-pointer flex justify-between items-center group"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="px-1.5 py-0.5 rounded bg-secondary-container/45 text-secondary text-[8px] font-bold">
                          COD: #{shortId}
                        </span>
                        <h4 className="font-display text-xs font-bold text-on-surface truncate mt-1">
                          {prop.title}
                        </h4>
                        <p className="text-[10px] text-on-surface-variant mt-0.5">
                          {prop.neighborhood}, {prop.city}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-primary">
                          R$ {(prop.price ?? 0).toLocaleString("pt-BR")}
                        </div>
                        <span className="text-[8px] font-bold text-on-surface-variant uppercase mt-1 block">
                          Vincular ➜
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredProperties.length === 0 && (
                  <div className="text-center py-10 text-on-surface-variant/80">
                    <p className="text-xs">Nenhum imóvel correspondente encontrado.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: QUICK ADD CLIENT */}
      <AnimatePresence>
        {showQuickAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-md rounded-2xl shadow-2xl p-6 border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40 mb-4 sticky top-0 z-10">
                <h3 className="font-display text-base font-bold text-primary">Adicionar Lead ao Funil</h3>
                <button
                  onClick={() => setShowQuickAdd(false)}
                  className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </div>

              <form onSubmit={handleQuickAddSubmit} className="space-y-4 overflow-y-auto pr-1">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Nome do Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Albuquerque"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                      Telefone *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: (11) 98888-7777"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                      E-mail (Opcional)
                    </label>
                    <input
                      type="email"
                      placeholder="carlos@exemplo.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                      Orçamento Estimado (R$)
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 1500000"
                      value={newBudget}
                      onChange={(e) => setNewBudget(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                      Tipo de Imóvel
                    </label>
                    <select
                      value={newPropType}
                      onChange={(e) => setNewPropType(e.target.value)}
                      className="w-full px-2 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                    >
                      <option>Apartamento</option>
                      <option>Casa</option>
                      <option>Sobrado</option>
                      <option>Terreno</option>
                      <option>Comercial</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                      Perfil
                    </label>
                    <select
                      value={newProfileType}
                      onChange={(e) => setNewProfileType(e.target.value)}
                      className="w-full px-2 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                    >
                      <option>Lead</option>
                      <option>Comprador</option>
                      <option>Vendedor</option>
                      <option>Locador</option>
                      <option>Locatário</option>
                      <option>Investidor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                      Objetivo
                    </label>
                    <select
                      value={newObjective}
                      onChange={(e) => setNewObjective(e.target.value)}
                      className="w-full px-2 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                    >
                      <option>Compra</option>
                      <option>Venda</option>
                      <option>Locação</option>
                      <option>Avaliação</option>
                      <option>Investimento</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Posição Inicial na Esteira
                  </label>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    className="w-full px-2 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface"
                  >
                    {stages.map((s) => (
                      <option key={`qs-init-${s}`} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingQuickAdd}
                  className="w-full py-2.5 bg-primary text-on-primary font-bold text-xs rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer mt-2"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  Iniciar Acompanhamento
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: GERENCIAR MODELOS DE WHATSAPP */}
      <AnimatePresence>
        {showTemplateManager && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl p-6 border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40 mb-4 sticky top-0 z-10">
                <div>
                  <h3 className="font-display text-base font-bold text-primary flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Modelos de Mensagem do WhatsApp
                  </h3>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">
                    Configure as mensagens padrão usadas nas ações rápidas de contato.
                  </p>
                </div>
                <button
                  onClick={() => setShowTemplateManager(false)}
                  className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded-xl space-y-1">
                  <p className="font-bold">Dica de variáveis dinâmicas:</p>
                  <p className="text-[11px] leading-relaxed">
                    Você pode usar as seguintes palavras-chave em qualquer mensagem. Elas serão substituídas automaticamente pelos dados reais do cliente no envio:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1 font-mono text-[10px]">
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 rounded font-semibold text-emerald-900 dark:text-emerald-100">{"{{nome}}"}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 rounded font-semibold text-emerald-900 dark:text-emerald-100">{"{{corretor}}"}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 rounded font-semibold text-emerald-900 dark:text-emerald-100">{"{{imovel}}"}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 rounded font-semibold text-emerald-900 dark:text-emerald-100">{"{{data}}"}</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 rounded font-semibold text-emerald-900 dark:text-emerald-100">{"{{hora}}"}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                      1. Primeiro Contato / Chamar WhatsApp
                    </label>
                    <textarea
                      rows={3}
                      value={editingTemplates.primeiroContato}
                      onChange={(e) => setEditingTemplates({ ...editingTemplates, primeiroContato: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface focus:border-emerald-500"
                      placeholder="Insira o texto do modelo..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                      2. Enviar Follow-up
                    </label>
                    <textarea
                      rows={3}
                      value={editingTemplates.followUp}
                      onChange={(e) => setEditingTemplates({ ...editingTemplates, followUp: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface focus:border-emerald-500"
                      placeholder="Insira o texto do modelo..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                      3. Confirmar Visita
                    </label>
                    <textarea
                      rows={3}
                      value={editingTemplates.confirmacaoVisita}
                      onChange={(e) => setEditingTemplates({ ...editingTemplates, confirmacaoVisita: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface focus:border-emerald-500"
                      placeholder="Insira o texto do modelo..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                      4. Enviar Imóvel (Pós-visita)
                    </label>
                    <textarea
                      rows={3}
                      value={editingTemplates.enviarImovel}
                      onChange={(e) => setEditingTemplates({ ...editingTemplates, enviarImovel: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface focus:border-emerald-500"
                      placeholder="Insira o texto do modelo..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                      5. Retomar Atendimento / Proposta
                    </label>
                    <textarea
                      rows={3}
                      value={editingTemplates.retomarAtendimento}
                      onChange={(e) => setEditingTemplates({ ...editingTemplates, retomarAtendimento: e.target.value })}
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg outline-none text-xs text-on-surface focus:border-emerald-500"
                      placeholder="Insira o texto do modelo..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant mt-4 sticky bottom-0 bg-surface">
                <button
                  onClick={() => setShowTemplateManager(false)}
                  className="px-4 py-2 bg-surface-container-high text-on-surface-variant font-bold text-xs rounded-xl hover:opacity-90 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveTemplates}
                  className="px-5 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:opacity-90 transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Salvar Modelos
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: PREVIEW E ENVIO DE WHATSAPP */}
      <AnimatePresence>
        {activeWhatsAppClient && activeWhatsAppKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-xl rounded-2xl shadow-2xl p-6 border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40 mb-4 sticky top-0 z-10">
                <div>
                  <h3 className="font-display text-base font-bold text-primary flex items-center gap-1.5">
                    <span className="text-emerald-500">💬</span>
                    Enviar WhatsApp para {activeWhatsAppClient.name}
                  </h3>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">
                    Telefone: <span className="font-mono font-bold text-on-surface">{activeWhatsAppClient.phone}</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveWhatsAppClient(null);
                    setActiveWhatsAppKey(null);
                  }}
                  className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </div>

              {/* Tab selector within message sender */}
              <div className="flex gap-1 overflow-x-auto pb-2 border-b border-outline-variant/20 mb-4 scrollbar-none">
                {(["primeiroContato", "followUp", "confirmacaoVisita", "enviarImovel", "retomarAtendimento"] as const).map((key) => {
                  const label = 
                    key === "primeiroContato" ? "Novo Lead" :
                    key === "followUp" ? "Follow-up" :
                    key === "confirmacaoVisita" ? "Visita" :
                    key === "enviarImovel" ? "Enviar Imóvel" : "Retomar";
                  const isSel = activeWhatsAppKey === key;
                  return (
                    <button
                      key={`tab-sender-key-${key}`}
                      type="button"
                      onClick={() => handleOpenWhatsAppAction(activeWhatsAppClient, key)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border whitespace-nowrap cursor-pointer ${
                        isSel
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-surface-container-low border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                {/* Dynamic placeholders helper editor */}
                <div className="p-4 bg-surface-container-low border border-outline-variant/30 rounded-xl space-y-3">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    Preencher Campos Dinâmicos (Substituição Imediata):
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-extrabold text-on-surface-variant mb-1 uppercase tracking-wider">
                        Nome do Cliente {"{{nome}}"}
                      </label>
                      <input
                        type="text"
                        value={pName}
                        onChange={(e) => handlePlaceholderChange("name", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface border border-outline-variant rounded-lg text-xs outline-none text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-on-surface-variant mb-1 uppercase tracking-wider">
                        Nome do Corretor {"{{corretor}}"}
                      </label>
                      <input
                        type="text"
                        value={pCorretor}
                        onChange={(e) => handlePlaceholderChange("corretor", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface border border-outline-variant rounded-lg text-xs outline-none text-on-surface"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div className="md:col-span-1">
                      <label className="block text-[9px] font-extrabold text-on-surface-variant mb-1 uppercase tracking-wider">
                        Imóvel {"{{imovel}}"}
                      </label>
                      <input
                        type="text"
                        value={pImovel}
                        onChange={(e) => handlePlaceholderChange("imovel", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface border border-outline-variant rounded-lg text-xs outline-none text-on-surface"
                        placeholder="Nome do imóvel"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-on-surface-variant mb-1 uppercase tracking-wider">
                        Data {"{{data}}"}
                      </label>
                      <input
                        type="text"
                        value={pData}
                        onChange={(e) => handlePlaceholderChange("data", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface border border-outline-variant rounded-lg text-xs outline-none text-on-surface"
                        placeholder="DD/MM/AAAA"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold text-on-surface-variant mb-1 uppercase tracking-wider">
                        Hora {"{{hora}}"}
                      </label>
                      <input
                        type="text"
                        value={pHora}
                        onChange={(e) => handlePlaceholderChange("hora", e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface border border-outline-variant rounded-lg text-xs outline-none text-on-surface"
                        placeholder="HH:MM"
                      />
                    </div>
                  </div>
                </div>

                {/* Real Message Text Editor */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span>Texto Final Editável:</span>
                    <span className="text-[9px] text-on-surface-variant lowercase font-medium">Você pode fazer alterações manuais aqui</span>
                  </div>
                  <textarea
                    rows={6}
                    value={whatsappMessageText}
                    onChange={(e) => setWhatsappMessageText(e.target.value)}
                    className="w-full px-3 py-2.5 bg-emerald-500/5 dark:bg-emerald-500/10 border-2 border-emerald-500/30 rounded-xl outline-none text-xs text-on-surface focus:border-emerald-500 font-medium leading-relaxed"
                    placeholder="Carregando modelo..."
                  />
                </div>

                <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/30 text-[11px] leading-relaxed text-on-surface-variant/90 space-y-1">
                  <p className="font-bold text-on-surface flex items-center gap-1">
                    <span>📌</span> Histórico Automático
                  </p>
                  <p>
                    Ao clicar em "Abrir no WhatsApp", o sistema abrirá o link oficial do WhatsApp Web ou app móvel de forma gratuita, e **adicionará automaticamente uma anotação com data e hora** no histórico deste lead.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant mt-4 sticky bottom-0 bg-surface">
                <button
                  onClick={() => {
                    setActiveWhatsAppClient(null);
                    setActiveWhatsAppKey(null);
                  }}
                  className="px-4 py-2.5 bg-surface-container-high text-on-surface-variant font-bold text-xs rounded-xl hover:opacity-90 transition-all cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  onClick={handleSendWhatsApp}
                  className="px-6 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-500 active:scale-[0.98] transition-all flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Abrir no WhatsApp
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
