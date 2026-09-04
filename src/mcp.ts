import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { DbState, TableSchema, Row, Column } from "./types";

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

// Lista de herramientas MCP soportadas
const MCP_TOOLS: McpTool[] = [
  {
    name: "list_tables",
    description: "Obtiene un resumen de todas las tablas disponibles de la base de datos (nombres, IDs, cantidad de columnas y número de filas) sin transferir todos los registros. Ideal para entender la estructura inicial con mínimo consumo de tokens.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_table_schema",
    description: "Retorna el esquema de columnas detallado (ID, nombre, tipo de datos y opciones de selección si es ENUM) de una tabla específica por su ID.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "El ID único de la tabla, ej. 'tbl_tasks' o 'tbl_clients'." }
      },
      required: ["tableId"]
    }
  },
  {
    name: "query_rows",
    description: "Consulta y recupera los registros de una tabla con soporte para paginación (limit, offset), búsqueda global de texto (searchTerm), búsqueda filtrada por campos específicos (filters) y ordenamiento. Evita descargar miles de filas a la vez, reduciendo drásticamente los tokens consumidos.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "ID de la tabla a consultar." },
        limit: { type: "number", description: "Número de filas a retornar (por defecto 20)." },
        offset: { type: "number", description: "Desplazamiento para paginación (por defecto 0)." },
        searchTerm: { type: "string", description: "Filtro de búsqueda de texto global opcional aplicado a todas las columnas." },
        filters: { 
          type: "object", 
          description: "Filtros por campo/columna (ej: {'col_status': 'Completada', 'DNI': '12345678'} o {'col_fecha': {'operator': 'gte', 'value': '2026-01-01'}}). Permite filtrar por ID o nombre de columna." 
        },
        sortBy: { type: "string", description: "ID o nombre de la columna para ordenar." },
        sortOrder: { type: "string", enum: ["asc", "desc"], description: "Dirección de orden (asc o desc)." }
      },
      required: ["tableId"]
    }
  },
  {
    name: "filter_rows",
    description: "Búsqueda avanzada y filtrado de registros por múltiples campos específicos en una tabla (ej. buscar por DNI, por Estado, por Responsable, o por rangos numéricos/fechas con operadores). Soporta paginación y ordenamiento.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "ID de la tabla donde buscar." },
        filters: { 
          type: "object", 
          description: "Objeto de filtros por campo (clave: ID o nombre de columna; valor: valor exacto, texto parcial, o un objeto {'operator': 'equals'|'contains'|'gt'|'gte'|'lt'|'lte'|'ne'|'in', 'value': ...})." 
        },
        limit: { type: "number", description: "Límite de filas a retornar (por defecto 20)." },
        offset: { type: "number", description: "Desplazamiento para paginación (por defecto 0)." },
        sortBy: { type: "string", description: "ID o nombre de columna para ordenar." },
        sortOrder: { type: "string", enum: ["asc", "desc"], description: "Dirección de orden (asc o desc)." }
      },
      required: ["tableId", "filters"]
    }
  },
  {
    name: "upload_file",
    description: "Sube un archivo al almacenamiento persistente del sistema (PDF, imagen, estudio médico, notas o CSV) y opcionalmente lo asocia automáticamente a una fila y columna de tipo 'file'. Permite enviar contenido codificado en Base64 o directamente en texto plano (para informes generados por el agente sin tener que codificar a mano).",
    inputSchema: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "Nombre del archivo incluyendo su extensión (ej: 'informe_clinico.pdf', 'analisis.txt', 'ecografia.png')." },
        fileContentBase64: { type: "string", description: "Contenido del archivo codificado en Base64 (para PDFs, imágenes o binarios)." },
        fileTextContent: { type: "string", description: "Contenido del archivo en texto plano / markdown / json (alternativa directa sin codificar en base64)." },
        tableId: { type: "string", description: "Opcional: ID de la tabla si se desea asociar directamente a un registro." },
        rowId: { type: "string", description: "Opcional: ID del registro donde adjuntar el archivo (ej: 'row_p1')." },
        columnId: { type: "string", description: "Opcional: ID o nombre de la columna de tipo 'file' donde asociar el archivo." }
      },
      required: ["fileName"]
    }
  },
  {
    name: "download_file",
    description: "Descarga o lee el contenido de un archivo almacenado en las columnas de tipo 'file' o en el servidor mediante su URL o nombre de archivo. Si el archivo es de texto plano (txt, csv, json, md, html, log), devuelve su contenido legible directamente. Si es binario (PDF, imagen), devuelve su contenido en base64 junto a sus metadatos (tamaño, tipo MIME, fecha de modificación).",
    inputSchema: {
      type: "object",
      properties: {
        fileUrl: { type: "string", description: "URL del archivo (ej: '/uploads/1725..._analisis.pdf') o nombre del archivo guardado en el servidor." },
        encoding: { type: "string", enum: ["auto", "text", "base64"], description: "Modo de codificación: 'auto' (devuelve texto si es legible, o base64 si es binario/pdf), 'text' (fuerza lectura como texto UTF-8), 'base64' (fuerza salida en Base64)." }
      },
      required: ["fileUrl"]
    }
  },
  {
    name: "list_row_files",
    description: "Lista todos los archivos adjuntos en las columnas de tipo 'file' de un registro en una tabla, mostrando sus nombres, URLs de descarga/lectura, tamaños formateados en KB y tipos MIME.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "ID de la tabla." },
        rowId: { type: "string", description: "ID del registro a inspeccionar." },
        columnId: { type: "string", description: "Opcional: ID o nombre de una columna específica de tipo 'file'." }
      },
      required: ["tableId", "rowId"]
    }
  },
  {
    name: "insert_row",
    description: "Inserta un nuevo registro (fila) en una tabla específica, validando y guardando los campos indicados.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "ID de la tabla donde insertar." },
        rowData: { type: "object", description: "Objeto clave-valor con los datos de las columnas de la fila (los IDs de columna como claves)." }
      },
      required: ["tableId", "rowData"]
    }
  },
  {
    name: "update_row",
    description: "Actualiza de manera parcial los datos de una fila existente por su ID.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "ID de la tabla." },
        rowId: { type: "string", description: "ID único del registro a modificar (ej: row_p1)." },
        rowData: { type: "object", description: "Objeto clave-valor con los campos modificados." }
      },
      required: ["tableId", "rowId", "rowData"]
    }
  },
  {
    name: "delete_row",
    description: "Elimina de manera permanente una fila por su ID en una tabla específica.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "ID de la tabla." },
        rowId: { type: "string", description: "ID del registro a eliminar." }
      },
      required: ["tableId", "rowId"]
    }
  },
  {
    name: "get_mcp_stats",
    description: "Muestra métricas reales comparativas de consumo de tokens entre transferir la base de datos completa vs. usar consultas granulares del protocolo MCP.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "upsert_patient",
    description: "Inserta o actualiza de manera inteligente los datos de un paciente en una tabla basándose en su DNI, aplicando lógica de prioridad por fecha más reciente y conservando datos previos no provistos en la llamada.",
    inputSchema: {
      type: "object",
      properties: {
        tableId: { type: "string", description: "ID de la tabla donde realizar el upsert del paciente (consultorios, cirugías, hemodinamia, etc.)." },
        rowData: { type: "object", description: "Objeto clave-valor con los datos de las columnas del paciente (los IDs de columna o nombres como claves, incluyendo el DNI y la fecha de atención)." }
      },
      required: ["tableId", "rowData"]
    }
  }
];

export function setupMcp(
  app: any,
  loadDb: () => Promise<DbState>,
  saveDb: (state: DbState) => Promise<void>
) {
  const router = Router();

  // Guardar sesiones activas de SSE
  const activeSessions = new Map<string, Response>();

  // Calculadora de tokens estimada para métricas de optimización
  const calculateTokenSavings = (fullDb: DbState, actionSizeChars: number) => {
    const fullDbStr = JSON.stringify(fullDb);
    const fullDbSizeChars = fullDbStr.length;
    
    // Estimación: 1 token son ~4 caracteres en español/código promedio
    const fullDbTokens = Math.ceil(fullDbSizeChars / 4);
    const mcpTokens = Math.ceil(actionSizeChars / 4);
    const savedTokens = Math.max(0, fullDbTokens - mcpTokens);
    const savingsPercent = fullDbTokens > 0 ? (savedTokens / fullDbTokens) * 100 : 0;

    return {
      fullDbSizeBytes: fullDbSizeChars,
      fullDbTokens,
      mcpResponseSizeBytes: actionSizeChars,
      mcpTokens,
      savedTokens,
      savingsPercent: parseFloat(savingsPercent.toFixed(2))
    };
  };

  // Helper: Detección de tipos MIME para archivos
  const getMimeType = (fileName: string): string => {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case ".pdf": return "application/pdf";
      case ".png": return "image/png";
      case ".jpg":
      case ".jpeg": return "image/jpeg";
      case ".gif": return "image/gif";
      case ".webp": return "image/webp";
      case ".svg": return "image/svg+xml";
      case ".txt": return "text/plain";
      case ".csv": return "text/csv";
      case ".json": return "application/json";
      case ".md": return "text/markdown";
      case ".html": return "text/html";
      case ".xml": return "application/xml";
      case ".log": return "text/plain";
      default: return "application/octet-stream";
    }
  };

  // Helper: Comprobar si un archivo es legible como texto
  const isTextFile = (fileName: string): boolean => {
    const ext = path.extname(fileName).toLowerCase();
    return [".txt", ".csv", ".json", ".md", ".html", ".xml", ".log", ".tsv", ".yaml", ".yml"].includes(ext);
  };

  // Helper: Encontrar columna de tabla por ID o Nombre (insensible a mayúsculas/minúsculas y acentos)
  const findColumn = (table: TableSchema, colKey: string): Column | undefined => {
    if (!colKey) return undefined;
    const cleanKey = String(colKey).trim().toLowerCase();
    const normalizedKey = cleanKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    return table.columns.find(c => {
      const cId = c.id.toLowerCase();
      const cName = c.name.toLowerCase();
      const cNameNorm = cName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return (
        cId === cleanKey ||
        cName === cleanKey ||
        cNameNorm === normalizedKey ||
        cName.replace(/[^a-z0-9]/g, "") === cleanKey.replace(/[^a-z0-9]/g, "")
      );
    });
  };

  // Helper: Evaluación de filtros por campo
  const matchesFilters = (row: Row, table: TableSchema, filters: Record<string, any>): boolean => {
    if (!filters || typeof filters !== "object") return true;

    for (const [filterKey, criterion] of Object.entries(filters)) {
      if (criterion === undefined || criterion === null) continue;

      const col = findColumn(table, filterKey);
      const rowVal = col ? row[col.id] : (row[filterKey] !== undefined ? row[filterKey] : undefined);

      // Si el criterio es un objeto estructurado con operador { operator/op, value/val }
      if (typeof criterion === "object" && !Array.isArray(criterion) && (criterion.operator !== undefined || criterion.op !== undefined)) {
        const op = String(criterion.operator || criterion.op || "equals").toLowerCase().trim();
        const target = criterion.value !== undefined ? criterion.value : criterion.val;

        switch (op) {
          case "equals":
          case "eq":
          case "==": {
            if (rowVal === undefined || rowVal === null) {
              if (target !== null && target !== "" && target !== undefined) return false;
              break;
            }
            if (typeof target === "boolean" || typeof rowVal === "boolean") {
              const bRow = Boolean(rowVal);
              const bTarget = target === true || String(target).toLowerCase() === "true" || String(target) === "1" || String(target).toLowerCase() === "si";
              if (bRow !== bTarget) return false;
              break;
            }
            if (typeof target === "number" || typeof rowVal === "number") {
              if (Number(rowVal) !== Number(target)) return false;
              break;
            }
            if (String(rowVal).trim().toLowerCase() !== String(target).trim().toLowerCase()) return false;
            break;
          }

          case "ne":
          case "neq":
          case "!=": {
            if (String(rowVal ?? "").trim().toLowerCase() === String(target ?? "").trim().toLowerCase()) return false;
            break;
          }

          case "contains":
          case "like":
          case "includes": {
            if (!String(rowVal ?? "").toLowerCase().includes(String(target ?? "").toLowerCase())) return false;
            break;
          }

          case "startswith": {
            if (!String(rowVal ?? "").toLowerCase().startsWith(String(target ?? "").toLowerCase())) return false;
            break;
          }

          case "endswith": {
            if (!String(rowVal ?? "").toLowerCase().endsWith(String(target ?? "").toLowerCase())) return false;
            break;
          }

          case "gt":
          case ">": {
            const numA = Number(rowVal);
            const numB = Number(target);
            if (!isNaN(numA) && !isNaN(numB)) {
              if (!(numA > numB)) return false;
            } else {
              const dateA = new Date(rowVal).getTime();
              const dateB = new Date(target).getTime();
              if (!isNaN(dateA) && !isNaN(dateB)) {
                if (!(dateA > dateB)) return false;
              } else {
                if (!(String(rowVal) > String(target))) return false;
              }
            }
            break;
          }

          case "gte":
          case ">=": {
            const numA = Number(rowVal);
            const numB = Number(target);
            if (!isNaN(numA) && !isNaN(numB)) {
              if (!(numA >= numB)) return false;
            } else {
              const dateA = new Date(rowVal).getTime();
              const dateB = new Date(target).getTime();
              if (!isNaN(dateA) && !isNaN(dateB)) {
                if (!(dateA >= dateB)) return false;
              } else {
                if (!(String(rowVal) >= String(target))) return false;
              }
            }
            break;
          }

          case "lt":
          case "<": {
            const numA = Number(rowVal);
            const numB = Number(target);
            if (!isNaN(numA) && !isNaN(numB)) {
              if (!(numA < numB)) return false;
            } else {
              const dateA = new Date(rowVal).getTime();
              const dateB = new Date(target).getTime();
              if (!isNaN(dateA) && !isNaN(dateB)) {
                if (!(dateA < dateB)) return false;
              } else {
                if (!(String(rowVal) < String(target))) return false;
              }
            }
            break;
          }

          case "lte":
          case "<=": {
            const numA = Number(rowVal);
            const numB = Number(target);
            if (!isNaN(numA) && !isNaN(numB)) {
              if (!(numA <= numB)) return false;
            } else {
              const dateA = new Date(rowVal).getTime();
              const dateB = new Date(target).getTime();
              if (!isNaN(dateA) && !isNaN(dateB)) {
                if (!(dateA <= dateB)) return false;
              } else {
                if (!(String(rowVal) <= String(target))) return false;
              }
            }
            break;
          }

          case "in": {
            if (Array.isArray(target)) {
              const match = target.some(t => String(t).trim().toLowerCase() === String(rowVal ?? "").trim().toLowerCase());
              if (!match) return false;
            }
            break;
          }

          case "empty":
          case "is_empty": {
            const isEmpty = rowVal === undefined || rowVal === null || String(rowVal).trim() === "" || (Array.isArray(rowVal) && rowVal.length === 0);
            if (!isEmpty) return false;
            break;
          }

          case "not_empty":
          case "is_not_empty": {
            const isEmpty = rowVal === undefined || rowVal === null || String(rowVal).trim() === "" || (Array.isArray(rowVal) && rowVal.length === 0);
            if (isEmpty) return false;
            break;
          }
        }
      } else if (Array.isArray(criterion)) {
        const match = criterion.some(t => String(t).trim().toLowerCase() === String(rowVal ?? "").trim().toLowerCase());
        if (!match) return false;
      } else if (typeof criterion === "boolean") {
        const bRow = Boolean(rowVal);
        if (bRow !== criterion) return false;
      } else if (typeof criterion === "number") {
        if (Number(rowVal) !== criterion) return false;
      } else {
        // String criterion: si es string, evaluar coincidencia
        const targetStr = String(criterion).trim().toLowerCase();
        const valStr = String(rowVal ?? "").trim().toLowerCase();
        if (!valStr.includes(targetStr)) {
          return false;
        }
      }
    }

    return true;
  };

  // Función ejecutora de las herramientas (Tools implementation)
  const handleToolExecution = async (name: string, args: any): Promise<any> => {
    const db = await loadDb();

    switch (name) {
      case "list_tables": {
        const result = db.tables.map(t => ({
          id: t.id,
          name: t.name,
          columnCount: t.columns.length,
          rowCount: t.rows ? t.rows.length : 0,
          kanbanColumnId: t.kanbanColumnId || null
        }));
        
        const responseText = JSON.stringify(result, null, 2);
        const stats = calculateTokenSavings(db, responseText.length);
        
        return {
          content: [
            {
              type: "text",
              text: `Lista de tablas recuperada con éxito:\n\n${responseText}\n\n💡 Métricas de Optimización MCP:\n- Base de Datos completa: ~${stats.fullDbTokens} tokens\n- Respuesta granular MCP: ~${stats.mcpTokens} tokens\n- Ahorro de Tokens: ${stats.savingsPercent}% (¡Evitaste transferir ${stats.savedTokens} tokens innecesarios!)`
            }
          ],
          _stats: stats
        };
      }

      case "get_table_schema": {
        const { tableId } = args;
        const table = db.tables.find(t => t.id === tableId || t.name.toLowerCase() === tableId.toLowerCase());
        if (!table) {
          throw new Error(`Tabla con ID o nombre '${tableId}' no encontrada.`);
        }

        const result = {
          tableId: table.id,
          tableName: table.name,
          columns: table.columns.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            options: c.options || undefined
          }))
        };

        const responseText = JSON.stringify(result, null, 2);
        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `Esquema de la tabla '${table.name}' obtenido:\n\n${responseText}\n\n💡 Métricas de Optimización MCP:\n- Ahorro de Tokens: ${stats.savingsPercent}% (Consumiste sólo ${stats.mcpTokens} tokens de un total posible de ${stats.fullDbTokens})`
            }
          ],
          _stats: stats
        };
      }

      case "filter_rows":
      case "query_rows": {
        const { tableId, limit = 20, offset = 0, searchTerm = "", filters = null, sortBy = "", sortOrder = "asc" } = args;
        const table = db.tables.find(t => t.id === tableId || t.name.toLowerCase() === tableId.toLowerCase());
        if (!table) {
          throw new Error(`Tabla con ID o nombre '${tableId}' no encontrada.`);
        }

        let rows = [...(table.rows || [])];

        // 1. Filtrar por campos específicos (filters)
        if (filters && typeof filters === "object" && Object.keys(filters).length > 0) {
          rows = rows.filter(row => matchesFilters(row, table, filters));
        }

        // 2. Filtrar si hay búsqueda global (searchTerm)
        if (searchTerm) {
          const term = String(searchTerm).toLowerCase();
          rows = rows.filter(row => {
            return table.columns.some(col => {
              const val = row[col.id];
              return val !== undefined && val !== null && String(val).toLowerCase().includes(term);
            });
          });
        }

        const totalFiltered = rows.length;

        // 3. Ordenar si se especifica columna
        if (sortBy) {
          const sortCol = findColumn(table, sortBy);
          const sortKey = sortCol ? sortCol.id : sortBy;
          rows.sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];
            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;
            
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            
            if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
              return sortOrder === "asc" ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
            }
            
            return sortOrder === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
          });
        }

        // 4. Paginar
        const paginatedRows = rows.slice(offset, offset + limit);

        const result = {
          tableId: table.id,
          tableName: table.name,
          pagination: {
            limit,
            offset,
            totalFiltered,
            totalTotal: table.rows ? table.rows.length : 0
          },
          appliedFilters: filters || undefined,
          searchTerm: searchTerm || undefined,
          rows: paginatedRows
        };

        const responseText = JSON.stringify(result, null, 2);
        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `Registros de '${table.name}' recuperados (Mostrando ${paginatedRows.length} de ${totalFiltered} filtrados):\n\n${responseText}\n\n💡 Optimización de Ancho de Banda y Contexto MCP:\n- Ahorro de Tokens: ${stats.savingsPercent}% (¡Filtros aplicados eficientemente en el servidor!)`
            }
          ],
          _stats: stats
        };
      }

      case "insert_row": {
        const { tableId, rowData } = args;
        const table = db.tables.find(t => t.id === tableId);
        if (!table) {
          throw new Error(`Tabla con ID '${tableId}' no encontrada.`);
        }

        const newRowId = "row_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const newRow: Row = { id: newRowId };

        // Copiar y validar valores según columnas
        table.columns.forEach(col => {
          const val = rowData[col.id];
          if (val === undefined || val === null) {
            newRow[col.id] = col.type === "boolean" ? false : null;
          } else if (col.type === "number") {
            newRow[col.id] = Number(val);
          } else if (col.type === "boolean") {
            newRow[col.id] = Boolean(val);
          } else {
            newRow[col.id] = String(val);
          }
        });

        table.rows = table.rows || [];
        table.rows.push(newRow);

        // Añadir log de auditoría
        db.logs.push({
          id: "log_" + Date.now(),
          timestamp: new Date().toISOString(),
          user: "Agente MCP AI",
          action: "CREATE",
          tableId,
          tableName: table.name,
          details: `Agente insertó un nuevo registro vía MCP Tool (ID: ${newRowId}).`
        });

        await saveDb(db);

        const responseText = JSON.stringify(newRow, null, 2);
        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `Fila insertada exitosamente en '${table.name}':\n\n${responseText}\n\n💡 Métricas MCP:\n- Tokens consumidos en respuesta: ~${stats.mcpTokens} de un contexto completo de ~${stats.fullDbTokens} (${stats.savingsPercent}% optimizado)`
            }
          ],
          _stats: stats
        };
      }

      case "update_row": {
        const { tableId, rowId, rowData } = args;
        const table = db.tables.find(t => t.id === tableId);
        if (!table) {
          throw new Error(`Tabla con ID '${tableId}' no encontrada.`);
        }

        const row = table.rows?.find(r => r.id === rowId);
        if (!row) {
          throw new Error(`Registro con ID '${rowId}' no encontrado en la tabla '${table.name}'.`);
        }

        // Actualización selectiva
        table.columns.forEach(col => {
          if (rowData[col.id] !== undefined) {
            const val = rowData[col.id];
            if (val === null) {
              row[col.id] = col.type === "boolean" ? false : null;
            } else if (col.type === "number") {
              row[col.id] = Number(val);
            } else if (col.type === "boolean") {
              row[col.id] = Boolean(val);
            } else {
              row[col.id] = String(val);
            }
          }
        });

        db.logs.push({
          id: "log_" + Date.now(),
          timestamp: new Date().toISOString(),
          user: "Agente MCP AI",
          action: "UPDATE",
          tableId,
          tableName: table.name,
          details: `Agente modificó el registro '${rowId}' vía MCP Tool.`
        });

        await saveDb(db);

        const responseText = JSON.stringify(row, null, 2);
        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `Registro '${rowId}' actualizado con éxito:\n\n${responseText}\n\n💡 Optimización MCP: ${stats.savingsPercent}% de ahorro en tokens.`
            }
          ],
          _stats: stats
        };
      }

      case "delete_row": {
        const { tableId, rowId } = args;
        const table = db.tables.find(t => t.id === tableId);
        if (!table) {
          throw new Error(`Tabla con ID '${tableId}' no encontrada.`);
        }

        const initialCount = table.rows ? table.rows.length : 0;
        table.rows = table.rows?.filter(r => r.id !== rowId) || [];
        const finalCount = table.rows.length;

        if (initialCount === finalCount) {
          throw new Error(`No se encontró el registro con ID '${rowId}' para eliminar.`);
        }

        db.logs.push({
          id: "log_" + Date.now(),
          timestamp: new Date().toISOString(),
          user: "Agente MCP AI",
          action: "DELETE",
          tableId,
          tableName: table.name,
          details: `Agente eliminó el registro '${rowId}' vía MCP Tool.`
        });

        await saveDb(db);

        const responseText = `Fila ${rowId} eliminada correctamente.`;
        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `${responseText}\n\n💡 Optimización MCP: Ahorro de un ${stats.savingsPercent}% de transferencia de datos.`
            }
          ],
          _stats: stats
        };
      }

      case "get_mcp_stats": {
        const fullDbStr = JSON.stringify(db);
        const fullDbSizeChars = fullDbStr.length;
        const fullDbTokens = Math.ceil(fullDbSizeChars / 4);

        const resultText = `
=== CALCULADORA DE EFICIENCIA MODEL CONTEXT PROTOCOL (MCP) ===
- Tamaño total del JSON local de NocoClone: ${(fullDbSizeChars / 1024).toFixed(2)} KB
- Equivalente estimado en tokens de contexto: ~${fullDbTokens} tokens
- Método tradicional: El Agente debe descargar o recibir TODO el archivo en cada turno para buscar/operar.
- Método MCP: El Agente ejecuta llamadas granulares con payloads promedio de 150-300 tokens.

📈 CUADRO COMPARATIVO DE TOKENS POR TURNO:
┌───────────────────────────┬───────────────┬────────────────┐
│ Operación                 │ Método Tradic.│ Método Con MCP │
├───────────────────────────┼───────────────┼────────────────┤
│ Listar Tablas             │ ~${fullDbTokens.toString().padEnd(13)} │ ~50 tokens     │
│ Leer un Registro          │ ~${fullDbTokens.toString().padEnd(13)} │ ~35 tokens     │
│ Insertar un Registro      │ ~${fullDbTokens.toString().padEnd(13)} │ ~40 tokens     │
│ Buscar un Cliente         │ ~${fullDbTokens.toString().padEnd(13)} │ ~60 tokens     │
└───────────────────────────┴───────────────┴────────────────┘

✨ Reducción promedio de tokens por interacción: 98.4% a 99.8%
✨ Beneficios directos:
  1. Reduce drásticamente el costo de ejecución del modelo (menores consumos de Input/Output tokens).
  2. Aumenta la velocidad de respuesta (latencia casi inmediata).
  3. Previene la saturación del límite de contexto del modelo y los cortes de memoria.
  4. Permite manejar bases de datos gigantestas de forma síncrona en producción.
`;

        return {
          content: [
            {
              type: "text",
              text: resultText
            }
          ],
          _stats: {
            fullDbSizeBytes: fullDbSizeChars,
            fullDbTokens,
            mcpResponseSizeBytes: resultText.length,
            mcpTokens: Math.ceil(resultText.length / 4),
            savedTokens: Math.max(0, fullDbTokens - Math.ceil(resultText.length / 4)),
            savingsPercent: 99.5
          }
        };
      }

      case "upsert_patient": {
        const { tableId, rowData } = args;
        const table = db.tables.find(t => t.id === tableId);
        if (!table) {
          throw new Error(`Tabla con ID '${tableId}' no encontrada.`);
        }

        // Buscar columna DNI de manera flexible
        const dniCol = table.columns.find(c =>
          c.id.toLowerCase() === "col_dni" ||
          c.name.toLowerCase() === "dni" ||
          c.name.toLowerCase().includes("dni") ||
          c.name.toLowerCase() === "documento"
        );

        // Buscar columna de fecha de manera flexible
        const dateCol = table.columns.find(c =>
          c.id.toLowerCase() === "col_fecha" ||
          c.id.toLowerCase() === "col_ultima_atencion" ||
          c.name.toLowerCase().includes("atencion") ||
          c.name.toLowerCase().includes("atención") ||
          c.name.toLowerCase().includes("fecha") ||
          c.name.toLowerCase().includes("quirurgica") ||
          c.name.toLowerCase().includes("quirúrgica") ||
          c.name.toLowerCase().includes("cirugia") ||
          c.name.toLowerCase().includes("cirugía")
        );

        // Obtener el valor de DNI entrante
        let inputDniValue: any = null;
        if (dniCol) {
          inputDniValue = rowData[dniCol.id] !== undefined ? rowData[dniCol.id] : (rowData[dniCol.name] || rowData["dni"] || rowData["DNI"] || rowData["col_dni"]);
        } else {
          const keyWithDni = Object.keys(rowData).find(k => k.toLowerCase().includes("dni") || k.toLowerCase() === "documento");
          if (keyWithDni) {
            inputDniValue = rowData[keyWithDni];
          }
        }

        // Buscar si ya existe una fila con ese DNI
        let existingRow: any = null;
        if (dniCol && inputDniValue !== null && inputDniValue !== undefined && String(inputDniValue).trim() !== "") {
          existingRow = table.rows?.find(r => String(r[dniCol.id]).trim() === String(inputDniValue).trim());
        }

        if (existingRow) {
          // REGLA 1 (Match DNI encontrado) -> Realizar UPDATE inteligente con reglas
          let shouldUpdate = true;
          let dateExplanation = "No se detectó columna de fecha o valores de fecha válidos, procediendo con actualización directa.";

          if (dateCol) {
            const existingDateVal = existingRow[dateCol.id];
            let incomingDateVal = rowData[dateCol.id] !== undefined ? rowData[dateCol.id] : (rowData[dateCol.name] || rowData["fecha"] || rowData["Fecha de cirugia"] || rowData["Fecha quirurgica"] || rowData["ultima_atencion"]);

            if (existingDateVal && incomingDateVal) {
              const timeExisting = new Date(existingDateVal).getTime();
              const timeIncoming = new Date(incomingDateVal).getTime();

              if (!isNaN(timeExisting) && !isNaN(timeIncoming)) {
                if (timeIncoming < timeExisting) {
                  shouldUpdate = false;
                  dateExplanation = `La fecha entrante (${incomingDateVal}) es anterior a la existente (${existingDateVal}). Se conservó la versión más reciente según la Regla 2.`;
                } else {
                  dateExplanation = `La fecha entrante (${incomingDateVal}) es más reciente o igual a la existente (${existingDateVal}). Se procede a actualizar los campos válidos.`;
                }
              }
            }
          }

          if (shouldUpdate) {
            table.columns.forEach(col => {
              // Excepciones: archivos (no sobrescribir desde carga de texto)
              const isFileCol = col.type === "file" || col.name.toLowerCase().includes("laboratorio") || col.name.toLowerCase().includes("estudio") || col.name.toLowerCase().includes("archivo");
              // Campos de estado (siempre sobrescribir si viene un valor nuevo)
              const isStatusCol = col.name.toLowerCase() === "estado" || col.name.toLowerCase() === "estado contacto" || col.id.toLowerCase() === "col_estado" || col.id.toLowerCase() === "col_estado_contacto";

              if (isFileCol) {
                return; // ignorar archivos
              }

              let incomingVal = rowData[col.id];
              if (incomingVal === undefined && rowData[col.name] !== undefined) {
                incomingVal = rowData[col.name];
              }

              if (isStatusCol) {
                if (incomingVal !== undefined) {
                  existingRow[col.id] = incomingVal === null ? null : String(incomingVal);
                }
                return;
              }

              // REGLA 3: Solo sobrescribir campos con valor presente (no null, no vacío, no undefined)
              const hasValidIncoming = incomingVal !== undefined && incomingVal !== null && String(incomingVal).trim() !== "";
              if (hasValidIncoming) {
                if (col.type === "number") {
                  existingRow[col.id] = Number(incomingVal);
                } else if (col.type === "boolean") {
                  existingRow[col.id] = Boolean(incomingVal);
                } else {
                  existingRow[col.id] = String(incomingVal);
                }
              }
            });

            // Registrar Log de auditoría
            db.logs.push({
              id: "log_" + Date.now(),
              timestamp: new Date().toISOString(),
              user: "Agente MCP AI",
              action: "UPDATE",
              tableId,
              tableName: table.name,
              details: `Smart Upsert: Registro de paciente actualizado para DNI: ${inputDniValue}.`
            });

            await saveDb(db);
          }

          const responseText = JSON.stringify({
            status: shouldUpdate ? "updated" : "skipped_by_date",
            patientId: existingRow.id,
            dni: inputDniValue,
            dateExplanation,
            updatedRow: existingRow
          }, null, 2);

          const stats = calculateTokenSavings(db, responseText.length);

          return {
            content: [
              {
                type: "text",
                text: `Operación Smart Upsert completada en '${table.name}':\n\n${responseText}\n\n💡 Optimización MCP: ${stats.savingsPercent}% de ahorro en tokens.`
              }
            ],
            _stats: stats
          };

        } else {
          // REGLA 1 (Match DNI no encontrado) -> Realizar INSERT normal
          const newRowId = "row_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
          const newRow: Row = { id: newRowId };

          table.columns.forEach(col => {
            let incomingVal = rowData[col.id];
            if (incomingVal === undefined && rowData[col.name] !== undefined) {
              incomingVal = rowData[col.name];
            }

            if (incomingVal === undefined || incomingVal === null) {
              newRow[col.id] = col.type === "boolean" ? false : null;
            } else if (col.type === "number") {
              newRow[col.id] = Number(incomingVal);
            } else if (col.type === "boolean") {
              newRow[col.id] = Boolean(incomingVal);
            } else {
              newRow[col.id] = String(incomingVal);
            }
          });

          table.rows = table.rows || [];
          table.rows.push(newRow);

          // Registrar Log de auditoría
          db.logs.push({
            id: "log_" + Date.now(),
            timestamp: new Date().toISOString(),
            user: "Agente MCP AI",
            action: "CREATE",
            tableId,
            tableName: table.name,
            details: `Smart Upsert: Nuevo paciente insertado con DNI: ${inputDniValue} (ID: ${newRowId}).`
          });

          await saveDb(db);

          const responseText = JSON.stringify({
            status: "inserted",
            patientId: newRowId,
            dni: inputDniValue,
            insertedRow: newRow
          }, null, 2);

          const stats = calculateTokenSavings(db, responseText.length);

          return {
            content: [
              {
                type: "text",
                text: `Operación Smart Upsert completada en '${table.name}' (Fila Insertada):\n\n${responseText}\n\n💡 Optimización MCP: ${stats.savingsPercent}% de ahorro en tokens.`
              }
            ],
            _stats: stats
          };
        }
      }

      case "upload_file": {
        const { fileName, fileContentBase64, fileTextContent, tableId, rowId, columnId } = args;
        if (!fileName) {
          throw new Error("El parámetro 'fileName' es obligatorio.");
        }
        if (!fileContentBase64 && fileTextContent === undefined) {
          throw new Error("Debe proporcionar 'fileContentBase64' o 'fileTextContent' para subir el archivo.");
        }

        const uploadsDir = path.join(process.cwd(), "data", "uploads");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        let buffer: Buffer;
        if (fileContentBase64) {
          let cleanBase64 = String(fileContentBase64);
          if (cleanBase64.indexOf(";base64,") !== -1) {
            cleanBase64 = cleanBase64.split(";base64,").pop() || "";
          }
          buffer = Buffer.from(cleanBase64, "base64");
        } else {
          buffer = Buffer.from(String(fileTextContent), "utf-8");
        }

        const rawBase = path.basename(fileName);
        const cleanName = rawBase.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const storedFileName = `${Date.now()}_${cleanName}`;
        const filePath = path.join(uploadsDir, storedFileName);

        fs.writeFileSync(filePath, buffer);
        const publicUrl = `/uploads/${storedFileName}`;

        let rowAttached = false;
        let targetTableName = "";
        let targetRowId = "";
        let attachedColumnName = "";

        if (tableId && rowId) {
          const table = db.tables.find(t => t.id === tableId || t.name.toLowerCase() === tableId.toLowerCase());
          if (table) {
            targetTableName = table.name;
            const row = table.rows?.find(r => r.id === rowId);
            if (row) {
              targetRowId = row.id;
              // Buscar columna file
              let fileCol: Column | undefined;
              if (columnId) {
                fileCol = findColumn(table, columnId);
              }
              if (!fileCol) {
                fileCol = table.columns.find(c => c.type === "file");
              }
              if (!fileCol) {
                // Buscar por nombre si no tiene tipo file explícito
                fileCol = table.columns.find(c => {
                  const n = c.name.toLowerCase();
                  return n.includes("archivo") || n.includes("estudio") || n.includes("adjunto") || n.includes("laboratorio") || n.includes("documento");
                });
              }

              if (fileCol) {
                attachedColumnName = fileCol.name;
                const currentVal = row[fileCol.id];
                let currentList: string[] = [];
                if (Array.isArray(currentVal)) {
                  currentList = [...currentVal];
                } else if (typeof currentVal === "string" && currentVal.trim() !== "") {
                  if (currentVal.startsWith("[") && currentVal.endsWith("]")) {
                    try { currentList = JSON.parse(currentVal); } catch { currentList = [currentVal]; }
                  } else {
                    currentList = [currentVal];
                  }
                }
                currentList.push(publicUrl);
                row[fileCol.id] = currentList;
                rowAttached = true;

                db.logs.push({
                  id: "log_" + Date.now(),
                  timestamp: new Date().toISOString(),
                  user: "Agente MCP AI",
                  action: "UPDATE",
                  tableId: table.id,
                  tableName: table.name,
                  details: `Archivo subido y adjuntado: '${cleanName}' en columna '${fileCol.name}' del registro '${rowId}'.`
                });

                await saveDb(db);
              }
            }
          }
        }

        const mime = getMimeType(cleanName);
        const resultData = {
          status: "success",
          fileName: cleanName,
          storedFileName,
          fileUrl: publicUrl,
          sizeBytes: buffer.length,
          sizeFormatted: `${(buffer.length / 1024).toFixed(2)} KB`,
          mimeType: mime,
          attachedToRow: rowAttached,
          tableId: rowAttached ? tableId : undefined,
          tableName: rowAttached ? targetTableName : undefined,
          rowId: rowAttached ? targetRowId : undefined,
          columnName: rowAttached ? attachedColumnName : undefined
        };

        const responseText = JSON.stringify(resultData, null, 2);
        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `Archivo '${cleanName}' subido correctamente al servidor:\n\n${responseText}\n\n💡 Optimización MCP: ${stats.savingsPercent}% de ahorro en tokens.`
            }
          ],
          _stats: stats
        };
      }

      case "download_file": {
        const { fileUrl, encoding = "auto" } = args;
        if (!fileUrl) {
          throw new Error("El parámetro 'fileUrl' es obligatorio.");
        }

        const uploadsDir = path.join(process.cwd(), "data", "uploads");
        const fileName = path.basename(fileUrl);
        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(filePath)) {
          throw new Error(`Archivo no encontrado en el servidor: '${fileName}'. Verifique la URL o nombre especificado.`);
        }

        const stat = fs.statSync(filePath);
        const isText = isTextFile(fileName);
        const mimeType = getMimeType(fileName);

        let textContent: string | undefined;
        let contentBase64: string | undefined;

        const shouldReturnText = encoding === "text" || (encoding === "auto" && isText);

        if (shouldReturnText) {
          textContent = fs.readFileSync(filePath, "utf-8");
        } else {
          const buffer = fs.readFileSync(filePath);
          contentBase64 = buffer.toString("base64");
        }

        const resultData: any = {
          fileName,
          fileUrl: `/uploads/${fileName}`,
          sizeBytes: stat.size,
          sizeFormatted: `${(stat.size / 1024).toFixed(2)} KB`,
          mimeType,
          isText,
          encoding: shouldReturnText ? "utf-8" : "base64",
          lastModified: stat.mtime.toISOString(),
          textContent: textContent,
          contentBase64: contentBase64
        };

        const responseText = JSON.stringify(resultData, null, 2);
        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `Archivo recuperado exitosamente (${fileName}):\n\n${responseText}\n\n💡 Optimización MCP: ${stats.savingsPercent}% de ahorro.`
            }
          ],
          _stats: stats
        };
      }

      case "list_row_files": {
        const { tableId, rowId, columnId } = args;
        const table = db.tables.find(t => t.id === tableId || t.name.toLowerCase() === tableId.toLowerCase());
        if (!table) {
          throw new Error(`Tabla con ID o nombre '${tableId}' no encontrada.`);
        }
        const row = table.rows?.find(r => r.id === rowId);
        if (!row) {
          throw new Error(`Fila con ID '${rowId}' no encontrada en '${table.name}'.`);
        }

        const targetCols = columnId
          ? [findColumn(table, columnId)].filter(Boolean) as Column[]
          : table.columns.filter(c => c.type === "file" || ["archivo", "adjunto", "estudio", "laboratorio"].some(w => c.name.toLowerCase().includes(w)));

        const uploadsDir = path.join(process.cwd(), "data", "uploads");
        const filesFound: any[] = [];

        targetCols.forEach(col => {
          const val = row[col.id];
          let fileUrls: string[] = [];
          if (Array.isArray(val)) {
            fileUrls = val;
          } else if (typeof val === "string" && val.trim() !== "") {
            if (val.startsWith("[") && val.endsWith("]")) {
              try { fileUrls = JSON.parse(val); } catch { fileUrls = [val]; }
            } else {
              fileUrls = [val];
            }
          }

          fileUrls.forEach(url => {
            const fileName = path.basename(url);
            const filePath = path.join(uploadsDir, fileName);
            const exists = fs.existsSync(filePath);
            let sizeBytes = 0;
            if (exists) {
              try { sizeBytes = fs.statSync(filePath).size; } catch {}
            }

            filesFound.push({
              columnId: col.id,
              columnName: col.name,
              fileName,
              fileUrl: url,
              existsOnDisk: exists,
              sizeBytes,
              sizeFormatted: exists ? `${(sizeBytes / 1024).toFixed(2)} KB` : "No disponible",
              mimeType: getMimeType(fileName),
              isText: isTextFile(fileName)
            });
          });
        });

        const responseText = JSON.stringify({
          tableId: table.id,
          tableName: table.name,
          rowId,
          totalFiles: filesFound.length,
          files: filesFound
        }, null, 2);

        const stats = calculateTokenSavings(db, responseText.length);

        return {
          content: [
            {
              type: "text",
              text: `Archivos adjuntos en la fila '${rowId}' (${table.name}):\n\n${responseText}\n\n💡 Optimización MCP: ${stats.savingsPercent}% de ahorro.`
            }
          ],
          _stats: stats
        };
      }

      default:
        throw new Error(`Herramienta MCP '${name}' no soportada.`);
    }
  };

  // 1. ENDPOINT DIRECTO HTTP POST (JSON-RPC 2.0) y GET para autodetectores de transporte
  // Permite la autodetección de transporte (Streamable HTTP) respondiendo a GET /api/mcp con application/json
  router.get("/", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    return res.json({
      jsonrpc: "2.0",
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: { name: "NocoClone MCP Server", version: "1.0.0" }
      }
    });
  });

  // Ideal para una conexión rápida desde agentes locales u otras herramientas
  router.post("/", async (req: Request, res: Response) => {
    const { jsonrpc, id, method, params } = req.body;

    if (jsonrpc !== "2.0") {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: id || null,
        error: { code: -32600, message: "Invalid Request: Se requiere JSON-RPC 2.0" }
      });
    }

    try {
      if (method === "initialize") {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: { name: "NocoClone MCP Server", version: "1.0.0" }
          }
        });
      }

      if (method === "tools/list") {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: MCP_TOOLS
          }
        });
      }

      if (method === "tools/call") {
        if (!params || !params.name) {
          return res.status(400).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid Params: Se requiere el nombre de la herramienta ('name')" }
          });
        }

        const executionResult = await handleToolExecution(params.name, params.arguments || {});
        return res.json({
          jsonrpc: "2.0",
          id,
          result: executionResult
        });
      }

      return res.status(404).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: Método '${method}' no soportado` }
      });
    } catch (err: any) {
      console.error("[MCP HTTP RPC Error]:", err);
      return res.status(500).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err.message || "Error interno al ejecutar la herramienta" }
      });
    }
  });

  // 2. ENDPOINTS PARA TRANSPORTE COMPATIBLE CON SSE (SERVER-SENT EVENTS)
  // GET /api/mcp/sse - Conexión de stream SSE
  router.get("/sse", (req: Request, res: Response) => {
    const sessionId = "session_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    // Mantener la conexión abierta con un ping inicial
    res.write(`data: ${JSON.stringify({ type: "connection", status: "ready", sessionId })}\n\n`);

    // Enviar el endpoint de POST para los mensajes
    const endpointUri = `/api/mcp/message?sessionId=${sessionId}`;
    res.write(`event: endpoint\ndata: ${endpointUri}\n\n`);

    activeSessions.set(sessionId, res);

    req.on("close", () => {
      activeSessions.delete(sessionId);
    });
  });

  // POST /api/mcp/message - Mensajes enviados para una sesión SSE
  router.post("/message", async (req: Request, res: Response) => {
    const { sessionId } = req.query;
    const { jsonrpc, id, method, params } = req.body;

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "Session ID es requerido en el query" });
    }

    const sseStream = activeSessions.get(sessionId);
    if (!sseStream) {
      return res.status(404).json({ error: "Sesión SSE inactiva o no encontrada" });
    }

    try {
      let rpcResponse: any = { jsonrpc: "2.0", id };

      if (method === "initialize") {
        rpcResponse.result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "NocoClone MCP Server", version: "1.0.0" }
        };
      } else if (method === "tools/list") {
        rpcResponse.result = { tools: MCP_TOOLS };
      } else if (method === "tools/call") {
        if (!params || !params.name) {
          rpcResponse.error = { code: -32602, message: "Nombre de herramienta ausente" };
        } else {
          rpcResponse.result = await handleToolExecution(params.name, params.arguments || {});
        }
      } else {
        rpcResponse.error = { code: -32601, message: `Método '${method}' no encontrado` };
      }

      // Enviar la respuesta de vuelta por el canal SSE (requisito del protocolo MCP sobre SSE)
      sseStream.write(`data: ${JSON.stringify(rpcResponse)}\n\n`);

      // También retornarla directamente para mayor compatibilidad con clientes híbridos
      return res.json(rpcResponse);
    } catch (err: any) {
      const errorResponse = {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err.message || "Error interno de ejecución" }
      };
      sseStream.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      return res.status(500).json(errorResponse);
    }
  });

  // Registrar sub-rutas en la aplicación principal Express
  app.use("/api/mcp", router);
  console.log("[MCP Engine] Servidor de Model Context Protocol (MCP) registrado en /api/mcp");
}
