import React, { Component, ErrorInfo, ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { logError } from "../utils/logger";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Capturou erro de renderização:", error, errorInfo);
    // Delega ao logError centralizado (com deduplicação, redação de PII e Sentry condicional)
    logError(error, {
      type: "react_error_boundary",
      componentStack: errorInfo.componentStack
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-6 text-on-surface">
          <div className="max-w-md w-full bg-surface-container-low border border-outline-variant/60 rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-error/10 text-error rounded-2xl flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <h2 className="text-xl font-bold mb-2 text-on-surface">Ops! Algo deu errado</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              Ocorreu uma falha inesperada durante a execução do aplicativo. Nossos sistemas de monitoramento registraram este evento automaticamente.
            </p>

            {this.state.error && (
              <div className="bg-surface-container-highest p-3 rounded-xl mb-6 text-left overflow-x-auto max-h-32 border border-outline-variant/40">
                <code className="text-xs font-mono text-error leading-relaxed block">
                  {this.state.error.message || "Erro desconhecido"}
                </code>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-3 px-4 bg-primary text-on-primary font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <RotateCcw className="w-4 h-4" />
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
