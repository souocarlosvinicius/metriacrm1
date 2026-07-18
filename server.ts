import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Try to initialize Gemini AI safely
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "metria-crm",
        },
      },
    });
    console.log("Gemini AI inicializado com sucesso.");
  } catch (err) {
    console.error("Erro ao inicializar Gemini AI:", err);
  }
} else {
  console.log("Nenhuma GEMINI_API_KEY encontrada nas variáveis de ambiente.");
}

let lastGemini429Time = 0;
const GEMINI_COOLDOWN_MS = 60000; // 1 minute cooldown

async function generateContentWithRetry(fn: () => Promise<any>, retries = 2, delay = 1000): Promise<any> {
  const timeSinceLast429 = Date.now() - lastGemini429Time;
  if (timeSinceLast429 < GEMINI_COOLDOWN_MS) {
    const remainingSecs = Math.ceil((GEMINI_COOLDOWN_MS - timeSinceLast429) / 1000);
    throw new Error(`Gemini API em cooldown temporário devido a limite de cota de requisições. Tente novamente em ${remainingSecs}s.`);
  }

  try {
    return await fn();
  } catch (err: any) {
    const isTransient = err?.status === 503 || err?.status === 429 || String(err?.message || "").includes("503") || String(err?.message || "").includes("429");
    if (isTransient) {
      lastGemini429Time = Date.now();
      if (retries > 0) {
        console.log(`Gemini API: status temporario (${err?.status || 'delay'}). Nova tentativa em ${delay}ms... (Tentativas restantes: ${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return generateContentWithRetry(fn, retries - 1, delay * 2);
      }
    }
    throw err;
  }
}

function getFallbackDescription(body: any) {
  const { 
    title, 
    type, 
    condition, 
    modality, 
    neighborhood, 
    city, 
    price,
    bedrooms, 
    suites, 
    bathrooms, 
    parkingSpots,
    area, 
    amenities 
  } = body;

  const formattedPrice = price 
    ? Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) 
    : "Sob Consulta";
  const amenitiesStr = amenities && amenities.length > 0 ? amenities.join(", ") : "Lazer completo, segurança 24h";

  const professional = `Excelente oportunidade imobiliária em região valorizada. Apresentamos este primoroso ${type || "Imóvel"} de ${condition || "excelente estado"}, com acabamentos impecáveis e excelente aproveitamento de espaços. Situado no cobiçado bairro ${neighborhood || "Bairro Nobre"} de ${city || "Uberlândia"}, ele conta com ${area || 100}m² de área privativa muito bem distribuída. Dispõe de ${bedrooms || 3} dormitórios generosos, sendo ${suites || 1} suíte(s), ideal para garantir total privacidade e bem-estar. O condomínio oferece infraestrutura robusta incluindo: ${amenitiesStr}. Oferecido para ${modality || "Venda"} por apenas ${formattedPrice}. Agende sua visita e conheça todos os diferenciais!`;

  const whatsapp = `🚀 *OPORTUNIDADE DE OURO!* 🚀\n\nConfira esse espetacular *${type || "Imóvel"}* em *${neighborhood || "Bairro Nobre"}* (${city || "Uberlândia"})!\n\n✨ *Diferenciais de peso:*\n• Espaço: ${area || 100}m² de conforto total\n• Quartos: ${bedrooms || 3} amplos (${suites || 1} suíte privativa)\n• Vagas: ${parkingSpots || 1} vaga(s) reservada(s)\n• Lazer do condomínio: ${amenitiesStr}\n\n💵 *Preço Incrível:* ${formattedPrice}\n\nPerfeito para morar ou investir com alta rentabilidade. Fale comigo agora e agende sua visita! 📲`;

  const portal = `Diga olá para a sua nova conquista! Amplo e moderno ${type || "Imóvel"} de ${area || 100}m² privativos, em localização estratégica e privilegiada dentro do bairro ${neighborhood || "Bairro Nobre"}. Living acolhedor para dois ambientes com excelente iluminação natural, copa-cozinha equipada com excelentes armários planejados, área de serviços independente e ${parkingSpots || 1} vagas de garagem exclusivas. Planta versátil de ${bedrooms || 3} dormitórios com ${suites || 1} suíte acolhedora. Segurança 24 horas e lazer agradável (${amenitiesStr}). Oportunidade por ${formattedPrice}. Aceita financiamento bancário imediato.`;

  return { professional, whatsapp, portal };
}

function getFallbackTasks(clients: any[], properties: any[]) {
  return [
    {
      title: "Seguir com leads sem contato",
      clientName: "Novos contatos",
      description: "Entrar em contato via WhatsApp com os leads novos cadastrados recentemente sem interação para entender as preferências de moradia.",
      time: "09:30",
      type: "FOLLOW-UP"
    },
    {
      title: "Revisar propostas pendentes",
      clientName: "Negociações em andamento",
      description: "Cobrar feedback ou posicionamento sobre propostas que estão pendentes ou em análise pelos proprietários.",
      time: "14:00",
      type: "CONTRATO"
    },
    {
      title: "Agendar visitas",
      clientName: "Clientes qualificados",
      description: "Sugerir imóveis compatíveis para clientes quentes e agendar as visitas presenciais para a semana.",
      time: "16:00",
      type: "VISITA"
    }
  ];
}

// Authentication check using Supabase server client
const requireAuth = async (req: any, res: any, next: any) => {
  let token = null;

  // 1. Check Authorization Header
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  // 2. Check session_id Cookie
  if (!token) {
    const cookieHeader = req.headers.cookie || "";
    const match = cookieHeader.match(/(?:^|;\s*)session_id=([^;]+)/);
    token = match ? match[1] : null;
  }

  if (!token) {
    return res.status(401).json({ error: "Sessão expirada ou não autorizado. Por favor, faça login." });
  }

  if (process.env.VITE_SUPABASE_URL) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (user && !error) {
          req.userId = user.id;
          req.user = user;
          return next();
        } else {
          return res.status(401).json({ error: "Sessão inválida ou expirada. Por favor, faça login novamente." });
        }
      }
    } catch (err) {
      console.error("Erro ao verificar token com Supabase no backend:", err);
      return res.status(500).json({ error: "Erro interno ao validar autenticação." });
    }
  }

  return res.status(401).json({ error: "Supabase não configurado no servidor. Não é possível autenticar." });
};

// Helper to get active user organization and plan
async function getUserActiveOrgAndPlan(userId: string, headerOrgId?: string): Promise<{ orgId: string | null; plan: string }> {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { orgId: null, plan: "beta" };
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    let activeOrgId = headerOrgId;
    if (!activeOrgId) {
      const { data: profile, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("default_organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (profile && !profErr) {
        activeOrgId = profile.default_organization_id;
      }
    }

    if (!activeOrgId) {
      return { orgId: null, plan: "beta" };
    }

    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .select("plan")
      .eq("id", activeOrgId)
      .maybeSingle();

    if (org && !orgErr) {
      return { orgId: activeOrgId, plan: org.plan || "beta" };
    }
  } catch (err) {
    console.error("Erro ao carregar plano/organização ativa no backend:", err);
  }
  return { orgId: null, plan: "beta" };
}

// Middleware to enforce Gemini AI plans access
const requireGeminiPlan = async (req: any, res: any, next: any) => {
  const headerOrgId = req.headers["x-organization-id"] || req.headers["X-Organization-Id"];
  const { plan } = await getUserActiveOrgAndPlan(req.userId, headerOrgId);
  
  const allowedPlans = ["pro", "max", "pro_max"];
  if (!allowedPlans.includes(plan)) {
    return res.status(403).json({
      error: `O recurso de Inteligência Artificial (Gemini) está disponível apenas nos planos Pro, Max e PRO MAX. Seu plano atual é ${plan.toUpperCase()}.`
    });
  }
  next();
};

// API STATUS
app.get("/api/status", async (req, res) => {
  const tableStatus: any = {};
  let dbErr: any = null;
  
  if (process.env.VITE_SUPABASE_URL) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
        const tablesToCheck = [
          "profiles", "clients", "properties", "tasks", 
          "visits", "proposals", "transactions", "settings", "history_events"
        ];

        for (const table of tablesToCheck) {
          const { error, status } = await supabaseAdmin.from(table).select("*").limit(1);
          const isNotExist = error && (
            error.code === "PGRST205" || 
            error.message.includes("does not exist") || 
            error.message.includes("Could not find the table")
          );
          tableStatus[table] = {
            exists: !error || !isNotExist,
            status,
            error: error ? { message: error.message, code: error.code } : null
          };
        }
      } else {
        dbErr = "Supabase env variables missing or empty";
      }
    } catch (err: any) {
      dbErr = err.message;
    }
  } else {
    dbErr = "VITE_SUPABASE_URL env variable not defined";
  }

  const hasTables = !dbErr && tableStatus && Object.values(tableStatus).length > 0 && Object.values(tableStatus).every((t: any) => t?.exists === true);

  res.json({
    dbType: "Supabase Database (PostgreSQL)",
    supabaseActive: hasTables,
    geminiActive: !!ai,
    tableStatus,
    dbErr
  });
});

// GET ORGANIZATIONS OF THE CURRENT USER
app.get("/api/organizations", requireAuth, async (req: any, res: any) => {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase não está configurado." });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Get user's organization memberships
    const { data: memberships, error: memErr } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("user_id", req.userId);

    if (memErr) {
      console.error("Erro ao buscar membros de organizações:", memErr);
      return res.status(400).json({ error: memErr.message });
    }

    const orgIds = (memberships || []).map(m => m.organization_id);
    if (orgIds.length === 0) {
      return res.json([]);
    }

    const { data: orgs, error: orgsErr } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .in("id", orgIds);

    if (orgsErr) {
      console.error("Erro ao buscar organizações:", orgsErr);
      return res.status(400).json({ error: orgsErr.message });
    }

    const mappedOrgs = orgs?.map(org => {
      const membership = memberships?.find(m => m.organization_id === org.id);
      return {
        id: org.id,
        name: org.name,
        tradeName: org.trade_name,
        creci: org.creci,
        phone: org.phone,
        email: org.email,
        city: org.city,
        state: org.state,
        ownerId: org.owner_id,
        plan: org.plan,
        userRole: membership?.role,
        userStatus: membership?.status
      };
    }) || [];

    return res.json(mappedOrgs);
  } catch (err: any) {
    console.error("Erro no endpoint GET /api/organizations:", err);
    return res.status(500).json({ error: err.message });
  }
});

// CREATE A NEW ORGANIZATION
app.post("/api/organizations", requireAuth, async (req: any, res: any) => {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase não está configurado." });
  }

  const { name, tradeName, document, creci, phone, email, city, state, accountType, plan } = req.body;
  const targetPlan = plan || 'beta';

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Create organization (bypass RLS via admin client)
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .insert({
        name,
        trade_name: tradeName,
        document,
        creci,
        phone,
        email,
        city,
        state,
        owner_id: req.userId,
        plan: targetPlan,
        max_members: targetPlan === 'max' ? 5 : (targetPlan === 'pro_max' ? 99 : 1),
        subscription_status: 'active',
        subscription_started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orgErr) {
      console.error("Erro ao criar organização:", orgErr);
      return res.status(400).json({ error: orgErr.message });
    }

    // 2. Add as organization member
    const { error: memErr } = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: org.id,
        user_id: req.userId,
        name: req.user?.user_metadata?.name || req.user?.email?.split('@')[0] || "",
        email: req.user?.email || "",
        role: "owner",
        status: "active"
      });

    if (memErr) {
      console.error("Erro ao criar membro da organização:", memErr);
      return res.status(400).json({ error: memErr.message });
    }

    // 3. Update profiles table
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        default_organization_id: org.id,
        account_type: accountType || "agency",
        current_role: "owner",
        onboarding_completed: true,
        onboardingCompleted: true
      })
      .eq("id", req.userId);

    if (profErr) {
      console.error("Erro ao atualizar perfil do usuário:", profErr);
      return res.status(400).json({ error: profErr.message });
    }

    return res.status(201).json({
      id: org.id,
      name: org.name,
      tradeName: org.trade_name,
      creci: org.creci,
      phone: org.phone,
      email: org.email,
      city: org.city,
      state: org.state,
      ownerId: org.owner_id,
      plan: org.plan,
      userRole: "owner"
    });
  } catch (err: any) {
    console.error("Erro no endpoint POST /api/organizations:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GENERATE DESCRIPTION
app.post("/api/ai/generate-description", requireAuth, requireGeminiPlan, async (req, res) => {
  if (!ai) {
    return res.status(400).json({
      error: "O serviço de inteligência artificial não está configurado. Por favor, configure GEMINI_API_KEY.",
    });
  }

  try {
    const { 
      title, 
      type, 
      condition, 
      modality, 
      neighborhood, 
      city, 
      price, 
      bedrooms, 
      suites, 
      bathrooms, 
      parkingSpots, 
      area, 
      amenities 
    } = req.body;

    const formattedPrice = price 
      ? Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) 
      : "Sob Consulta";
    const amenitiesStr = amenities && amenities.length > 0 ? amenities.join(", ") : "Lazer completo, segurança 24h";

    const prompt = `Você é um copywriter especialista no mercado imobiliário de luxo brasileiro, atendendo no Metria CRM.
Sua tarefa é criar 3 tipos diferentes de descrições comerciais de alta conversão para o seguinte imóvel:
- Tipo: ${type || "Imóvel"}
- Condição: ${condition || "Excelente estado"}
- Modalidade: ${modality || "Venda"}
- Localização: Bairro ${neighborhood || "Nobre"}, Cidade ${city || "Uberlândia"}
- Preço: ${formattedPrice}
- Características: ${area || 100}m² privativos, ${bedrooms || 3} quartos (${suites || 1} suíte), ${bathrooms || 2} banheiros, ${parkingSpots || 1} vaga(s)
- Lazer/Diferenciais do condomínio: ${amenitiesStr}

Crie as descrições em português do Brasil (pt-BR). Não adicione nenhum jargão robotizado de IA ("AI slop") e foque nos benefícios.
As 3 descrições exigidas são:
1. "professional": Uma descrição de tom profissional, sofisticada e com parágrafos elegantes para propostas formais e PDFs.
2. "whatsapp": Uma descrição curta, direta e atraente para envio rápido pelo WhatsApp, usando quebras de linha limpas e emojis de forma moderada e sofisticada.
3. "portal": Uma descrição completa e persuasiva dividida em seções claras e bullet-points, perfeita para portais imobiliários (ex: Zap Imóveis, VivaReal).

Por favor, retorne APENAS um objeto JSON válido, sem markdown ou caracteres extras, com as chaves: "professional", "whatsapp" e "portal".`;

    try {
      const response = await generateContentWithRetry(() => ai!.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              professional: {
                type: Type.STRING,
                description: "Descrição profissional e elegante."
              },
              whatsapp: {
                type: Type.STRING,
                description: "Mensagem curta para WhatsApp com emojis."
              },
              portal: {
                type: Type.STRING,
                description: "Ficha estruturada para portais com seções."
              }
            },
            required: ["professional", "whatsapp", "portal"]
          }
        }
      }));

      const resultText = response.text || "{}";
      const parsed = JSON.parse(resultText);
      res.json(parsed);
    } catch (innerErr: any) {
      console.log(`Gemini API info: usando fallback estatico para descricao (${innerErr?.message || 'cooldown'}).`);
      const fallback = getFallbackDescription(req.body);
      res.json(fallback);
    }
  } catch (err: any) {
    console.error("Erro na geração de descrição por IA:", err);
    res.status(500).json({ error: `Falha na IA: ${err.message}` });
  }
});

// GENERATE WHATSAPP REMINDER MESSAGE
app.post("/api/ai/generate-reminder", requireAuth, requireGeminiPlan, async (req, res) => {
  if (!ai) {
    return res.status(400).json({
      error: "O serviço de inteligência artificial não está configurado. Por favor, configure GEMINI_API_KEY.",
    });
  }

  try {
    const { 
      clientName, 
      taskType, 
      taskTitle, 
      taskDate, 
      taskTime, 
      propertyTitle,
      additionalInfo 
    } = req.body;

    const prompt = `Você é um assessor de comunicação especialista no mercado imobiliário brasileiro, trabalhando com o Metria CRM.
Sua tarefa é redigir uma mensagem de lembrete personalizada e extremamente elegante em português do Brasil (pt-BR) para ser enviada por WhatsApp ao cliente pelo corretor, um dia antes do compromisso agendado.

Informações do compromisso:
- Nome do Cliente: ${clientName || "Cliente"}
- Tipo de Atividade: ${taskType || "Visita"}
- Título/Descrição da Atividade: ${taskTitle || "Visita de apresentação"}
- Data do Compromisso: ${taskDate || "Amanhã"}
- Horário: ${taskTime || "a definir"}
- Imóvel Relacionado (se houver): ${propertyTitle || ""}
- Observações Adicionais: ${additionalInfo || ""}

Diretrizes da mensagem:
1. Comece de forma calorosa, educada, personalizada e profissional (ex: "Olá, ${clientName}! Tudo bem?").
2. Lembre o cliente do compromisso agendado para amanhã, destacando sutilmente a data e o horário.
3. Se houver um imóvel específico, mencione o nome do imóvel de forma elegante.
4. Peça uma rápida confirmação de presença de forma sutil e atenciosa.
5. Use emojis de forma moderada e sofisticada (1 ou 2 no máximo, ex: 🗓️, 🏠).
6. Mantenha a mensagem curta, altamente escaneável e direta, com quebras de linha limpas.
7. Evite jargões automáticos ou textos clichês de inteligência artificial ("AI slop"). O texto deve soar 100% natural, escrito por um corretor de alto padrão atencioso.

Por favor, retorne APENAS um objeto JSON válido com a chave: "message".`;

    try {
      const response = await generateContentWithRetry(() => ai!.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              message: {
                type: Type.STRING,
                description: "A mensagem formatada de lembrete do WhatsApp."
              }
            },
            required: ["message"]
          }
        }
      }));

      const resultText = response.text || "{}";
      const parsed = JSON.parse(resultText);
      res.json(parsed);
    } catch (innerErr: any) {
      console.log(`Gemini API info: erro na geracao de lembrete por IA (${innerErr?.message || 'cooldown'}). Usando geracao local.`);
      res.status(500).json({ error: "Erro ao gerar lembrete via Gemini." });
    }
  } catch (err: any) {
    console.error("Erro na rota de geração de lembrete por IA:", err);
    res.status(500).json({ error: `Falha na IA: ${err.message}` });
  }
});

// SUGGEST TASKS
app.post("/api/ai/suggest-tasks", requireAuth, requireGeminiPlan, async (req, res) => {
  if (!ai) {
    return res.status(400).json({
      error: "O serviço de inteligência artificial não está configurado. Por favor, configure GEMINI_API_KEY.",
    });
  }

  try {
    const { clients, properties } = req.body;

    const prompt = `Você é um consultor e coach especialista em vendas e CRM imobiliário.
Análise a lista de contatos/leads recentes e recomende 3 tarefas estratégicas prioritárias para o corretor realizar hoje para aumentar suas conversões de vendas ou locações.

Contatos Recentes:
${JSON.stringify(clients, null, 2)}

Imóveis Disponíveis:
${JSON.stringify(properties, null, 2)}

Formato da resposta: Retorne apenas um JSON válido no formato de lista com 3 itens de tarefa. Cada item deve ter:
- "title": Título curto e direto da ação (ex: "Ligar para Beatriz Oliveira")
- "clientName": Nome do cliente envolvido
- "description": Motivo estratégico da ação e o que falar (ex: "Sugerir o novo Apartamento em Ipanema que se encaixa perfeitamente no orçamento de R$ 2.4M.")
- "time": Sugestão de horário (ex: "10:00", "15:30")
- "type": Tipo de tarefa ("VISITA" ou "FOLLOW-UP" ou "CONTRATO" ou "OUTRO")`;

    try {
      const response = await generateContentWithRetry(() => ai!.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      }));

      const parsedTasks = JSON.parse(response.text || "[]");
      res.json(parsedTasks);
    } catch (innerErr: any) {
      console.log(`Gemini API info: usando fallback estruturado para sugestao de tarefas (${innerErr?.message || 'cooldown'}).`);
      const fallback = getFallbackTasks(clients, properties);
      res.json(fallback);
    }
  } catch (err: any) {
    res.status(500).json({ error: `Falha na IA: ${err.message}` });
  }
});

// NEXT BEST ACTIONS
app.post("/api/ai/next-best-actions", requireAuth, requireGeminiPlan, async (req, res) => {
  try {
    const { clients = [], tasks = [], proposals = [], visits = [] } = req.body;

    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const rawCandidates: any[] = [];

    // Helper to format dates safely to DD/MM/YYYY
    const formatDateSafely = (dateVal: any) => {
      if (!dateVal || typeof dateVal !== "string") return "N/D";
      return dateVal.split("-").reverse().join("/");
    };

    // 1. Leads sem contato
    const leadsSemContato = clients.filter((c: any) => {
      const isNew = String(c.status || "").toLowerCase() === "novo" || String(c.profileType || "").toLowerCase() === "lead";
      const isActive = !["ganho", "perdido"].includes(String(c.status || "").toLowerCase());
      const hasCompletedTask = tasks.some((t: any) => t.completed && (t.clientId === c.id || t.clientId === c._id));
      const hasHistoryContact = c.history?.some((h: any) => 
        ["whatsapp", "task_completed", "visit_scheduled", "proposal_sent"].includes(h.type)
      );
      return isNew && isActive && !hasCompletedTask && !hasHistoryContact;
    });

    leadsSemContato.forEach((c: any) => {
      rawCandidates.push({
        clientId: c.id || c._id,
        clientName: c.name,
        category: "Leads sem contato",
        reason: `Lead novo cadastrado no CRM sem nenhuma atividade ou primeiro contato registrado.`,
        suggestion: `Fazer primeiro contato via WhatsApp para se apresentar e entender o perfil de busca do cliente.`,
        actionType: "whatsapp",
        priority: "Alta",
        actionPayload: {
          phone: c.phone || "",
          message: `Olá, ${c.name.split(" ")[0]}! Tudo bem? Me chamo corretor da Metria CRM. Vi que você tem interesse em encontrar um imóvel. Gostaria de entender melhor quais são suas preferências (tipo de imóvel, localização, quantidade de quartos) para eu selecionar as melhores opções da nossa carteira para você. Como está o seu tempo esta semana?`,
          taskTitle: `Fazer primeiro contato com ${c.name}`,
          taskDescription: `Entrar em contato para qualificar as preferências do lead novo.`,
          taskType: "Ligar"
        }
      });
    });

    // 2. Follow-ups atrasados
    const followupsAtrasados = tasks.filter((t: any) => {
      if (t.completed) return false;
      if (!t.date) return false;
      if (t.date < todayStr) return true;
      if (t.date === todayStr && t.time && t.time < currentHM) return true;
      return false;
    });

    followupsAtrasados.forEach((t: any) => {
      const client = clients.find((c: any) => c.id === t.clientId || c._id === t.clientId || c.name === t.clientName);
      rawCandidates.push({
        clientId: client?.id || client?._id || "unknown",
        clientName: t.clientName,
        category: "Follow-ups atrasados",
        reason: `A tarefa de follow-up "${t.title}" está atrasada desde ${formatDateSafely(t.date)} às ${t.time || "N/D"}.`,
        suggestion: `Colocar a agenda em dia realizando o contato com o cliente para evitar o esfriamento da negociação.`,
        actionType: "whatsapp",
        priority: "Alta",
        actionPayload: {
          phone: client?.phone || "",
          message: `Olá, ${t.clientName.split(" ")[0]}! Espero que esteja bem. Estou entrando em contato para retomarmos nossa conversa sobre as opções de imóveis que estávamos analisando. Você conseguiu um tempo para dar uma olhada nelas?`,
          taskTitle: `Retomar follow-up: ${t.title}`,
          taskDescription: `Follow-up comercial anteriormente atrasado.`,
          taskType: "Cobrar retorno"
        }
      });
    });

    // 3. Propostas abertas
    const propostasAbertas = proposals.filter((p: any) => 
      ["pendente", "em análise", "em analise"].includes(String(p.status || "").toLowerCase())
    );

    propostasAbertas.forEach((p: any) => {
      const client = clients.find((c: any) => c.id === p.clientId || c._id === p.clientId || c.name === p.clientName);
      rawCandidates.push({
        clientId: p.clientId,
        clientName: p.clientName,
        category: "Propostas abertas",
        reason: `Há uma proposta em análise/pendente para o imóvel "${p.propertyTitle}" enviada em ${formatDateSafely(p.date)}.`,
        suggestion: `Entrar em contato para cobrar um posicionamento e dar andamento aos trâmites de fechamento do negócio.`,
        actionType: "whatsapp",
        priority: "Crítica",
        actionPayload: {
          phone: client?.phone || "",
          message: `Olá, ${p.clientName.split(" ")[0]}! Passando para saber se você teve alguma resposta ou conseguiu analisar a proposta que enviamos para o imóvel ${p.propertyTitle}? Ficou com alguma dúvida sobre as condições ou fluxo de pagamentos?`,
          taskTitle: `Cobrar proposta ${p.clientName}`,
          taskDescription: `Cobrar andamento da proposta de R$ ${p.proposedValue?.toLocaleString("pt-BR")} para o imóvel ${p.propertyTitle}`,
          taskType: "Enviar proposta"
        }
      });
    });

    // 4. Visitas realizadas sem retorno
    const visitasSemRetorno = visits.filter((v: any) => {
      if (String(v.status || "").toLowerCase() !== "realizada") return false;
      const hasFeedback = v.feedback && v.feedback.trim().length > 0;
      const clientTasks = tasks.filter((t: any) => t.clientId === v.clientId);
      const hasCompletedAfter = clientTasks.some((t: any) => t.completed && t.date && v.date && t.date >= v.date);
      return !hasFeedback && !hasCompletedAfter;
    });

    visitasSemRetorno.forEach((v: any) => {
      const client = clients.find((c: any) => c.id === v.clientId || c._id === v.clientId || c.name === v.clientName);
      rawCandidates.push({
        clientId: v.clientId,
        clientName: v.clientName,
        category: "Visitas realizadas sem retorno",
        reason: `Visita ao imóvel "${v.propertyTitle}" foi realizada no dia ${formatDateSafely(v.date)}, mas ainda não há feedback ou atividade registrada.`,
        suggestion: `Enviar uma mensagem de pós-visita para colher as impressões do cliente e verificar interesse em avançar.`,
        actionType: "whatsapp",
        priority: "Alta",
        actionPayload: {
          phone: client?.phone || "",
          message: `Olá, ${v.clientName.split(" ")[0]}! Como vai? Passando para saber o que você achou da visita que fizemos ao imóvel ${v.propertyTitle} no dia ${formatDateSafely(v.date)}. Acredita que o imóvel atende ao que busca ou gostaria de ver outras opções semelhantes?`,
          taskTitle: `Colher feedback pós-visita de ${v.clientName}`,
          taskDescription: `Entrar em contato para colher impressões sobre a visita no imóvel ${v.propertyTitle}`,
          taskType: "Cobrar retorno"
        }
      });
    });

    // 5. Clientes quentes
    const clientesQuentes = clients.filter((c: any) => {
      const isActive = !["ganho", "perdido"].includes(String(c.status || "").toLowerCase());
      const isHot = String(c.temperature || "").toLowerCase() === "quente" || String(c.closingProbability || "").toLowerCase() === "alta";
      return isActive && isHot;
    });

    clientesQuentes.forEach((c: any) => {
      if (rawCandidates.some(r => r.clientId === (c.id || c._id))) return;

      rawCandidates.push({
        clientId: c.id || c._id,
        clientName: c.name,
        category: "Clientes quentes",
        reason: `Cliente quente com alta probabilidade de fechamento ativo no CRM.`,
        suggestion: `Manter o cliente engajado oferecendo suporte imediato ou novas informações do andamento da negociação.`,
        actionType: "whatsapp",
        priority: "Alta",
        actionPayload: {
          phone: c.phone || "",
          message: `Olá, ${c.name.split(" ")[0]}! Tudo bem? Passando para te desejar uma excelente semana e reforçar que estou à disposição para ajudar no que for preciso sobre a sua busca imobiliária. Conseguiu pensar mais sobre as opções que enviamos?`,
          taskTitle: `Manter engajamento: ${c.name}`,
          taskDescription: `Engajamento com lead quente / alta probabilidade.`,
          taskType: "Ligar"
        }
      });
    });

    // 6. Negociações paradas
    const negociacoesParadas = clients.filter((c: any) => {
      const isActive = String(c.status || "").toLowerCase() === "em atendimento" || c.pipelineStatus;
      if (!isActive) return false;
      
      let lastActivity = c.updatedAt ? Date.parse(c.updatedAt) : (c.createdAt ? Date.parse(c.createdAt) : Date.now());
      if (c.history && c.history.length > 0) {
        c.history.forEach((h: any) => {
          const hDate = Date.parse(h.date);
          if (!isNaN(hDate) && hDate > lastActivity) {
            lastActivity = hDate;
          }
        });
      }
      const diffHours = (Date.now() - lastActivity) / (1000 * 60 * 60);
      return diffHours > 48;
    });

    negociacoesParadas.forEach((c: any) => {
      if (rawCandidates.some(r => r.clientId === (c.id || c._id))) return;

      rawCandidates.push({
        clientId: c.id || c._id,
        clientName: c.name,
        category: "Negociações paradas",
        reason: `Cliente em atendimento está sem novas interações ou registros comerciais há mais de 48 horas.`,
        suggestion: `Reativar contato sugerindo uma rápida conversa ou apresentando uma nova excelente oportunidade.`,
        actionType: "whatsapp",
        priority: "Média",
        actionPayload: {
          phone: c.phone || "",
          message: `Olá, ${c.name.split(" ")[0]}! Como vão as coisas? Acabou de entrar em nossa carteira uma nova oportunidade incrível que tem tudo a ver com o seu perfil. Posso te enviar as fotos e a ficha técnica?`,
          taskTitle: `Reativar contato com ${c.name}`,
          taskDescription: `Negociação estagnada há mais de 48 horas. Reativar interesse.`,
          taskType: "Enviar imóvel"
        }
      });
    });

    // 7. Tarefas do dia
    const tarefasDoDia = tasks.filter((t: any) => !t.completed && t.date === todayStr);
    tarefasDoDia.forEach((t: any) => {
      const client = clients.find((c: any) => c.id === t.clientId || c._id === t.clientId || c.name === t.clientName);
      if (rawCandidates.some(r => r.clientId === client?.id || r.clientId === client?._id)) return;

      rawCandidates.push({
        clientId: client?.id || client?._id || "unknown",
        clientName: t.clientName,
        category: "Tarefas do dia",
        reason: `Você tem a atividade "${t.title}" agendada para hoje às ${t.time || "N/D"}.`,
        suggestion: `Executar o follow-up planejado no cronograma diário do CRM.`,
        actionType: "whatsapp",
        priority: "Média",
        actionPayload: {
          phone: client?.phone || "",
          message: `Olá, ${t.clientName.split(" ")[0]}! Tudo bem? Estou entrando em contato conforme havíamos combinado hoje para conversarmos sobre os próximos passos da busca de imóvel. Como está sua agenda hoje?`,
          taskTitle: t.title,
          taskDescription: t.description,
          taskType: t.type
        }
      });
    });

    let finalRecommendations = rawCandidates.slice(0, 6);

    if (finalRecommendations.length === 0) {
      finalRecommendations = [
        {
          clientId: "proactive-1",
          clientName: "Novos Clientes",
          category: "Prospecção",
          reason: "Nenhuma pendência crítica ou atrasada foi detectada em sua carteira de clientes no momento.",
          suggestion: "Aproveite o tempo livre para cadastrar novos leads ou realizar prospecção ativa de novos imóveis.",
          actionType: "open_client",
          priority: "Média",
          actionPayload: {
            phone: "",
            message: ""
          }
        },
        {
          clientId: "proactive-2",
          clientName: "Carteira Imobiliária",
          category: "Gestão de Carteira",
          reason: "Todos os seus atendimentos e follow-ups estão rigorosamente em dia hoje.",
          suggestion: "Revise seus imóveis cadastrados para verificar se há fotos pendentes ou descrições que possam ser otimizadas com IA.",
          actionType: "open_client",
          priority: "Média",
          actionPayload: {
            phone: "",
            message: ""
          }
        }
      ];
    }

    if (ai && rawCandidates.length > 0) {
      try {
        const prompt = `Você é um mentor e assistente de inteligência artificial de elite para corretores imobiliários brasileiros no Metria CRM.
Sua tarefa é analisar os seguintes candidatos de "Próxima Melhor Ação" identificados nas bases de dados do CRM e refinar o motivo (reason) e a sugestão (suggestion) para cada um deles.

Crie recomendações de altíssimo nível, escritas de forma natural, comercial, empática e direta, sem clichês exagerados ou jargões artificiais ("AI slop").
IMPORTANTE: Nunca invente informações de imóveis, valores ou datas que não existam nos dados do candidato abaixo.

Aqui estão os dados dos candidatos identificados:
${JSON.stringify(finalRecommendations, null, 2)}

Por favor, retorne um JSON correspondente a uma lista de objetos, onde cada objeto mantém o "clientId", "clientName", "actionType" e a estrutura de "actionPayload" fornecidos, mas aprimora e enriquece os seguintes campos:
- "reason": Um motivo convincente e claro de por que agir hoje.
- "suggestion": Uma sugestão direta e estratégica de ação comercial.
- "priority": Prioridade recalculada ("Crítica", "Alta" ou "Média") com base na gravidade ou calor do lead.
- "actionPayload.message": Escreva um texto pré-formatado ideal e extremamente natural para ser enviado via WhatsApp no mercado brasileiro.`;

        const response = await generateContentWithRetry(() => ai!.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  clientId: { type: Type.STRING },
                  clientName: { type: Type.STRING },
                  category: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  suggestion: { type: Type.STRING },
                  actionType: { type: Type.STRING },
                  priority: { type: Type.STRING },
                  actionPayload: {
                    type: Type.OBJECT,
                    properties: {
                      phone: { type: Type.STRING },
                      message: { type: Type.STRING },
                      taskTitle: { type: Type.STRING },
                      taskDescription: { type: Type.STRING },
                      taskType: { type: Type.STRING }
                    },
                    required: ["phone"]
                  }
                },
                required: ["clientId", "clientName", "reason", "suggestion", "actionType", "priority", "actionPayload"]
              }
            }
          }
        }));

        if (response.text) {
          const parsed = JSON.parse(response.text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            finalRecommendations = parsed;
          }
        }
      } catch (aiErr: any) {
        console.log(`Gemini API info: usando fallback de regras para as recomendacoes (${aiErr?.message || 'cooldown'}).`);
      }
    }

    res.json(finalRecommendations);
  } catch (err: any) {
    console.error("Erro na rota Next Best Action:", err);
    res.status(500).json({ error: err.message });
  }
});

// Vite & Static file serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
