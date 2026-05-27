import React, { useState } from "react";
import { TableSchema, Column } from "../types";
import { BookOpen, Key, Hash, HelpCircle, HardDrive, Cpu, Terminal, FileJson, AlertCircle } from "lucide-react";

interface DictionaryViewProps {
  table: TableSchema;
}

export default function DictionaryView({ table }: DictionaryViewProps) {
  const [selectedRowId, setSelectedRowId] = useState<string>("");

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
        return `VARCHAR(50) CHECK (${col.name.toLowerCase()} IN (${(col.options || [])
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
                return (
                  <div
                    key={col.id}
                    className="p-3 bg-zinc-950/40 border border-zinc-800/60 rounded-xl hover:border-zinc-700/60 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                    id={`dict-col-box-${col.id}`}
                  >
                    <div className="space-y-1.5 min-w-0">
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
                      <div className="text-right border-l border-zinc-800 pl-3">
                        <span className="block text-zinc-500">Mapeado</span>
                        <span className="text-zinc-400">{col.type.toUpperCase()}</span>
                      </div>
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
