import React from "react";
import {
  ArrowRight,
  Calendar,
  Check,
  DollarSign,
  Home,
  Layers,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: (register: boolean) => void;
  onStartDemo: () => void;
}

export default function LandingPage({
  onGetStarted,
  onStartDemo,
}: LandingPageProps) {
  const scrollToId = (id: string) => {
    const element = document.getElementById(id);

    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/2 -left-32 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-outline-variant/20 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
              <Home className="h-5 w-5" />
            </div>

            <div className="text-left">
              <p className="font-display text-lg font-black leading-none text-on-surface">
                Metria CRM
              </p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Real Estate OS
              </p>
            </div>
          </button>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-on-surface-variant md:flex">
            <button
              type="button"
              onClick={() => scrollToId("beneficios")}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Benefícios
            </button>

            <button
              type="button"
              onClick={() => scrollToId("para-quem")}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Para quem é
            </button>

            <button
              type="button"
              onClick={() => scrollToId("planos")}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Planos
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onGetStarted(false)}
              className="hidden rounded-lg px-3 py-2 text-xs font-bold text-on-surface-variant transition-all hover:bg-surface-container-low hover:text-primary sm:inline-flex"
            >
              Entrar
            </button>

            <button
              type="button"
              onClick={onStartDemo}
              className="rounded-xl border border-outline-variant/40 px-4 py-2 text-xs font-extrabold text-on-surface transition-all hover:bg-surface-container-low"
            >
              Demo grátis
            </button>

            <button
              type="button"
              onClick={() => onGetStarted(true)}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white shadow-md shadow-primary/10 transition-all hover:opacity-95 active:scale-[0.98]"
            >
              Começar agora
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-4 w-4" />
              Organização inteligente para corretores
            </div>

            <h1 className="font-display text-4xl font-black tracking-tight text-on-surface sm:text-5xl lg:text-6xl">
              O CRM imobiliário para o corretor não perder nenhuma oportunidade.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-on-surface-variant sm:text-lg">
              Organize leads, imóveis, visitas, propostas e follow-ups em uma
              plataforma simples, moderna e feita para a rotina comercial do
              mercado imobiliário.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onGetStarted(true)}
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/95 active:scale-[0.98]"
              >
                Começar agora
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={onStartDemo}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-outline-variant/40 bg-white px-7 py-3.5 text-sm font-black text-on-surface shadow-sm transition-all hover:bg-surface-container-low"
              >
                Ver demonstração
              </button>
            </div>

            <p className="mt-5 text-xs font-semibold text-on-surface-variant">
              Experimente de graça • Sem cartão de crédito • Atendimento
              prioritário no Beta
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-outline-variant/20 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-low px-5 py-4">
                <div>
                  <p className="text-xs font-bold text-on-surface-variant">
                    Painel de Controle • Metria CRM
                  </p>
                  <p className="mt-1 text-lg font-black text-on-surface">
                    Rotina organizada
                  </p>
                </div>

                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
              </div>

              <div className="space-y-4 p-5">
                <DashboardPreviewCard
                  title="Leads de hoje"
                  name="Mariana Silva"
                  status="Aguardando contato"
                  description="Busca apto 3 dorms em região valorizada"
                  footer="Orçamento: R$ 1.2M • Follow-up hoje"
                  icon={<Users className="h-5 w-5" />}
                />

                <DashboardPreviewCard
                  title="Última proposta"
                  name="Rafael Couto"
                  status="Em negociação"
                  description="Apartamento Edifício Jardim América"
                  footer="Proposta: R$ 890k • Comissão: R$ 53.4k"
                  icon={<DollarSign className="h-5 w-5" />}
                />

                <DashboardPreviewCard
                  title="Visita agendada"
                  name="Dra. Clara Mendes"
                  status="Confirmada"
                  description="Cobertura duplex"
                  footer="Quarta-feira, 15:00"
                  icon={<Calendar className="h-5 w-5" />}
                />
              </div>
            </div>
          </div>
        </section>

        <section id="beneficios" className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-primary">
                A solução para seu dia a dia
              </p>

              <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-on-surface sm:text-4xl">
                Acompanhe cada etapa com total tranquilidade
              </h2>

              <p className="mt-4 text-base leading-8 text-on-surface-variant">
                O corretor não perde mais leads, visitas, propostas e follow-ups.
                O Metria centraliza o que realmente importa para você saber quem
                atender hoje.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <BenefitCard
                icon={<Users className="h-5 w-5" />}
                title="Controle seus leads"
                description="Cadastre potenciais clientes, registre preferências, orçamento, bairros de interesse e status imediato."
              />

              <BenefitCard
                icon={<Calendar className="h-5 w-5" />}
                title="Acompanhe follow-ups"
                description="Crie tarefas, telefonemas, visitas e lembretes vinculados a cada cliente para manter negociações aquecidas."
              />

              <BenefitCard
                icon={<Layers className="h-5 w-5" />}
                title="Organize sua carteira"
                description="Gerencie imóveis com fotos, valores, endereços e informações comerciais em poucos cliques."
              />

              <BenefitCard
                icon={<TrendingUp className="h-5 w-5" />}
                title="Veja visitas e propostas"
                description="Controle a agenda de visitas e registre propostas formais para responder rápido a clientes e proprietários."
              />

              <BenefitCard
                icon={<DollarSign className="h-5 w-5" />}
                title="Comissão potencial visível"
                description="Visualize ganhos estimados com base nas propostas em aberto e priorize as oportunidades mais promissoras."
              />

              <BenefitCard
                icon={<Smartphone className="h-5 w-5" />}
                title="Use no PC e no celular"
                description="Design responsivo para trabalho de escritório, plantão de vendas e atendimento rápido pelo celular."
              />
            </div>
          </div>
        </section>

        <section id="para-quem" className="bg-surface-container-low py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-primary">
                  Público-alvo
                </p>

                <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-on-surface sm:text-4xl">
                  Desenvolvido sob medida para profissionais do mercado
                  imobiliário
                </h2>

                <p className="mt-4 text-base leading-8 text-on-surface-variant">
                  O Metria CRM foi estruturado para simplificar a vida de quem
                  vive o dia a dia acelerado de vendas de propriedades.
                </p>

                <button
                  type="button"
                  onClick={() => onGetStarted(true)}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-black text-primary hover:underline"
                >
                  Cadastre-se grátis e comece agora
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <PersonaCard
                  icon={<Home className="h-5 w-5" />}
                  title="Corretores autônomos"
                  description="Gerencie sua própria carteira de leads e imóveis sem planilhas confusas."
                />

                <PersonaCard
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Parceiros de imobiliárias"
                  description="Complemente sua rotina com controle pessoal eficiente de atendimentos e retornos."
                />

                <PersonaCard
                  icon={<Users className="h-5 w-5" />}
                  title="Pequenas equipes"
                  description="Ambiente ágil para equipes que compartilham leads, plantões e oportunidades."
                />

                <PersonaCard
                  icon={<MessageSquare className="h-5 w-5" />}
                  title="Foco em WhatsApp"
                  description="Templates rápidos e atalhos para conversar com leads sem recomeçar do zero."
                />
              </div>
            </div>
          </div>
        </section>

        <section id="planos" className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-primary">
                Nossos planos
              </p>

              <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-on-surface sm:text-4xl">
                A estrutura certa para cada momento de carreira
              </h2>

              <p className="mt-4 text-base leading-8 text-on-surface-variant">
                Trabalhe com o básico de forma gratuita no Beta ou desbloqueie
                recursos inteligentes para acelerar sua performance.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
              <PricingCard
                eyebrow="Fase de testes"
                title="Plano Beta"
                description="Ideal para quem quer experimentar a interface e a organização inicial."
                price="R$ 0"
                suffix="/mês"
                buttonLabel="Cadastrar grátis"
                onClick={() => onGetStarted(true)}
                features={[
                  "Limite de 10 leads ativos",
                  "Cadastro de até 5 imóveis",
                  "Pipeline Kanban simplificado",
                  "Registro de tarefas básico",
                ]}
              />

              <PricingCard
                eyebrow="Produtividade"
                title="Plano Start"
                description="O essencial para o corretor independente focar em seus fechamentos."
                price="R$ 39,90"
                suffix="/mês"
                buttonLabel="Escolher Plano Start"
                onClick={() => onGetStarted(true)}
                highlighted
                features={[
                  "Leads e clientes ilimitados",
                  "Imóveis ilimitados",
                  "Atalhos e templates WhatsApp",
                  "Agenda integrada e tarefas",
                ]}
              />

              <PricingCard
                eyebrow="Mais vendido"
                title="Plano Pro"
                description="IA integrada e inteligência de cruzamento para maximizar seus ganhos."
                price="R$ 79,90"
                suffix="/mês"
                buttonLabel="Experimentar Plano Pro"
                onClick={() => onGetStarted(true)}
                recommended
                highlighted
                features={[
                  "Tudo do Plano Start",
                  "IA Gemini para descrições",
                  "Cruzamento inteligente de imóveis",
                  "Relatórios financeiros de comissão",
                ]}
              />

              <PricingCard
                eyebrow="Para equipes"
                title="Plano Max"
                description="Perfeito para imobiliárias em expansão gerenciarem seus corretores."
                price="R$ 149,90"
                suffix="/mês"
                buttonLabel="Falar com vendas"
                onClick={() => onGetStarted(true)}
                features={[
                  "Tudo do Plano Pro",
                  "Até 5 corretores integrados",
                  "Painel de controle do gestor",
                  "Distribuição inteligente de leads",
                ]}
              />

              <PricingCard
                eyebrow="Grandes imobiliárias"
                title="Plano PRO MAX"
                description="Para imobiliárias maiores, redes e operações comerciais com gestão avançada."
                price="R$ 999,00"
                suffix="/mês"
                buttonLabel="Falar com vendas"
                onClick={() => onGetStarted(true)}
                premium
                features={[
                  "Tudo do Plano Max",
                  "Até 30 corretores integrados",
                  "Múltiplos gestores e administradores",
                  "Relatórios avançados de BI",
                  "Painel gestor premium",
                ]}
              />
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-primary py-20 text-white">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

          <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
            <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
              Comece a organizar sua rotina comercial com o Metria CRM.
            </h2>

            <p className="mt-5 text-base leading-8 text-white/85">
              Elimine as planilhas lentas, jogue fora os papéis e tenha o
              controle do seu negócio imobiliário na palma da mão. Não deixe
              nenhuma comissão escapar por falta de retorno.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onGetStarted(true)}
                className="rounded-2xl bg-white px-8 py-3.5 text-sm font-black text-primary shadow-lg transition-all hover:bg-white/95 active:scale-[0.98]"
              >
                Criar conta gratuita
              </button>

              <button
                type="button"
                onClick={onStartDemo}
                className="rounded-2xl border border-white/30 px-8 py-3.5 text-sm font-black text-white transition-all hover:bg-white/10 active:scale-[0.98]"
              >
                Ver demonstração imediata
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant/20 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-on-surface-variant md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-black text-on-surface">Metria CRM</p>
            <p className="mt-1">
              Acompanhe cada oportunidade de perto, do primeiro contato ao
              fechamento.
            </p>
          </div>

          <p>
            Metria CRM Beta • Projetado para corretores de imóveis de alta
            performance • {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}

interface DashboardPreviewCardProps {
  title: string;
  name: string;
  status: string;
  description: string;
  footer: string;
  icon: React.ReactNode;
}

function DashboardPreviewCard({
  title,
  name,
  status,
  description,
  footer,
  icon,
}: DashboardPreviewCardProps) {
  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-on-surface-variant">
              {title}
            </p>

            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
              {status}
            </span>
          </div>

          <p className="mt-2 font-black text-on-surface">{name}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
          <p className="mt-3 text-xs font-bold text-primary">{footer}</p>
        </div>
      </div>
    </div>
  );
}

interface BenefitCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function BenefitCard({ icon, title, description }: BenefitCardProps) {
  return (
    <div className="rounded-3xl border border-outline-variant/20 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>

      <h3 className="mt-5 font-display text-lg font-black text-on-surface">
        {title}
      </h3>

      <p className="mt-3 text-sm leading-6 text-on-surface-variant">
        {description}
      </p>
    </div>
  );
}

interface PersonaCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function PersonaCard({ icon, title, description }: PersonaCardProps) {
  return (
    <div className="rounded-3xl border border-outline-variant/20 bg-white p-6 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>

      <h3 className="mt-4 font-display text-lg font-black text-on-surface">
        {title}
      </h3>

      <p className="mt-3 text-sm leading-6 text-on-surface-variant">
        {description}
      </p>
    </div>
  );
}

interface PricingCardProps {
  eyebrow: string;
  title: string;
  description: string;
  price: string;
  suffix: string;
  features: string[];
  buttonLabel: string;
  onClick: () => void;
  highlighted?: boolean;
  recommended?: boolean;
  premium?: boolean;
}

function PricingCard({
  eyebrow,
  title,
  description,
  price,
  suffix,
  features,
  buttonLabel,
  onClick,
  highlighted = false,
  recommended = false,
  premium = false,
}: PricingCardProps) {
  const borderClass = premium
    ? "border-amber-300 hover:border-amber-400"
    : highlighted
      ? "border-primary/40 hover:border-primary"
      : "border-outline-variant/20 hover:border-primary/40";

  const buttonClass = premium
    ? "bg-amber-500 text-white hover:bg-amber-600"
    : highlighted
      ? "bg-primary text-white hover:opacity-95"
      : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest";

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ${borderClass}`}
    >
      {recommended ? (
        <div className="absolute right-0 top-0 rounded-bl-2xl bg-primary px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white">
          Recomendado
        </div>
      ) : null}

      {premium ? (
        <div className="absolute right-0 top-0 rounded-bl-2xl bg-amber-500 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white">
          Premium
        </div>
      ) : null}

      <div>
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
            premium
              ? "bg-amber-100 text-amber-800"
              : "bg-primary/10 text-primary"
          }`}
        >
          {eyebrow}
        </span>

        <h3 className="mt-4 font-display text-lg font-black text-on-surface">
          {title}
        </h3>

        <p className="mt-2 min-h-[54px] text-xs leading-5 text-on-surface-variant">
          {description}
        </p>

        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-3xl font-black text-on-surface">{price}</span>
          <span className="text-xs font-semibold text-on-surface-variant">
            {suffix}
          </span>
        </div>

        <div className="mt-5 space-y-3 border-t border-outline-variant/20 pt-5">
          {features.map((feature) => (
            <div
              key={feature}
              className="flex items-start gap-2 text-xs leading-5 text-on-surface-variant"
            >
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        className={`mt-6 w-full rounded-xl px-4 py-2.5 text-center text-xs font-black transition-all active:scale-[0.98] ${buttonClass}`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
