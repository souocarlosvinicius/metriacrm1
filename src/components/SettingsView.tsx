import React, { useState } from "react";
import { User, MessageTemplates } from "../types";
import { apiFetch } from "../api";
import { 
  User as UserIcon, 
  Mail, 
  Phone, 
  Award, 
  Building, 
  MapPin, 
  Percent, 
  FolderSync, 
  Tags, 
  MessageSquare, 
  Lock, 
  LogOut, 
  Save, 
  Loader2, 
  Check, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Sparkles,
  Info,
  CreditCard,
  FileText,
  HelpCircle,
  X,
  ExternalLink,
  Database
} from "lucide-react";

interface SettingsViewProps {
  currentUser: User;
  onUpdateSuccess: (updatedUser: User) => void;
  onLogout: () => void;
}

const DEFAULT_STAGES = [
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

const DEFAULT_SOURCES = [
  "Indicação",
  "Instagram",
  "Facebook",
  "OLX",
  "Portal Imobiliário",
  "Placa",
  "WhatsApp",
  "Tráfego Pago",
  "Outro"
];

const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
  primeiroContato: "Olá, {{nome}}! Tudo bem? Aqui é {{corretor}} da {{imobiliaria}}. Vi seu interesse em imóveis e gostaria de entender melhor o que você busca para te enviar as melhores opções.",
  followUp: "Olá, {{nome}}! Passando para saber se você conseguiu avaliar as opções que te enviei. Posso te ajudar com alguma dúvida?",
  confirmacaoVisita: "Olá, {{nome}}! Confirmando nossa visita ao imóvel {{imovel}} no dia {{data}} às {{hora}}. Qualquer imprevisto me avise, estou à disposição.",
  posVisita: "Olá, {{nome}}! O que você achou do imóvel {{imovel}} que visitamos? Posso te passar mais detalhes ou simular uma proposta de financiamento se desejar.",
  proposta: "Olá, {{nome}}! Conforme nossa conversa, preparei a proposta para o imóvel {{imovel}}. Gostaria de alinhar os próximos passos e o envio dos documentos?"
};

export default function SettingsView({ currentUser, onUpdateSuccess, onLogout }: SettingsViewProps) {
  // Navigation tabs for the settings panel
  const [activeSubTab, setActiveSubTab] = useState<"corretor" | "preferencias" | "mensagens" | "conta" | "planos" | "termos" | "suporte">("corretor");

  // 1. Broker states
  const [name, setName] = useState(currentUser.name || "");
  const [email, setEmail] = useState(currentUser.email || "");
  const [phone, setPhone] = useState(currentUser.phone || "");
  const [creci, setCreci] = useState(currentUser.creci || "");
  const [primaryCity, setPrimaryCity] = useState(currentUser.primaryCity || "");
  const [commercialName, setCommercialName] = useState(currentUser.commercialName || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || "");
  const [role, setRole] = useState(currentUser.role || "Consultor Imobiliário");

  // 2. Commercial preferences states
  const [defaultCommissionPercent, setDefaultCommissionPercent] = useState<number>(
    currentUser.defaultCommissionPercent !== undefined ? currentUser.defaultCommissionPercent : 5
  );
  
  // Custom pipeline stages state
  const [pipelineStages, setPipelineStages] = useState<string[]>(
    currentUser.pipelineStages && currentUser.pipelineStages.length > 0
      ? currentUser.pipelineStages
      : DEFAULT_STAGES
  );
  const [newStage, setNewStage] = useState("");

  // Custom lead sources state
  const [leadSources, setLeadSources] = useState<string[]>(
    currentUser.leadSources && currentUser.leadSources.length > 0
      ? currentUser.leadSources
      : DEFAULT_SOURCES
  );
  const [newSource, setNewSource] = useState("");

  // 3. Message template states
  const [templates, setTemplates] = useState<MessageTemplates>({
    primeiroContato: currentUser.messageTemplates?.primeiroContato || DEFAULT_MESSAGE_TEMPLATES.primeiroContato,
    followUp: currentUser.messageTemplates?.followUp || DEFAULT_MESSAGE_TEMPLATES.followUp,
    confirmacaoVisita: currentUser.messageTemplates?.confirmacaoVisita || DEFAULT_MESSAGE_TEMPLATES.confirmacaoVisita,
    posVisita: currentUser.messageTemplates?.posVisita || DEFAULT_MESSAGE_TEMPLATES.posVisita,
    proposta: currentUser.messageTemplates?.proposta || DEFAULT_MESSAGE_TEMPLATES.proposta,
  });

  // 4. Account states
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clearedSchemaFlag, setClearedSchemaFlag] = useState(false);

  const handleClearSchemaFlag = () => {
    localStorage.removeItem("supabase_schema_missing");
    setClearedSchemaFlag(true);
    setTimeout(() => setClearedSchemaFlag(false), 3000);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Subscription Plan States
  const [orgPlan, setOrgPlan] = useState<"beta" | "start" | "pro" | "max" | "pro_max">("beta");
  const [orgName, setOrgName] = useState<string>("");
  const [usageStats, setUsageStats] = useState<{ clients: number; properties: number; members: number }>({ clients: 0, properties: 0, members: 0 });
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [planSuccessMsg, setPlanSuccessMsg] = useState<string | null>(null);
  const [planErrorMsg, setPlanErrorMsg] = useState<string | null>(null);

  const fetchOrgSubscription = async () => {
    const orgId = currentUser.defaultOrganizationId;
    if (!orgId) return;

    setIsPlanLoading(true);
    setPlanErrorMsg(null);
    try {
      // 1. Fetch organization details
      const orgsRes = await apiFetch("/api/organizations");
      if (orgsRes.ok) {
        const orgs = await orgsRes.json();
        const activeOrg = orgs.find((o: any) => o.id === orgId);
        if (activeOrg) {
          setOrgPlan(activeOrg.plan || "beta");
          setOrgName(activeOrg.name || "");
        }
      }

      // 2. Fetch counts
      const [clientsRes, propertiesRes, membersRes] = await Promise.all([
        apiFetch("/api/clients"),
        apiFetch("/api/properties"),
        apiFetch(`/api/organizations/members?organizationId=${orgId}`)
      ]);

      let clientsCount = 0;
      let propertiesCount = 0;
      let membersCount = 0;

      if (clientsRes.ok) {
        const clients = await clientsRes.json();
        clientsCount = Array.isArray(clients) ? clients.length : 0;
      }
      if (propertiesRes.ok) {
        const properties = await propertiesRes.json();
        propertiesCount = Array.isArray(properties) ? properties.length : 0;
      }
      if (membersRes.ok) {
        const members = await membersRes.json();
        membersCount = Array.isArray(members) ? members.length : 0;
      }

      setUsageStats({
        clients: clientsCount,
        properties: propertiesCount,
        members: membersCount
      });
    } catch (err) {
      console.error("Erro ao carregar dados do plano:", err);
    } finally {
      setIsPlanLoading(false);
    }
  };

  const handleSelectPlan = async (targetPlan: "beta" | "start" | "pro" | "max" | "pro_max") => {
    const orgId = currentUser.defaultOrganizationId;
    if (!orgId) {
      setPlanErrorMsg("Você precisa de uma organização ativa para alterar o plano.");
      return;
    }

    setPlanErrorMsg(null);
    setPlanSuccessMsg(null);

    // Downgrade rules validation
    if (targetPlan === "beta") {
      if (usageStats.clients > 10) {
        setPlanErrorMsg(`Não é possível realizar o downgrade para o plano Beta pois sua organização possui ${usageStats.clients} clientes ativos (limite do Beta: 10). Exclua ou arquive pelo menos ${usageStats.clients - 10} clientes para poder alterar o plano.`);
        return;
      }
      if (usageStats.properties > 5) {
        setPlanErrorMsg(`Não é possível realizar o downgrade para o plano Beta pois sua organização possui ${usageStats.properties} imóveis cadastrados (limite do Beta: 5). Remova pelo menos ${usageStats.properties - 5} imóveis para poder alterar o plano.`);
        return;
      }
      if (usageStats.members > 1) {
        setPlanErrorMsg(`Não é possível realizar o downgrade para o plano Beta pois sua organização possui equipe com ${usageStats.members} corretores (limite do Beta: 1 usuário). Desative ou remova os membros da equipe antes de fazer o downgrade.`);
        return;
      }
    }

    if (targetPlan === "start" || targetPlan === "pro") {
      if (usageStats.members > 1) {
        setPlanErrorMsg(`Não é possível alterar para o plano ${targetPlan === "start" ? "Start" : "Pro"} pois sua organização possui equipe com ${usageStats.members} corretores. Estes planos são de usuário único (limite: 1 usuário). Remova ou desative os membros da equipe antes de prosseguir.`);
        return;
      }
    }

    if (targetPlan === "max") {
      if (usageStats.members > 5) {
        setPlanErrorMsg(`Não é possível alterar para o plano Max pois sua organização possui ${usageStats.members} corretores (limite do Max: 5). Remova pelo menos ${usageStats.members - 5} corretores antes de prosseguir.`);
        return;
      }
    }

    if (targetPlan === "pro_max") {
      if (usageStats.members > 30) {
        setPlanErrorMsg(`Não é possível alterar para o plano PRO MAX pois sua organização possui ${usageStats.members} corretores (limite do PRO MAX: 30). Remova pelo menos ${usageStats.members - 30} corretores antes de prosseguir.`);
        return;
      }
    }

    setIsPlanLoading(true);
    try {
      const res = await apiFetch(`/api/organizations/${orgId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao atualizar plano.");
      }

      setPlanSuccessMsg(`Plano alterado com sucesso para ${targetPlan === "beta" ? "Plano Beta" : targetPlan === "start" ? "Plano Start" : targetPlan === "pro" ? "Plano Pro" : targetPlan === "max" ? "Plano Max" : "Plano PRO MAX"}! Os limites foram recalculados.`);
      
      // Update local state
      setOrgPlan(targetPlan);
      
      // Reload usage stats
      await fetchOrgSubscription();

      // Trigger user update to refresh context
      onUpdateSuccess({
        ...currentUser,
      });
    } catch (err: any) {
      setPlanErrorMsg(err.message || "Erro de rede ao atualizar o plano.");
    } finally {
      setIsPlanLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeSubTab === "planos") {
      fetchOrgSubscription();
    }
  }, [activeSubTab]);

  // Handlers for Pipeline Stages
  const handleAddStage = () => {
    if (newStage.trim() && !pipelineStages.includes(newStage.trim())) {
      setPipelineStages([...pipelineStages, newStage.trim()]);
      setNewStage("");
    }
  };

  const handleRemoveStage = (indexToRemove: number) => {
    if (pipelineStages.length <= 2) {
      alert("O pipeline precisa ter pelo menos 2 etapas.");
      return;
    }
    setPipelineStages(pipelineStages.filter((_, idx) => idx !== indexToRemove));
  };

  const moveStage = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= pipelineStages.length) return;
    
    const newStages = [...pipelineStages];
    const temp = newStages[index];
    newStages[index] = newStages[nextIndex];
    newStages[nextIndex] = temp;
    setPipelineStages(newStages);
  };

  // Handlers for Lead Sources
  const handleAddSource = () => {
    if (newSource.trim() && !leadSources.includes(newSource.trim())) {
      setLeadSources([...leadSources, newSource.trim()]);
      setNewSource("");
    }
  };

  const handleRemoveSource = (indexToRemove: number) => {
    if (leadSources.length <= 1) {
      alert("É recomendável manter ao menos 1 origem de lead.");
      return;
    }
    setLeadSources(leadSources.filter((_, idx) => idx !== indexToRemove));
  };

  // Submit all modifications
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSuccess(false);

    // Password validation if filled
    if (password) {
      if (password !== confirmPassword) {
        setErrorMessage("As senhas não coincidem.");
        return;
      }
      if (password.length < 4) {
        setErrorMessage("A nova senha deve ter no mínimo 4 caracteres.");
        return;
      }
    }

    setIsLoading(true);

    try {
      const payload: any = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        creci: creci.trim(),
        primaryCity: primaryCity.trim(),
        commercialName: commercialName.trim(),
        role: role.trim(),
        avatarUrl: avatarUrl.trim(),
        defaultCommissionPercent: Number(defaultCommissionPercent) || 0,
        pipelineStages,
        leadSources,
        messageTemplates: templates,
      };

      if (password) {
        payload.password = password;
      }

      const id = currentUser.id || currentUser._id || currentUser.username || "vega";
      const res = await apiFetch(`/api/auth/update/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao salvar as configurações.");
      }

      onUpdateSuccess(data);
      setIsSuccess(true);
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setIsSuccess(false);
      }, 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro desconhecido ao salvar.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-low rounded-3xl p-6 md:p-8 border border-outline-variant/30 shadow-sm max-w-5xl mx-auto" id="settings-view-root">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-secondary-container text-on-secondary-container px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              Painel de Controle
            </span>
            <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded-full font-bold">
              CRM Metria
            </span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-extrabold text-on-surface mt-2">
            Configurações do Sistema
          </h1>
          <p className="text-sm text-on-surface-variant font-medium mt-1">
            Gerencie seu perfil de corretor, comissões, etapas da esteira de vendas e modelos de WhatsApp.
          </p>
        </div>

        {/* Global Save Button at top */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={isLoading}
            className="flex items-center gap-2 bg-primary hover:opacity-95 disabled:opacity-50 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : isSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-300 animate-bounce" />
                Salvo com Sucesso!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Alert Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-xs font-bold rounded-xl border border-error/20 shadow-sm flex items-start gap-2 animate-in fade-in">
          <Info className="w-4 h-4 text-error mt-0.5 shrink-0" />
          <div>{errorMessage}</div>
        </div>
      )}

      {isSuccess && (
        <div className="mb-6 p-4 bg-emerald-100 text-emerald-900 text-xs font-bold rounded-xl border border-emerald-200 shadow-sm flex items-start gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>Suas configurações foram atualizadas com sucesso e aplicadas em todo o Metria CRM!</div>
        </div>
      )}

      {/* Grid Settings Layout */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Sub-tab Navigation Sidebar */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab("corretor")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeSubTab === "corretor"
                ? "bg-primary text-white shadow-md shadow-primary/10"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <UserIcon className="w-4 h-4" />
            Dados do Corretor
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("preferencias")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeSubTab === "preferencias"
                ? "bg-primary text-white shadow-md shadow-primary/10"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <FolderSync className="w-4 h-4" />
            Preferências Comerciais
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("mensagens")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeSubTab === "mensagens"
                ? "bg-primary text-white shadow-md shadow-primary/10"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Modelos de Mensagem
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("conta")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeSubTab === "conta"
                ? "bg-primary text-white shadow-md shadow-primary/10"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <Lock className="w-4 h-4" />
            Conta & Segurança
          </button>

          <div className="border-t border-outline-variant/30 my-2"></div>

          <button
            type="button"
            onClick={() => setActiveSubTab("planos")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeSubTab === "planos"
                ? "bg-primary text-white shadow-md shadow-primary/10"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Planos de Assinatura
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("termos")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeSubTab === "termos"
                ? "bg-primary text-white shadow-md shadow-primary/10"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <FileText className="w-4 h-4" />
            Termos & Privacidade
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("suporte")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
              activeSubTab === "suporte"
                ? "bg-primary text-white shadow-md shadow-primary/10"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Suporte & Contato
          </button>

          <div className="border-t border-outline-variant/30 my-4"></div>

          {/* Sair da Conta (Logout) button in sidebar */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all text-left cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sair da Conta
          </button>
        </div>

        {/* Settings Form Body Panel */}
        <div className="md:col-span-3 bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            
            {/* SUB-TAB: DADOS DO CORRETOR */}
            {activeSubTab === "corretor" && (
              <div className="space-y-5 animate-in fade-in duration-250">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
                  <UserIcon className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-on-surface text-lg">Dados do Corretor / Perfil</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Nome do Corretor *</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Seu nome completo"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">E-mail Profissional *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ex: corretor@metria.com"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Telefone / WhatsApp *</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="text"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Ex: (11) 99999-9999"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">CRECI nº</label>
                    <div className="relative">
                      <Award className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="text"
                        value={creci}
                        onChange={(e) => setCreci(e.target.value)}
                        placeholder="Ex: 123456-F"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Cidade Principal de Atuação</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="text"
                        value={primaryCity}
                        onChange={(e) => setPrimaryCity(e.target.value)}
                        placeholder="Ex: São Paulo / SP"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <span className="text-[10px] text-on-surface-variant/85 font-medium mt-0.5">
                      Esta cidade será usada como padrão ao cadastrar novos clientes e imóveis.
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Nome Comercial / Imobiliária</label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="text"
                        value={commercialName}
                        onChange={(e) => setCommercialName(e.target.value)}
                        placeholder="Ex: Metria Imóveis"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Cargo / Função</label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="Ex: Corretor Autônomo"
                      className="w-full px-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Foto do Perfil (URL)</label>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="Ex: https://link-da-imagem.com/foto.jpg"
                      className="w-full px-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB: PREFERENCIAS COMERCIAIS */}
            {activeSubTab === "preferencias" && (
              <div className="space-y-6 animate-in fade-in duration-250">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
                  <FolderSync className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-on-surface text-lg">Preferências Comerciais</h3>
                </div>

                {/* Commission Percent */}
                <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="max-w-md">
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-secondary" /> Comissões
                    </h4>
                    <p className="text-xs text-on-surface-variant mt-1 font-medium">
                      Defina o percentual de comissão padrão que você pratica sobre o valor de venda ou locação do imóvel. Ele é utilizado para projeções de faturamento e novas transações automáticas.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={defaultCommissionPercent}
                      onChange={(e) => setDefaultCommissionPercent(Number(e.target.value) || 0)}
                      className="w-24 px-3 h-11 border border-outline-variant rounded-xl bg-white outline-none text-center font-bold text-sm focus:border-primary"
                    />
                    <span className="font-extrabold text-sm text-on-surface">%</span>
                  </div>
                </div>

                {/* Customizable Pipeline Stages */}
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <FolderSync className="w-4 h-4 text-secondary" /> Etapas do Pipeline do Funil
                    </h4>
                    <p className="text-xs text-on-surface-variant mt-1 font-medium">
                      Customize as etapas do seu funil imobiliário. Você pode adicionar, excluir ou mudar a ordem das etapas da sua esteira.
                    </p>
                  </div>

                  {/* Add Stage input */}
                  <div className="flex gap-2 max-w-md">
                    <input
                      type="text"
                      value={newStage}
                      onChange={(e) => setNewStage(e.target.value)}
                      placeholder="Nova etapa (ex: Proposta em análise)"
                      className="flex-1 px-3 h-10 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-xs focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddStage}
                      className="bg-primary hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>

                  {/* Stages List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-2 no-scrollbar border border-outline-variant/20 p-2.5 rounded-2xl bg-surface-container-low/50">
                    {pipelineStages.map((stage, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-outline-variant/30 text-xs shadow-sm hover:border-primary/20 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold font-mono">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-on-surface">{stage}</span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveStage(idx, "up")}
                            className="p-1 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded disabled:opacity-30 cursor-pointer"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pipelineStages.length - 1}
                            onClick={() => moveStage(idx, "down")}
                            className="p-1 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded disabled:opacity-30 cursor-pointer"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStage(idx)}
                            className="p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Customizable Lead Sources */}
                <div className="space-y-3 pt-4 border-t border-outline-variant/25">
                  <div>
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Tags className="w-4 h-4 text-secondary" /> Origens de Lead Personalizadas
                    </h4>
                    <p className="text-xs text-on-surface-variant mt-1 font-medium">
                      Configure os canais de entrada de leads e clientes (ex: Instagram, Portal ZAP, Indicação, etc) para analisar de onde vêm seus melhores negócios.
                    </p>
                  </div>

                  {/* Add Lead Source input */}
                  <div className="flex gap-2 max-w-md">
                    <input
                      type="text"
                      value={newSource}
                      onChange={(e) => setNewSource(e.target.value)}
                      placeholder="Nova origem de lead (ex: Portal ZAP)"
                      className="flex-1 px-3 h-10 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-xs focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddSource}
                      className="bg-primary hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>

                  {/* Lead Sources Grid */}
                  <div className="flex flex-wrap gap-2 p-3 border border-outline-variant/20 rounded-2xl bg-surface-container-low/50">
                    {leadSources.map((source, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1.5 bg-white border border-outline-variant/30 px-3 py-1.5 rounded-full text-xs font-semibold text-on-surface shadow-sm"
                      >
                        {source}
                        <button
                          type="button"
                          onClick={() => handleRemoveSource(idx)}
                          className="w-4 h-4 rounded-full bg-surface-container hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-all cursor-pointer text-[10px]"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB: MODELOS DE MENSAGEM */}
            {activeSubTab === "mensagens" && (
              <div className="space-y-6 animate-in fade-in duration-250">
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <h3 className="font-display font-bold text-on-surface text-lg">Modelos de Mensagem do WhatsApp</h3>
                  </div>
                </div>

                {/* Placeholders Help Box */}
                <div className="p-4 bg-emerald-50 text-emerald-950 rounded-2xl border border-emerald-100/50 text-xs shadow-sm flex items-start gap-3">
                  <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1 font-medium text-emerald-900">
                    <p className="font-extrabold text-[12px] text-emerald-950">Tags Dinâmicas Disponíveis</p>
                    <p>Você pode usar as seguintes variáveis para que o CRM substitua dinamicamente ao enviar uma mensagem:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-emerald-200/55 font-mono text-[10.5px]">
                      <div><strong className="text-emerald-950">{"{{nome}}"}</strong>: Nome do cliente</div>
                      <div><strong className="text-emerald-950">{"{{corretor}}"}</strong>: Seu nome</div>
                      <div><strong className="text-emerald-950">{"{{imobiliaria}}"}</strong>: Nome comercial</div>
                      <div><strong className="text-emerald-950">{"{{imovel}}"}</strong>: Título do imóvel</div>
                      <div><strong className="text-emerald-950">{"{{data}}"}</strong>: Data agendada</div>
                      <div><strong className="text-emerald-950">{"{{hora}}"}</strong>: Horário</div>
                    </div>
                  </div>
                </div>

                {/* Templates Forms */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Primeiro Contato
                    </label>
                    <textarea
                      rows={3}
                      value={templates.primeiroContato || ""}
                      onChange={(e) => setTemplates({ ...templates, primeiroContato: e.target.value })}
                      placeholder="Mensagem de primeiro contato..."
                      className="w-full p-3.5 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-xs focus:border-primary leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Follow-up (Cobrança/Retorno)
                    </label>
                    <textarea
                      rows={3}
                      value={templates.followUp || ""}
                      onChange={(e) => setTemplates({ ...templates, followUp: e.target.value })}
                      placeholder="Mensagem de follow-up..."
                      className="w-full p-3.5 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-xs focus:border-primary leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> Confirmação de Visita
                    </label>
                    <textarea
                      rows={3}
                      value={templates.confirmacaoVisita || ""}
                      onChange={(e) => setTemplates({ ...templates, confirmacaoVisita: e.target.value })}
                      placeholder="Mensagem de confirmação de visita..."
                      className="w-full p-3.5 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-xs focus:border-primary leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-500"></span> Pós-visita (Enviar Imóvel / Retorno)
                    </label>
                    <textarea
                      rows={3}
                      value={templates.posVisita || ""}
                      onChange={(e) => setTemplates({ ...templates, posVisita: e.target.value })}
                      placeholder="Mensagem de pós-visita..."
                      className="w-full p-3.5 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-xs focus:border-primary leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-secondary"></span> Proposta (Enviar ou Alinhar Proposta)
                    </label>
                    <textarea
                      rows={3}
                      value={templates.proposta || ""}
                      onChange={(e) => setTemplates({ ...templates, proposta: e.target.value })}
                      placeholder="Mensagem de proposta..."
                      className="w-full p-3.5 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-xs focus:border-primary leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB: CONTA E SEGURANCA */}
            {activeSubTab === "conta" && (
              <div className="space-y-5 animate-in fade-in duration-250">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
                  <Lock className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-on-surface text-lg">Alterar Senha de Acesso</h3>
                </div>

                <div className="p-4 bg-amber-50 text-amber-950 rounded-2xl border border-amber-100/40 text-xs shadow-sm flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="font-medium text-amber-900">
                    Se você deseja manter a mesma senha de acesso, basta deixar os campos abaixo vazios.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Nova Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 4 caracteres"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Confirmar Nova Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/55" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirme a nova senha"
                        className="w-full pl-9 pr-3 h-11 border border-outline-variant rounded-xl bg-surface-container-lowest outline-none text-sm focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-outline-variant/20 my-6 pt-6">
                  <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" />
                    Sincronização e Banco de Dados
                  </h4>
                  <p className="text-xs text-on-surface-variant mb-4 font-medium">
                    O Metria CRM possui um modo offline inteligente que é acionado se o banco de dados do Supabase estiver com tabelas pendentes. Se você já resolveu a estrutura no Supabase, limpe o cache abaixo para forçar o sistema a tentar se conectar novamente.
                  </p>
                  <div className="flex flex-wrap gap-3 items-center">
                    <button
                      type="button"
                      onClick={handleClearSchemaFlag}
                      className="flex items-center gap-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-sm cursor-pointer border border-outline-variant/30 active:scale-95"
                    >
                      <Database className="w-4 h-4 text-primary" />
                      Limpar Cache de Instabilidade (Forçar Online)
                    </button>
                    {clearedSchemaFlag && (
                      <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-bounce">
                        <Check className="w-4 h-4" /> Cache Limpo! Atualize a página (F5) para reconectar.
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-outline-variant/20 my-6 pt-6">
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Desconexão da Conta</h4>
                  <p className="text-xs text-on-surface-variant mb-4 font-medium">
                    Ao sair, sua sessão será encerrada e você precisará entrar novamente com seu usuário e senha.
                  </p>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair da Conta (Logout)
                  </button>
                </div>
              </div>
            )}

            {/* SUB-TAB: PLANOS DE ASSINATURA */}
            {activeSubTab === "planos" && (
              <div className="space-y-6 animate-in fade-in duration-250">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <h3 className="font-display font-bold text-on-surface text-lg">Meu Plano e Assinatura</h3>
                    <p className="text-xs text-on-surface-variant font-medium mt-0.5">Gerencie seu plano de assinatura, consulte consumos de limite e simule upgrades ou downgrades instantâneos para fins de demonstração.</p>
                  </div>
                  <span className="text-[10px] bg-primary/10 text-primary px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                    Ambiente de Testes Ativo
                  </span>
                </div>

                {/* Status Messages */}
                {planSuccessMsg && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>{planSuccessMsg}</div>
                  </div>
                )}

                {planErrorMsg && (
                  <div className="p-4 bg-error/5 border border-error/20 text-error text-xs rounded-2xl flex items-start gap-3">
                    <X className="w-4 h-4 text-error shrink-0 mt-0.5" />
                    <div>{planErrorMsg}</div>
                  </div>
                )}

                {/* CURRENT PLAN & USAGE METRICS PANEL */}
                <div className="bg-surface-container-low border border-outline-variant/20 rounded-3xl p-6 space-y-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-outline-variant/10 pb-4">
                    <div>
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Plano Atual da Organização</span>
                      <h4 className="font-display text-xl font-bold text-on-surface mt-0.5 flex items-center gap-2.5">
                        {orgPlan === "beta" && "Plano Beta (Fase de Testes)"}
                        {orgPlan === "start" && "Plano Start"}
                        {orgPlan === "pro" && "Plano Pro (IA Integrada)"}
                        {orgPlan === "max" && "Plano Max (Imobiliária & Equipe)"}
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">Ativo</span>
                      </h4>
                      <p className="text-xs text-on-surface-variant font-medium mt-0.5">Organização: <span className="text-primary font-bold">{orgName || "Carregando..."}</span></p>
                    </div>

                    <div className="bg-surface-container-high px-4 py-2.5 rounded-2xl border border-outline-variant/20 text-right">
                      <span className="text-[10px] text-on-surface-variant block uppercase font-bold tracking-wider">Valor de Assinatura</span>
                      <strong className="text-sm text-primary block mt-0.5">
                        {orgPlan === "beta" && "R$ 0/mês"}
                        {orgPlan === "start" && "R$ 39,90/mês"}
                        {orgPlan === "pro" && "R$ 79,90/mês"}
                        {orgPlan === "max" && "R$ 149,90/mês"}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold text-on-surface mb-3 uppercase tracking-wide">Consumo de Recursos em Tempo Real</h5>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {/* Leads Limit Card */}
                      <div className="bg-surface-container-lowest border border-outline-variant/25 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-on-surface-variant">Leads / Clientes Ativos</span>
                          <span className="font-bold text-primary">
                            {usageStats.clients} / {orgPlan === "beta" ? 10 : "Ilimitado"}
                          </span>
                        </div>
                        {orgPlan === "beta" ? (
                          <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${usageStats.clients >= 10 ? "bg-error" : usageStats.clients >= 8 ? "bg-amber-500" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, (usageStats.clients / 10) * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <div className="h-2 w-full bg-emerald-500/20 rounded-full overflow-hidden">
                            <div className="h-full w-full bg-emerald-500 rounded-full" />
                          </div>
                        )}
                        <span className="text-[10px] text-on-surface-variant block leading-tight font-medium">
                          {orgPlan === "beta" ? "Limite de 10 leads ativos no plano Beta." : "Leads e Clientes ilimitados liberados!"}
                        </span>
                      </div>

                      {/* Properties Limit Card */}
                      <div className="bg-surface-container-lowest border border-outline-variant/25 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-on-surface-variant">Imóveis Cadastrados</span>
                          <span className="font-bold text-primary">
                            {usageStats.properties} / {orgPlan === "beta" ? 5 : "Ilimitado"}
                          </span>
                        </div>
                        {orgPlan === "beta" ? (
                          <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${usageStats.properties >= 5 ? "bg-error" : usageStats.properties >= 4 ? "bg-amber-500" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, (usageStats.properties / 5) * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <div className="h-2 w-full bg-emerald-500/20 rounded-full overflow-hidden">
                            <div className="h-full w-full bg-emerald-500 rounded-full" />
                          </div>
                        )}
                        <span className="text-[10px] text-on-surface-variant block leading-tight font-medium">
                          {orgPlan === "beta" ? "Limite de 5 imóveis cadastrados no plano Beta." : "Imóveis e propriedades ilimitados liberados!"}
                        </span>
                      </div>

                      {/* Team Members Limit Card */}
                      <div className="bg-surface-container-lowest border border-outline-variant/25 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-on-surface-variant">Corretores / Equipe</span>
                          <span className="font-bold text-primary">
                            {usageStats.members} / {orgPlan === "pro_max" ? 30 : orgPlan === "max" ? 5 : 1}
                          </span>
                        </div>
                        {orgPlan === "max" || orgPlan === "pro_max" ? (
                          <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${usageStats.members >= (orgPlan === "pro_max" ? 30 : 5) ? "bg-error" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, (usageStats.members / (orgPlan === "pro_max" ? 30 : 5)) * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: "100%" }} />
                          </div>
                        )}
                        <span className="text-[10px] text-on-surface-variant block leading-tight font-medium">
                          {orgPlan === "pro_max" ? "Limite de até 30 corretores na equipe." : orgPlan === "max" ? "Limite de até 5 corretores na equipe." : "Usuário único. Upgrade para Max ou PRO MAX para gerenciar equipe."}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PLAN MATRIX */}
                <h4 className="font-display text-sm font-bold text-on-surface pt-2">Selecione outro plano para Simular ou Contratar</h4>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  {/* Plan 1: Beta */}
                  <div className={`bg-surface-container-lowest border rounded-2xl p-4.5 flex flex-col justify-between transition-all ${orgPlan === "beta" ? "border-primary ring-2 ring-primary/20" : "border-outline-variant/30 hover:border-primary/40"}`}>
                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <span className="text-[8px] bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Testes</span>
                        <h5 className="font-display text-sm font-bold text-on-surface">Plano Beta</h5>
                        <p className="text-[10px] text-on-surface-variant leading-relaxed">Ideal para testar a interface e iniciar organização básica.</p>
                      </div>
                      <div>
                        <span className="text-xl font-extrabold text-on-surface font-sans">R$ 0</span>
                        <span className="text-[10px] text-on-surface-variant font-medium"> /mês</span>
                      </div>
                      <div className="border-t border-outline-variant/15 pt-3.5 space-y-1.5 text-[11px] text-on-surface-variant">
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> 10 leads ativos</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> 5 imóveis cadastrados</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Kanban simplificado</div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant/40"><X className="w-3 h-3 shrink-0" /> Sem Inteligência Gemini</div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant/40"><X className="w-3 h-3 shrink-0" /> Sem equipe/corretores</div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isPlanLoading}
                      onClick={() => handleSelectPlan("beta")}
                      className={`w-full mt-5 py-2 text-xs font-bold rounded-xl transition-all ${
                        orgPlan === "beta" 
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default" 
                          : "bg-surface-container-high hover:bg-surface-container-highest text-on-surface cursor-pointer"
                      }`}
                    >
                      {orgPlan === "beta" ? "Plano Ativo" : "Ativar Plano"}
                    </button>
                  </div>

                  {/* Plan 2: Start */}
                  <div className={`bg-surface-container-lowest border rounded-2xl p-4.5 flex flex-col justify-between transition-all ${orgPlan === "start" ? "border-primary ring-2 ring-primary/20" : "border-outline-variant/30 hover:border-primary/40"}`}>
                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Profissional</span>
                        <h5 className="font-display text-sm font-bold text-on-surface">Plano Start</h5>
                        <p className="text-[10px] text-on-surface-variant leading-relaxed">Essencial para o corretor independente organizar fechamentos.</p>
                      </div>
                      <div>
                        <span className="text-xl font-extrabold text-on-surface font-sans">R$ 39,90</span>
                        <span className="text-[10px] text-on-surface-variant font-medium"> /mês</span>
                      </div>
                      <div className="border-t border-outline-variant/15 pt-3.5 space-y-1.5 text-[11px] text-on-surface-variant">
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Leads ilimitados</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Imóveis ilimitados</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> WhatsApp integrado</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Agenda e tarefas</div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant/40"><X className="w-3 h-3 shrink-0" /> Sem Inteligência Gemini</div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isPlanLoading}
                      onClick={() => handleSelectPlan("start")}
                      className={`w-full mt-5 py-2 text-xs font-bold rounded-xl transition-all ${
                        orgPlan === "start" 
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default" 
                          : "bg-surface-container-high hover:bg-surface-container-highest text-on-surface cursor-pointer"
                      }`}
                    >
                      {orgPlan === "start" ? "Plano Ativo" : "Ativar Plano"}
                    </button>
                  </div>

                  {/* Plan 3: Pro */}
                  <div className={`bg-white border-2 rounded-2xl p-4.5 flex flex-col justify-between transition-all relative ${orgPlan === "pro" ? "border-primary shadow-lg shadow-primary/5" : "border-outline-variant/35 hover:border-primary/45"}`}>
                    <div className="absolute top-0 right-0 bg-primary text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                      Recomendado
                    </div>
                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Inteligência Artificial</span>
                        <h5 className="font-display text-sm font-bold text-on-surface">Plano Pro</h5>
                        <p className="text-[10px] text-on-surface-variant leading-relaxed">Acelere vendas com IA Gemini avançada e cruzamento de dados.</p>
                      </div>
                      <div>
                        <span className="text-xl font-extrabold text-primary font-sans">R$ 79,90</span>
                        <span className="text-[10px] text-on-surface-variant font-medium"> /mês</span>
                      </div>
                      <div className="border-t border-outline-variant/15 pt-3.5 space-y-1.5 text-[11px] text-on-surface-variant">
                        <div className="flex items-center gap-1.5 font-bold text-primary"><Sparkles className="w-3.5 h-3.5 text-primary shrink-0" /> IA Gemini Integrada</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Cruzamento Inteligente</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Leads e Imóveis ilimitados</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Relatórios financeiros</div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant/40"><X className="w-3 h-3 shrink-0" /> Usuário único (sem equipe)</div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isPlanLoading}
                      onClick={() => handleSelectPlan("pro")}
                      className={`w-full mt-5 py-2 text-xs font-bold rounded-xl transition-all ${
                        orgPlan === "pro" 
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default" 
                          : "bg-primary hover:bg-primary/95 text-white shadow-sm cursor-pointer"
                      }`}
                    >
                      {orgPlan === "pro" ? "Plano Ativo" : "Ativar Plano"}
                    </button>
                  </div>

                  {/* Plan 4: Max */}
                  <div className={`bg-surface-container-lowest border rounded-2xl p-4.5 flex flex-col justify-between transition-all ${orgPlan === "max" ? "border-primary ring-2 ring-primary/20" : "border-outline-variant/30 hover:border-primary/40"}`}>
                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <span className="text-[8px] bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Multi-usuário</span>
                        <h5 className="font-display text-sm font-bold text-on-surface">Plano Max</h5>
                        <p className="text-[10px] text-on-surface-variant leading-relaxed">Para imobiliárias e gerentes expandirem com equipe unificada.</p>
                      </div>
                      <div>
                        <span className="text-xl font-extrabold text-on-surface font-sans">R$ 149,90</span>
                        <span className="text-[10px] text-on-surface-variant font-medium"> /mês</span>
                      </div>
                      <div className="border-t border-outline-variant/15 pt-3.5 space-y-1.5 text-[11px] text-on-surface-variant">
                        <div className="flex items-center gap-1.5 font-bold text-primary"><Check className="w-3.5 h-3.5 text-primary shrink-0" /> Até 5 Corretores inclusos</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Painel de Controle Gestor</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Distribuição inteligente</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Relatórios por corretor</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> IA Gemini e cruzamentos</div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isPlanLoading}
                      onClick={() => handleSelectPlan("max")}
                      className={`w-full mt-5 py-2 text-xs font-bold rounded-xl transition-all ${
                        orgPlan === "max" 
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default" 
                          : "bg-surface-container-high hover:bg-surface-container-highest text-on-surface cursor-pointer"
                      }`}
                    >
                      {orgPlan === "max" ? "Plano Ativo" : "Ativar Plano"}
                    </button>
                  </div>

                  {/* Plan 5: PRO MAX */}
                  <div className={`bg-slate-900 text-white border-2 rounded-2xl p-4.5 flex flex-col justify-between transition-all relative ${orgPlan === "pro_max" ? "border-amber-400 ring-2 ring-amber-400/20" : "border-slate-800 hover:border-amber-400/50"}`}>
                    <div className="absolute top-0 right-0 bg-amber-400 text-slate-950 text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                      Empresarial Elite
                    </div>
                    <div className="space-y-3.5 flex flex-col h-full justify-between">
                      <div className="space-y-1">
                        <span className="text-[8px] bg-amber-400/20 text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">PRO MAX</span>
                        <h5 className="font-display text-sm font-bold text-white">Plano PRO MAX</h5>
                        <p className="text-[10px] text-slate-400 leading-relaxed">Estrutura completa corporativa para grandes imobiliárias e redes.</p>
                      </div>
                      <div>
                        <span className="text-xl font-extrabold text-amber-400 font-sans">R$ 999,00</span>
                        <span className="text-[10px] text-slate-400 font-medium"> /mês</span>
                      </div>
                      <div className="border-t border-slate-800 pt-3.5 space-y-1.5 text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5 font-bold text-amber-400"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Até 30 Corretores inclusos</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Múltiplos Gestores / Admins</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Painel de Gestão Avançado</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Relatórios Avançados & BI</div>
                        <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> IA Gemini e Distribuição</div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isPlanLoading}
                      onClick={() => handleSelectPlan("pro_max")}
                      className={`w-full mt-5 py-2 text-xs font-bold rounded-xl transition-all ${
                        orgPlan === "pro_max" 
                          ? "bg-emerald-500 text-white cursor-default" 
                          : "bg-amber-400 hover:bg-amber-500 text-slate-950 cursor-pointer"
                      }`}
                    >
                      {orgPlan === "pro_max" ? "Plano Ativo" : "Ativar Plano"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB: TERMOS E PRIVACIDADE */}
            {activeSubTab === "termos" && (
              <div className="space-y-5 animate-in fade-in duration-250">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-display font-bold text-on-surface text-lg">Termos de Uso e Política de Privacidade</h3>
                    <p className="text-xs text-on-surface-variant font-medium mt-0.5">Segurança jurídica e conformidade total com a LGPD no Metria CRM.</p>
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5 space-y-4 max-h-[480px] overflow-y-auto leading-relaxed text-xs text-on-surface-variant">
                  <div className="space-y-2">
                    <h4 className="font-display text-sm font-extrabold text-on-surface">1. Política de Privacidade (Conformidade LGPD)</h4>
                    <p>
                      No <strong>Metria CRM</strong>, levamos a privacidade dos seus dados e dos dados dos seus clientes extremamente a sério. Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD), declaramos que:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Isolamento de Dados:</strong> Cada conta de corretor possui isolamento lógico completo no banco de dados. Seus leads, transações, contatos e conversas não podem ser vistos ou acessados por terceiros.</li>
                      <li><strong>Coleta Finalística:</strong> As informações cadastrais de leads (como telefone, e-mail e orçamento) são coletadas exclusivamente para que você possa desempenhar sua atividade de corretagem imobiliária.</li>
                      <li><strong>Não Compartilhamento:</strong> O Metria CRM não comercializa, aluga ou cede nenhuma informação armazenada em nossa plataforma a empresas de publicidade ou terceiros.</li>
                      <li><strong>Criptografia e Proteção:</strong> Suas credenciais de acesso são criptografadas antes do armazenamento usando bcrypt, garantindo que as senhas fiquem ilegíveis até mesmo para nossos administradores de infraestrutura.</li>
                    </ul>
                  </div>

                  <div className="border-t border-outline-variant/15 my-4 pt-4 space-y-2">
                    <h4 className="font-display text-sm font-extrabold text-on-surface">2. Termos e Condições de Uso do Software</h4>
                    <p>
                      Ao acessar ou utilizar a plataforma <strong>Metria CRM</strong>, você aceita de forma tácita e integral as seguintes cláusulas:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Responsabilidade pelas Informações:</strong> O corretor usuário é o único responsável pela veracidade e licitude dos dados de imóveis e leads cadastrados em sua conta.</li>
                      <li><strong>Uso Autorizado do WhatsApp:</strong> Os disparos de WhatsApp realizados através dos atalhos de template do sistema abrem o cliente oficial do WhatsApp no seu navegador ou celular. O Metria CRM não se responsabiliza por eventuais bloqueios caso o corretor abuse da ferramenta realizando envios de spam.</li>
                      <li><strong>Disponibilidade do Serviço (Fase Beta):</strong> Por se tratar de uma versão Beta Comercial (fase de validação), manutenções pontuais na infraestrutura podem ocorrer. Garantimos empenho técnico para um uptime superior a 99% e backups seguros contra perda de dados.</li>
                      <li><strong>Encerramento de Conta:</strong> O usuário é livre para excluir sua conta ou exportar seus relatórios a qualquer momento, o que acarretará na remoção permanente e irrecuperável dos seus dados de nosso servidor após 30 dias de carência.</li>
                    </ul>
                  </div>

                  <div className="bg-surface-container px-4 py-3 rounded-xl border border-outline-variant/20 mt-4 text-[11px] font-medium flex items-center justify-between">
                    <span>Última atualização: 30 de Junho de 2026.</span>
                    <span className="text-primary font-bold">Metria CRM Jurídico</span>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB: SUPORTE E CONTATO */}
            {activeSubTab === "suporte" && (
              <div className="space-y-6 animate-in fade-in duration-250">
                <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-display font-bold text-on-surface text-lg">Central de Suporte Metria CRM</h3>
                    <p className="text-xs text-on-surface-variant font-medium mt-0.5">Fale diretamente com os desenvolvedores e fundadores da plataforma.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Direct channels */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Canais Oficiais de Atendimento</h4>
                    
                    <div className="p-4 bg-surface-container-low border border-outline-variant/30 rounded-2xl space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                          <Phone className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-on-surface">WhatsApp de Suporte Rápido</h5>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">Fale com nossa equipe técnica de suporte a qualquer hora para tirar dúvidas ou relatar bugs.</p>
                          <a 
                            href="https://wa.me/5511999999999?text=Ol%C3%A1%21+Sou+corretor+parceiro+do+Metria+CRM+e+gostaria+de+suporte+técnico." 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mt-2"
                          >
                            Abrir WhatsApp do Suporte
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 border-t border-outline-variant/15 pt-4">
                        <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                          <Mail className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-on-surface font-display">E-mail Corporativo</h5>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">Envie propostas de parceria comercial, feedbacks detalhados ou solicitação de customizações.</p>
                          <a 
                            href="mailto:suporte@metriacrm.com.br" 
                            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline mt-1.5"
                          >
                            suporte@metriacrm.com.br
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20 text-xs text-on-surface-variant">
                      <div className="font-bold text-primary flex items-center gap-1.5 mb-1">
                        <Sparkles className="w-4 h-4 animate-pulse" />
                        Atendimento Beta VIP
                      </div>
                      <p className="leading-relaxed">
                        Durante a nossa fase de lançamento comercial inicial (Beta), todos os corretores parceiros cadastrados contam com atendimento prioritário exclusivo e assessoria direta na importação de carteiras antigas. Conte conosco!
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Ticket mock form */}
                  <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-5 space-y-4">
                    <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">Enviar Chamado Rápido</h4>
                    
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase">Assunto do Chamado</label>
                        <select className="w-full px-3 h-10 border border-outline-variant rounded-xl bg-white text-xs outline-none focus:border-primary">
                          <option>Dúvida sobre planos de assinatura</option>
                          <option>Sugestão de melhoria ou recurso</option>
                          <option>Problemas técnicos ou bug no sistema</option>
                          <option>Importação de base antiga de leads</option>
                          <option>Outro assunto</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase">Mensagem Detalhada</label>
                        <textarea 
                          rows={4} 
                          placeholder="Descreva aqui sua solicitação com o máximo de detalhes possível..."
                          className="w-full p-3 border border-outline-variant rounded-xl bg-white text-xs outline-none focus:border-primary resize-none leading-relaxed"
                        />
                      </div>

                      <button 
                        type="button" 
                        onClick={() => alert("Sua mensagem foi enviada com sucesso! Um desenvolvedor fundador do Metria CRM entrará em contato com você via e-mail ou WhatsApp nas próximas horas.")}
                        className="w-full py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        Enviar Chamado para Desenvolvimento
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Form Actions */}
            {!["planos", "termos", "suporte"].includes(activeSubTab) && (
              <div className="border-t border-outline-variant/20 pt-5 flex justify-end gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-primary hover:opacity-95 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : isSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300 animate-bounce" />
                      Atualizado!
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Salvar Alterações
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
