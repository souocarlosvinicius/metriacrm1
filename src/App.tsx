import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LayoutDashboard, Home, Users, CalendarDays, Bell, Sparkles, Search, X, FolderSync, Handshake, Settings, ClipboardCheck, AlertTriangle, Clock, Check, Users2, TrendingUp, Keyboard } from "lucide-react";
import { Property, Client, Task, DBStatus, User, Proposal, Visit } from "./types";
import DashboardView from "./components/DashboardView";
import PropertiesView from "./components/PropertiesView";
import ClientsView from "./components/ClientsView";
import TasksView from "./components/TasksView";
import PipelineView from "./components/PipelineView";
import TransactionsView from "./components/TransactionsView";
import SettingsView from "./components/SettingsView";
import InfoView from "./components/InfoView";
import TeamView from "./components/TeamView";
import PropertyModal from "./components/PropertyModal";
import ClientModal from "./components/ClientModal";
import LoginView from "./components/LoginView";
import UserProfileModal from "./components/UserProfileModal";
import OnboardingModal from "./components/OnboardingModal";
import LandingPage from "./components/LandingPage";
import ErrorBoundary from "./components/ErrorBoundary";
import { setupGlobalErrorMonitoring, logError } from "./utils/logger";
import { apiFetch } from "./api";
import { useCurrentPlan } from "./hooks/useCurrentPlan";
import * as Sentry from "@sentry/react";

// Initialize Sentry SDK for real-time frontend exception monitoring
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || "";

if (typeof window !== "undefined") {
  Sentry.init({
    dsn: SENTRY_DSN || undefined,
    environment: import.meta.env.MODE || "production",
    tracesSampleRate: 1.0,
    beforeSend(event, hint) {
      // Filter out harmless local development / websocket connection noise
      const error = hint?.originalException;
      const message = typeof error === "string" ? error : (error as any)?.message || event.message;
      if (message && (message.includes("vite") || message.includes("websocket"))) {
        return null;
      }
      return event;
    },
  });
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas de inatividade
const SESSION_TIMESTAMP_KEY = "vega_crm_user_timestamp";

export function saveUserSession(user: any) {
  localStorage.setItem("vega_crm_user", JSON.stringify(user));
  localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
}

export function clearUserSession() {
  localStorage.removeItem("vega_crm_user");
  localStorage.removeItem(SESSION_TIMESTAMP_KEY);
}

export function checkAndCleanExpiredSession(): boolean {
  const savedUser = localStorage.getItem("vega_crm_user");
  if (!savedUser) {
    localStorage.removeItem(SESSION_TIMESTAMP_KEY);
    return false;
  }

  const savedTimestamp = localStorage.getItem(SESSION_TIMESTAMP_KEY);
  if (savedTimestamp) {
    const elapsed = Date.now() - parseInt(savedTimestamp, 10);
    if (isNaN(elapsed) || elapsed > SESSION_TTL_MS) {
      console.warn(`[Auth Diagnostic TTL] Sessão local expirou por inatividade (${Math.round((elapsed || SESSION_TTL_MS) / (1000 * 60 * 60))}h). Limpando 'vega_crm_user'.`);
      clearUserSession();
      return true;
    }
  } else {
    localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
  }

  return false;
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authDefaultToRegister, setAuthDefaultToRegister] = useState(false);

  // Setup unhandled error monitoring and Sentry SDK integration
  useEffect(() => {
    // Activates both centralized API logging and Sentry global listener handlers
    const cleanupLogger = setupGlobalErrorMonitoring();

    // Sentry runtime tagging for real-time dashboard categorization
    Sentry.setTag("crm_app", "metria_crm");
    Sentry.setTag("environment", import.meta.env.MODE || "production");

    return () => {
      cleanupLogger();
    };
  }, []);

  // Sync current user session with Sentry for incident triage
  useEffect(() => {
    if (currentUser) {
      Sentry.setUser({
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.name || currentUser.username,
        role: currentUser.role,
      });
    } else {
      Sentry.setUser(null);
    }
  }, [currentUser]);

  // Check session on mount
  useEffect(() => {
    const handleUnauthorized = () => {
      clearUserSession();
      setCurrentUser(null);
    };
    window.addEventListener("auth_unauthorized", handleUnauthorized);

    const validateDemoUser = (userObj: any): boolean => {
      if (!userObj || typeof userObj !== "object") return false;
      if (!userObj.isDemo) return false;
      const hasId = typeof userObj.id === "string" && userObj.id.trim().length > 0;
      const hasIdentity = (typeof userObj.name === "string" && userObj.name.trim().length > 0) ||
                          (typeof userObj.username === "string" && userObj.username.trim().length > 0) ||
                          (typeof userObj.email === "string" && userObj.email.trim().length > 0);
      return Boolean(hasId && hasIdentity);
    };

    const verifySession = async () => {
      try {
        console.log("[Auth Diagnostic] Verificando estado da sessão e TTL na inicialização...");
        
        // Verificação de TTL (24h de inatividade) para a entrada vega_crm_user em localStorage
        const wasExpired = checkAndCleanExpiredSession();
        if (wasExpired) {
          console.log("[Auth Diagnostic TTL] Sessão expirada no localStorage foi removida.");
        }

        const res = await apiFetch("/api/auth/me");
        if (res.ok) {
          const user = await res.json();
          if (user) {
            delete user.sessionToken;
          }
          if (user && user.isDemo) {
            console.log("[Auth Diagnostic] Sessão de demonstração detectada na API.", user);
            if (validateDemoUser(user)) {
              console.log("[Auth Diagnostic] Estrutura do usuário de demonstração validada com sucesso.");
              setCurrentUser(user);
              saveUserSession(user);
            } else {
              console.warn("[Auth Diagnostic] Estrutura do usuário demo inválida. Limpando sessão.");
              clearUserSession();
              setCurrentUser(null);
            }
          } else if (user) {
            setCurrentUser(user);
            saveUserSession(user);
          } else {
            setCurrentUser(null);
            clearUserSession();
          }
        } else {
          setCurrentUser(null);
          clearUserSession();
        }
      } catch (err) {
        console.error("Erro ao verificar sessão:", err);
        // Fallback to localStorage for offline / demo mode
        const isExpired = checkAndCleanExpiredSession();
        if (!isExpired) {
          const saved = localStorage.getItem("vega_crm_user");
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed && parsed.isDemo) {
                console.log("[Auth Diagnostic] Sessão de demonstração local detectada no fallback de rede.", parsed);
                if (validateDemoUser(parsed)) {
                  console.log("[Auth Diagnostic] Estrutura do usuário de demonstração local validada.");
                  setCurrentUser(parsed);
                  localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
                } else {
                  console.warn("[Auth Diagnostic] Estrutura do usuário demo em localStorage corrompida. Removendo sessão.");
                  setCurrentUser(null);
                  clearUserSession();
                }
              } else {
                setCurrentUser(null);
                clearUserSession();
              }
            } catch (e) {
              setCurrentUser(null);
              clearUserSession();
            }
          } else {
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      } finally {
        setCheckingAuth(false);
      }
    };
    verifySession();

    return () => {
      window.removeEventListener("auth_unauthorized", handleUnauthorized);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [properties, setProperties] = useState<Property[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [dbStatus, setDbStatus] = useState<DBStatus | null>(null);

  // Active Organization and Subscription Plan calculations
  const [currentOrg, setCurrentOrg] = useState<any>(null);

  const fetchCurrentOrg = async (orgId: string | undefined) => {
    try {
      const res = await apiFetch("/api/organizations");
      if (res.ok) {
        const orgs = await res.json();
        const activeOrg = orgs.find((o: any) => o.id === orgId) || orgs[0];
        if (activeOrg) {
          setCurrentOrg(activeOrg);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar organização ativa em App.tsx:", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchCurrentOrg(currentUser.defaultOrganizationId || "demo-org-id");
    } else {
      setCurrentOrg(null);
    }

    const handlePlanChange = (event: any) => {
      const detail = event.detail;
      if (currentUser?.defaultOrganizationId) {
        fetchCurrentOrg(currentUser.defaultOrganizationId);
      }
      if (detail?.plan && currentOrg) {
        setCurrentOrg((prev: any) => (prev ? { ...prev, plan: detail.plan } : prev));
      }
    };

    window.addEventListener("organization-plan-changed", handlePlanChange);
    return () => {
      window.removeEventListener("organization-plan-changed", handlePlanChange);
    };
  }, [currentUser]);

  const planAccess = useCurrentPlan(currentOrg, {
    clientsCount: clients.length,
    propertiesCount: properties.length,
    membersCount: 1
  });

  // Selected entities for detail modal view
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Global search states & refs
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [selectedTaskDate, setSelectedTaskDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [prefilledClientForTask, setPrefilledClientForTask] = useState<Client | null>(null);

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentUser) return;

      const isModifier = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        )
      );

      // Escape key
      if (e.key === "Escape") {
        if (showSearchResults) {
          setShowSearchResults(false);
          searchInputRef.current?.blur();
        }
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
        }
        return;
      }

      // Ctrl+K / Cmd+K -> Focus Global Search
      if (isModifier && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setShowSearchResults(true);
        return;
      }

      // Ctrl+/ or Cmd+/ or '?' -> Toggle Shortcuts Help Modal
      if ((isModifier && (e.key === "/" || e.key === "?")) || (!isInput && e.key === "?")) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      // Navigation Shortcuts
      // Skip single-key typing inside form inputs
      if (isInput) {
        if (!e.altKey && !(isModifier && e.shiftKey) && !(isModifier && (e.key === "d" || e.key === "D" || e.key === "t" || e.key === "T"))) {
          return;
        }
      }

      const keyLower = e.key.toLowerCase();

      // Dashboard: Ctrl+D, Ctrl+Shift+D, Alt+D, Alt+1
      if ((isModifier && keyLower === "d") || (e.altKey && (keyLower === "d" || keyLower === "1"))) {
        e.preventDefault();
        setActiveTab("dashboard");
        setShowSearchResults(false);
        return;
      }

      // Tasks: Ctrl+T, Ctrl+Shift+T, Alt+T, Alt+4
      if ((isModifier && keyLower === "t") || (e.altKey && (keyLower === "t" || keyLower === "4"))) {
        e.preventDefault();
        setActiveTab("tasks");
        setShowSearchResults(false);
        return;
      }

      // Imóveis (Properties): Alt+2, Ctrl+Shift+P, Alt+P
      if ((e.altKey && (keyLower === "2" || keyLower === "p")) || (isModifier && e.shiftKey && keyLower === "p")) {
        e.preventDefault();
        setActiveTab("properties");
        setShowSearchResults(false);
        return;
      }

      // Clientes (Clients): Alt+3, Ctrl+Shift+C, Alt+C
      if ((e.altKey && (keyLower === "3" || keyLower === "c")) || (isModifier && e.shiftKey && keyLower === "c")) {
        e.preventDefault();
        setActiveTab("clients");
        setShowSearchResults(false);
        return;
      }

      // Funil (Pipeline): Alt+5, Ctrl+Shift+F, Alt+F
      if ((e.altKey && (keyLower === "5" || keyLower === "f")) || (isModifier && e.shiftKey && keyLower === "f")) {
        e.preventDefault();
        setActiveTab("pipeline");
        setShowSearchResults(false);
        return;
      }

      // Negócios (Transactions): Alt+6, Ctrl+Shift+G, Alt+G
      if ((e.altKey && (keyLower === "6" || keyLower === "g")) || (isModifier && e.shiftKey && keyLower === "g")) {
        e.preventDefault();
        setActiveTab("transactions");
        setShowSearchResults(false);
        return;
      }

      // Configurações (Settings): Alt+7, Ctrl+Shift+S, Alt+S
      if ((e.altKey && (keyLower === "7" || keyLower === "s")) || (isModifier && e.shiftKey && keyLower === "s")) {
        e.preventDefault();
        setActiveTab("settings");
        setShowSearchResults(false);
        return;
      }

      // Inteligência / IA: Alt+8, Ctrl+Shift+I, Alt+I
      if ((e.altKey && (keyLower === "8" || keyLower === "i")) || (isModifier && e.shiftKey && keyLower === "i")) {
        e.preventDefault();
        setActiveTab("ai");
        setShowSearchResults(false);
        return;
      }

      // Equipe (Team): Alt+9, Ctrl+Shift+M, Alt+M
      if ((e.altKey && (keyLower === "9" || keyLower === "m")) || (isModifier && e.shiftKey && keyLower === "m")) {
        e.preventDefault();
        setActiveTab("team");
        setShowSearchResults(false);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentUser, showSearchResults, showShortcutsModal]);

  // Simple Notification System
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const todayTasks = React.useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return tasks.filter(t => t.date === todayStr && !t.completed);
  }, [tasks]);

  // Click outside listener for search bar and notification dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".search-container")) {
        setShowSearchResults(false);
      }
      if (!(e.target as HTMLElement).closest(".notification-container")) {
        setShowNotificationDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredProperties = React.useMemo(() => {
    if (!globalSearchQuery.trim()) return [];
    const query = globalSearchQuery.toLowerCase();
    return properties.filter(p =>
      p.title?.toLowerCase().includes(query) ||
      p.neighborhood?.toLowerCase().includes(query) ||
      p.city?.toLowerCase().includes(query) ||
      p.address?.toLowerCase().includes(query) ||
      p.type?.toLowerCase().includes(query)
    ).slice(0, 4);
  }, [properties, globalSearchQuery]);

  const filteredClients = React.useMemo(() => {
    if (!globalSearchQuery.trim()) return [];
    const query = globalSearchQuery.toLowerCase();
    return clients.filter(c =>
      c.name?.toLowerCase().includes(query) ||
      c.phone?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query) ||
      c.observations?.toLowerCase().includes(query) ||
      c.profileType?.toLowerCase().includes(query)
    ).slice(0, 4);
  }, [clients, globalSearchQuery]);

  const filteredTasks = React.useMemo(() => {
    if (!globalSearchQuery.trim()) return [];
    const query = globalSearchQuery.toLowerCase();
    return tasks.filter(t =>
      t.title?.toLowerCase().includes(query) ||
      t.clientName?.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.type?.toLowerCase().includes(query)
    ).slice(0, 4);
  }, [tasks, globalSearchQuery]);

  const hasSearchResults = filteredProperties.length > 0 || filteredClients.length > 0 || filteredTasks.length > 0;

  // Fetch all initial data
  const fetchData = async () => {
    try {
      const [resProps, resClients, resTasks, resProposals, resVisits, resStatus] = await Promise.all([
        apiFetch("/api/properties"),
        apiFetch("/api/clients"),
        apiFetch("/api/tasks"),
        apiFetch("/api/proposals"),
        apiFetch("/api/visits"),
        apiFetch("/api/status")
      ]);

      // If any of the requests return a 401 Unauthorized, the session has expired
      if (
        resProps.status === 401 ||
        resClients.status === 401 ||
        resTasks.status === 401 ||
        resProposals.status === 401 ||
        resVisits.status === 401
      ) {
        console.warn("Sessão expirada ou não autorizado detectada. Redirecionando para login.");
        setCurrentUser(null);
        clearUserSession();
        return;
      }

      const [dataProps, dataClients, dataTasks, dataProposals, dataVisits, dataStatus] = await Promise.all([
        resProps.json(),
        resClients.json(),
        resTasks.json(),
        resProposals.json(),
        resVisits.json(),
        resStatus.json()
      ]);

      if (Array.isArray(dataProps)) setProperties(dataProps);
      if (Array.isArray(dataClients)) setClients(dataClients);
      if (Array.isArray(dataTasks)) setTasks(dataTasks);
      if (Array.isArray(dataProposals)) setProposals(dataProposals);
      if (Array.isArray(dataVisits)) setVisits(dataVisits);
      setDbStatus(dataStatus);
    } catch (err) {
      console.error("Erro ao buscar dados do servidor:", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  // Handle invitation acceptance
  useEffect(() => {
    if (!currentUser || currentUser.isDemo) return;

    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get("invite");
    if (inviteToken) {
      const acceptInvite = async () => {
        try {
          const res = await apiFetch("/api/organizations/invites/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: inviteToken })
          });
          if (res.ok) {
            alert("Parabéns! Você aceitou o convite com sucesso e agora faz parte da imobiliária.");
            // Refetch current user session to get new defaultOrganizationId and roles
            const userRes = await apiFetch("/api/auth/me");
            if (userRes.ok) {
              const updatedUser = await userRes.json();
              setCurrentUser(updatedUser);
              saveUserSession(updatedUser);
            }
            // Clean up URL query parameters
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            const errJson = await res.json();
            alert(`Erro ao aceitar convite: ${errJson.error}`);
          }
        } catch (err) {
          console.error("Erro ao aceitar convite:", err);
        }
      };
      acceptInvite();
    }
  }, [currentUser]);

  // --- CONTROLLERS ---

  // Properties
  const handleAddProperty = async (newProp: Omit<Property, "id">) => {
    try {
      const res = await apiFetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProp)
      });
      const data = await res.json();
      setProperties(prev => [data, ...prev]);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleUpdateProperty = async (updated: Property) => {
    const id = updated.id || updated._id;
    try {
      const res = await apiFetch(`/api/properties/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      setProperties(prev => prev.map(p => (p.id === id || p._id === id ? data : p)));
      setSelectedProperty(data);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!id) {
      throw new Error("ID do imóvel não informado.");
    }

    console.log("handleDeleteProperty called with id:", id);

    const res = await apiFetch(`/api/properties/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("handleDeleteProperty response:", res.status, data);

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao excluir imóvel.");
    }

    if (!data?.success) {
      throw new Error(data?.error || "A exclusão não foi confirmada pelo banco de dados.");
    }

    setProperties(prev => prev.filter(p => p.id !== id && p._id !== id));
    setSelectedProperty(null);
  };

  // Clients
  const handleAddClient = async (newClient: Omit<Client, "id">) => {
    try {
      const res = await apiFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClient)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao salvar cliente no Supabase.");
      }
      if (!data?.id && !data?._id) {
        throw new Error("Cliente não foi salvo corretamente.");
      }
      setClients((prev) => [data, ...prev]);
    } catch (error: any) {
      console.error(error);
      alert(error.message);
      throw error;
    }
  };

  const handleUpdateClient = async (updated: Client) => {
    const id = updated.id || updated._id;
    try {
      const res = await apiFetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      setClients(prev => prev.map(c => (c.id === id || c._id === id ? data : c)));
      if (selectedClient && (selectedClient.id === id || selectedClient._id === id)) {
        setSelectedClient(data);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!id) {
      throw new Error("ID do cliente não informado.");
    }

    console.log("handleDeleteClient called with id:", id);

    const res = await apiFetch(`/api/clients/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    let data: any = null;

    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("handleDeleteClient response:", res.status, data);

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao excluir cliente.");
    }

    if (!data?.success) {
      throw new Error(data?.error || "A exclusão não foi confirmada pelo banco de dados.");
    }

    setClients(prev => prev.filter(c => c.id !== id && c._id !== id));

    setSelectedClient(prev => {
      if (!prev) return prev;
      return prev.id === id || prev._id === id ? null : prev;
    });

    await fetchData();
  };

  // --- PROPOSALS CONTROLLERS ---
  const handleAddProposal = async (newProposal: Omit<Proposal, "id">) => {
    try {
      const res = await apiFetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProposal)
      });
      const data = await res.json();
      setProposals(prev => [data, ...prev]);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleUpdateProposal = async (updated: Proposal) => {
    const id = updated.id || updated._id;
    try {
      const res = await apiFetch(`/api/proposals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      setProposals(prev => prev.map(p => (p.id === id || p._id === id ? data : p)));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteProposal = async (id: string) => {
    if (!id) {
      throw new Error("ID da proposta não informado.");
    }

    console.log("handleDeleteProposal called with id:", id);

    const res = await apiFetch(`/api/proposals/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("handleDeleteProposal response:", res.status, data);

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao excluir proposta.");
    }

    if (!data?.success) {
      throw new Error(data?.error || "A exclusão não foi confirmada pelo banco de dados.");
    }

    setProposals(prev => prev.filter(p => p.id !== id && p._id !== id));
  };

  // --- VISITS CONTROLLERS ---
  const handleAddVisit = async (newVisit: Omit<Visit, "id">) => {
    try {
      const res = await apiFetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newVisit)
      });
      const data = await res.json();
      setVisits(prev => [data, ...prev]);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleUpdateVisit = async (updated: Visit) => {
    const id = updated.id || updated._id;
    try {
      const res = await apiFetch(`/api/visits/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      setVisits(prev => prev.map(v => (v.id === id || v._id === id ? data : v)));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteVisit = async (id: string) => {
    if (!id) {
      throw new Error("ID da visita não informado.");
    }

    console.log("handleDeleteVisit called with id:", id);

    const res = await apiFetch(`/api/visits/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("handleDeleteVisit response:", res.status, data);

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao excluir visita.");
    }

    if (!data?.success) {
      throw new Error(data?.error || "A exclusão não foi confirmada pelo banco de dados.");
    }

    setVisits(prev => prev.filter(v => v.id !== id && v._id !== id));
  };

  // Tasks
  const handleAddTask = async (newTask: Omit<Task, "id">) => {
    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask)
      });
      const data = await res.json();
      setTasks(prev => [...prev, data]);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleToggleTaskCompletion = async (id: string, completed: boolean) => {
    try {
      const res = await apiFetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed })
      });
      const data = await res.json();
      setTasks(prev => prev.map(t => (t.id === id || t._id === id ? data : t)));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleUpdateTask = async (id: string, updatedFields: Partial<Task>) => {
    try {
      const res = await apiFetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields)
      });
      const data = await res.json();
      setTasks(prev => prev.map(t => (t.id === id || t._id === id ? data : t)));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!id) {
      throw new Error("ID da tarefa não informado.");
    }

    console.log("handleDeleteTask called with id:", id);

    const res = await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    console.log("handleDeleteTask response:", res.status, data);

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao excluir tarefa.");
    }

    if (!data?.success) {
      throw new Error(data?.error || "A exclusão não foi confirmada pelo banco de dados.");
    }

    setTasks(prev => prev.filter(t => t.id !== id && t._id !== id));
  };

  const handleResetDemoData = async () => {
    try {
      await apiFetch("/api/demo/reset", { method: "POST" });
      await fetchData();
      alert("Dados de demonstração resetados com sucesso! Todos os leads, imóveis, tarefas, visitas e propostas fictícias foram restaurados para o estado original.");
    } catch (err) {
      console.error("Erro ao resetar dados demo:", err);
    }
  };

  const handleStartDemo = () => {
    const demoUser: User = {
      id: "demo-user-1",
      username: "carlos_demo",
      name: "Carlos Brito (Demonstração)",
      email: "carlos.brito@metriacrm.com.br",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
      actingType: "Alto padrão",
      commercialName: "Brito Negócios Imobiliários",
      primaryCity: "São Paulo - SP",
      phone: "5511999999999",
      isDemo: true,
      onboardingCompleted: true,
      sessionToken: "demo_token_123"
    };
    
    saveUserSession(demoUser);
    setCurrentUser(demoUser);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md animate-pulse">
            <Home className="w-6 h-6 text-white animate-spin" />
          </div>
          <span className="text-sm font-semibold text-on-surface-variant">Carregando Metria CRM...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    if (!showAuth) {
      return (
        <LandingPage
          onGetStarted={(register) => {
            setAuthDefaultToRegister(register);
            setShowAuth(true);
          }}
          onStartDemo={handleStartDemo}
        />
      );
    }

    return (
      <LoginView
        initialRegister={authDefaultToRegister}
        onBackToLanding={() => {
          setShowAuth(false);
        }}
        onLoginSuccess={(user) => {
          saveUserSession(user);
          setCurrentUser(user);
        }}
      />
    );
  }

  const handleOnboardingComplete = (updatedUser: User) => {
    saveUserSession(updatedUser);
    setCurrentUser(updatedUser);
  };

  return (
    <div className="bg-background min-h-screen text-on-surface font-sans flex flex-col pb-28 md:pb-6">
      {currentUser?.isDemo && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-800 dark:text-amber-300 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-medium sticky top-0 z-50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>
              <strong>Modo Demonstração Ativo.</strong> Experimente a segurança de uma rotina onde o corretor não perde mais leads, visitas, propostas e follow-ups. Sinta o poder de ter suas oportunidades de vendas sob controle absoluto.
            </span>
          </div>
          <button
            onClick={handleResetDemoData}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 active:scale-[0.97] text-white font-bold text-xs rounded-lg transition-all shadow-sm cursor-pointer whitespace-nowrap"
          >
            Resetar Dados Demo
          </button>
        </div>
      )}
      
      {currentUser && !currentUser.onboardingCompleted && (
        <OnboardingModal user={currentUser} onComplete={handleOnboardingComplete} />
      )}
      
      {/* Top Application Bar */}
      <header className="flex justify-between items-center px-4 md:px-8 h-16 w-full sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-outline-variant/60 shadow-sm transition-all">
        <div className="flex items-center gap-3 shrink-0">
          {/* Brand Visual Logo */}
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-md shrink-0">
            <Home className="w-5 h-5 text-secondary-fixed animate-pulse" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-display text-lg font-bold text-primary tracking-tight leading-none">Metria CRM</h1>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-xs md:max-w-md mx-2 md:mx-6 relative search-container">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar imóveis, clientes, tarefas..."
              value={globalSearchQuery}
              onChange={(e) => {
                setGlobalSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              className="w-full pl-9 pr-14 py-1.5 text-xs md:text-sm bg-surface-container-high border border-outline-variant/40 rounded-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
            />
            {!globalSearchQuery && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:flex items-center gap-0.5">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-on-surface-variant/70 bg-surface-container-highest border border-outline-variant/60 rounded shadow-2xs">
                  ⌘K
                </kbd>
              </div>
            )}
            {globalSearchQuery && (
              <button
                onClick={() => {
                  setGlobalSearchQuery("");
                  setShowSearchResults(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Search Dropdown Results */}
          {showSearchResults && globalSearchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container border border-outline-variant rounded-2xl shadow-xl z-50 max-h-[400px] overflow-y-auto p-2">
              {!hasSearchResults ? (
                <div className="p-4 text-center text-xs md:text-sm text-on-surface-variant">
                  Nenhum resultado encontrado para "{globalSearchQuery}"
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Imóveis */}
                  {filteredProperties.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/5 rounded-lg">
                        <Home className="w-3.5 h-3.5 text-primary" />
                        Imóveis
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {filteredProperties.map(p => (
                          <button
                            key={p.id || p._id}
                            onClick={() => {
                              setSelectedProperty(p);
                              setGlobalSearchQuery("");
                              setShowSearchResults(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-surface-container-highest transition-colors flex justify-between items-center"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-on-surface line-clamp-1">{p.title}</div>
                              <div className="text-xs text-on-surface-variant line-clamp-1">{p.neighborhood}, {p.city}</div>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <span className="text-xs font-mono font-bold text-primary">
                                {(p.price ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clientes */}
                  {filteredClients.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-secondary uppercase tracking-wider bg-secondary/5 rounded-lg">
                        <Users className="w-3.5 h-3.5 text-secondary" />
                        Clientes
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {filteredClients.map(c => (
                          <button
                            key={c.id || c._id}
                            onClick={() => {
                              setSelectedClient(c);
                              setGlobalSearchQuery("");
                              setShowSearchResults(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-surface-container-highest transition-colors flex justify-between items-center"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-on-surface line-clamp-1">{c.name}</div>
                              <div className="text-xs text-on-surface-variant line-clamp-1">{c.email || c.phone}</div>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container">
                                {c.profileType}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tarefas */}
                  {filteredTasks.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider bg-surface-container-highest rounded-lg">
                        <CalendarDays className="w-3.5 h-3.5 text-on-surface-variant" />
                        Tarefas
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {filteredTasks.map(t => (
                          <button
                            key={t.id || t._id}
                            onClick={() => {
                              setSelectedTaskDate(t.date);
                              setActiveTab("tasks");
                              setGlobalSearchQuery("");
                              setShowSearchResults(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-surface-container-highest transition-colors flex justify-between items-center"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-on-surface line-clamp-1">{t.title}</div>
                              <div className="text-xs text-on-surface-variant line-clamp-1">{t.description || `Com: ${t.clientName}`}</div>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container block mb-1">
                                {t.type}
                              </span>
                              <span className="text-[10px] text-on-surface-variant block font-mono">
                                {t.date.split("-").reverse().slice(0, 2).join("/")} às {t.time}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action icons & Profile */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer relative"
            title="Atalhos de Teclado (Ctrl+/)"
          >
            <Keyboard className="w-5 h-5" />
          </button>

          <div className="relative notification-container">
            <button 
              onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
              className="p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant relative cursor-pointer"
              title="Notificações de Tarefas de Hoje"
            >
              {todayTasks.length > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-secondary text-on-secondary text-[10px] font-extrabold flex items-center justify-center px-1 shadow-sm border border-white">
                  {todayTasks.length}
                </span>
              ) : (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-outline-variant/60"></span>
              )}
              <Bell className="w-5 h-5" />
            </button>

            {/* Notification Dropdown Panel */}
            <AnimatePresence>
              {showNotificationDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-80 bg-surface rounded-2xl border border-outline-variant shadow-xl z-50 overflow-hidden text-left"
                >
                  <div className="p-4 border-b border-outline-variant/40 bg-surface-container-low flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-primary/10 rounded-lg text-primary">
                        <Bell className="w-4 h-4" />
                      </span>
                      <div>
                        <h4 className="font-bold text-on-surface text-xs tracking-wide">Tarefas de Hoje</h4>
                        <p className="text-[10px] text-on-surface-variant font-medium">
                          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })}
                        </p>
                      </div>
                    </div>
                    {todayTasks.length > 0 && (
                      <span className="text-[10px] font-bold bg-secondary/20 text-on-secondary-container px-2 py-0.5 rounded-full font-mono">
                        {todayTasks.length} {todayTasks.length === 1 ? "pendente" : "pendentes"}
                      </span>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-outline-variant/30">
                    {todayTasks.length === 0 ? (
                      <div className="p-6 text-center space-y-2">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                          <Check className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-on-surface">Excelente trabalho!</p>
                        <p className="text-[11px] text-on-surface-variant font-medium">
                          Nenhuma tarefa agendada ou pendente para o dia de hoje.
                        </p>
                      </div>
                    ) : (
                      todayTasks.map((task) => {
                        const taskId = task.id || task._id || "";
                        return (
                          <div 
                            key={taskId}
                            className="p-3.5 hover:bg-surface-container-low transition-colors flex items-start gap-2.5 group cursor-pointer"
                            onClick={() => {
                              setActiveTab("tasks");
                              setShowNotificationDropdown(false);
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTaskCompletion(taskId, true);
                              }}
                              className="mt-0.5 w-5 h-5 rounded-md border border-outline hover:border-primary/80 flex items-center justify-center hover:bg-primary/5 transition-all text-transparent hover:text-primary shrink-0 cursor-pointer"
                              title="Marcar como concluída"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <div className="space-y-1 min-w-0 flex-1">
                              <p className="text-xs font-bold text-on-surface leading-tight group-hover:text-primary transition-colors truncate">
                                {task.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-semibold flex-wrap">
                                {task.time && (
                                  <span className="flex items-center gap-0.5 font-mono text-[9px] bg-primary/5 px-1.5 py-0.5 rounded-md text-primary font-bold">
                                    <Clock className="w-2.5 h-2.5" />
                                    {task.time}
                                  </span>
                                )}
                                {task.type && (
                                  <span className="bg-surface-container-high px-1.5 py-0.5 rounded-md font-sans text-[9px] uppercase tracking-wider">
                                    {task.type}
                                  </span>
                                )}
                                {task.clientName && (
                                  <span className="text-primary truncate max-w-[120px]">
                                    👤 {task.clientName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="p-2.5 bg-surface-container-low border-t border-outline-variant/40 text-center">
                    <button
                      onClick={() => {
                        setActiveTab("tasks");
                        setShowNotificationDropdown(false);
                      }}
                      className="w-full py-1.5 text-center text-xs font-bold text-primary hover:text-primary/80 hover:bg-primary/5 rounded-lg transition-colors cursor-pointer"
                    >
                      Ir para Agenda completa
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Agent Headshot */}
          <button
            onClick={() => setActiveTab("settings")}
            className="w-9 h-9 rounded-full overflow-hidden border border-primary/20 bg-primary/10 hover:ring-2 hover:ring-primary/40 hover:scale-105 transition-all cursor-pointer"
            title="Configurações de Perfil"
          >
            <img
              className="w-full h-full object-cover"
              src={currentUser.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"}
              alt={currentUser.name}
            />
          </button>
        </div>
      </header>

      {/* Main Container Stage */}
      <main className={`${activeTab === "pipeline" ? "max-w-7xl md:px-8" : "max-w-4xl md:px-6"} w-full mx-auto px-4 py-6 flex-grow transition-all duration-300`}>
        {dbStatus?.schemaMissing && (
          <div className="mb-6 p-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row items-start gap-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 flex-grow text-left">
              <h4 className="text-sm font-bold text-amber-600 dark:text-amber-400">Banco de Dados Supabase não Inicializado</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Detectamos que as tabelas necessárias (<code>clients</code>, <code>properties</code>, etc.) ainda não foram criadas no seu banco de dados Supabase. Para que você possa usar o app sem interrupções, o sistema está operando temporariamente em **Modo Offline de Demonstração**.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 text-xs">
                <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">👉 Como resolver:</span>
                <p className="text-on-surface-variant">
                  Acesse o painel do seu Supabase, abra o <strong>SQL Editor</strong>, crie uma nova query, cole o conteúdo de <code>supabase/schema.sql</code> e clique em <strong>Run</strong>. O app conectará automaticamente em seguida!
                </p>
              </div>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <DashboardView
                properties={properties}
                clients={clients}
                tasks={tasks}
                proposals={proposals}
                visits={visits}
                dbStatus={dbStatus}
                currentUser={currentUser}
                onAddTask={handleAddTask}
                onNavigateToTab={(tab) => setActiveTab(tab)}
                onSelectClient={(client) => setSelectedClient(client)}
                onSelectProperty={(property) => setSelectedProperty(property)}
                onPrefillClientForTask={(client) => {
                  setPrefilledClientForTask(client);
                  setActiveTab("tasks");
                }}
                onToggleTaskCompletion={handleToggleTaskCompletion}
                onDeleteTask={handleDeleteTask}
              />
            </motion.div>
          )}

          {activeTab === "properties" && (
            <motion.div
              key="properties"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <PropertiesView
                properties={properties}
                clients={clients}
                onAddProperty={handleAddProperty}
                onSelectProperty={(prop) => setSelectedProperty(prop)}
                currentUser={currentUser}
              />
            </motion.div>
          )}

          {activeTab === "clients" && (
            <motion.div
              key="clients"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <ClientsView
                clients={clients}
                tasks={tasks}
                proposals={proposals}
                visits={visits}
                onAddClient={handleAddClient}
                onSelectClient={(client) => setSelectedClient(client)}
                currentUser={currentUser}
              />
            </motion.div>
          )}

          {activeTab === "pipeline" && (
            <motion.div
              key="pipeline"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <PipelineView
                clients={clients}
                properties={properties}
                tasks={tasks}
                proposals={proposals}
                visits={visits}
                onUpdateClient={handleUpdateClient}
                onSelectClient={(client) => setSelectedClient(client)}
                onAddClient={handleAddClient}
                currentUser={currentUser}
              />
            </motion.div>
          )}

          {activeTab === "tasks" && (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <TasksView
                currentUser={currentUser}
                tasks={tasks}
                clients={clients}
                properties={properties}
                onAddTask={handleAddTask}
                onToggleTaskCompletion={handleToggleTaskCompletion}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                selectedDate={selectedTaskDate}
                onDateChange={setSelectedTaskDate}
                prefilledClientForTask={prefilledClientForTask}
                onClearPrefilledClient={() => setPrefilledClientForTask(null)}
              />
            </motion.div>
          )}

          {activeTab === "transactions" && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <TransactionsView
                proposals={proposals}
                visits={visits}
                clients={clients}
                properties={properties}
                onAddProposal={handleAddProposal}
                onUpdateProposal={handleUpdateProposal}
                onDeleteProposal={handleDeleteProposal}
                onAddVisit={handleAddVisit}
                onUpdateVisit={handleUpdateVisit}
                onDeleteVisit={handleDeleteVisit}
                currentUser={currentUser}
              />
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <SettingsView
                currentUser={currentUser}
                properties={properties}
                clients={clients}
                tasks={tasks}
                onUpdateSuccess={(updatedUser) => {
                  saveUserSession(updatedUser);
                  setCurrentUser(updatedUser);
                }}
                onLogout={async () => {
                  try {
                    await apiFetch("/api/auth/logout", { method: "POST" });
                  } catch (err) {
                    console.error("Erro ao realizar logout:", err);
                  }
                  clearUserSession();
                  setCurrentUser(null);
                  setShowAuth(false);
                }}
              />
            </motion.div>
          )}

          {activeTab === "info" && (
            <motion.div
              key="info"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <InfoView
                properties={properties}
                clients={clients}
                tasks={tasks}
                proposals={proposals}
                visits={visits}
                currentUser={currentUser}
                onNavigateToTab={setActiveTab}
                dbStatus={dbStatus}
                onSelectClient={(client) => setSelectedClient(client)}
                onAddTask={handleAddTask}
              />
            </motion.div>
          )}

          {activeTab === "team" && currentUser && (
            <motion.div
              key="team"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <TeamView currentUser={currentUser} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Elegant Beta Footer */}
      <footer className="w-full text-center py-6 pb-20 md:pb-10 text-[11px] text-on-surface-variant/60 font-medium tracking-wide border-t border-outline-variant/10 max-w-4xl mx-auto px-4 mt-auto">
        Metria CRM Beta — versão inicial para corretores parceiros.
      </footer>

      {/* Bottom Sticky Navigation (for Mobile and compact layouts) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-outline-variant flex justify-around items-center py-2 pb-safe rounded-t-2xl shadow-[0_-4px_16px_rgba(0,53,39,0.06)] md:hidden">
        {/* Dashboard Link */}
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === "dashboard"
              ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <LayoutDashboard className="w-5 h-5 stroke-[2]" />
          <span className="text-[10px] mt-1 font-semibold">Dashboard</span>
        </button>

        {/* Properties Link */}
        <button
          onClick={() => setActiveTab("properties")}
          className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === "properties"
              ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <Home className="w-5 h-5 stroke-[2]" />
          <span className="text-[10px] mt-1 font-semibold">Imóveis</span>
        </button>

        {/* Clients Link */}
        <button
          onClick={() => setActiveTab("clients")}
          className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === "clients"
              ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <Users className="w-5 h-5 stroke-[2]" />
          <span className="text-[10px] mt-1 font-semibold">Clientes</span>
        </button>

        {/* Pipeline Link */}
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === "pipeline"
              ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <FolderSync className="w-5 h-5 stroke-[2]" />
          <span className="text-[10px] mt-1 font-semibold">Esteira</span>
        </button>

        {/* Tasks Link */}
        <button
          onClick={() => setActiveTab("tasks")}
          className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === "tasks"
              ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <CalendarDays className="w-5 h-5 stroke-[2]" />
          <span className="text-[10px] mt-1 font-semibold">Agenda</span>
        </button>

        {/* Transactions Link */}
        <button
          onClick={() => setActiveTab("transactions")}
          className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === "transactions"
              ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <Handshake className="w-5 h-5 stroke-[2]" />
          <span className="text-[10px] mt-1 font-semibold">Propostas</span>
        </button>

        {/* Settings Link */}
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === "settings"
              ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <Settings className="w-5 h-5 stroke-[2]" />
          <span className="text-[10px] mt-1 font-semibold">Ajustes</span>
        </button>

        {currentUser?.defaultOrganizationId && planAccess.canUseTeamManagement && (
          <button
            onClick={() => setActiveTab("team")}
            className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeTab === "team"
                ? "bg-secondary-container text-on-secondary-container scale-105 font-bold"
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <Users2 className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] mt-1 font-semibold">Equipe</span>
          </button>
        )}
      </nav>

      {/* Desktop Sidebar Sidebar Navigation (visible on large viewports) */}
      <div className="hidden md:flex fixed left-6 top-1/2 -translate-y-1/2 flex-col gap-4 bg-surface/90 backdrop-blur-md p-3 rounded-2xl border border-outline-variant shadow-lg z-40">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "dashboard" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Dashboard"
        >
          <LayoutDashboard className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("properties")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "properties" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Imóveis"
        >
          <Home className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("clients")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "clients" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Clientes"
        >
          <Users className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "pipeline" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Esteira de Vendas"
        >
          <FolderSync className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("tasks")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "tasks" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Agenda de Tarefas"
        >
          <CalendarDays className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "transactions" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Propostas e Visitas"
        >
          <Handshake className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("info")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "info" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Informações"
        >
          <TrendingUp className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
            activeTab === "settings" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
          }`}
          title="Configurações do CRM"
        >
          <Settings className="w-5 h-5" />
        </button>

        {currentUser?.defaultOrganizationId && planAccess.canUseTeamManagement && (
          <button
            onClick={() => setActiveTab("team")}
            className={`p-3 rounded-xl transition-all tooltip cursor-pointer ${
              activeTab === "team" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
            }`}
            title="Minha Equipe (Imobiliária)"
          >
            <Users2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Property Details Modal */}
      <AnimatePresence>
        {selectedProperty && (
          <PropertyModal
            property={selectedProperty}
            clients={clients}
            onClose={() => setSelectedProperty(null)}
            onUpdate={handleUpdateProperty}
            onDelete={handleDeleteProperty}
            geminiActive={!!dbStatus?.geminiActive}
          />
        )}
      </AnimatePresence>

      {/* Client Details Modal */}
      <AnimatePresence>
        {selectedClient && (
          <ClientModal
            client={selectedClient}
            properties={properties}
            tasks={tasks}
            proposals={proposals}
            visits={visits}
            currentUser={currentUser || undefined}
            onClose={() => setSelectedClient(null)}
            onUpdate={handleUpdateClient}
            onDelete={handleDeleteClient}
          />
        )}
      </AnimatePresence>

      {/* User Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <UserProfileModal
            user={currentUser}
            onClose={() => setShowProfileModal(false)}
            onUpdateSuccess={(updatedUser) => {
              saveUserSession(updatedUser);
              setCurrentUser(updatedUser);
            }}
            onLogout={async () => {
              try {
                await apiFetch("/api/auth/logout", { method: "POST" });
              } catch (err) {
                console.error("Erro ao realizar logout:", err);
              }
              clearUserSession();
              setCurrentUser(null);
              setShowProfileModal(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Helper Modal */}
      <AnimatePresence>
        {showShortcutsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="bg-surface rounded-3xl border border-outline-variant shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-outline-variant/40 bg-surface-container-low flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-primary/10 rounded-xl text-primary">
                    <Keyboard className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-on-surface text-base">Atalhos de Teclado</h3>
                    <p className="text-xs text-on-surface-variant">Navegação rápida e busca para produtividade</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShortcutsModal(false)}
                  className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-5 text-sm text-on-surface">
                {/* Section: Ações Globais */}
                <div>
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Ações Globais</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-container-low">
                      <span className="text-xs font-semibold text-on-surface">Focar Busca Global</span>
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <kbd className="px-2 py-0.5 bg-surface-container-highest border border-outline-variant/60 rounded font-semibold text-primary">Ctrl + K</kbd>
                        <span className="text-on-surface-variant text-[10px]">ou</span>
                        <kbd className="px-2 py-0.5 bg-surface-container-highest border border-outline-variant/60 rounded font-semibold text-primary">⌘ + K</kbd>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-container-low">
                      <span className="text-xs font-semibold text-on-surface">Abrir Guia de Atalhos</span>
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <kbd className="px-2 py-0.5 bg-surface-container-highest border border-outline-variant/60 rounded font-semibold text-primary">Ctrl + /</kbd>
                        <span className="text-on-surface-variant text-[10px]">ou</span>
                        <kbd className="px-2 py-0.5 bg-surface-container-highest border border-outline-variant/60 rounded font-semibold text-primary">?</kbd>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-container-low">
                      <span className="text-xs font-semibold text-on-surface">Fechar Menus e Modais</span>
                      <kbd className="px-2 py-0.5 bg-surface-container-highest border border-outline-variant/60 rounded font-mono text-xs font-semibold text-on-surface-variant">Esc</kbd>
                    </div>
                  </div>
                </div>

                {/* Section: Navegação Principal */}
                <div>
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Navegação Principal</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: "Dashboard", primary: "Ctrl + D", alt: "Alt + 1" },
                      { label: "Tarefas", primary: "Ctrl + T", alt: "Alt + 4" },
                      { label: "Imóveis", primary: "Alt + 2", alt: "Ctrl + Shift + P" },
                      { label: "Clientes", primary: "Alt + 3", alt: "Ctrl + Shift + C" },
                      { label: "Funil de Vendas", primary: "Alt + 5", alt: "Ctrl + Shift + F" },
                      { label: "Negócios", primary: "Alt + 6", alt: "Ctrl + Shift + G" },
                      { label: "Configurações", primary: "Alt + 7", alt: "Ctrl + Shift + S" },
                      { label: "Inteligência IA", primary: "Alt + 8", alt: "Ctrl + Shift + I" },
                      { label: "Equipe", primary: "Alt + 9", alt: "Ctrl + Shift + M" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2 px-3 rounded-xl bg-surface-container-low">
                        <span className="text-xs font-medium text-on-surface">{item.label}</span>
                        <kbd className="px-1.5 py-0.5 bg-surface-container-highest border border-outline-variant/60 rounded font-mono text-[11px] font-semibold text-primary">
                          {item.primary}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-outline-variant/40 bg-surface-container-low text-center">
                <span className="text-xs text-on-surface-variant font-medium">
                  Dica: Pressione <span className="font-mono font-bold text-primary">Alt + 1..9</span> para alternar rapidamente entre abas.
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function RootApp() {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="min-h-screen bg-surface flex items-center justify-center p-6 text-on-surface">
          <div className="max-w-md w-full bg-surface-container-low border border-outline-variant/60 rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-error/10 text-error rounded-2xl flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-on-surface">Ops! Algo deu errado</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              Ocorreu uma falha inesperada durante a execução do aplicativo. A falha foi capturada em tempo real pelo Sentry e registrada para análise.
            </p>
            {error && (
              <div className="bg-surface-container-highest p-3 rounded-xl mb-6 text-left overflow-x-auto max-h-32 border border-outline-variant/40">
                <code className="text-xs font-mono text-error leading-relaxed block">
                  {(error as any)?.message || String(error)}
                </code>
              </div>
            )}
            <button
              onClick={() => {
                resetError();
                window.location.reload();
              }}
              className="w-full py-3 px-4 bg-primary text-on-primary font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      )}
      onError={(error, componentStack) => {
        logError(error, { type: "sentry_react_root_boundary", componentStack });
      }}
    >
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  );
}
