import React, { useState } from "react";
import { Snapshot, ScheduledSnapshot, TableSchema } from "../types";
import {
  Database,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  User,
  ShieldAlert,
  Archive,
  Layers,
  Calendar,
  Sparkles,
  Play,
  CheckCircle,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Sliders
} from "lucide-react";

interface BackupsViewProps {
  snapshots?: Snapshot[];
  scheduledSnapshots?: ScheduledSnapshot[];
  allTables?: TableSchema[];
  onTakeSnapshot: (name: string) => Promise<void>;
  onRestoreSnapshot: (id: string) => Promise<void>;
  onDeleteSnapshot: (id: string) => Promise<void>;
  onCreateScheduledRule?: (name: string, frequency: string, affectedTables: string[]) => Promise<void>;
  onDeleteScheduledRule?: (id: string) => Promise<void>;
  onTriggerScheduledRule?: (id: string) => Promise<void>;
  onToggleScheduledRuleActive?: (id: string, active: boolean) => Promise<void>;
  isSyncing?: boolean;
}

export default function BackupsView({
  snapshots = [],
  scheduledSnapshots = [],
  allTables = [],
  onTakeSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onCreateScheduledRule,
  onDeleteScheduledRule,
  onTriggerScheduledRule,
  onToggleScheduledRuleActive,
  isSyncing = false
}: BackupsViewProps) {
  // Tabs: "manual" or "settings"
  const [activeTab, setActiveTab] = useState<"manual" | "scheduled">("manual");
  
  // Manual backup state
  const [newSnapshotName, setNewSnapshotName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Scheduled configuration panel state
  const [ruleName, setRuleName] = useState("");
  const [ruleFrequency, setRuleFrequency] = useState<"hourly" | "daily" | "weekly">("daily");
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(["*"]);
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [ruleMessage, setRuleMessage] = useState("");

  const handleManualBackupSubmit = async (e: React.FormEvent) => {
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

  const handleCreateRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !onCreateScheduledRule) return;
    setIsCreatingRule(true);
    setRuleMessage("");
    try {
      await onCreateScheduledRule(ruleName.trim(), ruleFrequency, selectedTableIds);
      setRuleName("");
      setSelectedTableIds(["*"]);
      setRuleMessage("¡Tarea programada configurada con éxito!");
      setTimeout(() => setRuleMessage(""), 4000);
    } catch (err: any) {
      setRuleMessage(`Error: ${err.message || "No se pudo agendar"}`);
    } finally {
      setIsCreatingRule(false);
    }
  };

  const handleToggleActive = async (rule: ScheduledSnapshot) => {
    if (!onToggleScheduledRuleActive) return;
    try {
      await onToggleScheduledRuleActive(rule.id, !rule.active);
    } catch (err: any) {
      alert(`Error al cambiar estado de la regla: ${err.message}`);
    }
  };

  const handleDeleteRule = async (id: string, name: string) => {
    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente la programación '${name}'?`)) {
      if (!onDeleteScheduledRule) return;
      try {
        await onDeleteScheduledRule(id);
      } catch (err: any) {
        alert(`Error al borrar programación: ${err.message}`);
      }
    }
  };

  const handleTriggerRuleNow = async (id: string, name: string) => {
    if (confirm(`¿Ejecutar la tarea de copia '${name}' de forma manual ahora mismo?`)) {
      if (!onTriggerScheduledRule) return;
      try {
        await onTriggerScheduledRule(id);
        alert(`La tarea programada '${name}' se ejecutó exitosamente. El snapshot incremental fue añadido al historial.`);
      } catch (err: any) {
        alert(`Error en ejecución forzada: ${err.message}`);
      }
    }
  };

  const handleRestore = async (snap: Snapshot) => {
    const isSelective = snap.affectedTables && !snap.affectedTables.includes("*");
    const warningMsg = isSelective
      ? `⚠ RESTAURACIÓN PARCIAL/INCREMENTAL:\n¿Estás seguro de que deseas restaurar la base de datos desde '${snap.name}'?\n\nEsta copia de seguridad sólo afecta a las siguientes tablas: ${snap.tables.map(t => `'${t.name}'`).join(", ")}.\nEl resto de tus tablas no se alterarán. Esto restaurará el estado exacto de estas tablas al ${new Date(snap.timestamp).toLocaleString()} de forma irreversible.`
      : `⚠ RESTAURACIÓN COMPLETA:\n¿Estás seguro de que deseas restaurar la base de datos al estado del snapshot '${snap.name}'?\n\nEsto reemplazará todas las tablas, columnas y registros actuales por el estado registrado el ${new Date(snap.timestamp).toLocaleString()} de manera irreversible.`;
    
    if (confirm(warningMsg)) {
      try {
        await onRestoreSnapshot(snap.id);
        alert(`La restauración de la base de datos finalizó con éxito.`);
      } catch (err: any) {
        alert(`Error al restaurar copia: ${err.message}`);
      }
    }
  };

  const handleDeleteSnapshotLocal = async (snap: Snapshot) => {
    if (confirm(`¿Eliminar de forma permanente la copia de seguridad '${snap.name}'?`)) {
      try {
        await onDeleteSnapshot(snap.id);
      } catch (err: any) {
        alert(`Error al eliminar copia: ${err.message}`);
      }
    }
  };

  const toggleTableSelection = (tableId: string) => {
    if (tableId === "*") {
      setSelectedTableIds(["*"]);
    } else {
      let next = selectedTableIds.filter(id => id !== "*");
      if (next.includes(tableId)) {
        next = next.filter(id => id !== tableId);
      } else {
        next.push(tableId);
      }
      if (next.length === 0) {
        next = ["*"];
      }
      setSelectedTableIds(next);
    }
  };

  return (
    <div id="backups-management-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Upper section describing snapshots setup & branding change */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/80">
        <div className="space-y-1">
          <h3 className="font-sans font-bold text-lg text-zinc-100 flex items-center gap-2">
            <Archive className="w-5 h-5 text-indigo-400" />
            NocoClone Copias & Programación (Snapshots)
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
            Crea puntos de restauración para tus datos. Gestiona copias completas de manera manual o configura complejas tareas programadas incrementales decidiendo exactamente qué tablas son afectadas.
          </p>
        </div>

        {/* Workspace views tabs selector */}
        <div className="flex bg-zinc-950 p-1.5 rounded-xl border border-zinc-850 self-start shrink-0">
          <button
            onClick={() => setActiveTab("manual")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
              activeTab === "manual"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Copias Manuales
          </button>
          <button
            onClick={() => setActiveTab("scheduled")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "scheduled"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Programación Automática
          </button>
        </div>
      </div>

      {activeTab === "manual" ? (
        <div className="space-y-6" id="manual-backups-interactive-tab">
          
          {/* Manual Snapshot Form wrapper */}
          <div className="p-4 bg-zinc-900/15 border border-zinc-850 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-left">
              <span className="block text-xs font-semibold text-zinc-200 font-sans">Tomar copia de seguridad manual instantánea</span>
              <span className="block text-[11px] text-zinc-500">Respalda todo el esquema estructurado actual en un snapshot frío.</span>
            </div>
            
            <form onSubmit={handleManualBackupSubmit} className="flex items-center gap-2 w-full md:w-auto" id="create-snapshot-form">
              <input
                type="text"
                required
                placeholder="Nombre descriptivo, ej. Pre-limpieza"
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                disabled={isCreating}
                className="bg-zinc-950 border border-zinc-800 rounded-lg text-xs px-3 py-2 text-zinc-100 outline-none focus:ring-1 focus:ring-indigo-550 font-sans w-full sm:w-64"
              />
              <button
                type="submit"
                disabled={isCreating || !newSnapshotName.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-505 disabled:bg-zinc-800 disabled:text-zinc-650 outline-none text-white font-bold text-xs rounded-lg cursor-pointer transition-all flex items-center gap-1 shrink-0 bg-indigo-610"
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

          {/* Snapshots Table List */}
          <div className="bg-zinc-900/30 border border-zinc-850 rounded-2xl overflow-hidden" id="snapshots-grid-container">
            <div className="px-5 py-4 border-b border-zinc-850 flex items-center justify-between bg-zinc-900/20">
              <span className="font-mono text-[10px] uppercase font-bold text-zinc-500 tracking-widest flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-400" /> Registro de Snapshots e Incrementales
              </span>
              <span className="font-mono text-[10px] text-zinc-400 font-bold bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-full">
                {snapshots.length} Copias Registradas
              </span>
            </div>

            {snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3" id="empty-snapshots-panel">
                <ShieldAlert className="w-10 h-10 text-zinc-700" />
                <div className="space-y-1">
                  <span className="block text-zinc-350 font-sans font-semibold text-xs">No hay copias de seguridad estables</span>
                  <span className="block text-[11px] text-zinc-500 max-w-sm">
                    Usa el campo superior para congelar el estado de tu base de datos antes de realizar cambios de estructura arriesgados.
                  </span>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" id="snapshots-table-gui">
                  <thead>
                    <tr className="bg-zinc-950/70 text-zinc-400 tracking-wider text-[10px] uppercase font-mono border-b border-zinc-800 font-bold">
                      <th className="px-5 py-3">Nombre del Snapshot / Origen</th>
                      <th className="px-5 py-3">Fecha de Creación</th>
                      <th className="px-5 py-3">Método / Creador</th>
                      <th className="px-5 py-3">Tablas Afectadas en esta Copia</th>
                      <th className="px-5 py-3 text-right text-indigo-400 font-sans">Acciones de Restauración</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-xs text-zinc-300">
                    {[...snapshots].reverse().map((snap) => {
                      const isRuleDriven = snap.name.startsWith("[Programado]") || snap.name.startsWith("[Manual run]");
                      const isSelective = snap.affectedTables && !snap.affectedTables.includes("*");
                      
                      return (
                        <tr key={snap.id} className="hover:bg-zinc-900/10 transition-all font-sans" id={`snap-row-${snap.id}`}>
                          {/* Name */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5">
                              <span className="block font-bold text-zinc-100">{snap.name}</span>
                              <span className="block text-[10px] text-zinc-500 font-mono">ID: {snap.id}</span>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="px-5 py-4 text-zinc-400">
                            <span className="flex items-center gap-1.5 font-mono text-[11px]">
                              <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              {new Date(snap.timestamp).toLocaleString()}
                            </span>
                          </td>

                          {/* Method / Creator */}
                          <td className="px-5 py-4">
                            <span className="flex items-center gap-1.5 text-[11.5px] font-medium">
                              {isRuleDriven ? (
                                <span className="p-1 px-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9.5px] rounded-full font-mono uppercase font-bold">Automatic task</span>
                              ) : (
                                <span className="p-1 px-2 bg-zinc-800 text-zinc-400 border border-zinc-700 text-[9.5px] rounded-full font-mono uppercase">Manual backup</span>
                              )}
                              <span className="text-zinc-400 text-xs">({snap.creator})</span>
                            </span>
                          </td>

                          {/* Backed Tables */}
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {isSelective ? (
                                <div className="space-y-1">
                                  <span className="block text-[10px] text-indigo-400 font-bold uppercase font-mono tracking-widest bg-indigo-500/10 p-0.5 px-1.5 border border-indigo-500/20 rounded max-w-max">Copia Incremental</span>
                                  <div className="flex flex-wrap gap-1">
                                    {snap.tables.map(t => (
                                      <span key={t.id} className="text-[10px] font-mono bg-zinc-950 border border-zinc-850 text-emerald-400 px-1.5 py-0.5 rounded">
                                        {t.name} ({t.rows?.length || 0} r)
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                snap.tables && snap.tables.length > 0 ? (
                                  snap.tables.map(t => (
                                    <span key={t.id} className="text-[10px] font-mono bg-zinc-950 border border-zinc-850 text-zinc-400 px-1.5 py-0.5 rounded">
                                      {t.name} ({t.rows?.length || 0} r)
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-zinc-650 italic">Esquema vacío</span>
                                )
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2.5">
                              {/* Restore Button */}
                              <button
                                id={`btn-restore-snap-${snap.id}`}
                                onClick={() => handleRestore(snap)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-sans font-bold rounded-lg text-[10.5px] cursor-pointer transition-all flex items-center gap-1 active:scale-95"
                              >
                                <RefreshCw className="w-3 h-3 shrink-0" />
                                <span>{isSelective ? "Restaurar Selectiva" : "Restaurar Completa"}</span>
                              </button>

                              {/* Delete Button */}
                              <button
                                id={`btn-delete-snap-${snap.id}`}
                                onClick={() => handleDeleteSnapshotLocal(snap)}
                                className="p-1 px-2 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded-lg cursor-pointer transition-all border border-transparent hover:border-zinc-700"
                                title="Eliminar de forma permanente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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
      ) : (
        <div className="space-y-6" id="automatic-backups-scheduling-tab">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Create configuration rule form Column */}
            <div className="lg:col-span-5 bg-zinc-900/30 p-5 rounded-2xl border border-zinc-850 space-y-4">
              <div className="space-y-1">
                <span className="font-sans font-bold text-xs text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  Nueva Regla de Snapshot Programado
                </span>
                <p className="text-[11px] text-zinc-400">
                  Define tareas periódicas automáticas y escoge específicamente qué tablas son resguardadas incrementalmente.
                </p>
              </div>

              {ruleMessage && (
                <div className={`p-2.5 px-3 rounded-lg text-xs font-medium font-sans flex items-center gap-2 ${
                  ruleMessage.startsWith("Error") ? "bg-rose-500/10 border border-rose-500/20 text-rose-400" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                }`}>
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{ruleMessage}</span>
                </div>
              )}

              <form onSubmit={handleCreateRuleSubmit} className="space-y-4 text-left">
                {/* Rule Name */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-zinc-400 uppercase font-bold">Nombre de la Programación:</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Historial Diario de Pacientes"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    disabled={isCreatingRule}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs px-3 py-2 text-zinc-100 outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                  />
                </div>

                {/* Frequency selector */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-zinc-400 uppercase font-bold">Frecuencia de Ejecución:</label>
                  <select
                    value={ruleFrequency}
                    onChange={(e) => setRuleFrequency(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs p-2 text-zinc-300 outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="hourly">⏰ Cada Hora (Hourly - Alta seguridad)</option>
                    <option value="daily">📅 Diario (Daily - Recomendado)</option>
                    <option value="weekly">📆 Semanal (Weekly - Frío)</option>
                  </select>
                </div>

                {/* Affected Tables Checkboxes Multi-select */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono text-zinc-400 uppercase font-bold">Tablas Afectadas (Copia de Seguridad):</label>
                  
                  <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-3 max-h-56 overflow-y-auto space-y-2.5 custom-scrollbar">
                    {/* ALL TABLES GLOB OPTION */}
                    <label className="flex items-start gap-2.5 cursor-pointer select-none text-zinc-300 hover:text-zinc-100 p-1 rounded hover:bg-zinc-900/30">
                      <input
                        type="checkbox"
                        checked={selectedTableIds.includes("*")}
                        onChange={() => toggleTableSelection("*")}
                        className="mt-0.5 accent-indigo-550 border-zinc-700 bg-zinc-900 rounded"
                      />
                      <div>
                        <span className="block text-xs font-bold font-sans">Todas las Tablas (Esquema Completo)</span>
                        <span className="block text-[10px] text-zinc-500 leading-none">Respaldo total de tablas, filas y columnas actuales y futuras.</span>
                      </div>
                    </label>

                    <div className="border-t border-zinc-900 py-1.5 space-y-2">
                      <span className="block text-[10px] font-mono tracking-wider font-bold text-zinc-600 uppercase">O SELECCIONA ALGUNAS TABLAS (Incremental):</span>
                      
                      {allTables.map(t => {
                        const isChecked = selectedTableIds.includes(t.id);
                        const isDisabled = selectedTableIds.includes("*");
                        
                        return (
                          <label key={t.id} className={`flex items-start gap-2.5 cursor-pointer select-none p-1 rounded transition-colors ${
                            isDisabled ? "opacity-40 cursor-not-allowed" : "hover:text-zinc-100 text-zinc-400 hover:bg-zinc-820/20"
                          }`}>
                            <input
                              type="checkbox"
                              disabled={isDisabled}
                              checked={isDisabled ? false : isChecked}
                              onChange={() => toggleTableSelection(t.id)}
                              className="mt-0.5 accent-indigo-550 border-zinc-700 bg-zinc-900 rounded"
                            />
                            <div>
                              <span className="block text-xs font-bold font-sans">{t.name}</span>
                              <span className="block text-[10px] text-zinc-500 font-mono">ID: {t.id} • {t.rows?.length || 0} filas estructuradas</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreatingRule || !ruleName.trim()}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-505 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-sans font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Programar Copias</span>
                </button>
              </form>
            </div>

            {/* Configured Scheduled Tasks list Column */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-zinc-900/30 border border-zinc-850 rounded-2xl overflow-hidden" id="programmed-routines-container">
                <div className="px-5 py-4 border-b border-zinc-850 flex items-center justify-between bg-zinc-900/20">
                  <span className="font-mono text-[10px] uppercase font-bold text-zinc-500 tracking-widest flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Rutinas Activas de Copia Programada
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400 font-bold bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-full">
                    {scheduledSnapshots.length} rutinas de cron
                  </span>
                </div>

                {scheduledSnapshots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-3" id="empty-schedules-panel">
                    <Clock className="w-10 h-10 text-zinc-700" />
                    <div className="space-y-1">
                      <span className="block text-zinc-350 font-sans font-semibold text-xs text-zinc-300">No hay programaciones agendadas</span>
                      <span className="block text-[11px] text-zinc-500 max-w-sm">
                        Configura parámetros en el panel izquierdo para automatizar las copias e incrementales silenciosamente en el motor local.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/50 p-1">
                    {scheduledSnapshots.map(rule => {
                      const isAll = rule.affectedTables.includes("*");
                      
                      return (
                        <div key={rule.id} className="p-4 hover:bg-zinc-900/10 transition-all font-sans flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div className="space-y-1.5 text-left flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-200 truncate pr-1">{rule.name}</span>
                              <span className="p-0.5 px-2 bg-indigo-650/20 text-indigo-400 text-[9px] font-mono rounded font-bold uppercase shrink-0 border border-indigo-500/10">{rule.frequency}</span>
                            </div>

                            <div className="text-[11px] text-zinc-400 space-y-1 font-sans">
                              {/* Table rules */}
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-zinc-550 font-bold">TABLAS AFECTADAS:</span>
                                {isAll ? (
                                  <span className="text-zinc-400 italic">Esquema Completo (*)</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {rule.affectedTables.map(tId => {
                                      const mappedTable = allTables.find(at => at.id === tId);
                                      return (
                                        <span key={tId} className="bg-zinc-950 border border-zinc-850 p-0.5 px-1 rounded text-[10px] text-indigo-400 font-mono font-medium">
                                          {mappedTable ? mappedTable.name : tId}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Timestamps status helper */}
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-550">
                                <div>Última corrida: <b className="text-zinc-400">{rule.lastRun ? new Date(rule.lastRun).toLocaleString() : "Ninguna (Pendiente)"}</b></div>
                                <div>Siguiente corrida: <b className="text-indigo-400">{rule.nextRun ? new Date(rule.nextRun).toLocaleString() : "Calculando..."}</b></div>
                              </div>
                            </div>
                          </div>

                          {/* Control elements */}
                          <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
                            {/* Toggle active button */}
                            <button
                              onClick={() => handleToggleActive(rule)}
                              className="p-1 text-zinc-400 hover:text-white roundedcursor-pointer transition-colors"
                              title={rule.active ? "Desactivar Automatización" : "Activar Automatización"}
                            >
                              {rule.active ? (
                                <ToggleRight className="w-8 h-8 text-indigo-400" />
                              ) : (
                                <ToggleLeft className="w-8 h-8 text-zinc-600" />
                              )}
                            </button>

                            {/* Trigger manually now button */}
                            <button
                              onClick={() => handleTriggerRuleNow(rule.id, rule.name)}
                              className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-750 text-indigo-400 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all flex items-center gap-1.5"
                              title="Ejecutar copia ahora de forma forzada"
                            >
                              <Play className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>Forzar Run</span>
                            </button>

                            {/* Trash button */}
                            <button
                              onClick={() => handleDeleteRule(rule.id, rule.name)}
                              className="p-1.5 text-zinc-550 hover:text-rose-400 hover:bg-zinc-900 rounded-lg cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Deduplication elegant Explanation layout box */}
              <div className="bg-zinc-950/45 p-4 rounded-2xl border border-zinc-850 text-left space-y-2">
                <h4 className="text-xs font-bold text-zinc-305 flex items-center gap-1.5 font-sans">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Garantía de Desduplicación Incremental de Adjuntos
                </h4>
                <p className="text-[11px] text-zinc-450 leading-relaxed font-sans">
                  El sistema utiliza una arquitectura <b>incremental avanzada por diseño</b>. Al tomar cualquier snapshot, manual o automático, la base estructural almacena únicamente la ruta simbólica inestimable de los adjuntos cargados. Las imágenes, PDFs y binarios físicos reales permanecen inalterables en un volumen desduplicado protegido en <code>/data/uploads</code>, eliminando redundancias, evitando desperdicio en disco de espacio en tu hosting Cloud, y garantizando la mayor velocidad de respaldo.
                </p>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
