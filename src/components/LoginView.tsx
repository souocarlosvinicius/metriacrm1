import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Home, Lock, User as UserIcon, Mail, Briefcase, Phone, Image as ImageIcon, Loader2 } from "lucide-react";
import { User } from "../types";
import { apiFetch } from "../api";

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
  initialRegister?: boolean;
  onBackToLanding?: () => void;
}

export default function LoginView({ onLoginSuccess, initialRegister = false, onBackToLanding }: LoginViewProps) {
  const [isRegistering, setIsRegistering] = useState(initialRegister);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Login Form States
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register Form States
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regRole, setRegRole] = useState("Corretor Sênior");
  const [regPhone, setRegPhone] = useState("");
  const [regAvatarUrl, setRegAvatarUrl] = useState(
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ocorreu um erro no login.");
      }

      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUsername.trim(),
          password: regPassword,
          name: regName.trim(),
          email: regEmail.trim(),
          role: regRole.trim(),
          phone: regPhone.trim(),
          avatarUrl: regAvatarUrl.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ocorreu um erro no cadastro.");
      }

      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartDemo = () => {
    const demoUser: User = {
      id: "demo-user-1",
      username: "carlos_demo",
      name: "Carlos Brito (Demonstração)",
      email: "carlos.brito@metriacrm.com.br",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
      role: "Corretor Sênior",
      phone: "(34) 99123-4567",
      creci: "MG-12345",
      primaryCity: "Uberlândia / MG",
      actingType: "Geral",
      isDemo: true,
      onboardingCompleted: true,
      sessionToken: "demo_token_123"
    };
    
    // Save to localStorage immediately so that API interceptor is active
    localStorage.setItem("vega_crm_user", JSON.stringify(demoUser));
    
    // Trigger login success in App
    onLoginSuccess(demoUser);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Decorative background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-secondary/10 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-surface border border-outline-variant/60 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10"
      >
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 mb-3">
            <Home className="w-6 h-6 text-secondary-fixed animate-pulse" />
          </div>
          <h1 className="font-display text-3xl font-black text-primary tracking-tight">Metria CRM</h1>
          <h2 className="text-xs font-bold text-on-surface mt-2.5 text-center px-4 leading-tight uppercase tracking-wider">
            Organize sua rotina comercial e não perca nenhum negócio
          </h2>
          <p className="text-[11px] text-on-surface-variant font-medium text-center mt-1.5 px-3 leading-relaxed">
            O CRM imobiliário feito para que você acompanhe cada oportunidade de perto, do primeiro contato ao fechamento, sem perder leads, visitas ou follow-ups.
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-3 bg-error-container text-on-error-container text-xs font-semibold rounded-xl border border-error/20"
          >
            {error}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {!isRegistering ? (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  Usuário
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                  <input
                    type="text"
                    required
                    placeholder="Ex: vega"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                  <input
                    type="password"
                    required
                    placeholder="Sua senha"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-primary text-primary-container font-bold text-sm rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/10 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar no Metria CRM"
                )}
              </button>

              <button
                type="button"
                onClick={handleStartDemo}
                className="w-full py-3 bg-surface border-2 border-primary/30 text-primary font-bold text-sm rounded-xl hover:bg-primary/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Briefcase className="w-4 h-4" />
                Ver Demonstração Profissional
              </button>

              <div className="flex flex-col gap-2 pt-2 text-center">
                <div className="text-xs text-on-surface-variant">
                  Não possui conta?{" "}
                  <button
                    type="button"
                    onClick={() => setIsRegistering(true)}
                    className="font-bold text-primary hover:underline cursor-pointer"
                  >
                    Criar conta agora
                  </button>
                </div>
              </div>
            </motion.form>
          ) : (
            <motion.form
              key="register"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleRegister}
              className="space-y-3 max-h-[420px] overflow-y-auto pr-1"
            >
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  Nome Completo
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                  <input
                    type="text"
                    required
                    placeholder="Seu nome"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  E-mail Profissional
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                  <input
                    type="email"
                    required
                    placeholder="seuemail@metriacrm.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Cargo
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
                    <input
                      type="text"
                      placeholder="Ex: Corretor Sênior"
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value)}
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
                      placeholder="Ex: (11) 98765-4321"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
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
                    placeholder="URL de imagem profissional"
                    value={regAvatarUrl}
                    onChange={(e) => setRegAvatarUrl(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>

              <div className="border-t border-outline-variant/30 my-2 pt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Nome de Usuário
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: carlos"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Senha
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Criar senha"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-on-surface"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-primary text-primary-container font-bold text-sm rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/10 cursor-pointer pt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  "Cadastrar e Entrar"
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Voltar para o Login
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>

      {onBackToLanding && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={onBackToLanding}
          className="mt-6 text-xs font-bold text-on-surface-variant/70 hover:text-primary transition-all flex items-center gap-1.5 cursor-pointer bg-surface/50 border border-outline-variant/10 px-4 py-2 rounded-xl backdrop-blur-sm"
        >
          ← Voltar para a Página Inicial
        </motion.button>
      )}
    </div>
  );
}
