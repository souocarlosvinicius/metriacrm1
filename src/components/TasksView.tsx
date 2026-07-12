import React, { useState, useEffect } from "react";
import { Task, Client, Property } from "../types";
import { apiFetch } from "../api";
import { motion, AnimatePresence } from "motion/react";
import { 
  Calendar, 
  Clock, 
  Check, 
  Plus, 
  Trash2, 
  X, 
  Save, 
  Loader2, 
  ListChecks, 
  AlertTriangle,
  MessageSquare,
  Phone,
  Building,
  CheckSquare,
  FileText,
  FileSpreadsheet,
  Layers,
  Sparkles,
  ArrowRight,
  User,
  ExternalLink,
  Send
} from "lucide-react";

interface TaskMetadata {
  reminderActive?: boolean;
  reminderMessage?: string;
  reminderSent?: boolean;
}

function parseTaskDescription(description: string): { realDescription: string; metadata: TaskMetadata } {
  if (!description) {
    return { realDescription: "", metadata: {} };
  }
  if (description.startsWith("---METADATA---")) {
    try {
      const parts = description.split("---METADATA---");
      if (parts.length >= 3) {
        const metadataJson = parts[1];
        const realDescription = parts.slice(2).join("---METADATA---");
        const metadata = JSON.parse(metadataJson);
        return { realDescription, metadata };
      }
    } catch (e) {
      console.error("Error parsing task metadata", e);
    }
  }
  return { realDescription: description, metadata: {} };
}

function serializeTaskDescription(realDescription: string, metadata: TaskMetadata): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return realDescription;
  }
  return `---METADATA---${JSON.stringify(metadata)}---METADATA---${realDescription}`;
}

function getOneDayBefore(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + "T00:00:00");
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  } catch (e) {
    return "";
  }
}

function generateDefaultReminder(
  clientName: string,
  taskType: string,
  taskDate: string,
  taskTime: string,
  propertyTitle?: string
): string {
  const formattedDate = taskDate
    ? taskDate.split("-").reverse().join("/")
    : "amanhã";
  
  if (taskType === "Confirmar visita") {
    return `Olá, ${clientName || "tudo bem"}! Passando para confirmar nosso compromisso agendado para amanhã (${formattedDate}) às ${taskTime || "a definir"}${propertyTitle ? ` para conhecermos o imóvel "${propertyTitle}"` : ""}. Confirma para mim se segue de pé? 🏠✨`;
  } else {
    return `Olá, ${clientName || "tudo bem"}! Passando para confirmar nossa conversa de acompanhamento agendada para amanhã (${formattedDate}) às ${taskTime || "a definir"}. Fica bom para você? 🗓️🤝`;
  }
}

interface TasksViewProps {
  tasks: Task[];
  clients?: Client[];
  properties?: Property[];
  onAddTask: (task: Omit<Task, "id">) => Promise<void>;
  onToggleTaskCompletion: (id: string, completed: boolean) => Promise<void>;
  onUpdateTask?: (id: string, updatedFields: Partial<Task>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  prefilledClientForTask?: Client | null;
  onClearPrefilledClient?: () => void;
}

type TaskTab = "hoje" | "atrasadas" | "proximos_7" | "concluidas";

export default function TasksView({
  tasks = [],
  clients = [],
  properties = [],
  onAddTask,
  onToggleTaskCompletion,
  onUpdateTask,
  onDeleteTask,
  selectedDate: propSelectedDate,
  onDateChange: propOnDateChange,
  prefilledClientForTask,
  onClearPrefilledClient
}: TasksViewProps) {
  const [internalSelectedDate, setInternalSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const selectedDate = propSelectedDate !== undefined ? propSelectedDate : internalSelectedDate;
  const setSelectedDate = propOnDateChange !== undefined ? propOnDateChange : setInternalSelectedDate;
  
  const [activeTab, setActiveTab] = useState<TaskTab>("hoje");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for creating a new task
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("10:00");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [propertyTitle, setPropertyTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("Ligar");
  const [priority, setPriority] = useState<"baixa" | "média" | "alta">("média");

  // State to control the prompt modal for creating next follow-up
  const [completedTaskForPrompt, setCompletedTaskForPrompt] = useState<Task | null>(null);

  // Track tasks currently in the process of being completed for transition effects
  const [animatingCompletes, setAnimatingCompletes] = useState<Record<string, boolean>>({});

  // Automatic WhatsApp reminder states
  const [reminderActive, setReminderActive] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [isGeneratingReminder, setIsGeneratingReminder] = useState(false);
  const [isMessageManuallyEdited, setIsMessageManuallyEdited] = useState(false);

  // Active reminder modal states
  const [activeReminderTask, setActiveReminderTask] = useState<Task | null>(null);
  const [modalReminderMessage, setModalReminderMessage] = useState("");
  const [isEnhancingMessage, setIsEnhancingMessage] = useState(false);

  // Auto-enable reminders for Confirmar visita
  useEffect(() => {
    if (type === "Confirmar visita") {
      setReminderActive(true);
    }
  }, [type]);

  // Generate default reminder whenever relevant form inputs change,
  // unless the message has been manually edited.
  useEffect(() => {
    if (reminderActive && !isMessageManuallyEdited && showAddForm) {
      const generated = generateDefaultReminder(
        clientName,
        type,
        selectedDate,
        time,
        propertyTitle
      );
      setReminderMessage(generated);
    }
  }, [reminderActive, clientName, type, selectedDate, time, propertyTitle, isMessageManuallyEdited, showAddForm]);

  // Effect to handle pre-filled client redirect from dashboard
  useEffect(() => {
    if (prefilledClientForTask) {
      setSelectedClientId(prefilledClientForTask.id || prefilledClientForTask._id || "");
      setClientName(prefilledClientForTask.name);
      setTitle(`Follow-up: ${prefilledClientForTask.name}`);
      setType("Ligar");
      setPriority("alta");
      setDescription("Follow-up de rotina para reaquecer o lead.");
      setShowAddForm(true);
      
      // Clear after using to avoid infinite prefill loops
      if (onClearPrefilledClient) {
        onClearPrefilledClient();
      }
    }
  }, [prefilledClientForTask, onClearPrefilledClient]);

  // Helper to determine task status dynamically
  const getTaskStatus = (task: Task): "pendente" | "concluída" | "atrasada" => {
    if (task.completed) return "concluída";
    
    const todayStr = new Date().toISOString().split("T")[0];
    if (task.date < todayStr) {
      return "atrasada";
    } else if (task.date === todayStr) {
      // Check time
      const now = new Date();
      const currentHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (task.time < currentHM) {
        return "atrasada";
      }
    }
    return "pendente";
  };

  // Organize tasks by categories
  const todayStr = new Date().toISOString().split("T")[0];
  
  // Calculate date 7 days from now
  const next7DaysStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  })();

  const categorizedTasks = React.useMemo(() => {
    const hoje: Task[] = [];
    const atrasadas: Task[] = [];
    const proximos7: Task[] = [];
    const concluidas: Task[] = [];

    // Parse descriptions and extract metadata
    const enrichedTasks = tasks.map((task) => {
      const { realDescription, metadata } = parseTaskDescription(task.description || "");
      return {
        ...task,
        description: realDescription,
        reminderActive: metadata.reminderActive !== undefined ? metadata.reminderActive : task.reminderActive,
        reminderMessage: metadata.reminderMessage !== undefined ? metadata.reminderMessage : task.reminderMessage,
        reminderSent: metadata.reminderSent !== undefined ? metadata.reminderSent : task.reminderSent,
        reminderDate: task.date ? getOneDayBefore(task.date) : ""
      };
    });

    enrichedTasks.forEach((task) => {
      const status = getTaskStatus(task);
      if (status === "concluída") {
        concluidas.push(task);
      } else if (status === "atrasada") {
        atrasadas.push(task);
      } else if (task.date === todayStr) {
        hoje.push(task);
      } else if (task.date > todayStr && task.date <= next7DaysStr) {
        proximos7.push(task);
      }
    });

    // Sort operations
    hoje.sort((a, b) => a.time.localeCompare(b.time));
    atrasadas.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    proximos7.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    concluidas.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

    return { hoje, atrasadas, proximos7, concluidas };
  }, [tasks, todayStr, next7DaysStr]);

  const handleGenerateReminderWithAI = async () => {
    if (!clientName) {
      alert("Por favor, selecione um cliente primeiro.");
      return;
    }
    setIsGeneratingReminder(true);
    try {
      const res = await apiFetch("/api/ai/generate-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          taskType: type,
          taskTitle: title,
          taskDate: selectedDate,
          taskTime: time,
          propertyTitle,
          additionalInfo: description
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setReminderMessage(data.message);
          setIsMessageManuallyEdited(true);
        }
      } else {
        try {
          const err = await res.json();
          alert(err.error || "Erro ao gerar lembrete por IA.");
        } catch {
          alert("Erro ao gerar lembrete por IA.");
        }
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível conectar com o serviço de IA. Usando modelo local.");
    } finally {
      setIsGeneratingReminder(false);
    }
  };

  const handleOpenReminderModal = (task: Task) => {
    setActiveReminderTask(task);
    setModalReminderMessage(task.reminderMessage || generateDefaultReminder(task.clientName, task.type, task.date, task.time, task.propertyTitle));
  };

  const handleEnhanceMessageWithAI = async () => {
    if (!activeReminderTask) return;
    setIsEnhancingMessage(true);
    try {
      const res = await apiFetch("/api/ai/generate-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: activeReminderTask.clientName,
          taskType: activeReminderTask.type,
          taskTitle: activeReminderTask.title,
          taskDate: activeReminderTask.date,
          taskTime: activeReminderTask.time,
          propertyTitle: activeReminderTask.propertyTitle,
          additionalInfo: modalReminderMessage
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setModalReminderMessage(data.message);
        }
      } else {
        alert("Erro ao aprimorar mensagem com IA.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro de conexão ao tentar se comunicar com a IA.");
    } finally {
      setIsEnhancingMessage(false);
    }
  };

  const handleSendReminder = async () => {
    if (!activeReminderTask) return;
    
    // Find client details
    const clientObj = clients.find(c => c.id === activeReminderTask.clientId || c._id === activeReminderTask.clientId || c.name === activeReminderTask.clientName);
    const rawPhone = clientObj?.phone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");

    if (!cleanPhone) {
      alert("Este cliente não possui telefone cadastrado para envio.");
      return;
    }

    // Open WhatsApp link
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(modalReminderMessage)}`;
    window.open(whatsappUrl, "_blank");

    // Update reminder as Sent in database/state
    if (onUpdateTask) {
      try {
        const id = activeReminderTask.id || activeReminderTask._id || "";
        const updatedDescription = serializeTaskDescription(activeReminderTask.description || "", {
          reminderActive: true,
          reminderMessage: modalReminderMessage,
          reminderSent: true
        });
        await onUpdateTask(id, { description: updatedDescription });
      } catch (e) {
        console.error("Erro ao atualizar status de lembrete enviado:", e);
      }
    }

    setActiveReminderTask(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      alert("Por favor, preencha o título da tarefa.");
      return;
    }
    if (!selectedClientId) {
      alert("Por favor, vincule um cliente a este follow-up.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newTask: Omit<Task, "id"> = {
        title,
        date: selectedDate,
        time,
        clientId: selectedClientId,
        clientName: clientName || "Geral",
        propertyId: selectedPropertyId || undefined,
        propertyTitle: propertyTitle || undefined,
        description: serializeTaskDescription(description, {
          reminderActive,
          reminderMessage: reminderActive ? reminderMessage : undefined,
          reminderSent: false
        }),
        type,
        priority,
        completed: false,
        createdAt: new Date().toISOString()
      };

      await onAddTask(newTask);
      
      // Reset form
      setTitle("");
      setTime("10:00");
      setSelectedClientId("");
      setClientName("");
      setSelectedPropertyId("");
      setPropertyTitle("");
      setDescription("");
      setType("Ligar");
      setPriority("média");
      setReminderActive(false);
      setReminderMessage("");
      setIsMessageManuallyEdited(false);
      setShowAddForm(false);
    } catch (err) {
      console.error(err);
      alert("Falha ao cadastrar tarefa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (task: Task) => {
    const originalId = task.id || task._id || "";
    const isNewCompletion = !task.completed;
    
    if (isNewCompletion) {
      // Stage 1: Trigger local visual satisfaction effect
      setAnimatingCompletes(prev => ({ ...prev, [originalId]: true }));
      // Wait for visual effect to finish
      await new Promise(resolve => setTimeout(resolve, 650));
    }

    try {
      await onToggleTaskCompletion(originalId, isNewCompletion);
      if (isNewCompletion) {
        // Task completed! Show prompt to create next follow-up
        setCompletedTaskForPrompt(task);
      }
    } catch (err) {
      console.error(err);
      alert("Falha ao atualizar tarefa.");
    } finally {
      if (isNewCompletion) {
        // Clear animating state
        setAnimatingCompletes(prev => {
          const next = { ...prev };
          delete next[originalId];
          return next;
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja excluir permanentemente este compromisso da sua rotina?")) {
      try {
        await onDeleteTask(id);
      } catch (err: any) {
        console.error(err);
        alert(err.message || "Falha ao excluir tarefa.");
      }
    }
  };

  // Icon selector based on Task Type
  const getTypeIcon = (taskType: string) => {
    switch (taskType) {
      case "Ligar":
        return <Phone className="w-4 h-4" />;
      case "Enviar WhatsApp":
        return <MessageSquare className="w-4 h-4" />;
      case "Enviar imóvel":
        return <Building className="w-4 h-4" />;
      case "Confirmar visita":
        return <CheckSquare className="w-4 h-4" />;
      case "Enviar proposta":
        return <FileText className="w-4 h-4" />;
      case "Cobrar retorno":
        return <Clock className="w-4 h-4" />;
      case "Documentação":
        return <FileSpreadsheet className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  // Color mappings for types
  const getTypeBadgeStyles = (taskType: string) => {
    switch (taskType) {
      case "Ligar":
        return "bg-blue-50 text-blue-700 border-blue-200/50";
      case "Enviar WhatsApp":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/50";
      case "Enviar imóvel":
        return "bg-purple-50 text-purple-700 border-purple-200/50";
      case "Confirmar visita":
        return "bg-indigo-50 text-indigo-700 border-indigo-200/50";
      case "Enviar proposta":
        return "bg-amber-50 text-amber-700 border-amber-200/50";
      case "Cobrar retorno":
        return "bg-orange-50 text-orange-700 border-orange-200/50";
      case "Documentação":
        return "bg-rose-50 text-rose-700 border-rose-200/50";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200/50";
    }
  };

  // Priority styling
  const getPriorityBadgeStyles = (p?: string) => {
    switch (p) {
      case "alta":
        return "bg-red-100 text-red-800 border-red-200";
      case "média":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "baixa":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-slate-50 text-slate-500 border-slate-100";
    }
  };

  // Format date helper (e.g. 2026-06-30 -> 30/06)
  const formatDateLabel = (dateStr: string) => {
    if (dateStr === todayStr) return "Hoje";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

  // Get current active tasks to render
  const activeTaskList = (() => {
    switch (activeTab) {
      case "hoje":
        return categorizedTasks.hoje;
      case "atrasadas":
        return categorizedTasks.atrasadas;
      case "proximos_7":
        return categorizedTasks.proximos7;
      case "concluidas":
        return categorizedTasks.concluidas;
      default:
        return [];
    }
  })();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {!showAddForm ? (
        <>
          {/* Visual Tabs Selector */}
          <div className="grid grid-cols-4 gap-1.5 bg-surface p-1 rounded-2xl border border-outline-variant/30 shadow-sm">
            {[
              { id: "hoje", label: "Hoje", count: categorizedTasks.hoje.length, color: "text-primary" },
              { id: "atrasadas", label: "Atrasadas", count: categorizedTasks.atrasadas.length, color: "text-red-600 bg-red-50/50" },
              { id: "proximos_7", label: "Próximos 7 Dias", count: categorizedTasks.proximos7.length, color: "text-secondary" },
              { id: "concluidas", label: "Concluídas", count: categorizedTasks.concluidas.length, color: "text-emerald-700" }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TaskTab)}
                  className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all cursor-pointer relative ${
                    isActive 
                      ? "bg-primary text-on-primary shadow-sm scale-[1.02] font-bold" 
                      : "hover:bg-surface-container-high text-on-surface-variant font-semibold"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider leading-none">{tab.label}</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`font-display text-body-lg font-bold ${isActive ? "text-white" : "text-on-surface"}`}>
                      {tab.count}
                    </span>
                    {!isActive && tab.count > 0 && tab.id === "atrasadas" && (
                      <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Warning if overdue tasks exist */}
          {categorizedTasks.atrasadas.length > 0 && activeTab !== "atrasadas" && (
            <div 
              onClick={() => setActiveTab("atrasadas")}
              className="bg-red-50 border border-red-200/60 p-3 rounded-xl flex items-center justify-between text-red-800 text-xs font-semibold cursor-pointer hover:bg-red-100/50 transition-all"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>Atenção: Você tem {categorizedTasks.atrasadas.length} tarefas comerciais atrasadas!</span>
              </div>
              <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                Resolver agora <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          )}

          {/* Tasks List */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-display text-title-md text-on-surface font-bold uppercase tracking-wide text-xs opacity-75">
                {activeTab === "hoje" && "Compromissos Agendados para Hoje"}
                {activeTab === "atrasadas" && "Acompanhamentos Perdidos (Pendentes no Passado)"}
                {activeTab === "proximos_7" && "Agenda de Follow-up (Próximos 7 dias)"}
                {activeTab === "concluidas" && "Histórico de Atividades Realizadas"}
              </h3>
              <span className="text-[10px] font-mono bg-surface-container px-2.5 py-0.5 rounded-full font-bold">
                {activeTaskList.length} {activeTaskList.length === 1 ? "tarefa" : "tarefas"}
              </span>
            </div>

            <div className="space-y-3 relative">
              {activeTaskList.length > 0 ? (
                <AnimatePresence mode="popLayout">
                  {activeTaskList.map((t, idx) => {
                    const isOverdue = getTaskStatus(t) === "atrasada";
                    const isCompleting = animatingCompletes[t.id || t._id || ""];
                    return (
                      <motion.div 
                        layout
                        key={t.id || t._id || `task-${idx}`} 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ 
                          opacity: 1, 
                          y: 0,
                          scale: isCompleting ? 0.98 : 1,
                          borderColor: isCompleting ? "rgba(16, 185, 129, 0.4)" : undefined,
                          boxShadow: isCompleting 
                            ? "0 4px 20px -2px rgba(16, 185, 129, 0.15)" 
                            : undefined
                        }}
                        exit={{ 
                          opacity: 0, 
                          x: 100, 
                          height: 0, 
                          paddingTop: 0, 
                          paddingBottom: 0, 
                          marginTop: 0, 
                          marginBottom: 0,
                          overflow: "hidden",
                          transition: { duration: 0.35, ease: "easeInOut" }
                        }}
                        transition={{ 
                          type: "spring", 
                          stiffness: 500, 
                          damping: 30,
                          opacity: { duration: 0.2 }
                        }}
                        className={`relative overflow-hidden bg-surface-container-lowest border rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                          t.completed 
                            ? "border-outline-variant/40 opacity-70" 
                            : isCompleting
                            ? "border-emerald-500/40 bg-emerald-500/[0.01]"
                            : isOverdue 
                            ? "border-red-200/80 bg-red-50/10 hover:border-red-300"
                            : "border-outline-variant/30 hover:border-primary/20 hover:shadow-md"
                        }`}
                      >
                        {/* Priority left bar indicators */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300 ${
                          isCompleting
                            ? "bg-emerald-500"
                            : t.priority === "alta" 
                            ? "bg-red-500" 
                            : t.priority === "média" 
                            ? "bg-amber-500" 
                            : "bg-blue-400"
                        }`} />

                        <div className="pl-2 space-y-1 text-left min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Type Badge */}
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 border rounded-lg flex items-center gap-1 ${getTypeBadgeStyles(t.type || "Outro")}`}>
                              {getTypeIcon(t.type || "Outro")}
                              {t.type || "Outro"}
                            </span>
                            
                            {/* Priority Badge */}
                            {t.priority && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 border rounded-md uppercase tracking-wide ${getPriorityBadgeStyles(t.priority)}`}>
                                {t.priority}
                              </span>
                            )}

                            {/* Date & Time display */}
                            <span className={`text-xs font-mono font-bold ml-auto sm:ml-0 flex items-center gap-1 ${isOverdue ? "text-red-600 bg-red-50 px-2 py-0.5 rounded-md" : "text-on-surface-variant"}`}>
                              <Clock className="w-3 h-3" />
                              {formatDateLabel(t.date)} às {t.time}
                            </span>
                          </div>

                          {/* Title */}
                          <h4 className="font-bold text-on-surface text-base leading-tight pt-1 relative inline-flex items-center">
                            <span className={`transition-all duration-500 ${t.completed ? "line-through text-on-surface-variant/50" : isCompleting ? "text-on-surface-variant/60" : ""}`}>
                              {t.title}
                            </span>
                            {isCompleting && (
                              <motion.span 
                                initial={{ width: 0 }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className="absolute left-0 right-0 h-[2px] bg-emerald-500 opacity-60"
                              />
                            )}
                          </h4>

                          {/* Linked Client Info */}
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <User className="w-3.5 h-3.5 text-on-surface-variant/70 shrink-0" />
                            <p className="text-xs text-on-surface font-semibold">
                              Cliente: <span className="text-primary hover:underline cursor-pointer">{t.clientName}</span>
                            </p>
                          </div>

                          {/* Linked Property Info */}
                          {t.propertyTitle && (
                            <div className="flex items-center gap-1.5 pt-0.5 text-xs text-on-surface-variant">
                              <Building className="w-3.5 h-3.5 opacity-70 shrink-0" />
                              <p className="truncate">
                                Imóvel: <span className="font-semibold italic">{t.propertyTitle}</span>
                              </p>
                            </div>
                          )}
                          
                          {/* Description */}
                          {t.description && (
                            <p className="text-xs text-on-surface-variant/80 pt-1.5 leading-relaxed border-t border-outline-variant/10 mt-1 whitespace-pre-wrap font-medium">
                              {t.description}
                            </p>
                          )}

                          {/* Reminder details */}
                          {t.reminderActive && (
                            <div className="mt-2.5 p-3 rounded-xl bg-primary/5 border border-primary/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg shrink-0 ${t.reminderSent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  <Clock className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Lembrete de Visita/Follow-up</p>
                                    {t.reminderSent ? (
                                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md uppercase">Enviado</span>
                                    ) : (
                                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md uppercase font-sans">Pendente</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-on-surface/80 font-semibold mt-0.5">
                                    Enviar WhatsApp 1 dia antes: <span className="font-mono">{t.reminderDate ? t.reminderDate.split("-").reverse().join("/") : ""}</span>
                                  </p>
                                </div>
                              </div>
                              
                              <button
                                onClick={() => handleOpenReminderModal(t)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border shrink-0 ${
                                  t.reminderSent
                                    ? "bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                    : "bg-primary border-primary text-on-primary hover:opacity-95 shadow-sm"
                                }`}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                {t.reminderSent ? "Reenviar Lembrete" : "Enviar Lembrete"}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Interactive Controls */}
                        <div className="flex items-center sm:flex-col justify-end gap-2.5 shrink-0 pl-2 sm:pl-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-outline-variant/10">
                          {/* WhatsApp Fast Contact Button */}
                          {t.type === "Enviar WhatsApp" && !t.completed && (
                            <a
                              href={`https://wa.me/${(clients.find(c => c.name === t.clientName || c.id === t.clientId)?.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, tudo bem? Gostaria de dar um retorno sobre o seu atendimento no Metria CRM...`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors shadow-sm cursor-pointer"
                              title="Conversar no WhatsApp"
                            >
                              <MessageSquare className="w-4 h-4 fill-white text-emerald-500" />
                            </a>
                          )}

                          {/* Toggle complete */}
                          <button
                            onClick={() => handleToggle(t)}
                            disabled={isCompleting}
                            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer relative overflow-hidden ${
                              t.completed || isCompleting
                                ? "bg-emerald-500 border-emerald-500 text-white scale-105" 
                                : "bg-white border-outline-variant hover:border-primary text-on-surface-variant hover:bg-surface-container active:scale-95"
                            }`}
                            title={t.completed ? "Desmarcar conclusão" : "Marcar como concluída"}
                          >
                            {isCompleting ? (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                                className="flex items-center justify-center"
                              >
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                  <motion.path
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.35, ease: "easeInOut", delay: 0.05 }}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </motion.div>
                            ) : (
                              <Check className="w-4 h-4 stroke-[3]" />
                            )}
                          </button>

                          {/* Delete task */}
                          <button
                            onClick={() => handleDelete(t.id || t._id || "")}
                            className="w-8 h-8 rounded-xl border border-red-100 bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 hover:border-red-200 transition-all cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-20 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/60 shadow-sm animate-in fade-in duration-300 max-w-2xl mx-auto my-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-inner animate-pulse">
                    <ListChecks className="w-8 h-8 stroke-[1.5]" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-on-surface tracking-tight">
                    {activeTab === "hoje" ? "Nenhuma tarefa para hoje." : "Sem tarefas nesta visualização."}
                  </h3>
                  <p className="text-sm opacity-90 mt-2 max-w-md leading-relaxed">
                    {activeTab === "hoje" 
                      ? "Crie lembretes para retornos, visitas e propostas."
                      : activeTab === "atrasadas"
                      ? "Excelente! Você não possui nenhum acompanhamento pendente no passado."
                      : activeTab === "proximos_7"
                      ? "Sua agenda de follow-ups para os próximos dias está livre. Que tal planejar novas conexões?"
                      : "Seu histórico de atividades concluídas está vazio no momento."}
                  </p>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="mt-6 px-6 py-3 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 hover:shadow-lg cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Criar tarefa
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Floating Action Button to add task */}
          <button
            onClick={() => {
              // Default to selected date
              setShowAddForm(true);
            }}
            className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40 cursor-pointer border border-primary-container/20"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        </>
      ) : (
        /* ADICIONAR TAREFA FORM VIEW */
        <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <header className="flex justify-between items-center pb-4 border-b border-outline-variant mb-6">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-primary/10 text-primary rounded-lg">
                <Calendar className="w-5 h-5" />
              </span>
              <h2 className="font-display text-title-md text-primary font-bold">Agendar Atividade Comercial</h2>
            </div>
            <button
              onClick={() => {
                setShowAddForm(false);
                if (onClearPrefilledClient) onClearPrefilledClient();
              }}
              className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-4 text-sm text-left">
            
            {/* Cliente Vinculado (REQUIRED SELECT) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-1">
                <span>Cliente Vinculado *</span>
                <span className="text-[10px] text-red-500 font-bold">(Obrigatório)</span>
              </label>
              <select
                required
                value={selectedClientId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedClientId(val);
                  const clientObj = clients.find(c => c.id === val || c._id?.toString() === val);
                  if (clientObj) {
                    setClientName(clientObj.name);
                  } else {
                    setClientName("");
                  }
                }}
                className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm font-semibold outline-none focus:border-primary/50 transition-all"
              >
                <option value="">Selecione o cliente associado...</option>
                {clients.map((c, index) => (
                  <option key={c.id || c._id || `client-${index}`} value={c.id || c._id || ""}>
                    {c.name} ({c.profileType} - {c.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Imóvel Vinculado (OPTIONAL SELECT) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">Imóvel Vinculado (Opcional)</label>
              <select
                value={selectedPropertyId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedPropertyId(val);
                  const propObj = properties.find(p => p.id === val || p._id?.toString() === val);
                  if (propObj) {
                    setPropertyTitle(propObj.title);
                  } else {
                    setPropertyTitle("");
                  }
                }}
                className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm font-semibold outline-none focus:border-primary/50 transition-all"
              >
                <option value="">Nenhum imóvel selecionado</option>
                {properties.map((p, index) => (
                  <option key={p.id || p._id || `property-${index}`} value={p.id || p._id || ""}>
                    {p.code ? `[${p.code}] ` : ""}{p.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Type & Priority in two columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Tipo de Atividade</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm font-semibold outline-none"
                >
                  <option value="Ligar">Ligar</option>
                  <option value="Enviar WhatsApp">Enviar WhatsApp</option>
                  <option value="Enviar imóvel">Enviar imóvel</option>
                  <option value="Confirmar visita">Confirmar visita</option>
                  <option value="Enviar proposta">Enviar proposta</option>
                  <option value="Cobrar retorno">Cobrar retorno</option>
                  <option value="Documentação">Documentação</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Prioridade</label>
                <div className="grid grid-cols-3 gap-2 h-11">
                  {(["baixa", "média", "alta"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-lg text-xs font-bold capitalize border cursor-pointer flex items-center justify-center transition-all ${
                        priority === p
                          ? p === "alta"
                            ? "bg-red-500 border-red-500 text-white"
                            : p === "média"
                            ? "bg-amber-500 border-amber-500 text-white"
                            : "bg-blue-500 border-blue-500 text-white"
                          : "bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Date & Time in two columns */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Data</label>
                <input
                  type="date"
                  required
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Horário</label>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm font-semibold"
                />
              </div>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">Título / Atividade</label>
              <input
                type="text"
                required
                placeholder="Ex: Ligar para alinhar preço da proposta ou Enviar fotos do imóvel"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-on-surface-variant">Observações / Detalhes</label>
              <textarea
                rows={3}
                placeholder="Detalhes adicionais (quais dúvidas tirar, qual imóvel enviar, etc...)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="p-3 border border-outline-variant rounded-lg bg-white outline-none text-sm resize-none font-medium"
              />
            </div>

            {/* AGENDAMENTO DE LEMBRETE AUTOMÁTICO WHATSAPP */}
            <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-primary/10 text-primary rounded-lg">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="font-bold text-on-surface text-xs tracking-wide uppercase">Lembrete de WhatsApp</h4>
                    <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                      Gera uma mensagem predefinida para enviar 1 dia antes do compromisso.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={reminderActive}
                    onChange={(e) => setReminderActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-outline-variant/60 rounded-full peer peer-focus:ring-2 peer-focus:ring-primary/20 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {reminderActive && (
                <div className="space-y-3 pt-2.5 border-t border-primary/10 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <span>Lembrete programado para:</span>
                      <span className="bg-primary-container/30 text-primary px-2 py-0.5 rounded-md font-mono text-[11px]">
                        {selectedDate ? getOneDayBefore(selectedDate).split("-").reverse().join("/") : "definir data"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateReminderWithAI}
                      disabled={isGeneratingReminder}
                      className="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1 py-1 px-2.5 rounded-lg bg-primary/10 hover:bg-primary/15 disabled:opacity-50 cursor-pointer"
                    >
                      {isGeneratingReminder ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          Gerar com IA
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-on-surface-variant">Conteúdo da Mensagem de Lembrete</label>
                    <textarea
                      rows={3}
                      value={reminderMessage}
                      onChange={(e) => {
                        setReminderMessage(e.target.value);
                        setIsMessageManuallyEdited(true);
                      }}
                      placeholder="Redija ou gere a mensagem que o corretor irá enviar ao cliente..."
                      className="p-3 border border-outline-variant rounded-lg bg-white outline-none text-xs leading-relaxed resize-none font-medium"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  if (onClearPrefilledClient) onClearPrefilledClient();
                }}
                className="px-5 py-3 bg-surface-container-high text-on-surface-variant rounded-xl font-bold font-label-md cursor-pointer"
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
                    Agendando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Agendar Atividade
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* COMPLETED TASK PROMPT MODAL (NEXT FOLLOW-UP LOOP) */}
      {completedTaskForPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface rounded-3xl max-w-md w-full p-6 border border-outline-variant shadow-2xl space-y-4 animate-in scale-in duration-200">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="p-3 bg-emerald-100/70 rounded-2xl">
                <CheckSquare className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="font-display text-title-lg text-emerald-800 font-bold leading-tight">Tarefa Concluída!</h3>
                <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Histórico Atualizado 🎉</p>
              </div>
            </div>
            
            <p className="text-sm text-on-surface-variant font-medium leading-relaxed">
              Você concluiu com sucesso a atividade <strong className="text-on-surface">"{completedTaskForPrompt.title}"</strong> para o cliente <strong className="text-on-surface">{completedTaskForPrompt.clientName}</strong>.
            </p>
            <p className="text-xs text-on-surface-variant font-medium">
              Para garantir que esse cliente não esfrie no funil de vendas, <strong>deseja agendar a próxima ação de follow-up?</strong> É a melhor prática para manter o relacionamento ativo.
            </p>
            
            <div className="flex justify-end gap-3 pt-3 border-t border-outline-variant/50">
              <button
                onClick={() => setCompletedTaskForPrompt(null)}
                className="px-4 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-bold text-xs rounded-xl cursor-pointer"
              >
                Não, depois
              </button>
              <button
                onClick={() => {
                  // Pre-fill next action with exact same client
                  const clientObj = clients.find(c => 
                    c.name === completedTaskForPrompt.clientName ||
                    (completedTaskForPrompt.clientId && (c.id === completedTaskForPrompt.clientId || c._id?.toString() === completedTaskForPrompt.clientId))
                  );
                  if (clientObj) {
                    setSelectedClientId(clientObj.id || clientObj._id || "");
                    setClientName(clientObj.name);
                  } else {
                    setClientName(completedTaskForPrompt.clientName);
                  }

                  if (completedTaskForPrompt.propertyId) {
                    setSelectedPropertyId(completedTaskForPrompt.propertyId);
                    setPropertyTitle(completedTaskForPrompt.propertyTitle || "");
                  }

                  setTitle(""); // let them type new title
                  setDescription(`Próximo follow-up pós: "${completedTaskForPrompt.title}"`);
                  setType("Cobrar retorno"); // Good default after a completion
                  setPriority("média");
                  
                  setShowAddForm(true);
                  setCompletedTaskForPrompt(null);
                }}
                className="px-5 py-2.5 bg-primary text-on-primary font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 hover:opacity-90"
              >
                <Sparkles className="w-3.5 h-3.5 text-secondary" />
                Agendar Próxima Ação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP REMINDER REVIEW MODAL */}
      {activeReminderTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface rounded-3xl max-w-lg w-full p-6 border border-outline-variant shadow-2xl space-y-4 animate-in scale-in duration-200 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/50">
              <div className="flex items-center gap-2.5 text-primary">
                <span className="p-1.5 bg-primary/10 rounded-xl">
                  <MessageSquare className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-display text-title-md text-primary font-bold">Enviar Lembrete por WhatsApp</h3>
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Metria CRM Smart Reminder</p>
                </div>
              </div>
              <button
                onClick={() => setActiveReminderTask(null)}
                className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="p-3.5 bg-surface-container rounded-2xl space-y-1.5 text-xs">
                <p className="font-semibold text-on-surface flex justify-between">
                  <span>👤 Cliente:</span>
                  <span className="text-primary font-bold">{activeReminderTask.clientName}</span>
                </p>
                <p className="font-semibold text-on-surface flex justify-between">
                  <span>📅 Compromisso:</span>
                  <span className="font-bold">{activeReminderTask.title}</span>
                </p>
                <p className="font-semibold text-on-surface flex justify-between">
                  <span>⏰ Data/Hora:</span>
                  <span className="font-mono font-bold">
                    {activeReminderTask.date ? activeReminderTask.date.split("-").reverse().join("/") : ""} às {activeReminderTask.time}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-on-surface-variant font-sans uppercase tracking-wider">Mensagem Formatada</label>
                  <button
                    onClick={handleEnhanceMessageWithAI}
                    disabled={isEnhancingMessage}
                    className="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1 py-1 px-2.5 rounded-lg bg-primary/10 hover:bg-primary/15 disabled:opacity-50 cursor-pointer"
                  >
                    {isEnhancingMessage ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Melhorando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Aprimorar com IA
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={modalReminderMessage}
                  onChange={(e) => setModalReminderMessage(e.target.value)}
                  className="w-full p-3.5 border border-outline-variant bg-white rounded-xl text-xs leading-relaxed outline-none focus:border-primary/50 font-medium"
                  placeholder="Mensagem do WhatsApp..."
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-outline-variant/50">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(modalReminderMessage);
                  alert("Mensagem copiada para a área de transferência!");
                }}
                className="px-4 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-bold text-xs rounded-xl cursor-pointer"
              >
                Copiar Texto
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setActiveReminderTask(null)}
                  className="px-4 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendReminder}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-2 transition-all active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar via WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
