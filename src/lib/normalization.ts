import { Column, Row, ColumnType } from "../types";

interface NormalizedData {
  name: string;
  columns: Column[];
  rows: Row[];
}

export function normalizeImportedTableJson(data: any): NormalizedData {
  if (!data) {
    return { name: "Nueva Tabla", columns: [], rows: [] };
  }

  let name = "Tabla Importada";
  let rawColumns: any[] = [];
  let rawRows: any[] = [];

  let targetData = data;

  // 1. Desempaquetar si viene envuelto en un wrapper de base de datos o snapshots
  if (!Array.isArray(targetData) && Array.isArray(targetData.tables) && targetData.tables.length > 0) {
    targetData = targetData.tables[0];
  }

  // 2. Buscar propiedades dinámicas si viene envuelto bajo una clave única (ej: { "pacientes": { columns: ..., rows: ... } })
  if (!Array.isArray(targetData) && !targetData.columns && !targetData.rows) {
    const keys = Object.keys(targetData);
    for (const key of keys) {
      if (targetData[key] && typeof targetData[key] === "object") {
        const checkObj = targetData[key];
        if (Array.isArray(checkObj.columns) || Array.isArray(checkObj.rows) || Array.isArray(checkObj)) {
          targetData = checkObj;
          name = key;
          break;
        }
      }
    }
  }

  // 3. Resolver estructura según tipo de targetData
  if (Array.isArray(targetData)) {
    // Array puro de filas directamente
    rawRows = targetData;
    if (rawRows.length > 0) {
      const keys = Array.from(new Set(rawRows.flatMap((o: any) => Object.keys(o || {}))));
      rawColumns = keys.map((k, idx) => ({
        id: "col_" + k.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + idx,
        title: k,
        type: typeof rawRows[0][k] === "number" ? "number" : typeof rawRows[0][k] === "boolean" ? "boolean" : "text"
      }));
    }
  } else if (targetData && typeof targetData === "object") {
    name = String(targetData.name || targetData.title || name).trim();
    rawColumns = Array.isArray(targetData.columns) ? targetData.columns : [];

    if (Array.isArray(targetData.rows)) {
      rawRows = targetData.rows;
    } else if (Array.isArray(targetData.records)) {
      rawRows = targetData.records;
    } else if (Array.isArray(targetData.data)) {
      rawRows = targetData.data;
    } else if (Array.isArray(targetData.items)) {
      rawRows = targetData.items;
    } else {
      // Intentar encontrar algún campo que sea array de objetos
      for (const key of Object.keys(targetData)) {
        if (Array.isArray(targetData[key]) && key !== "columns" && key !== "views" && key !== "columnOrder" && key !== "sort") {
          rawRows = targetData[key];
          break;
        }
      }
    }

    // Si encontramos filas pero NO columnas, autoderivamos
    if (rawColumns.length === 0 && rawRows.length > 0) {
      const keys = Array.from(new Set(rawRows.flatMap((o: any) => Object.keys(o || {}))));
      rawColumns = keys.map((k, idx) => ({
        id: "col_" + k.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + idx,
        title: k,
        type: typeof rawRows[0][k] === "number" ? "number" : typeof rawRows[0][k] === "boolean" ? "boolean" : "text"
      }));
    }
  }

  // Helper para normalizar llaves de búsquedas de celdas
  const cleanKey = (s: string) => {
    return s.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // remover tildes y diacríticos
            .replace(/[^a-z0-9]/g, "");     // alfanumérico estricto
  };

  // 4. Mapear y normalizar Columnas
  const normalizedCols: Column[] = rawColumns.map((col: any, idx: number) => {
    let cleanId = String(col.id !== undefined && col.id !== null ? col.id : (col.title || col.name || `campo_${idx}`)).trim();
    if (/^\d+$/.test(cleanId) || !cleanId.startsWith("col_")) {
      cleanId = "col_" + cleanId.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + idx;
    }

    const colName = String(col.name || col.title || col.label || `Campo ${idx + 1}`).trim();

    let type: ColumnType = "text";
    const rawType = String(col.type || "").toLowerCase();
    if (rawType === "selection" || rawType === "select") {
      type = "select";
    } else if (rawType === "datetime" || rawType === "date" || rawType === "time") {
      type = "date";
    } else if (rawType === "number" || rawType === "int" || rawType === "float" || rawType === "decimal") {
      type = "number";
    } else if (rawType === "boolean" || rawType === "bool") {
      type = "boolean";
    } else if (rawType === "file" || rawType === "attachment" || rawType === "link" || rawType === "url") {
      type = "file";
    } else {
      type = "text";
    }

    let options: string[] | undefined = undefined;
    if (type === "select") {
      const rawOpts = col.selectionOptions || col.options || [];
      if (Array.isArray(rawOpts)) {
        options = rawOpts.map((o: any) => {
          if (o && typeof o === "object") {
            return String(o.label || o.name || o.value || "");
          }
          return String(o || "");
        }).filter(Boolean);
      }
    }

    return {
      id: cleanId,
      name: colName,
      type,
      options
    };
  });

  // 5. Mapear filas con alineación e indexado robusto
  const normalizedRows: Row[] = rawRows.map((row: any, rIdx: number) => {
    const cleanRow: Row = { id: String(row.id || `row_${Date.now()}_${rIdx}`) };

    normalizedCols.forEach((cleanCol, colIdx) => {
      const originalCol = rawColumns[colIdx] || {};

      const searchKeys = [
        String(originalCol.id),
        "col_" + originalCol.id,
        originalCol.title,
        originalCol.name,
        cleanCol.id,
        cleanCol.name,
        String(originalCol.title || "").toLowerCase(),
        String(originalCol.name || "").toLowerCase(),
        String(cleanCol.name || "").toLowerCase()
      ].filter((k): k is string => typeof k === "string" && k !== "");

      let val: any = undefined;
      if (Array.isArray(row)) {
        val = row[colIdx];
      } else if (row && typeof row === "object") {
        // Búsqueda directa
        for (const key of searchKeys) {
          if (row[key] !== undefined) {
            val = row[key];
            break;
          }
        }
        
        // Búsqueda normalizada inteligente (remueve tildes, espacios, etc.)
        if (val === undefined) {
          const cleanColTitle = cleanKey(originalCol.title || "");
          const cleanColName = cleanKey(originalCol.name || "");
          const cleanColId = cleanKey(cleanCol.id || "");

          for (const rowKey of Object.keys(row)) {
            const cleanRowKey = cleanKey(rowKey);
            if (
              (cleanColTitle && cleanRowKey === cleanColTitle) ||
              (cleanColName && cleanRowKey === cleanColName) ||
              (cleanColId && cleanRowKey === cleanColId)
            ) {
              val = row[rowKey];
              break;
            }
          }
        }
      }

      // Consistencia de tipos de datos
      if (cleanCol.type === "boolean") {
        cleanRow[cleanCol.id] = (val === true || String(val).toLowerCase() === "true" || String(val) === "1");
      } else if (cleanCol.type === "number") {
        if (val === undefined || val === null || val === "") {
          cleanRow[cleanCol.id] = "";
        } else {
          const num = Number(val);
          cleanRow[cleanCol.id] = isNaN(num) ? "" : num;
        }
      } else {
        cleanRow[cleanCol.id] = val !== undefined && val !== null ? String(val) : "";
      }
    });

    return cleanRow;
  });

  return {
    name,
    columns: normalizedCols,
    rows: normalizedRows
  };
}
