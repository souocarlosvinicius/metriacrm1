import React, { useMemo, useState } from "react";
import type { AccountType, PlanId, User } from "../types";
import { apiFetch } from "../api";
import {
  formatPlanPrice,
  getMaxMembersByPlan,
  getPlanLimits,
  PLAN_LIMITS,
  PLAN_ORDER,
} from "../config/plans";

type OnboardingAccountOption = "broker" | "agency" | "large_agency";

interface OnboardingModalProps {
  currentUser?: User | null;
  user?: User | null;
  onComplete?: (user: User) => void;
  onOnboardingComplete?: (user: User) => void;
  onFinish?: (user: User) => void;
  onClose?: () => void;
}

const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  beta: "Teste gratuito com limites reduzidos para experimentar o sistema.",
  start: "Plano essencial para corretor independente organizar leads e imóveis.",
  pro: "Plano com IA, cruzamento inteligente e relatórios de comissão.",
  max: "Plano para imobiliárias com equipe de até 5 corretores.",
  pro_max: "Plano avançado para grandes imobiliárias com até 30 corretores.",
};

const RECOMMENDED_PLAN_BY_ACCOUNT: Record<OnboardingAccountOption, PlanId> = {
  broker: "pro",
  agency: "max",
  large_agency: "pro_max",
};

function getAccountTypeFromOption(option: OnboardingAccountOption): AccountType {
  if (option === "broker") {
    return "broker";
  }

  if (option === "agency") {
    return "agency";
  }

  return "team";
}

function getCurrentRoleFromPlan(plan: PlanId): "owner" {
  return "owner";
}

function isCommercialPlan(plan: PlanId): boolean {
  return plan === "max" || plan === "pro_max";
}

export default function OnboardingModal(props: OnboardingModalProps) {
  const currentUser = props.currentUser ?? props.user ?? null;

  const [step, setStep] = useState<1 | 2>(1);
  const [accountOption, setAccountOption] =
    useState<OnboardingAccountOption>("broker");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("pro");

  const [name, setName] = useState(currentUser?.name ?? "");
  const [commercialName, setCommercialName] = useState(
    currentUser?.commercialName ?? "",
  );
  const [organizationName, setOrganizationName] = useState("");
  const [creci, setCreci] = useState(currentUser?.creci ?? "");
  const [phone, setPhone] = useState(
    currentUser?.phone ?? currentUser?.whatsapp ?? "",
  );
  const [city, setCity] = useState(currentUser?.primaryCity ?? "");
  const [stateUf, setStateUf] = useState("");
  const [document, setDocument] = useState("");
  const [billingEmail, setBillingEmail] = useState(currentUser?.email ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const plan = useMemo(() => getPlanLimits(selectedPlan), [selectedPlan]);

  const organizationDisplayName = useMemo(() => {
    const trimmedOrg = organizationName.trim();
    const trimmedCommercial = commercialName.trim();
    const trimmedName = name.trim();

    if (isCommercialPlan(selectedPlan)) {
      return trimmedOrg || trimmedCommercial || "Minha Imobiliária";
    }

    return trimmedCommercial || trimmedName || "Minha Organização";
  }, [commercialName, name, organizationName, selectedPlan]);

  const canGoToStepTwo = useMemo(() => {
    if (!name.trim()) {
      return false;
    }

    if (!phone.trim()) {
      return false;
    }

    if (!city.trim()) {
      return false;
    }

    if (!stateUf.trim()) {
      return false;
    }

    if (isCommercialPlan(selectedPlan) && !organizationName.trim()) {
      return false;
    }

    return true;
  }, [city, name, organizationName, phone, selectedPlan, stateUf]);

  function emitComplete(user: User) {
    if (props.onComplete) {
      props.onComplete(user);
      return;
    }

    if (props.onOnboardingComplete) {
      props.onOnboardingComplete(user);
      return;
    }

    if (props.onFinish) {
      props.onFinish(user);
    }
  }

  function handleAccountOptionChange(option: OnboardingAccountOption) {
    setAccountOption(option);
    setSelectedPlan(RECOMMENDED_PLAN_BY_ACCOUNT[option]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!currentUser?.id && !currentUser?._id) {
      setErrorMessage("Usuário não identificado. Faça login novamente.");
      return;
    }

    if (!canGoToStepTwo) {
      setErrorMessage("Preencha os campos obrigatórios antes de continuar.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const userId = currentUser.id || currentUser._id || "";
    const accountType = getAccountTypeFromOption(accountOption);
    const currentRole = getCurrentRoleFromPlan(selectedPlan);
    const maxMembers = getMaxMembersByPlan(selectedPlan);

    try {
      const organizationPayload = {
        name: organizationDisplayName,
        tradeName: commercialName.trim() || organizationDisplayName,
        document: document.trim() || undefined,
        creci: creci.trim() || undefined,
        phone: phone.trim(),
        email: billingEmail.trim() || currentUser.email,
        city: city.trim(),
        state: stateUf.trim().toUpperCase(),
        ownerId: userId,
        plan: selectedPlan,
        subscriptionStatus: "active",
        subscriptionStartedAt: new Date().toISOString(),
        planUpdatedAt: new Date().toISOString(),
        maxMembers,
        billingEmail: billingEmail.trim() || currentUser.email,
        billingDocument: document.trim() || undefined,
      };

      const organizationResponse = await apiFetch("/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(organizationPayload),
      });

      const organizationData = await organizationResponse.json().catch(() => null);

      if (!organizationResponse.ok) {
        throw new Error(
          organizationData?.error ||
            "Não foi possível criar a organização no Supabase.",
        );
      }

      const organizationId =
        organizationData?.id ||
        organizationData?._id ||
        organizationData?.organization?.id ||
        organizationData?.organization?._id;

      if (!organizationId) {
        throw new Error("A organização foi criada, mas o ID não foi retornado.");
      }

      const profilePayload = {
        name: name.trim(),
        phone: phone.trim(),
        whatsapp: phone.trim(),
        creci: creci.trim() || undefined,
        commercialName: commercialName.trim() || organizationDisplayName,
        primaryCity: `${city.trim()} - ${stateUf.trim().toUpperCase()}`,
        actingType:
          accountOption === "broker"
            ? "Corretor autônomo"
            : accountOption === "agency"
              ? "Imobiliária / Equipe"
              : "Grande imobiliária",
        onboardingCompleted: true,
        defaultOrganizationId: organizationId,
        currentOrganizationId: organizationId,
        organizationId,
        accountType,
        currentRole,
        plan: selectedPlan,
      };

      const updateResponse = await apiFetch(`/api/auth/update/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profilePayload),
      });

      const updateData = await updateResponse.json().catch(() => null);

      if (!updateResponse.ok) {
        throw new Error(
          updateData?.error || "Não foi possível atualizar o perfil do usuário.",
        );
      }

      const meResponse = await apiFetch("/api/auth/me");
      const refreshedUser = meResponse.ok
        ? await meResponse.json()
        : {
            ...currentUser,
            ...profilePayload,
            id: userId,
            email: currentUser.email,
          };

      localStorage.setItem("vega_crm_user", JSON.stringify(refreshedUser));
      emitComplete(refreshedUser);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao concluir o onboarding.";

      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        <div className="border-b border-slate-200 px-6 py-5 md:px-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Configuração inicial
          </p>

          <h1 className="mt-1 text-2xl font-bold text-slate-950 md:text-3xl">
            Seja muito bem-vindo ao Metria CRM
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Vamos configurar sua conta, sua organização e seu plano para que o
            sistema libere os recursos corretos desde o primeiro acesso.
          </p>
        </div>

        <div className="grid gap-0 md:grid-cols-[280px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50 p-6 md:border-b-0 md:border-r">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  step === 1
                    ? "bg-blue-700 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                1. Perfil e operação
              </button>

              <button
                type="button"
                onClick={() => canGoToStepTwo && setStep(2)}
                disabled={!canGoToStepTwo}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  step === 2
                    ? "bg-blue-700 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                } ${!canGoToStepTwo ? "cursor-not-allowed opacity-50" : ""}`}
              >
                2. Plano e confirmação
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                Plano selecionado
              </p>

              <p className="mt-1 text-lg font-bold text-blue-950">
                {plan.name}
              </p>

              <p className="mt-1 text-sm text-blue-800">
                {formatPlanPrice(selectedPlan)}
              </p>

              <p className="mt-2 text-xs leading-5 text-blue-700">
                {PLAN_DESCRIPTIONS[selectedPlan]}
              </p>
            </div>
          </aside>

          <main className="p-6 md:p-8">
            {errorMessage ? (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-6">
                <section>
                  <h2 className="text-xl font-bold text-slate-950">
                    Como você vai usar o Metria?
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    Essa escolha define o plano sugerido e a estrutura inicial da
                    sua organização.
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => handleAccountOptionChange("broker")}
                      className={`rounded-2xl border p-4 text-left transition ${
                        accountOption === "broker"
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      <h3 className="font-semibold text-slate-950">
                        Corretor autônomo
                      </h3>

                      <p className="mt-2 text-sm leading-5 text-slate-600">
                        Para uso individual com foco em leads, imóveis, tarefas e
                        produtividade.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAccountOptionChange("agency")}
                      className={`rounded-2xl border p-4 text-left transition ${
                        accountOption === "agency"
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      <h3 className="font-semibold text-slate-950">
                        Imobiliária ou equipe
                      </h3>

                      <p className="mt-2 text-sm leading-5 text-slate-600">
                        Para equipes com até 5 corretores, gestão de leads e
                        painel do gestor.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAccountOptionChange("large_agency")}
                      className={`rounded-2xl border p-4 text-left transition ${
                        accountOption === "large_agency"
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      <h3 className="font-semibold text-slate-950">
                        Grande imobiliária
                      </h3>

                      <p className="mt-2 text-sm leading-5 text-slate-600">
                        Para operação comercial avançada com até 30 corretores.
                      </p>
                    </button>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-slate-950">
                    Dados principais
                  </h2>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        Seu nome
                      </span>
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        placeholder="Ex.: Carlos Cardoso"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        Nome comercial
                      </span>
                      <input
                        value={commercialName}
                        onChange={(event) =>
                          setCommercialName(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        placeholder="Ex.: Metria Imóveis"
                      />
                    </label>

                    {isCommercialPlan(selectedPlan) ? (
                      <label className="block md:col-span-2">
                        <span className="text-sm font-medium text-slate-700">
                          Nome da imobiliária
                        </span>
                        <input
                          value={organizationName}
                          onChange={(event) =>
                            setOrganizationName(event.target.value)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                          placeholder="Ex.: Metria Corp"
                        />
                      </label>
                    ) : null}

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        CRECI
                      </span>
                      <input
                        value={creci}
                        onChange={(event) => setCreci(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        placeholder="Ex.: 00000-F"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        Telefone / WhatsApp
                      </span>
                      <input
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        placeholder="Ex.: 34 99999-9999"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        Cidade
                      </span>
                      <input
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        placeholder="Ex.: Uberlândia"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        UF
                      </span>
                      <input
                        value={stateUf}
                        onChange={(event) =>
                          setStateUf(event.target.value.toUpperCase().slice(0, 2))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-blue-600"
                        placeholder="Ex.: MG"
                        maxLength={2}
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        CPF ou CNPJ
                      </span>
                      <input
                        value={document}
                        onChange={(event) => setDocument(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        placeholder="Opcional"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        E-mail de cobrança
                      </span>
                      <input
                        type="email"
                        value={billingEmail}
                        onChange={(event) =>
                          setBillingEmail(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        placeholder="financeiro@empresa.com.br"
                      />
                    </label>
                  </div>
                </section>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!canGoToStepTwo}
                    onClick={() => setStep(2)}
                    className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <section>
                  <h2 className="text-xl font-bold text-slate-950">
                    Escolha o plano inicial
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    O plano será salvo na organização. Os usuários vinculados
                    herdam os recursos do plano, respeitando seus cargos.
                  </p>

                  <div className="mt-4 grid gap-3 lg:grid-cols-5">
                    {PLAN_ORDER.map((planId) => {
                      const planItem = PLAN_LIMITS[planId];
                      const isSelected = selectedPlan === planId;

                      return (
                        <button
                          key={planId}
                          type="button"
                          onClick={() => setSelectedPlan(planId)}
                          className={`rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? "border-blue-600 bg-blue-50"
                              : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          <p className="text-sm font-bold text-slate-950">
                            {planItem.displayName}
                          </p>

                          <p className="mt-1 text-sm font-semibold text-blue-700">
                            {formatPlanPrice(planId)}
                          </p>

                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {PLAN_DESCRIPTIONS[planId]}
                          </p>

                          <p className="mt-3 text-xs font-medium text-slate-500">
                            Usuários: {planItem.maxMembers}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="font-semibold text-slate-950">
                    Resumo da configuração
                  </h3>

                  <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Organização</dt>
                      <dd className="font-medium text-slate-950">
                        {organizationDisplayName}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">Plano</dt>
                      <dd className="font-medium text-slate-950">
                        {plan.name} — {formatPlanPrice(selectedPlan)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">Cidade</dt>
                      <dd className="font-medium text-slate-950">
                        {city} - {stateUf.toUpperCase()}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">Limite de membros</dt>
                      <dd className="font-medium text-slate-950">
                        {plan.maxMembers}
                      </dd>
                    </div>
                  </dl>
                </section>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Voltar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting
                      ? "Configurando..."
                      : "Concluir e começar no Metria CRM"}
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </form>
    </div>
  );
}
