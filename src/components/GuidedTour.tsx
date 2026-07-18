import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, ChevronLeft, X, Check, Eye } from "lucide-react";

export interface GuidedTourStep {
  targetId: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  badge: string;
}

interface GuidedTourProps {
  steps: GuidedTourStep[];
  isActive: boolean;
  onClose: () => void;
  tourKey: string;
}

export default function GuidedTour({ steps, isActive, onClose, tourKey }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setCurrentStep(0);
      return;
    }

    const step = steps[currentStep];
    if (step) {
      const element = window.document.getElementById(step.targetId);
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
  }, [currentStep, isActive, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
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
    localStorage.setItem(tourKey, "true");
    onClose();
  };

  if (!isActive || steps.length === 0) return null;

  const activeStepInfo = steps[currentStep];
  const StepIcon = activeStepInfo.icon;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex flex-col justify-end p-4 sm:p-6 md:p-8">
      {/* Invisible backdrop allowing pointer events to complete tour on background click */}
      <div 
        className="absolute inset-0 pointer-events-auto bg-black/10" 
        onClick={handleComplete} 
        style={{ zIndex: -1 }} 
      />

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
                Passo {currentStep + 1} de {steps.length}
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
                {currentStep === steps.length - 1 ? (
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
