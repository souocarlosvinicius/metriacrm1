import { supabase } from "./lib/supabase";
import type { PlanFeature, PlanId } from "./types";
import {
  canCreateClient,
  canCreateProperty,
  canInviteMember,
  canUseFeature,
  getMaxMembersByPlan,
  getPlanLimits,
} from "./config/plans";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface SessionContext {
  user: any;
  profile: any | null;
  organizationId: string | null;
  organization: any | null;
  role: string;
  plan: PlanId;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function getMethod(init?: RequestInit): HttpMethod {
  return ((init?.method || "GET").toUpperCase() as HttpMethod) || "GET";
}

function getPath(input: RequestInfo | URL): string {
  const raw = input instanceof URL ? input.toString() : String(input);

  if (raw.startsWith("http")) {
    return new URL(raw).pathname;
  }

  return raw.split("?")[0];
}

function getQuery(input: RequestInfo | URL): URLSearchParams {
  const raw = input instanceof URL ? input.toString() : String(input);

  if (raw.startsWith("http")) {
    return new URL(raw).searchParams;
  }

  const queryString = raw.includes("?") ? raw.split("?")[1] : "";
  return new URLSearchParams(queryString);
}

function isExplicitDemoRequest(input: RequestInfo | URL): boolean {
  const query = getQuery(input);
  return query.get("isDemo") === "true" || query.get("demo") === "true";
}

async function readBody(init?: RequestInit): Promise<any> {
  if (!init?.body) {
    return {};
  }

  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body);
    } catch {
      return {};
    }
  }

  return init.body;
}

function makeId(prefix = "id"): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function cleanPayload(payload: Record<string, any>): Record<string, any> {
  const output: Record<string, any> = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      output[key] = value;
    }
  });

  return output;
}

function toSnake(input: Record<string, any>): Record<string, any> {
  const output: Record<string, any> = {};

  Object.entries(input || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    output[snakeKey] = value;
  });

  return output;
}

function toCamel(input: Record<string, any> | null): Record<string, any> {
  if (!input) {
    return {};
  }

  const output: Record<string, any> = {};

  Object.entries(input).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    output[camelKey] = value;
  });

  if (input.id && !output._id) {
    output._id = input.id;
  }

  return output;
}

function getLocalList(key: string): any[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalList(key: string, value: any[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function profileToDb(profile: any): any {
  return cleanPayload({
    id: profile.id || profile._id,
    name: profile.name,
    email: profile.email,
    avatar_url: profile.avatarUrl,
    role: profile.role,
    phone: profile.phone || profile.whatsapp,
    creci: profile.creci,
    commercial_name: profile.commercialName,
    primary_city: profile.primaryCity,
    acting_type: profile.actingType,
    onboarding_completed: profile.onboardingCompleted,
    default_organization_id: profile.defaultOrganizationId,
    current_organization_id:
      profile.currentOrganizationId ||
      profile.organizationId ||
      profile.defaultOrganizationId,
    account_type: profile.accountType,
    current_role: profile.currentRole,
    updated_at: new Date().toISOString(),
  });
}

function organizationToDb(organization: any): any {
  const plan = (organization.plan || "beta") as PlanId;

  return cleanPayload({
    id: organization.id || organization._id,
    name: organization.name,
    trade_name: organization.tradeName,
    document: organization.document,
    creci: organization.creci,
    phone: organization.phone,
    email: organization.email,
    city: organization.city,
    state: organization.state,
    owner_id: organization.ownerId,
    plan,
    subscription_status: organization.subscriptionStatus || "active",
    subscription_started_at:
      organization.subscriptionStartedAt || new Date().toISOString(),
    subscription_expires_at: organization.subscriptionExpiresAt,
    plan_updated_at: organization.planUpdatedAt || new Date().toISOString(),
    max_members: organization.maxMembers ?? getMaxMembersByPlan(plan),
    billing_email: organization.billingEmail,
    billing_document: organization.billingDocument,
    updated_at: new Date().toISOString(),
  });
}

function commercialToDb(payload: any, ctx: SessionContext): any {
  const db = toSnake(payload || {});

  delete db.id;
  delete db._id;
  delete db.created_at;
  delete db.updated_at;

  return cleanPayload({
    ...db,
    user_id: db.user_id || ctx.user.id,
    organization_id: db.organization_id || ctx.organizationId,
    assigned_to: db.assigned_to || ctx.user.id,
    created_by: db.created_by || ctx.user.id,
    updated_at: new Date().toISOString(),
  });
}

function canManageOrganization(role: string): boolean {
  return role === "owner" || role === "admin";
}

function canManageLeads(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

async function getSessionContext(): Promise<SessionContext | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return null;
  }

  const user = userData.user;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  let organizationId =
    profile?.current_organization_id ||
    profile?.default_organization_id ||
    null;

  let member: any | null = null;

  if (!organizationId) {
    const { data: firstMember, error: firstMemberError } = await supabase
      .from("organization_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstMemberError) {
      throw new Error(firstMemberError.message);
    }

    if (firstMember) {
      member = firstMember;
      organizationId = firstMember.organization_id;
    }
  }

  let organization: any | null = null;

  if (organizationId) {
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .maybeSingle();

    if (orgError) {
      throw new Error(orgError.message);
    }

    organization = orgData || null;
  }

  if (organizationId && !member) {
    const { data: memberData, error: memberError } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      throw new Error(memberError.message);
    }

    member = memberData || null;
  }

  const role = member?.role || profile?.current_role || "owner";
  const plan = (organization?.plan || profile?.plan || "beta") as PlanId;

  return {
    user,
    profile,
    organizationId,
    organization,
    role,
    plan,
  };
}

async function getOrganizationUsage(organizationId: string) {
  const [clientsResult, propertiesResult, membersResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "inactive"),

    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),

    supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  return {
    activeClientsCount: clientsResult.count || 0,
    propertiesCount: propertiesResult.count || 0,
    activeMembersCount: membersResult.count || 0,
  };
}

async function validateClientLimit(ctx: SessionContext): Promise<Response | null> {
  if (!ctx.organizationId) {
    return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
  }

  const usage = await getOrganizationUsage(ctx.organizationId);

  if (!canCreateClient(ctx.plan, usage.activeClientsCount)) {
    return jsonResponse(
      {
        error:
          "Seu Plano Beta permite até 10 leads ativos. Para cadastrar mais leads, escolha o Plano Start.",
      },
      403,
    );
  }

  return null;
}

async function validatePropertyLimit(ctx: SessionContext): Promise<Response | null> {
  if (!ctx.organizationId) {
    return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
  }

  const usage = await getOrganizationUsage(ctx.organizationId);

  if (!canCreateProperty(ctx.plan, usage.propertiesCount)) {
    return jsonResponse(
      {
        error:
          "Seu Plano Beta permite até 5 imóveis cadastrados. Para cadastrar mais imóveis, escolha o Plano Start.",
      },
      403,
    );
  }

  return null;
}

async function validateMemberLimit(ctx: SessionContext): Promise<Response | null> {
  if (!ctx.organizationId) {
    return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
  }

  if (!canManageOrganization(ctx.role)) {
    return jsonResponse(
      { error: "Apenas owner ou admin podem convidar membros." },
      403,
    );
  }

  const usage = await getOrganizationUsage(ctx.organizationId);

  if (!canInviteMember(ctx.plan, usage.activeMembersCount)) {
    const plan = getPlanLimits(ctx.plan);

    if (!plan.hasTeamManagement) {
      return jsonResponse(
        { error: "Gestão de equipe está disponível apenas nos planos Max e PRO MAX." },
        403,
      );
    }

    if (ctx.plan === "max") {
      return jsonResponse(
        { error: "O Plano Max permite até 5 corretores integrados." },
        403,
      );
    }

    return jsonResponse(
      { error: "O Plano PRO MAX permite até 30 corretores integrados." },
      403,
    );
  }

  return null;
}

function validateFeature(ctx: SessionContext, feature: PlanFeature): Response | null {
  if (!canUseFeature(ctx.plan, feature)) {
    return jsonResponse(
      { error: "Este recurso não está disponível no seu plano atual." },
      403,
    );
  }

  return null;
}

async function handleAuth(
  path: string,
  method: HttpMethod,
  init?: RequestInit,
): Promise<Response> {
  const body = await readBody(init);

  if (path === "/api/auth/me" && method === "GET") {
    const ctx = await getSessionContext();

    if (!ctx) {
      return jsonResponse({ user: null }, 401);
    }

    return jsonResponse({
      id: ctx.user.id,
      email: ctx.user.email,
      ...toCamel(ctx.profile),
      defaultOrganizationId: ctx.organizationId,
      currentOrganizationId: ctx.organizationId,
      organizationId: ctx.organizationId,
      currentRole: ctx.role,
      plan: ctx.plan,
      organization: ctx.organization ? toCamel(ctx.organization) : null,
    });
  }

  if (path === "/api/auth/login" && method === "POST") {
    const { email, password } = body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return jsonResponse({ error: error.message }, 401);
    }

    localStorage.removeItem("vega_crm_user");

    return jsonResponse({
      success: true,
      user: data.user,
      session: data.session,
    });
  }

  if (path === "/api/auth/register" && method === "POST") {
    const { email, password, name } = body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        profileToDb({
          id: data.user.id,
          email,
          name,
          onboardingCompleted: false,
        }),
      );

      if (profileError) {
        console.warn("Profile upsert after signup failed:", profileError.message);
      }
    }

    return jsonResponse({
      success: true,
      user: data.user,
      session: data.session,
    });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    await supabase.auth.signOut();
    localStorage.removeItem("vega_crm_user");

    return jsonResponse({ success: true });
  }

  if (
    path.startsWith("/api/auth/update/") &&
    (method === "PUT" || method === "PATCH")
  ) {
    const userId = decodeURIComponent(path.replace("/api/auth/update/", ""));
    const ctx = await getSessionContext();

    if (!ctx || ctx.user.id !== userId) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    const dbProfile = profileToDb({
      ...body,
      id: userId,
      email: ctx.user.email,
    });

    const { data, error } = await supabase
      .from("profiles")
      .upsert(dbProfile)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      id: ctx.user.id,
      email: ctx.user.email,
      ...toCamel(data),
    });
  }

  return jsonResponse({ error: "Rota de autenticação não encontrada." }, 404);
}

async function handleOrganizations(
  path: string,
  method: HttpMethod,
  init?: RequestInit,
): Promise<Response> {
  const body = await readBody(init);
  const ctx = await getSessionContext();

  if (!ctx) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }

  if (path === "/api/organizations" && method === "GET") {
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, status, organizations(*)")
      .eq("user_id", ctx.user.id)
      .eq("status", "active");

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(
      (data || []).map((item: any) => ({
        ...toCamel(item.organizations || {}),
        role: item.role,
      })),
    );
  }

  if (path === "/api/organizations" && method === "POST") {
    const plan = (body.plan || "beta") as PlanId;
    const maxMembers = body.maxMembers ?? getMaxMembersByPlan(plan);

    const organizationPayload = organizationToDb({
      ...body,
      ownerId: ctx.user.id,
      plan,
      maxMembers,
      subscriptionStatus: body.subscriptionStatus || "active",
      subscriptionStartedAt:
        body.subscriptionStartedAt || new Date().toISOString(),
      planUpdatedAt: new Date().toISOString(),
    });

    const { data: organization, error } = await supabase
      .from("organizations")
      .insert(organizationPayload)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .upsert({
        organization_id: organization.id,
        user_id: ctx.user.id,
        name: ctx.profile?.name || ctx.user.user_metadata?.name || ctx.user.email,
        email: ctx.user.email,
        role: "owner",
        status: "active",
      });

    if (memberError) {
      return jsonResponse({ error: memberError.message }, 400);
    }

    await supabase.from("profiles").upsert({
      id: ctx.user.id,
      email: ctx.user.email,
      default_organization_id: organization.id,
      current_organization_id: organization.id,
      current_role: "owner",
      account_type: body.accountType || "broker",
      updated_at: new Date().toISOString(),
    });

    return jsonResponse(toCamel(organization), 201);
  }

  if (
    path.startsWith("/api/organizations/") &&
    !path.startsWith("/api/organizations/members") &&
    !path.startsWith("/api/organizations/invites") &&
    (method === "PUT" || method === "PATCH")
  ) {
    if (!ctx.organizationId) {
      return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
    }

    if (!canManageOrganization(ctx.role)) {
      return jsonResponse(
        { error: "Apenas owner ou admin podem alterar a organização." },
        403,
      );
    }

    const organizationId = decodeURIComponent(path.replace("/api/organizations/", ""));

    if (organizationId !== ctx.organizationId) {
      return jsonResponse({ error: "Organização inválida." }, 403);
    }

    const updatePayload = organizationToDb(body);
    delete updatePayload.id;
    delete updatePayload.owner_id;

    const { data, error } = await supabase
      .from("organizations")
      .update(updatePayload)
      .eq("id", organizationId)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(toCamel(data));
  }

  if (path === "/api/organizations/members" && method === "GET") {
    if (!ctx.organizationId) {
      return jsonResponse([]);
    }

    const { data, error } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse((data || []).map(toCamel));
  }

  if (
    path.startsWith("/api/organizations/members/") &&
    (method === "PUT" || method === "PATCH")
  ) {
    if (!ctx.organizationId) {
      return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
    }

    if (!canManageOrganization(ctx.role)) {
      return jsonResponse(
        { error: "Apenas owner ou admin podem alterar membros." },
        403,
      );
    }

    const memberId = decodeURIComponent(
      path.replace("/api/organizations/members/", ""),
    );

    const updatePayload = cleanPayload({
      role: body.role,
      status: body.status,
      updated_at: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("organization_members")
      .update(updatePayload)
      .eq("id", memberId)
      .eq("organization_id", ctx.organizationId)
      .select("*")
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    if (!data) {
      return jsonResponse({ error: "Membro não encontrado." }, 404);
    }

    return jsonResponse(toCamel(data));
  }

  if (path === "/api/organizations/invites" && method === "GET") {
    if (!ctx.organizationId) {
      return jsonResponse([]);
    }

    const { data, error } = await supabase
      .from("organization_invites")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse((data || []).map(toCamel));
  }

  if (path === "/api/organizations/invites" && method === "POST") {
    const limitError = await validateMemberLimit(ctx);

    if (limitError) {
      return limitError;
    }

    const invitePayload = {
      organization_id: ctx.organizationId,
      invited_name: body.invitedName,
      invited_email: String(body.invitedEmail || "").toLowerCase(),
      role: body.role || "broker",
      token: makeId("invite"),
      status: "pending",
      invited_by: ctx.user.id,
      expires_at:
        body.expiresAt ||
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    };

    if (!invitePayload.invited_email) {
      return jsonResponse({ error: "E-mail do convidado é obrigatório." }, 400);
    }

    const { data, error } = await supabase
      .from("organization_invites")
      .insert(invitePayload)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(toCamel(data), 201);
  }

  if (path === "/api/organizations/invites/accept" && method === "POST") {
    const { token } = body;

    if (!token) {
      return jsonResponse({ error: "Token de convite não informado." }, 400);
    }

    const { data: invite, error: inviteError } = await supabase
      .from("organization_invites")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .maybeSingle();

    if (inviteError || !invite) {
      return jsonResponse({ error: "Convite inválido ou expirado." }, 404);
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .upsert({
        organization_id: invite.organization_id,
        user_id: ctx.user.id,
        name: ctx.profile?.name || ctx.user.email,
        email: ctx.user.email,
        role: invite.role || "broker",
        status: "active",
      });

    if (memberError) {
      return jsonResponse({ error: memberError.message }, 400);
    }

    await supabase
      .from("organization_invites")
      .update({
        status: "accepted",
        accepted_by: ctx.user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    await supabase.from("profiles").upsert({
      id: ctx.user.id,
      email: ctx.user.email,
      default_organization_id: invite.organization_id,
      current_organization_id: invite.organization_id,
      current_role: invite.role || "broker",
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      success: true,
      organizationId: invite.organization_id,
    });
  }

  if (path.startsWith("/api/organizations/invites/") && method === "DELETE") {
    if (!ctx.organizationId) {
      return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
    }

    if (!canManageOrganization(ctx.role)) {
      return jsonResponse(
        { error: "Apenas owner ou admin podem cancelar convites." },
        403,
      );
    }

    const inviteId = decodeURIComponent(
      path.replace("/api/organizations/invites/", ""),
    );

    const { data, error } = await supabase
      .from("organization_invites")
      .delete()
      .eq("id", inviteId)
      .eq("organization_id", ctx.organizationId)
      .select("id");

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    if (!data || data.length === 0) {
      return jsonResponse({ error: "Convite não encontrado." }, 404);
    }

    return jsonResponse({ success: true, deletedId: inviteId });
  }

  return jsonResponse({ error: "Rota de organização não encontrada." }, 404);
}

async function handleCollection(
  table: string,
  path: string,
  method: HttpMethod,
  init?: RequestInit,
): Promise<Response> {
  const body = await readBody(init);
  const ctx = await getSessionContext();

  if (!ctx) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }

  if (!ctx.organizationId) {
    return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
  }

  const basePath = `/api/${table}`;
  const isSingle = path.startsWith(`${basePath}/`);
  const recordId = isSingle
    ? decodeURIComponent(path.replace(`${basePath}/`, ""))
    : null;

  if (path === basePath && method === "GET") {
    let query = supabase
      .from(table)
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false });

    if (ctx.role === "broker") {
      query = query.or(`assigned_to.eq.${ctx.user.id},created_by.eq.${ctx.user.id}`);
    }

    const { data, error } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse((data || []).map(toCamel));
  }

  if (path === basePath && method === "POST") {
    if (table === "clients") {
      const limitError = await validateClientLimit(ctx);

      if (limitError) {
        return limitError;
      }
    }

    if (table === "properties") {
      const limitError = await validatePropertyLimit(ctx);

      if (limitError) {
        return limitError;
      }
    }

    const payload = {
      ...commercialToDb(body, ctx),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse(toCamel(data), 201);
  }

  if (isSingle && recordId && method === "GET") {
    let query = supabase
      .from(table)
      .select("*")
      .eq("id", recordId)
      .eq("organization_id", ctx.organizationId);

    if (ctx.role === "broker") {
      query = query.or(`assigned_to.eq.${ctx.user.id},created_by.eq.${ctx.user.id}`);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    if (!data) {
      return jsonResponse({ error: "Registro não encontrado." }, 404);
    }

    return jsonResponse(toCamel(data));
  }

  if (isSingle && recordId && (method === "PUT" || method === "PATCH")) {
    const payload = commercialToDb(body, ctx);

    let query = supabase
      .from(table)
      .update(payload)
      .eq("id", recordId)
      .eq("organization_id", ctx.organizationId);

    if (ctx.role === "broker") {
      query = query.or(`assigned_to.eq.${ctx.user.id},created_by.eq.${ctx.user.id}`);
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    if (!data) {
      return jsonResponse(
        { error: "Registro não encontrado ou sem permissão." },
        404,
      );
    }

    return jsonResponse(toCamel(data));
  }

  if (isSingle && recordId && method === "DELETE") {
    if (table === "clients") {
      const { data, error } = await supabase.rpc("delete_client_cascade", {
        p_client_id: recordId,
      });

      if (error) {
        return jsonResponse({ error: error.message }, 400);
      }

      return jsonResponse(data || { success: true, deletedId: recordId });
    }

    let query = supabase
      .from(table)
      .delete()
      .eq("id", recordId)
      .eq("organization_id", ctx.organizationId);

    if (ctx.role === "broker") {
      query = query.or(`assigned_to.eq.${ctx.user.id},created_by.eq.${ctx.user.id}`);
    }

    const { data, error } = await query.select("id");

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    if (!data || data.length === 0) {
      return jsonResponse(
        { error: "Registro não encontrado ou sem permissão." },
        404,
      );
    }

    return jsonResponse({ success: true, deletedId: recordId });
  }

  return jsonResponse({ error: `Rota não implementada: ${path}` }, 501);
}

async function handleTransferClients(
  method: HttpMethod,
  init?: RequestInit,
): Promise<Response> {
  const body = await readBody(init);
  const ctx = await getSessionContext();

  if (!ctx) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }

  if (method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const featureError = validateFeature(ctx, "lead_transfer");

  if (featureError) {
    return featureError;
  }

  if (!canManageLeads(ctx.role)) {
    return jsonResponse(
      { error: "Apenas owner, admin ou manager podem transferir leads." },
      403,
    );
  }

  if (!ctx.organizationId) {
    return jsonResponse({ error: "Organização ativa não encontrada." }, 400);
  }

  const clientIds: string[] = body.clientIds || [];
  const targetUserId = body.targetUserId || body.assignedTo;

  if (!clientIds.length || !targetUserId) {
    return jsonResponse(
      { error: "Informe os clientes e o corretor de destino." },
      400,
    );
  }

  const { data, error } = await supabase
    .from("clients")
    .update({
      assigned_to: targetUserId,
      updated_at: new Date().toISOString(),
    })
    .in("id", clientIds)
    .eq("organization_id", ctx.organizationId)
    .select("*");

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({
    success: true,
    updated: data?.length || 0,
    clients: (data || []).map(toCamel),
  });
}

async function handleDashboard(): Promise<Response> {
  const ctx = await getSessionContext();

  if (!ctx) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }

  if (!ctx.organizationId) {
    return jsonResponse({
      totalClients: 0,
      totalProperties: 0,
      totalTasks: 0,
      totalVisits: 0,
      totalProposals: 0,
      potentialCommission: 0,
      overdueTasks: 0,
    });
  }

  const [
    clientsResult,
    propertiesResult,
    tasksResult,
    visitsResult,
    proposalsResult,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId),

    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId),

    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId),

    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId),

    supabase
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId),
  ]);

  return jsonResponse({
    totalClients: clientsResult.count || 0,
    totalProperties: propertiesResult.count || 0,
    totalTasks: tasksResult.count || 0,
    totalVisits: visitsResult.count || 0,
    totalProposals: proposalsResult.count || 0,
    potentialCommission: 0,
    overdueTasks: 0,
  });
}

async function handleAi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const ctx = await getSessionContext();

  if (!ctx) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }

  const featureError = validateFeature(ctx, "gemini_ai");

  if (featureError) {
    return featureError;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers = new Headers(init?.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  return response;
}

async function handleStatus(): Promise<Response> {
  const ctx = await getSessionContext();

  return jsonResponse({
    ok: true,
    authenticated: Boolean(ctx),
    organizationId: ctx?.organizationId || null,
    plan: ctx?.plan || null,
    role: ctx?.role || null,
    database: "supabase",
  });
}

async function handleDemo(
  path: string,
  method: HttpMethod,
  init?: RequestInit,
): Promise<Response> {
  const body = await readBody(init);

  const demoUser = {
    id: "demo-user",
    email: "demo@metria.app",
    name: "Usuário Demo",
    isDemo: true,
    onboardingCompleted: true,
    currentRole: "owner",
    plan: "pro_max",
  };

  const collectionMap: Record<string, string> = {
    "/api/clients": "demo_clients",
    "/api/properties": "demo_properties",
    "/api/tasks": "demo_tasks",
    "/api/visits": "demo_visits",
    "/api/proposals": "demo_proposals",
  };

  if (path === "/api/auth/me") {
    return jsonResponse(demoUser);
  }

  if (path === "/api/status") {
    return jsonResponse({
      ok: true,
      authenticated: true,
      database: "demo",
      plan: "pro_max",
      role: "owner",
    });
  }

  const collectionPath = Object.keys(collectionMap).find(
    (key) => path === key || path.startsWith(`${key}/`),
  );

  if (!collectionPath) {
    return jsonResponse(
      { error: "Rota demo não implementada. Use Supabase real para esta ação." },
      501,
    );
  }

  const key = collectionMap[collectionPath];
  const list = getLocalList(key);
  const isSingle = path.startsWith(`${collectionPath}/`);
  const recordId = isSingle ? path.replace(`${collectionPath}/`, "") : null;

  if (path === collectionPath && method === "GET") {
    return jsonResponse(list);
  }

  if (path === collectionPath && method === "POST") {
    const id = makeId("demo");

    const record = {
      ...body,
      id,
      _id: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveLocalList(key, [record, ...list]);
    return jsonResponse(record, 201);
  }

  if (isSingle && recordId && (method === "PUT" || method === "PATCH")) {
    const updated = list.map((item) =>
      item.id === recordId || item._id === recordId
        ? { ...item, ...body, updatedAt: new Date().toISOString() }
        : item,
    );

    saveLocalList(key, updated);

    const record = updated.find(
      (item) => item.id === recordId || item._id === recordId,
    );

    return jsonResponse(record || { error: "Registro demo não encontrado." }, record ? 200 : 404);
  }

  if (isSingle && recordId && method === "DELETE") {
    const filtered = list.filter(
      (item) => item.id !== recordId && item._id !== recordId,
    );

    saveLocalList(key, filtered);

    return jsonResponse({
      success: true,
      deletedId: recordId,
    });
  }

  return jsonResponse({ error: "Rota demo não implementada." }, 501);
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const path = getPath(input);
  const method = getMethod(init);

  try {
    if (isExplicitDemoRequest(input)) {
      return handleDemo(path, method, init);
    }

    if (path.startsWith("/api/auth/")) {
      return handleAuth(path, method, init);
    }

    if (path === "/api/status") {
      return handleStatus();
    }

    if (path === "/api/dashboard") {
      return handleDashboard();
    }

    if (path === "/api/clients/transfer") {
      return handleTransferClients(method, init);
    }

    if (path === "/api/organizations" || path.startsWith("/api/organizations/")) {
      return handleOrganizations(path, method, init);
    }

    if (path === "/api/clients" || path.startsWith("/api/clients/")) {
      return handleCollection("clients", path, method, init);
    }

    if (path === "/api/properties" || path.startsWith("/api/properties/")) {
      return handleCollection("properties", path, method, init);
    }

    if (path === "/api/tasks" || path.startsWith("/api/tasks/")) {
      return handleCollection("tasks", path, method, init);
    }

    if (path === "/api/visits" || path.startsWith("/api/visits/")) {
      return handleCollection("visits", path, method, init);
    }

    if (path === "/api/proposals" || path.startsWith("/api/proposals/")) {
      return handleCollection("proposals", path, method, init);
    }

    if (path === "/api/transactions" || path.startsWith("/api/transactions/")) {
      return handleCollection("transactions", path, method, init);
    }

    if (path === "/api/history_events" || path.startsWith("/api/history_events/")) {
      return handleCollection("history_events", path, method, init);
    }

    if (path === "/api/settings" || path.startsWith("/api/settings/")) {
      return handleCollection("settings", path, method, init);
    }

    if (path.startsWith("/api/ai/")) {
      return handleAi(path, init);
    }

    return jsonResponse({ error: `Rota não encontrada: ${path}` }, 404);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro inesperado na camada API.";

    return jsonResponse({ error: message }, 500);
  }
}

export default apiFetch;
