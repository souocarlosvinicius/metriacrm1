import React from "react";
import { AlertTriangle, Building2, PhoneCall, LogOut, CheckCircle2, ShieldAlert } from "lucide-react";
import { Organization } from "../types";

interface SuspendedAccountNoticeProps {
  currentOrg: Organization | null;
  organizations?: Organization[];
  onSelectOrganization?: (orgId: string) => void;
  onLogout: () => void;
  onNavigateToPlans?: () => void;
}

export default function SuspendedAccountNotice({
  currentOrg,
  organizations = [],
  onSelectOrganization,
  onLogout,
  onNavigateToPlans
}: SuspendedAccountNoticeProps) {
  const otherOrgs = organizations.filter(
    (o) => o.id !== currentOrg?.id && (o.accessStatus === "active" || (o as any).access_status === "active" || (!o.accessStatus && !(o as any).access_status))
  );

  const suspensionDateFormatted = currentOrg?.suspendedAt || (currentOrg as any)?.suspended_at
    ? new Date(currentOrg.suspendedAt || (currentOrg as any).suspended_at).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : null;

  return (
    <div className="w-full max-w-3xl mx-auto my-8 p-6 sm:p-8 bg-surface rounded-3xl border border-error/30 shadow-xl text-left animate-in fade-in zoom-in-95 duration-300">
      {/* Header com ícone de alerta financeiro */}
      <div className="flex items-start gap-4 pb-6 border-b border-outline-variant/30">
        <div className="p-3.5 bg-error/10 text-error rounded-2xl shrink-0 shadow-sm border border-error/20">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-error/15 text-error border border-error/30">
              Acesso Administrativamente Suspenso
            </span>
            {currentOrg?.name && (
              <span className="text-xs font-bold text-on-surface-variant truncate">
                Organização: {currentOrg.name}
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-display font-black text-on-surface tracking-tight mt-1">
            Conta Temporariamente Suspensa
          </h2>
          <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
            Identificamos uma pendência financeira associada a esta organização imobiliária.
          </p>
        </div>
      </div>

      {/* Mensagem obrigatória e exata solicitada pela diretriz de produto */}
      <div className="my-6 p-5 bg-error/5 border border-error/20 rounded-2xl space-y-3">
        <p className="text-sm font-semibold text-on-surface leading-relaxed">
          “Seu acesso está temporariamente suspenso por pendência financeira. Seus dados estão preservados. Entre em contato com a Metria para regularizar.”
        </p>

        {currentOrg?.suspensionReason && (
          <div className="pt-2 border-t border-error/15 text-xs text-on-surface-variant">
            <span className="font-bold text-error">Motivo informado pela administração: </span>
            <span>{currentOrg.suspensionReason}</span>
          </div>
        )}

        {suspensionDateFormatted && (
          <div className="text-[11px] text-on-surface-variant/80">
            <span className="font-medium">Data da suspensão: </span>
            <span className="font-mono">{suspensionDateFormatted}</span>
          </div>
        )}
      </div>

      {/* Garantia explícita de preservação dos dados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
        <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/30 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-on-surface">Dados 100% Preservados</h4>
            <p className="text-[11px] text-on-surface-variant leading-snug">
              Clientes, imóveis, propostas, tarefas, visitas e documentos privados estão integralmente salvos. Nada foi apagado.
            </p>
          </div>
        </div>

        <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/30 flex items-start gap-3">
          <PhoneCall className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-on-surface">Atendimento Metria</h4>
            <p className="text-[11px] text-on-surface-variant leading-snug">
              Nossa equipe de suporte financeiro realiza a baixa e restabelecimento imediato assim que confirmada a liquidação.
            </p>
          </div>
        </div>
      </div>

      {/* Seleção de outra organização autorizada ativa (se houver) */}
      {otherOrgs.length > 0 && onSelectOrganization && (
        <div className="mb-6 p-4 bg-surface-container-highest/60 rounded-2xl border border-outline-variant/40 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-bold text-on-surface uppercase tracking-wide">
              Alternar para outra organização ativa
            </h4>
          </div>
          <p className="text-xs text-on-surface-variant">
            Você possui acesso a outras organizações que continuam ativas no Metria CRM. Escolha uma para continuar trabalhando:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {otherOrgs.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => onSelectOrganization(org.id)}
                className="px-3.5 py-2 bg-surface hover:bg-primary/10 text-on-surface hover:text-primary border border-outline-variant hover:border-primary/40 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span>{org.name}</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md font-semibold">Ativa</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ações de Regularização e Sessão */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-outline-variant/30">
        <div className="flex flex-wrap items-center gap-2.5">
          {onNavigateToPlans && (
            <button
              type="button"
              onClick={onNavigateToPlans}
              className="px-4 py-2.5 bg-primary hover:bg-primary/90 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              Consultar Regularização de Planos
            </button>
          )}

          <a
            href="mailto:financeiro@metria.com.br?subject=Regularizacao%20de%20Conta%20Metria%20CRM"
            className="px-4 py-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold rounded-xl border border-outline-variant transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            Falar com Cobrança Metria
          </a>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-2.5 text-xs font-bold text-error hover:bg-error/10 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-transparent hover:border-error/20"
        >
          <LogOut className="w-4 h-4" />
          Encerrar Sessão
        </button>
      </div>
    </div>
  );
}
