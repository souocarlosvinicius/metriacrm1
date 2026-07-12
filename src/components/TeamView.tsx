import React, { useState, useEffect } from "react";
import { 
  Users2, 
  Mail, 
  Plus, 
  Check, 
  Trash2, 
  UserX, 
  UserCheck, 
  Send, 
  Loader2, 
  AlertTriangle,
  RefreshCw,
  Copy,
  ChevronRight,
  Shield,
  User,
  HeartHandshake
} from "lucide-react";
import { User as UserType, OrganizationMember, OrganizationInvite, UserRole } from "../types";
import { apiFetch } from "../api";

interface TeamViewProps {
  currentUser: UserType;
}

export default function TeamView({ currentUser }: TeamViewProps) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [updatingMember, setUpdatingMember] = useState<string | null>(null);
  
  // Invite form states
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("broker");
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  // Lead Transfer states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferringLeads, setTransferringLeads] = useState(false);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const orgId = currentUser.defaultOrganizationId;

  const fetchTeamData = async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        apiFetch(`/api/organizations/members?organizationId=${orgId}`),
        apiFetch(`/api/organizations/invites?organizationId=${orgId}`)
      ]);

      if (membersRes.ok && invitesRes.ok) {
        const mData = await membersRes.json();
        const iData = await invitesRes.json();
        setMembers(mData);
        setInvites(iData);
      } else {
        setError("Erro ao carregar os dados da equipe. Verifique sua conexão.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Falha ao se conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [orgId]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setError("Por favor, preencha o nome e o e-mail do corretor.");
      return;
    }

    setSubmittingInvite(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch("/api/organizations/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          invitedEmail: inviteEmail.trim(),
          invitedName: inviteName.trim(),
          role: inviteRole
        })
      });

      if (res.ok) {
        const newInvite = await res.json();
        setInvites(prev => [newInvite, ...prev]);
        setSuccess(`Convite gerado para ${inviteName}! Envie o link de ativação.`);
        setInviteName("");
        setInviteEmail("");
        setInviteRole("broker");
        setShowInviteModal(false);
      } else {
        const errJson = await res.json();
        setError(errJson.error || "Erro ao gerar convite.");
      }
    } catch (err) {
      console.error(err);
      setError("Falha na rede ao criar convite.");
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleUpdateMemberStatus = async (memberId: string, newStatus: "active" | "inactive") => {
    setUpdatingMember(memberId);
    setError(null);
    setSuccess(null);

    try {
      const member = members.find(m => m.id === memberId);
      if (!member) return;

      const res = await apiFetch(`/api/organizations/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: member.role,
          status: newStatus
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: updated.status } : m));
        setSuccess(`Status do membro atualizado com sucesso para ${newStatus === "active" ? "Ativo" : "Inativo"}.`);
        
        // If deactivated, prompt option to transfer leads
        if (newStatus === "inactive") {
          setTransferFromId(member.userId);
          setShowTransferModal(true);
        }
      } else {
        const errJson = await res.json();
        setError(errJson.error || "Erro ao atualizar status do membro.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro na rede ao atualizar status do membro.");
    } finally {
      setUpdatingMember(null);
    }
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: UserRole) => {
    setUpdatingMember(memberId);
    setError(null);
    setSuccess(null);

    try {
      const member = members.find(m => m.id === memberId);
      if (!member) return;

      const res = await apiFetch(`/api/organizations/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: newRole,
          status: member.status
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: updated.role } : m));
        setSuccess(`Função do membro atualizada para ${newRole === "owner" ? "Proprietário" : newRole === "admin" ? "Administrador" : newRole === "manager" ? "Gerente" : "Corretor"}.`);
      } else {
        const errJson = await res.json();
        setError(errJson.error || "Erro ao atualizar função.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro na rede ao atualizar função do membro.");
    } finally {
      setUpdatingMember(null);
    }
  };

  const handleTransferLeads = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId) {
      setError("Selecione os corretores de origem e destino para transferir.");
      return;
    }
    if (transferFromId === transferToId) {
      setError("O corretor de destino deve ser diferente do de origem.");
      return;
    }

    setTransferringLeads(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch("/api/clients/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUserId: transferFromId,
          toUserId: transferToId,
          organizationId: orgId
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(`Sucesso! ${data.count} clientes/leads foram transferidos com sucesso.`);
        setShowTransferModal(false);
        setTransferFromId("");
        setTransferToId("");
      } else {
        const errJson = await res.json();
        setError(errJson.error || "Erro ao transferir leads.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro de rede ao transferir leads.");
    } finally {
      setTransferringLeads(false);
    }
  };

  const copyInviteLink = (token: string) => {
    const activationLink = `${window.location.origin}?invite=${token}`;
    navigator.clipboard.writeText(activationLink);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  const isOwnerOrAdmin = currentUser.currentRole === "owner" || currentUser.currentRole === "admin";

  if (!orgId) {
    return (
      <div className="bg-surface rounded-3xl p-8 border border-outline-variant/40 shadow-sm text-center max-w-md mx-auto my-12 space-y-6">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Shield className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl font-black text-primary">Conta Individual Activa</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Sua conta está configurada no formato <strong>Corretor Autônomo</strong>. O menu de Equipe é exclusivo para contas de tipo <strong>Imobiliária / Equipe</strong>.
          </p>
        </div>
        <p className="text-xs text-on-surface-variant/70 italic leading-relaxed">
          Se você gerencia uma imobiliária e quer cadastrar corretores, pode converter sua conta nas Configurações da conta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left" id="team-view-container">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-secondary font-bold uppercase tracking-widest block mb-0.5">Organização & Equipe</span>
          <h1 className="font-display text-2xl font-extrabold text-primary tracking-tight leading-none">Gestão de Corretores</h1>
          <p className="text-xs text-on-surface-variant mt-1">Gerencie os corretores parceiros, permissões e convites ativos na sua base.</p>
        </div>

        {isOwnerOrAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTransferFromId("");
                setTransferToId("");
                setShowTransferModal(true);
              }}
              className="px-4 py-2 bg-surface-container-high border border-outline-variant/60 hover:bg-surface-container-highest font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer text-primary transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Transferir Carteira
            </button>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-primary hover:opacity-95 text-on-primary font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-primary/10 cursor-pointer transition-all"
            >
              <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
              Convidar Corretor
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-error-container text-on-error-container text-xs font-semibold rounded-2xl border border-error/20 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-semibold rounded-2xl border border-emerald-500/20 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs font-semibold text-on-surface-variant">Carregando dados da imobiliária...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Members List (Left/Middle) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-surface rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden">
              <div className="p-4 bg-surface-container-low border-b border-outline-variant/30 flex justify-between items-center">
                <h3 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Users2 className="w-4 h-4 text-secondary" />
                  Corretores Cadastrados ({members.length})
                </h3>
                <button 
                  onClick={fetchTeamData}
                  className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant/70 hover:text-primary transition-all"
                  title="Atualizar dados"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-outline-variant/25">
                {members.length === 0 ? (
                  <div className="p-8 text-center text-xs text-on-surface-variant">
                    Nenhum corretor cadastrado ainda nesta imobiliária.
                  </div>
                ) : (
                  members.map(member => {
                    const isSelf = member.userId === currentUser.id;
                    return (
                      <div key={member.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-container-low/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/5 text-primary border border-primary/10 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                            {member.name?.slice(0, 2) || "CO"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-on-surface">
                                {member.name} {isSelf && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-bold ml-1">Você</span>}
                              </span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                member.status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-error/10 text-error"
                              }`}>
                                {member.status === "active" ? "Ativo" : "Inativo"}
                              </span>
                            </div>
                            <div className="text-xs text-on-surface-variant mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {member.email}
                              </span>
                              {member.creci && (
                                <span className="text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded-md text-on-surface-variant font-mono">
                                  CRECI: {member.creci}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {/* Role Selector */}
                          {isOwnerOrAdmin && !isSelf ? (
                            <select
                              value={member.role}
                              disabled={updatingMember !== null}
                              onChange={(e) => handleUpdateMemberRole(member.id, e.target.value as UserRole)}
                              className="text-xs bg-surface-container-high border border-outline-variant/60 rounded-xl px-2.5 py-1.5 text-on-surface focus:outline-none focus:border-primary/50 transition-all font-semibold"
                            >
                              <option value="broker">Corretor</option>
                              <option value="manager">Gerente</option>
                              <option value="admin">Administrador</option>
                              <option value="owner">Proprietário</option>
                            </select>
                          ) : (
                            <span className="text-xs font-bold text-on-surface-variant/80 bg-surface-container px-3 py-1.5 rounded-xl border border-outline-variant/20 uppercase tracking-wider">
                              {member.role === "owner" ? "Proprietário" : member.role === "admin" ? "Administrador" : member.role === "manager" ? "Gerente" : "Corretor"}
                            </span>
                          )}

                          {/* Deactivate/Activate Status Button */}
                          {isOwnerOrAdmin && !isSelf && (
                            <button
                              onClick={() => handleUpdateMemberStatus(member.id, member.status === "active" ? "inactive" : "active")}
                              disabled={updatingMember !== null}
                              className={`p-2 rounded-xl transition-all cursor-pointer ${
                                member.status === "active"
                                  ? "bg-error/5 hover:bg-error/10 text-error border border-error/10"
                                  : "bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 border border-emerald-500/10"
                              }`}
                              title={member.status === "active" ? "Inativar corretor" : "Ativar corretor"}
                            >
                              {updatingMember === member.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : member.status === "active" ? (
                                <UserX className="w-4 h-4" />
                              ) : (
                                <UserCheck className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Pending Invites & Access Levels (Right Sidebar) */}
          <div className="space-y-6">
            {/* Pending Invites Card */}
            <div className="bg-surface rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden text-left">
              <div className="p-4 bg-surface-container-low border-b border-outline-variant/30 flex justify-between items-center">
                <h3 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-secondary" />
                  Convites Pendentes ({invites.filter(i => i.status === "pending").length})
                </h3>
              </div>

              <div className="divide-y divide-outline-variant/25">
                {invites.filter(i => i.status === "pending").length === 0 ? (
                  <div className="p-6 text-center text-xs text-on-surface-variant leading-relaxed">
                    Nenhum convite pendente. Use o botão <strong>Convidar Corretor</strong> para cadastrar novas credenciais.
                  </div>
                ) : (
                  invites.filter(i => i.status === "pending").map(invite => (
                    <div key={invite.id} className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="text-xs font-bold text-on-surface">{invite.invitedName}</p>
                          <p className="text-[11px] text-on-surface-variant font-medium truncate max-w-[150px]">{invite.invitedEmail}</p>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-secondary-container text-on-secondary-container uppercase tracking-wider shrink-0">
                          {invite.role === "owner" ? "Owner" : invite.role === "admin" ? "Admin" : invite.role === "manager" ? "Manager" : "Corretor"}
                        </span>
                      </div>

                      {/* Invite Link Action */}
                      <div className="flex items-center gap-1 bg-surface-container-low p-1.5 rounded-lg border border-outline-variant/50">
                        <span className="text-[10px] font-mono font-medium text-on-surface-variant truncate flex-1 pl-1">
                          {window.location.origin}?invite={invite.token}
                        </span>
                        <button
                          onClick={() => copyInviteLink(invite.token)}
                          className="p-1 hover:bg-surface-container-high rounded-md text-primary transition-all cursor-pointer"
                          title="Copiar link do convite"
                        >
                          {copiedToken === invite.token ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Role guide */}
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-4 space-y-3.5 text-left text-xs leading-relaxed">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-secondary" />
                Guia de Níveis de Acesso
              </h3>
              <div className="space-y-2.5">
                <div>
                  <span className="font-bold text-primary block">Proprietário (Owner)</span>
                  <span className="text-on-surface-variant">Dono da imobiliária. Possui controle total da organização, dados de corretores, propostas, e configurações globais.</span>
                </div>
                <div>
                  <span className="font-bold text-primary block">Administrador / Gerente</span>
                  <span className="text-on-surface-variant">Gerencia a equipe, convida novos corretores e tem visibilidade completa de todos os leads e imóveis cadastrados.</span>
                </div>
                <div>
                  <span className="font-bold text-primary block">Corretor (Broker)</span>
                  <span className="text-on-surface-variant">Atua com foco individual. Enxerga e gerencia apenas a sua própria carteira de leads e tarefas, além de cadastrar imóveis na base comum da imobiliária.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 border border-outline-variant w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant/30">
              <h3 className="font-display text-base font-bold text-primary">Convidar Novo Corretor</h3>
              <button 
                onClick={() => setShowInviteModal(false)}
                className="p-1 hover:bg-surface-container rounded-lg text-on-surface-variant"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Ex: Matheus Oliveira"
                  className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant rounded-xl focus:outline-none focus:border-primary/50 text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">E-mail de Trabalho</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Ex: matheus@imobiliaria.com"
                  className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant rounded-xl focus:outline-none focus:border-primary/50 text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Nível de Permissão</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant rounded-xl focus:outline-none focus:border-primary/50 text-on-surface font-semibold"
                >
                  <option value="broker">Corretor (Acesso restrito à própria carteira)</option>
                  <option value="manager">Gerente (Acesso a toda a carteira da imobiliária)</option>
                  <option value="admin">Administrador (Acesso total)</option>
                </select>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/50 rounded-xl text-xs font-bold text-on-surface-variant cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="flex-1 py-2.5 bg-primary hover:opacity-95 text-on-primary rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-primary/10 cursor-pointer transition-all"
                >
                  {submittingInvite ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Gerar Convite
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Portfolio Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 border border-outline-variant w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant/30">
              <h3 className="font-display text-base font-bold text-primary flex items-center gap-1.5">
                <RefreshCw className="w-4.5 h-4.5 text-secondary" />
                Transferir Carteira de Leads
              </h3>
              <button 
                onClick={() => setShowTransferModal(false)}
                className="p-1 hover:bg-surface-container rounded-lg text-on-surface-variant"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Transfira a atribuição de todos os clientes e leads de um corretor específico para outro corretor ativo dentro da sua organização imobiliária.
            </p>

            <form onSubmit={handleTransferLeads} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">De (Corretor Origem)</label>
                <select
                  value={transferFromId}
                  onChange={(e) => setTransferFromId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant rounded-xl focus:outline-none focus:border-primary/50 text-on-surface font-semibold"
                >
                  <option value="">Selecione o corretor...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.userId}>
                      {m.name} ({m.role === "owner" ? "Proprietário" : m.role === "admin" ? "Admin" : m.role === "manager" ? "Gerente" : "Corretor"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Para (Corretor Destino)</label>
                <select
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant rounded-xl focus:outline-none focus:border-primary/50 text-on-surface font-semibold"
                >
                  <option value="">Selecione o corretor ativo...</option>
                  {members.filter(m => m.status === "active" && m.userId !== transferFromId).map(m => (
                    <option key={m.id} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/50 rounded-xl text-xs font-bold text-on-surface-variant cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={transferringLeads}
                  className="flex-1 py-2.5 bg-primary hover:opacity-95 text-on-primary rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-primary/10 cursor-pointer transition-all"
                >
                  {transferringLeads ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Confirmar Transferência
                      <Check className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
