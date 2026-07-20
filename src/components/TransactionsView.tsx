import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, Edit, Trash2, Calendar, DollarSign, Handshake, Eye, Clock, X, Check, 
  AlertCircle, ClipboardList, User, Home, ArrowUpRight, Search, FileText, CheckCircle
} from "lucide-react";
import { Proposal, Visit, Client, Property, User as LoggedUser } from "../types";
import GuidedTour, { GuidedTourStep } from "./GuidedTour";
import { exportMonthlyTransactionsReportToPDF } from "../utils/pdfExport";

interface TransactionsViewProps {
  proposals: Proposal[];
  visits: Visit[];
  clients: Client[];
  properties: Property[];
  onAddProposal: (newProposal: Omit<Proposal, "id">) => Promise<void>;
  onUpdateProposal: (updated: Proposal) => Promise<void>;
  onDeleteProposal: (id: string) => Promise<void>;
  onAddVisit: (newVisit: Omit<Visit, "id">) => Promise<void>;
  onUpdateVisit: (updated: Visit) => Promise<void>;
  onDeleteVisit: (id: string) => Promise<void>;
  currentUser: LoggedUser;
}

export default function TransactionsView({
  proposals,
  visits,
  clients,
  properties,
  onAddProposal,
  onUpdateProposal,
  onDeleteProposal,
  onAddVisit,
  onUpdateVisit,
  onDeleteVisit,
  currentUser
}: TransactionsViewProps) {
  const [subTab, setSubTab] = useState<"proposals" | "visits">("proposals");
  const [searchQuery, setSearchQuery] = useState("");

  const [isTourActive, setIsTourActive] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("metria_crm_proposals_tour_seen");
    if (!hasSeenTour) {
      const timer = setTimeout(() => {
        setIsTourActive(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const tourSteps: GuidedTourStep[] = [
    {
      targetId: "proposal-tour-tabs",
      title: "Abas de Negociação",
      description: "Alterne facilmente entre a gestão de Propostas de Venda/Aluguel e as Visitas Agendadas.",
      icon: Handshake,
      badge: "Abas"
    },
    {
      targetId: "proposal-tour-search",
      title: "Busca Rápida",
      description: "Filtre propostas ou visitas digitando o nome do cliente, o imóvel ou observações para encontrar o que precisa num piscar de olhos.",
      icon: Search,
      badge: "Pesquisa"
    },
    {
      targetId: "proposal-tour-btn-add",
      title: "Registrar Proposta ou Visita",
      description: "Envie uma nova proposta ou agende uma visita clicando aqui. Selecione o cliente e o imóvel correspondentes.",
      icon: Plus,
      badge: "Novo Registro"
    },
    {
      targetId: "proposal-tour-cards",
      title: "Controle de Status",
      description: "Monitore o status (Pendente, Em Análise, Aceita ou Recusada) de cada proposta e as ações de acompanhamento futuras.",
      icon: Check,
      badge: "Acompanhamento"
    }
  ];

  // Modals controllers
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);

  const [showVisitModal, setShowVisitModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);

  // Proposal form fields
  const [pClientId, setPClientId] = useState("");
  const [pPropertyId, setPPropertyId] = useState("");
  const [pProposedValue, setPProposedValue] = useState("");
  const [pStatus, setPStatus] = useState<Proposal["status"]>("Pendente");
  const [pDate, setPDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [pObservations, setPObservations] = useState("");
  const [pNextAction, setPNextAction] = useState("");

  // Visit form fields
  const [vClientId, setVClientId] = useState("");
  const [vPropertyId, setVPropertyId] = useState("");
  const [vDate, setVDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [vTime, setVTime] = useState("10:00");
  const [vStatus, setVStatus] = useState<Visit["status"]>("Agendada");
  const [vObservations, setVObservations] = useState("");
  const [vFeedback, setVFeedback] = useState("");

  // Export Monthly PDF Report state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportYear, setExportYear] = useState<number>(() => new Date().getFullYear());
  const [exportMonth, setExportMonth] = useState<number>(() => new Date().getMonth());

  const handleExportReport = () => {
    exportMonthlyTransactionsReportToPDF(proposals, visits, currentUser, exportYear, exportMonth);
    setShowExportModal(false);
  };

  // Filter lists based on search
  const filteredProposals = proposals.filter(p => 
    (p.clientName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.propertyTitle || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.observations || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredVisits = visits.filter(v => 
    (v.clientName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.propertyTitle || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.observations || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenNewProposal = () => {
    setEditingProposal(null);
    setPClientId(clients[0]?.id || clients[0]?._id || "");
    setPPropertyId(properties[0]?.id || properties[0]?._id || "");
    setPProposedValue("");
    setPStatus("Pendente");
    setPDate(new Date().toISOString().split("T")[0]);
    setPObservations("");
    setPNextAction("");
    setShowProposalModal(true);
  };

  const handleOpenEditProposal = (prop: Proposal) => {
    setEditingProposal(prop);
    setPClientId(prop.clientId);
    setPPropertyId(prop.propertyId);
    setPProposedValue(prop.proposedValue.toString());
    setPStatus(prop.status);
    setPDate(prop.date);
    setPObservations(prop.observations);
    setPNextAction(prop.nextAction || "");
    setShowProposalModal(true);
  };

  const handleSaveProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    const selClient = clients.find(c => (c.id === pClientId || c._id === pClientId));
    const selProperty = properties.find(pr => (pr.id === pPropertyId || pr._id === pPropertyId));

    if (!selClient || !selProperty) {
      alert("Por favor, selecione um cliente e um imóvel válidos.");
      return;
    }

    const payload = {
      clientId: pClientId,
      clientName: selClient.name,
      propertyId: pPropertyId,
      propertyTitle: selProperty.title,
      proposedValue: Number(pProposedValue),
      status: pStatus,
      date: pDate,
      observations: pObservations,
      nextAction: pNextAction || undefined
    };

    try {
      if (editingProposal) {
        await onUpdateProposal({
          ...editingProposal,
          ...payload
        });
      } else {
        await onAddProposal(payload);
      }
      setShowProposalModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenNewVisit = () => {
    setEditingVisit(null);
    setVClientId(clients[0]?.id || clients[0]?._id || "");
    setVPropertyId(properties[0]?.id || properties[0]?._id || "");
    setVDate(new Date().toISOString().split("T")[0]);
    setVTime("10:00");
    setVStatus("Agendada");
    setVObservations("");
    setVFeedback("");
    setShowVisitModal(true);
  };

  const handleOpenEditVisit = (vis: Visit) => {
    setEditingVisit(vis);
    setVClientId(vis.clientId);
    setVPropertyId(vis.propertyId);
    setVDate(vis.date);
    setVTime(vis.time);
    setVStatus(vis.status);
    setVObservations(vis.observations);
    setVFeedback(vis.feedback || "");
    setShowVisitModal(true);
  };

  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selClient = clients.find(c => (c.id === vClientId || c._id === vClientId));
    const selProperty = properties.find(pr => (pr.id === vPropertyId || pr._id === vPropertyId));

    if (!selClient || !selProperty) {
      alert("Por favor, selecione um cliente e um imóvel válidos.");
      return;
    }

    const payload = {
      clientId: vClientId,
      clientName: selClient.name,
      propertyId: vPropertyId,
      propertyTitle: selProperty.title,
      date: vDate,
      time: vTime,
      status: vStatus,
      observations: vObservations,
      feedback: vFeedback || undefined
    };

    try {
      if (editingVisit) {
        await onUpdateVisit({
          ...editingVisit,
          ...payload
        });
      } else {
        await onAddVisit(payload);
      }
      setShowVisitModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Tab Header and Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-primary tracking-tight">Negociações e Interações</h2>
          <p className="text-xs text-on-surface-variant font-medium mt-1">Gerencie visitas agendadas e propostas enviadas de seus leads de forma simplificada.</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* PDF Export Button */}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2.5 bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Exportar Relatório Mensal em PDF"
          >
            <FileText className="w-4.5 h-4.5 text-primary" />
            <span>Relatório Mensal (PDF)</span>
          </button>

          <button
            id="proposal-tour-btn-add"
            onClick={subTab === "proposals" ? handleOpenNewProposal : handleOpenNewVisit}
            className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {subTab === "proposals" ? "Nova Proposta" : "Agendar Visita"}
          </button>
        </div>
      </div>

      {/* Sub-tab Selection Rail */}
      <div id="proposal-tour-tabs" className="flex justify-between items-center bg-surface-container-low p-1.5 rounded-2xl border border-outline-variant/30 shadow-sm">
        <div className="flex gap-2">
          <button
            onClick={() => { setSubTab("proposals"); setSearchQuery(""); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === "proposals"
                ? "bg-white text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Handshake className="w-4 h-4" />
            Propostas de Venda/Aluguel ({proposals.length})
          </button>
          <button
            onClick={() => { setSubTab("visits"); setSearchQuery(""); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === "visits"
                ? "bg-white text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Visitas Agendadas ({visits.length})
          </button>
        </div>

        {/* Filter input */}
        <div className="relative max-w-xs shrink-0 hidden sm:block">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
          <input
            id="proposal-tour-search"
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 pl-8 pr-3 py-1.5 bg-white border border-outline-variant/30 rounded-lg text-xs outline-none focus:border-primary/40 transition-all text-on-surface font-medium"
          />
        </div>
      </div>

      {/* Main transactions container list */}
      <div className="min-h-[300px]">
        {subTab === "proposals" ? (
          /* PROPOSALS LIST */
          filteredProposals.length === 0 ? (
            <div id="proposal-tour-cards" className="flex flex-col items-center justify-center text-center py-20 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/60 shadow-sm animate-in fade-in duration-300 max-w-2xl mx-auto my-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-inner">
                <Handshake className="w-8 h-8 stroke-[1.5]" />
              </div>
              <h3 className="font-display text-xl font-bold text-on-surface tracking-tight">
                Nenhuma proposta cadastrada
              </h3>
              <p className="text-sm opacity-90 mt-2 max-w-md leading-relaxed">
                Cadastre propostas de compra ou locação feitas por seus clientes para acompanhar as negociações.
              </p>
              <button
                onClick={handleOpenNewProposal}
                className="mt-6 px-6 py-3 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 hover:shadow-lg cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Cadastrar primeira proposta
              </button>
            </div>
          ) : (
            <div id="proposal-tour-cards" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProposals.map((prop) => {
                const pId = prop.id || prop._id || "";
                return (
                  <div 
                    key={pId}
                    className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          prop.status === "Aceita" ? "bg-emerald-100 text-emerald-800" :
                          prop.status === "Recusada" ? "bg-red-100 text-red-800" :
                          prop.status === "Em Análise" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {prop.status}
                        </span>
                        <span className="text-[10px] text-on-surface-variant font-medium">
                          {prop.date.split("-").reverse().join("/")}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-on-surface-variant" />
                          <span className="font-bold text-sm text-on-surface">{prop.clientName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Home className="w-3.5 h-3.5 text-on-surface-variant" />
                          <span className="text-xs text-on-surface font-semibold truncate max-w-xs">{prop.propertyTitle}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-outline-variant/10">
                        <p className="text-[10px] text-on-surface-variant font-bold uppercase">Valor Proposto</p>
                        <p className="text-lg font-display font-extrabold text-primary">
                          {(prop.proposedValue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      </div>

                      {prop.observations && (
                        <p className="text-xs text-on-surface-variant line-clamp-2 italic bg-surface-container-low/40 p-2.5 rounded-lg border border-outline-variant/10">
                          "{prop.observations}"
                        </p>
                      )}

                      {prop.nextAction && (
                        <div className="flex items-center gap-1.5 text-xs text-secondary font-semibold">
                          <CheckCircle className="w-3.5 h-3.5 text-secondary shrink-0" />
                          <span className="truncate">Próximo Passo: {prop.nextAction}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/10">
                      <button
                        onClick={() => handleOpenEditProposal(prop)}
                        className="p-1.5 hover:bg-surface-container-high rounded-lg text-primary transition-colors cursor-pointer"
                        title="Editar Proposta"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Deseja realmente excluir esta proposta?")) {
                            try {
                              await onDeleteProposal(pId);
                            } catch (err: any) {
                              alert(err.message || "Erro ao excluir proposta.");
                            }
                          }
                        }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors cursor-pointer"
                        title="Excluir Proposta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* VISITS LIST */
          filteredVisits.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/60 shadow-sm animate-in fade-in duration-300 max-w-2xl mx-auto my-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-inner">
                <Calendar className="w-8 h-8 stroke-[1.5]" />
              </div>
              <h3 className="font-display text-xl font-bold text-on-surface tracking-tight">
                Nenhuma visita agendada
              </h3>
              <p className="text-sm opacity-90 mt-2 max-w-md leading-relaxed">
                Mantenha sua agenda organizada registrando as visitas guiadas que você tem com seus clientes compradores.
              </p>
              <button
                onClick={handleOpenNewVisit}
                className="mt-6 px-6 py-3 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 hover:shadow-lg cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Agendar primeira visita
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredVisits.map((vis) => {
                const vId = vis.id || vis._id || "";
                return (
                  <div 
                    key={vId}
                    className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          vis.status === "Realizada" ? "bg-emerald-100 text-emerald-800" :
                          vis.status === "Cancelada" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"
                        }`}>
                          {vis.status}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-bold uppercase">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          <span>{vis.date.split("-").reverse().join("/")}</span>
                          <span className="text-outline">|</span>
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span>{vis.time}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-on-surface-variant" />
                          <span className="font-bold text-sm text-on-surface">{vis.clientName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Home className="w-3.5 h-3.5 text-on-surface-variant" />
                          <span className="text-xs text-on-surface font-semibold truncate max-w-xs">{vis.propertyTitle}</span>
                        </div>
                      </div>

                      {vis.observations && (
                        <div className="space-y-1 pt-2 border-t border-outline-variant/10">
                          <p className="text-[9px] text-on-surface-variant font-bold uppercase">Observações da Visita</p>
                          <p className="text-xs text-on-surface-variant bg-surface-container-low/40 p-2.5 rounded-lg border border-outline-variant/10">
                            {vis.observations}
                          </p>
                        </div>
                      )}

                      {vis.feedback && (
                        <div className="space-y-1">
                          <p className="text-[9px] text-emerald-800 font-bold uppercase">Feedback do Cliente</p>
                          <p className="text-xs text-emerald-900 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100">
                            "{vis.feedback}"
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/10">
                      <button
                        onClick={() => handleOpenEditVisit(vis)}
                        className="p-1.5 hover:bg-surface-container-high rounded-lg text-primary transition-colors cursor-pointer"
                        title="Editar Visita"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Deseja realmente excluir esta visita?")) {
                            try {
                              await onDeleteVisit(vId);
                            } catch (err: any) {
                              alert(err.message || "Erro ao excluir visita.");
                            }
                          }
                        }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors cursor-pointer"
                        title="Excluir Visita"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* PROPOSAL EDIT/CREATE MODAL */}
      <AnimatePresence>
        {showProposalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/30 flex flex-col"
            >
              <header className="px-6 py-4 border-b border-outline-variant/40 flex justify-between items-center bg-white">
                <h3 className="font-display font-bold text-title-md text-primary">
                  {editingProposal ? "Editar Proposta" : "Cadastrar Nova Proposta"}
                </h3>
                <button onClick={() => setShowProposalModal(false)} className="p-1.5 rounded-full hover:bg-surface-container">
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </header>

              <form onSubmit={handleSaveProposal} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto bg-surface-container-lowest">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Cliente</label>
                  <select
                    value={pClientId}
                    onChange={(e) => setPClientId(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                    required
                  >
                    <option value="" disabled>Selecione um cliente...</option>
                    {clients.map(c => (
                      <option key={c.id || c._id} value={c.id || c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Imóvel</label>
                  <select
                    value={pPropertyId}
                    onChange={(e) => setPPropertyId(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                    required
                  >
                    <option value="" disabled>Selecione um imóvel...</option>
                    {properties.map(pr => (
                      <option key={pr.id || pr._id} value={pr.id || pr._id}>{pr.title}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Valor Proposto (R$)</label>
                    <input
                      type="number"
                      required
                      placeholder="Ex: 450000"
                      value={pProposedValue}
                      onChange={(e) => setPProposedValue(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Data</label>
                    <input
                      type="date"
                      required
                      value={pDate}
                      onChange={(e) => setPDate(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-xs font-bold text-primary uppercase">Status</label>
                    <select
                      value={pStatus}
                      onChange={(e) => setPStatus(e.target.value as any)}
                      className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Em Análise">Em Análise</option>
                      <option value="Aceita">Aceita</option>
                      <option value="Recusada">Recusada</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Próximo Passo / Ação</label>
                  <input
                    type="text"
                    placeholder="Ex: Enviar minuta de contrato"
                    value={pNextAction}
                    onChange={(e) => setPNextAction(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Observações da Proposta</label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Ofereceu permuta parcial com carro ou parcelamento em 10x direto."
                    value={pObservations}
                    onChange={(e) => setPObservations(e.target.value)}
                    className="p-3 border border-outline-variant rounded-lg text-sm resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                  <button
                    type="button"
                    onClick={() => setShowProposalModal(false)}
                    className="px-4 py-2.5 bg-surface-container text-on-surface-variant rounded-xl font-bold text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs shadow-md"
                  >
                    Salvar Proposta
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VISIT EDIT/CREATE MODAL */}
      <AnimatePresence>
        {showVisitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/30 flex flex-col"
            >
              <header className="px-6 py-4 border-b border-outline-variant/40 flex justify-between items-center bg-white">
                <h3 className="font-display font-bold text-title-md text-primary">
                  {editingVisit ? "Editar Visita" : "Agendar Nova Visita"}
                </h3>
                <button onClick={() => setShowVisitModal(false)} className="p-1.5 rounded-full hover:bg-surface-container">
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </header>

              <form onSubmit={handleSaveVisit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto bg-surface-container-lowest">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Cliente</label>
                  <select
                    value={vClientId}
                    onChange={(e) => setVClientId(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                    required
                  >
                    <option value="" disabled>Selecione um cliente...</option>
                    {clients.map(c => (
                      <option key={c.id || c._id} value={c.id || c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Imóvel</label>
                  <select
                    value={vPropertyId}
                    onChange={(e) => setVPropertyId(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                    required
                  >
                    <option value="" disabled>Selecione um imóvel...</option>
                    {properties.map(pr => (
                      <option key={pr.id || pr._id} value={pr.id || pr._id}>{pr.title}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Data</label>
                    <input
                      type="date"
                      required
                      value={vDate}
                      onChange={(e) => setVDate(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Horário</label>
                    <input
                      type="time"
                      required
                      value={vTime}
                      onChange={(e) => setVTime(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Status</label>
                  <select
                    value={vStatus}
                    onChange={(e) => setVStatus(e.target.value as any)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    <option value="Agendada">Agendada</option>
                    <option value="Realizada">Realizada</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Observações da Visita</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Levar chaves do portal de entrada, cliente quer olhar bem a área externa."
                    value={vObservations}
                    onChange={(e) => setVObservations(e.target.value)}
                    className="p-3 border border-outline-variant rounded-lg text-sm resize-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Feedback Pós-Visita (Se houver)</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Cliente gostou do espaço mas quer um com suíte maior."
                    value={vFeedback}
                    onChange={(e) => setVFeedback(e.target.value)}
                    className="p-3 border border-outline-variant rounded-lg text-sm resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                  <button
                    type="button"
                    onClick={() => setShowVisitModal(false)}
                    className="px-4 py-2.5 bg-surface-container text-on-surface-variant rounded-xl font-bold text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs shadow-md"
                  >
                    Salvar Visita
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MONTHLY REPORT EXPORT MODAL */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/30 flex flex-col"
            >
              <header className="px-6 py-4 border-b border-outline-variant/40 flex justify-between items-center bg-white">
                <h3 className="font-display font-bold text-title-md text-primary">
                  Exportar Relatório Mensal
                </h3>
                <button onClick={() => setShowExportModal(false)} className="p-1.5 rounded-full hover:bg-surface-container">
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </header>

              <div className="p-6 space-y-4 bg-surface-container-lowest">
                <p className="text-xs text-on-surface-variant">
                  Selecione o mês e o ano de referência para gerar o relatório consolidado de propostas e visitas em formato PDF.
                </p>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Mês de Referência</label>
                  <select
                    value={exportMonth}
                    onChange={(e) => setExportMonth(parseInt(e.target.value))}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    <option value={0}>Janeiro</option>
                    <option value={1}>Fevereiro</option>
                    <option value={2}>Março</option>
                    <option value={3}>Abril</option>
                    <option value={4}>Maio</option>
                    <option value={5}>Junho</option>
                    <option value={6}>Julho</option>
                    <option value={7}>Agosto</option>
                    <option value={8}>Setembro</option>
                    <option value={9}>Outubro</option>
                    <option value={10}>Novembro</option>
                    <option value={11}>Dezembro</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Ano de Referência</label>
                  <select
                    value={exportYear}
                    onChange={(e) => setExportYear(parseInt(e.target.value))}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(false)}
                    className="px-4 py-2.5 bg-surface-container text-on-surface-variant rounded-xl font-bold text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExportReport}
                    className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 hover:opacity-95"
                  >
                    <FileText className="w-4 h-4" />
                    Gerar PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <GuidedTour
        steps={tourSteps}
        isActive={isTourActive}
        onClose={() => setIsTourActive(false)}
        tourKey="metria_crm_proposals_tour_seen"
      />
    </div>
  );
}
