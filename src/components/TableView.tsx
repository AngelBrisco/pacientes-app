import React, { useState } from "react";
import { TableSchema, Column, Row, ColumnType } from "../types";
import {
  Plus,
  Trash2,
  Edit,
  ArrowUpDown,
  Search,
  CheckCircle,
  XCircle,
  HelpCircle,
  SlidersHorizontal,
  Calendar,
  X,
  PlusCircle,
  Grid
} from "lucide-react";

interface TableViewProps {
  table: TableSchema;
  onAddColumn: (name: string, type: ColumnType, options?: string[]) => void;
  onDeleteColumn: (columnId: string) => void;
  onAddRow: (rowData: Record<string, any>) => void;
  onUpdateRow: (rowId: string, rowData: Record<string, any>) => void;
  onDeleteRow: (rowId: string) => void;
  readOnly?: boolean;
}

export default function TableView({
  table,
  onAddColumn,
  onDeleteColumn,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  readOnly = false,
}: TableViewProps) {
  // Search and Sort states
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Dialog / Form states
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<ColumnType>("text");
  const [newColOptionsString, setNewColOptionsString] = useState("");

  const [showRowModal, setShowRowModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null); // null = is creating new row
  const [currentRowData, setCurrentRowData] = useState<Record<string, any>>({});

  // Sorting columns logic
  const handleSort = (colId: string) => {
    if (sortColumnId === colId) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumnId(colId);
      setSortDirection("asc");
    }
  };

  // Process rows through sorting and searching
  const filteredRows = (table.rows || []).filter((row) => {
    return table.columns.some((col) => {
      const val = row[col.id];
      if (val === undefined || val === null) return false;
      return String(val).toLowerCase().includes(searchTerm.toLowerCase());
    });
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortColumnId) return 0;
    const valA = a[sortColumnId];
    const valB = b[sortColumnId];

    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    if (typeof valA === "number" && typeof valB === "number") {
      return sortDirection === "asc" ? valA - valB : valB - valA;
    }
    if (typeof valA === "boolean" && typeof valB === "boolean") {
      return sortDirection === "asc" ? (valA === valB ? 0 : valA ? -1 : 1) : (valA === valB ? 0 : valB ? -1 : 1);
    }
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();

    if (strA < strB) return sortDirection === "asc" ? -1 : 1;
    if (strA > strB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Handle forms submits
  const handleCreateColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColName.trim()) {
      let options: string[] | undefined = undefined;
      if (newColType === "select" && newColOptionsString.trim()) {
        options = newColOptionsString.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
      }
      onAddColumn(newColName.trim(), newColType, options);
      setNewColName("");
      setNewColType("text");
      setNewColOptionsString("");
      setShowAddCol(false);
    }
  };

  const handleOpenRowForm = (row: Row | null) => {
    setEditingRow(row);
    if (row) {
      setCurrentRowData({ ...row });
    } else {
      // Set empty/default values for columns
      const freshData: Record<string, any> = {};
      table.columns.forEach((col) => {
        if (col.type === "boolean") freshData[col.id] = false;
        else if (col.type === "number") freshData[col.id] = 0;
        else freshData[col.id] = "";
      });
      setCurrentRowData(freshData);
    }
    setShowRowModal(true);
  };

  const handleSaveRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRow) {
      onUpdateRow(editingRow.id, currentRowData);
    } else {
      onAddRow(currentRowData);
    }
    setShowRowModal(false);
    setEditingRow(null);
  };

  return (
    <div id="table-view-module" className="flex flex-col flex-1 min-w-0 bg-transparent space-y-4">
      
      {/* Search Input, Actions and Dynamic Controllers */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm" id="table-actions-toolbar">
        {/* Search */}
        <div className="relative w-64 max-w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500 pointer-events-none">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar en esta tabla..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
            id="table-search-input"
          />
        </div>

        {/* Create column & user trigger controls */}
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              {/* Add Column Button */}
              <button
                id="btn-toggle-add-column"
                onClick={() => setShowAddCol(!showAddCol)}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-medium text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800/80 transition-all cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-4.5 h-4.5 text-emerald-500" />
                <span>Columna</span>
              </button>

              {/* Add Row Button */}
              <button
                id="btn-open-add-row-form"
                onClick={() => handleOpenRowForm(null)}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-md"
              >
                <Plus className="w-4.5 h-4.5" />
                <span>Nueva Fila (INSERT)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Adding column panel */}
      {showAddCol && (
        <form onSubmit={handleCreateColumn} className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3.5 max-w-md animate-in slide-in-from-top-2" id="add-col-panel-form">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
            <h3 className="font-semibold text-zinc-200 text-xs uppercase font-mono flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Nueva columna física (Postgres Style)
            </h3>
            <button
              type="button"
              onClick={() => setShowAddCol(false)}
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono text-zinc-400 font-bold">Nombre del campo (Col):</label>
              <input
                type="text"
                required
                placeholder="Ej. precio, email, ciudad"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs p-2 text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
                id="input-new-col-name"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono text-zinc-400 font-bold">Tipo de Dato (Data Type):</label>
              <select
                value={newColType}
                onChange={(e) => setNewColType(e.target.value as ColumnType)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs p-2 text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                id="select-new-col-type"
              >
                <option value="text">VARCHAR (Texto)</option>
                <option value="number">NUMERIC (Número)</option>
                <option value="select">ENUM (Opción Select)</option>
                <option value="boolean">BOOLEAN (Verdadero/Falso)</option>
                <option value="date">DATE (Fecha)</option>
              </select>
            </div>
          </div>

          {newColType === "select" && (
            <div className="space-y-1 animate-in fade-in duration-200">
              <label className="block text-[10px] uppercase font-mono text-zinc-400 font-bold">Opciones Separadas por Comas:</label>
              <input
                type="text"
                required
                placeholder="Ej. Pendiente, En Camino, Entregado"
                value={newColOptionsString}
                onChange={(e) => setNewColOptionsString(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs p-2 text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
                id="input-new-col-options"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddCol(false)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold rounded-lg text-xs cursor-pointer"
              id="btn-confirm-add-column"
            >
              Generar Campo (ALTER TABLE)
            </button>
          </div>
        </form>
      )}

      {/* Spreadsheet grid container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-xs overflow-hidden" id="grid-spreadsheet-table-container">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse table-auto" id="spreadsheet-dynamic-table">
            <thead>
              <tr className="bg-zinc-950/90 text-zinc-400 tracking-wider text-[10px] uppercase font-mono border-b border-zinc-800 font-bold">
                {/* Index col */}
                <th className="px-4 py-3.5 text-center w-14 border-r border-zinc-800">#</th>
                
                {/* Schema columns */}
                {table.columns.map((col, index) => (
                  <th key={col.id} className="px-4 py-3 border-r border-zinc-800 min-w-44 select-none relative group/header">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-100 transition-colors" onClick={() => handleSort(col.id)}>
                        <span>{col.name}</span>
                        <ArrowUpDown className="w-3 h-3 text-zinc-500 group-hover/header:text-zinc-300" />
                        <span className="font-mono text-[8px] px-1 py-0.5 bg-zinc-900 text-zinc-500 rounded border border-zinc-800/80">
                          {col.type}
                        </span>
                      </div>
                      
                      {/* Only allow deleting column if it is not the very first column (for index safety) */}
                      {index > 0 && !readOnly && (
                        <button
                          id={`btn-col-del-${col.id}`}
                          onClick={() => {
                            if (confirm(`¿Proceder a ejecutar DROP COLUMN en la columna '${col.name}'? Esto destruirá de forma irreversible todos los datos almacenados en este campo.`)) {
                              onDeleteColumn(col.id);
                            }
                          }}
                          className="opacity-0 group-hover/header:opacity-100 p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded cursor-pointer transition-all"
                          title="DROP COLUMN (Borrar columna)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                
                {/* Right side Actions col */}
                <th className="px-4 py-3.5 text-center w-28 bg-zinc-950">Acciones</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-zinc-800 text-xs">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={table.columns.length + 2} className="px-4 py-16 text-center text-zinc-500 text-sm">
                    No hay ningún registro en esta vista. Prueba a insertar uno nuevo.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-zinc-900/35 transition-colors group/row" id={`row-tr-${row.id}`}>
                    {/* Index */}
                    <td className="px-4 py-3 text-center font-mono border-r border-zinc-800 text-zinc-500 font-bold bg-zinc-950/20">
                      {idx + 1}
                    </td>

                    {/* Columns values */}
                    {table.columns.map((col) => {
                      const value = row[col.id];
                      return (
                        <td key={col.id} className="px-4 py-3 border-r border-zinc-800 text-zinc-300 font-sans whitespace-nowrap overflow-hidden text-ellipsis">
                          {col.type === "boolean" ? (
                            <div className="flex items-center">
                              {value ? (
                                <span className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> SI
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-zinc-500 font-mono text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full">
                                  <XCircle className="w-3.5 h-3.5 text-zinc-500" /> NO
                                </span>
                              )}
                            </div>
                          ) : col.type === "select" ? (
                            value ? (
                              <span className="font-mono text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700">
                                {value}
                              </span>
                            ) : (
                              <span className="text-zinc-600 font-mono">-</span>
                            )
                          ) : col.type === "number" ? (
                            <span className="font-mono font-medium text-emerald-300 text-sm">
                              {value !== undefined && value !== null ? value : 0}
                            </span>
                          ) : col.type === "date" ? (
                            value ? (
                              <span className="flex items-center gap-1 text-zinc-400 font-mono text-xs">
                                <Calendar className="w-3 h-3 text-zinc-500" /> {value}
                              </span>
                            ) : (
                              <span className="text-zinc-600 font-mono">-</span>
                            )
                          ) : (
                            String(value || "")
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 text-center bg-zinc-900/10" id={`row-actions-td-${row.id}`}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          id={`btn-row-edit-${row.id}`}
                          onClick={() => handleOpenRowForm(row)}
                          className="p-1 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 cursor-pointer transition-all"
                          title={readOnly ? "Ver Ficha de Registro" : "Ficha / Editar Fila"}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {!readOnly && (
                          <button
                            id={`btn-row-delete-${row.id}`}
                            onClick={() => {
                              if (confirm("¿Proceder a eliminar este registro físico? Esta operación restará 1 fila de la base de datos.")) {
                                onDeleteRow(row.id);
                              }
                            }}
                            className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 cursor-pointer transition-all"
                            title="DELETE FROM (Eliminar Fila)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row modal edit details */}
      {showRowModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="modal-backdrop-row-form">
          <form
            onSubmit={handleSaveRow}
            className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            id="row-details-modal"
          >
            {/* Modal Header */}
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-emerald-400" />
                <h3 className="font-sans font-bold text-zinc-200 text-sm">
                  {editingRow ? "Editar Registro Físico (UPDATE)" : "Insertar Fila en Postgres (INSERT INTO)"}
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
            <div className="p-5 overflow-y-auto space-y-4" id="row-fields-form-body">
              {table.columns.map((col) => {
                const value = currentRowData[col.id];
                return (
                  <div key={col.id} className="space-y-1.5" id={`form-field-group-${col.id}`}>
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
                        value={value !== undefined ? value : 0}
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
            <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex justify-end gap-2.5 rounded-b-2xl items-center">
              {readOnly && (
                <span className="text-[10px] uppercase font-mono font-bold text-amber-500 animate-pulse bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
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
                  id="btn-modal-save-row"
                >
                  {editingRow ? "Confirmar UPDATE" : "Ejecutar INSERT"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
