import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users2,
} from "lucide-react";
import type {
  Organization,
  OrganizationInvite,
  OrganizationMember,
  User,
  UserRole,
} from "../types";
import { apiFetch } from "../api";
import {
  canInviteMember,
  formatPlanPrice,
  getPlanLimits,
} from "../config/plans";

interface TeamViewProps {
  currentUser: User;
  currentOrganization?: Organization | null;
  onUpgradeClick?: () => void;
}

interface TransferOption {
  id: string;
  name: string;
  email?: string;
}

function getUserRole(currentUser: User): UserRole {
  const role = currentUser.currentRole;

  if (role === "owner" || role === "admin" || role === "manager") {
    return role;
  }

  return "broker";
}

function canManageTeam(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

function canViewTeam(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

function formatRole(role: UserRole | string): string {
  const labels: Record<string, string> = {
    owner: "Dono",
    admin: "Administrador",
    manager: "Gestor",
    broker: "Corretor",
  };

  return labels[role] ?? role;
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    pending: "Pendente",
    accepted: "Aceito",
    expired: "Expirado",
    cancelled: "Cancelado",
  };

  return labels[status] ?? status;
}

function getMemberId(member: OrganizationMember): string {
  return member.id || member._id || member.userId;
}

function getInviteId(invite: OrganizationInvite): string {
  return invite.id || invite._id || invite.token || invite.invitedEmail;
}

export default function TeamView({
  currentUser,
  currentOrganization,
  onUpgradeClick,
}: TeamViewProps) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [transferOptions, setTransferOptions] = useState<TransferOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [updatingMember, setUpdatingMember] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("broker");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const userRole = useMemo(() => getUserRole(currentUser), [currentUser]);
  const organizationPlan = currentOrganization?.plan ?? currentUser.plan ?? "beta";
  const plan = useMemo(() => getPlanLimits(organizationPlan), [organizationPlan]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status !== "inactive"),
    [members],
  );

  const activeMembersCount = activeMembers.length;
  const isTeamPlan = plan.hasTeamManagement;
  const inviteAllowedByPlan = canInviteMember(organizationPlan, activeMembersCount);
  const userCanManageTeam = canManageTeam(userRole);
  const userCanViewTeam = canViewTeam(userRole);

  const organizationId =
    currentOrganization?.id ||
    currentOrganization?._id ||
    currentUser.currentOrganizationId ||
    currentUser.organizationId ||
    currentUser.defaultOrganizationId ||
    "";

  async function loadTeamData() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const [membersResponse, invitesResponse] = await Promise.all([
        apiFetch("/api/organizations/members"),
        apiFetch("/api/organizations/invites"),
      ]);

      const membersData = await membersResponse.json().catch(() => []);
      const invitesData = await invitesResponse.json().catch(() => []);

      if (!membersResponse.ok) {
        throw new Error(
          membersData?.error || "Não foi possível carregar os membros da equipe.",
        );
      }

      if (!invitesResponse.ok) {
        throw new Error(
          invitesData?.error || "Não foi possível carregar os convites da equipe.",
        );
      }

      const normalizedMembers = Array.isArray(membersData)
        ? membersData
        : membersData?.members || [];

      const normalizedInvites = Array.isArray(invitesData)
        ? invitesData
        : invitesData?.invites || [];

      setMembers(normalizedMembers);
      setInvites(normalizedInvites);

      setTransferOptions(
        normalizedMembers
          .filter((member: OrganizationMember) => member.status !== "inactive")
          .map((member: OrganizationMember) => ({
            id: member.userId,
            name: member.name || member.email || "Usuário",
            email: member.email,
          })),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao carregar equipe. Verifique sua conexão.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (userCanViewTeam && isTeamPlan) {
      void loadTeamData();
    } else {
      setLoading(false);
    }
  }, [isTeamPlan, userCanViewTeam]);

  async function handleCreateInvite(event: React.FormEvent) {
    event.preventDefault();

    if (!userCanManageTeam) {
      setErrorMessage("Apenas owner ou admin podem convidar corretores.");
      return;
    }

    if (!isTeamPlan) {
      setErrorMessage("Gestão de equipe está disponível apenas nos planos Max e PRO MAX.");
      return;
    }

    if (!inviteAllowedByPlan) {
      setErrorMessage(
        plan.id === "max"
          ? "O Plano Max permite até 5 membros ativos. Faça upgrade para PRO MAX para adicionar mais corretores."
          : "O Plano PRO MAX permite até 30 membros ativos. Fale com vendas para um plano personalizado.",
      );
      return;
    }

    if (!inviteEmail.trim()) {
      setErrorMessage("Informe o e-mail do corretor convidado.");
      return;
    }

    setSubmittingInvite(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await apiFetch("/api/organizations/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          invitedName: inviteName.trim() || undefined,
          invitedEmail: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível criar o convite.");
      }

      setInviteName("");
      setInviteEmail("");
      setInviteRole("broker");
      setSuccessMessage("Convite criado com sucesso.");
      await loadTeamData();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao criar convite.";

      setErrorMessage(message);
    } finally {
      setSubmittingInvite(false);
    }
  }

  async function handleUpdateMember(
    member: OrganizationMember,
    changes: Partial<OrganizationMember>,
  ) {
    if (!userCanManageTeam) {
      setErrorMessage("Apenas owner ou admin podem alterar membros da equipe.");
      return;
    }

    const memberId = getMemberId(member);

    setUpdatingMember(memberId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(`/api/organizations/members/${memberId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(changes),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível atualizar o membro.");
      }

      setSuccessMessage("Membro atualizado com sucesso.");
      await loadTeamData();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao atualizar membro.";

      setErrorMessage(message);
    } finally {
      setUpdatingMember(null);
    }
  }

  async function handleCancelInvite(invite: OrganizationInvite) {
    if (!userCanManageTeam) {
      setErrorMessage("Apenas owner ou admin podem cancelar convites.");
      return;
    }

    const inviteId = getInviteId(invite);

    setUpdatingMember(inviteId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await apiFetch(`/api/organizations/invites/${inviteId}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível cancelar o convite.");
      }

      setSuccessMessage("Convite cancelado com sucesso.");
      await loadTeamData();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao cancelar convite.";

      setErrorMessage(message);
    } finally {
      setUpdatingMember(null);
    }
  }

  async function handleCopyInviteLink(invite: OrganizationInvite) {
    const token = invite.token;

    if (!token) {
      setErrorMessage("Este convite ainda não possui link.");
      return;
    }

    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}/invite/${token}`;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopySuccess(token);
      setTimeout(() => setCopySuccess(null), 2500);
    } catch {
      setErrorMessage("Não foi possível copiar o link. Copie manualmente: " + inviteLink);
    }
  }

  if (!isTeamPlan) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white">
              <Users2 size={22} />
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Recurso bloqueado pelo plano
              </p>

              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                Gestão de equipe disponível nos planos Max e PRO MAX
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                Seu plano atual é {plan.name}. Para cadastrar corretores,
                distribuir leads e acompanhar relatórios por corretor, faça
                upgrade para Max ou PRO MAX.
              </p>

              {onUpgradeClick ? (
                <button
                  type="button"
                  onClick={onUpgradeClick}
                  className="mt-5 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Ver planos
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!userCanViewTeam) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-4">
          <AlertTriangle className="mt-1 text-amber-700" size={22} />

          <div>
            <h2 className="text-xl font-bold text-amber-950">
              Acesso restrito
            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-800">
              Corretores não têm acesso à gestão de equipe. Fale com um owner,
              admin ou gestor da organização.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Loader2 className="animate-spin text-blue-700" size={20} />
          <span className="text-sm font-medium text-slate-700">
            Carregando equipe...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              Equipe
            </p>

            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              Corretores e permissões
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Gerencie os usuários da organização, convites, cargos e limites do
              plano contratado.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTeamData}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Plano atual
            </p>
            <p className="mt-1 text-lg font-bold text-slate-950">{plan.name}</p>
            <p className="text-sm text-slate-600">{formatPlanPrice(plan.id)}</p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Membros ativos
            </p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {activeMembersCount}/{plan.maxMembers}
            </p>
            <p className="text-sm text-slate-600">
              Limite conforme o plano contratado
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Seu cargo
            </p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {formatRole(userRole)}
            </p>
            <p className="text-sm text-slate-600">
              {userCanManageTeam
                ? "Pode gerenciar equipe"
                : "Acesso apenas de visualização"}
            </p>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {userCanManageTeam ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Plus size={20} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Convidar corretor
              </h2>
              <p className="text-sm text-slate-600">
                Crie um convite e envie o link para o novo membro.
              </p>
            </div>
          </div>

          {!inviteAllowedByPlan ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {plan.id === "max"
                ? "Você atingiu o limite de 5 membros do Plano Max. Faça upgrade para PRO MAX para até 30 corretores."
                : "Você atingiu o limite de membros deste plano. Fale com vendas para uma condição personalizada."}
            </div>
          ) : null}

          <form
            onSubmit={handleCreateInvite}
            className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_190px_auto]"
          >
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Nome
              </span>
              <input
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                placeholder="Nome do corretor"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                E-mail
              </span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                placeholder="corretor@email.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Cargo
              </span>
              <select
                value={inviteRole}
                onChange={(event) =>
                  setInviteRole(event.target.value as UserRole)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
              >
                <option value="broker">Corretor</option>
                <option value="manager">Gestor</option>
                <option value="admin">Administrador</option>
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submittingInvite || !inviteAllowedByPlan}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingInvite ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Mail size={16} />
                )}
                Convidar
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Corretores cadastrados
            </h2>
            <p className="text-sm text-slate-600">
              Membros ativos e inativos da organização.
            </p>
          </div>

          <Users2 className="text-slate-400" size={22} />
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          {members.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Nenhum corretor cadastrado ainda.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {members.map((member) => {
                const memberId = getMemberId(member);
                const isUpdating = updatingMember === memberId;
                const isCurrentUser = member.userId === currentUser.id;

                return (
                  <div
                    key={memberId}
                    className="grid gap-4 p-4 md:grid-cols-[1fr_170px_170px_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-slate-950">
                          {member.name || "Sem nome"}
                        </p>

                        {member.role === "owner" ? (
                          <Shield className="text-blue-700" size={16} />
                        ) : null}

                        {isCurrentUser ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            Você
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 truncate text-sm text-slate-500">
                        {member.email || "Sem e-mail"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Cargo
                      </p>

                      {userCanManageTeam && member.role !== "owner" ? (
                        <select
                          value={member.role}
                          disabled={isUpdating}
                          onChange={(event) =>
                            handleUpdateMember(member, {
                              role: event.target.value as UserRole,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                        >
                          <option value="broker">Corretor</option>
                          <option value="manager">Gestor</option>
                          <option value="admin">Administrador</option>
                        </select>
                      ) : (
                        <p className="mt-2 text-sm font-medium text-slate-700">
                          {formatRole(member.role)}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </p>

                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        {member.status === "active" ? (
                          <UserCheck className="text-emerald-600" size={16} />
                        ) : (
                          <UserX className="text-slate-400" size={16} />
                        )}
                        {formatStatus(member.status)}
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {userCanManageTeam && member.role !== "owner" ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() =>
                            handleUpdateMember(member, {
                              status:
                                member.status === "active"
                                  ? "inactive"
                                  : "active",
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          {isUpdating ? (
                            <Loader2 className="animate-spin" size={15} />
                          ) : member.status === "active" ? (
                            <UserX size={15} />
                          ) : (
                            <UserCheck size={15} />
                          )}
                          {member.status === "active" ? "Inativar" : "Ativar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Convites pendentes
            </h2>
            <p className="text-sm text-slate-600">
              Links gerados para novos corretores entrarem na organização.
            </p>
          </div>

          <Mail className="text-slate-400" size={22} />
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          {invites.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Nenhum convite criado ainda.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {invites.map((invite) => {
                const inviteId = getInviteId(invite);
                const isUpdating = updatingMember === inviteId;
                const canCopy = Boolean(invite.token);
                const copied = invite.token && copySuccess === invite.token;

                return (
                  <div
                    key={inviteId}
                    className="grid gap-4 p-4 md:grid-cols-[1fr_150px_150px_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {invite.invitedName || "Sem nome"}
                      </p>

                      <p className="mt-1 truncate text-sm text-slate-500">
                        {invite.invitedEmail}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Cargo
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-700">
                        {formatRole(invite.role)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </p>
                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        {invite.status === "accepted" ? (
                          <Check className="text-emerald-600" size={16} />
                        ) : (
                          <Mail className="text-blue-600" size={16} />
                        )}
                        {formatStatus(invite.status)}
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={!canCopy}
                        onClick={() => handleCopyInviteLink(invite)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Copy size={15} />
                        {copied ? "Copiado" : "Copiar"}
                      </button>

                      {userCanManageTeam && invite.status === "pending" ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleCancelInvite(invite)}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          {isUpdating ? (
                            <Loader2 className="animate-spin" size={15} />
                          ) : (
                            <Trash2 size={15} />
                          )}
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {plan.hasLeadTransfer ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">
            Transferência de leads
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            A transferência individual ou em massa deve ser feita a partir da
            lista de clientes. Esta seção apenas confirma que o plano atual
            permite transferir leads entre corretores.
          </p>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">
              Corretores disponíveis para receber leads: {transferOptions.length}
            </p>

            <p className="mt-1 text-sm text-slate-600">
              Planos Max e PRO MAX permitem transferência de leads por owner,
              admin ou manager.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
