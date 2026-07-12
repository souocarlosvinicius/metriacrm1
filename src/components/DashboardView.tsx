import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Property, Client, Task, DBStatus, User, Proposal, Visit } from "../types";
import { apiFetch } from "../api";
import { getClientAlerts, getAlertBadgeStyles, Alert } from "../utils/alerts";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";
import { 
  Home, 
  Users, 
  DollarSign, 
  Calendar, 
  MapPin, 
  Sparkles, 
  Loader2, 
  Plus, 
  Check, 
  CheckCircle, 
  CheckCircle2, 
  Server, 
  Database, 
  Brain, 
  Cake, 
  Gift,
  CheckSquare,
  ArrowRight,
  Clock,
  MessageSquare,
  AlertCircle,
  AlertTriangle,
  Flame,
  TrendingDown,
  RefreshCw,
  PhoneCall,
  User as UserIcon,
  Sparkle,
  Pencil,
  Settings,
  X
} from "lucide-react";

interface DashboardViewProps {
  properties: Property[];
  clients: Client[];
  tasks: Task[];
  proposals?: Proposal[];
  visits?: Visit[];
  dbStatus: DBStatus | null;
  currentUser?: User | null;
  onAddTask: (task: Omit<Task, "id">) => Promise<void>;
  onNavigateToTab: (tab: string) => void;
  onPrefillClientForTask?: (client: Client) => void;
  onToggleTaskCompletion?: (id: string, completed: boolean) => Promise<void>;
  onDeleteTask?: (id: string) => Promise<void>;
  onSelectClient?: (client: Client) => void;
}

export default function DashboardView({ 
  properties = [], 
  clients = [], 
  tasks = [], 
  proposals = [],
  visits = [],
  dbStatus, 
  currentUser, 
  onAddTask, 
  onNavigateToTab,
  onPrefillClientForTask,
  onToggleTaskCompletion,
  onDeleteTask,
  onSelectClient
}: DashboardViewProps) {
  const [isGeneratingAiTasks, setIsGeneratingAiTasks] = useState(false);
  const [suggestedAiTasks, setSuggestedAiTasks] = useState<Task[]>([]);
  const [aiTasksAdded, setAiTasksAdded] = useState<Record<number, boolean>>({});

  const [currentPlan, setCurrentPlan] = useState<"beta" | "start" | "pro" | "max">("beta");
  const [orgName, setOrgName] = useState<string>("");

  useEffect(() => {
    const fetchOrgPlan = async () => {
      const orgId = currentUser?.defaultOrganizationId;
      if (!orgId) return;
      try {
        const res = await apiFetch("/api/organizations");
        if (res.ok) {
          const orgs = await res.json();
          const activeOrg = orgs.find((o: any) => o.id === orgId);
          if (activeOrg) {
            setCurrentPlan(activeOrg.plan || "beta");
            setOrgName(activeOrg.name || "");
          }
        }
      } catch (err) {
        console.error("Erro ao carregar plano no dashboard:", err);
      }
    };
    fetchOrgPlan();
  }, [currentUser]);

  // Dynamic Goal Tracking States & Storage
  const [goalPeriod, setGoalPeriod] = useState<"mensal" | "semestral" | "anual">("mensal");
  const [goals, setGoals] = useState(() => {
    try {
      const saved = localStorage.getItem("metria_crm_goals");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error loading goals from localStorage:", e);
    }
    return {
      mensal: 3000000,
      semestral: 18000000,
      anual: 36000000
    };
  });
  
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState("");

  const saveGoals = (newGoals: typeof goals) => {
    setGoals(newGoals);
    localStorage.setItem("metria_crm_goals", JSON.stringify(newGoals));
  };

  const handleStartEditGoal = () => {
    setTempGoalInput(goals[goalPeriod].toString());
    setIsEditingGoal(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = tempGoalInput.replace(/[^\d]/g, "");
    const val = Number(cleanNum);
    if (isNaN(val) || val <= 0) {
      alert("Por favor, insira um valor válido maior que zero.");
      return;
    }
    const updated = { ...goals, [goalPeriod]: val };
    saveGoals(updated);
    setIsEditingGoal(false);
  };

  // State and Handlers for the Goals Configuration Panel
  const [showGoalConfigPanel, setShowGoalConfigPanel] = useState(false);
  const [configGoalMensal, setConfigGoalMensal] = useState("");
  const [configGoalSemestral, setConfigGoalSemestral] = useState("");
  const [configGoalAnual, setConfigGoalAnual] = useState("");

  const handleOpenGoalConfig = () => {
    setConfigGoalMensal(goals.mensal.toString());
    setConfigGoalSemestral(goals.semestral.toString());
    setConfigGoalAnual(goals.anual.toString());
    setShowGoalConfigPanel(true);
  };

  const handleSaveAllGoals = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMensal = Number(configGoalMensal.replace(/[^\d]/g, ""));
    const cleanSemestral = Number(configGoalSemestral.replace(/[^\d]/g, ""));
    const cleanAnual = Number(configGoalAnual.replace(/[^\d]/g, ""));

    if (isNaN(cleanMensal) || cleanMensal <= 0 ||
        isNaN(cleanSemestral) || cleanSemestral <= 0 ||
        isNaN(cleanAnual) || cleanAnual <= 0) {
      alert("Por favor, insira valores válidos maiores que zero para todas as metas.");
      return;
    }

    const updated = {
      mensal: cleanMensal,
      semestral: cleanSemestral,
      anual: cleanAnual
    };

    saveGoals(updated);
    setShowGoalConfigPanel(false);
  };

  const formatCompactBRL = (val: number) => {
    if (val >= 1000000) {
      return `R$ ${(val / 1000000).toFixed(1).replace(".", ",")}M`;
    }
    if (val >= 1000) {
      return `R$ ${(val / 1000).toFixed(0)}K`;
    }
    return `R$ ${val.toLocaleString("pt-BR")}`;
  };

  // Dynamically calculate closed VGV from clients list with proper fallbacks
  const getClosedVgv = (period: "mensal" | "semestral" | "anual") => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    let sum = 0;
    let foundRealClosed = false;

    if (clients && clients.length > 0) {
      clients.forEach(c => {
        if (c.pipelineStatus === "Fechado") {
          const closedDateStr = c.updatedAt || c.createdAt;
          if (closedDateStr) {
            const d = new Date(closedDateStr);
            const vgv = c.potentialValue || c.maxBudget || 0;
            
            if (period === "mensal") {
              if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
                sum += vgv;
                foundRealClosed = true;
              }
            } else if (period === "semestral") {
              const currentSemester = currentMonth < 6 ? 0 : 1;
              const recordSemester = d.getMonth() < 6 ? 0 : 1;
              if (d.getFullYear() === currentYear && currentSemester === recordSemester) {
                sum += vgv;
                foundRealClosed = true;
              }
            } else if (period === "anual") {
              if (d.getFullYear() === currentYear) {
                sum += vgv;
                foundRealClosed = true;
              }
            }
          }
        }
      });
    }

    // Fallback logic for demo/visual enhancement if no real closed deals exist in the time boundaries
    if (!foundRealClosed) {
      let fallbackSum = 0;
      clients.forEach(c => {
        if (c.pipelineStatus === "Fechado") {
          fallbackSum += c.potentialValue || c.maxBudget || 0;
        }
      });

      if (fallbackSum > 0) {
        if (period === "mensal") return Math.round(fallbackSum * 0.3);
        if (period === "semestral") return Math.round(fallbackSum * 0.7);
        return fallbackSum;
      }

      // Default visual guidelines
      if (period === "mensal") return 2400000;
      if (period === "semestral") return 12000000;
      return 25000000;
    }
    
    return sum;
  };

  const currentGoalValue = goals[goalPeriod];
  const completedAmount = getClosedVgv(goalPeriod);
  const goalPercent = currentGoalValue > 0 ? Math.min(100, Math.round((completedAmount / currentGoalValue) * 100)) : 0;
  const radialStrokeDashoffset = 251.2 - (goalPercent / 100) * 251.2;
  const remainingAmount = Math.max(0, currentGoalValue - completedAmount);

  const [bestActions, setBestActions] = useState<any[]>([]);
  const [isLoadingBestActions, setIsLoadingBestActions] = useState(false);
  const [bestActionStatus, setBestActionStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [taskAddedFeedback, setTaskAddedFeedback] = useState<Record<string, boolean>>({});

  const fetchBestActions = async () => {
    setIsLoadingBestActions(true);
    setBestActionStatus("loading");
    try {
      const response = await apiFetch("/api/ai/next-best-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients,
          tasks,
          proposals,
          visits
        })
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setBestActions(data);
        setBestActionStatus("success");
      } else {
        setBestActionStatus("error");
      }
    } catch (err) {
      console.error("Erro ao carregar próximas melhores ações:", err);
      setBestActionStatus("error");
    } finally {
      setIsLoadingBestActions(false);
    }
  };

  useEffect(() => {
    if (clients && clients.length > 0) {
      fetchBestActions();
    }
  }, [clients.length, tasks.length, proposals?.length, visits?.length]);

  const handleExecuteAddTask = async (action: any, index: number) => {
    const actionId = `${action.clientId}-${index}`;
    setExecutingActionId(actionId);
    try {
      const taskPayload = {
        date: new Date().toISOString().split("T")[0],
        time: "10:00",
        title: action.actionPayload.taskTitle || `Follow-up com ${action.clientName}`,
        clientId: action.clientId,
        clientName: action.clientName,
        type: action.actionPayload.taskType || "Cobrar retorno",
        priority: "média" as "baixa" | "média" | "alta",
        completed: false,
        description: action.actionPayload.taskDescription || action.suggestion
      };
      await onAddTask(taskPayload);
      setTaskAddedFeedback(prev => ({ ...prev, [actionId]: true }));
    } catch (err) {
      console.error("Erro ao agendar tarefa a partir da recomendação:", err);
      alert("Falha ao agendar tarefa.");
    } finally {
      setExecutingActionId(null);
    }
  };

  // Welcome greeting
  const getGreeting = () => {
    const hours = new Date().getHours();
    const namePart = currentUser?.name ? `, ${currentUser.name.split(" ")[0]}` : "";
    if (hours >= 5 && hours < 12) return `Bom dia${namePart}`;
    if (hours >= 12 && hours < 18) return `Boa tarde${namePart}`;
    return `Boa noite${namePart}`;
  };

  // Get upcoming and today's birthdays within the next 3 days
  const getBirthdayAlerts = () => {
    const today = new Date();
    
    // Generate dates for today, tomorrow, day+2, day+3
    const dates = Array.from({ length: 4 }, (_, i) => {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return {
        key: `${m}-${day}`,
        daysAway: i,
        label: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `Em ${i} dias`,
        dateFormatted: `${day}/${m}`
      };
    });

    const todayKey = dates[0].key;

    const todayBirthdays: Array<{ client: Client; age?: number }> = [];
    const upcomingBirthdays: Array<{ client: Client; label: string; dateFormatted: string; daysAway: number; age?: number }> = [];

    clients.forEach(c => {
      if (!c.birthday) return;
      
      const parts = c.birthday.split("-");
      let mDay = "";
      let birthYear: number | undefined = undefined;

      if (parts.length === 3) {
        mDay = `${parts[1]}-${parts[2]}`;
        birthYear = parseInt(parts[0], 10);
      } else if (parts.length === 2) {
        mDay = `${parts[0]}-${parts[1]}`;
      } else {
        return;
      }

      // Calculate age
      let age: number | undefined = undefined;
      if (birthYear && !isNaN(birthYear)) {
        age = today.getFullYear() - birthYear;
      }

      if (mDay === todayKey) {
        todayBirthdays.push({
          client: c,
          age
        });
      } else {
        const match = dates.find(d => d.key === mDay);
        if (match) {
          upcomingBirthdays.push({
            client: c,
            label: match.label,
            dateFormatted: match.dateFormatted,
            daysAway: match.daysAway,
            age
          });
        }
      }
    });

    // Sort upcoming birthdays chronologically by daysAway
    upcomingBirthdays.sort((a, b) => a.daysAway - b.daysAway);

    return { todayBirthdays, upcomingBirthdays };
  };

  // Metrics
  const activePropertiesCount = properties.length;
  const newLeadsCount = clients.filter(c => c.profileType === "Lead" || c.status === "Novo").length;
  
  // Calculate total portfolio value of sales properties
  const totalSalesValue = properties
    .filter(p => p.modality === "Venda")
    .reduce((sum, p) => sum + p.price, 0);

  // Format total portfolio value (e.g. 19.1M)
  const formattedPortfolioValue = (totalSalesValue / 1000000).toFixed(1) + "M";

  // Upcoming Visits (type 'VISITA', not completed)
  const upcomingVisits = tasks
    .filter(t => t.type === "VISITA" && !t.completed)
    .slice(0, 3);

  // Previsão de Comissão Metrics (Dinheiro em Jogo!)
  const commissionMetrics = (() => {
    let totalPotential = 0;
    let openProposals = 0;
    let hotDeals = 0;
    let closedMonth = 0;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed

    clients.forEach(c => {
      // Calculate estimated commission if not defined
      const budget = c.potentialValue || c.maxBudget || 0;
      const pct = c.commissionPercent !== undefined ? c.commissionPercent : (currentUser?.defaultCommissionPercent ?? 5);
      const commission = c.commissionForecast !== undefined ? c.commissionForecast : (budget * pct / 100);

      const stage = c.pipelineStatus || "Novo lead";

      // 1. Comissão Potencial Total (todos exceto Fechado e Perdido)
      if (stage !== "Fechado" && stage !== "Perdido") {
        totalPotential += commission;
      }

      // 2. Comissão em Propostas Abertas (stage: "Proposta enviada")
      if (stage === "Proposta enviada") {
        openProposals += commission;
      }

      // 3. Comissão em Negociações Quentes (temperatura "Quente" ou probabilidade "Alta", e não finalizados)
      if (stage !== "Fechado" && stage !== "Perdido" && (c.temperature === "Quente" || c.closingProbability === "Alta")) {
        hotDeals += commission;
      }

      // 4. Comissão Fechada no Mês (stage: "Fechado")
      if (stage === "Fechado") {
        const closedDateStr = c.updatedAt || c.createdAt;
        if (closedDateStr) {
          const closedDate = new Date(closedDateStr);
          if (closedDate.getFullYear() === currentYear && closedDate.getMonth() === currentMonth) {
            closedMonth += commission;
          }
        }
      }
    });

    // Check if there are closed deals in the current month. If none, we fallback to all closed deals.
    const hasClosedThisMonth = clients.some(c => {
      if (c.pipelineStatus !== "Fechado") return false;
      const dateStr = c.updatedAt || c.createdAt;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    if (!hasClosedThisMonth) {
      // Sum all closed deals as fallback
      clients.forEach(c => {
        if (c.pipelineStatus === "Fechado") {
          const budget = c.potentialValue || c.maxBudget || 0;
          const pct = c.commissionPercent !== undefined ? c.commissionPercent : (currentUser?.defaultCommissionPercent ?? 5);
          const commission = c.commissionForecast !== undefined ? c.commissionForecast : (budget * pct / 100);
          closedMonth += commission;
        }
      });
    }

    return {
      totalPotential,
      openProposals,
      hotDeals,
      closedMonth
    };
  })();

  // Generate Suggested Tasks using Gemini AI
  const handleGenerateAiTasks = async () => {
    setIsGeneratingAiTasks(true);
    setSuggestedAiTasks([]);
    setAiTasksAdded({});
    
    try {
      const response = await apiFetch("/api/ai/suggest-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients: clients.slice(0, 10), // Send a subset to fit tokens
          properties: properties.slice(0, 10)
        })
      });

      const data = await response.json();
      if (Array.isArray(data)) {
        // Set date to today
        const todayStr = new Date().toISOString().split("T")[0];
        const formatted = data.map((t: any) => ({
          date: todayStr,
          time: t.time || "10:00",
          title: t.title,
          clientName: t.clientName || "Cliente",
          description: t.description,
          type: t.type || "FOLLOW-UP",
          completed: false
        }));
        setSuggestedAiTasks(formatted);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Falha ao gerar tarefas por IA. Verifique se a chave API do Gemini está configurada.");
    } finally {
      setIsGeneratingAiTasks(false);
    }
  };

  const handleAddAiTask = async (task: Task, index: number) => {
    try {
      await onAddTask(task);
      setAiTasksAdded(prev => ({ ...prev, [index]: true }));
    } catch (err) {
      console.error(err);
      alert("Falha ao adicionar tarefa recomendada.");
    }
  };

  // Calculations for commercial routine highlights
  const todayStr = new Date().toISOString().split("T")[0];
  const now = new Date();
  const currentHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const overdueTasks = tasks.filter(t => {
    if (t.completed) return false;
    if (t.date < todayStr) return true;
    if (t.date === todayStr && t.time < currentHM) return true;
    return false;
  });

  const todayTasks = tasks.filter(t => t.date === todayStr && !t.completed);

  const activeClients = clients.filter(c => c.status !== "Ganho" && c.status !== "Perdido");
  
  const leadsWithNoAction = activeClients.filter(c => {
    const clientTasks = tasks.filter(t => {
      const matchesId = t.clientId === c.id || t._id?.toString() === c.id || t.clientId === c._id?.toString();
      const matchesName = t.clientName.toLowerCase() === c.name.toLowerCase();
      return matchesId || matchesName;
    });
    const hasPending = clientTasks.some(t => !t.completed && t.date >= todayStr);
    return !hasPending;
  });

  // Calculate user weekly task productivity
  const last7DaysData = React.useMemo(() => {
    const data = [];
    const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      
      const dayTasks = tasks.filter(t => t.date === dateStr);
      const completedCount = dayTasks.filter(t => t.completed).length;
      const pendingCount = dayTasks.filter(t => !t.completed).length;
      
      const dayName = weekdays[d.getDay()];
      const formattedLabel = `${day}/${month}`;
      
      data.push({
        date: dateStr,
        label: formattedLabel,
        dayName,
        "Concluídas": completedCount,
        "Pendentes": pendingCount,
        total: dayTasks.length
      });
    }
    return data;
  }, [tasks]);

  // Calculate stagnant alerts for all clients
  const allStagnantAlerts = clients.flatMap(client => {
    const clientAlerts = getClientAlerts(client, tasks, proposals, visits);
    return clientAlerts.map(alert => ({
      ...alert,
      client
    }));
  });

  // Sort by priority level: Crítico > Urgente > Atenção
  const alertPriority = { "Crítico": 1, "Urgente": 2, "Atenção": 3 };
  const sortedStagnantAlerts = [...allStagnantAlerts].sort(
    (a, b) => alertPriority[a.level] - alertPriority[b.level]
  );

  const [alertFilter, setAlertFilter] = useState<"Todos" | "Crítico" | "Urgente" | "Atenção">("Todos");

  const filteredStagnantAlerts = sortedStagnantAlerts.filter(alert => {
    if (alertFilter === "Todos") return true;
    return alert.level === alertFilter;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* DB Status & API banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-low px-4 py-3 rounded-xl border border-outline-variant/30 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium text-on-surface-variant">
            <Database className="w-3.5 h-3.5 text-secondary" />
            Banco: <span className="font-bold text-primary">{dbStatus?.dbType || "Carregando..."}</span>
          </span>
          <span className="flex items-center gap-1.5 font-medium text-on-surface-variant">
            <Brain className="w-3.5 h-3.5 text-secondary" />
            IA Gemini:{" "}
            {dbStatus?.geminiActive ? (
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">ATIVO</span>
            ) : (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">NÃO CONFIGURADA</span>
            )}
          </span>
        </div>
        <span className="text-[10px] text-on-surface-variant/70 font-mono">Status: On-line</span>
      </div>

      {/* Welcome Message */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-6 rounded-2xl border border-primary/10">
        <div className="space-y-1.5 flex-1">
          <p className="font-label-caps text-label-caps text-secondary uppercase tracking-widest text-xs font-bold">
            {getGreeting()}
          </p>
          <h2 className="font-display text-2xl font-black text-primary tracking-tight leading-tight md:max-w-xl">
            {currentUser?.onboardingCompleted 
              ? `Pronto para organizar sua rotina comercial em ${currentUser.primaryCity}?`
              : "Acompanhe cada oportunidade e saiba exatamente quem atender hoje."}
          </h2>
          <p className="text-xs text-on-surface-variant font-medium mt-1 leading-relaxed md:max-w-xl">
            O Metria CRM garante que você não perca mais leads, visitas, propostas e follow-ups, transformando o seu acompanhamento comercial em resultados concretos.
          </p>
          {currentUser?.onboardingCompleted && (
            <div className="text-[11px] text-on-surface-variant font-semibold mt-2.5 bg-primary/5 px-2.5 py-1 rounded-md inline-block">
              Segmento principal: <span className="font-bold text-primary">{currentUser.actingType}</span> • {currentUser.commercialName || "Corretor Autônomo"}
            </div>
          )}
        </div>
        
        {currentUser?.onboardingCompleted && (
          <div className="flex flex-col items-end text-right bg-white px-4 py-3 rounded-xl border border-outline-variant/30 shadow-sm shrink-0 w-full sm:w-auto">
            <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">Configuração Ativa</span>
            <span className="text-xs font-bold text-primary mt-0.5">{currentUser.commercialName || "Corretor Autônomo"}</span>
            {currentUser.creci && (
              <span className="text-[10px] text-on-surface-variant font-medium mt-0.5">CRECI {currentUser.creci}</span>
            )}
            <span className="text-[10px] text-on-surface-variant/70 font-mono mt-1 bg-surface-container px-2 py-0.5 rounded-full">
              📍 {currentUser.primaryCity}
            </span>
          </div>
        )}
      </section>

      {/* SEÇÃO RECOMENDAÇÕES INTELIGENTES (PRÓXIMA MELHOR AÇÃO) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 text-left">
            <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
              <span className="p-1.5 bg-secondary-container/20 text-secondary rounded-lg">
                <Sparkles className="w-5 h-5 text-secondary animate-pulse" />
              </span>
              Recomendações Inteligentes
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Próxima melhor ação gerada com inteligência para você focar nos clientes certos agora
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg flex items-center gap-1 ${
              dbStatus?.geminiActive 
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : "bg-amber-100 text-amber-800 border border-amber-300"
            }`}>
              <Brain className="w-3.5 h-3.5" />
              {dbStatus?.geminiActive ? "IA Metria Ativa" : "Motor de Regras Ativo"}
            </span>

            <button
              onClick={fetchBestActions}
              disabled={isLoadingBestActions}
              className="p-1.5 hover:bg-surface-container-high rounded-lg border border-outline-variant/30 transition-colors cursor-pointer"
              title="Recarregar recomendações"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-on-surface-variant ${isLoadingBestActions ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {isLoadingBestActions ? (
          <div className="bg-surface-container-lowest p-12 rounded-2xl border border-outline-variant/30 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            <p className="text-xs text-on-surface-variant font-semibold">Analisando dados do CRM em tempo real...</p>
          </div>
        ) : bestActionStatus === "error" ? (
          <div className="bg-red-50 p-6 rounded-2xl border border-red-100 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <div>
              <h4 className="font-bold text-red-900 text-sm">Falha ao analisar próximas ações</h4>
              <p className="text-xs text-red-700 mt-1">Não foi possível carregar as recomendações de IA. Tente novamente.</p>
            </div>
            <button
              onClick={fetchBestActions}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        ) : bestActions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bestActions.map((action, idx) => {
              const clientObj = clients.find(c => c.id === action.clientId || c._id === action.clientId || c.name === action.clientName);
              const actionId = `${action.clientId}-${idx}`;
              const isTaskAdded = taskAddedFeedback[actionId];

              // Beautiful custom priority styling
              let priorityBg = "bg-slate-100 border-slate-300 text-slate-800";
              if (action.priority === "Crítica") {
                priorityBg = "bg-red-100 border-red-300 text-red-800 animate-pulse";
              } else if (action.priority === "Alta") {
                priorityBg = "bg-orange-100 border-orange-300 text-orange-800";
              } else if (action.priority === "Média") {
                priorityBg = "bg-blue-100 border-blue-300 text-blue-800";
              }

              return (
                <div
                  key={actionId}
                  className="p-5 bg-white border border-outline-variant/30 hover:border-secondary/40 hover:shadow-md rounded-2xl flex flex-col justify-between gap-4 transition-all text-left relative overflow-hidden"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-secondary-container/20 text-secondary border border-secondary-container/30 rounded-full">
                        {action.category || "Próxima Ação"}
                      </span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${priorityBg}`}>
                        {action.priority || "Média"}
                      </span>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="p-1.5 bg-surface-container rounded-lg shrink-0 mt-0.5">
                        <UserIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-on-surface-variant/70 font-bold uppercase tracking-wider leading-none">Cliente / Lead</p>
                        <p className="text-base font-black text-on-surface truncate mt-0.5">{action.clientName}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pl-0.5">
                      <p className="text-xs text-on-surface-variant font-semibold bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/10 leading-relaxed">
                        <strong className="text-primary font-bold">Motivo:</strong> {action.reason}
                      </p>
                      <p className="text-xs text-on-surface-variant font-semibold bg-secondary/5 px-3 py-2 rounded-xl border border-secondary/10 leading-relaxed">
                        <strong className="text-secondary font-bold">Ação Sugerida:</strong> {action.suggestion}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-2">
                    {/* Secondary View Profile button */}
                    {clientObj ? (
                      <button
                        onClick={() => onSelectClient && onSelectClient(clientObj)}
                        className="text-xs text-primary hover:text-primary/80 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        Abrir Ficha <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-on-surface-variant/50 font-medium italic">Ficha indisponível</span>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                      {/* Create Task automated button */}
                      {action.actionType !== "open_client" && (
                        <button
                          onClick={() => handleExecuteAddTask(action, idx)}
                          disabled={isTaskAdded || executingActionId === actionId}
                          className={`px-3 py-1.5 border text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-sm ${
                            isTaskAdded
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-surface-container-high hover:bg-surface-container-highest text-on-surface border-outline-variant"
                          }`}
                        >
                          {executingActionId === actionId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-on-surface-variant" />
                          ) : isTaskAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                              <span>Agendado!</span>
                            </>
                          ) : (
                            <>
                              <Calendar className="w-3.5 h-3.5 text-on-surface-variant" />
                              <span>Agendar</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* WhatsApp Button */}
                      {action.actionPayload?.phone ? (
                        <a
                          href={`https://wa.me/${action.actionPayload.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                            action.actionPayload.message || `Olá, ${action.clientName.split(" ")[0]}! Aqui é o seu corretor do Metria CRM.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5 fill-white text-emerald-600 shrink-0" />
                          Chamar no WhatsApp
                        </a>
                      ) : (
                        action.actionType === "open_client" && clientObj && (
                          <button
                            onClick={() => onSelectClient && onSelectClient(clientObj)}
                            className="px-3.5 py-1.5 bg-primary text-on-primary hover:bg-primary/90 text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm cursor-pointer"
                          >
                            <UserIcon className="w-3.5 h-3.5" />
                            Ver Ficha Completa
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-emerald-50/40 p-6 rounded-2xl border border-emerald-100 flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-display font-bold text-emerald-900 text-sm">Tudo impecavelmente em dia!</h4>
              <p className="text-xs text-emerald-800 font-medium mt-0.5">
                Não identificamos nenhuma oportunidade estagnada, pendência ou follow-up atrasado. Sua carteira de clientes está ativa e muito bem gerida!
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SEÇÃO ALERTAS DE NEGOCIAÇÕES PARADAS (OPORTUNIDADES ESFRIANDO) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
              <span className="p-1.5 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
              </span>
              Oportunidades Esfriando e Alertas Comerciais
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Leads e negociações estagnadas que exigem atenção imediata para não esfriarem
            </p>
          </div>
          
          {/* Quick filter tabs */}
          {sortedStagnantAlerts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 bg-surface-container-low p-1 rounded-xl border border-outline-variant/25">
              {(["Todos", "Crítico", "Urgente", "Atenção"] as const).map(tab => {
                const count = tab === "Todos" 
                  ? sortedStagnantAlerts.length 
                  : sortedStagnantAlerts.filter(a => a.level === tab).length;
                return (
                  <button
                    key={tab}
                    onClick={() => setAlertFilter(tab)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      alertFilter === tab 
                        ? tab === "Crítico" ? "bg-red-600 text-white"
                          : tab === "Urgente" ? "bg-orange-600 text-white"
                          : tab === "Atenção" ? "bg-amber-500 text-white"
                          : "bg-primary text-on-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    <span>{tab}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      alertFilter === tab ? "bg-white/25 text-white" : "bg-surface-container-highest text-on-surface-variant"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {sortedStagnantAlerts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-1 no-scrollbar">
            {filteredStagnantAlerts.length > 0 ? (
              filteredStagnantAlerts.map((alert) => {
                const styles = getAlertBadgeStyles(alert.level);
                return (
                  <div 
                    key={alert.id}
                    className={`p-4 bg-white border ${styles.border} hover:shadow-md rounded-2xl flex flex-col justify-between gap-3 transition-all text-left relative overflow-hidden`}
                  >
                    {/* Visual left accent bar matching level */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                      alert.level === "Crítico" ? "bg-red-600" : alert.level === "Urgente" ? "bg-orange-500" : "bg-amber-400"
                    }`} />
                    
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${styles.bg} border border-current`}>
                          {alert.level}
                        </span>
                        
                        <span className="text-[10px] text-on-surface-variant/70 font-mono font-semibold">
                          Regra #{alert.ruleId}
                        </span>
                      </div>
                      
                      <h4 className="font-display font-black text-base text-primary flex items-center gap-1.5">
                        {alert.level === "Crítico" ? (
                          <Flame className="w-4 h-4 text-red-600 animate-pulse shrink-0" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-orange-500 shrink-0" />
                        )}
                        {alert.title}
                      </h4>
                      
                      <p className="text-xs text-on-surface-variant font-medium mt-1">
                        {alert.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-on-surface-variant/70 font-bold uppercase tracking-wider">Cliente / Lead</p>
                        <p className="text-sm font-bold text-on-surface truncate max-w-[150px]">{alert.client.name}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {alert.client.phone && (
                          <a
                            href={`https://wa.me/${alert.client.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                              `Olá, ${alert.client.name.split(" ")[0]}! Aqui é o ${currentUser?.commercialName || "seu corretor"}. Gostaria de alinhar nossos próximos passos...`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Entrar em contato via WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4 fill-white text-emerald-500" />
                          </a>
                        )}
                        
                        <button
                          onClick={() => onSelectClient && onSelectClient(alert.client)}
                          className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/15 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                        >
                          Ver Ficha
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant/30 text-center py-10 text-on-surface-variant">
                <p className="text-xs font-medium">Nenhum alerta comercial encontrado para o nível selecionado.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100/60 flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-display font-bold text-emerald-900 text-sm">Esteira Blindada e Ativa!</h4>
              <p className="text-xs text-emerald-800 font-medium mt-0.5">
                Incrível! Todas as suas oportunidades estão ativas, com follow-ups em dia e propostas acompanhadas.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SEÇÃO METRIA COMERCIAL: ACOMPANHAMENTO E ROTINA */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
            <span className="p-1.5 bg-primary/10 rounded-lg">
              <CheckSquare className="w-5 h-5 text-primary" />
            </span>
            Rotina Comercial e Alertas de Follow-up
          </h3>
          <button 
            onClick={() => onNavigateToTab("tasks")} 
            className="text-xs text-secondary hover:underline font-bold flex items-center gap-1 cursor-pointer"
          >
            Ver Minha Agenda <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. Tarefas Atrasadas */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between min-h-[300px]">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-outline-variant/30">
                <h4 className="font-display text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${overdueTasks.length > 0 ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`}></span>
                  Atrasadas ({overdueTasks.length})
                </h4>
                {overdueTasks.length > 0 && (
                  <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-extrabold uppercase animate-pulse">
                    Atenção
                  </span>
                )}
              </div>

              <div className="space-y-3 max-h-[220px] overflow-y-auto no-scrollbar">
                {overdueTasks.length > 0 ? (
                  overdueTasks.map((t, idx) => (
                    <div key={`overdue-${idx}`} className="p-3 bg-red-50/20 hover:bg-red-50/40 border border-red-100 rounded-xl flex items-start justify-between gap-2.5 transition-all text-left">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-red-700">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{t.date.split("-").reverse().slice(0, 2).join("/")} às {t.time}</span>
                        </div>
                        <p className="font-bold text-sm text-on-surface truncate mt-1">{t.title}</p>
                        <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">Cliente: <span className="font-bold text-primary">{t.clientName}</span></p>
                      </div>
                      <button
                        onClick={() => onToggleTaskCompletion && onToggleTaskCompletion(t.id || t._id || "", true)}
                        className="w-7 h-7 rounded-lg border border-red-200 bg-white hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-700 flex items-center justify-center transition-all cursor-pointer shadow-sm text-on-surface-variant shrink-0"
                        title="Concluir tarefa"
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-10 text-on-surface-variant">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                      <CheckCircle className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <p className="text-xs font-bold text-emerald-800">Tudo em dia!</p>
                    <p className="text-[10px] opacity-75 mt-0.5 px-3">Você não possui nenhum follow-up comercial em atraso.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Follow-ups do Dia */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between min-h-[300px]">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-outline-variant/30">
                <h4 className="font-display text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${todayTasks.length > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}></span>
                  Follow-ups do Dia ({todayTasks.length})
                </h4>
                <span className="text-[10px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full font-bold">
                  Hoje
                </span>
              </div>

              <div className="space-y-3 max-h-[220px] overflow-y-auto no-scrollbar">
                {todayTasks.length > 0 ? (
                  todayTasks.map((t, idx) => (
                    <div key={`today-${idx}`} className="p-3 bg-surface hover:bg-surface-container-low border border-outline-variant/20 rounded-xl flex items-start justify-between gap-2.5 transition-all text-left">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant">
                          <Clock className="w-3 h-3 shrink-0 text-primary" />
                          <span>Hoje às {t.time}</span>
                          <span className={`ml-1.5 px-1.5 py-0.2 text-[8px] rounded font-bold uppercase ${
                            t.priority === "alta" ? "bg-red-100 text-red-800" : t.priority === "média" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                          }`}>{t.priority}</span>
                        </div>
                        <p className="font-bold text-sm text-on-surface truncate mt-1">{t.title}</p>
                        <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">Cliente: <span className="font-bold text-primary">{t.clientName}</span></p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {t.type === "Enviar WhatsApp" && (
                          <a
                            href={`https://wa.me/${(clients.find(c => c.name === t.clientName || c.id === t.clientId)?.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, gostaria de conversar sobre o seu atendimento no Metria CRM...`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 shadow-sm cursor-pointer shrink-0"
                            title="Chamar no WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5 fill-white text-emerald-500" />
                          </a>
                        )}
                        <button
                          onClick={() => onToggleTaskCompletion && onToggleTaskCompletion(t.id || t._id || "", true)}
                          className="w-7 h-7 rounded-lg border border-outline-variant bg-white hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-700 flex items-center justify-center transition-all cursor-pointer shadow-sm text-on-surface-variant"
                          title="Concluir tarefa"
                        >
                          <Check className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-10 text-on-surface-variant">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-2">
                      <CheckCircle className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <p className="text-xs font-bold text-blue-800">Tudo em dia para hoje!</p>
                    <p className="text-[10px] opacity-75 mt-0.5 px-3">Nenhum compromisso pendente para hoje. Ótima oportunidade para prospecção!</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Leads Sem Próxima Action */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between min-h-[300px]">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-outline-variant/30">
                <h4 className="font-display text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${leadsWithNoAction.length > 0 ? "bg-orange-500 animate-pulse" : "bg-emerald-500"}`}></span>
                  Leads Sem Ação ({leadsWithNoAction.length})
                </h4>
                {leadsWithNoAction.length > 0 && (
                  <span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold animate-pulse">
                    Frio
                  </span>
                )}
              </div>

              <div className="space-y-3 max-h-[220px] overflow-y-auto no-scrollbar">
                {leadsWithNoAction.length > 0 ? (
                  leadsWithNoAction.map((c, idx) => (
                    <div key={`no-action-${idx}`} className="p-3 bg-orange-50/10 hover:bg-orange-50/25 border border-orange-200/50 rounded-xl flex items-center justify-between gap-2.5 transition-all text-left">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-on-surface truncate">{c.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-on-surface-variant font-semibold">
                          <span>{c.profileType}</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-800">{c.status}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => onPrefillClientForTask && onPrefillClientForTask(c)}
                        className="px-3 py-1.5 bg-primary text-on-primary hover:bg-primary/95 text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
                        title="Agendar follow-up imediato"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Agendar
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-10 text-on-surface-variant">
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
                      <Sparkles className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <p className="text-xs font-bold text-amber-800">Leads Blindados!</p>
                    <p className="text-[10px] opacity-75 mt-0.5 px-3">Incrível! Todos os seus leads ativos possuem alguma tarefa agendada.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Birthday Alerts Banner */}
      {(() => {
        const { todayBirthdays, upcomingBirthdays } = getBirthdayAlerts();
        const hasBirthdays = todayBirthdays.length > 0 || upcomingBirthdays.length > 0;
        if (!hasBirthdays) return null;

        return (
          <section className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 p-5 rounded-2xl shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm">
                <Cake className="w-5 h-5 stroke-[2] animate-bounce" />
              </span>
              <div>
                <h3 className="font-display text-title-md text-amber-900 font-bold leading-tight">Relacionamento Ativo • Aniversariantes</h3>
                <p className="text-xs text-amber-800 font-semibold opacity-90">Parabenizar seu cliente fortalece o follow-up e abre portas para novas indicações.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Today's birthdays */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
                  Hoje ({todayBirthdays.length})
                </h4>
                <div className="space-y-2">
                  {todayBirthdays.length > 0 ? (
                    todayBirthdays.map(({ client, age }, index) => (
                      <div
                        key={`today-${index}`}
                        className="flex items-center justify-between p-3 bg-white rounded-xl border border-amber-200/40 shadow-sm"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-sm text-on-surface truncate">{client.name}</p>
                          <p className="text-[11px] text-on-surface-variant font-medium">
                            {client.phone} • {client.profileType} {age !== undefined ? `(${age} anos 🎉)` : ""}
                          </p>
                        </div>
                        <a
                          href={`https://wa.me/${client.phone.replace(/\D/g, "")}?text=Parab%C3%A9ns%2C%20${encodeURIComponent(client.name)}!%20Desejo%20muito%20sucesso%20e%20felicidades!`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap cursor-pointer active:scale-95"
                        >
                          <Gift className="w-3.5 h-3.5" />
                          Parabenizar
                        </a>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-amber-700/60 italic p-3 bg-white/20 rounded-xl border border-dashed border-amber-200">
                      Nenhum aniversário hoje.
                    </p>
                  )}
                </div>
              </div>

              {/* Upcoming birthdays */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  Próximos 3 Dias ({upcomingBirthdays.length})
                </h4>
                <div className="space-y-2">
                  {upcomingBirthdays.length > 0 ? (
                    upcomingBirthdays.map(({ client, label, dateFormatted, age }, index) => (
                      <div
                        key={`upcoming-${index}`}
                        className="flex items-center justify-between p-3 bg-white/70 rounded-xl border border-amber-100 shadow-sm"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-sm text-on-surface truncate">{client.name}</p>
                          <p className="text-[11px] text-on-surface-variant font-medium">
                            {client.phone} • {client.profileType} {age !== undefined ? `(fará ${age} anos 🎂)` : ""}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md whitespace-nowrap">
                          {label} ({dateFormatted})
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-amber-700/60 italic p-3 bg-white/20 rounded-xl border border-dashed border-amber-200">
                      Nenhum aniversário nos próximos 3 dias.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* SEÇÃO DINHEIRO EM JOGO: PREVISÃO DE COMISSÃO */}
      {clients.length === 0 && proposals.length === 0 && visits.length === 0 ? (
        <section className="space-y-4 animate-in fade-in duration-300">
          <div className="space-y-1 text-left">
            <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
              <span className="p-1.5 bg-emerald-500/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-emerald-600 animate-pulse" />
              </span>
              Desempenho & Relatórios de Vendas
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Acompanhe sua receita potencial estimada, faturamento de comissão e metas de fechamento de negócios.
            </p>
          </div>

          <div className="bg-surface-container-lowest p-8 sm:p-12 text-center rounded-2xl border border-outline-variant/30 shadow-sm space-y-6 max-w-4xl mx-auto flex flex-col items-center justify-center relative overflow-hidden">
            {/* Visual background details */}
            <div className="absolute top-0 right-0 opacity-[0.03] translate-x-12 -translate-y-12">
              <Sparkles className="w-64 h-64 text-primary" />
            </div>

            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-inner relative z-10 animate-bounce">
              <DollarSign className="w-10 h-10 stroke-[1.5]" />
            </div>

            <div className="space-y-2 relative z-10 max-w-md">
              <h4 className="font-display text-lg sm:text-xl font-bold text-on-surface tracking-tight">
                Acompanhe seu desempenho comercial e nunca mais perca um fechamento.
              </h4>
              <p className="text-xs sm:text-sm text-on-surface-variant/80 leading-relaxed">
                Com o Metria CRM, você monitora o funil de conversão, metas mensais e previsão de comissões em tempo real. Cadastre dados reais ou ative o Modo Demonstração para ver cada detalhe deste painel.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 justify-center relative z-10">
              <button
                onClick={() => onNavigateToTab("clients")}
                className="px-5 py-2.5 bg-primary hover:bg-primary/95 text-on-primary font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Cadastrar primeiro lead
              </button>
              <button
                onClick={() => onNavigateToTab("properties")}
                className="px-5 py-2.5 bg-white hover:bg-surface-container text-primary border border-outline-variant rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Home className="w-4 h-4 stroke-[2]" />
                Ver Imóveis
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
        <div className="space-y-1 text-left">
          <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600 animate-pulse" />
            </span>
            Dinheiro em Jogo • Previsão de Comissão do Corretor
          </h3>
          <p className="text-xs text-on-surface-variant font-medium">
            Fique de olho nas comissões estimadas das suas negociações em aberto para bater suas metas. (Valores estimados baseados no VGV das negociações)
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Comissão Potencial Total */}
          <div className="bg-gradient-to-br from-indigo-500/5 to-indigo-500/10 p-5 rounded-2xl border border-indigo-500/20 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden text-left">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-2 translate-y-2">
              <DollarSign className="w-20 h-20 text-indigo-600" />
            </div>
            <div>
              <span className="text-[9px] font-extrabold text-indigo-800 dark:text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded-full">
                Em aberto
              </span>
              <p className="font-label-md text-xs text-on-surface-variant font-semibold mt-2">Comissão Potencial Total</p>
            </div>
            <p className="font-display text-lg sm:text-xl font-black text-indigo-950 dark:text-indigo-200">
              R$ {commissionMetrics.totalPotential.toLocaleString("pt-BR")}
            </p>
          </div>

          {/* Card 2: Comissão em Propostas Abertas */}
          <div className="bg-gradient-to-br from-violet-500/5 to-violet-500/10 p-5 rounded-2xl border border-violet-500/20 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden text-left">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-2 translate-y-2">
              <DollarSign className="w-20 h-20 text-violet-600" />
            </div>
            <div>
              <span className="text-[9px] font-extrabold text-violet-800 dark:text-violet-400 uppercase tracking-widest bg-violet-500/10 px-2 py-0.5 rounded-full">
                Propostas abertas
              </span>
              <p className="font-label-md text-xs text-on-surface-variant font-semibold mt-2">Em Propostas Abertas</p>
            </div>
            <p className="font-display text-lg sm:text-xl font-black text-violet-950 dark:text-violet-200">
              R$ {commissionMetrics.openProposals.toLocaleString("pt-BR")}
            </p>
          </div>

          {/* Card 3: Comissão em Negociações Quentes */}
          <div className="bg-gradient-to-br from-orange-500/5 to-orange-500/10 p-5 rounded-2xl border border-orange-500/20 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden text-left">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-2 translate-y-2">
              <Flame className="w-20 h-20 text-orange-600" />
            </div>
            <div>
              <span className="text-[9px] font-extrabold text-orange-800 dark:text-orange-400 uppercase tracking-widest bg-orange-500/10 px-2 py-0.5 rounded-full">
                Quentes / Alta Prob.
              </span>
              <p className="font-label-md text-xs text-on-surface-variant font-semibold mt-2">Negociações Quentes</p>
            </div>
            <p className="font-display text-lg sm:text-xl font-black text-orange-950 dark:text-orange-200">
              R$ {commissionMetrics.hotDeals.toLocaleString("pt-BR")}
            </p>
          </div>

          {/* Card 4: Comissão Fechada no Mês */}
          <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 p-5 rounded-2xl border border-emerald-500/20 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden text-left">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-2 translate-y-2">
              <CheckCircle2 className="w-20 h-20 text-emerald-600" />
            </div>
            <div>
              <span className="text-[9px] font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Fechado 🎉
              </span>
              <p className="font-label-md text-xs text-on-surface-variant font-semibold mt-2">Fechada no Mês</p>
            </div>
            <p className="font-display text-lg sm:text-xl font-black text-emerald-950 dark:text-emerald-200">
              R$ {commissionMetrics.closedMonth.toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
      </section>
      )}

      {/* Quick Metrics Bento Grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <button
          onClick={() => onNavigateToTab("properties")}
          className="col-span-1 bg-surface-container-lowest p-4 rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col justify-between h-32 hover:border-primary/40 text-left transition-all active:scale-[0.98]"
        >
          <Home className="text-secondary w-5 h-5 stroke-[2]" />
          <div>
            <p className="font-label-md text-label-md text-on-surface-variant">Imóveis Ativos</p>
            <p className="font-display text-headline-lg text-primary">{activePropertiesCount}</p>
          </div>
        </button>

        {/* Metric 2 */}
        <button
          onClick={() => onNavigateToTab("clients")}
          className="col-span-1 bg-surface-container-lowest p-4 rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col justify-between h-32 hover:border-primary/40 text-left transition-all active:scale-[0.98]"
        >
          <Users className="text-secondary w-5 h-5 stroke-[2]" />
          <div>
            <p className="font-label-md text-label-md text-on-surface-variant">Acompanhamentos Ativos</p>
            <p className="font-display text-headline-lg text-secondary">{newLeadsCount}</p>
          </div>
        </button>

        {/* Metric 3 */}
        <div className="col-span-2 md:col-span-1 bg-primary text-on-primary p-4 rounded-2xl shadow-md flex flex-col justify-between h-32 relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
            <DollarSign className="w-32 h-32 stroke-[1]" />
          </div>
          <DollarSign className="text-secondary-fixed w-5 h-5 stroke-[2]" />
          <div className="z-10">
            <p className="font-label-md text-label-md text-secondary-fixed opacity-90">VGV Total sob Gestão</p>
            <p className="font-display text-headline-lg">R$ {formattedPortfolioValue}</p>
          </div>
        </div>
      </section>

      {/* Progress & Upcoming Visits row */}
      {!(clients.length === 0 && proposals.length === 0 && visits.length === 0) && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Goals Radial Chart */}
        <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="font-display text-title-md text-on-surface leading-snug">Minha Meta de Fechamento</h3>
                <button
                  type="button"
                  onClick={handleOpenGoalConfig}
                  className="p-1 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg transition-all cursor-pointer"
                  title="Configurar metas (mensais, semestrais e anuais)"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {/* Period selection tabs */}
              <div className="flex bg-surface-container-low p-0.5 rounded-lg border border-outline-variant/20 text-[10px] font-bold shrink-0">
                <button
                  onClick={() => { setGoalPeriod("mensal"); setIsEditingGoal(false); }}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    goalPeriod === "mensal" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Mensal
                </button>
                <button
                  onClick={() => { setGoalPeriod("semestral"); setIsEditingGoal(false); }}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    goalPeriod === "semestral" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Semestral
                </button>
                <button
                  onClick={() => { setGoalPeriod("anual"); setIsEditingGoal(false); }}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    goalPeriod === "anual" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Anual
                </button>
              </div>
            </div>

            {/* Editable display info */}
            {!isEditingGoal ? (
              <div className="flex items-center justify-between bg-surface-container-low/40 px-3 py-1.5 rounded-xl border border-outline-variant/10">
                <span className="text-xs text-on-surface-variant font-medium">
                  Meta {goalPeriod === "mensal" ? "Mensal" : goalPeriod === "semestral" ? "Semestral" : "Anual"}:{" "}
                  <span className="font-bold text-primary">{formatCompactBRL(currentGoalValue)}</span>
                </span>
                <button
                  onClick={handleStartEditGoal}
                  className="p-1 text-primary hover:bg-primary/10 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                  title="Editar meta"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Ajustar</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveGoal} className="bg-primary/5 p-3 rounded-xl border border-primary/20 space-y-2">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wide">
                  Nova Meta {goalPeriod === "mensal" ? "Mensal" : goalPeriod === "semestral" ? "Semestral" : "Anual"}
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant/75">R$</span>
                    <input
                      type="text"
                      value={tempGoalInput ? Number(tempGoalInput).toLocaleString("pt-BR") : ""}
                      onChange={(e) => {
                        const numeric = e.target.value.replace(/[^\d]/g, "");
                        setTempGoalInput(numeric);
                      }}
                      placeholder="Ex: 3.000.000"
                      className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg pl-8 pr-2 py-1.5 text-xs font-bold text-on-surface outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-primary text-on-primary hover:opacity-90 font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingGoal(false)}
                    className="px-2 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 font-bold text-xs rounded-lg transition-all cursor-pointer"
                  >
                    X
                  </button>
                </div>
                {tempGoalInput && (
                  <p className="text-[10px] text-on-surface-variant/80 font-semibold italic">
                    Conversão sugerida: <span className="font-bold text-primary">{formatCompactBRL(Number(tempGoalInput))}</span>
                  </p>
                )}
              </form>
            )}
          </div>
          
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle className="text-surface-container stroke-current" cx="50" cy="50" fill="transparent" r="40" strokeWidth="9"></circle>
                <circle 
                  className="text-primary stroke-current transition-all duration-500 ease-out" 
                  cx="50" 
                  cy="50" 
                  fill="transparent" 
                  r="40" 
                  strokeLinecap="round" 
                  strokeWidth="9" 
                  style={{ 
                    strokeDasharray: "251.2", 
                    strokeDashoffset: radialStrokeDashoffset 
                  }}
                ></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="font-display text-headline-lg-mobile text-primary">{goalPercent}%</p>
                <p className="text-[10px] text-on-surface-variant font-semibold">Alcançado</p>
              </div>
            </div>
            <div className="mt-4 flex gap-6 text-xs justify-center w-full">
              <div className="text-center">
                <p className="text-on-surface-variant font-semibold">Concluído</p>
                <p className="font-bold text-primary" title={`R$ ${completedAmount.toLocaleString("pt-BR")}`}>{formatCompactBRL(completedAmount)}</p>
              </div>
              <div className="w-[1px] h-8 bg-outline-variant/60"></div>
              <div className="text-center">
                <p className="text-on-surface-variant font-semibold">Restante</p>
                <p className="font-bold text-secondary" title={`R$ ${remainingAmount.toLocaleString("pt-BR")}`}>{formatCompactBRL(remainingAmount)}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Productivity BarChart Widget */}
        <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="space-y-3 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-display text-title-md text-on-surface font-bold leading-snug">Produtividade Semanal</h3>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-extrabold uppercase">
                  Últimos 7 dias
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant font-medium">
                Tarefas concluídas vs. pendentes por dia
              </p>
            </div>

            {/* Recharts Container */}
            <div className="w-full h-44 mt-3" style={{ minHeight: "176px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={last7DaysData}
                  margin={{ top: 10, right: 5, left: -25, bottom: 0 }}
                  barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ebf0ec" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fill: "#49544c", fontSize: 10, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: "#49544c", fontSize: 10, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    cursor={{ fill: "rgba(0, 77, 62, 0.04)" }}
                    contentStyle={{ 
                      backgroundColor: "#ffffff", 
                      border: "1px solid #c3cfc6", 
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
                    }} 
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={28}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px", fontWeight: "bold", paddingBottom: "5px" }}
                  />
                  <Bar dataKey="Concluídas" fill="#004d3e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pendentes" fill="#cfa85c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Footer Summary of Productivity */}
            <div className="mt-3 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-xs font-semibold">
              <div className="text-left">
                <p className="text-on-surface-variant">Conclusão Semanal</p>
                <p className="text-sm font-bold text-primary">
                  {last7DaysData.reduce((acc, curr) => acc + curr["Concluídas"], 0)} tarefas
                </p>
              </div>
              <div className="w-[1px] h-8 bg-outline-variant/30"></div>
              <div className="text-right">
                <p className="text-on-surface-variant">Taxa de Sucesso</p>
                <p className="text-sm font-bold text-secondary">
                  {(() => {
                    const comp = last7DaysData.reduce((acc, curr) => acc + curr["Concluídas"], 0);
                    const pend = last7DaysData.reduce((acc, curr) => acc + curr["Pendentes"], 0);
                    const total = comp + pend;
                    return total > 0 ? `${Math.round((comp / total) * 100)}%` : "100%";
                  })()}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Visits */}
        <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-display text-title-md text-on-surface leading-snug">Visitas Confirmadas</h3>
            <button onClick={() => onNavigateToTab("tasks")} className="text-xs text-secondary hover:underline font-semibold">
              Ver Agenda
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[200px] pr-1">
            {upcomingVisits.length > 0 ? (
              upcomingVisits.map((visit, idx) => (
                <div key={visit.id || visit._id || `visit-${idx}`} className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-outline-variant/20 hover:border-primary/20 transition-all shadow-sm">
                  <div className="flex flex-col items-center justify-center min-w-[50px] h-12 bg-primary-container/20 text-primary border border-primary-container/30 rounded-lg">
                    <p className="text-[9px] font-bold tracking-wider leading-none">HORA</p>
                    <p className="font-display text-body-lg text-primary font-bold mt-1 leading-none">{visit.time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-on-surface truncate text-sm leading-tight">{visit.title}</p>
                    <p className="text-[11px] text-on-surface-variant truncate mt-0.5 font-medium">Cliente: {visit.clientName}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-secondary-container/50 text-on-secondary-container flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-secondary" />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-full py-8 text-on-surface-variant">
                <Calendar className="w-8 h-8 text-outline-variant stroke-[1.5] mb-2" />
                <p className="text-xs font-semibold">Nenhuma visita agendada</p>
                <p className="text-[10px] opacity-70 mt-0.5">Agende visitas para aquecer seus negócios em andamento e evitar leads sem retorno.</p>
              </div>
            )}
          </div>
        </section>

      </div>
      )}

      {/* AI Task Recommender Widget (Gemini integration!) */}
      <section className="relative bg-gradient-to-br from-primary-container/10 via-white to-primary-container/15 rounded-2xl p-6 border-2 border-primary-container/25 overflow-hidden shadow-sm">
        <div className="absolute right-0 top-0 opacity-10 translate-x-2 -translate-y-2">
          <Brain className="w-48 h-48 text-primary" />
        </div>
        
        <div className="relative z-10 max-w-[90%] space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-primary text-on-primary text-[10px] font-bold rounded-lg tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-secondary-fixed animate-pulse" />
              IA ASSISTENTE
            </span>
            <h4 className="font-display text-title-md text-primary leading-tight">Inteligência Comercial Metria</h4>
          </div>

          <p className="text-on-surface-variant text-xs leading-relaxed max-w-xl">
            Com base nos seus clientes em atendimento e carteira de imóveis, nossa inteligência analisa oportunidades de follow-up personalizados para você fechar negócios mais rápido.
          </p>

          <button
            onClick={handleGenerateAiTasks}
            disabled={isGeneratingAiTasks || !dbStatus?.geminiActive}
            className="px-5 py-3 bg-primary text-on-primary rounded-xl font-label-md text-xs font-bold hover:opacity-90 transition-all shadow-md flex items-center gap-2 disabled:opacity-55 cursor-pointer"
          >
            {isGeneratingAiTasks ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando Oportunidades com Gemini...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 text-secondary-fixed" />
                Analisar Oportunidades de Venda
              </>
            )}
          </button>

          {/* AI suggested tasks display */}
          {suggestedAiTasks.length > 0 && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <h5 className="text-xs font-bold text-primary uppercase tracking-wider">Oportunidades de Follow-up Identificadas:</h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {suggestedAiTasks.map((task, idx) => {
                  const added = aiTasksAdded[idx];
                  return (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-primary-container/20 shadow-sm flex flex-col justify-between gap-3 text-left">
                      <div className="space-y-1">
                        <div className="flex justify-between items-start gap-1">
                          <span className="text-[10px] font-bold text-secondary uppercase bg-secondary-container/20 px-2 py-0.5 rounded-md">
                            {task.type}
                          </span>
                          <span className="text-[10px] font-mono text-on-surface-variant font-bold">{task.time}</span>
                        </div>
                        <h6 className="font-bold text-on-surface text-sm leading-tight">{task.title}</h6>
                        <p className="text-[10px] text-on-surface-variant font-semibold">Cliente: {task.clientName}</p>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-3 mt-1 opacity-90">{task.description}</p>
                      </div>

                      <button
                        onClick={() => handleAddAiTask(task, idx)}
                        disabled={added}
                        className={`w-full py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          added
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-primary text-on-primary hover:opacity-95 shadow-sm"
                        }`}
                      >
                        {added ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Adicionado à Agenda!
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            Agendar na Timeline
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Asymmetric Promotional Banner */}
      <section className="relative bg-primary-container text-on-primary rounded-2xl overflow-hidden p-6 shadow-sm border border-primary-container/30 flex items-center">
        <div className="relative z-10 max-w-[65%] space-y-2">
          <h4 className="font-display text-headline-lg-mobile text-white leading-tight">Dicas de Venda e Captação</h4>
          <p className="text-xs text-on-primary-container opacity-90 leading-relaxed max-w-md">
            Converta leads frios em visitas ativas usando técnicas modernas de script e follow-up estruturados para corretores independentes.
          </p>
          <button className="bg-secondary-fixed text-on-secondary-fixed px-4 py-2 rounded-xl font-label-md text-xs font-bold hover:opacity-95 transition-all mt-2 cursor-pointer shadow-sm">
            Assistir Agora
          </button>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-30">
          <div
            className="w-full h-full bg-cover bg-center"
            style={{
              backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80')"
            }}
          ></div>
        </div>
      </section>

      {/* SECTION: PAINEL DE CONTROLE DO GESTOR & EQUIPE */}
      <section className="space-y-4 pt-4">
        <div className="space-y-1 text-left">
          <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
            <span className="p-1.5 bg-indigo-500/10 rounded-lg">
              <Users className="w-5 h-5 text-indigo-600" />
            </span>
            Painel de Controle do Gestor & Equipe
          </h3>
          <p className="text-xs text-on-surface-variant font-medium">
            Gerencie corretores de forma unificada, distribua leads de forma inteligente e acompanhe relatórios de produtividade.
          </p>
        </div>

        {currentPlan === "max" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-in fade-in duration-300">
            {/* Team Metric 1 */}
            <div className="bg-surface-container-low border border-outline-variant/20 p-5 rounded-2xl text-left space-y-2">
              <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider">Desempenho</span>
              <p className="text-xs text-on-surface-variant font-semibold">Leads Distribuídos (Este Mês)</p>
              <h5 className="font-display text-2xl font-black text-on-surface">32 <span className="text-xs text-emerald-600 font-bold">+18%</span></h5>
              <p className="text-[10px] text-on-surface-variant font-medium">Distribuição automática de leads activa por ordem de chegada.</p>
            </div>
            
            {/* Team Metric 2 */}
            <div className="bg-surface-container-low border border-outline-variant/20 p-5 rounded-2xl text-left space-y-2">
              <span className="text-[9px] bg-indigo-500/10 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Corretores</span>
              <p className="text-xs text-on-surface-variant font-semibold">Equipe Conectada</p>
              <h5 className="font-display text-2xl font-black text-on-surface">4 / 5 <span className="text-xs text-on-surface-variant font-medium">ativos</span></h5>
              <p className="text-[10px] text-on-surface-variant font-medium">1 vaga de corretor disponível no seu plano Max.</p>
            </div>

            {/* Team Metric 3 */}
            <div className="bg-surface-container-low border border-outline-variant/20 p-5 rounded-2xl text-left space-y-2">
              <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Metas</span>
              <p className="text-xs text-on-surface-variant font-semibold">Faturamento da Equipe (VGV)</p>
              <h5 className="font-display text-2xl font-black text-on-surface">R$ 4.250.000</h5>
              <p className="text-[10px] text-on-surface-variant font-medium">Corretor de maior conversão hoje: <span className="text-primary font-bold font-sans">Roberto Silva</span></p>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500/5 to-indigo-500/10 border border-indigo-500/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 text-left">
            {/* Decorative background blur lock */}
            <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
              <Users className="w-64 h-64 text-indigo-600" />
            </div>

            <div className="space-y-3 max-w-xl z-10">
              <span className="text-[9px] bg-indigo-500/10 text-indigo-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                Exclusivo Plano Max
              </span>
              <h4 className="font-display text-lg md:text-xl font-bold text-on-surface tracking-tight">
                Deseja gerenciar sua imobiliária e corretores parceiros em equipe?
              </h4>
              <p className="text-xs md:text-sm text-on-surface-variant/80 leading-relaxed">
                Desbloqueie o painel de gestor completo, relatórios integrados de produtividade por corretor, histórico de atendimentos e a distribuição automatizada de leads.
              </p>
            </div>

            <div className="shrink-0 z-10 font-sans">
              <button
                onClick={() => onNavigateToTab("settings")}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer group"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                Simular Upgrade para Max
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Unified Goals Configuration Modal */}
      <AnimatePresence>
        {showGoalConfigPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto text-left"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative bg-surface w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-outline-variant/30"
            >
              {/* Header */}
              <header className="flex justify-between items-center px-6 py-4 bg-surface border-b border-outline-variant sticky top-0 z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Settings className="w-4 h-4 animate-spin-slow" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-on-surface">Configurar Metas de Vendas</h2>
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Ajuste de Metas Anuais, Semestrais e Mensais</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGoalConfigPanel(false)}
                  className="p-1.5 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>

              {/* Form Body */}
              <form onSubmit={handleSaveAllGoals} className="flex flex-col flex-1 overflow-y-auto">
                <div className="p-6 space-y-5">
                  <div className="bg-primary/5 p-3 rounded-xl border border-primary/10 text-xs text-primary-container font-semibold">
                    <p className="leading-relaxed">
                      Ajuste os valores estimados para as metas de fechamento do seu funil. Os percentuais de atingimento serão recalculados em tempo real no dashboard.
                    </p>
                  </div>

                  {/* Monthly Goal Input */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Meta Mensal
                      </label>
                      {configGoalMensal && (
                        <span className="text-[11px] font-extrabold text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded-md">
                          {formatCompactBRL(Number(configGoalMensal.replace(/[^\d]/g, "")))}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant/75">R$</span>
                      <input
                        type="text"
                        required
                        value={configGoalMensal ? Number(configGoalMensal.replace(/[^\d]/g, "")).toLocaleString("pt-BR") : ""}
                        onChange={(e) => {
                          const numeric = e.target.value.replace(/[^\d]/g, "");
                          setConfigGoalMensal(numeric);
                        }}
                        placeholder="Ex: 3.000.000"
                        className="w-full pl-9 pr-4 py-2.5 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-bold text-on-surface"
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant/70 font-semibold italic">
                      VGV fechado no mês: <span className="font-bold text-primary">{formatCompactBRL(getClosedVgv("mensal"))}</span> 
                      {Number(configGoalMensal.replace(/[^\d]/g, "")) > 0 && (
                        <span> ({Math.min(100, Math.round((getClosedVgv("mensal") / Number(configGoalMensal.replace(/[^\d]/g, ""))) * 100))}% atingido)</span>
                      )}
                    </p>
                  </div>

                  {/* Semiannual Goal Input */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Meta Semestral
                      </label>
                      {configGoalSemestral && (
                        <span className="text-[11px] font-extrabold text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded-md">
                          {formatCompactBRL(Number(configGoalSemestral.replace(/[^\d]/g, "")))}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant/75">R$</span>
                      <input
                        type="text"
                        required
                        value={configGoalSemestral ? Number(configGoalSemestral.replace(/[^\d]/g, "")).toLocaleString("pt-BR") : ""}
                        onChange={(e) => {
                          const numeric = e.target.value.replace(/[^\d]/g, "");
                          setConfigGoalSemestral(numeric);
                        }}
                        placeholder="Ex: 18.000.000"
                        className="w-full pl-9 pr-4 py-2.5 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-bold text-on-surface"
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant/70 font-semibold italic">
                      VGV fechado no semestre: <span className="font-bold text-primary">{formatCompactBRL(getClosedVgv("semestral"))}</span> 
                      {Number(configGoalSemestral.replace(/[^\d]/g, "")) > 0 && (
                        <span> ({Math.min(100, Math.round((getClosedVgv("semestral") / Number(configGoalSemestral.replace(/[^\d]/g, ""))) * 100))}% atingido)</span>
                      )}
                    </p>
                  </div>

                  {/* Annual Goal Input */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Meta Anual
                      </label>
                      {configGoalAnual && (
                        <span className="text-[11px] font-extrabold text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded-md">
                          {formatCompactBRL(Number(configGoalAnual.replace(/[^\d]/g, "")))}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant/75">R$</span>
                      <input
                        type="text"
                        required
                        value={configGoalAnual ? Number(configGoalAnual.replace(/[^\d]/g, "")).toLocaleString("pt-BR") : ""}
                        onChange={(e) => {
                          const numeric = e.target.value.replace(/[^\d]/g, "");
                          setConfigGoalAnual(numeric);
                        }}
                        placeholder="Ex: 36.000.000"
                        className="w-full pl-9 pr-4 py-2.5 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-bold text-on-surface"
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant/70 font-semibold italic">
                      VGV fechado no ano: <span className="font-bold text-primary">{formatCompactBRL(getClosedVgv("anual"))}</span> 
                      {Number(configGoalAnual.replace(/[^\d]/g, "")) > 0 && (
                        <span> ({Math.min(100, Math.round((getClosedVgv("anual") / Number(configGoalAnual.replace(/[^\d]/g, ""))) * 100))}% atingido)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Footer buttons */}
                <footer className="p-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3 sticky bottom-0">
                  <button
                    type="button"
                    onClick={() => setShowGoalConfigPanel(false)}
                    className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold bg-primary text-on-primary hover:opacity-95 transition-all rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Alterações</span>
                  </button>
                </footer>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
