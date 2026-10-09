import { apiFetch } from "../api";
import * as Sentry from "@sentry/react";
import { redactSensitiveData, redactSensitiveString } from "./redact";

export interface LogEntry {
  level: "error" | "warn" | "info";
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
  context?: Record<string, any>;
}

// In-memory set to prevent flooding duplicated log requests
const recentLogs = new Set<string>();

// Deduplicação de exceções para evitar disparos redundantes (RootBoundary, ErrorBoundary, window.onerror)
const capturedExceptions = new WeakSet<object>();

/**
 * Determina se o Sentry está configurado com um DSN válido
 */
export function isSentryConfigured(): boolean {
  const dsn =
    (typeof process !== "undefined" && process.env?.VITE_SENTRY_DSN) ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SENTRY_DSN) ||
    "";
  return Boolean(dsn && dsn.trim().length > 0 && dsn.startsWith("http"));
}

export async function sendLog(entry: LogEntry): Promise<void> {
  const sanitizedMessage = redactSensitiveString(entry.message || "Exceção não tratada");
  const sanitizedStack = entry.stack ? redactSensitiveString(entry.stack) : "";
  const sanitizedUrl = entry.url ? redactSensitiveString(entry.url) : (typeof window !== "undefined" ? window.location.href : "");
  const sanitizedContext = entry.context ? redactSensitiveData(entry.context) : {};

  const logKey = `${entry.level}:${sanitizedMessage}:${sanitizedStack.slice(0, 100)}`;
  if (recentLogs.has(logKey)) {
    return; // throttle repeated log entries
  }
  recentLogs.add(logKey);
  setTimeout(() => recentLogs.delete(logKey), 5000);

  const payload: LogEntry = {
    level: entry.level || "error",
    message: sanitizedMessage,
    stack: sanitizedStack,
    url: sanitizedUrl,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: entry.timestamp || new Date().toISOString(),
    context: sanitizedContext
  };

  // Log local no console com dados devidamente redigidos
  const isProduction =
    (typeof process !== "undefined" && process.env?.NODE_ENV === "production") ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.PROD);

  if (!isProduction) {
    console.error(`[Central Logger] [${payload.level.toUpperCase()}] ${payload.message}`, payload);
  }

  // Envio de breadcrumb ao Sentry apenas se DSN estiver presente
  if (isSentryConfigured()) {
    try {
      Sentry.addBreadcrumb({
        category: "app.logger",
        message: payload.message,
        level: payload.level === "error" ? "error" : payload.level === "warn" ? "warning" : "info",
        data: payload.context,
        timestamp: Date.now() / 1000
      });
    } catch {
      // Sentry safe fallback
    }
  }

  // Encaminha ao endpoint real do servidor
  try {
    await apiFetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Falha silenciosa para evitar cascata de erros no logger
    if (!isProduction) {
      console.warn("[Central Logger] Falha ao enviar log para /api/logs:", err);
    }
  }
}

export function logError(error: Error | string | unknown, context?: Record<string, any>): void {
  let message = "Exceção não tratada";
  let stack: string | undefined;

  // Previne captura redundante do mesmo objeto de erro
  const isObjectError = Boolean(error && typeof error === "object");
  const alreadyCaptured = isObjectError && capturedExceptions.has(error as object);
  if (isObjectError && !alreadyCaptured) {
    capturedExceptions.add(error as object);
  }

  const sanitizedContext = context ? redactSensitiveData(context) : undefined;

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
    if (isSentryConfigured() && !alreadyCaptured) {
      try {
        Sentry.captureException(error, { extra: sanitizedContext });
      } catch {
        // Sentry safe fallback
      }
    }
  } else if (typeof error === "string") {
    message = error;
    if (isSentryConfigured()) {
      try {
        Sentry.captureMessage(redactSensitiveString(error), { level: "error", extra: sanitizedContext });
      } catch {
        // Sentry safe fallback
      }
    }
  } else if (error && typeof error === "object") {
    message = (error as any).message || JSON.stringify(error);
    stack = (error as any).stack;
    if (isSentryConfigured() && !alreadyCaptured) {
      try {
        Sentry.captureMessage(redactSensitiveString(message), {
          level: "error",
          extra: { ...sanitizedContext, rawError: redactSensitiveData(error) }
        });
      } catch {
        // Sentry safe fallback
      }
    }
  }

  sendLog({
    level: "error",
    message,
    stack,
    context: sanitizedContext
  });
}

let isGlobalMonitoringSetup = false;

export function setupGlobalErrorMonitoring(): () => void {
  if (typeof window === "undefined" || isGlobalMonitoringSetup) {
    return () => {};
  }

  isGlobalMonitoringSetup = true;

  const isNoiseError = (err: any): boolean => {
    const msg = String(err?.message || err?.reason || err || "").toLowerCase();
    return (
      msg.includes("websocket") ||
      msg.includes("closed without opened") ||
      msg.includes("vite") ||
      msg.includes("hmr")
    );
  };

  const handleGlobalError = (event: ErrorEvent) => {
    // Ignora ruídos de Vite HMR / websocket locais
    if (isNoiseError(event.error) || isNoiseError(event.message)) {
      return;
    }

    logError(event.error || event.message, {
      type: "unhandled_exception",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    if (isNoiseError(reason)) {
      return;
    }

    logError(reason instanceof Error ? reason : String(reason || "Unhandled Promise Rejection"), {
      type: "unhandled_rejection"
    });
  };

  window.addEventListener("error", handleGlobalError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleGlobalError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    isGlobalMonitoringSetup = false;
  };
}
