import React, { ReactNode } from "react";
import type { Organization, PlanFeature, PlanId } from "../types";
import { canUseFeature, getPlanDisplayName, getUpgradeMessage } from "../config/plans";

type PlanGuardMode = "card" | "hide";

interface PlanGuardProps {
  children: ReactNode;
  feature?: PlanFeature | string;
  planId?: PlanId | string | null;
  currentPlan?: PlanId | string | null;
  currentOrganization?: Partial<Organization> | null;
  fallback?: ReactNode;
  mode?: PlanGuardMode;
  title?: string;
  message?: string;
  ctaLabel?: string;
  onUpgradeClick?: () => void;
  compact?: boolean;
  className?: string;
}

const FEATURE_ALIASES: Record<string, PlanFeature> = {
  full_pipeline: "full_pipeline",
  hasFullPipeline: "full_pipeline",

  whatsapp_templates: "whatsapp_templates",
  hasWhatsappTemplates: "whatsapp_templates",

  calendar_tasks: "calendar_tasks",
  hasCalendarTasks: "calendar_tasks",

  gemini_ai: "gemini_ai",
  hasGeminiAI: "gemini_ai",

  property_matching: "property_matching",
  hasPropertyMatching: "property_matching",

  commission_reports: "commission_reports",
  hasCommissionReports: "commission_reports",

  advanced_reports: "advanced_reports",
  hasAdvancedReports: "advanced_reports",

  team_management: "team_management",
  hasTeamManagement: "team_management",

  lead_distribution: "lead_distribution",
  hasLeadDistribution: "lead_distribution",

  manager_dashboard: "manager_dashboard",
  hasManagerDashboard: "manager_dashboard",

  advanced_manager_dashboard: "advanced_manager_dashboard",
  hasAdvancedManagerDashboard: "advanced_manager_dashboard",

  lead_transfer: "lead_transfer",
  hasLeadTransfer: "lead_transfer",

  multiple_managers: "multiple_managers",
  hasMultipleManagers: "multiple_managers",
};

const FEATURE_TITLES: Record<PlanFeature, string> = {
  full_pipeline: "Pipeline completo",
  whatsapp_templates: "Templates de WhatsApp",
  calendar_tasks: "Agenda e tarefas",
  gemini_ai: "Inteligência artificial",
  property_matching: "Cruzamento inteligente",
  commission_reports: "Relatórios de comissão",
  advanced_reports: "Relatórios avançados",
  team_management: "Gestão de equipe",
  lead_distribution: "Distribuição de leads",
  manager_dashboard: "Painel gestor",
  advanced_manager_dashboard: "Painel gestor avançado",
  lead_transfer: "Transferência de leads",
  multiple_managers: "Múltiplos gestores",
};

function normalizeFeature(feature?: PlanFeature | string): PlanFeature | null {
  if (!feature) {
    return null;
  }

  return FEATURE_ALIASES[feature] ?? null;
}

function resolvePlanId(props: PlanGuardProps): PlanId | string | null {
  if (props.planId) {
    return props.planId;
  }

  if (props.currentPlan) {
    return props.currentPlan;
  }

  if (props.currentOrganization?.plan) {
    return props.currentOrganization.plan;
  }

  return "beta";
}

export default function PlanGuard(props: PlanGuardProps) {
  const {
    children,
    feature,
    fallback,
    mode = "card",
    title,
    message,
    ctaLabel = "Ver planos",
    onUpgradeClick,
    compact = false,
    className = "",
  } = props;

  const normalizedFeature = normalizeFeature(feature);
  const currentPlanId = resolvePlanId(props);

  if (!normalizedFeature) {
    return <>{children}</>;
  }

  const allowed = canUseFeature(currentPlanId, normalizedFeature);

  if (allowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (mode === "hide") {
    return null;
  }

  const planName = getPlanDisplayName(currentPlanId);
  const guardTitle = title ?? FEATURE_TITLES[normalizedFeature] ?? "Recurso bloqueado";
  const guardMessage = message ?? getUpgradeMessage(normalizedFeature);

  return (
    <div
      className={[
        "rounded-2xl border border-slate-200 bg-white shadow-sm",
        compact ? "p-4" : "p-6",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <span className="text-xl" aria-hidden="true">
            🔒
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Recurso do plano
          </p>

          <h3 className="mt-1 text-lg font-semibold text-slate-950">
            {guardTitle}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {guardMessage}
          </p>

          <p className="mt-2 text-xs text-slate-500">
            Plano atual: <strong>{planName}</strong>
          </p>

          {onUpgradeClick ? (
            <button
              type="button"
              onClick={onUpgradeClick}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              {ctaLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function hasPlanAccess(
  planId: PlanId | string | null | undefined,
  feature: PlanFeature | string,
): boolean {
  const normalizedFeature = normalizeFeature(feature);

  if (!normalizedFeature) {
    return true;
  }

  return canUseFeature(planId, normalizedFeature);
}
