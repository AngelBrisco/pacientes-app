import React, { useState } from "react";
import { User, Plus, Check } from "lucide-react";

interface UserSelectorProps {
  currentUser: string;
  onChangeUser: (username: string) => void;
}

export default function UserSelector({ currentUser, onChangeUser }: UserSelectorProps) {
  const [users, setUsers] = useState<string[]>([
    "Ángel Brisco",
    "QA Tester",
    "Soporte DevOps",
    "Administrador",
    "Invitado Especial"
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUsername.trim() && !users.includes(newUsername.trim())) {
      const sanitized = newUsername.trim();
      setUsers([...users, sanitized]);
      onChangeUser(sanitized);
      setNewUsername("");
      setShowAdd(false);
    }
  };

  return (
    <div id="user-selector-container" className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 shadow-sm text-sm">
      <div className="flex items-center gap-2 text-zinc-400">
        <User id="user-icon" className="w-4 h-4 text-emerald-400" />
        <span className="font-sans text-xs uppercase tracking-wider font-semibold">Usuario Activo:</span>
      </div>

      <div className="relative">
        <select
          id="user-dropdown"
          value={currentUser}
          onChange={(e) => onChangeUser(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-100 px-3 py-1 rounded-md text-sm cursor-pointer outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
        >
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <button
        id="btn-trigger-add-user"
        onClick={() => setShowAdd(!showAdd)}
        className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-all cursor-pointer"
        title="Crear Perfil de Usuario"
      >
        <Plus className="w-4 h-4" />
      </button>

      {showAdd && (
        <form onSubmit={handleAddUser} className="absolute top-16 right-4 sm:right-auto bg-zinc-950 border border-zinc-800 p-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-in fade-in" id="add-user-modal-form">
          <input
            type="text"
            required
            placeholder="Nuevo Usuario..."
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md text-xs px-2 py-1.5 text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500 w-36 font-sans"
            autoFocus
          />
          <button
            type="submit"
            className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-2 py-1.5 rounded-md text-xs font-semibold cursor-pointer flex items-center"
            id="btn-submit-new-user"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
