import React from "react";
import { motion } from "motion/react";
import { 
  Check, 
  Sparkles, 
  Home, 
  ArrowRight, 
  Users, 
  Calendar, 
  TrendingUp, 
  Smartphone, 
  Laptop, 
  MessageSquare, 
  ShieldCheck, 
  Layers,
  ChevronRight,
  Zap,
  Star,
  DollarSign
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: (register: boolean) => void;
  onStartDemo: () => void;
}

export default function LandingPage({ onGetStarted, onStartDemo }: LandingPageProps) {
  // Navigation links helper for smooth auto-scroll inside the page
  const scrollToId = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans overflow-x-hidden flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* Decorative background visual ambient lights */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none -translate-y-12"></div>
      <div className="absolute top-[800px] right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/10">
              <Home className="w-5 h-5 text-white" />
            </div>
            <span className="font-display text-lg font-black text-primary tracking-tight">Metria CRM</span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-on-surface-variant">
            <button onClick={() => scrollToId("beneficios")} className="hover:text-primary transition-colors cursor-pointer">Benefícios</button>
            <button onClick={() => scrollToId("para-quem")} className="hover:text-primary transition-colors cursor-pointer">Para Quem é</button>
            <button onClick={() => scrollToId("planos")} className="hover:text-primary transition-colors cursor-pointer">Planos</button>
          </nav>

          {/* Nav Actions */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onGetStarted(false)} 
              className="text-xs font-bold text-on-surface-variant hover:text-primary transition-all px-3 py-1.5 rounded-lg hover:bg-surface-container-low cursor-pointer"
            >
              Entrar
            </button>
            <button 
              onClick={onStartDemo}
              className="hidden sm:inline-flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/15 active:scale-[0.98] font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              Demo Grátis
            </button>
            <button 
              onClick={() => onGetStarted(true)}
              className="bg-primary hover:opacity-95 active:scale-[0.98] text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md shadow-primary/10 transition-all cursor-pointer"
            >
              Começar agora
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-12 pb-16 sm:py-20 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="space-y-6">
          {/* Tagline Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-[10px] tracking-wider uppercase"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Organização Inteligente para Corretores
          </motion.div>

          {/* Hero Headline */}
          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-3xl sm:text-5xl font-black text-on-surface tracking-tight max-w-3xl mx-auto leading-[1.12]"
          >
            O CRM imobiliário para o corretor <span className="text-primary">não perder nenhuma oportunidade.</span>
          </motion.h1>

          {/* Hero Subtitle */}
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-sm sm:text-base text-on-surface-variant max-w-2xl mx-auto leading-relaxed"
          >
            Organize leads, imóveis, visitas, propostas e follow-ups em uma plataforma simples, moderna e totalmente feita para o dinamismo da rotina imobiliária diária.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="pt-4 flex flex-col sm:flex-row justify-center items-center gap-3"
          >
            <button 
              onClick={() => onGetStarted(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary/95 active:scale-[0.98] text-white font-black text-sm px-7 py-3.5 rounded-2xl shadow-lg shadow-primary/20 transition-all cursor-pointer group"
            >
              Começar agora
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={onStartDemo}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-on-surface font-extrabold text-sm px-7 py-3.5 rounded-2xl transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4 text-primary" />
              Ver demonstração
            </button>
          </motion.div>

          {/* Real-time statistics indicator with premium aesthetic */}
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-[11px] text-on-surface-variant/70 font-semibold"
          >
            ✨ Experimente de graça • Sem cartão de crédito necessário • Atendimento prioritário no Beta
          </motion.p>
        </div>

        {/* Hero Interactive Mockup Snapshot */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-12 sm:mt-16 bg-surface-container rounded-3xl p-3 sm:p-4 border border-outline-variant/20 shadow-2xl relative overflow-hidden group hover:border-primary/20 transition-all"
        >
          <div className="bg-background rounded-2xl p-4 sm:p-6 text-left space-y-4">
            {/* Mockup Header bar */}
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
                <span className="text-[10px] text-on-surface-variant/60 font-mono ml-2">Painel de Controle • Metria CRM</span>
              </div>
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">Rotina Organizada</span>
            </div>

            {/* Mockup content columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10 space-y-3">
                <span className="text-[9px] font-bold text-primary uppercase tracking-wider block">Leads de Hoje</span>
                <div className="bg-white rounded-lg p-3 border border-outline-variant/15 space-y-1 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-on-surface">Mariana Silva</span>
                    <span className="text-[8px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">Aguardando Contato</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant">Buscar apto 3 dorms em Pinheiros</p>
                  <div className="pt-2 flex justify-between items-center text-[9px] text-on-surface-variant/80 border-t border-outline-variant/10 mt-2">
                    <span>Orçamento: R$ 1.2M</span>
                    <span className="text-primary font-bold">Follow-up hoje</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10 space-y-3">
                <span className="text-[9px] font-bold text-primary uppercase tracking-wider block">Última Proposta</span>
                <div className="bg-white rounded-lg p-3 border border-outline-variant/15 space-y-1 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-on-surface">Rafael Couto</span>
                    <span className="text-[8px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">Em negociação</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant">Apartamento Edifício Jardim América</p>
                  <div className="pt-2 flex justify-between items-center text-[9px] text-on-surface-variant/80 border-t border-outline-variant/10 mt-2">
                    <span>Proposta: R$ 890k</span>
                    <span className="text-emerald-600 font-bold">Comissão: R$ 53.4k</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10 space-y-3">
                <span className="text-[9px] font-bold text-primary uppercase tracking-wider block">Visita agendada</span>
                <div className="bg-white rounded-lg p-3 border border-outline-variant/15 space-y-1 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-on-surface">Dra. Clara Mendes</span>
                    <span className="text-[8px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">Agendada</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant">Cobertura duplex em Itaim Bibi</p>
                  <div className="pt-2 flex justify-between items-center text-[9px] text-on-surface-variant/80 border-t border-outline-variant/10 mt-2">
                    <span>Quarta-feira, 15:00</span>
                    <span className="text-primary font-bold">Confirmada</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* BENEFITS SECTION */}
      <section id="beneficios" className="bg-surface-container-lowest py-16 sm:py-24 border-t border-b border-outline-variant/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-3 mb-12 sm:mb-16">
            <span className="text-[10px] bg-primary/10 text-primary font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
              A Solução para seu Dia a Dia
            </span>
            <h2 className="font-display text-2xl sm:text-4xl font-black text-on-surface tracking-tight">
              Acompanhe cada etapa com total tranquilidade
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant max-w-xl mx-auto leading-relaxed">
              O corretor não perde mais leads, visitas, propostas e follow-ups. O Metria centraliza o que realmente importa para que você saiba quem atender hoje.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Benefit 1 */}
            <div className="bg-white border border-outline-variant/20 p-6 rounded-2xl hover:border-primary/20 hover:shadow-lg transition-all space-y-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-on-surface text-base">Controle seus leads</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Cadastre potenciais clientes de forma simples e detalhada. Registre preferências de orçamento, bairros de interesse e status imediato para um funil de vendas sob controle absoluto.
                </p>
              </div>
            </div>

            {/* Benefit 2 */}
            <div className="bg-white border border-outline-variant/20 p-6 rounded-2xl hover:border-primary/20 hover:shadow-lg transition-all space-y-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-on-surface text-base">Acompanhe follow-ups</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Crie tarefas, telefonemas, visitas ou e-mails de acompanhamento vinculados a cada cliente. Veja avisos inteligentes e lembre-se de cada ponto de contato para manter negociações aquecidas.
                </p>
              </div>
            </div>

            {/* Benefit 3 */}
            <div className="bg-white border border-outline-variant/20 p-6 rounded-2xl hover:border-primary/20 hover:shadow-lg transition-all space-y-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Home className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-on-surface text-base">Organize sua carteira</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Gerencie seus imóveis com facilidade. Insira fotos, valores, endereços e taxas de condomínio, cruzando-os instantaneamente com os perfis de busca dos seus leads ativos.
                </p>
              </div>
            </div>

            {/* Benefit 4 */}
            <div className="bg-white border border-outline-variant/20 p-6 rounded-2xl hover:border-primary/20 hover:shadow-lg transition-all space-y-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-on-surface text-base">Veja visitas e propostas</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Controle a agenda física de visitas e registre propostas formais em tempo real. Veja o andamento de cada proposta para dar respostas rápidas aos proprietários e compradores.
                </p>
              </div>
            </div>

            {/* Benefit 5 */}
            <div className="bg-white border border-outline-variant/20 p-6 rounded-2xl hover:border-primary/20 hover:shadow-lg transition-all space-y-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-on-surface text-base">Comissão potencial visível</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                   Visualize seu ganho financeiro estimado com base nas comissões de propostas em aberto. Planeje sua receita futura e sinta-se motivado a focar nas negociações mais promissoras.
                </p>
              </div>
            </div>

            {/* Benefit 6 */}
            <div className="bg-white border border-outline-variant/20 p-6 rounded-2xl hover:border-primary/20 hover:shadow-lg transition-all space-y-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center flex-row gap-0.5">
                <Smartphone className="w-4 h-4" />
                <Laptop className="w-4 h-4" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-on-surface text-base">Use no PC e no Celular</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Design responsivo pensado tanto para o trabalho concentrado de escritório em telas grandes quanto para o envio rápido de mensagens via WhatsApp do seu celular no meio da rua.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PERSONA SECTION */}
      <section id="para-quem" className="py-16 sm:py-24 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 space-y-4 text-left">
            <span className="text-[10px] bg-primary/10 text-primary font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
              Público Alvo
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-black text-on-surface tracking-tight leading-tight">
              Desenvolvido sob medida para profissionais do mercado imobiliário
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              O Metria CRM foi estruturado para simplificar a vida de quem vive o dia a dia acelerado de vendas de propriedades, garantindo agilidade e eliminação da desorganização.
            </p>
            <div className="pt-2">
              <button 
                onClick={() => onGetStarted(true)}
                className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline group cursor-pointer"
              >
                Cadastre-se grátis e comece agora
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Persona 1 */}
            <div className="bg-surface-container-low border border-outline-variant/30 p-5 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-primary/5 text-primary rounded-xl mt-0.5 shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="font-display font-bold text-on-surface text-xs sm:text-sm">Corretores Autônomos</h4>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Gerencie sua própria carteira de leads e imóveis com total independência e sem planilhas confusas ou blocos de notas de papel.
                </p>
              </div>
            </div>

            {/* Persona 2 */}
            <div className="bg-surface-container-low border border-outline-variant/30 p-5 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-primary/5 text-primary rounded-xl mt-0.5 shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="font-display font-bold text-on-surface text-xs sm:text-sm">Parceiros de Imobiliárias</h4>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Complemente o sistema da imobiliária com um controle pessoal eficiente de atendimentos rápidos e retornos de leads no WhatsApp.
                </p>
              </div>
            </div>

            {/* Persona 3 */}
            <div className="bg-surface-container-low border border-outline-variant/30 p-5 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-primary/5 text-primary rounded-xl mt-0.5 shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="font-display font-bold text-on-surface text-xs sm:text-sm">Pequenas Equipes</h4>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Ambiente ágil para equipes que compartilham contatos de leads, plantões de venda e desejam agilizar a passagem de oportunidades.
                </p>
              </div>
            </div>

            {/* Persona 4 */}
            <div className="bg-surface-container-low border border-outline-variant/30 p-5 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-primary/5 text-primary rounded-xl mt-0.5 shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="font-display font-bold text-on-surface text-xs sm:text-sm">Foco em WhatsApp</h4>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Gere templates rápidos e atalhos diretos de mensagens para conversar com seus leads sem precisar digitar os textos do zero toda vez.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING PLANS SECTION */}
      <section id="planos" className="bg-surface-container-lowest py-16 sm:py-24 border-t border-b border-outline-variant/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-3 mb-12 sm:mb-16">
            <span className="text-[10px] bg-primary/10 text-primary font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
              Nossos Planos
            </span>
            <h2 className="font-display text-2xl sm:text-4xl font-black text-on-surface tracking-tight">
              A estrutura certa para cada momento de carreira
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant max-w-xl mx-auto leading-relaxed">
              Trabalhe com o básico de forma totalmente gratuita no Beta ou desbloqueie potencial e recursos inteligentes para impulsionar sua performance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Plan 1: Beta */}
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-primary/20 transition-all shadow-sm">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Fase de Testes</span>
                  <h3 className="font-display text-lg font-bold text-on-surface">Plano Beta</h3>
                  <p className="text-[11px] text-on-surface-variant">Ideal para quem quer experimentar a interface e a organização inicial.</p>
                </div>
                <div className="pt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-on-surface">R$ 0</span>
                  <span className="text-xs text-on-surface-variant font-medium">/mês</span>
                </div>
                <div className="border-t border-outline-variant/15 pt-4 space-y-2 text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Limite de 10 leads ativos</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Cadastro de até 5 imóveis</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Pipeline Kanban simplificado</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Registro de tarefas básico</div>
                </div>
              </div>
              <button 
                onClick={() => onGetStarted(true)}
                className="w-full mt-6 py-2.5 bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-on-surface text-xs font-bold rounded-xl transition-all cursor-pointer text-center"
              >
                Cadastrar Grátis
              </button>
            </div>

            {/* Plan 2: Start */}
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-primary/20 transition-all shadow-sm">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Produtividade</span>
                  <h3 className="font-display text-lg font-bold text-on-surface">Plano Start</h3>
                  <p className="text-[11px] text-on-surface-variant">O essencial para o corretor independente focar em seus fechamentos.</p>
                </div>
                <div className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-primary">R$ 39,90</span>
                    <span className="text-xs text-on-surface-variant font-medium">/mês</span>
                  </div>
                </div>
                <div className="border-t border-outline-variant/15 pt-4 space-y-2 text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Leads e clientes ilimitados</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Imóveis ilimitados</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Atalhos e templates WhatsApp</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Agenda integrada e tarefas</div>
                </div>
              </div>
              <button 
                onClick={() => onGetStarted(true)}
                className="w-full mt-6 py-2.5 bg-primary hover:opacity-95 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer text-center"
              >
                Escolher Plano Start
              </button>
            </div>

            {/* Plan 3: Pro (Recommended) */}
            <div className="bg-white border-2 border-primary rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-lg shadow-primary/5">
              <div className="absolute top-0 right-0 bg-primary text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                Recomendado
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Mais Vendido</span>
                  <h3 className="font-display text-lg font-bold text-on-surface">Plano Pro</h3>
                  <p className="text-[11px] text-on-surface-variant">IA integrada e inteligência de cruzamento para maximizar seus ganhos.</p>
                </div>
                <div className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-primary">R$ 79,90</span>
                    <span className="text-xs text-on-surface-variant font-medium">/mês</span>
                  </div>
                </div>
                <div className="border-t border-outline-variant/15 pt-4 space-y-2 text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> <strong>Tudo do Plano Start</strong></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> IA Gemini para descrições</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Cruzamento inteligente de imóvel</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Relatórios financeiros de comissão</div>
                </div>
              </div>
              <button 
                onClick={() => onGetStarted(true)}
                className="w-full mt-6 py-2.5 bg-primary hover:opacity-95 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer text-center"
              >
                Experimentar Plano Pro
              </button>
            </div>

            {/* Plan 4: Max */}
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-primary/20 transition-all shadow-sm">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-semibold">Para Equipes</span>
                  <h3 className="font-display text-lg font-bold text-on-surface">Plano Max</h3>
                  <p className="text-[11px] text-on-surface-variant">Perfeito para imobiliárias em expansão gerenciarem seus corretores.</p>
                </div>
                <div className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-on-surface">R$ 149,90</span>
                    <span className="text-xs text-on-surface-variant font-medium">/mês</span>
                  </div>
                </div>
                <div className="border-t border-outline-variant/15 pt-4 space-y-2 text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> <strong>Tudo do Plano Pro</strong></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Até 5 corretores integrados</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Painel de controle do gestor</div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Distribuição inteligente de leads</div>
                </div>
              </div>
              <button 
                onClick={() => onGetStarted(true)}
                className="w-full mt-6 py-2.5 bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-on-surface text-xs font-bold rounded-xl transition-all cursor-pointer text-center"
              >
                Falar com Vendas
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA SECTION */}
      <section className="bg-gradient-to-br from-primary via-primary to-emerald-950 text-white py-16 sm:py-20 relative overflow-hidden">
        {/* Subtle abstract background art */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none translate-x-12 -translate-y-12"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none -translate-x-12 translate-y-12"></div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6 relative z-10">
          <h2 className="font-display text-2xl sm:text-4xl font-black tracking-tight leading-tight max-w-2xl mx-auto">
            Comece a organizar sua rotina comercial com o Metria CRM.
          </h2>
          <p className="text-xs sm:text-sm text-white/80 max-w-lg mx-auto leading-relaxed">
            Elimine as planilhas lentas, jogue fora os papéis e tenha o controle do seu negócio imobiliário na palma da mão. Não deixe nenhuma comissão escapar por falta de retorno.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
            <button 
              onClick={() => onGetStarted(true)}
              className="w-full sm:w-auto bg-white hover:bg-white/95 text-primary font-black text-sm px-8 py-3.5 rounded-2xl shadow-lg transition-all cursor-pointer"
            >
              Criar Conta Gratuita
            </button>
            <button 
              onClick={onStartDemo}
              className="w-full sm:w-auto bg-primary-container/20 border border-white/20 hover:bg-white/10 text-white font-bold text-sm px-8 py-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Ver demonstração imediata
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-surface-container-lowest border-t border-outline-variant/10 py-10 text-xs text-on-surface-variant/75 text-center">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <Home className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display font-extrabold text-primary tracking-tight">Metria CRM</span>
          </div>
          <p className="max-w-md mx-auto leading-relaxed text-[11px] text-on-surface-variant/60">
            Acompanhe cada oportunidade de perto, do primeiro contato ao fechamento. Todos os direitos reservados.
          </p>
          <div className="text-[10px] text-on-surface-variant/40 pt-4 border-t border-outline-variant/5">
            Metria CRM Beta • Projetado para corretores de imóveis de alta performance • {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </div>
  );
}
