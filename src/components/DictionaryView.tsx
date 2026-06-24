import React, { useState } from "react";
import { TableSchema, Column, ColumnType, TableCorrelation } from "../types";
import { 
  BookOpen, Key, Hash, HelpCircle, HardDrive, Cpu, Terminal, FileJson, 
  AlertCircle, Edit2, Save, X, Plus, Settings, Shuffle, Trash2, RefreshCw, 
  Play, CheckCircle, AlertTriangle, Link 
} from "lucide-react";

interface DictionaryViewProps {
  table: TableSchema;
  onEditColumn: (columnId: string, name: string, type: ColumnType, options?: string[], varcharLength?: number) => Promise<void>;
  onSetPrimaryColumn: (columnId: string) => Promise<void>;
  allTables?: TableSchema[];
  correlations?: TableCorrelation[];
  apiAction?: (url: string, method: string, body?: any) => Promise<void>;
}

export default function DictionaryView({ 
  table, 
  onEditColumn, 
  onSetPrimaryColumn,
  allTables = [],
  correlations = [],
  apiAction
}: DictionaryViewProps) {
  const [activeTab, setActiveTab] = useState<"schema" | "correlations">("schema");
  const [selectedRowId, setSelectedRowId] = useState<string>("");

  // Edit Column State
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editType, setEditType] = useState<ColumnType>("text");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editVarcharLength, setEditVarcharLength] = useState<number>(50);
  const [newOptionText, setNewOptionText] = useState<string>("");

  // New Correlation State
  const [sourceTableId, setSourceTableId] = useState<string>(table.id);
  const [sourceColumnId, setSourceColumnId] = useState<string>("");
  const [targetTableId, setTargetTableId] = useState<string>("");
  const [targetColumnId, setTargetColumnId] = useState<string>("");
  const [isSubmittingCorr, setIsSubmittingCorr] = useState(false);
  const [syncingCorrId, setSyncingCorrId] = useState<string | null>(null);

  const handleStartEdit = (col: Column) => {
    setEditingColId(col.id);
    setEditName(col.name);
    setEditType(col.type);
    setEditOptions(col.options || []);
    setEditVarcharLength(col.varcharLength || 50);
    setNewOptionText("");
  };

  const handleAddOption = () => {
    const trimmed = newOptionText.trim();
    if (!trimmed) return;
    if (editOptions.includes(trimmed)) {
      alert("La opción ya existe en las restricciones CHECK.");
      return;
    }
    setEditOptions([...editOptions, trimmed]);
    setNewOptionText("");
  };

  const handleRemoveOption = (opt: string) => {
    setEditOptions(editOptions.filter(o => o !== opt));
  };

  const handleSave = async (colId: string) => {
    if (!editName.trim()) {
      alert("El nombre de la columna es un campo obligatorio.");
      return;
    }
    try {
      await onEditColumn(
        colId, 
        editName, 
        editType, 
        editType === "select" ? editOptions : undefined, 
        editType === "select" ? editVarcharLength : undefined
      );
      setEditingColId(null);
    } catch (err: any) {
      alert(`Error al guardar columna: ${err.message}`);
    }
  };

  // Create correlation
  const handleCreateCorrelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTableId || !sourceColumnId || !targetTableId || !targetColumnId) {
      alert("Por favor completa todos los campos de la relación.");
      return;
    }
    if (sourceTableId === targetTableId) {
      alert("La tabla origen y destino de la correlación deben ser distintas.");
      return;
    }
    
    setIsSubmittingCorr(true);
    try {
      if (apiAction) {
        await apiAction("/api/db/correlations", "POST", {
          sourceTableId,
          sourceColumnId,
          targetTableId,
          targetColumnId
        });
        // Clear state
        setTargetTableId("");
        setSourceColumnId("");
        setTargetColumnId("");
      }
    } catch (err: any) {
      alert(`Error al crear correlación: ${err.message}`);
    } finally {
      setIsSubmittingCorr(false);
    }
  };

  // Toggle active correlation
  const handleToggleCorrelation = async (corrId: string, currentActive: boolean) => {
    if (!apiAction) return;
    try {
      await apiAction(`/api/db/correlations/${corrId}`, "PUT", {
        active: !currentActive
      });
    } catch (err: any) {
      alert(`Error al cambiar estado de correlación: ${err.message}`);
    }
  };

  // Delete correlation
  const handleDeleteCorrelation = async (corrId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta correlación inteligente?")) return;
    if (!apiAction) return;
    try {
      await apiAction(`/api/db/correlations/${corrId}`, "DELETE");
    } catch (err: any) {
      alert(`Error al eliminar correlación: ${err.message}`);
    }
  };

  // Force retrospective correlation synchronization
  const handleForceSync = async (corrId: string) => {
    if (!apiAction) return;
    setSyncingCorrId(corrId);
    try {
      await apiAction(`/api/db/correlations/${corrId}/sync`, "POST");
      alert("Sincronización retrospectiva completada con éxito. Se han propagado los campos coincidentes de forma recursiva.");
    } catch (err: any) {
      alert(`Error en sincronización: ${err.message}`);
    } finally {
      setSyncingCorrId(null);
    }
  };

  // Find column options for selector
  const getColumnsForTable = (tableId: string) => {
    const t = allTables.find(tbl => tbl.id === tableId);
    return t ? t.columns : [];
  };

  // Auto-select first row if exists
  const activeRowId = selectedRowId || (table.rows && table.rows[0]?.id) || "";
  const activeRow = table.rows?.find((r) => r.id === activeRowId);

  // Stats: Data density (Non-null/non-empty rows percentage)
  const getDensity = (colId: string) => {
    if (!table.rows || table.rows.length === 0) return "0%";
    const nonNullCount = table.rows.filter(
      (r) => r[colId] !== undefined && r[colId] !== null && String(r[colId]).trim() !== ""
    ).length;
    return `${Math.round((nonNullCount / table.rows.length) * 100)}%`;
  };

  // Maps physical SQL/DB type counterparts
  const getSqlTypeHint = (col: Column) => {
    switch (col.type) {
      case "number":
        return "NUMERIC(12, 2)";
      case "boolean":
        return "BOOLEAN DEFAULT FALSE";
      case "date":
        return "DATE";
      case "select":
        return `VARCHAR(${col.varcharLength || 50}) CHECK (${col.name.toLowerCase()} IN (${(col.options || [])
          .map((o) => `'${o}'`)
          .join(", ")}))`;
      case "text":
      default:
        return "VARCHAR(255)";
    }
  };

  return (
    <div id="dictionary-view-container" className="space-y-6 animate-in fade-in duration-200">
      {/* Overview Intro */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-sans font-bold text-sm text-zinc-100 uppercase tracking-wider">Diccionario de Datos y Reglas Inteligentes</h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Gestione la estructura del catálogo físico SQL DDL, restricciones CHECK e implemente reglas de correlación inteligente de datos entre tablas.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 self-start md:self-auto">
          <button
            onClick={() => setActiveTab("schema")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === "schema"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Esquema & Tuplas
          </button>
          <button
            onClick={() => setActiveTab("correlations")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "correlations"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Shuffle className="w-3 h-3" /> Correlaciones Inteligentes
            {correlations.length > 0 && (
              <span className="bg-indigo-900/50 text-indigo-300 px-1.5 py-0.2 rounded-full text-[10px] border border-indigo-700/30">
                {correlations.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === "schema" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Database Catalog / Specs */}
          <div className="lg:col-span-7 space-y-4" id="data-catalog-section">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 shadow-xs">
              <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-800/80 pb-2">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" /> Catálogo de Columnas (ALTER TABLE SCHEMAS)
              </h4>
              
              <div className="space-y-3" id="columns-dictionary-list">
                {table.columns.map((col, idx) => {
                  const isPrimaryKey = idx === 0;
                  const isEditing = editingColId === col.id;

                  if (isEditing) {
                    return (
                      <div
                        key={col.id}
                        className="p-4 bg-zinc-950 border border-indigo-500/30 rounded-xl space-y-4 shadow-sm animate-in fade-in zoom-in-95 duration-150"
                        id={`dict-col-edit-${col.id}`}
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                          <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                            <Settings className="w-3.5 h-3.5 text-indigo-400" /> Configuración de Restricciones ({col.id})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleSave(col.id)}
                              className="px-2.5 py-1 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Save className="w-3 h-3" /> Guardar
                            </button>
                            <button
                              onClick={() => setEditingColId(null)}
                              className="px-2.5 py-1 text-[11px] font-mono font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-750 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <X className="w-3 h-3" /> Cancelar
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Name & Type */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Nombre de Columna:</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Tipo de Datos Mapeado:</label>
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as ColumnType)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="text">TEXT (VARCHAR)</option>
                              <option value="number">NUMBER (NUMERIC)</option>
                              <option value="boolean">BOOLEAN</option>
                              <option value="date">DATE</option>
                              <option value="select">SELECT / ENUM (CONSTRAINTS)</option>
                              <option value="file">FILE (Adjuntos / PDF)</option>
                            </select>
                          </div>
                        </div>

                        {editType === "select" && (
                          <div className="space-y-4 bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80 animate-in slide-in-from-top-2 duration-200">
                            {/* Custom size (character limit N) */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-mono text-zinc-400 font-bold flex items-center gap-1">
                                Ancho Físico varchar(N): <span className="text-zinc-500 font-normal normal-case">(Límite de caracteres)</span>
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  max="4000"
                                  value={editVarcharLength}
                                  onChange={(e) => setEditVarcharLength(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-24 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-zinc-500 font-mono">caracteres</span>
                              </div>
                            </div>

                            {/* Options check list constraints */}
                            <div className="space-y-2">
                              <label className="text-[10px] uppercase font-mono text-zinc-400 font-bold block">
                                Valores Permitidos para la opción check (IN List):
                              </label>
                              
                              {/* Present tag lists */}
                              <div className="flex flex-wrap gap-1.5">
                                {editOptions.length === 0 ? (
                                  <span className="text-xs italic text-zinc-500 font-sans">- No hay restricciones definidas. Añade alguna opción.</span>
                                ) : (
                                  editOptions.map((opt) => (
                                    <span
                                      key={opt}
                                      className="flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 font-sans"
                                    >
                                      {opt}
                                      <button
                                        onClick={() => handleRemoveOption(opt)}
                                        className="text-zinc-500 hover:text-rose-400 cursor-pointer text-[10px]"
                                        type="button"
                                        title="Quitar"
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ))
                                )}
                              </div>

                              {/* Trigger addition form */}
                              <div className="flex items-center gap-1.5 mt-2">
                                <input
                                  type="text"
                                  value={newOptionText}
                                  onChange={(e) => setNewOptionText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddOption();
                                    }
                                  }}
                                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500"
                                  placeholder="Ej: Prequirurgicos complejos"
                                />
                                <button
                                  onClick={handleAddOption}
                                  className="px-2.5 py-1 text-xs font-bold text-zinc-350 bg-zinc-800 hover:bg-zinc-755 hover:text-indigo-400 rounded-lg transition-all cursor-pointer flex items-center gap-1 border border-zinc-700/40"
                                  type="button"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Añadir Opción
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={col.id}
                      className="p-3 bg-zinc-950/40 border border-zinc-800/60 rounded-xl hover:border-zinc-700/60 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                      id={`dict-col-box-${col.id}`}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isPrimaryKey ? (
                            <span className="flex items-center gap-1 text-[9px] font-mono font-bold bg-amber-500/10 border border-amber-500/20 text-beer text-amber-400 px-1.5 py-0.5 rounded">
                              <Key className="w-2.5 h-2.5" /> PK (Columna Identificadora)
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono font-bold bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                              COL_{idx + 1}
                            </span>
                          )}
                          <span className="font-sans font-bold text-xs text-zinc-200 truncate">{col.name}</span>
                        </div>
                        
                        {/* SQL/DDL commands */}
                        <code className="block font-mono text-[10.5px] text-indigo-300 font-semibold bg-zinc-950 px-2 py-1 rounded border border-zinc-900 overflow-x-auto">
                          {isPrimaryKey ? `${col.id} VARCHAR(32) PRIMARY KEY` : `${col.id} ${getSqlTypeHint(col)}`}
                        </code>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                        <div className="text-right">
                          <span className="block text-zinc-400 font-medium">Densidad</span>
                          <span className="text-emerald-400 font-bold">{getDensity(col.id)}</span>
                        </div>
                        <div className="text-right border-l border-zinc-800 pl-3 pr-1">
                          <span className="block text-zinc-500">Mapeado</span>
                          <span className="text-zinc-400">{col.type.toUpperCase()}</span>
                        </div>
                        
                        {!isPrimaryKey && (
                          <div className="flex items-center gap-1.5 ml-1">
                            <button
                              onClick={async () => {
                                if (confirm(`¿Estás seguro de que deseas establecer '${col.name}' como la columna identificadora principal de la tabla? Esto cambiará el campo principal que se muestra en tus vistas.`)) {
                                  await onSetPrimaryColumn(col.id);
                                }
                              }}
                              className="p-1 px-2 font-sans text-[10px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                              title="Hacer columna identificadora principal (PK)"
                            >
                              <Key className="w-3 h-3" /> Hacer PK
                            </button>

                            <button
                              onClick={() => handleStartEdit(col)}
                              className="p-1.5 rounded text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800/40 transition-all cursor-pointer"
                              title="Configurar restricciones y opciones de columna"
                              id={`btn-edit-col-dict-${col.id}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Record inspector & Tuple viewer */}
          <div className="lg:col-span-5 space-y-4" id="record-json-inspector-section">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4 shadow-xs">
              
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <FileJson className="w-3.5 h-3.5 text-indigo-400" /> Inspector de Tuplas (SELECT JSON)
                </h4>
                
                {/* Row Selector dropdown */}
                {table.rows && table.rows.length > 0 && (
                  <select
                    value={activeRowId}
                    onChange={(e) => setSelectedRowId(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] px-2.5 py-1 text-zinc-300 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-mono"
                    id="tuple-inspector-dropdown"
                  >
                    {table.rows.map((r, i) => {
                      const firstVal = String(r[table.columns[0]?.id] || "Sin título");
                      return (
                        <option key={r.id} value={r.id}>
                          Fila #{i + 1} - {firstVal.substring(0, 16)}...
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {activeRow ? (
                <div className="space-y-4 animate-in fade-in" id="record-inspector-active">
                  {/* Visual Representation of tuple fields */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 font-bold">Campos estructurados del registro:</span>
                    <div className="bg-zinc-950 divide-y divide-zinc-900 rounded-xl border border-zinc-800/60 overflow-hidden font-sans">
                      {table.columns.map((col) => (
                        <div key={col.id} className="p-3 flex justify-between gap-3 text-xs">
                          <span className="text-zinc-500 font-medium truncate shrink-0 max-w-[40%] font-mono">
                            {col.name} ({col.type}):
                          </span>
                          <span className="text-zinc-350 break-all text-right font-medium">
                            {activeRow[col.id] === undefined || activeRow[col.id] === null || activeRow[col.id] === "" ? (
                              <span className="text-zinc-650 italic">NULL</span>
                            ) : typeof activeRow[col.id] === "boolean" ? (
                              activeRow[col.id] ? "TRUE (Verdadero)" : "FALSE (Falso)"
                            ) : (
                              String(activeRow[col.id])
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Simulated PSQL raw JSON print */}
                  <div className="space-y-1.5 font-mono">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Terminal SQL RAW Output:</span>
                    <pre className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl text-indigo-400 text-xs overflow-x-auto leading-relaxed max-h-72">
                      {JSON.stringify(activeRow, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-zinc-500 text-xs font-sans space-y-2 border border-dashed border-zinc-800 rounded-xl" id="inspect-no-rows-placeholder">
                  <AlertCircle className="w-8 h-8 text-zinc-650 mx-auto" />
                  <p>No hay tuplas ni registros físicos cargados para inspeccionar en este schema.</p>
                </div>
              )}

            </div>
          </div>

        </div>
      )}

      {activeTab === "correlations" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left: Configuration Form */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
              <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-800/85 pb-2">
                <Link className="w-3.5 h-3.5 text-indigo-400" /> Nueva Correlación Inteligente
              </h4>

              <form onSubmit={handleCreateCorrelation} className="space-y-4 font-sans text-xs">
                {/* Source Table Selection */}
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-bold block">Tabla A (Origen):</label>
                  <select
                    value={sourceTableId}
                    onChange={(e) => {
                      setSourceTableId(e.target.value);
                      setSourceColumnId("");
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Seleccione una tabla...</option>
                    {allTables.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                    ))}
                  </select>
                </div>

                {/* Source Key Column */}
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-bold block">Columna Key de Tabla A (Relación):</label>
                  <select
                    value={sourceColumnId}
                    onChange={(e) => setSourceColumnId(e.target.value)}
                    disabled={!sourceTableId}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Seleccione la columna Key...</option>
                    {getColumnsForTable(sourceTableId).map(col => (
                      <option key={col.id} value={col.id}>{col.name} ({col.type})</option>
                    ))}
                  </select>
                </div>

                {/* Separator icon */}
                <div className="flex items-center justify-center py-1">
                  <div className="h-px bg-zinc-800 flex-1"></div>
                  <Shuffle className="w-4 h-4 text-indigo-400 mx-3 animate-pulse" />
                  <div className="h-px bg-zinc-800 flex-1"></div>
                </div>

                {/* Target Table Selection */}
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-bold block">Tabla B (Destino):</label>
                  <select
                    value={targetTableId}
                    onChange={(e) => {
                      setTargetTableId(e.target.value);
                      setTargetColumnId("");
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Seleccione otra tabla...</option>
                    {allTables.filter(t => t.id !== sourceTableId).map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                    ))}
                  </select>
                </div>

                {/* Target Key Column */}
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-bold block">Columna Key de Tabla B (Relación):</label>
                  <select
                    value={targetColumnId}
                    onChange={(e) => setTargetColumnId(e.target.value)}
                    disabled={!targetTableId}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Seleccione la columna Key...</option>
                    {getColumnsForTable(targetTableId).map(col => (
                      <option key={col.id} value={col.id}>{col.name} ({col.type})</option>
                    ))}
                  </select>
                </div>

                {/* Help tip */}
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg space-y-1">
                  <span className="font-bold text-indigo-300 block flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" /> ¿Cómo funciona?
                  </span>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    Si dos registros de estas tablas coinciden en su columna Key (ej: un DNI, código de cliente o número de documento), las demás columnas con el <strong>mismo nombre</strong> sincronizarán sus valores de forma bidireccional en tiempo real.
                  </p>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmittingCorr || !sourceTableId || !sourceColumnId || !targetTableId || !targetColumnId}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingCorr ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creando Relación...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Establecer Conexión
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right: Active Correlations List */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
              <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-800/85 pb-2">
                <Shuffle className="w-3.5 h-3.5 text-indigo-400" /> Correlaciones Activas en el Sistema
              </h4>

              {correlations.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 text-xs space-y-3 border border-dashed border-zinc-800 rounded-xl">
                  <Shuffle className="w-10 h-10 text-zinc-700 mx-auto" />
                  <div className="space-y-1">
                    <p className="font-bold text-zinc-400">No hay correlaciones inteligentes activadas.</p>
                    <p className="text-[10px] text-zinc-500 max-w-xs mx-auto">Use el formulario de la izquierda para establecer una sincronización automática bidireccional entre columnas.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {correlations.map((corr) => {
                    const sourceTable = allTables.find(t => t.id === corr.sourceTableId);
                    const targetTable = allTables.find(t => t.id === corr.targetTableId);
                    
                    const sourceColumn = sourceTable?.columns.find(c => c.id === corr.sourceColumnId);
                    const targetColumn = targetTable?.columns.find(c => c.id === corr.targetColumnId);

                    const isSyncingThis = syncingCorrId === corr.id;

                    return (
                      <div
                        key={corr.id}
                        className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          corr.active 
                            ? "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700/80" 
                            : "bg-zinc-950/20 border-zinc-900 opacity-60"
                        }`}
                      >
                        <div className="space-y-2 min-w-0 flex-1">
                          {/* Connection flow diagram */}
                          <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
                            <span className="font-bold text-zinc-200">
                              {sourceTable ? sourceTable.name : corr.sourceTableId}
                            </span>
                            <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                              {sourceColumn ? sourceColumn.name : corr.sourceColumnId}
                            </span>
                            
                            <Shuffle className="w-3.5 h-3.5 text-indigo-400 shrink-0 mx-1" />
                            
                            <span className="font-bold text-zinc-200">
                              {targetTable ? targetTable.name : corr.targetTableId}
                            </span>
                            <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                              {targetColumn ? targetColumn.name : corr.targetColumnId}
                            </span>
                          </div>

                          {/* Matching columns explanation */}
                          <div className="text-[10px] text-zinc-500 font-mono">
                            ID: <span className="text-zinc-400">{corr.id}</span>
                            {sourceTable && targetTable && (
                              <span className="block mt-1 text-indigo-300">
                                Sincronizando campos coincidentes:{" "}
                                {sourceTable.columns
                                  .filter(c => c.id !== corr.sourceColumnId)
                                  .filter(c => targetTable.columns.some(tc => tc.name.trim().toLowerCase() === c.name.trim().toLowerCase()))
                                  .map(c => c.name)
                                  .join(", ") || "Ningún campo con nombre coincidente"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                          {/* Sync Button */}
                          <button
                            onClick={() => handleForceSync(corr.id)}
                            disabled={isSyncingThis || !corr.active}
                            className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              corr.active
                                ? "bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border-indigo-500/20"
                                : "bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed"
                            }`}
                            title="Sincronizar retrospectivamente todos los registros existentes"
                          >
                            {isSyncingThis ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                            Sincronizar
                          </button>

                          {/* Toggle Active Switch */}
                          <button
                            onClick={() => handleToggleCorrelation(corr.id, corr.active)}
                            className={`px-2.5 py-1 text-xs font-bold font-sans rounded-lg border transition-all cursor-pointer ${
                              corr.active
                                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20"
                                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-750"
                            }`}
                          >
                            {corr.active ? "Activo" : "Pausado"}
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteCorrelation(corr.id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 rounded-lg transition-all cursor-pointer"
                            title="Eliminar correlación"
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
          </div>

        </div>
      )}

    </div>
  );
}
