import React, { useState } from "react";
import { Lock, User, Terminal, AlertCircle, Database, ShieldCheck, HelpCircle } from "lucide-react";
import { UserAccount } from "../types";

interface LoginViewProps {
  onLoginSuccess: (user: UserAccount) => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Complete todos los campos obligatorios.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Inicio de sesión denegado.");
      }

      const user: UserAccount = await res.json();
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo autenticar en el servidor local de base de datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-screen-outer" className="min-h-screen w-full bg-[#09090b] flex items-center justify-center p-4 relative overflow-hidden select-none">
      
      {/* Background soft glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative z-10 animate-in fade-in zoom-in duration-300">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-indigo-600/15 border border-indigo-505/25 text-indigo-400 rounded-xl mb-1">
            <Database className="w-7 h-7" />
          </div>
          <h1 className="font-sans font-extrabold text-2xl text-zinc-100 tracking-tight">Schema Studio</h1>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">Relational Schema Control Panel</p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2.5" id="login-error-display">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="font-sans font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs">
          
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-semibold block uppercase tracking-wider text-[10px]">Nombre de Usuario</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                required
                disabled={loading}
                placeholder="Ej. admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#09090b] border border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-zinc-200 placeholder-zinc-650 outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-text text-sm transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-400 font-semibold block uppercase tracking-wider text-[10px]">Contraseña de Acceso</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                disabled={loading}
                placeholder="Ej. admin123"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#09090b] border border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-zinc-200 placeholder-zinc-650 outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-text text-sm transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 mt-6 shadow-md shadow-indigo-600/10 disabled:opacity-50"
            id="btn-login-submit"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Establecer Conexión de Sesión</span>
              </>
            )}
          </button>
        </form>



      </div>
    </div>
  );
}
