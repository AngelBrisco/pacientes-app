import React, { useState, useEffect } from "react";
import { TableSchema, Column, Row } from "../types";
import { MoveLeft, MoveRight, Layers, SlidersHorizontal, ArrowLeftRight, Calendar, X, Grid, Paperclip, Upload, Trash2, Edit, CheckCircle, XCircle } from "lucide-react";

interface KanbanViewProps {
  table: TableSchema;
  onUpdateRow: (rowId: string, rowData: Record<string, any>) => void;
  onDeleteRow?: (rowId: string) => void;
  readOnly?: boolean;
  isAdmin?: boolean;
  onSaveKanbanColumn?: (columnId: string) => Promise<void>;
}

export default function KanbanView({ 
  table, 
  onUpdateRow, 
  onDeleteRow,
  readOnly = false, 
  isAdmin = false,
  onSaveKanbanColumn
}: KanbanViewProps) {
  // Find selectable grouping columns (Columns of type 'select' or 'boolean')
  const groupableColumns = table.columns.filter(
    (col) => col.type === "select" || col.type === "boolean"
  );

  const [groupingColumnId, setGroupingColumnId] = useState<string>("");

  // Row edit modal states
  const [showRowModal, setShowRowModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [currentRowData, setCurrentRowData] = useState<Record<string, any>>({});
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});

  const sessionStr = typeof window !== "undefined" ? localStorage.getItem("nococlone_session") : null;
  const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;
  const currentUserUsername = sessionUser ? sessionUser.username : "";

  const handleOpenRowForm = (row: Row) => {
    setEditingRow(row);
    setCurrentRowData({ ...row });
    setShowRowModal(true);
  };

  const handleSaveRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRow) {
      onUpdateRow(editingRow.id, currentRowData);
    }
    setShowRowModal(false);
    setEditingRow(null);
  };

  // Sync state with selected table or columns
  useEffect(() => {
    if (groupableColumns.length > 0) {
      if (table.kanbanColumnId && groupableColumns.some(c => c.id === table.kanbanColumnId)) {
        setGroupingColumnId(table.kanbanColumnId);
      } else {
        // Find default column, preferably one named 'estado', 'status', 'priority' or the first select type
        const defaultCol = groupableColumns.find((c) =>
          ["estado", "status", "prioridad", "priority"].includes(c.name.toLowerCase())
        ) || groupableColumns[0];
        setGroupingColumnId(defaultCol.id);
      }
    } else {
      setGroupingColumnId("");
    }
  }, [table.id, table.kanbanColumnId]);

  if (groupableColumns.length === 0) {
    return (
      <div id="no-kanban-columns-placeholder" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500 max-w-xl mx-auto space-y-4">
        <Layers className="w-12 h-12 text-zinc-600 mx-auto" />
        <h3 className="text-zinc-300 font-sans font-bold text-base">Vista Kanban Inhabilitada</h3>
        <p className="text-xs text-zinc-500 leading-relaxed font-sans">
          Para habilitar el tablero Kanban, la tabla debe poseer al menos una columna de tipo <strong className="font-mono text-emerald-400">VARCHAR (ENUM/SELECT)</strong> o un <strong className="font-mono text-emerald-400">BOOLEAN</strong> que sirva como columna de agrupación o carriles.
        </p>
        <p className="text-[11px] font-mono text-zinc-600">
          Tip: Ve a la vista anterior y haz clic en '+ Columna' para añadir un campo ENUM (Opción Select).
        </p>
      </div>
    );
  }

  const activeColumn = table.columns.find((c) => c.id === groupingColumnId);
  if (!activeColumn) return null;

  // Derive column options for grouping lanes
  let lanes: string[] = [];
  if (activeColumn.type === "boolean") {
    lanes = ["Verdadero", "Falso"];
  } else {
    lanes = activeColumn.options || ["Sin Clasificar"];
  }

  // Helper to map boolean lanes to raw value
  const mapValueToLane = (rowValue: any) => {
    if (activeColumn.type === "boolean") {
      return rowValue ? "Verdadero" : "Falso";
    }
    return rowValue || "Sin Clasificar";
  };

  const mapLaneToRawValue = (laneName: string) => {
    if (activeColumn.type === "boolean") {
      return laneName === "Verdadero";
    }
    return laneName;
  };

  // Group rows by lane name
  const rowsInLane = (lane: string) => {
    return (table.rows || []).filter((row) => {
      const val = row[activeColumn.id];
      const mapped = mapValueToLane(val);
      return String(mapped).toLowerCase() === String(lane).toLowerCase();
    });
  };

  // Function to move card to another lane
  const moveCard = (row: Row, currentLaneIndex: number, direction: "left" | "right") => {
    const nextLaneIndex = direction === "left" ? currentLaneIndex - 1 : currentLaneIndex + 1;
    if (nextLaneIndex >= 0 && nextLaneIndex < lanes.length) {
      const targetLaneName = lanes[nextLaneIndex];
      const targetValue = mapLaneToRawValue(targetLaneName);
      
      const updatedData = { ...row, [activeColumn.id]: targetValue };
      onUpdateRow(row.id, updatedData);
    }
  };

  return (
    <div id="kanban-view-module" className="space-y-4">
      {/* Target selector for grouping */}
      <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm" id="kanban-group-toolbar">
        <SlidersHorizontal className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="font-mono text-xs uppercase tracking-wider text-zinc-400 font-bold">Agrupar por columna:</span>
        {isAdmin ? (
          <select
            value={groupingColumnId}
            onChange={async (e) => {
              const val = e.target.value;
              setGroupingColumnId(val);
              if (onSaveKanbanColumn) {
                await onSaveKanbanColumn(val);
              }
            }}
            className="bg-zinc-950 border border-zinc-800 rounded-lg text-xs px-3 py-1.5 text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            id="kanban-grouping-select"
          >
            {groupableColumns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name} ({col.type === "select" ? "ENUM" : "BOOLEAN"})
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <span className="bg-zinc-950 border border-zinc-800 rounded-lg text-xs px-3 py-1.5 text-zinc-300 font-medium font-mono">
              {activeColumn?.name} ({activeColumn?.type === "select" ? "ENUM" : "BOOLEAN"})
            </span>
            <span className="text-[10px] text-zinc-500 font-sans italic">(Solo Administradores pueden cambiar la agrupación)</span>
          </div>
        )}
      </div>

      {/* Board Columns container */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start" id="kanban-lanes-board">
        {lanes.map((lane, laneIdx) => {
          const cards = rowsInLane(lane);
          return (
            <div
              key={lane}
              id={`kanban-lane-${laneIdx}`}
              className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex flex-col min-h-[500px]"
            >
              {/* Lane Header */}
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800 bg-transparent">
                <span className="font-sans font-bold text-xs text-zinc-100 uppercase tracking-wide truncate max-w-[70%]">
                  {lane}
                </span>
                <span className="font-mono text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-bold">
                  {cards.length}
                </span>
              </div>

              {/* Lane Cards */}
              <div className="space-y-3 flex-1 overflow-y-auto" id={`kanban-cards-container-${laneIdx}`}>
                {cards.length === 0 ? (
                  <div className="text-center py-10 text-zinc-600 text-xs border border-dashed border-zinc-800/80 rounded-xl font-sans">
                    Arrastra o mueva registros aquí.
                  </div>
                ) : (
                  cards.map((row) => {
                    // Find suitable identifier
                    const titleCol = table.columns[0];
                    const cardTitle = String(row[titleCol.id] || "Sin Título");

                    return (
                      <div
                        key={row.id}
                        id={`kanban-card-${row.id}`}
                        onDoubleClick={() => handleOpenRowForm(row)}
                        className="p-3.5 bg-zinc-950 border border-zinc-850/80 rounded-xl hover:border-zinc-700/85 transition-all space-y-3 group shadow-xs hover:shadow-md cursor-pointer select-none"
                        title="Doble clic para abrir lectura/edición de ficha"
                      >
                        {/* Title & Edit action */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0 flex-1">
                            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-bold block">
                              ID: {row.id.substring(4, 9)}
                            </span>
                            <span className="font-sans font-semibold text-zinc-200 text-xs line-clamp-2 leading-relaxed">
                              {cardTitle}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenRowForm(row);
                            }}
                            className="p-1 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-all cursor-pointer opacity-70 group-hover:opacity-100 shrink-0"
                            title={readOnly ? "Ver Ficha de Registro" : "Ficha / Editar Registro"}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Extra column fields inside card */}
                        <div className="space-y-1.5 pt-2 border-t border-zinc-900 text-[11px] text-zinc-400 font-sans">
                          {table.columns.slice(1, 4).map((col) => {
                            if (col.id === activeColumn.id) return null;
                            const colVal = row[col.id];
                            if (colVal === undefined || colVal === null || colVal === "") return null;
                            return (
                              <div key={col.id} className="flex justify-between gap-2 max-w-full">
                                <span className="text-zinc-600 truncate max-w-[45%] font-medium text-[10px] uppercase font-mono">{col.name}:</span>
                                <span className="text-zinc-300 font-mono truncate max-w-[55%]">
                                  {col.type === "boolean" ? (colVal ? "SÍ" : "NO") : String(colVal)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Slide card actions */}
                        {!readOnly && (
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-900 bg-transparent">
                            {/* Move Left */}
                            <button
                              id={`btn-move-left-${row.id}`}
                              disabled={laneIdx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveCard(row, laneIdx, "left");
                              }}
                              className={`p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-all ${
                                laneIdx === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                              }`}
                              title="Mover a columna izquierda"
                            >
                              <MoveLeft className="w-3.5 h-3.5" />
                            </button>

                            <span className="font-mono text-[9px] text-zinc-600 font-semibold uppercase flex items-center gap-1">
                              <ArrowLeftRight className="w-2.5 h-2.5" /> Transferir
                            </span>

                            {/* Move Right */}
                            <button
                              id={`btn-move-right-${row.id}`}
                              disabled={laneIdx === lanes.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveCard(row, laneIdx, "right");
                              }}
                              className={`p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-all ${
                                laneIdx === lanes.length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                              }`}
                              title="Mover a columna derecha"
                            >
                              <MoveRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Row modal edit details */}
      {showRowModal && editingRow && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="modal-backdrop-kanban-row-form">
          <form
            onSubmit={handleSaveRow}
            className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            id="kanban-row-details-modal"
          >
            {/* Modal Header */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-emerald-400" />
                <h3 className="font-sans font-bold text-zinc-200 text-sm">
                  {readOnly ? "Ficha del Registro (Lectura)" : "Editar Registro (UPDATE)"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRowModal(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4" id="kanban-row-fields-form-body">
              {table.columns.map((col) => {
                const value = currentRowData[col.id];
                return (
                  <div key={col.id} className="space-y-1.5" id={`kanban-form-field-group-${col.id}`}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                        {col.name}
                      </label>
                      <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">
                        {col.type}
                      </span>
                    </div>

                    {col.type === "boolean" ? (
                      <div className="flex items-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!value}
                            disabled={readOnly}
                            onChange={(e) =>
                              setCurrentRowData({ ...currentRowData, [col.id]: e.target.checked })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-zinc-950"></div>
                          <span className="ml-3 text-xs font-medium text-zinc-400">
                            {value ? "Verdadero (True)" : "Falso (False)"}
                          </span>
                        </label>
                      </div>
                    ) : col.type === "select" ? (
                      <select
                        value={value || ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          setCurrentRowData({ ...currentRowData, [col.id]: e.target.value })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-sm p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Seleccionar opción --</option>
                        {col.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : col.type === "number" ? (
                      <input
                        type="number"
                        step="any"
                        disabled={readOnly}
                        value={value !== undefined && value !== null ? value : 0}
                        onChange={(e) =>
                          setCurrentRowData({
                            ...currentRowData,
                            [col.id]: e.target.value === "" ? "" : Number(e.target.value)
                          })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-sm p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500 font-mono disabled:opacity-55"
                      />
                    ) : col.type === "date" ? (
                      <input
                        type="date"
                        disabled={readOnly}
                        value={value || ""}
                        onChange={(e) =>
                          setCurrentRowData({ ...currentRowData, [col.id]: e.target.value })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-sm p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500 font-mono disabled:opacity-55"
                      />
                    ) : col.type === "file" ? (
                      (() => {
                        const filesArr: string[] = Array.isArray(value) 
                          ? value 
                          : value && typeof value === "string" && value.startsWith("[") 
                            ? JSON.parse(value) 
                            : value ? [String(value)] : [];
                        return (
                          <div className="space-y-2">
                            {filesArr.length > 0 && (
                              <div className="flex flex-col gap-1.5 p-2 bg-zinc-950 rounded-lg border border-zinc-900">
                                {filesArr.map((url, i) => {
                                  const filename = url.split("/").pop() || "archivo";
                                  const cleanName = filename.replace(/^\d+_/g, "");
                                  return (
                                    <div key={i} className="flex items-center justify-between text-xs bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg">
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold font-sans truncate"
                                        title="Ver archivo"
                                      >
                                        <Paperclip className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                                        <span className="truncate max-w-[180px]">{cleanName}</span>
                                      </a>
                                      {!readOnly && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextArr = filesArr.filter((_, idx) => idx !== i);
                                            setCurrentRowData({ ...currentRowData, [col.id]: nextArr });
                                          }}
                                          className="text-zinc-550 hover:text-rose-400 p-0.5 rounded transition-all cursor-pointer"
                                          title="Eliminar archivo"
                                        >
                                          <X className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {!readOnly && (
                              <div className="relative">
                                <input
                                  type="file"
                                  multiple
                                  disabled={isUploading[col.id]}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  onChange={async (e) => {
                                    const selectedFiles = e.target.files;
                                    if (!selectedFiles || selectedFiles.length === 0) return;

                                    setIsUploading(prev => ({ ...prev, [col.id]: true }));
                                    try {
                                      const filesToUpload: any[] = [];
                                      for (let i = 0; i < selectedFiles.length; i++) {
                                        const file = selectedFiles[i];
                                        const base64 = await new Promise<string>((resolve, reject) => {
                                          const reader = new FileReader();
                                          reader.onload = () => resolve(reader.result as string);
                                          reader.onerror = reject;
                                          reader.readAsDataURL(file);
                                        });
                                        filesToUpload.push({ name: file.name, base64 });
                                      }

                                      const res = await fetch("/api/upload", {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                          "x-user-username": currentUserUsername
                                        },
                                        body: JSON.stringify({ files: filesToUpload })
                                      });

                                      if (!res.ok) {
                                        const errData = await res.json().catch(() => ({}));
                                        throw new Error(errData.error || "Error de subida.");
                                      }

                                      const { urls } = await res.json();
                                      setCurrentRowData({
                                        ...currentRowData,
                                        [col.id]: [...filesArr, ...urls]
                                      });
                                    } catch (err: any) {
                                      console.error(err);
                                      alert(`Fallo al subir archivos: ${err.message}`);
                                    } finally {
                                      setIsUploading(prev => ({ ...prev, [col.id]: false }));
                                    }
                                  }}
                                />
                                <div className="border border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40 rounded-xl p-3 text-center transition-all flex flex-col items-center justify-center gap-1 select-none">
                                  {isUploading[col.id] ? (
                                    <div className="flex items-center gap-2 text-indigo-400 font-mono text-[11px] font-bold animate-pulse">
                                      <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                      <span>Cargando adjuntos...</span>
                                    </div>
                                  ) : (
                                    <>
                                      <Upload className="w-4 h-4 text-indigo-400" />
                                      <span className="text-[11px] text-zinc-300 font-medium font-sans">Subir o arrastrar Archivos/PDFs</span>
                                      <span className="text-[9.5px] text-zinc-500 font-mono font-bold">Multiselección compatible</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <input
                        type="text"
                        disabled={readOnly}
                        value={value || ""}
                        onChange={(e) =>
                          setCurrentRowData({ ...currentRowData, [col.id]: e.target.value })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-sm p-2.5 text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-55"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex justify-between gap-2.5 rounded-b-2xl items-center">
              <div>
                {!readOnly && onDeleteRow && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("¿Proceder a eliminar este registro físico?")) {
                        onDeleteRow(editingRow.id);
                        setShowRowModal(false);
                      }
                    }}
                    className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                    title="Eliminar registro"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Fila</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {readOnly && (
                  <span className="text-[10px] uppercase font-mono font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
                    SOLO LECTURA
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setShowRowModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cerrar
                </button>
                
                {!readOnly && (
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold rounded-lg text-xs cursor-pointer shadow-md"
                    id="btn-kanban-modal-save-row"
                  >
                    Confirmar UPDATE
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
