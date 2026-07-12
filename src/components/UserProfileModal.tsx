import React, { useState } from "react";
import { motion } from "motion/react";
import { X, User as UserIcon, Mail, Phone, Briefcase, Image as ImageIcon, Lock, Save, LogOut, Loader2, Check, Sparkles } from "lucide-react";
import { User } from "../types";
import { apiFetch } from "../api";

interface UserProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdateSuccess: (updatedUser: User) => void;
  onLogout: () => void;
}

export default function UserProfileModal({ user, onClose, onUpdateSuccess, onLogout }: UserProfileModalProps) {
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [role, setRole] = useState(user.role || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [password, setPassword] = useState("");
  
  // Onboarding fields for Metria CRM
  const [commercialName, setCommercialName] = useState(user.commercialName || "");
  const [creci, setCreci] = useState(user.creci || "");
  const [primaryCity, setPrimaryCity] = useState(user.primaryCity || "");
  const [actingType, setActingType] = useState(user.actingType || "Venda");
  const [defaultCommissionPercent, setDefaultCommissionPercent] = useState<number>(user.defaultCommissionPercent !== undefined ? user.defaultCommissionPercent : 5);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setIsSuccess(false);

    try {
      const payload: any = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: role.trim(),
        avatarUrl: avatarUrl.trim(),
        commercialName: commercialName.trim(),
        creci: creci.trim(),
        primaryCity: primaryCity.trim(),
        actingType: actingType,
        defaultCommissionPercent: Number(defaultCommissionPercent) || 0,
        onboardingCompleted: true, // Mark completed if not already
      };

      if (password) {
        payload.password = password;
      }

      const res = await apiFetch(`/api/auth/update/${user.id || user._id || user.username || "vega"}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao atualizar perfil.");
      }

      setIsSuccess(true);
      onUpdateSuccess(data);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="relative bg-surface w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-outline-variant/30"
      >
        {/* Header */}
        <header className="flex justify-between items-center px-6 py-4 bg-surface border-b border-outline-variant sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-on-surface">Configurações de Perfil</h2>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Metria CRM Consultor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-error-container text-on-error-container text-xs font-semibold rounded-xl border border-error/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Profile Avatar Preview Area */}
            <div className="flex flex-col items-center gap-2 pb-2">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 bg-primary/5 shadow-md">
                <img
                  className="w-full h-full object-cover"
                  src={avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"}
                  alt="Avatar Preview"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80";
                  }}
                />
              </div>
              <p className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider">@{user.username}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                Nome Completo
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  Cargo
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  Telefone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                Foto de Perfil (URL)
              </label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                <input
                  type="text"
                  required
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                />
              </div>
            </div>

            <div className="border-t border-outline-variant/30 my-4 pt-4 space-y-3">
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-secondary animate-pulse" />
                Dados do Metria CRM
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Nome Imobiliária
                  </label>
                  <input
                    type="text"
                    value={commercialName}
                    onChange={(e) => setCommercialName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 text-on-surface"
                    placeholder="Ex: Imobiliária Silva"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    CRECI (Opcional)
                  </label>
                  <input
                    type="text"
                    value={creci}
                    onChange={(e) => setCreci(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 text-on-surface"
                    placeholder="Ex: 12345-F"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Cidade de Atuação
                  </label>
                  <input
                    type="text"
                    value={primaryCity}
                    onChange={(e) => setPrimaryCity(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 text-on-surface"
                    placeholder="Ex: São Paulo / SP"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Tipo de Atuação
                  </label>
                  <select
                    value={actingType}
                    onChange={(e) => setActingType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 text-on-surface"
                  >
                    <option value="Venda">Venda</option>
                    <option value="Locação">Locação</option>
                    <option value="Lançamentos">Lançamentos</option>
                    <option value="Usados">Usados</option>
                    <option value="Alto padrão">Alto padrão</option>
                    <option value="Minha Casa Minha Vida">Minha Casa Minha Vida</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  Percentual de Comissão Padrão (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={defaultCommissionPercent}
                  onChange={(e) => setDefaultCommissionPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 text-on-surface animate-in fade-in"
                  placeholder="Ex: 5"
                />
                <span className="text-[10px] text-on-surface-variant font-medium mt-0.5 block">
                  Usado como percentual base estimado para novos imóveis e negociações
                </span>
              </div>
            </div>

            <div className="border-t border-outline-variant/30 my-4 pt-4">
              <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                Alterar Senha (Opcional)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                <input
                  type="password"
                  placeholder="Deixe em branco para não alterar"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-outline-variant/30">
              <button
                type="button"
                onClick={onLogout}
                className="px-4 py-2.5 bg-error/10 hover:bg-error/15 text-error font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>

              <button
                type="submit"
                disabled={isLoading || isSuccess}
                className="flex-1 py-2.5 bg-primary text-primary-container font-bold text-xs rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/10 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : isSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    Sucesso!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
