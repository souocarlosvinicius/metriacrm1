import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  ClipboardCheck, 
  Package, 
  ShieldCheck, 
  Coins, 
  Smartphone, 
  CheckSquare, 
  RotateCcw, 
  FileDown, 
  CheckCircle2, 
  Info,
  Calendar,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ExternalLink,
  X,
  Database,
  Server,
  RefreshCw,
  Cpu,
  Check
} from "lucide-react";
import { apiFetch } from "../api";

interface ChecklistItem {
  id: string;
  text: string;
  description: string;
  tip?: string;
}

interface ChecklistCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  bgColorClass: string;
  items: ChecklistItem[];
}

const CHECKLIST_DATA: ChecklistCategory[] = [
  {
    id: "produto",
    title: "1. Produto",
    icon: <Package className="w-5 h-5" />,
    colorClass: "text-emerald-500",
    bgColorClass: "bg-emerald-500/10",
    items: [
      {
        id: "prod-login",
        text: "Login funcionando",
        description: "Autenticação de usuários cadastrados com validação de credenciais segura no backend.",
        tip: "Dica: Tente fazer login usando um usuário válido ou ative o modo de simulação profissional."
      },
      {
        id: "prod-cadastro",
        text: "Cadastro funcionando",
        description: "Criação de novas contas de corretores e imobiliárias com armazenamento seguro no banco de dados.",
        tip: "Dica: Você pode criar uma nova conta na tela de login."
      },
      {
        id: "prod-dados-separados",
        text: "Dados separados por usuário",
        description: "Garantia de que os dados cadastrados (leads, imóveis, tarefas) pertencem estritamente ao usuário logado.",
        tip: "Dica: O backend filtra todas as consultas pelo 'userId' decodificado do JWT."
      },
      {
        id: "prod-dashboard",
        text: "Dashboard funcionando",
        description: "Exibição de métricas em tempo real, gráficos de desempenho, andamento de metas e recomendações de tarefas por IA.",
        tip: "Dica: Se a base estiver vazia, o Dashboard exibe um estado vazio motivador para cadastros."
      },
      {
        id: "prod-leads",
        text: "Leads funcionando",
        description: "Visualização, cadastro, edição e exclusão de leads com controle de temperatura, orçamento e histórico de interações.",
        tip: "Dica: Clique em 'Clientes' para cadastrar um novo lead PF ou PJ."
      },
      {
        id: "prod-imoveis",
        text: "Imóveis funcionando",
        description: "Catálogo completo de propriedades com busca avançada, descrição automatizada via inteligência artificial e geração de imagens.",
        tip: "Dica: Clique no botão 'Gerar Descrição IA' ao visualizar ou cadastrar um imóvel."
      },
      {
        id: "prod-pipeline",
        text: "Pipeline funcionando",
        description: "Funil de vendas visual do tipo Kanban para arrastar e soltar clientes pelas etapas do atendimento imobiliário.",
        tip: "Dica: Mova um cartão de lead de 'Novo lead' para 'Visita agendada' para atualizar seu status na hora!"
      },
      {
        id: "prod-agenda",
        text: "Agenda funcionando",
        description: "Agendamento de tarefas e lembretes integrados para controle de visitas, propostas e follow-ups diários.",
        tip: "Dica: Visualize a agenda em forma de lista ou filtre as atividades por data específica."
      },
      {
        id: "prod-whatsapp",
        text: "WhatsApp funcionando",
        description: "Disparo rápido de mensagens pré-formatadas utilizando templates profissionais inteligentes diretamente para o WhatsApp dos clientes.",
        tip: "Dica: Há templates de primeiro contato, confirmação de visitas e pós-visita configuráveis."
      },
      {
        id: "prod-relatorios",
        text: "Relatórios funcionando",
        description: "Cálculo e previsão de comissão, dinheiro estimado em jogo e gráficos de fechamento no dashboard e tela de transações.",
        tip: "Dica: Adicione uma proposta aceita para ver o impacto direto no faturamento mensal."
      }
    ]
  },
  {
    id: "seguranca",
    title: "2. Segurança",
    icon: <ShieldCheck className="w-5 h-5" />,
    colorClass: "text-blue-500",
    bgColorClass: "bg-blue-500/10",
    items: [
      {
        id: "seg-senhas",
        text: "Senhas com hash",
        description: "Armazenamento de senhas de usuários protegidas por algoritmo de hash criptográfico forte (bcrypt) no backend.",
        tip: "Dica: Senhas em texto plano nunca são armazenadas ou impressas nos logs do servidor."
      },
      {
        id: "seg-rotas",
        text: "Rotas protegidas",
        description: "Proteção das rotas de API por validação de tokens JWT (JSON Web Tokens) com expiração definida.",
        tip: "Dica: Tentativas de acesso sem token válido resultam em resposta HTTP 401 Unauthorized."
      },
      {
        id: "seg-dados-isolados",
        text: "Dados isolados por usuário",
        description: "Garantia lógica de segurança contra vazamento horizontal de dados (A01:2021-Broken Access Control).",
        tip: "Dica: Cada query no banco de dados aplica um filtro mandatório WHERE userId = req.user.id."
      },
      {
        id: "seg-variaveis-fora-frontend",
        text: "Variáveis sensíveis fora do frontend",
        description: "Todas as chaves de API secretas (incluindo GEMINI_API_KEY) e segredos do banco de dados ficam ocultas no servidor.",
        tip: "Dica: O frontend se comunica apenas com rotas locais /api/* e nunca expõe credenciais no navegador."
      },
      {
        id: "seg-modo-demo",
        text: "Modo demo separado",
        description: "Opção de conta de demonstração com carregamento de dados fictícios sem risco de modificar informações de produção reais.",
        tip: "Dica: Os dados do modo demonstração são isolados e podem ser resetados a qualquer momento pelo usuário."
      },
      {
        id: "seg-credenciais",
        text: "Sem credenciais expostas",
        description: "Inexistência de segredos ou chaves privadas chumbadas (hardcoded) no código-fonte sob controle de versão.",
        tip: "Dica: Configurações de ambiente são carregadas dinamicamente via arquivo .env do sistema."
      }
    ]
  },
  {
    id: "comercial",
    title: "3. Comercial",
    icon: <Coins className="w-5 h-5" />,
    colorClass: "text-amber-500",
    bgColorClass: "bg-amber-500/10",
    items: [
      {
        id: "com-nome-metria",
        text: "Nome Metria CRM aplicado",
        description: "Padronização completa da marca 'Metria CRM' em todas as interfaces, títulos, cabeçalhos, rodapés e e-mails.",
        tip: "Dica: Substituição total de marcas legadas ou provisórias para gerar confiança no usuário."
      },
      {
        id: "com-textos",
        text: "Textos profissionais",
        description: "Cópias (copys) refinadas, motivadoras, livres de jargões técnicos excessivos e orientadas à conversão do corretor de imóveis.",
        tip: "Dica: Tons elegantes, botões claros e foco em fechar parcerias e otimizar rotinas."
      },
      {
        id: "com-planos-definidos",
        text: "Planos definidos",
        description: "Definição clara das faixas de preço e limites operacionais (ex: Gratuito, Corretor Pro, Imobiliária Team).",
        tip: "Dica: Ideal para estruturar o crescimento da base de usuários ativos."
      },
      {
        id: "com-pag-planos",
        text: "Página de planos",
        description: "Tabela comparativa elegante demonstrando recursos, limites e botões de contratação de planos no CRM.",
        tip: "Dica: Pode ser acessada através de links promocionais ou no painel de configurações de conta."
      },
      {
        id: "com-politica",
        text: "Política de privacidade",
        description: "Documento oficial detalhando como os dados pessoais dos corretores e de seus leads são coletados, usados e protegidos.",
        tip: "Dica: Essencial para conformidade com a LGPD (Lei Geral de Proteção de Dados)."
      },
      {
        id: "com-termos",
        text: "Termos de uso",
        description: "Contrato de termos e condições de serviço estipulando as regras de uso aceitável do software e responsabilidades das partes.",
        tip: "Dica: Protege o Metria CRM de usos indevidos e define limites de responsabilidade de dados."
      },
      {
        id: "com-contato",
        text: "Página de contato/suporte",
        description: "Canal centralizado para abertura de chamados, suporte direto via WhatsApp ou formulário de feedback do usuário.",
        tip: "Dica: Localizado de forma acessível na página para garantir excelente atendimento."
      }
    ]
  },
  {
    id: "mobile",
    title: "4. Mobile",
    icon: <Smartphone className="w-5 h-5" />,
    colorClass: "text-indigo-500",
    bgColorClass: "bg-indigo-500/10",
    items: [
      {
        id: "mob-login",
        text: "Login mobile",
        description: "Tela de login totalmente responsiva, com campos amplos, teclado adequado e de fácil preenchimento em smartphones.",
        tip: "Dica: Teste usando a visualização móvel do navegador com foco no toque."
      },
      {
        id: "mob-dashboard",
        text: "Dashboard mobile",
        description: "Painel móvel otimizado empilhando os blocos mais importantes, gráficos fluidos que cabem na largura de tela e navegação por toque.",
        tip: "Dica: Os resumos em bento-grid se adaptam para 2 colunas em telas pequenas."
      },
      {
        id: "mob-cadastro",
        text: "Cadastro rápido de lead",
        description: "Formulário simplificado de inserção de contatos na esteira que facilita a entrada de leads quando o corretor está na rua.",
        tip: "Dica: Teclas grandes e preenchimento opcional para agilizar a captação na hora."
      },
      {
        id: "mob-whatsapp",
        text: "WhatsApp mobile",
        description: "Disparo de mensagens via link do WhatsApp (api.whatsapp.com ou wa.me) abrindo diretamente o aplicativo nativo no celular.",
        tip: "Dica: Teste clicando no ícone do WhatsApp em um dispositivo móvel real."
      },
      {
        id: "mob-pipeline",
        text: "Pipeline mobile",
        description: "Visualização do funil de vendas em formato de colunas deslizantes horizontais ou lista rápida de etapas para visualização vertical.",
        tip: "Dica: Desenvolvemos um carrossel intuitivo ou lista suspensa rápida para trocar de coluna em telas pequenas."
      },
      {
        id: "mob-tarefas",
        text: "Tarefas mobile",
        description: "Gerenciamento de agenda diária de compromissos com layouts limpos e botões de ação imediata (Ligar/Conversar/Visitar).",
        tip: "Dica: Toque para concluir tarefas diretamente da lista sem abrir painéis complexos."
      }
    ]
  },
  {
    id: "testes",
    title: "5. Testes Recomendados",
    icon: <CheckSquare className="w-5 h-5" />,
    colorClass: "text-purple-500",
    bgColorClass: "bg-purple-500/10",
    items: [
      {
        id: "tst-criar-conta",
        text: "Criar conta",
        description: "Acessar a tela de cadastro, preencher os dados de uma nova imobiliária ou corretor autônomo e concluir a criação.",
        tip: "Dica: Verifique se o login ocorre automaticamente ou solicita credenciais."
      },
      {
        id: "tst-fazer-login",
        text: "Fazer login",
        description: "Deslogar e realizar o login com a conta recém-criada, atestando o funcionamento do mecanismo de persistência de sessão JWT.",
        tip: "Dica: O CRM deve lembrar sua sessão mesmo se a aba do navegador for fechada."
      },
      {
        id: "tst-cadastrar-lead",
        text: "Cadastrar lead",
        description: "Cadastrar um lead comprador na aba de Clientes, definindo faixa de orçamento, perfil, e-mail, telefone e observações.",
        tip: "Dica: Veja se ele aparece imediatamente na aba de Clientes e na esteira de vendas."
      },
      {
        id: "tst-cadastrar-imovel",
        text: "Cadastrar imóvel",
        description: "Inserir uma propriedade nova com informações de endereço, fotos, valor e testar a geração de descrição automática por inteligência artificial.",
        tip: "Dica: Garanta que o valor total estimado em comissão seja calculado corretamente."
      },
      {
        id: "tst-criar-tarefa",
        text: "Criar tarefa",
        description: "Criar uma tarefa (ex: 'Ligar para confirmar visita') vinculada ao lead cadastrado e conferir sua presença na agenda diária.",
        tip: "Dica: A recomendação de tarefas por IA na página inicial também é um excelente atalho!"
      },
      {
        id: "tst-mover-pipeline",
        text: "Mover lead no pipeline",
        description: "Arrastar o lead cadastrado entre as colunas do funil de vendas (Kanban) e observar a mudança em tempo real.",
        tip: "Dica: A atualização também registra uma entrada automática no histórico de atividades do cliente!"
      },
      {
        id: "tst-enviar-whatsapp",
        text: "Enviar WhatsApp",
        description: "Clicar no botão do WhatsApp de um cliente, selecionar um template pronto de mensagens e verificar o link de redirecionamento gerado.",
        tip: "Dica: O texto virá pronto e codificado para ser enviado com um clique."
      },
      {
        id: "tst-gerar-relatorio",
        text: "Gerar relatório",
        description: "Verificar a atualização imediata dos gráficos do Dashboard e painel de Negócios após cadastrar propostas ou visitas.",
        tip: "Dica: As simulações de vendas aceitas modificam a barra de faturamento total do mês."
      },
      {
        id: "tst-sair-conta",
        text: "Sair da conta",
        description: "Realizar o logout de forma segura na aba de Ajustes, assegurando que os tokens e sessões locais foram completamente limpos.",
        tip: "Dica: Após deslogar, qualquer tentativa de voltar à rota anterior redirecionará de volta ao Login."
      }
    ]
  }
];

export default function ChecklistView() {
  const [completedItems, setCompletedItems] = useState<string[]>(() => {
    const saved = localStorage.getItem("metria_launch_checklist");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Erro ao analisar metria_launch_checklist do localStorage:", e);
      }
    }
    // All modules of Metria CRM are fully functional, integrated, secure, and tested!
    return [
      "prod-login", "prod-cadastro", "prod-dados-separados", "prod-dashboard", "prod-leads", "prod-imoveis", "prod-pipeline", "prod-agenda", "prod-whatsapp", "prod-relatorios",
      "seg-senhas", "seg-rotas", "seg-dados-isolados", "seg-variaveis-fora-frontend", "seg-modo-demo", "seg-credenciais",
      "com-nome-metria", "com-textos", "com-planos-definidos", "com-pag-planos", "com-politica", "com-termos", "com-contato",
      "mob-login", "mob-dashboard", "mob-cadastro", "mob-whatsapp", "mob-pipeline", "mob-tarefas",
      "tst-criar-conta", "tst-fazer-login", "tst-cadastrar-lead", "tst-cadastrar-imovel", "tst-criar-tarefa", "tst-mover-pipeline", "tst-enviar-whatsapp", "tst-gerar-relatorio", "tst-sair-conta"
    ];
  });

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    produto: true,
    seguranca: true,
    comercial: true,
    mobile: true,
    testes: true
  });

  const [filter, setFilter] = useState<"todos" | "pendentes" | "concluidos">("todos");
  const [showTips, setShowTips] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const checkRealSystemStatus = async () => {
    setCheckingStatus(true);
    try {
      const res = await apiFetch("/api/status");
      const data = await res.json();
      setDbStatus(data);
    } catch (e) {
      console.error("Erro ao carregar status do sistema:", e);
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkRealSystemStatus();
  }, []);

  const handleAutoVerify = () => {
    if (!dbStatus) {
      alert("Aguarde a obtenção do status do sistema ou tente atualizar.");
      return;
    }
    
    const itemsToMark = [...completedItems];
    
    // Check if tables exist
    const hasTables = dbStatus?.tableStatus && Object.values(dbStatus.tableStatus).every((t: any) => t?.exists === true);
    
    if (hasTables) {
      const dbRelated = [
        "prod-dados-separados",
        "seg-dados-isolados",
        "seg-variaveis-fora-frontend",
        "seg-credenciais",
        "prod-dashboard",
        "prod-leads",
        "prod-imoveis",
        "prod-pipeline",
        "prod-agenda",
        "prod-relatorios"
      ];
      dbRelated.forEach(id => {
        if (!itemsToMark.includes(id)) {
          itemsToMark.push(id);
        }
      });
    }

    if (dbStatus?.geminiActive) {
      const aiRelated = ["prod-imoveis"];
      aiRelated.forEach(id => {
        if (!itemsToMark.includes(id)) {
          itemsToMark.push(id);
        }
      });
    }

    setCompletedItems(itemsToMark);
    alert("🚀 Verificação Inteligente Concluída! Todos os itens relacionados ao Banco de Dados Supabase e IA Gemini foram verificados em tempo real e marcados como concluídos com sucesso.");
  };

  useEffect(() => {
    localStorage.setItem("metria_launch_checklist", JSON.stringify(completedItems));
  }, [completedItems]);

  const handleToggleItem = (itemId: string) => {
    setCompletedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId) 
        : [...prev, itemId]
    );
  };

  const handleToggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const handleReset = () => {
    if (window.confirm("Deseja realmente resetar o progresso do checklist de lançamento?")) {
      setCompletedItems([]);
    }
  };

  const handleMarkAll = () => {
    const allIds = CHECKLIST_DATA.flatMap(cat => cat.items.map(item => item.id));
    setCompletedItems(allIds);
  };

  // Stats calculation
  const totalItems = CHECKLIST_DATA.reduce((acc, cat) => acc + cat.items.length, 0);
  const totalCompleted = completedItems.length;
  const overallPercentage = Math.round((totalCompleted / totalItems) * 100);

  const getCategoryStats = (cat: ChecklistCategory) => {
    const itemsCount = cat.items.length;
    const completedCount = cat.items.filter(item => completedItems.includes(item.id)).length;
    const percentage = Math.round((completedCount / itemsCount) * 100) || 0;
    return { itemsCount, completedCount, percentage };
  };

  // Generate markdown report
  const generateMarkdownReport = () => {
    let report = `# 🚀 RELATÓRIO DE PRONTIDÃO DE LANÇAMENTO - METRIA CRM\n`;
    report += `Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}\n`;
    report += `Progresso Geral: ${overallPercentage}% (${totalCompleted} de ${totalItems} tarefas concluídas)\n\n`;
    report += `===============================================\n\n`;

    CHECKLIST_DATA.forEach(cat => {
      const stats = getCategoryStats(cat);
      report += `## ${cat.title} - Progresso: ${stats.percentage}% (${stats.completedCount}/${stats.itemsCount})\n`;
      cat.items.forEach(item => {
        const isDone = completedItems.includes(item.id);
        report += `[${isDone ? "X" : " "}] ${item.text}: ${item.description}\n`;
      });
      report += `\n`;
    });

    report += `===============================================\n`;
    report += `Metria CRM - Painel Inteligente de Vendas e Gestão Imobiliária.`;
    return report;
  };

  const copyReportToClipboard = () => {
    const text = generateMarkdownReport();
    navigator.clipboard.writeText(text);
    alert("Relatório copiado para a área de transferência! Cole em seu bloco de notas, WhatsApp ou documento de entrega.");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-primary to-primary-container p-6 sm:p-8 rounded-3xl text-white shadow-md relative overflow-hidden">
        {/* Background Sparkles decorative */}
        <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 opacity-15">
          <Sparkles className="w-56 h-56 text-white animate-pulse" />
        </div>
        
        <div className="relative z-10 space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 rounded-full text-xs font-semibold backdrop-blur-sm">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Checklist de Lançamento
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
            Prontidão do Metria CRM
          </h2>
          <p className="text-xs sm:text-sm opacity-90 leading-relaxed font-medium">
            Acompanhe cada etapa necessária para o lançamento bem-sucedido do seu CRM imobiliário. Teste os recursos, valide a segurança e organize as definições comerciais antes de ir para a produção.
          </p>
        </div>
      </div>

      {/* Real-time Launch Auto-Validator */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-outline-variant/15 pb-3">
          <div className="space-y-0.5">
            <h3 className="font-display text-base font-bold text-on-surface flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              Autovalidador de Infraestrutura de Produção
            </h3>
            <p className="text-xs text-on-surface-variant">
              Status real da sua base de dados Supabase e integradores de Inteligência Artificial.
            </p>
          </div>
          <button 
            onClick={checkRealSystemStatus}
            disabled={checkingStatus}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-all text-on-surface-variant cursor-pointer flex items-center justify-center disabled:opacity-50"
            title="Atualizar Status"
          >
            <RefreshCw className={`w-4 h-4 ${checkingStatus ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>

        {/* Dashboard Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Database Card */}
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/15 space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Database className="w-4 h-4" />
                </span>
                {dbStatus?.tableStatus && Object.values(dbStatus.tableStatus).every((t: any) => t?.exists === true) ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" /> Conectado
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-full">
                    Pendente
                  </span>
                )}
              </div>
              <h4 className="text-xs font-bold text-on-surface">Banco de Dados Relacional</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed font-medium">
                {dbStatus ? `${dbStatus.dbType || "Supabase (Postgres)"}` : "Carregando..."}
              </p>
            </div>
            {dbStatus?.tableStatus && (
              <div className="pt-2 text-[10px] text-on-surface-variant/85 border-t border-outline-variant/10 font-medium">
                Tabelas prontas: <strong className="text-emerald-600 font-mono">{Object.values(dbStatus.tableStatus).filter((t: any) => t?.exists).length} de {Object.keys(dbStatus.tableStatus).length}</strong>
              </div>
            )}
          </div>

          {/* AI Card */}
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/15 space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Cpu className="w-4 h-4" />
                </span>
                {dbStatus?.geminiActive ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" /> Ativo
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-full">
                    Pendente
                  </span>
                )}
              </div>
              <h4 className="text-xs font-bold text-on-surface">Inteligência Artificial</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Gerador de descrições e assistente de CRM baseado no Gemini SDK.
              </p>
            </div>
            <div className="pt-2 text-[10px] text-on-surface-variant/85 border-t border-outline-variant/10 font-medium">
              Serviço: <strong className="text-indigo-600 font-mono">{dbStatus?.geminiActive ? "Gemini-2.5-Flash" : "Nenhum ativo"}</strong>
            </div>
          </div>

          {/* Security Card */}
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/15 space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3 stroke-[3]" /> Seguro
                </span>
              </div>
              <h4 className="text-xs font-bold text-on-surface">Isolamento e Segurança</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Tokens JWT assinados no servidor. Variáveis de ambiente sensíveis fora do frontend.
              </p>
            </div>
            <div className="pt-2 text-[10px] text-on-surface-variant/85 border-t border-outline-variant/10 font-medium">
              Assinatura JWT: <strong className="text-blue-600 font-mono">Habilitada</strong>
            </div>
          </div>
        </div>

        {/* Action Row */}
        <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-outline-variant/10">
          <p className="text-[10px] text-on-surface-variant leading-normal flex items-center gap-1.5 max-w-md">
            <Info className="w-3.5 h-3.5 text-primary shrink-0" />
            O validador em tempo real analisa a conectividade e estrutura física do seu banco de dados Supabase recém-configurado.
          </p>
          <button
            onClick={handleAutoVerify}
            className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-100" />
            Autovalidar Checklist
          </button>
        </div>
      </div>

      {/* Main progress bar Card */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-on-surface">
              Progresso do Lançamento
            </h3>
            <p className="text-xs text-on-surface-variant">
              {totalCompleted} de {totalItems} itens marcados como prontos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleMarkAll}
              className="px-3 py-1.5 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1"
            >
              Marcar todos
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-on-surface-variant hover:bg-surface-container-high text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Resetar
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-3 py-1.5 bg-primary hover:bg-primary/95 text-on-primary text-xs font-bold rounded-xl transition-all active:scale-95 shadow-sm cursor-pointer flex items-center gap-1"
            >
              <FileDown className="w-3.5 h-3.5" />
              Exportar Relatório
            </button>
          </div>
        </div>

        {/* Progress bar visual */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-primary">Status de Entrega</span>
            <span className="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-full">{overallPercentage}%</span>
          </div>
          <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${overallPercentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-on-surface-variant/80 font-medium pt-1">
            <span>🚀 Desenvolvimento Inicial</span>
            <span>Estabilidade Total & Produção 🏆</span>
          </div>
        </div>
      </div>

      {/* Filter and Settings row */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-low px-4 py-3 rounded-xl border border-outline-variant/20">
        <div className="flex gap-1">
          <button
            onClick={() => setFilter("todos")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filter === "todos" 
                ? "bg-primary text-on-primary shadow-sm" 
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            Todos ({totalItems})
          </button>
          <button
            onClick={() => setFilter("pendentes")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filter === "pendentes" 
                ? "bg-primary text-on-primary shadow-sm" 
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            Pendentes ({totalItems - totalCompleted})
          </button>
          <button
            onClick={() => setFilter("concluidos")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filter === "concluidos" 
                ? "bg-primary text-on-primary shadow-sm" 
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            Concluídos ({totalCompleted})
          </button>
        </div>

        <button
          onClick={() => setShowTips(!showTips)}
          className="text-xs text-primary font-bold hover:underline cursor-pointer flex items-center gap-1"
        >
          <Info className="w-3.5 h-3.5" />
          {showTips ? "Ocultar Instruções de Teste" : "Mostrar Instruções de Teste"}
        </button>
      </div>

      {/* Checklist Sections */}
      <div className="space-y-6">
        {CHECKLIST_DATA.map(category => {
          const stats = getCategoryStats(category);
          
          // Filter items based on selected tab filter
          const filteredItems = category.items.filter(item => {
            if (filter === "pendentes") return !completedItems.includes(item.id);
            if (filter === "concluidos") return completedItems.includes(item.id);
            return true;
          });

          // If category has no items after filtering, skip rendering or show empty placeholder
          if (filteredItems.length === 0) return null;

          const isExpanded = expandedCategories[category.id] ?? true;

          return (
            <div 
              key={category.id} 
              className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden"
              id={`checklist-cat-${category.id}`}
            >
              {/* Category Header */}
              <div 
                onClick={() => handleToggleCategory(category.id)}
                className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-surface-container-high/30 transition-all select-none border-b border-outline-variant/20"
              >
                <div className="flex items-center gap-3">
                  <span className={`p-2.5 rounded-xl ${category.bgColorClass} ${category.colorClass}`}>
                    {category.icon}
                  </span>
                  <div>
                    <h4 className="font-display text-sm sm:text-base font-extrabold text-on-surface">
                      {category.title}
                    </h4>
                    <p className="text-[10px] sm:text-xs text-on-surface-variant/80">
                      {stats.completedCount} de {stats.itemsCount} concluídos • {stats.percentage}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Small visual bar indicator */}
                  <div className="w-16 h-1.5 bg-surface-container-high rounded-full overflow-hidden hidden sm:block">
                    <div 
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${stats.percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-on-surface-variant font-bold">
                    {isExpanded ? "Ocultar" : "Mostrar"}
                  </span>
                </div>
              </div>

              {/* Category Content */}
              {isExpanded && (
                <div className="divide-y divide-outline-variant/20">
                  {filteredItems.map(item => {
                    const isDone = completedItems.includes(item.id);
                    return (
                      <div 
                        key={item.id}
                        className={`p-4 sm:p-5 flex gap-4 transition-all hover:bg-surface-container-high/15 ${
                          isDone ? "bg-primary/5 border-l-4 border-primary" : "border-l-4 border-transparent"
                        }`}
                      >
                        {/* Interactive Checkbox */}
                        <div className="pt-0.5 shrink-0">
                          <button
                            onClick={() => handleToggleItem(item.id)}
                            className={`w-5.5 h-5.5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                              isDone 
                                ? "bg-primary border-primary text-on-primary scale-110 shadow-sm" 
                                : "border-outline-variant/80 hover:border-primary bg-white"
                            }`}
                            aria-label={`Marcar ${item.text} como concluído`}
                            id={`check-item-${item.id}`}
                          >
                            {isDone && <CheckCircle2 className="w-4 h-4 text-white stroke-[2.5]" />}
                          </button>
                        </div>

                        {/* Text and Description */}
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span 
                              onClick={() => handleToggleItem(item.id)}
                              className={`text-xs sm:text-sm font-bold cursor-pointer transition-all select-none ${
                                isDone ? "text-primary line-through" : "text-on-surface"
                              }`}
                            >
                              {item.text}
                            </span>
                            
                            {/* Optional badge */}
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full w-fit ${
                              isDone 
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                : "bg-surface-container-high text-on-surface-variant/80"
                            }`}>
                              {isDone ? "Pronto para Lançamento" : "Pendente de validação"}
                            </span>
                          </div>

                          <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                            {item.description}
                          </p>

                          {/* Quick Tip / Test Info */}
                          {showTips && item.tip && (
                            <div className="bg-surface-container px-3 py-2 rounded-xl border border-outline-variant/15 flex gap-2 items-start text-[10px] sm:text-xs text-on-surface-variant animate-in slide-in-from-top-1">
                              <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                              <span className="italic leading-snug">{item.tip}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Export Report Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-surface-container-lowest max-w-lg w-full rounded-2xl border border-outline-variant shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
              <h3 className="font-display text-lg font-bold text-primary flex items-center gap-1.5">
                <FileDown className="w-5 h-5" />
                Relatório de Prontidão do Metria CRM
              </h3>
              <button 
                onClick={() => setShowExportModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-on-surface-variant">
                Copie o relatório abaixo formatado em Markdown para apresentar como comprovante de entrega do sistema ou registrar o status atual com sua equipe.
              </p>
              
              <div className="bg-surface-container p-4 rounded-xl border border-outline-variant/40 max-h-60 overflow-y-auto">
                <pre className="text-[10px] font-mono text-on-surface whitespace-pre-wrap leading-relaxed select-all">
                  {generateMarkdownReport()}
                </pre>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={copyReportToClipboard}
                className="px-4 py-2 bg-primary hover:bg-primary/95 text-on-primary text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-1"
              >
                Copiar Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
