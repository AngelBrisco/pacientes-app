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
  Grid,
  Paperclip,
  Upload,
  Download,
  FileSpreadsheet,
  Braces,
  RefreshCw
} from "lucide-react";

interface TableViewProps {
  table: TableSchema;
  onAddColumn: (name: string, type: ColumnType, options?: string[]) => void;
  onDeleteColumn: (columnId: string) => void;
  onAddRow: (rowData: Record<string, any>) => void;
  onBulkAddRows?: (rowsData: Record<string, any>[]) => Promise<void>;
  onRecreateTable?: (tableId: string, columns: any[], rows: any[]) => Promise<void>;
  onUpdateRow: (rowId: string, rowData: Record<string, any>) => void;
  onDeleteRow: (rowId: string) => void;
  readOnly?: boolean;
  isAdmin?: boolean;
}

export default function TableView({
  table,
  onAddColumn,
  onDeleteColumn,
  onAddRow,
  onBulkAddRows,
  onRecreateTable,
  onUpdateRow,
  onDeleteRow,
  readOnly = false,
  isAdmin = false,
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
  
  // File uploading status state and session details
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});
  const sessionStr = localStorage.getItem("nococlone_session");
  const sessionUser = sessionStr ? JSON.parse(sessionStr) : null;
  const currentUserUsername = sessionUser ? sessionUser.username : "";

  // Unified Export & Recreate States
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showRecreateModal, setShowRecreateModal] = useState(false);
  const [recreateMethod, setRecreateMethod] = useState<"csv" | "json">("csv");
  const [recreateSuccessMessage, setRecreateSuccessMessage] = useState("");
  const [tempColumns, setTempColumns] = useState<any[] | null>(null);
  const [tempRows, setTempRows] = useState<any[] | null>(null);

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

  // EXPORTAR COHORTES A FORMATO CSV (RFC 4180)
  const handleExportCSV = () => {
    try {
      if (!table.columns || table.columns.length === 0) {
        alert("No hay columnas configuradas para exportar.");
        return;
      }

      // Headers (Names)
      const headers = table.columns.map(col => `"${col.name.replace(/"/g, '""')}"`);
      
      // Rows encoding
      const rows = table.rows.map(row => {
        return table.columns.map(col => {
          const val = row[col.id];
          if (val === undefined || val === null) {
            return '""';
          }
          let str = "";
          if (typeof val === "object") {
            str = JSON.stringify(val);
          } else {
            str = String(val);
          }
          return `"${str.replace(/"/g, '""')}"`;
        }).join(",");
      });

      // Join and prepend UTF-8 Byte Order Mark (BOM) for Excel compatibility
      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${table.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_datos.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error(err);
      alert(`Ocurrió un error al exportar la tabla activa: ${err.message}`);
    }
  };

  // CSV robust quote parsing scanner helper
  const parseCSVLine = (lineText: string): string[] => {
    const result: string[] = [];
    let insideQuote = false;
    let entry = "";
    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i];
      if (char === '"') {
        if (insideQuote && lineText[i + 1] === '"') {
          entry += '"';
          i++; // skip escaped quote sibling
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

  // IMPORTAR REGISTROS DESDE CSV CON PARSE COMPACTO
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          alert("El archivo seleccionado está vacío.");
          return;
        }

        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) {
          alert("No se encontraron registros de datos.");
          return;
        }

        // Header parsing & alignment
        const originalHeaders = parseCSVLine(lines[0]);
        const colMap: Record<number, string> = {}; // index -> column ID
        
        originalHeaders.forEach((rawHeader, idx) => {
          const cleanHeader = rawHeader.replace(/^\uFEFF/, "").trim().toLowerCase(); // Clean UTF-8 BOM
          // Match against column names or IDs
          const matchedCol = table.columns.find(col => 
            col.id.toLowerCase() === cleanHeader || 
            col.name.toLowerCase() === cleanHeader
          );
          if (matchedCol) {
            colMap[idx] = matchedCol.id;
          }
        });

        if (Object.keys(colMap).length === 0) {
          alert("Fallo de mapeo: Ninguno de los encabezados del archivo CSV coincide con las columnas actuales.");
          return;
        }

        // Row parsing & serialization
        const importedData: Record<string, any>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cellValues = parseCSVLine(lines[i]);
          if (cellValues.length === 0 || (cellValues.length === 1 && cellValues[0] === "")) {
            continue;
          }

          const parsedRow: Record<string, any> = {};
          table.columns.forEach(col => {
            // default fallback matches types
            if (col.type === "boolean") parsedRow[col.id] = false;
            else if (col.type === "number") parsedRow[col.id] = 0;
            else parsedRow[col.id] = "";
          });

          cellValues.forEach((cellVal, idx) => {
            const colId = colMap[idx];
            if (colId) {
              parsedRow[colId] = cellVal;
            }
          });

          importedData.push(parsedRow);
        }

        if (importedData.length === 0) {
          alert("No se pudieron parsear registros de datos válidos.");
          return;
        }

        if (onBulkAddRows) {
          await onBulkAddRows(importedData);
          alert(`¡Éxito! Se han importado correctamente ${importedData.length} registros en la tabla.`);
        } else {
          // Fallback call single insertions
          for (const rowObj of importedData) {
            onAddRow(rowObj);
          }
          alert(`¡Éxito! Se cargaron ${importedData.length} registros en la grilla.`);
        }

        // Reset input so importing the same file triggers change again
        e.target.value = "";
      } catch (err: any) {
        console.error(err);
        alert(`Ocurrió un error al procesar el archivo CSV: ${err.message}`);
      }
    };

    reader.readAsText(file, "UTF-8");
  };

  // IMPORTAR REGISTROS DESDE JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          alert("El archivo seleccionado está vacío.");
          return;
        }

        const jsonData = JSON.parse(text);
        let rowsToImport: any[] = [];

        if (Array.isArray(jsonData)) {
          rowsToImport = jsonData;
        } else if (jsonData && typeof jsonData === "object" && Array.isArray(jsonData.rows)) {
          rowsToImport = jsonData.rows;
        } else if (jsonData && typeof jsonData === "object") {
          rowsToImport = [jsonData];
        } else {
          alert("El formato JSON no es válido. Debe ser un array de objetos o un objeto de tabla.");
          return;
        }

        if (rowsToImport.length === 0) {
          alert("No se encontraron registros de datos para importar.");
          return;
        }

        const importedData: Record<string, any>[] = [];
        
        rowsToImport.forEach((rawRow: any) => {
          const parsedRow: Record<string, any> = {};
          
          // Initial default values matching columns
          table.columns.forEach(col => {
            if (col.type === "boolean") parsedRow[col.id] = false;
            else if (col.type === "number") parsedRow[col.id] = 0;
            else parsedRow[col.id] = "";
          });

          // Match keys from JSON with column ID or Name
          Object.keys(rawRow).forEach((key) => {
            const cleanKey = key.trim().toLowerCase();
            const matchedCol = table.columns.find(col => 
              col.id.toLowerCase() === cleanKey || 
              col.name.toLowerCase() === cleanKey
            );
            
            if (matchedCol) {
              let val = rawRow[key];
              if (matchedCol.type === "boolean") {
                parsedRow[matchedCol.id] = (val === true || String(val).toLowerCase() === "true" || String(val) === "1");
              } else if (matchedCol.type === "number") {
                parsedRow[matchedCol.id] = val !== undefined && val !== "" ? Number(val) : 0;
                if (isNaN(parsedRow[matchedCol.id])) parsedRow[matchedCol.id] = 0;
              } else {
                parsedRow[matchedCol.id] = val !== undefined && val !== null ? String(val) : "";
              }
            } else {
              // Try direct mapping if the key matches col.id exactly
              const directCol = table.columns.find(col => col.id === key);
              if (directCol) {
                let val = rawRow[key];
                if (directCol.type === "boolean") {
                  parsedRow[directCol.id] = (val === true || String(val).toLowerCase() === "true" || String(val) === "1");
                } else if (directCol.type === "number") {
                  parsedRow[directCol.id] = val !== undefined && val !== "" ? Number(val) : 0;
                  if (isNaN(parsedRow[directCol.id])) parsedRow[directCol.id] = 0;
                } else {
                  parsedRow[directCol.id] = val !== undefined && val !== null ? String(val) : "";
                }
              }
            }
          });

          importedData.push(parsedRow);
        });

        if (onBulkAddRows) {
          await onBulkAddRows(importedData);
          alert(`¡Éxito! Se han importado correctamente ${importedData.length} registros desde el JSON.`);
        } else {
          for (const rowObj of importedData) {
            onAddRow(rowObj);
          }
          alert(`¡Éxito! Se cargaron ${importedData.length} registros en la grilla.`);
        }

        e.target.value = "";
      } catch (err: any) {
        console.error(err);
        alert(`Ocurrió un error al procesar el archivo JSON: ${err.message}`);
      }
    };

    reader.readAsText(file, "UTF-8");
  };

  // EXPORTAR TABLA COMPLETA EN FORMATO JSON
  const handleExportJSON = () => {
    try {
      const exportObject = {
        type: "table_snapshot",
        name: table.name,
        columns: table.columns,
        rows: table.rows
      };

      const jsonContent = JSON.stringify(exportObject, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${table.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_esquema_datos.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowExportMenu(false);
    } catch (err: any) {
      console.error(err);
      alert(`Ocurrió un error al exportar la tabla en formato JSON: ${err.message}`);
    }
  };

  // RECREAR TABLA HANDLERS (ADMIN-ONLY OVERWRITE)
  const handleRecreateCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) {
          alert("El archivo CSV no contiene líneas de datos.");
          return;
        }

        const rawHeaders = parseCSVLine(lines[0]);
        const headers = rawHeaders.map((h, i) => {
          const name = h.replace(/^\uFEFF/, "").trim();
          return {
            id: "col_" + name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + i,
            name: name || `Campo_${i + 1}`,
            type: "text" as const
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

        setTempColumns(headers);
        setTempRows(rows);
        setRecreateSuccessMessage(`Esquema CSV cargado: ${headers.length} columnas y ${rows.length} registros listos.`);
      } catch (err: any) {
        alert("Error al parsear CSV: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleRecreateJSONUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const data = JSON.parse(text);
        if (data && data.columns && Array.isArray(data.columns)) {
          setTempColumns(data.columns);
          setTempRows(Array.isArray(data.rows) ? data.rows : []);
          setRecreateSuccessMessage(`Estilo copia de seguridad: ${data.columns.length} columnas y ${data.rows?.length || 0} registros listos.`);
        } else {
          // derivation
          const list = Array.isArray(data) ? data : [data];
          if (list.length === 0) {
            alert("No hay registros que procesar.");
            return;
          }
          const keys = Array.from(new Set(list.flatMap((o: any) => Object.keys(o))));
          const columns = keys.map((k, idx) => ({
            id: "col_" + k.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + idx,
            name: k,
            type: typeof list[0][k] === "number" ? "number" as const : typeof list[0][k] === "boolean" ? "boolean" as const : "text" as const
          }));
          const rows = list.map((o: any) => {
            const rowWithColIds: any = {};
            keys.forEach((k, idx) => {
              const colId = "col_" + k.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + idx;
              rowWithColIds[colId] = o[k] !== undefined && o[k] !== null ? o[k] : "";
            });
            return rowWithColIds;
          });
          setTempColumns(columns);
          setTempRows(rows);
          setRecreateSuccessMessage(`JSON derivado: ${columns.length} campos y ${rows.length} registros listos.`);
        }
      } catch (err: any) {
        alert("Error al parsear JSON: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleExecuteRecreate = async () => {
    if (!tempColumns || !onRecreateTable) return;
    try {
      await onRecreateTable(table.id, tempColumns, tempRows || []);
      setTempColumns(null);
      setTempRows(null);
      setRecreateSuccessMessage("");
      setShowRecreateModal(false);
      alert("¡Éxito! Estructura de tabla y registros recreados correctamente.");
    } catch (err: any) {
      alert("Fallo al recrear la tabla: " + err.message);
    }
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
        <div className="flex items-center gap-2 relative">
          
          {/* Unified Export Button */}
          <div className="relative">
            <button
              type="button"
              id="btn-unified-export"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-indigo-405 border border-zinc-700/85 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-xs"
              title="Exportar esquema o datos"
            >
              <Download className="w-4 h-4 shrink-0 text-indigo-400" />
              <span>Exportar...</span>
            </button>

            {showExportMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-zinc-950 border border-zinc-850 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-1" id="export-dropdown-menu">
                  <button
                    onClick={() => { handleExportCSV(); setShowExportMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-405" />
                    <span>CSV (Sólo Datos)</span>
                  </button>
                  <button
                    onClick={() => { handleExportJSON(); setShowExportMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Braces className="w-3.5 h-3.5 text-indigo-405" />
                    <span>JSON (Estructura + Datos)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {!readOnly && (
            <>
              {/* Recrear Tabla por Importación (Solo Admins) */}
              {isAdmin && (
                <button
                  id="btn-trigger-recreate-table"
                  type="button"
                  onClick={() => {
                    setTempColumns(null);
                    setTempRows(null);
                    setRecreateSuccessMessage("");
                    setShowRecreateModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/15 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-xs"
                  title="Sobrescribir completamente la estructura de la tabla activa e importar datos"
                >
                  <RefreshCw className="w-4 h-4 shrink-0 text-rose-450" />
                  <span>Recrear Tabla...</span>
                </button>
              )}

              {/* Add Column Button */}
              {isAdmin && (
                <button
                  id="btn-toggle-add-column"
                  onClick={() => setShowAddCol(!showAddCol)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-medium text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800/80 transition-all cursor-pointer shadow-xs"
                >
                  <PlusCircle className="w-4.5 h-4.5 text-emerald-500" />
                  <span>Columna</span>
                </button>
              )}

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
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Nueva columna física (SQL Style)
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
                <option value="file">FILE (Adjuntos / Imagen / PDF)</option>
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
                      {index > 0 && !readOnly && isAdmin && (
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
                          ) : col.type === "file" ? (
                            (() => {
                              const filesArr: string[] = Array.isArray(value) 
                                ? value 
                                : value && typeof value === "string" && value.startsWith("[") 
                                  ? JSON.parse(value) 
                                  : value ? [String(value)] : [];
                              if (filesArr.length === 0) {
                                return <span className="text-zinc-655 italic font-mono text-[10.5px]">- (sin adjuntos)</span>;
                              }
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap overflow-hidden max-w-full">
                                  {filesArr.map((url, i) => {
                                    const filename = url.split("/").pop() || "archivo";
                                    const cleanName = filename.replace(/^\d+_/g, "");
                                    return (
                                      <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1.5 font-sans font-semibold text-[10.5px] bg-[#6366f1]/10 border border-[#6366f1]/20 text-[#818cf8] hover:text-[#a5b4fc] px-2 py-0.5 rounded-full transition-all"
                                        title={`Ver ${cleanName}`}
                                      >
                                        <Paperclip className="w-2.5 h-2.5 shrink-0" />
                                        <span className="truncate max-w-[130px]">{cleanName}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              );
                            })()
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
                  {editingRow ? "Editar Registro Físico (UPDATE)" : "Insertar Fila en la DB (INSERT INTO)"}
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
                    ) : col.type === "file" ? (
                      (() => {
                        const filesArr: string[] = Array.isArray(value) 
                          ? value 
                          : value && typeof value === "string" && value.startsWith("[") 
                            ? JSON.parse(value) 
                            : value ? [String(value)] : [];
                        return (
                          <div className="space-y-2">
                            {/* List existing files */}
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

                            {/* Upload Drop Zone / Button */}
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

      {/* Recreate Table Schema and Rows Overwrite Modal */}
      {showRecreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in" id="modal-backdrop-recreate-table">
          <div className="bg-zinc-950 border border-zinc-850 w-full max-w-md rounded-2xl shadow-2xl flex flex-col p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-rose-450 animate-spin" />
                <h3 className="font-sans font-bold text-zinc-100 text-sm">
                  Recrear Tabla Física: {table.name}
                </h3>
              </div>
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                onClick={() => {
                  setShowRecreateModal(false);
                  setTempColumns(null);
                  setTempRows(null);
                  setRecreateSuccessMessage("");
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
              Esta operación es destructiva. Reemplazará permanentemente todas las columnas descritas de la tabla activa <span className="font-mono text-indigo-400">"{table.name}"</span> y borrará los registros para sobrescribirlos con los datos del archivo elegido.
            </p>

            {/* Selector de Método */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => { setRecreateMethod("csv"); setTempColumns(null); setTempRows(null); setRecreateSuccessMessage(""); }}
                className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer text-center select-none transition-all ${
                  recreateMethod === "csv"
                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 shadow-sm"
                    : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-350"
                }`}
              >
                Cargar Archivo CSV
              </button>
              <button
                type="button"
                onClick={() => { setRecreateMethod("json"); setTempColumns(null); setTempRows(null); setRecreateSuccessMessage(""); }}
                className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer text-center select-none transition-all ${
                  recreateMethod === "json"
                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 shadow-sm"
                    : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-350"
                }`}
              >
                Cargar Archivo JSON
              </button>
            </div>

            {/* Input de archivo */}
            {recreateMethod === "csv" ? (
              <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl text-center" id="recreate-csv-upload-zone">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleRecreateCSVUpload}
                  id="recreate-csv-file"
                  className="hidden"
                />
                <label
                  htmlFor="recreate-csv-file"
                  className="flex flex-col items-center justify-center gap-2 py-2 text-xs text-zinc-350 hover:text-indigo-400 cursor-pointer transition-all"
                >
                  <Upload className="w-5 h-5 text-indigo-405" />
                  <span className="font-semibold">Examinar archivo CSV (.csv)</span>
                </label>
              </div>
            ) : (
              <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl text-center" id="recreate-json-upload-zone">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRecreateJSONUpload}
                  id="recreate-json-file"
                  className="hidden"
                />
                <label
                  htmlFor="recreate-json-file"
                  className="flex flex-col items-center justify-center gap-2 py-2 text-xs text-zinc-350 hover:text-indigo-400 cursor-pointer transition-all"
                >
                  <Upload className="w-5 h-5 text-indigo-405" />
                  <span className="font-semibold">Examinar archivo JSON (.json)</span>
                </label>
              </div>
            )}

            {/* Mensaje de carga de datos exitosa */}
            {recreateSuccessMessage && (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 rounded-xl text-xs font-mono font-medium leading-normal animate-fade-in">
                ✓ {recreateSuccessMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                type="button"
                onClick={() => {
                  setShowRecreateModal(false);
                  setTempColumns(null);
                  setTempRows(null);
                  setRecreateSuccessMessage("");
                }}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!tempColumns}
                onClick={handleExecuteRecreate}
                className="px-4.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold rounded-xl text-xs cursor-pointer shadow-md transition-all"
              >
                Sobrescribir y Recrear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
