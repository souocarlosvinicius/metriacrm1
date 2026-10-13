import React, { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, RefreshCw, AlertCircle, CheckCircle2, History, Building2 } from "lucide-react";
import { apiFetch } from "../api";
import { Organization } from "../types";

interface AdminSuspensionManagerProps {
  currentOrgId?: string;
  onStatusChanged?: () => void;
}

export default function AdminSuspensionManager({
  currentOrgId,
  onStatusChanged
}: AdminSuspensionManagerProps) {
  const [isAdminAuthorized, setIsAdminAuthorized] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(currentOrgId || "");
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados para liberação manual de planos
  const [targetPlan, setTargetPlan] = useState("beta");
  const [planExpiresDate, setPlanExpiresDate] = useState("");
  const [planReason, setPlanReason] = useState("");
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [planSuccessMessage, setPlanSuccessMessage] = useState<string | null>(null);
  const [planErrorMessage, setPlanErrorMessage] = useState<string | null>(null);

  // 1. Verifica se o usuário atual é administrador interno da Metria
  useEffect(() => {
    const checkAdmin = async () => {
      setCheckingAuth(true);
      try {
        const res = await apiFetch("/api/admin/check-authority");
        if (res.ok) {
          const data = await res.json();
          setIsAdminAuthorized(Boolean(data.isInternalAdmin));
        } else {
          setIsAdminAuthorized(false);
        }
      } catch (err) {
        setIsAdminAuthorized(false);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkAdmin();
  }, []);

  // 2. Carrega organizações para seleção pelo administrador
  useEffect(() => {
    if (!isAdminAuthorized) return;

    const loadOrgs = async () => {
      try {
        const res = await apiFetch("/api/organizations");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setOrganizations(data);
            if (!selectedOrgId && data.length > 0) {
              setSelectedOrgId(data[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar organizações no painel de administração:", err);
      }
    };
    loadOrgs();
  }, [isAdminAuthorized]);

  // 3. Carrega detalhes do estado de acesso da organização selecionada
  const fetchOrgAccessStatus = async (orgId: string) => {
    if (!orgId) return;
    setLoadingDetails(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch(`/api/admin/organizations/${orgId}/access-status`);
      if (res.ok) {
        const data = await res.json();
        setOrgDetails(data);
        if (data.plan) setTargetPlan(data.plan);
        if (data.subscriptionExpiresAt || data.subscription_expires_at) {
          const exp = data.subscriptionExpiresAt || data.subscription_expires_at;
          setPlanExpiresDate(exp.split("T")[0]);
        } else {
          setPlanExpiresDate("");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.error || "Não foi possível consultar o estado da organização.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Erro de rede ao consultar estado.");
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthorized && selectedOrgId) {
      fetchOrgAccessStatus(selectedOrgId);
    }
  }, [isAdminAuthorized, selectedOrgId]);

  if (checkingAuth) {
    return null; // Silencioso enquanto valida autoridade interna
  }

  // Se o usuário não for administrador interno da Metria, NÃO renderiza nada
  if (!isAdminAuthorized) {
    return null;
  }

  const handleGrantPlan = async () => {
    if (!selectedOrgId) return;
    setPlanActionLoading(true);
    setPlanSuccessMessage(null);
    setPlanErrorMessage(null);

    try {
      const res = await apiFetch(`/api/organizations/${selectedOrgId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: targetPlan,
          expiresAt: planExpiresDate ? new Date(`${planExpiresDate}T23:59:59.999Z`).toISOString() : null,
          reason: planReason.trim() || `Liberação manual do plano ${targetPlan.toUpperCase()} por administrador interno`
        })
      });

      const data = await res.json();
      if (res.ok) {
        setPlanSuccessMessage(`Plano ${data.plan?.toUpperCase() || targetPlan.toUpperCase()} liberado com sucesso com auditoria em transação!`);
        setPlanReason("");
        await fetchOrgAccessStatus(selectedOrgId);
        if (onStatusChanged) onStatusChanged();
      } else {
        setPlanErrorMessage(data.error || "Falha ao liberar plano.");
      }
    } catch (err: any) {
      setPlanErrorMessage(err.message || "Erro de rede ao liberar plano.");
    } finally {
      setPlanActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!selectedOrgId) return;
    if (!reason.trim()) {
      setErrorMessage("Informe obrigatoriamente o motivo administrativo para a suspensão.");
      return;
    }

    setActionLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await apiFetch(`/api/admin/organizations/${selectedOrgId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMessage("Organização suspensa com sucesso! O acesso a recursos foi bloqueado e os dados estão preservados.");
        setReason("");
        await fetchOrgAccessStatus(selectedOrgId);
        if (onStatusChanged) onStatusChanged();
      } else {
        setErrorMessage(data.error || "Falha ao suspender organização.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Erro na comunicação ao suspender.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (!selectedOrgId) return;

    setActionLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await apiFetch(`/api/admin/organizations/${selectedOrgId}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Reativação administrativa manual" })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMessage("Organização reativada com sucesso! O acesso ao CRM foi restabelecido sem alterar limites ou plano.");
        setReason("");
        await fetchOrgAccessStatus(selectedOrgId);
        if (onStatusChanged) onStatusChanged();
      } else {
        setErrorMessage(data.error || "Falha ao reativar organização.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Erro na comunicação ao reativar.");
    } finally {
      setActionLoading(false);
    }
  };

  const currentAccessStatus = orgDetails?.accessStatus || orgDetails?.access_status || "active";
  const isSuspended = currentAccessStatus === "suspended";

  return (
    <div className="w-full bg-surface-container-high/60 border border-primary/30 rounded-3xl p-6 text-left space-y-6 shadow-sm my-6">
      {/* Header do Módulo Administrativo Restrito */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-outline-variant/30 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary text-white">
                Metria Internal Admin
              </span>
              <span className="text-xs text-on-surface-variant font-medium">Controle de Inadimplência</span>
            </div>
            <h3 className="text-base font-bold text-on-surface font-display mt-0.5">
              Suspensão e Reativação Administrativa de Contas
            </h3>
          </div>
        </div>

        {/* Seletor de Organização */}
        {organizations.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-on-surface-variant" />
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold bg-surface border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.accessStatus === "suspended" || (org as any).access_status === "suspended" ? "SUSPENSA" : "Ativa"})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Alertas de Retorno */}
      {successMessage && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs rounded-xl flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-error/10 border border-error/30 text-error text-xs rounded-xl flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Estado Atual da Organização */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-surface rounded-xl border border-outline-variant/30">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase block">Status de Acesso</span>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${isSuspended ? "bg-error animate-pulse" : "bg-emerald-500"}`}
            ></span>
            <span className={`text-xs font-black uppercase ${isSuspended ? "text-error" : "text-emerald-700"}`}>
              {isSuspended ? "Suspenso por Inadimplência" : "Acesso Ativo Regular"}
            </span>
          </div>
        </div>

        <div className="p-3.5 bg-surface rounded-xl border border-outline-variant/30">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase block">Data da Alteração</span>
          <span className="text-xs font-mono font-medium text-on-surface block mt-1">
            {orgDetails?.suspendedAt || orgDetails?.suspended_at
              ? new Date(orgDetails.suspendedAt || orgDetails.suspended_at).toLocaleString("pt-BR")
              : "Sem suspensão recente"}
          </span>
        </div>

        <div className="p-3.5 bg-surface rounded-xl border border-outline-variant/30">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase block">Motivo Administrativo</span>
          <span className="text-xs text-on-surface block mt-1 truncate" title={orgDetails?.suspensionReason || orgDetails?.suspension_reason || "-"}>
            {orgDetails?.suspensionReason || orgDetails?.suspension_reason || "Nenhum motivo registrado"}
          </span>
        </div>
      </div>

      {/* Painel de Operações Administrativas */}
      <div className="p-4 bg-surface rounded-2xl border border-outline-variant/30 space-y-3">
        <label className="block text-xs font-bold text-on-surface">
          Motivo / Justificativa da Operação Administrativa
          <span className="text-on-surface-variant font-normal text-[11px] block mt-0.5">
            Obrigatório para suspensão. Ficará registrado na auditoria com o seu identificador de administrador.
          </span>
        </label>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Pendência na fatura referente ao mês de Outubro/2026 após 3 tentativas de contato financeiro."
          className="w-full p-2.5 text-xs bg-surface-container-low border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary resize-none"
        />

        <div className="flex items-center gap-3 pt-2">
          {isSuspended ? (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleReactivate}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
              Reativar Organização (Remover Suspensão)
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleSuspend}
              className="px-4 py-2 bg-error hover:bg-error/90 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Suspender Organização por Inadimplência
            </button>
          )}

          <button
            type="button"
            disabled={loadingDetails}
            onClick={() => fetchOrgAccessStatus(selectedOrgId)}
            className="px-3 py-2 bg-surface hover:bg-surface-container text-on-surface-variant text-xs font-semibold rounded-xl border border-outline-variant transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loadingDetails ? "animate-spin" : ""}`} />
            Atualizar Status
          </button>
        </div>
      </div>

      {/* PAINEL DE LIBERAÇÃO MANUAL DE PLANOS E VALIDADE (METRIA INTERNAL ADMIN) */}
      <div className="p-4 bg-surface rounded-2xl border border-primary/20 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 flex-wrap gap-2">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-primary">
              Liberação Manual de Plano e Validade
            </h4>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Altere o plano, configure prazo de validade contratual e gere auditoria atômica em transação.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-on-surface-variant block uppercase">Plano Atual</span>
            <span className="text-xs font-black uppercase text-primary">
              {orgDetails?.plan || "beta"} ({orgDetails?.maxMembers || orgDetails?.max_members || 1} membros)
            </span>
          </div>
        </div>

        {planSuccessMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{planSuccessMessage}</span>
          </div>
        )}

        {planErrorMessage && (
          <div className="p-3 bg-error/10 border border-error/30 text-error text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{planErrorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-on-surface mb-1">
              Plano a Conceder
            </label>
            <select
              value={targetPlan}
              onChange={(e) => setTargetPlan(e.target.value)}
              className="w-full p-2.5 text-xs bg-surface-container-low border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary font-bold"
            >
              <option value="beta">Beta (Gratuito - 1 usuário)</option>
              <option value="start">Start (1 usuário - sem IA)</option>
              <option value="pro">Pro (1 usuário - com Gemini IA)</option>
              <option value="max">Max (Até 10 corretores - com Gemini IA)</option>
              <option value="pro_max">PRO MAX (Até 50 corretores - com Gemini IA & BI)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface mb-1">
              Validade / Expiração da Assinatura
            </label>
            <input
              type="date"
              value={planExpiresDate}
              onChange={(e) => setPlanExpiresDate(e.target.value)}
              className="w-full p-2.5 text-xs bg-surface-container-low border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary font-medium"
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 30);
                  setPlanExpiresDate(d.toISOString().split("T")[0]);
                }}
                className="text-[10px] px-2 py-0.5 bg-surface-container hover:bg-surface-container-high rounded text-on-surface-variant font-medium cursor-pointer"
              >
                +30 dias
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 90);
                  setPlanExpiresDate(d.toISOString().split("T")[0]);
                }}
                className="text-[10px] px-2 py-0.5 bg-surface-container hover:bg-surface-container-high rounded text-on-surface-variant font-medium cursor-pointer"
              >
                +90 dias
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setFullYear(d.getFullYear() + 1);
                  setPlanExpiresDate(d.toISOString().split("T")[0]);
                }}
                className="text-[10px] px-2 py-0.5 bg-surface-container hover:bg-surface-container-high rounded text-on-surface-variant font-medium cursor-pointer"
              >
                +1 ano
              </button>
              <button
                type="button"
                onClick={() => setPlanExpiresDate("")}
                className="text-[10px] px-2 py-0.5 bg-surface-container hover:bg-surface-container-high rounded text-on-surface-variant font-medium cursor-pointer"
              >
                Sem expiração
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-on-surface mb-1">
            Motivo / Justificativa da Liberação do Plano
          </label>
          <input
            type="text"
            value={planReason}
            onChange={(e) => setPlanReason(e.target.value)}
            placeholder="Ex: Pagamento anual confirmado via PIX comercial / liberação manual"
            className="w-full p-2.5 text-xs bg-surface-container-low border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <button
          type="button"
          disabled={planActionLoading || !selectedOrgId}
          onClick={handleGrantPlan}
          className="px-4 py-2 bg-primary hover:bg-primary/90 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <CheckCircle2 className={`w-3.5 h-3.5 ${planActionLoading ? "animate-spin" : ""}`} />
          {planActionLoading ? "Aplicando Transação..." : "Liberar / Salvar Plano com Auditoria"}
        </button>
      </div>

      {/* Histórico Recente de Auditoria de Planos Concedidos */}
      {Array.isArray(orgDetails?.planAuditHistory) && orgDetails.planAuditHistory.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-outline-variant/20">
          <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
            <History className="w-3.5 h-3.5" />
            <span>Histórico de Auditoria de Planos Liberados</span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {orgDetails.planAuditHistory.map((item: any) => (
              <div
                key={item.id}
                className="p-2.5 bg-surface rounded-xl border border-outline-variant/20 flex items-center justify-between text-xs gap-3"
              >
                <div>
                  <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded mr-2 bg-primary/10 text-primary">
                    {item.previous_plan || "beta"} → {item.new_plan}
                  </span>
                  <span className="text-on-surface-variant text-[11px]">{item.reason || "Liberação manual"}</span>
                  {item.new_expires_at && (
                    <span className="text-[10px] text-on-surface-variant/80 ml-2">
                      (Válido até: {new Date(item.new_expires_at).toLocaleDateString("pt-BR")})
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0 text-[10px] text-on-surface-variant font-mono">
                  {new Date(item.performed_at).toLocaleString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico Recente de Auditoria de Suspensão */}
      {Array.isArray(orgDetails?.auditHistory) && orgDetails.auditHistory.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-outline-variant/20">
          <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
            <History className="w-3.5 h-3.5" />
            <span>Histórico de Auditoria de Suspensões / Reativações</span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {orgDetails.auditHistory.map((item: any) => (
              <div
                key={item.id}
                className="p-2.5 bg-surface rounded-xl border border-outline-variant/20 flex items-center justify-between text-xs gap-3"
              >
                <div>
                  <span
                    className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded mr-2 ${
                      item.action === "suspend"
                        ? "bg-error/15 text-error"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {item.action === "suspend" ? "Suspensão" : "Reativação"}
                  </span>
                  <span className="text-on-surface-variant text-[11px]">{item.reason || "-"}</span>
                </div>
                <div className="text-right shrink-0 text-[10px] text-on-surface-variant font-mono">
                  {new Date(item.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
