import React from "react";
import { Organization, PlanLimits } from "../types";
import { canUseFeature, normalizePlanId } from "../config/plans";
import { ShieldAlert, ArrowUpRight, Loader2 } from "lucide-react";

interface PlanGuardProps {
  feature: keyof PlanLimits;
  currentOrganization?: Organization | null;
  orgStatus?: "loading" | "ready" | "error" | "unselected";
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const PlanGuard: React.FC<PlanGuardProps> = ({
  feature,
  currentOrganization,
  orgStatus,
  children,
  fallback
}) => {
  // Regra 3: Se a organização estiver carregando, exibe estado de loading sem mascarar como Beta
  if (orgStatus === "loading") {
    return (
      <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center min-h-[220px]">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3 mx-auto" />
        <p className="text-xs text-on-surface-variant font-medium">Carregando plano e permissões da organização...</p>
      </div>
    );
  }

  // Regra 3 & 4: Organização ausente ou com falha de consulta não pode virar Beta
  if (!currentOrganization || orgStatus === "error" || orgStatus === "unselected") {
    return (
      <div id="plan-guard-card" className="flex flex-col items-center justify-center p-8 md:p-10 text-center bg-surface-container-low border border-outline-variant/30 rounded-3xl max-w-lg mx-auto my-12 shadow-sm">
        <div className="p-4 bg-amber-500/10 text-amber-500 rounded-2xl mb-4">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-bold text-on-surface mb-2">Organização não Selecionada</h3>
        <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
          {orgStatus === "error"
            ? "Ocorreu uma falha ao consultar os dados da sua organização no servidor."
            : "Selecione sua organização ativa autorizada para liberar as funcionalidades do seu plano."}
        </p>
        <button
          onClick={() => {
            const event = new CustomEvent("navigate-to-settings-plan");
            window.dispatchEvent(event);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-on-primary font-medium text-sm rounded-xl transition-all shadow-sm cursor-pointer"
        >
          <span>Selecionar Organização</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const plan = normalizePlanId(currentOrganization.plan);
  const hasAccess = canUseFeature(plan, feature);

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  let title = "Recurso Bloqueado";
  let message = "Este recurso não está disponível no seu plano atual.";

  if (feature === "hasGeminiAI") {
    title = "Inteligência Artificial (Gemini)";
    message = "Este recurso está disponível nos planos Pro, Max e PRO MAX.";
  } else if (feature === "hasTeamManagement") {
    title = "Gestão de Equipe";
    message = "Gestão de equipe está disponível nos planos Max e PRO MAX.";
  } else if (feature === "hasAdvancedReports" || feature === "hasAdvancedManagerDashboard") {
    title = "Relatórios Avançados & BI";
    message = "Relatórios avançados estão disponíveis no Plano PRO MAX.";
  } else if (feature === "hasManagerDashboard") {
    title = "Painel do Gestor";
    message = "O Painel do Gestor está disponível nos planos Max e PRO MAX.";
  }

  const handleUpgradeClick = () => {
    // Navigate to Setting/Meu Plano tab
    const event = new CustomEvent("navigate-to-settings-plan");
    window.dispatchEvent(event);
  };

  return (
    <div id="plan-guard-card" className="flex flex-col items-center justify-center p-8 md:p-10 text-center bg-surface-container-low border border-outline-variant/30 rounded-3xl max-w-lg mx-auto my-12 shadow-sm">
      <div className="p-4 bg-amber-500/10 text-amber-500 rounded-2xl mb-4">
        <ShieldAlert className="w-10 h-10" />
      </div>
      <h3 className="text-xl font-bold text-on-surface mb-2">{title}</h3>
      <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
        {message} Faça o upgrade para expandir o limite e liberar todo o potencial do seu CRM.
      </p>
      
      <button
        id="plan-guard-upgrade-btn"
        onClick={handleUpgradeClick}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-on-primary font-medium text-sm rounded-xl transition-all shadow-sm cursor-pointer"
      >
        <span>Ver Planos & Upgrades</span>
        <ArrowUpRight className="w-4 h-4" />
      </button>
    </div>
  );
};

