import React, { useState, useEffect } from "react";
import { TableSchema, Column, Row } from "../types";
import { MoveLeft, MoveRight, Layers, SlidersHorizontal, ArrowLeftRight, CreditCard, Calendar } from "lucide-react";

interface KanbanViewProps {
  table: TableSchema;
  onUpdateRow: (rowId: string, rowData: Record<string, any>) => void;
}

export default function KanbanView({ table, onUpdateRow }: KanbanViewProps) {
  // Find selectable grouping columns (Columns of type 'select' or 'boolean')
  const groupableColumns = table.columns.filter(
    (col) => col.type === "select" || col.type === "boolean"
  );

  const [groupingColumnId, setGroupingColumnId] = useState<string>("");

  // Sync state with selected table or columns
  useEffect(() => {
    if (groupableColumns.length > 0) {
      // Find default column, preferably one named 'estado', 'status', 'priority' or the first select type
      const defaultCol = groupableColumns.find((c) =>
        ["estado", "status", "prioridad", "priority"].includes(c.name.toLowerCase())
      ) || groupableColumns[0];
      setGroupingColumnId(defaultCol.id);
    } else {
      setGroupingColumnId("");
    }
  }, [table.id]);

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
        <select
          value={groupingColumnId}
          onChange={(e) => setGroupingColumnId(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg text-xs px-3 py-1.5 text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          id="kanban-grouping-select"
        >
          {groupableColumns.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name} ({col.type === "select" ? "ENUM" : "BOOLEAN"})
            </option>
          ))}
        </select>
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
                        className="p-3.5 bg-zinc-950 border border-zinc-850/80 rounded-xl hover:border-zinc-700/85 transition-all space-y-3 group shadow-xs hover:shadow-md"
                      >
                        {/* Title */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-bold block">
                            ID: {row.id.substring(4, 9)}
                          </span>
                          <span className="font-sans font-semibold text-zinc-200 text-xs line-clamp-2 leading-relaxed">
                            {cardTitle}
                          </span>
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
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-900 bg-transparent">
                          {/* Move Left */}
                          <button
                            id={`btn-move-left-${row.id}`}
                            disabled={laneIdx === 0}
                            onClick={() => moveCard(row, laneIdx, "left")}
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
                            onClick={() => moveCard(row, laneIdx, "right")}
                            className={`p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-all ${
                              laneIdx === lanes.length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                            }`}
                            title="Mover a columna derecha"
                          >
                            <MoveRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
