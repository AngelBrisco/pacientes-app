import React, { useState } from "react";
import { TableSchema, Column, ColumnType } from "../types";
import { 
  BookOpen, Key, Hash, HelpCircle, HardDrive, Cpu, Terminal, FileJson, 
  AlertCircle, Edit2, Save, X, Plus, Settings 
} from "lucide-react";

interface DictionaryViewProps {
  table: TableSchema;
  onEditColumn: (columnId: string, name: string, type: ColumnType, options?: string[], varcharLength?: number) => Promise<void>;
  onSetPrimaryColumn: (columnId: string) => Promise<void>;
}

export default function DictionaryView({ table, onEditColumn, onSetPrimaryColumn }: DictionaryViewProps) {
  const [selectedRowId, setSelectedRowId] = useState<string>("");

  // Edit Column State
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editType, setEditType] = useState<ColumnType>("text");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editVarcharLength, setEditVarcharLength] = useState<number>(50);
  const [newOptionText, setNewOptionText] = useState<string>("");

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
      <div className="bg-zinc-90 w-full max-w-full p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start gap-3 shadow-xs">
        <BookOpen className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-sans font-bold text-xs text-zinc-150 uppercase tracking-wider">Diccionario de Datos y Esquema Relacional</h3>
          <p className="text-xs text-zinc-400 font-sans leading-relaxed">
            Consulte la estructura interna, las restricciones ddl, los tipos físicos mapeados a SQL y realice inspecciones de tuplas en tiempo real.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Database Catalog / Specs */}
        <div className="lg:col-span-7 space-y-4" id="data-catalog-section">
          <div className="bg-zinc-900 border border-zinc-805 rounded-xl p-4 space-y-3">
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
            
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
    </div>
  );
}
