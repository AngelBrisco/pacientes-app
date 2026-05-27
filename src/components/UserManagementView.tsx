import React, { useState, useEffect } from "react";
import { UserAccount } from "../types";
import { 
  Users, UserPlus, Trash2, Key, Sparkles, Shield, Eye, Lock, 
  Settings, UserCheck, AlertOctagon, HelpCircle 
} from "lucide-react";

interface UserManagementViewProps {
  currentUser: UserAccount;
}

export default function UserManagementView({ currentUser }: UserManagementViewProps) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states for creating/editing users
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<'admin' | 'user'>("user");
  const [permissions, setPermissions] = useState<'read-write' | 'read-only'>("read-write");
  
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        headers: {
          "x-user-username": currentUser.username,
        }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudo consultar el registro de usuarios.");
      }
      const data: UserAccount[] = await res.json();
      setUsers(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Fallo de comunicación en el control de accesos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !name.trim() || !password) {
      alert("Por favor complete todos los parámetros solicitados.");
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-username": currentUser.username
        },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          name: name.trim(),
          password,
          role,
          permissions
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fallo en el servidor al registrar usuario.");
      }

      const updatedUsers: UserAccount[] = await res.json();
      setUsers(updatedUsers);

      // Reset form fields
      setUsername("");
      setName("");
      setPassword("");
      setRole("user");
      setPermissions("read-write");
    } catch (err: any) {
      console.error(err);
      alert(`Reject DDL User Manager: ${err.message}`);
    }
  };

  const handleUpdatePermissions = async (userId: string, targetPermissions: 'read-write' | 'read-only', targetRole?: 'admin' | 'user') => {
    try {
      const userToUpdate = users.find(u => u.id === userId);
      if (!userToUpdate) return;

      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-username": currentUser.username
        },
        body: JSON.stringify({
          permissions: targetPermissions,
          role: targetRole || userToUpdate.role
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al actualizar usuario.");
      }

      const updated: UserAccount[] = await res.json();
      setUsers(updated);
    } catch (err: any) {
      console.error(err);
      alert(`Reject Update User permissions: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const u = users.find(x => x.id === userId);
    if (!u) return;
    
    if (u.username === "admin") {
      alert("No puedes borrar al Administrador maestro de la base de datos.");
      return;
    }

    if (!confirm(`¿Está completamente seguro de eliminar a la cuenta física de '${u.name}'? Perderá acceso inmediato.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: {
          "x-user-username": currentUser.username
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudo borrar el usuario.");
      }

      const updated: UserAccount[] = await res.json();
      setUsers(updated);
    } catch (err: any) {
      console.error(err);
      alert(`Error al eliminar usuario: ${err.message}`);
    }
  };

  return (
    <div id="user-mgmt-container" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Intro Bannner */}
      <div className="bg-zinc-90 w-full max-w-full p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start gap-3 shadow-xs">
        <Users className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-sans font-bold text-xs text-zinc-150 uppercase tracking-wider">Mapeo del Control de Accesos y Privilegios</h3>
          <p className="text-xs text-zinc-400 font-sans leading-relaxed">
            Consola administrativa para la creación de credenciales, cambio de perfiles y roles. Los privilegios se validan tanto en la UI como a nivel de API REST en el servidor Node.js.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Form component */}
        <div className="lg:col-span-4" id="add-user-card-panel">
          <div className="bg-zinc-900 border border-zinc-805 rounded-xl p-4 space-y-4">
            <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-800/80 pb-2">
              <UserPlus className="w-3.5 h-3.5 text-indigo-400" /> Crear nueva cuenta física
            </h4>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs font-sans">
              <div className="space-y-1">
                <label className="text-zinc-400 font-medium block">Nombre de Usuario (Login)</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. marta"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 placeholder-zinc-700 outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-400 font-medium block">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Marta Gómez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 placeholder-zinc-700 outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-400 font-medium block">Contraseña de entrada</label>
                <input
                  type="password"
                  required
                  placeholder="Clave de acceso..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 placeholder-zinc-700 outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-400 font-medium block">Rol de Sistema</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500 text-xs text-zinc-350 cursor-pointer"
                  >
                    <option value="user">Usuario Común</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-400 font-medium block">Permiso SQL</label>
                  <select
                    value={permissions}
                    onChange={(e) => setPermissions(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500 text-xs text-zinc-350 cursor-pointer"
                  >
                    <option value="read-write">Lectura y Escritura</option>
                    <option value="read-only">Sólo Lectura</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg cursor-pointer text-xs mt-3 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                id="btn-submit-signup-user"
              >
                <UserCheck className="w-4 h-4" />
                <span>Registrar en Postgres</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: User tables list with options */}
        <div className="lg:col-span-8 space-y-4" id="all-users-list-panel">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
            <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-800/80 pb-2">
              <Settings className="w-3.5 h-3.5 text-indigo-400" /> Registro Físico de Cuentas ({users.length})
            </h4>

            {loading ? (
              <div className="py-20 text-center text-zinc-500 font-mono text-xs uppercase font-bold animate-pulse">
                Consultando catálogo de roles...
              </div>
            ) : error ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <AlertOctagon className="w-5 h-5" />
                <span>{error}</span>
              </div>
            ) : (
              <div className="overflow-x-auto min-w-full">
                <table className="w-full border-collapse text-left font-sans text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 pb-2 text-zinc-500 uppercase font-bold text-[9px] tracking-wider font-mono">
                      <th className="pb-2.5">Nombre & Login</th>
                      <th className="pb-2.5">Rol de Sistema</th>
                      <th className="pb-2.5">Acceso a DDL / Datos</th>
                      <th className="pb-2.5">Contraseña Plana</th>
                      <th className="pb-2.5 text-right w-16">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 select-none">
                    {users.map((u) => {
                      const isMainAdmin = u.username === "admin";
                      return (
                        <tr key={u.id} className="row-hover" id={`user-row-${u.id}`}>
                          <td className="py-3 pr-2">
                            <div className="space-y-0.5">
                              <span className="font-bold text-zinc-200 block">{u.name}</span>
                              <code className="text-indigo-400 font-mono text-[10.5px]">@{u.username}</code>
                            </div>
                          </td>
                          <td className="py-3">
                            <select
                              value={u.role}
                              disabled={isMainAdmin}
                              onChange={(e) => handleUpdatePermissions(u.id, u.permissions, e.target.value as any)}
                              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-350 cursor-pointer focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="user">user (Común)</option>
                              <option value="admin">admin (Administrador)</option>
                            </select>
                          </td>
                          <td className="py-3">
                            <select
                              value={u.permissions}
                              disabled={isMainAdmin}
                              onChange={(e) => handleUpdatePermissions(u.id, e.target.value as any, u.role)}
                              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-350 cursor-pointer focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="read-write">read-write (Lectura y Escritura)</option>
                              <option value="read-only">read-only (Sólo Lectura)</option>
                            </select>
                          </td>
                          <td className="py-3 font-mono text-zinc-500">
                            {u.password ? (
                              <span className="bg-zinc-950 border border-zinc-900 px-2 py-1 rounded text-[11px] text-zinc-400 font-semibold select-all">
                                {u.password}
                              </span>
                            ) : (
                              <span className="italic">encriptado</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              disabled={isMainAdmin}
                              onClick={() => handleDeleteUser(u.id)}
                              className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={isMainAdmin ? "No se puede eliminar el administrador principal" : "Eliminar cuenta"}
                              id={`btn-del-user-${u.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
