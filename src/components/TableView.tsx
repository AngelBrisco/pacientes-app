import React, { useState } from "react";
import { TableSchema, Column, Row, ColumnType } from "../types";
import { normalizeImportedTableJson } from "../lib/normalization";
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
  RefreshCw,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Minimize2,
  Maximize2,
  RotateCcw
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
  onReorderColumns?: (columnIds: string[]) => Promise<void>;
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
  onReorderColumns,
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

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState<any>("");

  // 1. Column Widths & Resizing state (Allows shrinking down to 50px!)
  const defaultWidthForType = (type: ColumnType): number => {
    switch (type) {
      case "boolean": return 90;
      case "number": return 110;
      case "date": return 130;
      case "select": return 150;
      case "file": return 180;
      case "text":
      default: return 160;
    }
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(`nococlone_col_widths_${table.id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    const initial: Record<string, number> = {};
    table.columns.forEach(col => {
      initial[col.id] = defaultWidthForType(col.type);
    });
    return initial;
  });

  // Keep columnWidths in sync when table or columns change
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`nococlone_col_widths_${table.id}`);
      const parsed = saved ? JSON.parse(saved) : {};
      const updated: Record<string, number> = {};
      table.columns.forEach(col => {
        updated[col.id] = parsed[col.id] || defaultWidthForType(col.type);
      });
      setColumnWidths(updated);
    } catch {
      const initial: Record<string, number> = {};
      table.columns.forEach(col => {
        initial[col.id] = defaultWidthForType(col.type);
      });
      setColumnWidths(initial);
    }
  }, [table.id, table.columns]);

  const [showWidthsMenu, setShowWidthsMenu] = useState(false);
  const resizingRef = React.useRef<{
    colId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWidth = columnWidths[colId] || defaultWidthForType(table.columns.find(c => c.id === colId)?.type || "text");
    resizingRef.current = {
      colId,
      startX: e.clientX,
      startWidth: currentWidth,
    };
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const deltaX = moveEvent.clientX - resizingRef.current.startX;
      // Allow shrinking down to 50px
      const newWidth = Math.max(50, Math.round(resizingRef.current.startWidth + deltaX));
      setColumnWidths(prev => ({
        ...prev,
        [resizingRef.current!.colId]: newWidth
      }));
    };

    const onMouseUp = () => {
      if (resizingRef.current) {
        setColumnWidths(latest => {
          try {
            localStorage.setItem(`nococlone_col_widths_${table.id}`, JSON.stringify(latest));
          } catch {}
          return latest;
        });
      }
      resizingRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleResetColumnWidth = (colId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const col = table.columns.find(c => c.id === colId);
    const def = defaultWidthForType(col?.type || "text");
    setColumnWidths(prev => {
      const next = { ...prev, [colId]: def };
      try {
        localStorage.setItem(`nococlone_col_widths_${table.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleApplyPresetWidths = (preset: "compact" | "normal" | "wide") => {
    const updated: Record<string, number> = {};
    table.columns.forEach(col => {
      if (preset === "compact") {
        updated[col.id] = col.type === "boolean" ? 65 : col.type === "number" ? 80 : 100;
      } else if (preset === "wide") {
        updated[col.id] = 240;
      } else {
        updated[col.id] = defaultWidthForType(col.type);
      }
    });
    setColumnWidths(updated);
    try {
      localStorage.setItem(`nococlone_col_widths_${table.id}`, JSON.stringify(updated));
    } catch {}
    setShowWidthsMenu(false);
  };

  const handleResetAllWidths = () => {
    const initial: Record<string, number> = {};
    table.columns.forEach(col => {
      initial[col.id] = defaultWidthForType(col.type);
    });
    setColumnWidths(initial);
    try {
      localStorage.removeItem(`nococlone_col_widths_${table.id}`);
    } catch {}
    setShowWidthsMenu(false);
  };

  // 2. Single-click Row Marking / Tracking state
  const [markedRowIds, setMarkedRowIds] = useState<Set<string>>(new Set());

  const handleRowClick = (rowId: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't toggle mark if clicking on interactive controls
    if (
      target.closest("button") || 
      target.closest("input") || 
      target.closest("select") || 
      target.closest("a") || 
      target.closest(".no-mark-trigger")
    ) {
      return;
    }

    setMarkedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleClearMarkedRows = () => {
    setMarkedRowIds(new Set());
  };

  // 3. Horizontal Scrollbar Synchronization and Viewport Containment
  const tableScrollContainerRef = React.useRef<HTMLDivElement>(null);
  const topScrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [tableContentWidth, setTableContentWidth] = useState(0);
  const [canScrollHorizontal, setCanScrollHorizontal] = useState(false);
  const [isContainedScroll, setIsContainedScroll] = useState(true); // Default to contained height with sticky header
  const isSyncingTop = React.useRef(false);
  const isSyncingBottom = React.useRef(false);

  const measureScroll = React.useCallback(() => {
    if (tableScrollContainerRef.current) {
      const scrollW = tableScrollContainerRef.current.scrollWidth;
      const clientW = tableScrollContainerRef.current.clientWidth;
      setTableContentWidth(scrollW);
      setCanScrollHorizontal(scrollW > clientW + 2);
    }
  }, []);

  // Recalculate horizontal scroll dimensions
  React.useEffect(() => {
    measureScroll();
    const handleResize = () => measureScroll();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [table.columns, columnWidths, measureScroll, table.rows?.length]);

  const handleTopScroll = () => {
    if (isSyncingBottom.current) {
      isSyncingBottom.current = false;
      return;
    }
    if (topScrollContainerRef.current && tableScrollContainerRef.current) {
      isSyncingTop.current = true;
      tableScrollContainerRef.current.scrollLeft = topScrollContainerRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
      return;
    }
    if (topScrollContainerRef.current && tableScrollContainerRef.current) {
      isSyncingBottom.current = true;
      topScrollContainerRef.current.scrollLeft = tableScrollContainerRef.current.scrollLeft;
    }
  };

  const handleScrollHorizontal = (direction: "left" | "right") => {
    if (tableScrollContainerRef.current) {
      const delta = direction === "left" ? -280 : 280;
      tableScrollContainerRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  };

  // Global escape key handler to clear marked rows
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editingCell) {
        if (markedRowIds.size > 0) {
          setMarkedRowIds(new Set());
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [editingCell, markedRowIds]);

  // Total table pixel width calculation
  const totalCalculatedWidth = React.useMemo(() => {
    const indexColWidth = 56;
    const actionsColWidth = 100;
    const colsWidthSum = table.columns.reduce(
      (sum, col) => sum + (columnWidths[col.id] || defaultWidthForType(col.type)),
      0
    );
    return indexColWidth + actionsColWidth + colsWidthSum;
  }, [table.columns, columnWidths]);

  const handleStartInlineEdit = (row: Row, colId: string, colType: ColumnType) => {
    if (readOnly || colType === "file") return;
    setEditingCell({ rowId: row.id, colId });
    setEditingCellValue(row[colId]);
  };

  const handleSaveInlineCell = (rowId: string, colId: string) => {
    if (!editingCell) return;
    const row = table.rows?.find(r => r.id === rowId);
    if (row) {
      const updatedData = { ...row, [colId]: editingCellValue };
      onUpdateRow(rowId, updatedData);
    }
    setEditingCell(null);
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent, rowId: string, colId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveInlineCell(rowId, colId);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  // Sorting columns logic
  const handleSort = (colId: string) => {
    if (sortColumnId === colId) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumnId(colId);
      setSortDirection("asc");
    }
  };

  const handleMoveColumn = async (currentIndex: number, direction: "left" | "right") => {
    if (readOnly) return;
    
    const currentCols = [...(table.columns || [])];
    if (currentIndex === -1 || currentIndex >= currentCols.length) return;
    
    let targetIdx = currentIndex;
    if (direction === "left") {
      if (currentIndex > 0) {
        targetIdx = currentIndex - 1;
      } else {
        return;
      }
    } else {
      if (currentIndex < currentCols.length - 1) {
        targetIdx = currentIndex + 1;
      } else {
        return;
      }
    }
    
    // Swap columns
    const temp = currentCols[currentIndex];
    currentCols[currentIndex] = currentCols[targetIdx];
    currentCols[targetIdx] = temp;
    
    if (onReorderColumns) {
      const colIds = currentCols.map(c => c.id);
      await onReorderColumns(colIds);
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
        const normalized = normalizeImportedTableJson(data);

        if (normalized.columns.length === 0) {
          alert("No se pudieron identificar columnas ni datos en el archivo JSON.");
          return;
        }

        setTempColumns(normalized.columns);
        setTempRows(normalized.rows);
        setRecreateSuccessMessage(`Esquema y datos JSON procesados: ${normalized.columns.length} campos y ${normalized.rows.length} registros listos.`);
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
        {/* Search & Marked Rows status */}
        <div className="flex items-center gap-2.5 flex-wrap">
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

          {/* Marked Rows Tracker Indicator */}
          {markedRowIds.size > 0 && (
            <div 
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 font-sans animate-in fade-in"
              id="marked-rows-indicator-pill"
            >
              <Bookmark className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400 shrink-0" />
              <span>
                <strong>{markedRowIds.size}</strong> {markedRowIds.size === 1 ? "fila marcada" : "filas marcadas"}
              </span>
              <button
                type="button"
                onClick={handleClearMarkedRows}
                className="text-indigo-400 hover:text-indigo-200 ml-1 p-0.5 rounded hover:bg-indigo-500/20 cursor-pointer text-[11px] flex items-center gap-0.5"
                title="Desmarcar todas las filas (o presiona Escape)"
              >
                <X className="w-3 h-3" />
                <span>Desmarcar</span>
              </button>
            </div>
          )}
        </div>

        {/* Create column & user trigger controls */}
        <div className="flex items-center gap-2 relative flex-wrap">
          {/* Column Width Presets Dropdown */}
          <div className="relative">
            <button
              type="button"
              id="btn-column-widths-menu"
              onClick={() => setShowWidthsMenu(!showWidthsMenu)}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white border border-zinc-700/85 rounded-lg text-xs font-medium cursor-pointer transition-all shadow-xs"
              title="Ajustar anchos de columnas"
            >
              <Columns3 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Ancho Columnas</span>
            </button>

            {showWidthsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowWidthsMenu(false)} />
                <div className="absolute right-0 mt-2 w-52 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-1 text-xs">
                  <div className="px-3 py-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-bold border-b border-zinc-850">
                    Ajuste de Columnas
                  </div>
                  <button
                    onClick={() => handleApplyPresetWidths("compact")}
                    className="w-full text-left px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span>Compacto (Achicar todo)</span>
                    <span className="font-mono text-[10px] text-zinc-500">~80-100px</span>
                  </button>
                  <button
                    onClick={() => handleApplyPresetWidths("normal")}
                    className="w-full text-left px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span>Normal (Estándar)</span>
                    <span className="font-mono text-[10px] text-zinc-500">~150px</span>
                  </button>
                  <button
                    onClick={() => handleApplyPresetWidths("wide")}
                    className="w-full text-left px-3 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span>Amplio (Espacioso)</span>
                    <span className="font-mono text-[10px] text-zinc-500">~240px</span>
                  </button>
                  <div className="my-1 border-t border-zinc-850" />
                  <button
                    onClick={handleResetAllWidths}
                    className="w-full text-left px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restablecer anchos</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Toggle Contained Scroll with Sticky Header vs Full Page */}
          <button
            type="button"
            id="btn-toggle-scroll-mode"
            onClick={() => setIsContainedScroll(!isContainedScroll)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-medium cursor-pointer transition-all shadow-xs ${
              isContainedScroll 
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20" 
                : "bg-zinc-800 border-zinc-700/85 text-zinc-400 hover:text-zinc-200"
            }`}
            title={isContainedScroll ? "Desactivar vista contenida (modo página completa)" : "Fijar cabecera y mantener barra de scroll visible"}
          >
            {isContainedScroll ? <Minimize2 className="w-3.5 h-3.5 text-indigo-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">
              {isContainedScroll ? "Cabecera Fija" : "Expandido"}
            </span>
          </button>
          
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

      {/* Barra de desplazamiento lateral superior sincronizada */}
      {canScrollHorizontal && (
        <div 
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex items-center gap-3 shadow-xs select-none" 
          id="top-horizontal-scroll-bar"
        >
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline text-zinc-300 font-sans">Desplazamiento horizontal:</span>
          </div>

          {/* Quick scroll left button */}
          <button
            type="button"
            onClick={() => handleScrollHorizontal("left")}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
            title="Desplazar tabla hacia la izquierda"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Synchronized top scroll track */}
          <div
            ref={topScrollContainerRef}
            onScroll={handleTopScroll}
            className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar h-3 bg-zinc-950 border border-zinc-800 rounded-full"
            title="Arrastra o rueda esta barra para moverte horizontalmente por las columnas"
          >
            <div style={{ width: `${tableContentWidth}px`, height: "1px" }} />
          </div>

          {/* Quick scroll right button */}
          <button
            type="button"
            onClick={() => handleScrollHorizontal("right")}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
            title="Desplazar tabla hacia la derecha"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Spreadsheet grid container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-xs overflow-hidden flex flex-col" id="grid-spreadsheet-table-container">
        <div 
          ref={tableScrollContainerRef}
          onScroll={handleBottomScroll}
          className={`w-full overflow-x-auto overflow-y-auto custom-scrollbar ${
            isContainedScroll ? "max-h-[calc(100vh-270px)]" : ""
          }`}
        >
          <table 
            className="text-left border-collapse table-fixed select-text" 
            style={{ width: `${totalCalculatedWidth}px`, minWidth: `${totalCalculatedWidth}px` }}
            id="spreadsheet-dynamic-table"
          >
            <thead className={`${isContainedScroll ? "sticky top-0 z-20 bg-zinc-950 shadow-md" : "bg-zinc-950/90"}`}>
              <tr className="text-zinc-400 tracking-wider text-[10px] uppercase font-mono border-b border-zinc-800 font-bold">
                {/* Index col */}
                <th 
                  style={{ width: "56px", minWidth: "56px", maxWidth: "56px" }}
                  className="px-2 py-3.5 text-center border-r border-zinc-800 bg-zinc-950/90 select-none"
                >
                  #
                </th>
                
                {/* Schema columns */}
                {table.columns.map((col, index) => {
                  const colWidth = columnWidths[col.id] || defaultWidthForType(col.type);
                  return (
                    <th 
                      key={col.id} 
                      style={{ width: `${colWidth}px`, minWidth: `${colWidth}px`, maxWidth: `${colWidth}px` }}
                      className="px-3 py-3 border-r border-zinc-800 select-none relative group/header overflow-hidden transition-colors"
                    >
                      <div className="flex items-center justify-between gap-1.5 pr-2 overflow-hidden">
                        <div 
                          className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-100 transition-colors min-w-0 overflow-hidden" 
                          onClick={() => handleSort(col.id)}
                          title={`Ordenar por ${col.name} (Ancho: ${colWidth}px - Doble clic en borde para restablecer)`}
                        >
                          <span className="truncate font-sans font-medium text-zinc-300">{col.name}</span>
                          <ArrowUpDown className="w-3 h-3 text-zinc-500 group-hover/header:text-zinc-300 shrink-0" />
                          <span className="font-mono text-[8px] px-1 py-0.5 bg-zinc-900 text-zinc-500 rounded border border-zinc-800/80 shrink-0">
                            {col.type}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Left/Right Column movement controls */}
                          {!readOnly && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleMoveColumn(index, "left")}
                                disabled={index === 0}
                                className="text-zinc-500 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors p-0.5 cursor-pointer text-[10px]"
                                type="button"
                                title="Mover columna a la izquierda"
                              >
                                ◀
                              </button>
                              <button
                                onClick={() => handleMoveColumn(index, "right")}
                                disabled={index === table.columns.length - 1}
                                className="text-zinc-500 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors p-0.5 cursor-pointer text-[10px]"
                                type="button"
                                title="Mover columna a la derecha"
                              >
                                ▶
                              </button>
                            </div>
                          )}

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
                      </div>

                      {/* Resize Handle (Drag to shrink down to 50px or expand) */}
                      <div
                        onMouseDown={(e) => startResizing(col.id, e)}
                        onDoubleClick={(e) => handleResetColumnWidth(col.id, e)}
                        className="absolute top-0 right-0 w-3 h-full cursor-col-resize select-none flex items-center justify-center group/resizer hover:bg-indigo-500/25 active:bg-indigo-500/50 z-10 transition-colors"
                        title="Arrastra para achicar o agrandar columna. Doble clic para restablecer ancho original."
                      >
                        <div className="w-0.5 h-3/5 bg-zinc-700/70 group-hover/resizer:bg-indigo-400 group-hover/resizer:w-1 group-hover/resizer:h-full rounded-full transition-all" />
                      </div>
                    </th>
                  );
                })}
                
                {/* Right side Actions col */}
                <th 
                  style={{ width: "100px", minWidth: "100px", maxWidth: "100px" }}
                  className="px-3 py-3.5 text-center border-l border-zinc-800 bg-zinc-950/90 select-none"
                >
                  Acciones
                </th>
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
                sortedRows.map((row, idx) => {
                  const isMarked = markedRowIds.has(row.id);
                  return (
                    <tr 
                      key={row.id} 
                      onClick={(e) => handleRowClick(row.id, e)}
                      className={`transition-all duration-150 group/row cursor-pointer select-text ${
                        isMarked 
                          ? "bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-50 ring-1 ring-inset ring-indigo-500/60 shadow-inner" 
                          : "hover:bg-zinc-900/50 text-zinc-300"
                      }`} 
                      id={`row-tr-${row.id}`}
                      title={isMarked ? "Fila marcada para seguimiento (clic para desmarcar)" : "Clic para marcar y seguir fácilmente esta fila"}
                    >
                      {/* Index & Bookmark tracker cell */}
                      <td 
                        style={{ width: "56px", minWidth: "56px", maxWidth: "56px" }}
                        className={`px-2 py-3 text-center font-mono border-r border-zinc-800 font-bold transition-colors select-none ${
                          isMarked 
                            ? "bg-indigo-900/70 text-indigo-200 border-l-4 border-l-indigo-400" 
                            : "bg-zinc-950/20 text-zinc-500"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {isMarked ? (
                            <Bookmark className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400 shrink-0 animate-in zoom-in-75 duration-150" />
                          ) : (
                            <span className="text-[11px]">{idx + 1}</span>
                          )}
                        </div>
                      </td>

                      {/* Columns values */}
                      {table.columns.map((col) => {
                        const colWidth = columnWidths[col.id] || defaultWidthForType(col.type);
                        const value = row[col.id];
                        const isEditing = editingCell?.rowId === row.id && editingCell?.colId === col.id;

                        return (
                          <td
                            key={col.id}
                            style={{ width: `${colWidth}px`, minWidth: `${colWidth}px`, maxWidth: `${colWidth}px` }}
                            onDoubleClick={() => handleStartInlineEdit(row, col.id, col.type)}
                            className={`px-3 py-3 border-r border-zinc-800 font-sans whitespace-nowrap overflow-hidden text-ellipsis transition-all ${
                              isMarked ? "border-zinc-800/80" : ""
                            } ${
                              !readOnly && col.type !== "file" ? "cursor-text hover:bg-zinc-800/20" : ""
                            }`}
                            title={!readOnly && col.type !== "file" ? "Doble clic para editar directamente" : undefined}
                          >
                          {isEditing ? (
                            col.type === "boolean" ? (
                              <select
                                autoFocus
                                value={editingCellValue === true ? "true" : "false"}
                                onChange={(e) => setEditingCellValue(e.target.value === "true")}
                                onBlur={() => handleSaveInlineCell(row.id, col.id)}
                                onKeyDown={(e) => handleInlineKeyDown(e, row.id, col.id)}
                                className="bg-zinc-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none w-full cursor-pointer focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="true">SI (True)</option>
                                <option value="false">NO (False)</option>
                              </select>
                            ) : col.type === "select" ? (
                              <select
                                autoFocus
                                value={editingCellValue || ""}
                                onChange={(e) => setEditingCellValue(e.target.value)}
                                onBlur={() => handleSaveInlineCell(row.id, col.id)}
                                onKeyDown={(e) => handleInlineKeyDown(e, row.id, col.id)}
                                className="bg-zinc-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none w-full cursor-pointer focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="">-- Sin Selección --</option>
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
                                autoFocus
                                value={editingCellValue !== undefined && editingCellValue !== null ? editingCellValue : ""}
                                onChange={(e) => setEditingCellValue(e.target.value === "" ? "" : Number(e.target.value))}
                                onBlur={() => handleSaveInlineCell(row.id, col.id)}
                                onKeyDown={(e) => handleInlineKeyDown(e, row.id, col.id)}
                                className="bg-zinc-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-200 font-mono outline-none w-full focus:ring-1 focus:ring-indigo-500"
                              />
                            ) : col.type === "date" ? (
                              <input
                                type="date"
                                autoFocus
                                value={editingCellValue || ""}
                                onChange={(e) => setEditingCellValue(e.target.value)}
                                onBlur={() => handleSaveInlineCell(row.id, col.id)}
                                onKeyDown={(e) => handleInlineKeyDown(e, row.id, col.id)}
                                className="bg-zinc-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-200 font-mono outline-none w-full focus:ring-1 focus:ring-indigo-500"
                              />
                            ) : (
                              <input
                                type="text"
                                autoFocus
                                value={editingCellValue || ""}
                                onChange={(e) => setEditingCellValue(e.target.value)}
                                onBlur={() => handleSaveInlineCell(row.id, col.id)}
                                onKeyDown={(e) => handleInlineKeyDown(e, row.id, col.id)}
                                className="bg-zinc-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none w-full focus:ring-1 focus:ring-indigo-500"
                                maxLength={col.varcharLength}
                              />
                            )
                          ) : (
                            col.type === "boolean" ? (
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
                                <span className="text-zinc-650 font-mono">-</span>
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
                                <span className="text-zinc-650 font-mono">-</span>
                              )
                            ) : col.type === "file" ? (
                              (() => {
                                const filesArr: string[] = Array.isArray(value) 
                                  ? value 
                                  : value && typeof value === "string" && value.startsWith("[") 
                                    ? JSON.parse(value) 
                                    : value ? [String(value)] : [];
                                if (filesArr.length === 0) {
                                  return <span className="text-zinc-500 italic font-mono text-[10.5px]">- (sin adjuntos)</span>;
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
                            )
                          )}
                        </td>
                      );
                    })}

                    <td 
                      style={{ width: "100px", minWidth: "100px", maxWidth: "100px" }}
                      className="px-3 py-3 text-center bg-zinc-950/40 border-l border-zinc-800/80 select-none" 
                      id={`row-actions-td-${row.id}`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          id={`btn-row-edit-${row.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenRowForm(row);
                          }}
                          className="p-1 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 cursor-pointer transition-all"
                          title={readOnly ? "Ver Ficha de Registro" : "Ficha / Editar Fila"}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {!readOnly && (
                          <button
                            id={`btn-row-delete-${row.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
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
                );
              })
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
