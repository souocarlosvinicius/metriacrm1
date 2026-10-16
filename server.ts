import path from "path";
import express from "express";
import app, {
  requireAuth,
  requireGeminiPlan,
  geminiRateLimit,
  geminiConcurrency,
  geminiPayloadValidator,
  generateContentWithRetry,
  tenant429Cooldowns,
  userRateLimitMap,
  orgRateLimitMap,
  userConcurrencyMap,
  orgConcurrencyMap,
  setAiClientForTesting,
  isMetriaInternalAdmin
} from "./src/app.js";
import { SERVER_CONFIG } from "./src/serverEnv.js";

/**
 * ==============================================================================
 * METRIA CRM - ENTRADA LOCAL E SERVIDOR DEDICADO NODE.JS
 * ==============================================================================
 * 
 * Este arquivo atua como o ponto de entrada local ("dev" e "start"):
 * - Em modo desenvolvimento: carrega dinamicamente o Vite e monta vite.middlewares;
 * - Em modo produção: serve os arquivos estáticos de dist/client e fallback SPA;
 * - Inicia a escuta na porta configurada via app.listen().
 * 
 * A aplicação Express pura (rotas, middlewares e APIs) é isolada em src/app.ts,
 * permitindo que a Vercel importe somente a aplicação sem carregar Vite, Rollup
 * ou executar tarefas assíncronas de inicialização.
 */

const PORT = SERVER_CONFIG.port;

async function startServer() {
  if (SERVER_CONFIG.nodeEnv !== "production") {
    // Carregamento estritamente dinâmico do Vite apenas em desenvolvimento local
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Separação estrita: saída pública do frontend reside exclusivamente em dist/client
    const fs = await import("fs");
    const clientDistPath = path.join(process.cwd(), "dist", "client");
    const fallbackDistPath = path.join(process.cwd(), "dist");
    const distPath = fs.existsSync(clientDistPath) ? clientDistPath : fallbackDistPath;

    app.use(express.static(distPath, {
      index: false,
      dotfiles: "ignore",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".map")) {
          res.setHeader("Cache-Control", "no-store");
        }
      }
    }));

    // Fallback de SPA: entrega index.html apenas para navegação client-side
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Endpoint não encontrado.", code: "NOT_FOUND" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only listen when executed directly, not when imported by test runner
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.TEST_ENV) || SERVER_CONFIG.nodeEnv === "test";
  if (!isTest) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor rodando em http://localhost:${PORT} [${SERVER_CONFIG.nodeEnv}]`);
    });
  }
}

const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.TEST_ENV) || SERVER_CONFIG.nodeEnv === "test";
if (!isTest) {
  startServer();
}

export default app;
export {
  app,
  requireAuth,
  requireGeminiPlan,
  geminiRateLimit,
  geminiConcurrency,
  geminiPayloadValidator,
  generateContentWithRetry,
  tenant429Cooldowns,
  userRateLimitMap,
  orgRateLimitMap,
  userConcurrencyMap,
  orgConcurrencyMap,
  setAiClientForTesting,
  isMetriaInternalAdmin
};
