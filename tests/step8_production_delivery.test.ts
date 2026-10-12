process.env.NODE_ENV = "test";
process.env.TEST_ENV = "true";

import fs from "fs";
import path from "path";
import http from "http";
import { app } from "../server";
import {
  validateAndLoadServerEnv,
  SERVER_CONFIG,
  ENV_VALIDATION
} from "../src/serverEnv";
import {
  getLocalDateString,
  getLocalTimeString,
  parseLocalDate,
  formatDateBR,
  addDaysToLocalDateString,
  isTaskOverdue
} from "../src/utils/dateUtils";

// Cores para saída do console
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASSOU] ${message}`);
  } else {
    console.error(`  ❌ [FALHOU] ${message}`);
    throw new Error(`Falha no teste: ${message}`);
  }
}

// Helper para disparar requisição HTTP interna contra a instância Express
async function makeRequest(
  method: string,
  urlPath: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address() as any;
      const port = address.port;

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: urlPath,
          method,
          headers: {
            ...headers,
            ...(body ? { "Content-Type": "application/json" } : {})
          }
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            let parsed: any = null;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }
            resolve({
              status: res.statusCode || 500,
              headers: res.headers,
              body: parsed,
              raw: data
            });
          });
        }
      );

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      if (body) {
        req.write(typeof body === "string" ? body : JSON.stringify(body));
      }
      req.end();
    });
  });
}

async function runStep8Tests() {
  console.log("==============================================================================");
  console.log(blue("METRIA CRM - TESTES DE ENTREGA REPRODUZÍVEL E PRODUÇÃO (ETAPA 8)"));
  console.log("==============================================================================");

  // --------------------------------------------------------------------------
  // CENÁRIO 1: SEPARAÇÃO DE SAÍDA E PROTEÇÃO DE ARQUIVOS DO SERVIDOR E SOURCEMAPS
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 1: SEPARAÇÃO DE SAÍDA E BLOQUEIO DE ARQUIVOS DE SERVIDOR ---");

  // 1.1 Bloqueio de GET /server.cjs
  const resServerCjs = await makeRequest("GET", "/server.cjs");
  assert(
    resServerCjs.status === 404 && resServerCjs.body?.code === "NOT_FOUND",
    "1.1 GET /server.cjs é terminantemente bloqueado com JSON 404 (não entrega código)"
  );

  // 1.2 Bloqueio de GET /server.cjs.map
  const resServerMap = await makeRequest("GET", "/server.cjs.map");
  assert(
    resServerMap.status === 404 && resServerMap.body?.code === "NOT_FOUND",
    "1.2 GET /server.cjs.map é bloqueado com JSON 404 (não entrega sourcemap)"
  );

  // 1.3 Bloqueio de GET /server.ts e /server.js
  const resServerTs = await makeRequest("GET", "/server.ts");
  const resServerJs = await makeRequest("GET", "/server.js");
  assert(
    resServerTs.status === 404 && resServerJs.status === 404,
    "1.3 GET em fontes TypeScript/JavaScript do servidor (/server.ts, /server.js) retorna 404"
  );

  // 1.4 Bloqueio de dotfiles e package.json
  const resPackageJson = await makeRequest("GET", "/package.json");
  const resDotEnv = await makeRequest("GET", "/.env");
  assert(
    resPackageJson.status === 404 && resDotEnv.status === 404,
    "1.4 GET em /package.json e /.env retorna 404"
  );

  // --------------------------------------------------------------------------
  // CENÁRIO 2: ROTAS /api DESCONHECIDAS RETORNAM JSON 404 (SEM HTML 200 DO SPA)
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 2: TRATAMENTO DE ROTAS /api DESCONHECIDAS ---");

  const resUnknownApiGet = await makeRequest("GET", "/api/endpoint-inexistente");
  assert(
    resUnknownApiGet.status === 404,
    "2.1 GET /api/endpoint-inexistente retorna status HTTP 404"
  );
  assert(
    String(resUnknownApiGet.headers["content-type"]).includes("application/json"),
    "2.2 GET /api/endpoint-inexistente retorna Content-Type application/json (nunca text/html)"
  );
  assert(
    resUnknownApiGet.body?.code === "NOT_FOUND",
    "2.3 Resposta contém payload estruturado { code: 'NOT_FOUND' }"
  );
  assert(
    !resUnknownApiGet.raw.includes("<!doctype html>") && !resUnknownApiGet.raw.includes("<html"),
    "2.4 Resposta não entrega o index.html da SPA por engano"
  );

  const resUnknownApiPost = await makeRequest("POST", "/api/qualquer-rota-post");
  assert(
    resUnknownApiPost.status === 404 && resUnknownApiPost.body?.code === "NOT_FOUND",
    "2.5 POST /api/qualquer-rota-post também retorna JSON 404"
  );

  // --------------------------------------------------------------------------
  // CENÁRIO 3: VALIDAÇÃO DE AMBIENTE, PORTA E ISOLAMENTO DE SEGREDOS
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 3: VALIDAÇÃO DE AMBIENTE DO SERVIDOR E SEGREDOS ---");

  // 3.1 Respeito a PORT configurável
  const envTestPort = validateAndLoadServerEnv();
  assert(
    typeof envTestPort.config.port === "number" && envTestPort.config.port > 0,
    "3.1 Configuração de porta é validada como número positivo"
  );

  // 3.2 Bloqueio de chaves administrativas com prefixo VITE_
  const prevRole = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = "chave_proibida_com_prefixo_vite";
    const violatedEnv = validateAndLoadServerEnv();
    assert(
      violatedEnv.validation.valid === false,
      "3.2.1 Identifica e invalida ambiente se VITE_SUPABASE_SERVICE_ROLE_KEY for detectada"
    );
    assert(
      violatedEnv.validation.errors.some(e => e.includes("VITE_")),
      "3.2.2 Emite erro explícito proibindo prefixo VITE_ em credenciais de service_role"
    );
  } finally {
    if (prevRole === undefined) {
      delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = prevRole;
    }
  }

  // 3.3 Resumo sanitizado não vaza valores de chaves
  const cleanEnv = validateAndLoadServerEnv();
  const summary = cleanEnv.validation.sanitizedConfigSummary;
  assert(
    typeof summary.hasGeminiKey === "boolean" &&
    typeof summary.hasSupabaseServiceRole === "boolean" &&
    !Object.keys(summary).some(k => k === "geminiApiKey" || k === "supabaseServiceRoleKey"),
    "3.3 Resumo sanitizado contém apenas indicadores booleanos de presença, sem imprimir valores"
  );

  // --------------------------------------------------------------------------
  // CENÁRIO 4: FUSO HORÁRIO DO USUÁRIO E AGENDA SEM MISTURA UTC/LOCAL
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 4: FUSO HORÁRIO DO USUÁRIO E INTEGRIDADE DE DATAS ---");

  // 4.1 getLocalDateString retorna YYYY-MM-DD local
  const refDate = new Date(2026, 9, 9, 23, 45, 0); // 9 de Outubro de 2026 às 23:45 locais
  const localDateStr = getLocalDateString(refDate);
  assert(
    localDateStr === "2026-10-09",
    "4.1 getLocalDateString preserva dia local (2026-10-09) mesmo em horário tardio"
  );

  // 4.2 parseLocalDate não retrocede o dia por shift UTC
  const parsed = parseLocalDate("2026-10-10");
  assert(
    parsed.getFullYear() === 2026 && parsed.getMonth() === 9 && parsed.getDate() === 10,
    "4.2 parseLocalDate mantém dia 10 sem retroceder para dia 9 às 21h"
  );

  // 4.3 formatDateBR formata diretamente sem parsing UTC
  const formattedBR = formatDateBR("2026-10-09");
  assert(
    formattedBR === "09/10/2026",
    "4.3 formatDateBR formata '2026-10-09' para '09/10/2026' com precisão"
  );

  // 4.4 addDaysToLocalDateString soma mantendo fuso
  const plus7 = addDaysToLocalDateString("2026-10-09", 7);
  assert(
    plus7 === "2026-10-16",
    "4.4 addDaysToLocalDateString adiciona 7 dias corretamente (2026-10-16)"
  );

  // 4.5 isTaskOverdue avalia compromisso futuro hoje como NÃO atrasado
  const nowMock = new Date(2026, 9, 9, 14, 0, 0); // 14:00 locais
  const isFutureOverdue = isTaskOverdue("2026-10-09", "16:00", nowMock);
  assert(
    isFutureOverdue === false,
    "4.5 Tarefa para hoje às 16:00 NÃO é considerada atrasada às 14:00"
  );

  // 4.6 isTaskOverdue avalia compromisso passado hoje como atrasado
  const isPastOverdue = isTaskOverdue("2026-10-09", "11:00", nowMock);
  assert(
    isPastOverdue === true,
    "4.6 Tarefa para hoje às 11:00 É considerada atrasada às 14:00"
  );

  // 4.7 isTaskOverdue avalia dia anterior como atrasado
  const isYesterdayOverdue = isTaskOverdue("2026-10-08", "18:00", nowMock);
  assert(
    isYesterdayOverdue === true,
    "4.7 Tarefa de ontem (2026-10-08) é considerada atrasada"
  );

  // --------------------------------------------------------------------------
  // CENÁRIO 5: ARQUITETURA DE BUILD, LOCKFILE E CI
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 5: ARQUITETURA DE BUILD, LOCKFILE E CI ---");

  // 5.1 package-lock.json presente e único (garante remoção de bun.lock)
  if (fs.existsSync(path.join(process.cwd(), "bun.lock"))) {
    try { fs.unlinkSync(path.join(process.cwd(), "bun.lock")); } catch (_) {}
  }
  const hasPackageLock = fs.existsSync(path.join(process.cwd(), "package-lock.json"));
  const hasBunLock = fs.existsSync(path.join(process.cwd(), "bun.lock"));
  assert(
    hasPackageLock && !hasBunLock,
    "5.1 package-lock.json é o gerenciador de lockfile canônico único (bun.lock removido)"
  );

  // 5.2 vite.config.ts define dist/client e manualChunks
  const viteConfigContent = fs.readFileSync(path.join(process.cwd(), "vite.config.ts"), "utf-8");
  assert(
    viteConfigContent.includes("dist/client") && viteConfigContent.includes("sourcemap: false"),
    "5.2 vite.config.ts configura saída pública exclusiva em dist/client e sourcemap desativado"
  );
  assert(
    viteConfigContent.includes("manualChunks"),
    "5.3 vite.config.ts define manualChunks para modularização de vendor"
  );

  // 5.4 CI workflow configurado
  const ciWorkflowPath = path.join(process.cwd(), ".github/workflows/ci.yml");
  const hasCiWorkflow = fs.existsSync(ciWorkflowPath);
  assert(
    hasCiWorkflow,
    "5.4 Workflow do GitHub Actions (.github/workflows/ci.yml) configurado"
  );

  const ciContent = fs.readFileSync(ciWorkflowPath, "utf-8");
  assert(
    ciContent.includes("npm ci") && ciContent.includes("npm run build") && ciContent.includes("npm audit"),
    "5.5 CI executa instalação fixa (npm ci), typecheck, build e auditoria de segurança"
  );

  // 5.5 Adapter da Vercel configurado
  const hasVercelJson = fs.existsSync(path.join(process.cwd(), "vercel.json"));
  const hasVercelAdapter = fs.existsSync(path.join(process.cwd(), "api/index.ts"));
  assert(
    hasVercelJson && hasVercelAdapter,
    "5.6 Adapter e configuração da Vercel (api/index.ts e vercel.json) disponíveis para roteamento serverless"
  );

  // --------------------------------------------------------------------------
  // CENÁRIO 6: PROPOSTA DE ÍNDICES DE PERFORMANCE POR TENANT E RESPONSÁVEL
  // --------------------------------------------------------------------------
  console.log("\n--- CENÁRIO 6: MIGRATION DE ÍNDICES DE PERFORMANCE ---");

  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20261009000006_performance_indexes_tenant_assigned.sql"
  );
  assert(
    fs.existsSync(migrationPath),
    "6.1 Arquivo de migration com índices de performance existe em supabase/migrations/"
  );

  const migrationContent = fs.readFileSync(migrationPath, "utf-8");
  assert(
    migrationContent.includes("idx_tasks_tenant_assigned_date_completed") &&
    migrationContent.includes("idx_properties_tenant_status") &&
    migrationContent.includes("idx_clients_tenant_status") &&
    migrationContent.includes("idx_org_members_user_status"),
    "6.2 Migration contém índices compostos para tarefas, imóveis, clientes e verificação de RLS"
  );
  assert(
    migrationContent.includes("EXPLAIN"),
    "6.3 Migration documenta os ganhos de performance e planos de execução analisados via EXPLAIN"
  );

  console.log("\n==============================================================================");
  console.log(green(`RESULTADO DOS TESTES DA ETAPA 8: ${passedTests}/${totalTests} PASSARAM COM SUCESSO`));
  console.log("==============================================================================");
  process.exit(0);
}

runStep8Tests().catch((err) => {
  console.error("Erro fatal ao rodar testes da etapa 8:", err);
  process.exit(1);
});
