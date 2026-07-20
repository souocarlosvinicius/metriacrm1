import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import { 
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar 
} from "recharts";
import { 
  Settings, X, DollarSign, Flame, CheckCircle2, MapPin, Calendar, Pencil, TrendingUp,
  Brain, RefreshCw, AlertCircle, Loader2, Check, MessageSquare, ArrowRight, User as UserIcon, Sparkles,
  Home, Award, FileText, Users, HelpCircle, Search, ArrowUpDown
} from "lucide-react";
import { Property, Client, Task, User, Proposal, Visit, DBStatus, Organization, OrganizationMember } from "../types";
import { apiFetch } from "../api";
import InfoTour from "./InfoTour";

interface InfoViewProps {
  properties: Property[];
  clients: Client[];
  tasks: Task[];
  proposals: Proposal[];
  visits: Visit[];
  currentUser: User | null;
  onNavigateToTab: (tab: string) => void;
  dbStatus?: DBStatus;
  onSelectClient?: (client: Client) => void;
  onAddTask?: (task: Omit<Task, "id" | "_id">) => Promise<any>;
}

// Custom interactive tooltip for VGV evolution bar chart
const CustomVgvTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-md border border-emerald-800/10 p-3.5 rounded-xl shadow-xl text-left space-y-2.5 min-w-[210px] animate-in fade-in duration-100">
        <p className="font-display font-extrabold text-xs text-primary bg-primary-container/20 px-2.5 py-1 rounded-lg border border-primary-container/30 inline-block">
          Mês: {label}
        </p>
        <div className="space-y-2">
          {payload.map((entry: any, index: number) => {
            const isApproved = entry.name === "VGV Aprovado";
            const badgeColor = isApproved ? "bg-[#004d3e]" : "bg-[#cfa85c]";
            const textColor = isApproved ? "text-[#004d3e]" : "text-[#cfa85c]";
            return (
              <div key={`tooltip-item-${index}`} className="flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${badgeColor} inline-block`} />
                  <span className="text-on-surface-variant font-semibold">{entry.name}:</span>
                </div>
                <span className={`font-black ${textColor}`}>
                  R$ {Number(entry.value).toLocaleString("pt-BR")}
                </span>
              </div>
            );
          })}
          {payload.length > 1 && (
            <div className="flex items-center justify-between gap-4 text-xs pt-2 border-t border-dashed border-outline-variant/30 mt-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-0.5 bg-on-surface-variant/40 inline-block" />
                <span className="font-bold text-on-surface-variant">VGV Total:</span>
              </div>
              <span className="font-black text-[#004d3e] text-sm">
                R$ {payload.reduce((sum: number, entry: any) => sum + Number(entry.value), 0).toLocaleString("pt-BR")}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const MOCK_BROKERS = [
  {
    userId: "mock-1",
    name: "Mariana Costa",
    email: "mariana.costa@metriacrm.com.br",
    role: "broker",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    phone: "(11) 98765-4321",
    realizedVgv: 1850000,
    pipelineVgv: 3400000,
    visitsDone: 14,
    activeClients: 8,
  },
  {
    userId: "mock-2",
    name: "Roberto Alencar",
    email: "roberto.alencar@metriacrm.com.br",
    role: "broker",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    phone: "(11) 97654-3210",
    realizedVgv: 950000,
    pipelineVgv: 2100000,
    visitsDone: 8,
    activeClients: 5,
  },
  {
    userId: "mock-3",
    name: "Julia Siqueira",
    email: "julia.siqueira@metriacrm.com.br",
    role: "broker",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    phone: "(21) 96543-2109",
    realizedVgv: 2400000,
    pipelineVgv: 4800000,
    visitsDone: 18,
    activeClients: 12,
  },
  {
    userId: "mock-4",
    name: "Felipe Santos",
    email: "felipe.santos@metriacrm.com.br",
    role: "broker",
    avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    phone: "(11) 95432-1098",
    realizedVgv: 450000,
    pipelineVgv: 1500000,
    visitsDone: 5,
    activeClients: 3,
  }
];

export default function InfoView({
  properties,
  clients,
  tasks,
  proposals = [],
  visits = [],
  currentUser,
  onNavigateToTab,
  dbStatus,
  onSelectClient,
  onAddTask
}: InfoViewProps) {
  // Goals Tracking States & Storage
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
      mensal: 0,
      semestral: 0,
      anual: 0
    };
  });
  
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState("");
  const [showGoalConfigPanel, setShowGoalConfigPanel] = useState(false);
  const [configGoalMensal, setConfigGoalMensal] = useState("");
  const [configGoalSemestral, setConfigGoalSemestral] = useState("");
  const [configGoalAnual, setConfigGoalAnual] = useState("");

  // Brokers goals & team management state
  const [teamMembers, setTeamMembers] = useState<OrganizationMember[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [editingBrokerId, setEditingBrokerId] = useState<string | null>(null);
  const [editingBrokerName, setEditingBrokerName] = useState("");
  const [editingVgvGoal, setEditingVgvGoal] = useState("");
  const [editingVisitsGoal, setEditingVisitsGoal] = useState("");

  const [showTour, setShowTour] = useState(() => {
    try {
      const seen = localStorage.getItem("metria_crm_info_tour_seen");
      return !seen;
    } catch (e) {
      return false;
    }
  });

  // Monthly goals and editing states for VGV and Visits comparison section
  const [monthlyVisitsGoal, setMonthlyVisitsGoal] = useState(() => {
    try {
      const saved = localStorage.getItem("metria_crm_visits_goal");
      if (saved) {
        return Number(saved);
      }
    } catch (e) {
      console.error("Error loading visits goal:", e);
    }
    return 0; // default 0 visits per month
  });

  const [isEditingVgvGoal, setIsEditingVgvGoal] = useState(false);
  const [isEditingVisitsGoal, setIsEditingVisitsGoal] = useState(false);
  const [tempVgvGoalInput, setTempVgvGoalInput] = useState("");
  const [tempVisitsGoalInput, setTempVisitsGoalInput] = useState("");

  // Manager dashboard states for filtering, sorting and updates
  const [sortBy, setSortBy] = useState<"name" | "vgv" | "vgv_progress" | "visits" | "visits_progress">("vgv_progress");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [goalsVersion, setGoalsVersion] = useState<number>(0);

  const isManagerOrHigher = useMemo(() => {
    if (!currentUser) return false;
    const r = (currentUser.role || "").toLowerCase();
    const cr = (currentUser.currentRole || "").toLowerCase();
    return r === "owner" || r === "manager" || r === "admin" || r === "gerente" || r === "diretor" ||
           cr === "owner" || cr === "manager" || cr === "admin";
  }, [currentUser]);

  const saveGoals = (newGoals: typeof goals) => {
    setGoals(newGoals);
    localStorage.setItem("metria_crm_goals", JSON.stringify(newGoals));
  };

  const handleSaveVgvGoalInline = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = tempVgvGoalInput.replace(/[^\d]/g, "");
    const val = Number(cleanNum);
    if (isNaN(val) || val < 0) {
      alert("Por favor, insira um valor válido maior ou igual a zero.");
      return;
    }
    const updated = { ...goals, mensal: val };
    saveGoals(updated);
    setIsEditingVgvGoal(false);
  };

  const handleSaveVisitsGoalInline = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = tempVisitsGoalInput.replace(/[^\d]/g, "");
    const val = Number(cleanNum);
    if (isNaN(val) || val < 0) {
      alert("Por favor, insira um valor válido maior ou igual a zero.");
      return;
    }
    setMonthlyVisitsGoal(val);
    localStorage.setItem("metria_crm_visits_goal", val.toString());
    setIsEditingVisitsGoal(false);
  };

  const handleStartEditGoal = () => {
    setTempGoalInput(goals[goalPeriod].toString());
    setIsEditingGoal(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = tempGoalInput.replace(/[^\d]/g, "");
    const val = Number(cleanNum);
    if (isNaN(val) || val < 0) {
      alert("Por favor, insira um valor válido maior ou igual a zero.");
      return;
    }
    const updated = { ...goals, [goalPeriod]: val };
    saveGoals(updated);
    setIsEditingGoal(false);
  };

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

    if (isNaN(cleanMensal) || cleanMensal < 0 ||
        isNaN(cleanSemestral) || cleanSemestral < 0 ||
        isNaN(cleanAnual) || cleanAnual < 0) {
      alert("Por favor, insira valores válidos maiores ou iguais a zero para todas as metas.");
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

  // Current month's actual VGV (VGV Fechado no mês atual)
  const realizedMonthlyVgv = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    let sum = 0;
    let found = false;
    
    if (clients && clients.length > 0) {
      clients.forEach(c => {
        if (c.pipelineStatus === "Fechado" || c.status === "Ganho") {
          const closedDateStr = c.updatedAt || c.createdAt;
          if (closedDateStr) {
            const d = new Date(closedDateStr);
            if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
              sum += c.potentialValue || c.maxBudget || 0;
              found = true;
            }
          }
        }
      });
    }
    
    if (!found) {
      // fallback to sensible monthly closed value if zero
      const totalClosed = clients
        .filter(c => c.pipelineStatus === "Fechado" || c.status === "Ganho")
        .reduce((sum, c) => sum + (c.potentialValue || c.maxBudget || 0), 0);
      if (totalClosed > 0) {
        return Math.round(totalClosed * 0.4);
      }
      return 2400000; // fallback default
    }
    return sum;
  }, [clients]);

  // Current month's actual realized visits
  const realizedMonthlyVisits = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    let count = 0;
    let found = false;
    
    if (visits && visits.length > 0) {
      visits.forEach(v => {
        if (v.status === "Realizada" && v.date) {
          const d = new Date(v.date);
          if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            count++;
            found = true;
          }
        }
      });
    }
    
    if (!found) {
      const totalRealized = visits.filter(v => v.status === "Realizada").length;
      if (totalRealized > 0) {
        return totalRealized;
      }
      return 8; // default fallback
    }
    return count;
  }, [visits]);

  const currentGoalValue = goals[goalPeriod];
  const completedAmount = getClosedVgv(goalPeriod);
  const goalPercent = currentGoalValue > 0 ? Math.min(100, Math.round((completedAmount / currentGoalValue) * 100)) : 0;
  const radialStrokeDashoffset = 251.2 - (goalPercent / 100) * 251.2;
  const remainingAmount = Math.max(0, currentGoalValue - completedAmount);

  // Calculate total portfolio value of sales properties
  const totalSalesValue = properties
    .filter(p => p.modality === "Venda")
    .reduce((sum, p) => sum + p.price, 0);

  // Format total portfolio value (e.g. 19.1M)
  const formattedPortfolioValue = (totalSalesValue / 1000000).toFixed(1) + "M";

  // Indicator Calculations: VGV, Visitas, and Vendas
  const totalVgvPropriedades = totalSalesValue;
  const vgvPropostasAtivas = proposals
    .filter(p => p.status === "Pendente" || p.status === "Em Análise")
    .reduce((sum, p) => sum + (p.proposedValue || 0), 0);
  const vgvFechadoCrm = clients
    .filter(c => c.pipelineStatus === "Fechado" || c.status === "Ganho")
    .reduce((sum, c) => sum + (c.potentialValue || c.maxBudget || 0), 0);

  const visitasAgendadas = visits.filter(v => v.status === "Agendada").length;
  const visitasRealizadas = visits.filter(v => v.status === "Realizada").length;
  const visitasTotais = visits.length;

  const totalVendasConcluidas = clients.filter(c => c.pipelineStatus === "Fechado" || c.status === "Ganho").length;
  const propostasEmAnalise = proposals.filter(p => p.status === "Pendente" || p.status === "Em Análise").length;
  const taxaConversaoVendas = clients.length > 0
    ? Math.round((totalVendasConcluidas / clients.length) * 100)
    : 0;

  // Upcoming Visits (type 'VISITA', not completed)
  const upcomingVisits = tasks
    .filter(t => t.type === "VISITA" && !t.completed)
    .slice(0, 5);

  // Calculate user weekly task productivity
  const last7DaysData = useMemo(() => {
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

  const monthlyVgvData = useMemo(() => {
    const data = [];
    const monthNames = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", 
      "Jul", "Ago", "Set", "Out", "Nov", "Dez"
    ];
    
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      
      const approvedVgv = proposals
        .filter(p => {
          if (p.status !== "Aceita" || !p.date) return false;
          const [pYear, pMonth] = p.date.split("-").map(Number);
          return pYear === y && (pMonth - 1) === m;
        })
        .reduce((sum, p) => sum + (p.proposedValue || 0), 0);

      const pendingVgv = proposals
        .filter(p => {
          if (p.status !== "Pendente" && p.status !== "Em Análise" || !p.date) return false;
          const [pYear, pMonth] = p.date.split("-").map(Number);
          return pYear === y && (pMonth - 1) === m;
        })
        .reduce((sum, p) => sum + (p.proposedValue || 0), 0);
        
      data.push({
        monthKey: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: `${monthNames[m]}/${String(y).slice(-2)}`,
        "VGV Aprovado": approvedVgv,
        "Em Análise": pendingVgv,
        total: approvedVgv + pendingVgv
      });
    }
    return data;
  }, [proposals]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const primaryColor = [0, 77, 62]; // rgb(0, 77, 62) -> Metria primary green
    const secondaryColor = [207, 168, 92]; // rgb(207, 168, 92) -> Accent gold
    const darkGray = [40, 40, 40];
    const lightGray = [245, 247, 245];
    const white = [255, 255, 255];

    // Page 1
    // Top colored bar
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 12, "F");

    // Title & Brand
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text("METRIA CRM", 15, 26);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text("Relatorio de Desempenho e Indicadores Comerciais Consolidados", 15, 32);

    const nowStr = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${nowStr}`, 140, 26);
    if (currentUser?.name) {
      doc.text(`Corretor: ${currentUser.name}`, 140, 32);
    }

    doc.setDrawColor(210, 210, 210);
    doc.line(15, 38, 195, 38);

    // Section 1: Indicadores Principais
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.text("1. Indicadores de Desempenho Consolidados", 15, 47);

    // Three columns for KPIs
    let yStart = 53;
    
    // Column 1: VGV Geral
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(15, yStart, 56, 42, "F");
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(15, yStart, 56, 42, "D");
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(15, yStart, 56, 8, "F");
    doc.setTextColor(white[0], white[1], white[2]);
    doc.setFontSize(8.5);
    doc.setFont("Helvetica", "bold");
    doc.text("VGV GERAL", 19, yStart + 5.5);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.text("VGV sob Gestao:", 18, yStart + 14);
    doc.setFont("Helvetica", "bold");
    doc.text(formatCompactBRL(totalVgvPropriedades), 18, yStart + 18);

    doc.setFont("Helvetica", "normal");
    doc.text("Propostas Ativas:", 18, yStart + 25);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(formatCompactBRL(vgvPropostasAtivas), 18, yStart + 29);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont("Helvetica", "normal");
    doc.text("VGV Vendido:", 18, yStart + 36);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(formatCompactBRL(vgvFechadoCrm), 38, yStart + 36);

    // Column 2: Visitas & Acompanhamento
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(77, yStart, 56, 42, "F");
    doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.rect(77, yStart, 56, 42, "D");
    doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.rect(77, yStart, 56, 8, "F");
    doc.setTextColor(white[0], white[1], white[2]);
    doc.setFontSize(8.5);
    doc.setFont("Helvetica", "bold");
    doc.text("ACOMPANHAMENTO", 80, yStart + 5.5);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.text("Total de Visitas:", 80, yStart + 14);
    doc.setFont("Helvetica", "bold");
    doc.text(`${visitasTotais} visitas`, 80, yStart + 18);

    doc.setFont("Helvetica", "normal");
    doc.text("Visitas Confirmadas:", 80, yStart + 25);
    doc.setFont("Helvetica", "bold");
    doc.text(`${visitasAgendadas} agendadas`, 80, yStart + 29);

    doc.setFont("Helvetica", "normal");
    doc.text("Visitas Realizadas:", 80, yStart + 36);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${visitasRealizadas} concluidas`, 80, yStart + 40);

    // Column 3: Resultados
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.rect(139, yStart, 56, 42, "F");
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(139, yStart, 56, 42, "D");
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(139, yStart, 56, 8, "F");
    doc.setTextColor(white[0], white[1], white[2]);
    doc.setFontSize(8.5);
    doc.setFont("Helvetica", "bold");
    doc.text("RESULTADOS", 143, yStart + 5.5);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.text("Negocios Concluidos:", 142, yStart + 14);
    doc.setFont("Helvetica", "bold");
    doc.text(`${totalVendasConcluidas} fechamentos`, 142, yStart + 18);

    doc.setFont("Helvetica", "normal");
    doc.text("Taxa de Conversao:", 142, yStart + 25);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${taxaConversaoVendas}%`, 142, yStart + 29);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont("Helvetica", "normal");
    doc.text("Propostas em Analise:", 142, yStart + 36);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(`${propostasEmAnalise} propostas`, 142, yStart + 40);

    // Section 2: Evolução Mensal do VGV
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.text("2. Evolucao Mensal do VGV (Historico 6 Meses)", 15, 107);

    // Table Header
    let tableY = 113;
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(15, tableY, 180, 8, "F");
    doc.setTextColor(white[0], white[1], white[2]);
    doc.setFontSize(8.5);
    doc.setFont("Helvetica", "bold");
    doc.text("Mes / Ano", 20, tableY + 5.5);
    doc.text("VGV Aprovado (Aceito)", 65, tableY + 5.5);
    doc.text("Em Analise / Pendente", 120, tableY + 5.5);
    doc.text("VGV Total", 170, tableY + 5.5);

    // Table Rows
    monthlyVgvData.forEach((row, index) => {
      let rowY = tableY + 8 + (index * 7);
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 248);
        doc.rect(15, rowY, 180, 7, "F");
      }
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(row.label, 20, rowY + 5);
      
      doc.setFont("Helvetica", "bold");
      doc.text(formatCompactBRL(row["VGV Aprovado"]), 65, rowY + 5);
      
      doc.setFont("Helvetica", "normal");
      doc.text(formatCompactBRL(row["Em Análise"]), 120, rowY + 5);
      
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(formatCompactBRL(row.total), 170, rowY + 5);
    });

    // Total Summary under Table
    let summaryY = tableY + 8 + (monthlyVgvData.length * 7) + 5;
    doc.setDrawColor(220, 220, 220);
    doc.line(15, summaryY, 195, summaryY);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Total Aprovado Geral:", 15, summaryY + 6);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const totalAprov = monthlyVgvData.reduce((sum, item) => sum + item["VGV Aprovado"], 0);
    doc.text(`R$ ${totalAprov.toLocaleString("pt-BR")}`, 52, summaryY + 6);

    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.setFont("Helvetica", "normal");
    doc.text("Total em Analise:", 115, summaryY + 6);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    const totalAnalise = monthlyVgvData.reduce((sum, item) => sum + item["Em Análise"], 0);
    doc.text(`R$ ${totalAnalise.toLocaleString("pt-BR")}`, 143, summaryY + 6);

    // Draw a divider line
    doc.setDrawColor(200, 200, 200);
    doc.line(15, summaryY + 11, 195, summaryY + 11);

    // Brief explanatory text on algorithm/VGV calculations
    doc.setTextColor(110, 110, 110);
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(8);
    doc.text("* Os dados acima representam uma consolidacao automatica das propostas vinculadas a imoveis do CRM.", 15, summaryY + 17);

    // Footer Page 1
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text("Pagina 1 de 2", 180, 285);
    doc.text("Metria CRM - Inteligencia Comercial e de Vendas", 15, 285);

    // PAGE 2
    doc.addPage();

    // Top Green Bar for Page 2
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 12, "F");

    // Title Page 2
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.text("METRIA CRM", 15, 26);
    doc.setFontSize(10);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text("Detalhamento de Fechamentos e Negocios Concluidos", 15, 32);
    doc.line(15, 38, 195, 38);

    // Section 3: Tabela Resumo de Fechamentos
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.text("3. Relatorio de Vendas Concluidas (Status Fechado / Ganho)", 15, 47);

    const closedDeals = clients.filter(c => c.pipelineStatus === "Fechado" || c.status === "Ganho");

    let clientTableY = 53;
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(15, clientTableY, 180, 8, "F");
    doc.setTextColor(white[0], white[1], white[2]);
    doc.setFontSize(8.5);
    doc.setFont("Helvetica", "bold");
    doc.text("Cliente / Lead", 20, clientTableY + 5.5);
    doc.text("Contato (E-mail/Tel)", 65, clientTableY + 5.5);
    doc.text("Origem", 120, clientTableY + 5.5);
    doc.text("Valor Negocio", 155, clientTableY + 5.5);

    if (closedDeals.length > 0) {
      closedDeals.forEach((c, idx) => {
        let rowY = clientTableY + 8 + (idx * 9);
        
        if (rowY < 145) { // Prevent exceeding page limits or overlap
          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 248);
            doc.rect(15, rowY, 180, 9, "F");
          }
          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(8);
          const clientName = c.name.length > 22 ? c.name.slice(0, 20) + "..." : c.name;
          doc.text(clientName, 20, rowY + 6);

          doc.setFont("Helvetica", "normal");
          const contact = c.phone || c.email || "Sem contato";
          const shortContact = contact.length > 28 ? contact.slice(0, 25) + "..." : contact;
          doc.text(shortContact, 65, rowY + 6);

          const source = c.leadSource || "Direto / Outro";
          doc.text(source, 120, rowY + 6);

          doc.setFont("Helvetica", "bold");
          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          const val = c.potentialValue || c.maxBudget || 0;
          doc.text(`R$ ${val.toLocaleString("pt-BR")}`, 155, rowY + 6);
        }
      });
    } else {
      let rowY = clientTableY + 8;
      doc.setFillColor(252, 252, 252);
      doc.rect(15, rowY, 180, 12, "F");
      doc.setTextColor(110, 110, 110);
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text("Nenhum fechamento concluido (Status Fechado / Ganho) registrado ate o momento.", 25, rowY + 7.5);
    }

    // Section 4: Propostas Recentes / Ativas
    const activeProposals = proposals.filter(p => p.status === "Pendente" || p.status === "Em Análise" || p.status === "Aceita");
    let propTableStart = 153;
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.text("4. Propostas Ativas & Recentes no CRM", 15, propTableStart);

    let propTableY = propTableStart + 6;
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(15, propTableY, 180, 8, "F");
    doc.setTextColor(white[0], white[1], white[2]);
    doc.setFontSize(8.5);
    doc.setFont("Helvetica", "bold");
    doc.text("Cliente", 20, propTableY + 5.5);
    doc.text("Imovel de Interesse", 65, propTableY + 5.5);
    doc.text("Status Proposta", 125, propTableY + 5.5);
    doc.text("Valor Proposto", 155, propTableY + 5.5);

    if (activeProposals.length > 0) {
      activeProposals.slice(0, 9).forEach((p, idx) => {
        let rowY = propTableY + 8 + (idx * 9);
        if (rowY < 265) {
          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 248);
            doc.rect(15, rowY, 180, 9, "F");
          }
          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(8);
          const nameStr = p.clientName.length > 22 ? p.clientName.slice(0, 20) + "..." : p.clientName;
          doc.text(nameStr, 20, rowY + 6);

          doc.setFont("Helvetica", "normal");
          const propStr = p.propertyTitle.length > 28 ? p.propertyTitle.slice(0, 26) + "..." : p.propertyTitle;
          doc.text(propStr, 65, rowY + 6);

          doc.setFont("Helvetica", "bold");
          if (p.status === "Aceita") {
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          } else if (p.status === "Pendente" || p.status === "Em Análise") {
            doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
          } else {
            doc.setTextColor(120, 120, 120);
          }
          doc.text(p.status, 125, rowY + 6);

          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
          doc.text(`R$ ${p.proposedValue.toLocaleString("pt-BR")}`, 155, rowY + 6);
        }
      });
    } else {
      let rowY = propTableY + 8;
      doc.setFillColor(252, 252, 252);
      doc.rect(15, rowY, 180, 12, "F");
      doc.setTextColor(110, 110, 110);
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text("Nenhuma proposta pendente ou aceita registrada no momento.", 25, rowY + 7.5);
    }

    // Footer Page 2
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text("Pagina 2 de 2", 180, 285);
    doc.text("Metria CRM - Inteligencia Comercial e de Vendas", 15, 285);

    // Save and download PDF
    doc.save(`metria_crm_resumo_desempenho_${new Date().toISOString().split("T")[0]}.pdf`);
  };

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

  useEffect(() => {
    const fetchOrganizationAndMembers = async () => {
      if (!currentUser?.defaultOrganizationId) return;
      setLoadingTeam(true);
      try {
        const orgsRes = await apiFetch("/api/organizations");
        if (orgsRes.ok) {
          const orgs = await orgsRes.json();
          const activeOrg = orgs.find((o: any) => o.id === currentUser.defaultOrganizationId);
          if (activeOrg) {
            setOrganization(activeOrg);
            
            const membersRes = await apiFetch(`/api/organizations/members?organizationId=${currentUser.defaultOrganizationId}`);
            if (membersRes.ok) {
              const membersData = await membersRes.json();
              setTeamMembers(membersData);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados da equipe:", err);
      } finally {
        setLoadingTeam(false);
      }
    };

    fetchOrganizationAndMembers();
  }, [currentUser]);

  const brokersData = useMemo(() => {
    const isDemoActive = isDemoMode || !organization || !(organization.plan === "max" || organization.plan === "pro_max") || (isManagerOrHigher && teamMembers.length === 0);
    
    if (isDemoActive) {
      return MOCK_BROKERS.map((broker) => {
        const saved = localStorage.getItem(`metria_broker_goals_${broker.userId}`);
        let vgvGoal = 1500000;
        let visitsGoal = 12;
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            vgvGoal = parsed.vgvGoal || vgvGoal;
            visitsGoal = parsed.visitsGoal || visitsGoal;
          } catch (_) {}
        }
        return {
          ...broker,
          vgvGoal,
          visitsGoal,
        };
      });
    }

    return teamMembers.map((member) => {
      const realizedVgv = (proposals || [])
        .filter((p) => p.assignedTo === member.userId && p.status === "Aceita")
        .reduce((sum, p) => sum + (p.proposedValue || 0), 0);

      const pipelineVgv = (proposals || [])
        .filter((p) => p.assignedTo === member.userId && (p.status === "Pendente" || p.status === "Em Análise"))
        .reduce((sum, p) => sum + (p.proposedValue || 0), 0);

      const visitsDone = (visits || []).filter((v) => v.assignedTo === member.userId && v.status === "Realizada").length;

      const activeClients = (clients || []).filter((c) => c.assignedTo === member.userId && c.pipelineStatus !== "Ganho" && c.pipelineStatus !== "Perdido").length;

      const saved = localStorage.getItem(`metria_broker_goals_${member.userId}`);
      let vgvGoal = 1500000;
      let visitsGoal = 12;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          vgvGoal = parsed.vgvGoal || vgvGoal;
          visitsGoal = parsed.visitsGoal || visitsGoal;
        } catch (_) {}
      }

      return {
        userId: member.userId,
        name: member.name || member.email?.split("@")[0] || "Corretor",
        email: member.email || "",
        role: member.role || "broker",
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(member.name || "C")}`,
        phone: member.phone || "Sem telefone",
        realizedVgv,
        pipelineVgv,
        visitsDone,
        activeClients,
        vgvGoal,
        visitsGoal,
      };
    });
  }, [isDemoMode, organization, teamMembers, proposals, visits, clients, isManagerOrHigher, goalsVersion]);

  const handleSaveBrokerGoals = (brokerId: string, vgv: number, visitsCount: number) => {
    localStorage.setItem(`metria_broker_goals_${brokerId}`, JSON.stringify({ vgvGoal: vgv, visitsGoal: visitsCount }));
    setGoalsVersion(prev => prev + 1);
    setEditingBrokerId(null);
  };

  const sortedAndFilteredBrokers = useMemo(() => {
    let list = [...brokersData];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        b => b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q)
      );
    }

    // Filter by role
    if (filterRole !== "all") {
      list = list.filter(b => b.role === filterRole);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "vgv") {
        return b.realizedVgv - a.realizedVgv;
      }
      if (sortBy === "vgv_progress") {
        const progressA = a.realizedVgv / (a.vgvGoal || 1);
        const progressB = b.realizedVgv / (b.vgvGoal || 1);
        return progressB - progressA;
      }
      if (sortBy === "visits") {
        return b.visitsDone - a.visitsDone;
      }
      if (sortBy === "visits_progress") {
        const progressA = a.visitsDone / (a.visitsGoal || 1);
        const progressB = b.visitsDone / (b.visitsGoal || 1);
        return progressB - progressA;
      }
      return 0;
    });

    return list;
  }, [brokersData, sortBy, filterRole, searchQuery]);

  const teamAggregates = useMemo(() => {
    const totalBrokers = brokersData.length;
    const totalRealizedVgv = brokersData.reduce((sum, b) => sum + b.realizedVgv, 0);
    const totalVgvGoal = brokersData.reduce((sum, b) => sum + b.vgvGoal, 0);
    const totalVisitsDone = brokersData.reduce((sum, b) => sum + b.visitsDone, 0);
    const totalVisitsGoal = brokersData.reduce((sum, b) => sum + b.visitsGoal, 0);
    
    const averageVgvProgress = totalVgvGoal > 0 ? Math.round((totalRealizedVgv / totalVgvGoal) * 100) : 0;
    const averageVisitsProgress = totalVisitsGoal > 0 ? Math.round((totalVisitsDone / totalVisitsGoal) * 100) : 0;

    // Find top performer (by VGV progress)
    let topPerformer = null;
    let maxProgress = -1;
    brokersData.forEach(b => {
      const progress = b.realizedVgv / (b.vgvGoal || 1);
      if (progress > maxProgress) {
        maxProgress = progress;
        topPerformer = b;
      }
    });

    return {
      totalBrokers,
      totalRealizedVgv,
      totalVgvGoal,
      totalVisitsDone,
      totalVisitsGoal,
      averageVgvProgress,
      averageVisitsProgress,
      topPerformer
    };
  }, [brokersData]);

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
      if (onAddTask) {
        await onAddTask(taskPayload);
        setTaskAddedFeedback(prev => ({ ...prev, [actionId]: true }));
      }
    } catch (err) {
      console.error("Erro ao agendar tarefa a partir da recomendação:", err);
      alert("Falha ao agendar tarefa.");
    } finally {
      setExecutingActionId(null);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* View Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 pb-5">
        <div>
          <h1 className="font-display text-headline-md font-bold text-primary flex items-center gap-2">
            <span className="p-2 bg-primary/10 rounded-xl text-primary">
              <TrendingUp className="w-6 h-6" />
            </span>
            Informações
          </h1>
          <p className="text-body-md text-on-surface-variant font-medium mt-1">
            Métricas de desempenho, metas comerciais, volume de vendas sob gestão e produtividade.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTour(true)}
            className="px-4 py-2.5 bg-secondary-container hover:bg-secondary-container/90 text-on-secondary-container font-black text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer border border-secondary/30"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Tour da Página</span>
          </button>
          <button
            id="info-tour-export-pdf"
            onClick={handleExportPDF}
            className="px-4 py-2.5 bg-primary hover:bg-primary/95 text-on-primary font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            Exportar Resumo PDF
          </button>
        </div>
      </header>

      {/* Indicadores Principais de VGV, Visitas e Vendas */}
      <section id="info-tour-kpis" className="space-y-4">
        <h2 className="font-display text-title-md text-on-surface font-bold">Indicadores de Desempenho Consolidados</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card VGV */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] bg-indigo-500/10 text-indigo-800 font-extrabold uppercase px-2 py-0.5 rounded-full">
                VGV Geral
              </span>
              <DollarSign className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-on-surface-variant font-semibold">VGV sob Gestão</p>
                <p className="font-display text-2xl font-black text-on-surface">
                  {formatCompactBRL(totalVgvPropriedades)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/20 text-xs">
                <div>
                  <p className="text-on-surface-variant font-medium">Propostas Ativas</p>
                  <p className="font-bold text-indigo-600">{formatCompactBRL(vgvPropostasAtivas)}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant font-medium">VGV Vendido</p>
                  <p className="font-bold text-emerald-600">{formatCompactBRL(vgvFechadoCrm)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card Visitas */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] bg-orange-500/10 text-orange-800 font-extrabold uppercase px-2 py-0.5 rounded-full">
                Acompanhamento
              </span>
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-on-surface-variant font-semibold">Total de Visitas</p>
                <p className="font-display text-2xl font-black text-on-surface">
                  {visitasTotais} {visitasTotais === 1 ? "Visita" : "Visitas"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/20 text-xs">
                <div>
                  <p className="text-on-surface-variant font-medium">Confirmadas</p>
                  <p className="font-bold text-orange-600">{visitasAgendadas}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant font-medium">Realizadas</p>
                  <p className="font-bold text-emerald-600">{visitasRealizadas}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card Vendas */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] bg-emerald-500/10 text-emerald-800 font-extrabold uppercase px-2 py-0.5 rounded-full">
                Resultados
              </span>
              <Award className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-on-surface-variant font-semibold">Fechamentos Concluídos</p>
                <p className="font-display text-2xl font-black text-on-surface">
                  {totalVendasConcluidas} {totalVendasConcluidas === 1 ? "Negócio" : "Negócios"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/20 text-xs">
                <div>
                  <p className="text-on-surface-variant font-medium">Tx. Conversão</p>
                  <p className="font-bold text-emerald-600">{taxaConversaoVendas}%</p>
                </div>
                <div>
                  <p className="text-on-surface-variant font-medium">Em Análise</p>
                  <p className="font-bold text-blue-600">{propostasEmAnalise} {propostasEmAnalise === 1 ? "prop." : "props."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Info Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* VGV Total sob Gestão Card */}
        <div className="md:col-span-1 bg-primary text-on-primary p-6 rounded-2xl shadow-md flex flex-col justify-between h-40 relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
            <DollarSign className="w-36 h-36 stroke-[1]" />
          </div>
          <DollarSign className="text-secondary-fixed w-6 h-6 stroke-[2]" />
          <div className="z-10 space-y-1">
            <p className="font-label-md text-sm text-secondary-fixed opacity-90 uppercase tracking-wider font-bold">VGV Total sob Gestão</p>
            <p className="font-display text-4xl font-black">R$ {formattedPortfolioValue}</p>
            <p className="text-[11px] opacity-75">Soma do valor de venda de todos os imóveis ativos cadastrados.</p>
          </div>
        </div>

        {/* Highlight Meta Progress Bar Summary */}
        <div className="md:col-span-2 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between h-40">
          <div className="flex justify-between items-center">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-extrabold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Atingimento de Metas do CRM
            </p>
            <span className="text-[10px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-black uppercase">
              {goalPeriod === "mensal" ? "Mensal" : goalPeriod === "semestral" ? "Semestral" : "Anual"}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <p className="text-3xl font-display font-black text-on-surface">{goalPercent}%</p>
              <p className="text-xs text-on-surface-variant font-semibold">
                {formatCompactBRL(completedAmount)} de <span className="font-bold text-primary">{formatCompactBRL(currentGoalValue)}</span>
              </p>
            </div>
            <div className="w-full bg-surface-container h-4 rounded-full overflow-hidden border border-outline-variant/10">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${goalPercent}%` }}
              ></div>
            </div>
          </div>
          <p className="text-[11px] text-on-surface-variant/80 font-medium italic">
            Meta estimada de VGV para o período. Edite os valores na seção de metas abaixo.
          </p>
        </div>
      </div>

      {/* Progress & Upcoming Visits row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goals Radial Chart */}
        <section id="info-tour-global-goals" className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="font-display text-title-md text-on-surface leading-snug font-bold">Minha Meta de Fechamento</h3>
                <button
                  type="button"
                  onClick={handleOpenGoalConfig}
                  className="p-1 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg transition-all cursor-pointer"
                  title="Configurar metas (mensais, semestrais e anuais)"
                >
                  <Settings className="w-4 h-4" />
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
                  Meta {goalPeriod === "mensal" ? "Meta Mensal" : goalPeriod === "semestral" ? "Meta Semestral" : "Meta Anual"}:{" "}
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
                <p className="font-display text-headline-lg-mobile text-primary font-black">{goalPercent}%</p>
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
            <h3 className="font-display text-title-md text-on-surface leading-snug font-bold">Visitas Confirmadas</h3>
            <button onClick={() => onNavigateToTab("tasks")} className="text-xs text-secondary hover:underline font-semibold">
              Ver Agenda
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[220px] pr-1">
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

      {/* SEÇÃO METAS MENSAIS COMERCIAIS */}
      <section id="info-tour-monthly-goals" className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm text-left space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
          <div className="space-y-1">
            <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
              <span className="p-1.5 bg-[#004d3e]/10 text-[#004d3e] rounded-lg">
                <Award className="w-5 h-5" />
              </span>
              Metas Comerciais do Mês
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Defina suas metas mensais de fechamento de VGV e visitas, e acompanhe o progresso realizado em tempo real.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CARD META DE VGV */}
          <div className="p-5 bg-surface rounded-2xl border border-outline-variant/20 flex flex-col justify-between space-y-4 hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#004d3e]/10 flex items-center justify-center text-[#004d3e]">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-on-surface text-sm">Meta de VGV Mensal</h4>
                  <p className="text-[10px] text-on-surface-variant font-medium">Volume de Vendas sob Gestão</p>
                </div>
              </div>

              {!isEditingVgvGoal ? (
                <button
                  type="button"
                  onClick={() => {
                    setTempVgvGoalInput(goals.mensal.toString());
                    setIsEditingVgvGoal(true);
                  }}
                  className="px-2.5 py-1 text-primary hover:bg-primary/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Ajustar</span>
                </button>
              ) : (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Editando</span>
              )}
            </div>

            {isEditingVgvGoal ? (
              <form onSubmit={handleSaveVgvGoalInline} className="bg-primary/5 p-4 rounded-xl border border-primary/15 space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-wide text-primary">Nova Meta de VGV Mensal</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">R$</span>
                    <input
                      type="text"
                      value={tempVgvGoalInput ? Number(tempVgvGoalInput).toLocaleString("pt-BR") : ""}
                      onChange={(e) => setTempVgvGoalInput(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="Ex: 3.000.000"
                      className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg pl-8 pr-2 py-1.5 text-xs font-bold outline-none"
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="px-3 py-1.5 bg-primary text-on-primary hover:opacity-95 text-xs font-bold rounded-lg cursor-pointer">Salvar</button>
                  <button type="button" onClick={() => { setTempVgvGoalInput("0"); }} className="px-3 py-1.5 bg-error/10 text-error hover:bg-error/20 text-xs font-bold rounded-lg cursor-pointer">Zerar</button>
                  <button type="button" onClick={() => setIsEditingVgvGoal(false)} className="px-3 py-1.5 bg-surface-container border border-outline-variant/30 text-on-surface hover:bg-surface-container-high text-xs font-bold rounded-lg cursor-pointer">X</button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {/* Metas info */}
                <div className="grid grid-cols-2 gap-4 bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/10 text-xs">
                  <div>
                    <span className="text-on-surface-variant block font-medium">Meta Definida</span>
                    <span className="text-base font-black text-on-surface">{formatCompactBRL(goals.mensal)}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block font-medium">Realizado no Mês</span>
                    <span className="text-base font-black text-primary">{formatCompactBRL(realizedMonthlyVgv)}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-on-surface-variant uppercase">Atingimento</span>
                    <span className="text-primary">{goals.mensal > 0 ? Math.round((realizedMonthlyVgv / goals.mensal) * 100) : 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden border border-outline-variant/10">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, goals.mensal > 0 ? (realizedMonthlyVgv / goals.mensal) * 100 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Motivational footer text */}
                <div className="text-[11px] font-medium leading-relaxed">
                  {realizedMonthlyVgv >= goals.mensal ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      🎉 Parabéns! Você superou sua meta de VGV mensal neste período!
                    </span>
                  ) : (
                    <span className="text-on-surface-variant">
                      Falta <strong className="text-secondary font-bold">{formatCompactBRL(goals.mensal - realizedMonthlyVgv)}</strong> para atingir o objetivo planejado.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* CARD META DE VISITAS */}
          <div className="p-5 bg-surface rounded-2xl border border-outline-variant/20 flex flex-col justify-between space-y-4 hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-on-surface text-sm">Meta de Visitas Mensais</h4>
                  <p className="text-[10px] text-on-surface-variant font-medium">Acompanhamento e Relacionamento</p>
                </div>
              </div>

              {!isEditingVisitsGoal ? (
                <button
                  type="button"
                  onClick={() => {
                    setTempVisitsGoalInput(monthlyVisitsGoal.toString());
                    setIsEditingVisitsGoal(true);
                  }}
                  className="px-2.5 py-1 text-primary hover:bg-primary/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Ajustar</span>
                </button>
              ) : (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Editando</span>
              )}
            </div>

            {isEditingVisitsGoal ? (
              <form onSubmit={handleSaveVisitsGoalInline} className="bg-primary/5 p-4 rounded-xl border border-primary/15 space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-wide text-primary">Nova Meta de Visitas</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={tempVisitsGoalInput}
                      onChange={(e) => setTempVisitsGoalInput(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="Ex: 15"
                      className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="px-3 py-1.5 bg-primary text-on-primary hover:opacity-95 text-xs font-bold rounded-lg cursor-pointer">Salvar</button>
                  <button type="button" onClick={() => { setTempVisitsGoalInput("0"); }} className="px-3 py-1.5 bg-error/10 text-error hover:bg-error/20 text-xs font-bold rounded-lg cursor-pointer">Zerar</button>
                  <button type="button" onClick={() => setIsEditingVisitsGoal(false)} className="px-3 py-1.5 bg-surface-container border border-outline-variant/30 text-on-surface hover:bg-surface-container-high text-xs font-bold rounded-lg cursor-pointer">X</button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {/* Metas info */}
                <div className="grid grid-cols-2 gap-4 bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/10 text-xs">
                  <div>
                    <span className="text-on-surface-variant block font-medium">Meta Definida</span>
                    <span className="text-base font-black text-on-surface">{monthlyVisitsGoal} visitas</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block font-medium">Realizadas no Mês</span>
                    <span className="text-base font-black text-primary">{realizedMonthlyVisits} realizadas</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-on-surface-variant uppercase">Atingimento</span>
                    <span className="text-primary">{monthlyVisitsGoal > 0 ? Math.round((realizedMonthlyVisits / monthlyVisitsGoal) * 100) : 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden border border-outline-variant/10">
                    <div 
                      className="h-full bg-secondary rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, monthlyVisitsGoal > 0 ? (realizedMonthlyVisits / monthlyVisitsGoal) * 100 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Motivational footer text */}
                <div className="text-[11px] font-medium leading-relaxed">
                  {realizedMonthlyVisits >= monthlyVisitsGoal ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      🎉 Incrível! Você atingiu sua meta de visitas deste mês!
                    </span>
                  ) : (
                    <span className="text-on-surface-variant">
                      Faltam <strong className="text-secondary font-bold">{Math.max(0, monthlyVisitsGoal - realizedMonthlyVisits)} visitas</strong> para atingir o objetivo planejado.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SEÇÃO EVOLUÇÃO DO VGV MENSAL */}
      <section id="info-tour-vgv-chart" className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm text-left space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
              <span className="p-1.5 bg-primary/10 text-primary rounded-lg">
                <TrendingUp className="w-5 h-5 text-primary" />
              </span>
              Evolução Mensal do VGV
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Acompanhamento de receita e volume geral de vendas com propostas aprovadas (Aceitas) e em análise
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="text-left bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/10">
              <span className="text-[10px] text-on-surface-variant block uppercase tracking-wider">Aprovado (Últimos 6 meses)</span>
              <span className="text-sm font-black text-primary">
                {formatCompactBRL(
                  monthlyVgvData.reduce((sum, item) => sum + item["VGV Aprovado"], 0)
                )}
              </span>
            </div>
            <div className="text-left bg-secondary/5 px-3 py-1.5 rounded-xl border border-secondary/10">
              <span className="text-[10px] text-on-surface-variant block uppercase tracking-wider">Em Análise</span>
              <span className="text-sm font-black text-secondary">
                {formatCompactBRL(
                  monthlyVgvData.reduce((sum, item) => sum + item["Em Análise"], 0)
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Recharts Container for Monthly VGV */}
        <div className="w-full h-64 mt-4" style={{ minHeight: "256px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlyVgvData}
              margin={{ top: 15, right: 5, left: -10, bottom: 5 }}
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ebf0ec" />
              <XAxis 
                dataKey="label" 
                tick={{ fill: "#49544c", fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={(val) => formatCompactBRL(val).replace("R$ ", "")}
                tick={{ fill: "#49544c", fontSize: 10, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                content={<CustomVgvTooltip />}
                cursor={{ fill: "rgba(0, 77, 62, 0.03)" }}
              />
              <Legend 
                verticalAlign="top" 
                height={32}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px", fontWeight: "bold", paddingBottom: "10px" }}
              />
              <Bar dataKey="VGV Aprovado" fill="#004d3e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Em Análise" fill="#cfa85c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {monthlyVgvData.reduce((sum, item) => sum + item.total, 0) === 0 && (
          <p className="text-center text-xs text-on-surface-variant/70 font-semibold italic bg-surface-container-low p-3 rounded-xl border border-outline-variant/10">
            Nenhuma proposta registrada ou aprovada no período de 6 meses. Registre propostas no CRM para alimentar o gráfico.
          </p>
        )}
      </section>

      {/* SEÇÃO RECOMENDAÇÕES INTELIGENTES (PRÓXIMA MELHOR AÇÃO) */}
      <section id="info-tour-recommendations" className="space-y-4">
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

      {/* SEÇÃO DESEMPENHO E METAS DA EQUIPE */}
      <section id="info-tour-team-performance" className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm text-left space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
          <div className="space-y-1">
            <h3 className="font-display text-title-lg text-primary font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-secondary" />
              <span>Desempenho e Metas da Equipe</span>
              {isManagerOrHigher && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold uppercase px-2 py-0.5 rounded-full shadow-xs">
                  Acesso Gestor
                </span>
              )}
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Compare metas individuais de faturamento (VGV) e visitas de cada corretor da imobiliária.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isDemoMode && (
              <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Modo Simulação
              </span>
            )}
            {!isDemoMode && organization && (organization.plan === "max" || organization.plan === "pro_max") && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Plano Ativo
              </span>
            )}
          </div>
        </div>

        {/* Verifica se possui permissão de plano de equipe ou se possui cargo de gerência */}
        {!(organization && (organization.plan === "max" || organization.plan === "pro_max")) && !isDemoMode && !isManagerOrHigher ? (
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 p-6 bg-surface-container/60 border border-outline-variant/40 rounded-xl">
            <div className="space-y-3 max-w-xl text-left">
              <span className="text-[10px] bg-[#cfa85c]/10 text-[#cfa85c] border border-[#cfa85c]/30 font-extrabold uppercase px-2.5 py-1 rounded-full inline-block">
                Recurso Premium
              </span>
              <h4 className="font-display font-bold text-primary text-base">Gestão de Equipe & Controle de Metas</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed font-medium">
                Sua assinatura atual não inclui ferramentas nativas para controle de múltiplos corretores, gráficos de vendas por corretor e metas dinâmicas de equipe.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-on-surface font-semibold pt-1">
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-secondary shrink-0" />
                  <span>Metas de faturamento individuais</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-secondary shrink-0" />
                  <span>Gráfico comparativo de VGV Realizado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-secondary shrink-0" />
                  <span>Acompanhamento de visitas mensais</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-secondary shrink-0" />
                  <span>Indicadores de pipeline e contatos ativos</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setIsDemoMode(true)}
                className="px-5 py-3 bg-[#004d3e]/10 hover:bg-[#004d3e]/20 text-[#004d3e] font-extrabold text-xs rounded-xl transition-all shadow-sm active:scale-95 text-center flex-1 sm:flex-initial cursor-pointer"
              >
                Simular Visualização
              </button>
              <button
                type="button"
                onClick={() => {
                  const event = new CustomEvent("navigate-to-settings-plan");
                  window.dispatchEvent(event);
                }}
                className="px-5 py-3 bg-primary hover:bg-primary/90 text-on-primary font-black text-xs rounded-xl shadow-md transition-all active:scale-95 text-center flex-1 sm:flex-initial cursor-pointer"
              >
                Fazer Upgrade
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* SEÇÃO 1: PAINEL DE DESEMPENHO CONSOLIDADO (DASHBOARD DO GESTOR) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: VGV Consolidado */}
              <div className="bg-surface-container-low p-4.5 rounded-xl border border-outline-variant/30 flex flex-col justify-between space-y-3 hover:border-primary/40 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] bg-primary/10 text-primary font-extrabold uppercase px-2 py-0.5 rounded-full">
                    VGV Consolidado
                  </span>
                  <DollarSign className="w-4 h-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Meta Coletiva</p>
                  <p className="font-display text-lg font-black text-on-surface">
                    {formatCompactBRL(teamAggregates.totalRealizedVgv)} <span className="text-xs text-on-surface-variant font-medium">/ {formatCompactBRL(teamAggregates.totalVgvGoal)}</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-on-surface-variant">Progresso Geral</span>
                    <span className="text-primary">{teamAggregates.averageVgvProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-primary" 
                      style={{ width: `${Math.min(100, teamAggregates.averageVgvProgress)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Visitas Consolidadas */}
              <div className="bg-surface-container-low p-4.5 rounded-xl border border-outline-variant/30 flex flex-col justify-between space-y-3 hover:border-primary/40 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] bg-secondary-container text-on-secondary-container font-extrabold uppercase px-2 py-0.5 rounded-full">
                    Visitas Coletivas
                  </span>
                  <Calendar className="w-4 h-4 text-secondary" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Total Realizado</p>
                  <p className="font-display text-lg font-black text-on-surface">
                    {teamAggregates.totalVisitsDone} <span className="text-xs text-on-surface-variant font-medium">/ {teamAggregates.totalVisitsGoal} visitas</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-on-surface-variant">Meta Atingida</span>
                    <span className="text-secondary">{teamAggregates.averageVisitsProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-secondary" 
                      style={{ width: `${Math.min(100, teamAggregates.averageVisitsProgress)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Corretor Destaque */}
              <div className="bg-surface-container-low p-4.5 rounded-xl border border-outline-variant/30 flex flex-col justify-between space-y-3 hover:border-primary/40 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] bg-[#cfa85c]/10 text-[#cfa85c] font-extrabold uppercase px-2 py-0.5 rounded-full">
                    Líder de Vendas
                  </span>
                  <Award className="w-4 h-4 text-[#cfa85c]" />
                </div>
                {teamAggregates.topPerformer ? (
                  <div className="flex items-center gap-2.5">
                    <img 
                      src={teamAggregates.topPerformer.avatarUrl} 
                      alt={teamAggregates.topPerformer.name} 
                      className="w-8 h-8 rounded-full border border-[#004d3e]/20 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 text-left">
                      <p className="font-bold text-xs text-on-surface truncate">{teamAggregates.topPerformer.name}</p>
                      <p className="text-[10px] text-emerald-700 font-extrabold">
                        {formatCompactBRL(teamAggregates.topPerformer.realizedVgv)} fechados
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant font-medium">Nenhum resultado registrado</p>
                )}
                <div className="text-[10px] text-on-surface-variant/70 font-semibold text-left">
                  Maior percentual de atingimento individual da imobiliária.
                </div>
              </div>

              {/* Card 4: Gestão do Funil Coletivo */}
              <div className="bg-surface-container-low p-4.5 rounded-xl border border-outline-variant/30 flex flex-col justify-between space-y-3 hover:border-primary/40 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-800 font-extrabold uppercase px-2 py-0.5 rounded-full">
                    Geral Sob Gestão
                  </span>
                  <Users className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="space-y-1 text-left">
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Contatos e Pipeline</p>
                  <p className="font-display text-lg font-black text-on-surface">
                    {brokersData.reduce((sum, b) => sum + b.activeClients, 0)} <span className="text-xs text-on-surface-variant font-medium">Leads Ativos</span>
                  </p>
                </div>
                <div className="text-[10px] text-on-surface-variant/75 font-semibold text-left">
                  Pipeline total em negociação: <strong className="text-indigo-600">{formatCompactBRL(brokersData.reduce((sum, b) => sum + b.pipelineVgv, 0))}</strong>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: BARRA DE CONTROLE DO GESTOR (PESQUISA, FILTRO E ORDENAÇÃO) */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-surface rounded-xl border border-outline-variant/20 shadow-xs">
              {/* Barra de Pesquisa */}
              <div className="relative w-full md:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                <input
                  type="text"
                  placeholder="Pesquisar por corretor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl pl-9 pr-4 py-2 text-xs font-medium text-on-surface outline-none shadow-2xs placeholder:text-on-surface-variant/50"
                />
              </div>

              {/* Filtros e Ordenação */}
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                {/* Filtro de Cargo */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-on-surface-variant font-bold uppercase text-[9px] tracking-wider shrink-0">Cargo:</span>
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-2.5 py-1.5 text-xs font-bold text-on-surface outline-none cursor-pointer"
                  >
                    <option value="all">Todos os Cargos</option>
                    <option value="owner">Diretores</option>
                    <option value="manager">Gestores</option>
                    <option value="broker">Corretores</option>
                  </select>
                </div>

                {/* Ordenação */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-on-surface-variant font-bold uppercase text-[9px] tracking-wider shrink-0">Ordenar por:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-2.5 py-1.5 text-xs font-bold text-on-surface outline-none cursor-pointer"
                  >
                    <option value="vgv_progress">Meta VGV Atingida (%)</option>
                    <option value="vgv">Maior VGV Realizado</option>
                    <option value="visits_progress">Meta Visitas Atingida (%)</option>
                    <option value="visits">Mais Visitas Feitas</option>
                    <option value="name">Nome (A-Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: GRÁFICO DINÂMICO COMPARATIVO (REALIZADO VS META) */}
            <div className="bg-surface p-5 rounded-xl border border-outline-variant/30 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-display font-bold text-primary text-sm">Visualização de Metas Coletivas vs Realizado</h4>
                  <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">
                    Atualiza-se em tempo real com base nos filtros e critérios selecionados na barra de controle.
                  </p>
                </div>
                {isDemoMode && (
                  <button
                    type="button"
                    onClick={() => setIsDemoMode(false)}
                    className="text-xs text-amber-800 hover:text-amber-900 font-bold underline decoration-dotted cursor-pointer"
                  >
                    Encerrar Simulação
                  </button>
                )}
              </div>
              <div className="w-full h-[260px]">
                {sortedAndFilteredBrokers.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sortedAndFilteredBrokers} margin={{ top: 10, right: 5, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0, 77, 62, 0.05)" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#606b64", fontSize: 10, fontWeight: "bold" }} />
                      <YAxis tickFormatter={(val) => `R$ ${(val / 1000000).toFixed(1)}M`} tickLine={false} axisLine={false} tick={{ fill: "#606b64", fontSize: 10 }} />
                      <Tooltip 
                        formatter={(value: any, name: any) => [
                          `R$ ${Number(value).toLocaleString("pt-BR")}`,
                          name === "realizedVgv" ? "VGV Realizado" : "Meta de VGV"
                        ]} 
                        contentStyle={{ background: "#ffffff", borderRadius: "12px", border: "1px solid rgba(0, 77, 62, 0.1)", fontSize: "11px", fontWeight: "600" }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                      <Bar dataKey="realizedVgv" name="VGV Realizado" fill="#004d3e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="vgvGoal" name="Meta de VGV" fill="#cfa85c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant gap-1">
                    <p className="text-xs font-bold">Nenhum corretor corresponde aos filtros aplicados.</p>
                    <p className="text-[10px]">Tente redefinir a pesquisa ou selecionar outro cargo.</p>
                  </div>
                )}
              </div>
            </div>

            {/* SEÇÃO 4: LISTA E CONTROLE INDIVIDUAL DE METAS */}
            {sortedAndFilteredBrokers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sortedAndFilteredBrokers.map((broker) => {
                  const vgvPercentage = Math.min(100, Math.round((broker.realizedVgv / (broker.vgvGoal || 1)) * 100));
                  const visitsPercentage = Math.min(100, Math.round((broker.visitsDone / (broker.visitsGoal || 1)) * 100));
                  
                  const isEditing = editingBrokerId === broker.userId;

                  return (
                    <div key={broker.userId} className="bg-surface p-5 rounded-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                      <div>
                        {/* Broker Profile Header */}
                        <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/20">
                          <img 
                            src={broker.avatarUrl} 
                            alt={broker.name} 
                            className="w-10 h-10 rounded-full border border-[#004d3e]/20 object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-left flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h5 className="font-display font-bold text-primary text-sm truncate">{broker.name}</h5>
                              <span className="text-[9px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-md font-bold shrink-0 capitalize">
                                {broker.role === "owner" ? "Diretor" : broker.role === "manager" ? "Gestor" : "Corretor"}
                              </span>
                            </div>
                            <p className="text-[10px] text-on-surface-variant font-medium truncate">{broker.email}</p>
                          </div>
                          
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBrokerId(broker.userId);
                                setEditingBrokerName(broker.name);
                                setEditingVgvGoal(broker.vgvGoal.toString());
                                setEditingVisitsGoal(broker.visitsGoal.toString());
                              }}
                              className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                              title="Editar metas"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Editing Goals Form */}
                        {isEditing ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleSaveBrokerGoals(broker.userId, Number(editingVgvGoal), Number(editingVisitsGoal));
                            }}
                            className="py-3 space-y-3 text-left"
                          >
                            <h6 className="text-[11px] font-bold text-primary">Ajustar metas de {editingBrokerName}</h6>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] text-on-surface-variant font-extrabold uppercase mb-1">Meta VGV (R$)</label>
                                <input 
                                  type="number" 
                                  value={editingVgvGoal}
                                  onChange={(e) => setEditingVgvGoal(e.target.value)}
                                  className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-2.5 py-1.5 text-xs font-bold text-on-surface outline-none"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-on-surface-variant font-extrabold uppercase mb-1">Meta Visitas</label>
                                <input 
                                  type="number" 
                                  value={editingVisitsGoal}
                                  onChange={(e) => setEditingVisitsGoal(e.target.value)}
                                  className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-2.5 py-1.5 text-xs font-bold text-on-surface outline-none"
                                  required
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 text-xs pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingBrokerId(null)}
                                className="px-3 py-1 bg-surface hover:bg-surface-container-high border border-outline-variant/50 rounded-lg font-bold cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                className="px-3 py-1 bg-[#004d3e] text-white rounded-lg font-bold hover:opacity-95 cursor-pointer"
                              >
                                Salvar
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="py-4 space-y-4">
                            {/* Progress: VGV */}
                            <div className="space-y-1 text-left">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-on-surface-variant">VGV Fechado</span>
                                <span className="font-black text-primary">
                                  R$ {broker.realizedVgv.toLocaleString("pt-BR")} <span className="text-[10px] text-on-surface-variant/70 font-medium">/ {vgvPercentage}%</span>
                                </span>
                              </div>
                              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${vgvPercentage}%` }}
                                  transition={{ duration: 0.6, ease: "easeOut" }}
                                  className={`h-full rounded-full ${vgvPercentage >= 100 ? "bg-[#004d3e]" : vgvPercentage >= 50 ? "bg-[#cfa85c]" : "bg-amber-600"}`}
                                />
                              </div>
                              <div className="text-[10px] text-on-surface-variant/60 font-bold flex justify-between">
                                <span>Meta: R$ {broker.vgvGoal.toLocaleString("pt-BR")}</span>
                                <span>Faltam: R$ {Math.max(0, broker.vgvGoal - broker.realizedVgv).toLocaleString("pt-BR")}</span>
                              </div>
                            </div>

                            {/* Progress: Visits */}
                            <div className="space-y-1 text-left">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-on-surface-variant">Visitas Realizadas</span>
                                <span className="font-black text-primary">
                                  {broker.visitsDone} visitas <span className="text-[10px] text-on-surface-variant/70 font-medium">/ {visitsPercentage}%</span>
                                </span>
                              </div>
                              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${visitsPercentage}%` }}
                                  transition={{ duration: 0.6, ease: "easeOut" }}
                                  className={`h-full rounded-full ${visitsPercentage >= 100 ? "bg-[#004d3e]" : visitsPercentage >= 50 ? "bg-[#cfa85c]" : "bg-amber-600"}`}
                                />
                              </div>
                              <div className="text-[10px] text-on-surface-variant/60 font-bold flex justify-between">
                                <span>Meta: {broker.visitsGoal} visitas</span>
                                <span>Faltam: {Math.max(0, broker.visitsGoal - broker.visitsDone)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Stat Footers */}
                      {!isEditing && (
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-outline-variant/10">
                          <div className="bg-surface-container-low p-2.5 rounded-xl text-left">
                            <p className="text-[9px] text-on-surface-variant font-extrabold uppercase tracking-wider">Clientes Ativos</p>
                            <p className="text-sm font-black text-[#004d3e] mt-0.5">{broker.activeClients} contatos</p>
                          </div>
                          <div className="bg-surface-container-low p-2.5 rounded-xl text-left">
                            <p className="text-[9px] text-on-surface-variant font-extrabold uppercase tracking-wider">Pipeline em Negociação</p>
                            <p className="text-sm font-black text-[#cfa85c] mt-0.5">R$ {broker.pipelineVgv.toLocaleString("pt-BR")}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-surface-container-lowest p-8 border border-outline-variant/30 rounded-2xl flex flex-col items-center justify-center text-center gap-2">
                <Users className="w-10 h-10 text-on-surface-variant/40" />
                <p className="text-sm font-bold text-on-surface">Nenhum corretor encontrado.</p>
                <p className="text-xs text-on-surface-variant">
                  Modifique os termos de pesquisa ou os filtros selecionados para listar os corretores.
                </p>
              </div>
            )}
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
                        className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-on-surface outline-none"
                      />
                    </div>
                  </div>

                  {/* Semestral Goal Input */}
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
                        className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-on-surface outline-none"
                      />
                    </div>
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
                        className="w-full bg-white border border-outline-variant/60 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-on-surface outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <footer className="flex justify-end gap-3 px-6 py-4 bg-surface-container border-t border-outline-variant sticky bottom-0 z-10">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Deseja realmente zerar todas as metas?")) {
                        setConfigGoalMensal("0");
                        setConfigGoalSemestral("0");
                        setConfigGoalAnual("0");
                      }
                    }}
                    className="mr-auto px-4 py-2 bg-error/10 hover:bg-error/20 text-error rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Zerar Metas
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGoalConfigPanel(false)}
                    className="px-4 py-2 bg-surface hover:bg-surface-container-high border border-outline-variant/60 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary hover:opacity-90 text-on-primary rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    Salvar Todas
                  </button>
                </footer>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <InfoTour isActive={showTour} onClose={() => setShowTour(false)} />
    </div>
  );
}
