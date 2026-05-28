import React, { useState } from "react";
import { Database, Plus, Trash2, Layers, ShieldCheck, Terminal, ListTodo, History, User, Upload, FileSpreadsheet } from "lucide-react";
import { TableSchema, AuditLog } from "../types";
import { normalizeImportedTableJson } from "../lib/normalization";

interface SidebarProps {
  tables: TableSchema[];
  activeTableId: string;
  onSelectTable: (id: string) => void;
  onCreateTable: (name: string, columns?: any[], rows?: any[]) => void;
  onDeleteTable: (id: string) => void;
  logs: AuditLog[];
  readOnly?: boolean;
  isAdmin?: boolean;
}

export default function Sidebar({
  tables,
  activeTableId,
  onSelectTable,
  onCreateTable,
  onDeleteTable,
  logs = [],
  readOnly = false,
  isAdmin = false,
}: SidebarProps) {
  const [newTableName, setNewTableName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [importMethod, setImportMethod] = useState<"none" | "csv" | "json">("none");
  const [parsedColumns, setParsedColumns] = useState<any[] | undefined>(undefined);
  const [parsedRows, setParsedRows] = useState<any[] | undefined>(undefined);
  const [importSuccessMessage, setImportSuccessMessage] = useState("");
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);

  const resetFormStates = () => {
    setNewTableName("");
    setImportMethod("none");
    setParsedColumns(undefined);
    setParsedRows(undefined);
    setImportSuccessMessage("");
    setShowAddForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTableName.trim()) {
      onCreateTable(newTableName.trim(), parsedColumns, parsedRows);
      resetFormStates();
    }
  };

  const parseCSVLine = (lineText: string): string[] => {
    const result: string[] = [];
    let insideQuote = false;
    let entry = "";
    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i];
      if (char === '"') {
        if (insideQuote && lineText[i + 1] === '"') {
          entry += '"';
          i++; // Skip escaped quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        result.push(entry.trim());
        entry = "";
      } else {
        entry += char;
      }
    }
    result.push(entry.trim());
    return result;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "csv" | "json") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          alert("El archivo está vacío.");
          return;
        }

        if (type === "json") {
          const data = JSON.parse(text);
          const normalized = normalizeImportedTableJson(data);

          if (normalized.columns.length === 0) {
            alert("No se pudieron identificar columnas ni datos en el archivo JSON.");
            return;
          }

          if (normalized.name && !newTableName) {
            setNewTableName(normalized.name);
          }
          setParsedColumns(normalized.columns);
          setParsedRows(normalized.rows);
          setImportSuccessMessage(`JSON procesado con éxito: ${normalized.columns.length} columnas y ${normalized.rows.length} registros listos.`);
        } else if (type === "csv") {
          const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
          if (lines.length === 0) {
            alert("El archivo CSV no tiene líneas.");
            return;
          }
          const rawHeaders = parseCSVLine(lines[0]);
          const headers = rawHeaders.map((h, i) => {
            const name = h.replace(/^\uFEFF/, "").trim();
            return {
              id: "col_" + name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + i,
              name: name || `Campo_${i + 1}`,
              type: "text"
            };
          });

          const rows: any[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cellVals = parseCSVLine(lines[i]);
            if (cellVals.length === 0 || (cellVals.length === 1 && cellVals[0] === "")) continue;
            const rowObj: any = {};
            headers.forEach((h, colIdx) => {
              rowObj[h.id] = cellVals[colIdx] !== undefined ? cellVals[colIdx] : "";
            });
            rows.push(rowObj);
          }

          setParsedColumns(headers);
          setParsedRows(rows);
          setImportSuccessMessage(`CSV parseado: ${headers.length} campos y ${rows.length} registros listos.`);
        }
      } catch (err: any) {
        alert("Ocurrió un error al procesar el archivo: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  // Local DB style stats calculations
  const totalRows = tables.reduce((acc, t) => acc + (t.rows?.length || 0), 0);
  const totalColumns = tables.reduce((acc, t) => acc + (t.columns?.length || 0), 0);

  // Format date helper
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return "00:00:00";
    }
  };

  return (
    <aside id="sidebar-panel" className="w-80 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 h-full overflow-hidden select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-zinc-900 flex items-center justify-between animate-fade-in" id="sidebar-header">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-600/15 border border-indigo-500/25 text-indigo-400 rounded-lg">
            <Database className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="font-sans font-bold text-zinc-100 text-sm tracking-tight">Schema Studio</h1>
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider block">Relational Schema</span>
          </div>
        </div>
      </div>

      {/* Schema / Databases List */}
      <div className="p-4 flex-1 overflow-y-auto space-y-6 custom-scrollbar" id="tables-list-container">
        
        {/* SECTION 1: Schemas List */}
        <div>
          <div className="flex items-center justify-between px-2 mb-3">
            <span className="font-mono text-[10.5px] uppercase font-bold text-zinc-500 tracking-widest flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> Tablas (Schemas)
            </span>
            {!readOnly && isAdmin && (
              <button
                id="btn-toggle-add-table"
                onClick={() => setShowAddForm(!showAddForm)}
                className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-zinc-900/60 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {showAddForm && (
            <form onSubmit={handleSubmit} className="mb-4 p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-3.5 animate-in slide-in-from-top-1 shadow-lg" id="schema-table-form">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide font-mono">Nombre de la Tabla</label>
                <input
                  type="text"
                  required
                  placeholder="Por ej. Productos, Clientes..."
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded-lg text-xs p-2 text-zinc-100 outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                />
              </div>

              {/* Import Options */}
              <div className="space-y-2 pt-1 border-t border-zinc-900">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide font-mono block">Importar Datos (Opcional)</label>
                <div className="grid grid-cols-3 gap-1" id="schema-import-method-selector">
                  <button
                    type="button"
                    onClick={() => { setImportMethod("none"); setParsedColumns(undefined); setParsedRows(undefined); setImportSuccessMessage(""); }}
                    className={`px-1 py-1.5 rounded-md text-[10px] font-sans font-semibold border cursor-pointer text-center select-none transition-all ${
                      importMethod === "none"
                        ? "bg-zinc-805 border-zinc-700 text-zinc-100"
                        : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-350"
                    }`}
                  >
                    Ninguno
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImportMethod("csv"); setParsedColumns(undefined); setParsedRows(undefined); setImportSuccessMessage(""); }}
                    className={`px-1 py-1.5 rounded-md text-[10px] font-sans font-semibold border cursor-pointer text-center select-none transition-all ${
                      importMethod === "csv"
                        ? "bg-zinc-805 border-zinc-700 text-zinc-100"
                        : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-350"
                    }`}
                  >
                    CSV (Excel)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImportMethod("json"); setParsedColumns(undefined); setParsedRows(undefined); setImportSuccessMessage(""); }}
                    className={`px-1 py-1.5 rounded-md text-[10px] font-sans font-semibold border cursor-pointer text-center select-none transition-all ${
                      importMethod === "json"
                        ? "bg-zinc-805 border-zinc-700 text-zinc-100"
                        : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-350"
                    }`}
                  >
                    JSON
                  </button>
                </div>
              </div>

              {/* File Inputs based on importMethod */}
              {importMethod === "csv" && (
                <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-center" id="csv-uploader-zone">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, "csv")}
                    id="sidebar-csv-file-input"
                    className="hidden"
                  />
                  <label
                    htmlFor="sidebar-csv-file-input"
                    className="flex flex-col items-center justify-center gap-1.5 py-1 text-[11px] text-zinc-400 hover:text-indigo-400 cursor-pointer transition-all"
                  >
                    <Upload className="w-4 h-4 text-zinc-500" />
                    <span className="font-semibold">Subir archivo .csv</span>
                  </label>
                </div>
              )}

              {importMethod === "json" && (
                <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-center" id="json-uploader-zone">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => handleFileUpload(e, "json")}
                    id="sidebar-json-file-input"
                    className="hidden"
                  />
                  <label
                    htmlFor="sidebar-json-file-input"
                    className="flex flex-col items-center justify-center gap-1.5 py-1 text-[11px] text-zinc-400 hover:text-indigo-400 cursor-pointer transition-all"
                  >
                    <Upload className="w-4 h-4 text-zinc-500" />
                    <span className="font-semibold">Subir archivo .json</span>
                  </label>
                </div>
              )}

              {/* Parsed Success Summary */}
              {importSuccessMessage && (
                <p className="text-[10px] text-emerald-400 font-mono font-medium leading-relaxed bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg">
                  ✓ {importSuccessMessage}
                </p>
              )}

              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={resetFormStates}
                  className="px-2.5 py-1 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-semibold hover:text-zinc-200 cursor-pointer"
                  id="btn-cancel-add-table"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-[10px] cursor-pointer"
                  id="btn-submit-add-table"
                >
                  {parsedColumns ? "Crear e Importar" : "Crear Tabla"}
                </button>
              </div>
            </form>
          )}

          {tables.length === 0 ? (
            <div className="text-center py-8 text-zinc-650 text-xs" id="no-tables-placeholder">
              No hay tablas físicas en el esquema.
            </div>
          ) : (
            <div className="space-y-1" id="tables-list">
              {tables.map((table) => {
                const isActive = table.id === activeTableId;
                return (
                  <div
                    key={table.id}
                    id={`table-row-${table.id}`}
                    onClick={() => onSelectTable(table.id)}
                    className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      isActive
                        ? "bg-indigo-600/10 border-indigo-500/20 text-indigo-400 shadow-sm"
                        : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[9px] opacity-60 bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800/80">SELECT</span>
                      <span className="font-sans text-xs font-semibold truncate" title={table.name}>
                        {table.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <span className="font-mono text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded" title="Cantidad de filas">
                        {table.rows?.length || 0}r
                      </span>
                      {!readOnly && isAdmin && (
                        <div className="flex items-center">
                          {deletingTableId === table.id ? (
                            <button
                              id={`btn-delete-table-confirm-${table.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTable(table.id);
                                setDeletingTableId(null);
                              }}
                              className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-505 text-white text-[10px] font-bold rounded cursor-pointer shrink-0 animate-pulse"
                              title="Click para Confirmar Eliminación"
                            >
                              ¿Borrar?
                            </button>
                          ) : (
                            <button
                              id={`btn-delete-table-${table.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingTableId(table.id);
                                // Auto cancel in 3 seconds
                                setTimeout(() => {
                                  setDeletingTableId(p => p === table.id ? null : p);
                                }, 3000);
                              }}
                              className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 cursor-pointer transition-colors"
                              title="Borrar Tabla"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: Persistent Audit Trail Logs */}
        {isAdmin && (
          <div className="pt-4 border-t border-zinc-900">
            <div className="flex items-center justify-between px-2 mb-3">
              <span className="font-mono text-[10.5px] uppercase font-bold text-zinc-500 tracking-widest flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-indigo-400" /> Audit Trail (Historial)
              </span>
              <span className="font-mono text-[9px] text-zinc-600 font-bold bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded-full">
                {logs.length}
              </span>
            </div>

            <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar text-[11px]" id="audit-trail-scroller">
              {logs.length === 0 ? (
                <div className="text-center py-6 text-zinc-650">No hay logs registrados en audit.</div>
              ) : (
                [...logs].reverse().slice(0, 15).map((log) => {
                  const isSchema = log.action === "SCHEMA_CHANGE";
                  const isDelete = log.action === "DELETE";
                  const isCreate = log.action === "CREATE";
                  
                  const badgeColor = isSchema 
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                    : isDelete 
                      ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      : isCreate
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";

                  return (
                    <div
                      key={log.id}
                      className="p-2.5 bg-zinc-900/30 border border-zinc-900/60 rounded-xl space-y-1.5"
                      id={`log-item-${log.id}`}
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={`px-1.5 py-0.2 rounded border text-[8.5px] font-mono uppercase font-semibold ${badgeColor}`}>
                          {log.action}
                        </span>
                        <span className="text-zinc-600 font-mono font-medium">{formatTime(log.timestamp)}</span>
                      </div>
                      <p className="text-zinc-300 font-sans leading-relaxed break-words">{log.details}</p>
                      <div className="flex items-center gap-1 text-zinc-500 text-[10px] bg-zinc-950/40 p-1 rounded border border-zinc-900">
                        <User className="w-2.5 h-2.5 text-indigo-400" />
                        <span className="font-medium truncate text-zinc-400">{log.user}</span>
                        <span className="text-zinc-600 select-none">•</span>
                        <span className="truncate max-w-[50%] text-[9.5px] font-mono text-zinc-500">{log.tableName}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>

      {/* Database Metadata Info Card */}
      <div className="p-4 border-t border-zinc-900 bg-zinc-950/80" id="sidebar-meta-card">
        <div className="p-3.5 bg-zinc-900 border border-zinc-800/80 rounded-xl space-y-2.5 shadow-sm">
          <h4 className="font-mono text-[9px] uppercase font-bold tracking-widest text-zinc-400 flex items-center gap-1">
            <Terminal className="w-3 h-3 text-indigo-400" /> Relational Node Stats
          </h4>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-500">
            <div>
              <span className="block text-zinc-300 font-bold">{tables.length}</span>
              <span>Tablas Físicas</span>
            </div>
            <div>
              <span className="block text-zinc-300 font-bold">{totalColumns}</span>
              <span>Campos (Cols)</span>
            </div>
            <div>
              <span className="block text-zinc-300 font-bold">{totalRows}</span>
              <span>Filas (Rows)</span>
            </div>
            <div>
              <span className="block text-indigo-400 flex items-center gap-0.5 font-bold">
                <ShieldCheck className="w-3 h-3 text-indigo-400" /> ONLINE
              </span>
              <span>Port Bind 3000</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
