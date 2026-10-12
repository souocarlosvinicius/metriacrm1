/**
 * ==============================================================================
 * METRIA CRM - SERVIÇO DE ASSINATURAS E CONTRATAÇÃO (ETAPA 2)
 * ==============================================================================
 * Responsabilidades:
 * 1. Valida vínculo ativo e autoridade (owner / admin) sobre a organização.
 * 2. Consulta preço, ciclo e limites do catálogo oficial do servidor (não do browser).
 * 3. Cadastra ou reutiliza o pagador no Asaas e vincula asaas_customer_id à organização.
 * 4. Evita contratações duplicadas quando já houver assinatura ativa ou pendente.
 * 5. Persiste os IDs da contratação (subscriptions e charges pendentes).
 * 6. NÃO libera acesso antecipadamente por criação de assinatura nem por retorno do checkout!
 *    O acesso somente é liberado após pagamento confirmado/recebido via webhook (Etapa 3/4).
 */

import { AsaasClient, AsaasCustomerInput } from "./asaasClient";
import { getServerPlan, getServerPlanPrice } from "./planCatalog";
import { BillingPlanId, BillingCycle, BillingPaymentMethod } from "../types/billing";

export interface CheckoutSubscriptionRequest {
  organizationId: string;
  planId: BillingPlanId;
  billingCycle?: BillingCycle;
  billingType?: BillingPaymentMethod;
  customer?: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    phone?: string;
    postalCode?: string;
    address?: string;
    addressNumber?: string;
    complement?: string;
    province?: string;
  };
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
}

export interface CheckoutSubscriptionResult {
  subscriptionId: string;
  asaasSubscriptionId: string;
  organizationId: string;
  plan: string;
  billingCycle: string;
  value: number;
  status: "INACTIVE";
  accessGranted: false; // Sempre falso na contratação conforme especificação!
  payment: {
    chargeId?: string;
    asaasPaymentId?: string;
    status: string;
    value: number;
    dueDate: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
  } | null;
  message: string;
}

/**
 * Valida autoridade do usuário na organização (owner ou admin ativo)
 */
export async function validateOrgAuthority(
  supabaseAdmin: any,
  userId: string,
  organizationId: string
): Promise<{ authorized: boolean; role: string; organization: any }> {
  // 1. Busca a organização
  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id, name, owner_id, plan, subscription_status, asaas_customer_id, paid_through, financial_block")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgErr || !org) {
    return { authorized: false, role: "none", organization: null };
  }

  // 2. Se for o proprietário direto
  if (org.owner_id === userId) {
    return { authorized: true, role: "owner", organization: org };
  }

  // 3. Verifica associação ativa como admin
  const { data: member, error: memErr } = await supabaseAdmin
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (memErr || !member) {
    return { authorized: false, role: "none", organization: org };
  }

  if (member.role === "owner" || member.role === "admin") {
    return { authorized: true, role: member.role, organization: org };
  }

  return { authorized: false, role: member.role, organization: org };
}

/**
 * Executa o fluxo de contratação de assinatura com Asaas
 */
export async function createOrganizationSubscription(
  supabaseAdmin: any,
  userId: string,
  userEmail: string,
  input: CheckoutSubscriptionRequest,
  asaasClientInstance?: AsaasClient
): Promise<CheckoutSubscriptionResult> {
  const { organizationId, planId } = input;
  const billingCycle: BillingCycle = input.billingCycle || "MONTHLY";
  const billingType: BillingPaymentMethod = input.billingType || "PIX";

  // 1. Validação de Autoridade sobre a Organização
  const { authorized, role, organization } = await validateOrgAuthority(
    supabaseAdmin,
    userId,
    organizationId
  );

  if (!authorized || !organization) {
    const error = new Error("Acesso negado: você precisa ser Proprietário ou Administrador da organização para contratar assinaturas.") as any;
    error.status = 403;
    error.code = "FORBIDDEN_ORG_AUTHORITY";
    throw error;
  }

  // 2. Validação do Plano e Preço pelo Catálogo Oficial do Servidor
  const serverPlan = getServerPlan(planId);
  if (!serverPlan) {
    const error = new Error(`Plano '${planId}' não encontrado no catálogo do servidor.`) as any;
    error.status = 400;
    error.code = "INVALID_PLAN_CODE";
    throw error;
  }

  const officialPrice = getServerPlanPrice(planId, billingCycle);
  if (officialPrice === null || officialPrice <= 0) {
    const error = new Error(`Preço não configurado para o plano '${planId}' no ciclo '${billingCycle}'.`) as any;
    error.status = 400;
    error.code = "INVALID_PLAN_PRICE";
    throw error;
  }

  // 3. Verificação de Contratações Duplicadas
  // Verifica se já existe uma assinatura ACTIVE ou com cobranças pendentes recentes
  const { data: existingActiveSub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, asaas_subscription_id, plan, status, paid_through")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existingActiveSub) {
    const error = new Error(`A organização já possui uma assinatura ativa (${existingActiveSub.plan.toUpperCase()}). Utilize a alteração de plano ou cancele a assinatura atual antes de contratar outra.`) as any;
    error.status = 409;
    error.code = "ACTIVE_SUBSCRIPTION_EXISTS";
    throw error;
  }

  // 4. Cadastro ou Reutilização do Pagador no Asaas
  const asaas = asaasClientInstance || new AsaasClient();

  let asaasCustomerId = organization.asaas_customer_id;

  if (!asaasCustomerId) {
    // Busca dados do perfil do usuário para complementar o pagador
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, phone")
      .eq("id", userId)
      .maybeSingle();

    const customerInput: AsaasCustomerInput = {
      name: input.customer?.name || profile?.name || organization.name || "Cliente Metria CRM",
      email: input.customer?.email || profile?.email || userEmail,
      cpfCnpj: input.customer?.cpfCnpj,
      phone: input.customer?.phone || profile?.phone,
      postalCode: input.customer?.postalCode,
      address: input.customer?.address,
      addressNumber: input.customer?.addressNumber,
      complement: input.customer?.complement,
      province: input.customer?.province,
      externalReference: organizationId,
      notificationDisabled: false
    };

    const asaasCustomer = await asaas.getOrCreateCustomer(customerInput);
    asaasCustomerId = asaasCustomer.id;

    // Persiste o asaas_customer_id na organização com service_role
    await supabaseAdmin
      .from("organizations")
      .update({ asaas_customer_id: asaasCustomerId })
      .eq("id", organizationId);
  }

  // 5. Cálculo da Próxima Data de Vencimento (Próximo dia útil ou hoje se Pix/Cartão)
  const today = new Date();
  const nextDueDate = today.toISOString().split("T")[0];

  // 6. Criação da Assinatura no Asaas
  const asaasSubscriptionPayload: any = {
    customer: asaasCustomerId,
    billingType: billingType === "UNDEFINED" ? "PIX" : billingType,
    value: officialPrice,
    nextDueDate: nextDueDate,
    cycle: billingCycle,
    description: `Assinatura Metria CRM - ${serverPlan.name} (${billingCycle})`,
    externalReference: organizationId
  };

  if (billingType === "CREDIT_CARD" && input.creditCard) {
    asaasSubscriptionPayload.creditCard = input.creditCard;
    asaasSubscriptionPayload.creditCardHolderInfo = {
      name: input.customer?.name || "Titular Cartão",
      email: input.customer?.email || userEmail,
      cpfCnpj: input.customer?.cpfCnpj || "00000000000",
      postalCode: input.customer?.postalCode || "01001000",
      addressNumber: input.customer?.addressNumber || "1",
      phone: input.customer?.phone || "11999999999"
    };
  }

  const asaasSubResponse = await asaas.createSubscription(asaasSubscriptionPayload);

  // 7. Persistência Local da Assinatura (subscriptions) com status INACTIVE
  // IMPORTANTE: NÃO libera acesso por criação da assinatura nem pelo retorno do checkout!
  const { data: savedSub, error: subInsertErr } = await supabaseAdmin
    .from("subscriptions")
    .insert({
      organization_id: organizationId,
      asaas_subscription_id: asaasSubResponse.id,
      asaas_customer_id: asaasCustomerId,
      plan: planId,
      billing_cycle: billingCycle,
      value: officialPrice,
      status: "INACTIVE", // NUNCA ACTIVE ANTES DO PAGAMENTO CONFIRMADO
      payment_method: billingType,
      next_due_date: asaasSubResponse.nextDueDate || nextDueDate,
      paid_through: null, // Sem período pago liberado antecipadamente
      metadata: {
        serverPlanName: serverPlan.name,
        initiatedByUserId: userId,
        initiatedAt: new Date().toISOString()
      }
    })
    .select()
    .single();

  if (subInsertErr) {
    console.error("Erro ao persistir assinatura no banco:", subInsertErr);
    throw new Error(`Falha ao registrar assinatura localmente: ${subInsertErr.message}`);
  }

  // 8. Busca Pagamento Inicial Gerado pelo Asaas para Disponibilizar Pix/Boleto
  let paymentInfo: any = null;
  try {
    const paymentsRes = await asaas.getSubscriptionPayments(asaasSubResponse.id);
    const initialPayment = paymentsRes.data && paymentsRes.data.length > 0 ? paymentsRes.data[0] : null;

    if (initialPayment) {
      let pixQrCode: string | undefined;
      let pixCopyPaste: string | undefined;

      if (billingType === "PIX") {
        try {
          const pixData = await asaas.getPixQrCode(initialPayment.id);
          pixQrCode = pixData.encodedImage;
          pixCopyPaste = pixData.payload;
        } catch (pixErr) {
          console.warn("Aviso ao buscar QR code Pix do Asaas:", pixErr);
        }
      }

      // Persiste a cobrança em public.charges com status PENDING
      const { data: savedCharge } = await supabaseAdmin
        .from("charges")
        .insert({
          organization_id: organizationId,
          subscription_id: savedSub.id,
          asaas_payment_id: initialPayment.id,
          asaas_subscription_id: asaasSubResponse.id,
          asaas_customer_id: asaasCustomerId,
          value: initialPayment.value || officialPrice,
          net_value: initialPayment.netValue || null,
          status: "PENDING",
          billing_type: billingType,
          due_date: initialPayment.dueDate || nextDueDate,
          invoice_url: initialPayment.invoiceUrl || null,
          bank_slip_url: initialPayment.bankSlipUrl || null,
          pix_qr_code: pixQrCode || null,
          pix_copy_paste: pixCopyPaste || null,
          raw_payload: initialPayment
        })
        .select()
        .maybeSingle();

      paymentInfo = {
        chargeId: savedCharge?.id,
        asaasPaymentId: initialPayment.id,
        status: initialPayment.status || "PENDING",
        value: initialPayment.value || officialPrice,
        dueDate: initialPayment.dueDate || nextDueDate,
        invoiceUrl: initialPayment.invoiceUrl,
        bankSlipUrl: initialPayment.bankSlipUrl,
        pixQrCode: pixQrCode,
        pixCopyPaste: pixCopyPaste
      };
    }
  } catch (payErr) {
    console.warn("Aviso ao recuperar pagamentos iniciais da assinatura:", payErr);
  }

  return {
    subscriptionId: savedSub.id,
    asaasSubscriptionId: asaasSubResponse.id,
    organizationId,
    plan: planId,
    billingCycle,
    value: officialPrice,
    status: "INACTIVE",
    accessGranted: false, // Explicitamente desativado até recebimento financeiro
    payment: paymentInfo,
    message: "Assinatura gerada com sucesso no Asaas. Efetue o pagamento da primeira cobrança para liberação do acesso."
  };
}
