import React, { useState, useEffect } from "react";
import { Client, User, Task, Proposal, Visit } from "../types";
import { getClientAlerts, getAlertBadgeStyles } from "../utils/alerts";
import { Search, UserPlus, Mail, Phone, Plus, X, Save, Loader2, Check, AlertTriangle, Download } from "lucide-react";
import { exportClientsToCSV } from "../utils/csvExport";

interface ClientsViewProps {
  clients: Client[];
  tasks?: Task[];
  proposals?: Proposal[];
  visits?: Visit[];
  onAddClient: (client: Omit<Client, "id">) => Promise<void>;
  onSelectClient: (client: Client) => void;
  currentUser?: User | null;
}

export default function ClientsView({ 
  clients, 
  tasks = [], 
  proposals = [], 
  visits = [], 
  onAddClient, 
  onSelectClient, 
  currentUser 
}: ClientsViewProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for creating a new client
  const [clientType, setClientType] = useState<"PF" | "PJ">("PF");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [profileType, setProfileType] = useState("Lead");
  const [objective, setObjective] = useState("Venda");
  const [propertyType, setPropertyType] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [observations, setObservations] = useState("");
  const [birthday, setBirthday] = useState("");
  const [address, setAddress] = useState("");

  // New real estate CRM fields
  const [leadSource, setLeadSource] = useState("Outro");
  const [interest, setInterest] = useState("Compra");
  const [budgetRange, setBudgetRange] = useState("");
  const [neighborhoodOfInterest, setNeighborhoodOfInterest] = useState("");
  const [desiredPropertyType, setDesiredPropertyType] = useState("");
  const [temperature, setTemperature] = useState<"Frio" | "Morno" | "Quente">("Morno");
  const [nextAction, setNextAction] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");

  useEffect(() => {
    if (showAddForm && currentUser?.primaryCity) {
      setAddress(currentUser.primaryCity);
    }
  }, [showAddForm, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !phone.trim()) {
      setFormError("Por favor, preencha o nome e o telefone do cliente.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newClient: Omit<Client, "id"> = {
        clientType,
        name: name.trim(),
        phone: phone.trim(),
        document: document.trim(),
        email: email.trim(),
        profileType,
        objective,
        propertyType: propertyType || "Qualquer",
        minBudget: Number(minBudget) || 0,
        maxBudget: Number(maxBudget) || 0,
        observations,
        birthday: birthday && birthday.trim() !== "" ? birthday : undefined,
        address: address && address.trim() !== "" ? address : undefined,
        status: "Novo",
        leadSource,
        interest,
        budgetRange,
        neighborhoodOfInterest,
        desiredPropertyType,
        temperature,
        nextAction,
        nextFollowUpDate: nextFollowUpDate && nextFollowUpDate.trim() !== "" ? nextFollowUpDate : undefined,
        createdAt: new Date().toISOString()
      };

      await onAddClient(newClient);
      
      // Reset form
      setClientType("PF");
      setName("");
      setPhone("");
      setDocument("");
      setEmail("");
      setPropertyType("");
      setMinBudget("");
      setMaxBudget("");
      setObservations("");
      setBirthday("");
      setAddress("");
      setLeadSource("Outro");
      setInterest("Compra");
      setBudgetRange("");
      setNeighborhoodOfInterest("");
      setDesiredPropertyType("");
      setTemperature("Morno");
      setNextAction("");
      setNextFollowUpDate("");
      setShowAddForm(false);
    } catch (err: any) {
      console.error("Failed to save client in ClientsView:", err);
      const errMessage = err?.message || "Ocorreu um erro no servidor ou parâmetros incorretos.";
      setFormError(`Falha ao salvar cliente: ${errMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get visual initials for user avatar
  const getInitials = (fullName: string) => {
    return (fullName || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";
  };

  // Filter clients list
  const filteredClients = clients.filter((c) => {
    let matchesFilter = filter === "Todos";
    if (filter === "Esfriando") {
      const alerts = getClientAlerts(c, tasks, proposals, visits);
      matchesFilter = alerts.length > 0;
    } else if (filter !== "Todos") {
      matchesFilter = c.profileType === filter;
    }
    
    const query = search.toLowerCase();
    const matchesSearch =
      (c.name || "").toLowerCase().includes(query) ||
      (c.phone || "").includes(query) ||
      (c.email || "").toLowerCase().includes(query) ||
      (c.observations || "").toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {!showAddForm ? (
        /* MAIN LISTING SCREEN */
        <>
          {/* Top Search & Filter Bar */}
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Search className="w-5 h-5 stroke-[2]" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone, e-mail ou observações..."
                className="w-full pl-12 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-sm text-on-surface"
              />
            </div>

            {/* Profile Type Filter Chips */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {["Todos", "Esfriando", "Lead", "Comprador", "Vendedor", "Locador", "Locatário", "Investidor"].map((tab) => {
                const isActive = filter === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`px-4 py-2 rounded-full border text-xs font-bold whitespace-nowrap transition-all shadow-sm cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? tab === "Esfriando" ? "bg-red-600 text-white border-red-600" : "bg-primary text-on-primary border-primary"
                        : tab === "Esfriando" ? "bg-red-50 border-red-200 text-red-800 hover:bg-red-100" : "bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {tab === "Esfriando" && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Client List */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
              <span className="font-label-caps text-xs text-on-surface-variant tracking-wider font-bold">LEADS E CLIENTES CADASTRADOS</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-primary font-bold">{filteredClients.length} contatos</span>
                {clients.length > 0 && (
                  <button
                    onClick={() => exportClientsToCSV(filteredClients, true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 rounded-lg font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Exportar contatos filtrados para CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar CSV</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {filteredClients.map((c, idx) => {
                const clientAlerts = getClientAlerts(c, tasks, proposals, visits);
                return (
                  <div
                    key={c.id || c._id || `client-${idx}`}
                    onClick={() => onSelectClient(c)}
                    className="bg-surface-container-lowest p-4 rounded-xl flex items-center gap-4 border border-outline-variant/20 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer group relative overflow-hidden"
                  >
                    {clientAlerts.length > 0 && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                    )}

                    <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-display text-title-md font-bold shadow-inner shrink-0">
                      {getInitials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-display text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate flex items-center gap-1.5">
                          {c.name}
                          {c.clientType === "PJ" ? (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 text-[9px] font-bold rounded">PJ</span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 text-[9px] font-bold rounded">PF</span>
                          )}
                        </h4>
                        <span className="text-[10px] text-on-surface-variant font-mono whitespace-nowrap shrink-0">
                          {new Date(c.createdAt || "").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-on-surface-variant font-semibold mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-secondary" />
                          {c.phone}
                        </span>
                      </div>

                      <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5 mt-2 font-medium">
                        <span className="w-2 h-2 rounded-full bg-secondary"></span>
                        {c.profileType} • {c.objective} ({c.propertyType})
                      </p>

                      {/* Render client-specific commercial routine alerts */}
                      {clientAlerts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {clientAlerts.map(alert => {
                            const badgeStyles = getAlertBadgeStyles(alert.level);
                            return (
                              <span 
                                key={alert.id} 
                                className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md flex items-center gap-1 border border-current ${badgeStyles.bg}`}
                                title={alert.description}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-pulse"></span>
                                {alert.title} ({alert.level})
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empty fallback */}
          {filteredClients.length === 0 && (
            clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-20 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/60 shadow-sm animate-in fade-in duration-300 max-w-2xl mx-auto my-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-inner">
                  <UserPlus className="w-8 h-8 stroke-[1.5]" />
                </div>
                <h3 className="font-display text-xl font-bold text-on-surface tracking-tight">
                  Não perca mais nenhuma oportunidade de venda!
                </h3>
                <p className="text-sm opacity-90 mt-2.5 max-w-md leading-relaxed">
                  O Metria CRM garante que você não perca mais leads, visitas, propostas e follow-ups. Cadastre sua primeira oportunidade agora e mantenha todo o seu funil de negócios sob controle absoluto.
                </p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-6 px-6 py-3 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 hover:shadow-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  Cadastrar lead
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/40 shadow-sm animate-in fade-in duration-200">
                <div className="w-12 h-12 rounded-full bg-on-surface-variant/10 text-on-surface-variant flex items-center justify-center mb-4">
                  <Search className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h3 className="font-display text-base font-bold text-on-surface">
                  Nenhum lead ou cliente encontrado
                </h3>
                <p className="text-xs opacity-80 mt-1 max-w-sm leading-relaxed">
                  Não encontramos correspondência para os filtros ou busca atual. Tente alterar os termos ou limpe a seleção.
                </p>
                <div className="flex gap-2.5 mt-5">
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter("Todos");
                    }}
                    className="px-4 py-2 bg-white hover:bg-surface-container text-primary border border-outline-variant rounded-lg text-xs font-bold transition-all active:scale-[0.97] cursor-pointer shadow-sm"
                  >
                    Limpar filtros
                  </button>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-on-primary rounded-lg text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    Novo lead
                  </button>
                </div>
              </div>
            )
          )}

          {/* Floating Action Button for adding client */}
          <button
            onClick={() => setShowAddForm(true)}
            className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40 cursor-pointer border border-primary-container/20"
          >
            <UserPlus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </>
      ) : (
        /* NOVO CLIENTE FORM SCREEN */
        <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <header className="flex justify-between items-center pb-4 border-b border-outline-variant mb-6">
            <h2 className="font-display text-headline-lg-mobile text-primary">Cadastrar Novo Cliente</h2>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6 text-sm text-left">
            {formError && (
              <div className="p-3.5 bg-error/10 text-error border border-error/20 rounded-xl flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs">Atenção</p>
                  <p className="text-xs">{formError}</p>
                </div>
              </div>
            )}
            {/* Section 1: Personal Info */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                1. Informações do Cliente
              </h3>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface-variant">Tipo de Cliente</label>
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
                <label className="text-xs font-semibold text-on-surface-variant">
                  {clientType === "PJ" ? "Razão Social / Nome Fantasia" : "Nome Completo"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={clientType === "PJ" ? "Ex: Minha Empresa LTDA" : "Ex: João da Silva"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Telefone</label>
                  <input
                    type="tel"
                    required
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">
                    {clientType === "PJ" ? "CNPJ" : "CPF"}
                  </label>
                  <input
                    type="text"
                    placeholder={clientType === "PJ" ? "00.000.000/0001-00" : "000.000.000-00"}
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">E-mail</label>
                  <input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Data de Aniversário</label>
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Endereço Completo</label>
                <input
                  type="text"
                  placeholder="Ex: Av. Atlântica, 1200 - Copacabana, Rio de Janeiro - RJ"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                />
              </div>
            </div>

            {/* Section 2: Profile Type Selection */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                2. Tipo de Perfil
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {["Lead", "Comprador", "Vendedor", "Locador", "Locatário", "Investidor"].map((item) => {
                  const isActive = profileType === item;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setProfileType(item)}
                      className={`py-3 rounded-lg border text-center font-bold text-xs cursor-pointer transition-all ${
                        isActive
                          ? "bg-secondary-container/25 border-secondary text-secondary"
                          : "bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Preferences & Interest */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                3. Interesse Imobiliário e Qualificação de Lead
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Objetivo de Interesse</label>
                  <select
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm outline-none"
                  >
                    <option value="Compra">Compra</option>
                    <option value="Venda">Venda</option>
                    <option value="Locação">Locação</option>
                    <option value="Avaliação">Avaliação</option>
                    <option value="Investimento">Investimento</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Tipo de Imóvel Desejado</label>
                  <input
                    type="text"
                    value={desiredPropertyType}
                    onChange={(e) => setDesiredPropertyType(e.target.value)}
                    placeholder="Ex: Apartamento, Casa de Condomínio"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Bairro de Interesse</label>
                  <input
                    type="text"
                    value={neighborhoodOfInterest}
                    onChange={(e) => setNeighborhoodOfInterest(e.target.value)}
                    placeholder="Ex: Copacabana, Ipanema"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Faixa de Orçamento</label>
                  <input
                    type="text"
                    value={budgetRange}
                    onChange={(e) => setBudgetRange(e.target.value)}
                    placeholder="Ex: R$ 500k - R$ 800k"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Origem do Lead</label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm outline-none"
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
                  <label className="text-xs font-semibold text-on-surface-variant">Temperatura do Lead</label>
                  <select
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value as any)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm outline-none"
                  >
                    <option value="Frio">Frio</option>
                    <option value="Morno">Morno</option>
                    <option value="Quente">Quente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Próxima Ação Planejada</label>
                  <input
                    type="text"
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="Ex: Enviar opções do Jardim Oceânico"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Data do Próximo Follow-up</label>
                  <input
                    type="date"
                    value={nextFollowUpDate}
                    onChange={(e) => setNextFollowUpDate(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Observations */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                4. Observações e Perfil
              </h3>

              <textarea
                rows={4}
                placeholder="Anotações e detalhes adicionais sobre o perfil do cliente, preferências de bairros, se precisa de financiamento, horários de contato preferidos..."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="w-full p-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm resize-none"
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-5 py-3 bg-surface-container-high text-on-surface-variant rounded-xl font-bold font-label-md"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold font-label-md shadow-md hover:opacity-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando Cliente...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Cliente
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      )}

    </div>
  );
}
