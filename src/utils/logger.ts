import { apiFetch } from "../api";
import * as Sentry from "@sentry/react";

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

export async function sendLog(entry: LogEntry): Promise<void> {
  const logKey = `${entry.level}:${entry.message}:${(entry.stack || "").slice(0, 100)}`;
  if (recentLogs.has(logKey)) {
    return; // throttle repeated log entries
  }
  recentLogs.add(logKey);
  setTimeout(() => recentLogs.delete(logKey), 5000);

  const payload: LogEntry = {
    level: entry.level || "error",
    message: entry.message || "Exceção não tratada",
    stack: entry.stack || "",
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: entry.timestamp || new Date().toISOString(),
    context: entry.context || {}
  };

  // Always log locally to browser console
  console.error(`[Central Logger] [${payload.level.toUpperCase()}] ${payload.message}`, payload);

  // Send breadcrumb to Sentry
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

  try {
    await apiFetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("[Central Logger] Falha ao enviar log para /api/logs:", err);
  }
}

export function logError(error: Error | string | unknown, context?: Record<string, any>): void {
  let message = "Exceção não tratada";
  let stack: string | undefined;

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
    try {
      Sentry.captureException(error, { extra: context });
    } catch {
      // Sentry safe fallback
    }
  } else if (typeof error === "string") {
    message = error;
    try {
      Sentry.captureMessage(error, { level: "error", extra: context });
    } catch {
      // Sentry safe fallback
    }
  } else if (error && typeof error === "object") {
    message = (error as any).message || JSON.stringify(error);
    stack = (error as any).stack;
    try {
      Sentry.captureMessage(message, { level: "error", extra: { ...context, rawError: error } });
    } catch {
      // Sentry safe fallback
    }
  }

  sendLog({
    level: "error",
    message,
    stack,
    context
  });
}

let isGlobalMonitoringSetup = false;

export function setupGlobalErrorMonitoring(): () => void {
  if (typeof window === "undefined" || isGlobalMonitoringSetup) {
    return () => {};
  }

  isGlobalMonitoringSetup = true;

  const handleGlobalError = (event: ErrorEvent) => {
    // Ignore harmless Vite HMR / websocket connection warnings
    if (event.message?.includes("vite") || event.message?.includes("websocket")) {
      return;
    }

    if (event.error) {
      try {
        Sentry.captureException(event.error, {
          extra: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            source: "setupGlobalErrorMonitoring.window.onerror"
          }
        });
      } catch {
        // Sentry safe fallback
      }
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
    try {
      if (reason instanceof Error) {
        Sentry.captureException(reason, {
          extra: { source: "setupGlobalErrorMonitoring.unhandledrejection" }
        });
      } else {
        Sentry.captureMessage(String(reason || "Unhandled Promise Rejection"), {
          level: "error",
          extra: { source: "setupGlobalErrorMonitoring.unhandledrejection", reason }
        });
      }
    } catch {
      // Sentry safe fallback
    }

    logError(reason instanceof Error ? reason : String(reason || "Unhandled Promise Rejection"), {
      type: "unhandled_rejection"
    });
  };

  window.addEventListener("error", handleGlobalError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  console.log("[Central Logger] Monitoramento global de exceções e Sentry ativado.");

  return () => {
    window.removeEventListener("error", handleGlobalError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    isGlobalMonitoringSetup = false;
  };
}
