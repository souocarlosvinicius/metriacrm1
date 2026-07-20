import React, { useState } from "react";
import { motion } from "motion/react";
import { Client, User as DbUser, HistoryEntry, Task, Proposal, Visit, Property } from "../types";
import { getClientAlerts, getAlertBadgeStyles } from "../utils/alerts";
import { getMatchingProperties } from "../utils/matching";
import { exportClientReportToPDF } from "../utils/pdfExport";
import { 
  X, User, Phone, Mail, Award, Landmark, Trash2, Edit, Save, Loader2, Check, Cake, MapPin,
  History, Plus, MessageSquare, Calendar, DollarSign, CheckCircle2, AlertCircle, Clock, PlusCircle,
  AlertTriangle, Sparkles, Download
} from "lucide-react";

interface ClientModalProps {
  client: Client;
  properties?: Property[];
  tasks?: Task[];
  proposals?: Proposal[];
  visits?: Visit[];
  currentUser?: DbUser;
  onClose: () => void;
  onUpdate: (updated: Client) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function ClientModal({ 
  client, 
  properties = [],
  tasks = [], 
  proposals = [], 
  visits = [], 
  currentUser, 
  onClose, 
  onUpdate, 
  onDelete 
}: ClientModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [clientType, setClientType] = useState<"PF" | "PJ">(client.clientType || "PF");
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [document, setDocument] = useState(client.document);
  const [email, setEmail] = useState(client.email);
  const [profileType, setProfileType] = useState(client.profileType);
  const [objective, setObjective] = useState(client.objective);
  const [propertyType, setPropertyType] = useState(client.propertyType);
  const [minBudget, setMinBudget] = useState(client.minBudget);
  const [maxBudget, setMaxBudget] = useState(client.maxBudget);
  const [observations, setObservations] = useState(client.observations);
  const [status, setStatus] = useState(client.status);
  const [pipelineStatus, setPipelineStatus] = useState(client.pipelineStatus || "Novo lead");
  const [birthday, setBirthday] = useState(client.birthday || "");
  const [address, setAddress] = useState(client.address || "");

  // Real estate CRM extensions
  const [leadSource, setLeadSource] = useState(client.leadSource || "Outro");
  const [interest, setInterest] = useState(client.interest || "Compra");
  const [budgetRange, setBudgetRange] = useState(client.budgetRange || "");
  const [neighborhoodOfInterest, setNeighborhoodOfInterest] = useState(client.neighborhoodOfInterest || "");
  const [desiredPropertyType, setDesiredPropertyType] = useState(client.desiredPropertyType || "");
  const [temperature, setTemperature] = useState<"Frio" | "Morno" | "Quente">(client.temperature || "Morno");
  const [nextAction, setNextAction] = useState(client.nextAction || "");
  const [nextFollowUpDate, setNextFollowUpDate] = useState(client.nextFollowUpDate || "");

  // Commission calculation states
  const [potentialValue, setPotentialValue] = useState<number>(
    client.potentialValue !== undefined ? client.potentialValue : (client.maxBudget || 0)
  );
  const [commissionPercent, setCommissionPercent] = useState<number>(
    client.commissionPercent !== undefined 
      ? client.commissionPercent 
      : (currentUser?.defaultCommissionPercent !== undefined ? currentUser.defaultCommissionPercent : 5)
  );
  const [commissionForecast, setCommissionForecast] = useState<number>(
    client.commissionForecast !== undefined 
      ? client.commissionForecast 
      : Math.floor((client.potentialValue || client.maxBudget || 0) * (client.commissionPercent ?? (currentUser?.defaultCommissionPercent ?? 5)) / 100)
  );
  const [closingProbability, setClosingProbability] = useState<"Baixa" | "Média" | "Alta">(
    client.closingProbability || "Média"
  );

  const handlePotentialValueChange = (val: number) => {
    setPotentialValue(val);
    setCommissionForecast(Math.floor(val * commissionPercent / 100));
  };

  const handleCommissionPercentChange = (val: number) => {
    setCommissionPercent(val);
    setCommissionForecast(Math.floor(potentialValue * val / 100));
  };

  // Get client's visual initials
  const getInitials = (fullName: string) => {
    return (fullName || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";
  };

  // Manual annotation states
  const [showAddAnnotation, setShowAddAnnotation] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState("");
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddManualAnnotation = async () => {
    if (!newAnnotation.trim()) return;
    setIsAddingAnnotation(true);
    try {
      const newEntry: HistoryEntry = {
        id: Math.random().toString(36).substring(2, 11),
        type: "observation",
        date: new Date().toISOString(),
        description: newAnnotation.trim(),
        userName: currentUser?.name || currentUser?.username || "Você"
      };

      // Ensure a creation event exists if there is no history yet to preserve the base
      const currentHistory = client.history || [
        {
          id: Math.random().toString(36).substring(2, 11),
          type: "creation",
          date: client.createdAt || new Date().toISOString(),
          description: "Lead criado no sistema"
        }
      ];

      const updatedClient: Client = {
        ...client,
        history: [...currentHistory, newEntry]
      };
      await onUpdate(updatedClient);
      setNewAnnotation("");
      setShowAddAnnotation(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar anotação.");
    } finally {
      setIsAddingAnnotation(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !phone.trim()) {
      setFormError("Por favor, preencha o nome e o telefone do cliente.");
      return;
    }
    setIsSaving(true);
    try {
      const updatedClient: Client = {
        ...client,
        clientType,
        name: name.trim(),
        phone: phone.trim(),
        document: document.trim(),
        email: email.trim(),
        profileType,
        objective,
        propertyType,
        minBudget: Number(minBudget) || 0,
        maxBudget: Number(maxBudget) || 0,
        observations,
        status,
        pipelineStatus,
        birthday: birthday && birthday.trim() !== "" ? birthday : undefined,
        address: address && address.trim() !== "" ? address : undefined,
        leadSource,
        interest,
        budgetRange,
        neighborhoodOfInterest,
        desiredPropertyType,
        temperature,
        nextAction,
        nextFollowUpDate: nextFollowUpDate && nextFollowUpDate.trim() !== "" ? nextFollowUpDate : undefined,
        potentialValue: Number(potentialValue) || 0,
        commissionPercent: Number(commissionPercent) || 0,
        commissionForecast: Number(commissionForecast) || 0,
        closingProbability,
      };
      await onUpdate(updatedClient);
      setIsEditing(false);
    } catch (err: any) {
      console.error("Failed to update client in ClientModal:", err);
      const errMessage = err?.message || "Ocorreu um erro no servidor ou parâmetros incorretos.";
      setFormError(`Erro ao salvar alterações do cliente: ${errMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const clientId = client.id || client._id;

    setFormError(null);

    if (!clientId) {
      setFormError("Não foi possível excluir: ID do cliente não encontrado.");
      return;
    }

    const confirmed = window.confirm(
      `Deseja realmente excluir o cliente "${client.name}"? Essa ação não poderá ser desfeita.`
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      await onDelete(clientId);
      onClose();
    } catch (err: any) {
      console.error("Erro ao excluir cliente:", err);
      setFormError(err?.message || "Erro ao excluir cliente. Tente novamente.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="relative bg-surface w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-outline-variant/30"
      >
        
        {/* Header */}
        <header className="flex justify-between items-center px-6 py-4 bg-surface border-b border-outline-variant sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <User className="text-primary w-5 h-5" />
            <h2 className="font-display text-title-md text-primary">
              {isEditing ? "Editar Cliente" : "Ficha do Cliente"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
            <X className="w-5 h-5 text-on-surface-variant" />
          </button>
        </header>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {formError && (
            <div className="p-3.5 bg-error/10 text-error border border-error/20 rounded-xl flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Erro</p>
                <p className="text-xs">{formError}</p>
              </div>
            </div>
          )}
          {!isEditing ? (
            /* VIEW MODE */
            <div className="space-y-6">
              
              {/* Profile card summary */}
              <div className="flex items-center gap-4 bg-surface-container-low p-4 rounded-2xl border border-outline-variant/20">
                <div className="w-16 h-16 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-display text-headline-lg-mobile shadow-inner">
                  {getInitials(client.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-title-md text-on-surface truncate">{client.name}</h3>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <span className="px-2 py-0.5 bg-primary text-on-primary font-label-md text-[10px] rounded-md tracking-wider">
                      {(client.profileType || "").toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 bg-secondary-container text-on-secondary-container font-label-md text-[10px] rounded-md">
                      {(client.status || "").toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-label-md text-[10px] rounded-md font-bold">
                      {client.clientType === "PJ" ? "PJ" : "PF"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Commercial Alerts (Opportunities cooling down) */}
              {(() => {
                const alerts = getClientAlerts(client, tasks, proposals, visits);
                if (alerts.length === 0) return null;
                return (
                  <div className="space-y-2 bg-red-50/50 p-4 rounded-xl border border-red-200/60 text-left">
                    <p className="text-[10px] text-red-700 font-extrabold uppercase tracking-widest flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                      Alertas de Estagnação Ativos ({alerts.length})
                    </p>
                    <div className="space-y-1.5 mt-2">
                      {alerts.map(alert => {
                        const badgeStyles = getAlertBadgeStyles(alert.level);
                        return (
                          <div key={alert.id} className="p-2.5 bg-white border border-red-100 rounded-lg text-xs">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${badgeStyles.bg}`}>
                                {alert.level}
                              </span>
                              <span className="text-[9px] text-on-surface-variant/70 font-mono font-bold">Regra #{alert.ruleId}</span>
                            </div>
                            <h5 className="font-bold text-primary text-sm flex items-center gap-1">{alert.title}</h5>
                            <p className="text-xs text-on-surface-variant font-medium mt-1">{alert.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Pipeline Stage Tracker */}
              <div className="space-y-2 bg-secondary-container/10 p-4 rounded-xl border border-secondary/20 shadow-inner">
                <p className="text-[10px] text-secondary font-bold uppercase tracking-wider">Fase na Esteira de Vendas</p>
                <p className="text-sm font-bold text-on-surface">{client.pipelineStatus || "Em Atendimento"}</p>
              </div>

              {/* Personal Info Contact Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Informações Pessoais</h4>
                
                <div className="space-y-2 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 shadow-sm text-sm">
                  <div className="flex items-center gap-3 py-1.5 border-b border-outline-variant/40">
                    <Phone className="w-4 h-4 text-secondary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-semibold">Telefone</p>
                      <a href={`tel:${client.phone}`} className="text-on-surface hover:underline font-medium">
                        {client.phone}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-1.5 border-b border-outline-variant/40">
                    <Mail className="w-4 h-4 text-secondary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-semibold">E-mail</p>
                      <a href={`mailto:${client.email}`} className="text-on-surface hover:underline font-medium">
                        {client.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-1.5 border-b border-outline-variant/40">
                    <Landmark className="w-4 h-4 text-secondary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-semibold">Documento (CPF/CNPJ)</p>
                      <p className="text-on-surface font-medium">{client.document || "Não informado"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-1.5 border-b border-outline-variant/40">
                    <Cake className="w-4 h-4 text-secondary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-semibold">Data de Aniversário</p>
                      <p className="text-on-surface font-medium">
                        {client.birthday ? (() => {
                          const parts = client.birthday.split("-");
                          if (parts.length === 3) {
                            return `${parts[2]}/${parts[1]}/${parts[0]}`;
                          }
                          return client.birthday;
                        })() : "Não informada"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-1.5">
                    <MapPin className="w-4 h-4 text-secondary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-on-surface-variant font-semibold">Endereço Completo</p>
                      <p className="text-on-surface font-medium">{client.address || "Não informado"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Informações de Lead / Negócio */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Status & Qualificação</h4>
                <div className="grid grid-cols-2 gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 shadow-sm text-sm">
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Temperatura</p>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold mt-1 ${
                      client.temperature === "Quente" ? "bg-red-100 text-red-800" :
                      client.temperature === "Frio" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"
                    }`}>
                      {client.temperature || "Morno"}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Origem do Lead</p>
                    <p className="font-semibold text-on-surface mt-1">{client.leadSource || "Não informada"}</p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-outline-variant/40">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Próxima Ação</p>
                    <p className="font-semibold text-on-surface mt-0.5">{client.nextAction || "Nenhuma ação planejada"}</p>
                  </div>
                  {client.nextFollowUpDate && (
                    <div className="col-span-2 pt-2 border-t border-outline-variant/40">
                      <p className="text-[10px] text-on-surface-variant uppercase font-bold">Data do Próximo Follow-up</p>
                      <p className="font-semibold text-red-600 mt-0.5">
                        {(() => {
                          const parts = client.nextFollowUpDate.split("-");
                          if (parts.length === 3) {
                            return `${parts[2]}/${parts[1]}/${parts[0]}`;
                          }
                          const d = new Date(client.nextFollowUpDate);
                          return isNaN(d.getTime()) ? client.nextFollowUpDate : d.toLocaleDateString("pt-BR");
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Previsão de Comissão & Negociação (Dinheiro em Jogo!) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Previsão de Comissão <span className="text-[10px] text-on-surface-variant font-normal normal-case italic">(Estimativa)</span>
                </h4>
                <div className="grid grid-cols-2 gap-3 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20 shadow-sm text-sm">
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Valor do Negócio</p>
                    <p className="font-extrabold text-primary text-base mt-0.5">
                      R$ {(client.potentialValue !== undefined ? client.potentialValue : (client.maxBudget || 0)).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Probabilidade de Fechamento</p>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold mt-1 ${
                      client.closingProbability === "Alta" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                      client.closingProbability === "Baixa" ? "bg-rose-100 text-rose-800 border border-rose-200" :
                      "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}>
                      {client.closingProbability || "Média"}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/30">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Comissão (%)</p>
                    <p className="font-bold text-on-surface mt-0.5">
                      {client.commissionPercent !== undefined ? client.commissionPercent : (currentUser?.defaultCommissionPercent ?? 5)}%
                    </p>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/30">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold font-extrabold">Comissão Potencial Estimada</p>
                    <p className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      R$ {(client.commissionForecast !== undefined 
                        ? client.commissionForecast 
                        : Math.floor((client.potentialValue || client.maxBudget || 0) * (client.commissionPercent ?? (currentUser?.defaultCommissionPercent ?? 5)) / 100)
                      ).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Client Preference & Budget Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Perfil & Interesse Imobiliário</h4>
                
                <div className="grid grid-cols-2 gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 shadow-sm text-sm">
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Interesse</p>
                    <p className="font-semibold text-primary mt-0.5">{client.interest || client.objective || "Compra"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Tipo Desejado</p>
                    <p className="font-semibold text-primary mt-0.5">{client.desiredPropertyType || client.propertyType || "Qualquer"}</p>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/40">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Bairro de Interesse</p>
                    <p className="font-semibold text-on-surface mt-0.5">{client.neighborhoodOfInterest || "Qualquer"}</p>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/40">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Orçamento / Faixa</p>
                    <p className="font-semibold text-on-surface mt-0.5">
                      {client.budgetRange || `R$ ${(client.minBudget ?? 0).toLocaleString("pt-BR")} - R$ ${(client.maxBudget ?? 0).toLocaleString("pt-BR")}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Observations */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Anotações e Observações</h4>
                <p className="text-on-surface-variant text-body-sm leading-relaxed bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 shadow-sm whitespace-pre-wrap">
                  {client.observations || "Nenhuma observação ou anotação cadastrada."}
                </p>
              </div>

              {/* IMÓVEIS COMPATÍVEIS RECOMENDADOS */}
              <div className="space-y-3 pt-3 border-t border-outline-variant/30 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                    Imóveis Compatíveis Recomendados
                  </h4>
                  <span className="text-[10px] text-on-surface-variant bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                    {getMatchingProperties(client, properties).length} Encontrados
                  </span>
                </div>

                {(() => {
                  const matches = getMatchingProperties(client, properties);
                  if (matches.length === 0) {
                    return (
                      <div className="p-4 bg-surface-container-low border border-outline-variant/20 rounded-xl text-center text-xs text-on-surface-variant font-medium">
                        Nenhum imóvel compatível encontrado para o perfil deste cliente no momento. Cadastre novos imóveis ou ajuste a faixa de orçamento/bairro de interesse.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {matches.slice(0, 4).map(({ property, score, reasons }) => {
                        const formattedPrice = (property.price || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0
                        });

                        // Generate pre-filled WhatsApp message
                        const cleanPhone = client.phone.replace(/\D/g, "");
                        const whatsappPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                        const messageText = `Olá, *${client.name}*! Tudo bem?
Encontrei este imóvel incrível no Metria CRM que é extremamente compatível com o seu perfil e o que você procura:

🏡 *${property.title}*
📍 *Localização:* ${property.neighborhood || "Bairro não informado"}, ${property.city || "Cidade não informada"}
💰 *Valor:* ${formattedPrice}
📐 *Área:* ${property.area}m² | 🛏️ *Quartos:* ${property.bedrooms} | 🚿 *Banheiros:* ${property.bathrooms}

Gostaria de agendar uma visita ou receber mais fotos deste imóvel?`;

                        const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappPhone}&text=${encodeURIComponent(messageText)}`;

                        return (
                          <div
                            key={property.id || property._id}
                            className="bg-white border border-outline-variant/35 p-3.5 rounded-xl hover:border-emerald-500/40 transition-all shadow-sm relative overflow-hidden flex flex-col justify-between gap-3 text-xs"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded font-bold font-mono">
                                    {property.code || "IM-NOVO"}
                                  </span>
                                  <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">
                                    {property.type}
                                  </span>
                                </div>
                                <h5 className="font-extrabold text-primary text-sm mt-1.5 leading-snug">
                                  {property.title}
                                </h5>
                                <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                                  {property.neighborhood}, {property.city}
                                </p>
                              </div>

                              {/* Compatibility Score Circle */}
                              <div className="flex flex-col items-end flex-shrink-0">
                                <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
                                  score >= 80 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                  score >= 60 ? "bg-amber-100 text-amber-800 border-amber-200" :
                                  "bg-orange-100 text-orange-800 border-orange-200"
                                }`}>
                                  {score}% Compatível
                                </span>
                                <span className="font-bold text-emerald-700 text-xs mt-1.5">{formattedPrice}</span>
                              </div>
                            </div>

                            {/* Motivos da Recomendação */}
                            <div className="bg-surface-container-lowest/50 p-2 rounded-lg border border-outline-variant/10 text-[10.5px]">
                              <p className="font-bold text-primary mb-1 text-[9.5px] uppercase tracking-wider">Motivos da Recomendação:</p>
                              <ul className="space-y-1">
                                {reasons.map((reason, rIdx) => (
                                  <li key={rIdx} className="flex items-start gap-1 text-on-surface-variant font-medium">
                                    <span className="text-emerald-600 font-bold">✓</span>
                                    <span>{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Actions inside card */}
                            <div className="flex justify-end pt-1">
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3.5 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Enviar Imóvel pelo WhatsApp
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* HISTÓRICO DE ATENDIMENTO */}
              <div className="space-y-3 pt-2 border-t border-outline-variant/30">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-primary" />
                    Histórico de Atendimento
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddAnnotation(!showAddAnnotation)}
                    className="text-[11px] text-primary hover:opacity-80 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar anotação
                  </button>
                </div>

                {/* Form inline para adicionar anotação */}
                {showAddAnnotation && (
                  <div className="p-3 bg-surface-container-low border border-outline-variant/40 rounded-xl space-y-2.5 shadow-sm">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase">Nova Anotação Manual</p>
                    <textarea
                      rows={3}
                      value={newAnnotation}
                      onChange={(e) => setNewAnnotation(e.target.value)}
                      placeholder="Digite aqui as observações ou o que aconteceu no atendimento..."
                      className="w-full px-3 py-2 bg-surface text-xs outline-none border border-outline-variant rounded-lg text-on-surface focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex justify-end gap-2 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setNewAnnotation("");
                          setShowAddAnnotation(false);
                        }}
                        className="px-3 py-1.5 bg-surface-container-high text-on-surface-variant rounded-lg hover:opacity-90 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleAddManualAnnotation}
                        disabled={isAddingAnnotation || !newAnnotation.trim()}
                        className="px-3.5 py-1.5 bg-primary text-on-primary rounded-lg flex items-center gap-1 shadow-sm disabled:opacity-55 hover:opacity-95 cursor-pointer"
                      >
                        {isAddingAnnotation ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Salvar Anotação
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de histórico */}
                <div className="relative border-l-2 border-outline-variant/30 ml-2.5 pl-4 py-1 space-y-4">
                  {(() => {
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

                    // Sort items by date descending so the newest event is at the top
                    const sortedItems = [...historyItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    return sortedItems.map((item, idx) => {
                      // Get type config
                      let icon = <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />;
                      let badgeColor = "bg-sky-50 dark:bg-sky-950/20 text-sky-800 dark:text-sky-300 border-sky-500/20";
                      let label = "Criação";

                      if (item.type === "status_change") {
                        icon = <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
                        badgeColor = "bg-purple-50 dark:bg-purple-950/20 text-purple-800 dark:text-purple-300 border-purple-500/20";
                        label = "Status";
                      } else if (item.type === "pipeline_change") {
                        icon = <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
                        badgeColor = "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-800 dark:text-indigo-300 border-indigo-500/20";
                        label = "Pipeline";
                      } else if (item.type === "whatsapp") {
                        icon = <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
                        badgeColor = "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/20";
                        label = "WhatsApp";
                      } else if (item.type === "task_created") {
                        icon = <PlusCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
                        badgeColor = "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-500/20";
                        label = "Tarefa";
                      } else if (item.type === "task_completed") {
                        icon = <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />;
                        badgeColor = "bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300 border-green-500/20";
                        label = "Tarefa Concluída";
                      } else if (item.type === "visit_scheduled") {
                        icon = <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />;
                        badgeColor = "bg-teal-50 dark:bg-teal-950/20 text-teal-800 dark:text-teal-300 border-teal-500/20";
                        label = "Visita";
                      } else if (item.type === "proposal_sent") {
                        icon = <DollarSign className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
                        badgeColor = "bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 border-rose-500/20";
                        label = "Proposta";
                      } else if (item.type === "observation") {
                        icon = <Edit className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />;
                        badgeColor = "bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-300 border-slate-500/20";
                        label = "Anotação";
                      } else if (item.type === "loss") {
                        icon = <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
                        badgeColor = "bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 border-red-500/20";
                        label = "Perda";
                      }

                      // Format Date nicely
                      let dateString = "Data inválida";
                      try {
                        const d = new Date(item.date);
                        if (!isNaN(d.getTime())) {
                          dateString = d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                        } else {
                          dateString = item.date;
                        }
                      } catch (e) {
                        dateString = item.date;
                      }

                      return (
                        <div key={item.id || `hist-${idx}`} className="relative group">
                          {/* Connection Node */}
                          <span className="absolute -left-[23.5px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-4 ring-surface border border-outline-variant/50">
                            {icon}
                          </span>
                          
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                                {label}
                              </span>
                              <span className="text-[10px] text-on-surface-variant font-medium flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {dateString}
                              </span>
                              {item.userName && (
                                <span className="text-[9px] text-on-surface-variant/85 italic">
                                  • por: {item.userName}
                                </span>
                              )}
                            </div>
                            
                            <p className="text-[11.5px] leading-relaxed text-on-surface font-medium whitespace-pre-wrap">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || isSaving}
                  className="px-4 py-2.5 bg-red-50 text-red-700 rounded-xl font-label-md hover:bg-red-100 transition-colors flex items-center gap-2 border border-red-200 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Excluir Cliente
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => exportClientReportToPDF(client, proposals, visits)}
                  disabled={isDeleting || isSaving}
                  className="mr-auto px-4 py-2.5 bg-surface-container-high hover:bg-surface-container-highest hover:text-primary text-on-surface-variant border border-outline-variant/30 rounded-xl font-label-md font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                  title="Exportar Relatório Completo do Cliente em PDF"
                >
                  <Download className="w-4 h-4 text-primary" />
                  <span className="hidden sm:inline">Exportar Relatório PDF</span>
                  <span className="sm:hidden">Relatório PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={isDeleting || isSaving}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-md hover:opacity-90 transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  <Edit className="w-4 h-4" />
                  Editar Cadastro
                </button>
              </div>

            </div>
          ) : (
            /* EDIT MODE FORM */
            <form onSubmit={handleSave} className="space-y-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-primary uppercase">Tipo de Cliente</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container-high rounded-lg border border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setClientType("PF")}
                    className={`h-9 rounded-md font-bold text-xs transition-all ${
                      clientType === "PF"
                        ? "bg-white text-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-white/50"
                    }`}
                  >
                    Pessoa Física (PF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientType("PJ")}
                    className={`h-9 rounded-md font-bold text-xs transition-all ${
                      clientType === "PJ"
                        ? "bg-white text-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-white/50"
                    }`}
                  >
                    Pessoa Jurídica (PJ)
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-primary uppercase">
                  {clientType === "PJ" ? "Razão Social / Nome Fantasia" : "Nome Completo"}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={clientType === "PJ" ? "Ex: Minha Empresa LTDA" : "Ex: João da Silva"}
                  className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Telefone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">
                    {clientType === "PJ" ? "CNPJ" : "CPF"}
                  </label>
                  <input
                    type="text"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    placeholder={clientType === "PJ" ? "00.000.000/0001-00" : "000.000.000-00"}
                    className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Status de Atendimento</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    <option>Novo</option>
                    <option>Em Atendimento</option>
                    <option>Proposta</option>
                    <option>Ganho</option>
                    <option>Perdido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Fase na Esteira de Vendas</label>
                  <select
                    value={pipelineStatus}
                    onChange={(e) => setPipelineStatus(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm w-full"
                  >
                    {(currentUser?.pipelineStages && currentUser.pipelineStages.length > 0 
                      ? currentUser.pipelineStages 
                      : [
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
                        ]
                    ).map((s, idx) => (
                      <option key={s} value={s}>{idx + 1}. {s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Data de Aniversário</label>
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-primary uppercase">Endereço Completo</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Av. Atlântica, 1200 - Copacabana, Rio de Janeiro - RJ"
                  className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Tipo de Perfil</label>
                  <select
                    value={profileType}
                    onChange={(e) => setProfileType(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    <option>Lead</option>
                    <option>Comprador</option>
                    <option>Locatário</option>
                    <option>Proprietário</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Objetivo de Interesse</label>
                  <select
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    <option>Venda</option>
                    <option>Aluguel</option>
                    <option>Temporada</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Interesse</label>
                  <select
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    <option>Compra</option>
                    <option>Venda</option>
                    <option>Locação</option>
                    <option>Avaliação</option>
                    <option>Investimento</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Tipo de Imóvel Desejado</label>
                  <input
                    type="text"
                    value={desiredPropertyType}
                    onChange={(e) => setDesiredPropertyType(e.target.value)}
                    placeholder="Ex: Apartamento, Casa"
                    className="h-11 px-3 border border-outline-variant rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Bairro de Interesse</label>
                  <input
                    type="text"
                    value={neighborhoodOfInterest}
                    onChange={(e) => setNeighborhoodOfInterest(e.target.value)}
                    placeholder="Ex: Copacabana, Ipanema"
                    className="h-11 px-3 border border-outline-variant rounded-lg text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Faixa de Orçamento</label>
                  <input
                    type="text"
                    value={budgetRange}
                    onChange={(e) => setBudgetRange(e.target.value)}
                    placeholder="Ex: R$ 500k - R$ 800k"
                    className="h-11 px-3 border border-outline-variant rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Origem do Lead</label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    {(currentUser?.leadSources && currentUser.leadSources.length > 0
                      ? currentUser.leadSources
                      : [
                          "Indicação",
                          "Instagram",
                          "Facebook",
                          "OLX",
                          "Portal Imobiliário",
                          "Placa",
                          "WhatsApp",
                          "Tráfego Pago",
                          "Outro"
                        ]
                    ).map((src) => (
                      <option key={src} value={src}>{src}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Temperatura do Lead</label>
                  <select
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value as any)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    <option>Frio</option>
                    <option>Morno</option>
                    <option>Quente</option>
                  </select>
                </div>
              </div>

              {/* Previsão de Comissão & Negociação (Estimativas) */}
              <div className="space-y-3 pt-3 border-t border-outline-variant/30 text-left">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  Previsão de Comissão & Negociação <span className="text-[10px] text-on-surface-variant font-normal normal-case italic">(Estimativas)</span>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Valor do Negócio (R$)</label>
                    <input
                      type="number"
                      value={potentialValue || ""}
                      onChange={(e) => handlePotentialValueChange(Number(e.target.value))}
                      placeholder="Ex: 500000"
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Probabilidade de Fechamento</label>
                    <select
                      value={closingProbability}
                      onChange={(e) => setClosingProbability(e.target.value as any)}
                      className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                    >
                      <option value="Baixa">Baixa</option>
                      <option value="Média">Média</option>
                      <option value="Alta">Alta</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Comissão (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={commissionPercent}
                      onChange={(e) => handleCommissionPercentChange(Number(e.target.value))}
                      placeholder="Ex: 5"
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Comissão Estimada (R$)</label>
                    <input
                      type="number"
                      value={commissionForecast || ""}
                      onChange={(e) => setCommissionForecast(Number(e.target.value))}
                      placeholder="Ex: 25000"
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Próxima Ação</label>
                  <input
                    type="text"
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="Ex: Enviar proposta de financiamento"
                    className="h-11 px-3 border border-outline-variant rounded-lg text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Data do Próximo Follow-up</label>
                  <input
                    type="date"
                    value={nextFollowUpDate}
                    onChange={(e) => setNextFollowUpDate(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary bg-white outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-primary uppercase">Observações e Perfil</label>
                <textarea
                  rows={3}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="p-3 border border-outline-variant rounded-lg text-sm resize-none"
                  placeholder="Escreva anotações sobre as preferências do cliente..."
                />
              </div>

              {/* Edit Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isDeleting || isSaving}
                  className="px-4 py-2.5 bg-surface-container-high text-on-surface-variant rounded-xl font-label-md hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isDeleting}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-md hover:opacity-90 transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Salvar Cadastro
                    </>
                  )}
                </button>
              </div>

            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
