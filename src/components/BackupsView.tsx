import React, { useState } from "react";
import { Snapshot } from "../types";
import {
  Database,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  User,
  ShieldAlert,
  Archive,
  Layers
} from "lucide-react";

interface BackupsViewProps {
  snapshots?: Snapshot[];
  onTakeSnapshot: (name: string) => Promise<void>;
  onRestoreSnapshot: (id: string) => Promise<void>;
  onDeleteSnapshot: (id: string) => Promise<void>;
  isSyncing?: boolean;
}

export default function BackupsView({
  snapshots = [],
  onTakeSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  isSyncing = false
}: BackupsViewProps) {
  const [newSnapshotName, setNewSnapshotName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSnapshotName.trim()) return;
    setIsCreating(true);
    try {
      await onTakeSnapshot(newSnapshotName.trim());
      setNewSnapshotName("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (snap: Snapshot) => {
    if (confirm(`⚠ ADVERTENCIA CRÍTICA: ¿Estás seguro de que deseas restaurar la base de datos a la copia '${snap.name}'?\n\nEsto reemplazará todas las tablas, columnas y registros actuales por el estado registrado el ${new Date(snap.timestamp).toLocaleString()} de forma irreversible.`)) {
      try {
        await onRestoreSnapshot(snap.id);
        alert(`La restauración de la base de datos desde '${snap.name}' finalizó con éxito.`);
      } catch (err: any) {
        alert(`Error al restaurar copia: ${err.message}`);
      }
    }
  };

  const handleDelete = async (snap: Snapshot) => {
    if (confirm(`¿Eliminar de forma permanente la copia de seguridad '${snap.name}'?`)) {
      try {
        await onDeleteSnapshot(snap.id);
      } catch (err: any) {
        alert(`Error al eliminar copia: ${err.message}`);
      }
    }
  };

  return (
    <div id="backups-management-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/80">
        <div className="space-y-1">
          <h3 className="font-sans font-bold text-lg text-zinc-100 flex items-center gap-2">
            <Archive className="w-5 h-5 text-indigo-400" />
            Copias de Seguridad (Snapshots)
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
            Crea y administra puntos de restauración estables para toda la base de datos relacional. 
            Si un usuario elimina o altera incorrectamente los datos de las tablas, puedes regresar el estado completo a cualquiera de estos snapshots de manera inmediata.
          </p>
        </div>

        {/* Create Backup Mini Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2" id="create-snapshot-form">
          <input
            type="text"
            required
            placeholder="Nombre de la copia..."
            value={newSnapshotName}
            onChange={(e) => setNewSnapshotName(e.target.value)}
            disabled={isCreating}
            className="bg-zinc-950 border border-zinc-800 rounded-lg text-xs px-3 py-2 text-zinc-100 outline-none focus:ring-1 focus:ring-indigo-500 font-sans w-52 md:w-64"
          />
          <button
            type="submit"
            disabled={isCreating || !newSnapshotName.trim()}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 outline-none text-white font-semibold text-xs rounded-lg cursor-pointer transition-all flex items-center gap-1 shrink-0"
            id="btn-trigger-snapshot-create"
          >
            {isCreating ? (
              <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Tomar Snapshot</span>
          </button>
        </form>
      </div>

      {/* Snapshots Table/Collection Grid */}
      <div className="bg-zinc-900/30 border border-zinc-850 rounded-2xl overflow-hidden" id="snapshots-grid-container">
        <div className="px-5 py-4 border-b border-zinc-850 flex items-center justify-between bg-zinc-900/20">
          <span className="font-mono text-[10px] uppercase font-bold text-zinc-500 tracking-widest flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-indigo-400" /> Historial de Copias Persistentes
          </span>
          <span className="font-mono text-[10px] text-zinc-400 font-bold bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-full">
            {snapshots.length} Snapshots
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3" id="empty-snapshots-panel">
            <ShieldAlert className="w-10 h-10 text-zinc-700" />
            <div className="space-y-1">
              <span className="block text-zinc-300 font-sans font-semibold text-xs">No hay copias de seguridad guardadas</span>
              <span className="block text-[11px] text-zinc-500 max-w-sm">
                Introduce un nombre en el formulario superior para congelar un snapshot de las tablas actuales.
              </span>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="snapshots-table-gui">
              <thead>
                <tr className="bg-zinc-950/70 text-zinc-400 tracking-wider text-[10px] uppercase font-mono border-b border-zinc-800 font-bold">
                  <th className="px-5 py-3">Nombre del Snapshot</th>
                  <th className="px-5 py-3">Fecha de Creación</th>
                  <th className="px-5 py-3">Creador</th>
                  <th className="px-5 py-3">Tablas Respaldadas</th>
                  <th className="px-5 py-3 text-right">Acciones de Restauración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-xs">
                {[...snapshots].reverse().map((snap) => (
                  <tr key={snap.id} className="hover:bg-zinc-900/20 transition-all font-sans" id={`snap-row-${snap.id}`}>
                    {/* Name */}
                    <td className="px-5 py-4 font-bold text-zinc-200">
                      {snap.name}
                    </td>

                    {/* Timestamp */}
                    <td className="px-5 py-4 text-zinc-400">
                      <span className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        {new Date(snap.timestamp).toLocaleString()}
                      </span>
                    </td>

                    {/* Creator */}
                    <td className="px-5 py-4 text-zinc-300">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                        {snap.creator}
                      </span>
                    </td>

                    {/* Tables backed up list */}
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {snap.tables && snap.tables.length > 0 ? (
                          snap.tables.map(t => (
                            <span key={t.id} className="text-[10px] font-mono bg-zinc-950 border border-zinc-850 text-zinc-400 px-1.5 py-0.5 rounded">
                              {t.name} ({t.rows?.length || 0})
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-zinc-650 italic">BD Vacía</span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* RESTORE BUTTON */}
                        <button
                          id={`btn-restore-snap-${snap.id}`}
                          onClick={() => handleRestore(snap)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold rounded text-[10px] cursor-pointer transition-all flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3 shrink-0" />
                          <span>Restaurar BD</span>
                        </button>

                        {/* DELETE BUTTON */}
                        <button
                          id={`btn-delete-snap-${snap.id}`}
                          onClick={() => handleDelete(snap)}
                          className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded cursor-pointer transition-all"
                          title="Eliminar Snapshot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
