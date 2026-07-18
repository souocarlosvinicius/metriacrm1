import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, ChevronLeft, X, Award, FileText, Sparkles, TrendingUp, BarChart3, HelpCircle, Check, Compass, Users } from "lucide-react";

interface TourStep {
  targetId: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  badge: string;
}

interface InfoTourProps {
  isActive: boolean;
  onClose: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "info-tour-export-pdf",
    title: "Relatório de Desempenho",
    description: "Exporte um consolidado completo de desempenho da sua operação imobiliária em PDF com um único clique. Ideal para apresentar a parceiros ou investidores.",
    icon: FileText,
    badge: "Relatórios",
  },
  {
    targetId: "info-tour-kpis",
    title: "Indicadores Consolidados",
    description: "Aqui você acompanha o VGV sob Gestão, visitas realizadas e sua taxa de conversão comercial de forma clara, rápida e integrada.",
    icon: Compass,
    badge: "Métricas Chave",
  },
  {
    targetId: "info-tour-monthly-goals",
    title: "Metas Comerciais do Mês",
    description: "Defina seus objetivos de fechamento de VGV e quantidade de visitas mensais. As barras de progresso mudam de cor conforme seu desempenho avança em direção ao alvo!",
    icon: Award,
    badge: "Planejamento",
  },
  {
    targetId: "info-tour-vgv-chart",
    title: "Evolução do VGV Mensal",
    description: "Gráfico dinâmico que compara o VGV que já foi efetivamente fechado (ganho) com o volume atualmente ativo em seu pipeline para os próximos meses.",
    icon: BarChart3,
    badge: "Gráfico Dinâmico",
  },
  {
    targetId: "info-tour-recommendations",
    title: "Recomendações Inteligentes",
    description: "Insights gerados via inteligência artificial (Gemini) sugerem as melhores próximas ações para cada lead, permitindo agendar tarefas de acompanhamento imediatas.",
    icon: Sparkles,
    badge: "IA Cognitiva",
  },
  {
    targetId: "info-tour-global-goals",
    title: "Metas de Longo Prazo",
    description: "Configure os alvos de VGV para prazos maiores (mensal, semestral e anual) e veja como a sua produtividade está escalando.",
    icon: TrendingUp,
    badge: "Configuração",
  },
  {
    targetId: "info-tour-team-performance",
    title: "Gestão de Metas da Equipe",
    description: "Compare os resultados de vendas (VGV) e visitas de todos os seus corretores com as metas individuais estabelecidas pelo gestor.",
    icon: Users,
    badge: "Controle de Equipe",
  },
];

export default function InfoTour({ isActive, onClose }: InfoTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setCurrentStep(0);
      return;
    }

    // Scroll active target into view and highlight it
    const step = TOUR_STEPS[currentStep];
    if (step) {
      const element = document.getElementById(step.targetId);
      if (element) {
        // Smooth scroll to element with padding
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        // Add spotlight CSS class
        element.classList.add("info-tour-highlight");

        // Clean up when step changes or tour closes
        return () => {
          element.classList.remove("info-tour-highlight");
        };
      }
    }
  }, [currentStep, isActive]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem("metria_crm_info_tour_seen", "true");
    onClose();
  };

  if (!isActive) return null;

  const activeStepInfo = TOUR_STEPS[currentStep];
  const StepIcon = activeStepInfo.icon;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex flex-col justify-end p-4 sm:p-6 md:p-8">
      {/* Light transparent background block for mouse-handling if necessary, but z-shadow handles backdrop */}
      <div className="absolute inset-0 pointer-events-auto bg-black/10" onClick={handleComplete} style={{ zIndex: -1 }} />

      {/* Floating control card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`step-${currentStep}`}
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-auto mx-auto w-full max-w-lg bg-white/95 backdrop-blur-md border border-secondary/30 rounded-2xl shadow-2xl p-5 md:p-6 space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] bg-[#004d3e]/15 text-primary border border-primary/20 font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              {activeStepInfo.badge}
            </span>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant font-black">
                Passo {currentStep + 1} de {TOUR_STEPS.length}
              </span>
              <button
                type="button"
                onClick={handleComplete}
                className="p-1 hover:bg-surface-container-high text-on-surface-variant rounded-full transition-all cursor-pointer"
                title="Pular tour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Core Content */}
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#004d3e] text-secondary flex items-center justify-center shrink-0 shadow-lg border border-secondary/20">
              <StepIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 text-left flex-1">
              <h4 className="font-display font-black text-primary text-base leading-tight">
                {activeStepInfo.title}
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed font-medium">
                {activeStepInfo.description}
              </p>
            </div>
          </div>

          {/* Action buttons bar */}
          <div className="flex items-center justify-between pt-3 border-t border-outline-variant/30">
            <button
              type="button"
              onClick={handleComplete}
              className="text-xs font-bold text-on-surface-variant hover:text-primary transition-all cursor-pointer px-2 py-1"
            >
              Pular tour
            </button>

            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/30 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/95 text-on-primary text-xs font-black rounded-xl shadow-md transition-all cursor-pointer hover:shadow-lg hover:scale-102"
              >
                {currentStep === TOUR_STEPS.length - 1 ? (
                  <>
                    <span>Concluir</span>
                    <Check className="w-3.5 h-3.5 text-secondary" />
                  </>
                ) : (
                  <>
                    <span>Próximo</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
