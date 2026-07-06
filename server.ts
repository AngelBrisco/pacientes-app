import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { DbState, TableSchema, AuditLog, Column, Row } from "./src/types";
import dotenv from "dotenv";
import pg from "pg";
import { setupMcp } from "./src/mcp";

dotenv.config();

const { Pool } = pg;

// Get Postgres config lazily
let pgPool: pg.Pool | null = null;

function getPgPool(): pg.Pool | null {
  if (pgPool !== null) {
    return pgPool;
  }
  
  const connectionString = process.env.DATABASE_URL || "";
  if (connectionString) {
    console.log("[Postgres] Inicializando pool de conexión...");
    pgPool = new Pool({
      connectionString,
      ssl: connectionString.includes("render.com") || connectionString.includes("neon.tech") || connectionString.includes("gcp") || connectionString.includes("cloud")
        ? { rejectUnauthorized: false }
        : false
    });
    return pgPool;
  }
  
  const pgHost = process.env.PGHOST;
  if (pgHost) {
    console.log("[Postgres] Inicializando pool con host:", pgHost);
    pgPool = new Pool({
      host: pgHost,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
    });
    return pgPool;
  }
  
  return null;
}

function isPostgresEnabled(): boolean {
  // Se habilita la sincronización relacional de forma dinámica si se detecta DATABASE_URL o PGHOST.
  // El motor de NocoClone opera sobre JSON local de manera síncrona y replica/reconstruye a PostgreSQL en segundo plano automáticamente.
  return getPgPool() !== null;
}

// Funciones de sanitarización y mapeo a nombres físicos SQL limpios (para n8n, etc.)
function sanitizePhysicalName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina tildes/acentos
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/__+/g, "_")
    .trim()
    .replace(/^_+|_+$/g, "");
}

function getPhysicalTableName(table: { id: string; name: string }): string {
  if (table.id === "tbl_tasks" || table.id === "tbl_clients") {
    return table.id;
  }
  const clean = sanitizePhysicalName(table.name);
  if (!clean || ["select", "user", "table", "from", "where", "group", "by", "order", "limit", "id", "db", "users", "logs", "snapshots"].includes(clean)) {
    return "tbl_" + (clean || table.id);
  }
  return clean;
}

function getPhysicalColumnName(col: { id: string; name: string }): string {
  if (col.id.startsWith("col_title") || col.id.startsWith("col_status") || col.id.startsWith("col_priority") || col.id.startsWith("col_assigned") || col.id.startsWith("col_due_date") || col.id.startsWith("col_hours") || col.id.startsWith("col_done") || col.id.startsWith("col_cli_")) {
    return col.id;
  }
  const clean = sanitizePhysicalName(col.name);
  if (!clean || ["id", "select", "where", "from", "limit"].includes(clean)) {
    return col.id;
  }
  return clean;
}

async function ensureMetadataTable() {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _nococlone_metadata (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB
      )
    `);
  } catch (err) {
    console.error("[Postgres] Error al asegurar tabla de metadatos:", err);
  }
}

async function getMetadataValue(key: string, defaultValue: any): Promise<any> {
  const pool = getPgPool();
  if (!pool) return defaultValue;
  try {
    const res = await pool.query('SELECT value FROM _nococlone_metadata WHERE key = $1', [key]);
    if (res.rows.length > 0) {
      return res.rows[0].value;
    }
  } catch (err) {
    console.error(`[Postgres] Error al leer metadatos de ${key}:`, err);
  }
  return defaultValue;
}

async function setMetadataValue(key: string, value: any) {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO _nococlone_metadata (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)]
    );
  } catch (err) {
    console.error(`[Postgres] Error al guardar metadatos de ${key}:`, err);
  }
}

async function syncPhysicalSchemaWithMetadata(tables: TableSchema[]) {
  const pool = getPgPool();
  if (!pool) return;
  
  try {
    // 1. Eliminar tablas físicas huérfanas en PostgreSQL que ya no existen en los metadatos de nococlone
    const realTablesQuery = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name != '_nococlone_metadata'
    `);
    const physicalTables = realTablesQuery.rows.map(r => r.table_name);
    const definedPhysicalNames = tables.map(t => getPhysicalTableName(t));
    
    for (const physTab of physicalTables) {
      if (!definedPhysicalNames.includes(physTab)) {
        console.log(`[Postgres] Eliminando tabla física huérfana '${physTab}' de Postgres...`);
        await pool.query(`DROP TABLE IF EXISTS "${physTab}" CASCADE`);
      }
    }

    // 2. Sincronizar tablas definidas
    for (const table of tables) {
      const physTableName = getPhysicalTableName(table);
      
      // Crear tabla física si no existe
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${physTableName}" (
          id VARCHAR(100) PRIMARY KEY DEFAULT ('row_' || substring(md5(random()::text) from 1 for 16))
        )
      `);
      
      // Consultar columnas físicas actuales de esta tabla PostgreSQL
      const colRes = await pool.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1`,
        [physTableName]
      );
      const existingCols = colRes.rows.map(r => r.column_name);
      
      // 2a. Eliminar columnas que ya no están definidas (omitir no-SQL tipo "file")
      const targetCols = table.columns.filter(c => c.type !== "file");
      const definedCols = targetCols.map(c => getPhysicalColumnName(c));
      
      for (const extCol of existingCols) {
        if (extCol !== "id" && !definedCols.includes(extCol)) {
          console.log(`[Postgres] Eliminando columna física huérfana '${extCol}' de '${physTableName}'...`);
          await pool.query(`ALTER TABLE "${physTableName}" DROP COLUMN IF EXISTS "${extCol}" CASCADE`);
        }
      }

      // 2b. Agregar nuevas columnas físicas
      for (const col of targetCols) {
        const physColName = getPhysicalColumnName(col);
        if (!existingCols.includes(physColName)) {
          let pgType = "TEXT";
          if (col.type === "number") pgType = "NUMERIC";
          else if (col.type === "boolean") pgType = "BOOLEAN DEFAULT FALSE";
          else if (col.type === "date") pgType = "DATE";
          
          await pool.query(`ALTER TABLE "${physTableName}" ADD COLUMN "${physColName}" ${pgType}`);
          console.log(`[Postgres] Agregada columna física '${physColName}' con tipo ${pgType} a '${physTableName}'`);
        }
      }
    }
  } catch (err) {
    console.error("[Postgres] Error al sincronizar esquemas físicos:", err);
  }
}

// Note that Docker container should bind to 0.0.0.0 and port 3000
const PORT = 3000;
const DB_FILE_PATH = path.join(process.cwd(), "data", "db.json");


// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_FILE_PATH), { recursive: true });

function getInitialDbState(): DbState {
  const now = new Date().toISOString();
  return {
    tables: [
      {
        id: "tbl_tasks",
        name: "Tareas de Ingeniería",
        columns: [
          { id: "col_title", name: "Título de Tarea", type: "text" },
          { id: "col_status", name: "Estado", type: "select", options: ["Pendiente", "En Progreso", "Completada"] },
          { id: "col_priority", name: "Prioridad", type: "select", options: ["Baja", "Media", "Alta"] },
          { id: "col_assigned", name: "Responsable", type: "text" },
          { id: "col_due_date", name: "Vencimiento", type: "date" },
          { id: "col_hours", name: "Horas Estimadas", type: "number" },
          { id: "col_done", name: "Entregado", type: "boolean" }
        ],
        rows: [
          {
            id: "row_p1",
            col_title: "Diseñar arquitectura NocoClone",
            col_status: "Completada",
            col_priority: "Alta",
            col_assigned: "Ángel Brisco",
            col_due_date: "2026-05-25",
            col_hours: 10,
            col_done: true
          },
          {
            id: "row_p2",
            col_title: "Configurar Docker y volúmenes persistentes",
            col_status: "En Progreso",
            col_priority: "Alta",
            col_assigned: "Soporte DevOps",
            col_due_date: "2026-05-30",
            col_hours: 6,
            col_done: false
          },
          {
            id: "row_p3",
            col_title: "Pruebas de concurrencia y múltiples usuarios",
            col_status: "Pendiente",
            col_priority: "Media",
            col_assigned: "QA Automador",
            col_due_date: "2026-06-03",
            col_hours: 8,
            col_done: false
          }
        ]
      },
      {
        id: "tbl_clients",
        name: "Cartera de Clientes",
        columns: [
          { id: "col_cli_name", name: "Razón Social / Nombre", type: "text" },
          { id: "col_cli_email", name: "Email Principal", type: "text" },
          { id: "col_cli_company", name: "Corporación", type: "text" },
          { id: "col_cli_status", name: "Suscripción", type: "select", options: ["Premium", "Standard", "Inactivo"] },
          { id: "col_cli_balance", name: "Balance Comercial ($)", type: "number" },
          { id: "col_cli_active", name: "Cuenta Activa", type: "boolean" }
        ],
        rows: [
          {
            id: "row_cli_1",
            col_cli_name: "Industrias Acme S.A.",
            col_cli_email: "contacto@acme.com",
            col_cli_company: "Acme Corp",
            col_cli_status: "Premium",
            col_cli_balance: 14200.50,
            col_cli_active: true
          },
          {
            id: "row_cli_2",
            col_cli_name: "María Eugenia Gómez",
            col_cli_email: "maru.gomez@globex.com",
            col_cli_company: "Globex Industries",
            col_cli_status: "Standard",
            col_cli_balance: 3200.00,
            col_cli_active: true
          },
          {
            id: "row_cli_3",
            col_cli_name: "Carlos Bilardo",
            col_cli_email: "doctor@estudiantes.com",
            col_cli_company: "La Plata FC",
            col_cli_status: "Inactivo",
            col_cli_balance: 0,
            col_cli_active: false
          }
        ]
      }
    ],
    logs: [
      {
        id: "log_init",
        timestamp: now,
        user: "Sistema",
        action: "SCHEMA_CHANGE",
        tableId: "*",
        tableName: "Base de Datos",
        details: "Creación inicial de tablas y esquemas de prueba (estilo relacional SQL/Local DB)."
      }
    ],
    users: [
      {
        id: "usr_admin",
        username: "admin",
        name: "Administrador del Sistema",
        password: "admin123",
        role: "admin",
        permissions: "read-write"
      },
      {
        id: "usr_colaborador",
        username: "colaborador",
        name: "Colaborador de Prueba",
        password: "colaborador123",
        role: "user",
        permissions: "read-write"
      },
      {
        id: "usr_qa",
        username: "qa",
        name: "QA Auditor",
        password: "qa123",
        role: "user",
        permissions: "read-only"
      }
    ],
    snapshots: [],
    scheduledSnapshots: []
  };
}

async function restoreDbStateFromPostgres(): Promise<DbState | null> {
  const pool = getPgPool();
  if (!pool) return null;

  try {
    console.log("[Postgres Recovery] Intentando recuperar base de datos completa desde PostgreSQL...");
    await ensureMetadataTable();

    // 1. Obtener esquemas y metadatos de las tablas
    const tablesMeta = await getMetadataValue("tables_metadata", null);
    if (!tablesMeta || !Array.isArray(tablesMeta)) {
      console.log("[Postgres Recovery] No se encontraron esquemas de tablas guardados en Postgres para restaurar.");
      return null;
    }

    // 2. Recuperar el resto de colecciones de metadatos de control
    const users = await getMetadataValue("users", []);
    const logs = await getMetadataValue("logs", []);
    const snapshots = await getMetadataValue("snapshots", []);
    const scheduledSnapshots = await getMetadataValue("scheduledSnapshots", []);
    const correlations = await getMetadataValue("correlations", []);

    const tables: TableSchema[] = [];

    // 3. Reconstruir filas físicas de cada tabla mapeándolas de vuelta
    for (const tableMeta of tablesMeta) {
      const tableObj: TableSchema = {
        ...tableMeta,
        rows: []
      };

      const physTableName = getPhysicalTableName(tableMeta);
      try {
        console.log(`[Postgres Recovery] Reconstruyendo registros de la tabla física '${physTableName}'...`);
        const rowsRes = await pool.query(`SELECT * FROM "${physTableName}"`);
        
        for (const pgRow of rowsRes.rows) {
          const rowObj: any = { id: pgRow.id };
          for (const col of tableMeta.columns) {
            const physColName = getPhysicalColumnName(col);
            const rawVal = pgRow[physColName];
            
            if (rawVal === undefined || rawVal === null) {
              rowObj[col.id] = null;
            } else if (col.type === "number") {
              rowObj[col.id] = Number(rawVal);
            } else if (col.type === "boolean") {
              rowObj[col.id] = (rawVal === true || String(rawVal) === "true" || String(rawVal) === "1" || String(rawVal).toLowerCase() === "t");
            } else {
              rowObj[col.id] = String(rawVal);
            }
          }
          tableObj.rows.push(rowObj);
        }
      } catch (err) {
        console.error(`[Postgres Recovery] Alerta: No se pudo leer la tabla física '${physTableName}':`, err);
        tableObj.rows = [];
      }
      tables.push(tableObj);
    }

    const recoveredState: DbState = {
      tables,
      logs,
      users,
      snapshots,
      scheduledSnapshots,
      correlations
    };

    console.log(`[Postgres Recovery] Éxito: Base de datos recuperada desde Postgres con ${tables.length} tablas y ${snapshots.length} snapshots.`);
    return recoveredState;
  } catch (err) {
    console.error("[Postgres Recovery] Falló de forma general la recuperación de base de datos desde Postgres:", err);
    return null;
  }
}

async function loadDb(): Promise<DbState> {
  try {
    let isDefaultOrMissing = !fs.existsSync(DB_FILE_PATH);
    
    // Si el archivo existe localmente en el contenedor, comprobamos si contiene la plantilla por defecto estática.
    // Esto previene que se sobrescriban los datos persistentes guardados en Postgres con la plantilla inicial default de compilación.
    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        const data = fs.readFileSync(DB_FILE_PATH, "utf-8");
        const parsed = JSON.parse(data);
        if (
          (!parsed.snapshots || parsed.snapshots.length === 0) && 
          (!parsed.tables || parsed.tables.length <= 2) && 
          (!parsed.logs || parsed.logs.length <= 1) &&
          (!parsed.scheduledSnapshots || parsed.scheduledSnapshots.length === 0)
        ) {
          isDefaultOrMissing = true;
        }
      } catch (err) {
        isDefaultOrMissing = true;
      }
    }

    if (isDefaultOrMissing && isPostgresEnabled()) {
      const recovered = await restoreDbStateFromPostgres();
      if (recovered) {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(recovered, null, 2), "utf-8");
        return recovered;
      }
    }

    if (fs.existsSync(DB_FILE_PATH)) {
      const data = fs.readFileSync(DB_FILE_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (!parsed.users) {
        parsed.users = [
          {
            id: "usr_admin",
            username: "admin",
            name: "Administrador del Sistema",
            password: "admin123",
            role: "admin",
            permissions: "read-write"
          },
          {
            id: "usr_colaborador",
            username: "colaborador",
            name: "Colaborador de Prueba",
            password: "colaborador123",
            role: "user",
            permissions: "read-write"
          },
          {
            id: "usr_qa",
            username: "qa",
            name: "QA Auditor",
            password: "qa123",
            role: "user",
            permissions: "read-only"
          }
        ];
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(parsed, null, 2), "utf-8");
      }
      if (!parsed.snapshots) {
        parsed.snapshots = [];
      }
      if (!parsed.scheduledSnapshots) {
        parsed.scheduledSnapshots = [];
      }
      if (!parsed.correlations) {
        parsed.correlations = [];
      }
      
      // trigger background sync so postgres is populated on load if it is empty
      if (isPostgresEnabled()) {
        triggerBackgroundPostgresSync(parsed).catch(err => {
          console.error("[Postgres Sync] Error en sincronización inicial en background:", err);
        });
      }
      
      return parsed;
    }
  } catch (error) {
    console.error("Error fatal cargando base de datos JSON local:", error);
  }
  const defaultState = getInitialDbState();
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(defaultState, null, 2), "utf-8");
  
  if (isPostgresEnabled()) {
    triggerBackgroundPostgresSync(defaultState).catch(err => {
      console.error("[Postgres Sync] Error en sincronización inicial por defecto:", err);
    });
  }
  
  return defaultState;
}

async function triggerBackgroundPostgresSync(state: DbState) {
  const syncReport: any = {
    timestamp: new Date().toISOString(),
    tables: []
  };

  try {
    const pool = getPgPool();
    if (!pool) {
      syncReport.error = "PostgreSQL pool is null";
      fs.writeFileSync(path.join(process.cwd(), "data", "sync_errors.json"), JSON.stringify(syncReport, null, 2), "utf-8");
      return;
    }
    
    await ensureMetadataTable();
    
    const tablesMetaOnly = state.tables.map(t => {
      const { rows, ...meta } = t;
      return meta;
    });
    
    await setMetadataValue("tables_metadata", tablesMetaOnly);
    await setMetadataValue("users", state.users || []);
    await setMetadataValue("logs", state.logs || []);
    await setMetadataValue("snapshots", state.snapshots || []);
    await setMetadataValue("correlations", state.correlations || []);
    
    await syncPhysicalSchemaWithMetadata(state.tables);
    
    for (const table of state.tables) {
      const tableReport: any = {
        tableId: table.id,
        tableName: table.name,
        physicalTableName: getPhysicalTableName(table),
        inMemoryRowsCount: table.rows?.length || 0,
        syncedRowsCount: 0,
        errors: []
      };

      try {
        const physTableName = getPhysicalTableName(table);
        const inMemoryRows = table.rows || [];
        
        const physicalRowRes = await pool.query(`SELECT id FROM "${physTableName}"`);
        const physicalRowIds = physicalRowRes.rows.map(r => r.id);
        const inMemoryRowIds = inMemoryRows.map(r => r.id);
        
        const idsToDelete = physicalRowIds.filter(id => !inMemoryRowIds.includes(id));
        if (idsToDelete.length > 0) {
          await pool.query(`DELETE FROM "${physTableName}" WHERE id = ANY($1)`, [idsToDelete]);
        }
        
        // Filtramos columnas de tipo "file" para no insertarlas ni romper SQL
        const sqlColumns = table.columns.filter(c => c.type !== "file");
        if (sqlColumns.length === 0) {
          tableReport.message = "No SQL-compatible columns found (e.g. only 'file' columns)";
          syncReport.tables.push(tableReport);
          continue;
        }
        
        const physicalColNames = sqlColumns.map(c => getPhysicalColumnName(c));
        const colPlaceholders = physicalColNames.map((_, idx) => `$${idx + 2}`).join(", ");
        const updateSetClauses = physicalColNames.map((physColName, idx) => `"${physColName}" = $${idx + 2}`).join(", ");
        
        const upsertQuery = `
          INSERT INTO "${physTableName}" (id, ${physicalColNames.map(c => `"${c}"`).join(", ")})
          VALUES ($1, ${colPlaceholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSetClauses}
        `;
        
        for (const row of inMemoryRows) {
          try {
            const values = sqlColumns.map(colDef => {
              const val = row[colDef.id];
              if (val === undefined || val === null) return null;
              if (colDef.type === "boolean") {
                return (val === true || String(val).toLowerCase() === "true" || String(val) === "1" || String(val).trim().toLowerCase() === "si");
              }
              if (colDef.type === "number") {
                const num = Number(val);
                return isNaN(num) ? 0 : num;
              }
              return String(val);
            });
            
            await pool.query(upsertQuery, [row.id, ...values]);
            tableReport.syncedRowsCount++;
          } catch (rowErr: any) {
            console.error(`[Postgres Sync] Error al sincronizar fila '${row.id}' en tabla '${physTableName}':`, rowErr);
            tableReport.errors.push({
              rowId: row.id,
              error: rowErr.message,
              detail: rowErr.detail,
              hint: rowErr.hint,
              rowData: row
            });
          }
        }
      } catch (err: any) {
        console.error(`[Postgres Sync] Error al sincronizar registros de la tabla '${table.id}':`, err);
        tableReport.error = err.message;
      }

      syncReport.tables.push(tableReport);
    }
    console.log("[Postgres Sync] Sincronización en segundo plano completada con éxito.");
  } catch (error: any) {
    console.error("[Postgres Sync] Falló la sincronización en background en Postgres:", error);
    syncReport.globalError = error.message;
  }

  try {
    fs.writeFileSync(path.join(process.cwd(), "data", "sync_errors.json"), JSON.stringify(syncReport, null, 2), "utf-8");
  } catch (writeErr) {
    console.error("[Postgres Sync] Error escribiendo sync_errors.json:", writeErr);
  }
}

async function saveDb(state: DbState) {
  // Siempre guardar primero de forma local y síncrona/inmediata en el archivo JSON
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("Error al persistir base de datos local JSON:", error);
  }

  // Sincronizar en segundo plano de forma no bloqueante si PostgreSQL está activo
  if (isPostgresEnabled()) {
    triggerBackgroundPostgresSync(state).catch(err => {
      console.error("[Postgres Sync] Fallo de sincronización en segundo plano:", err);
    });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsDir));

  // Funciones auxiliares para control de accesos por roles y permisos
  function verifyWriteAccess(req: express.Request, db: DbState): { allowed: boolean; user?: any; error?: string } {
    const username = (req.headers["x-user-username"] as string) || "";
    if (!username) {
      return { allowed: false, error: "Identificación de sesión ausente (Cargue x-user-username en las cabeceras)." };
    }
    const user = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
    if (!user) {
      return { allowed: false, error: `Sesión inválida: El usuario '${username}' no está registrado en el sistema.` };
    }
    if (user.permissions === "read-only") {
      return { allowed: false, user, error: `Permiso Denegado: Tu perfil '${user.name}' tiene nivel de SÓLO LECTURA.` };
    }
    return { allowed: true, user };
  }

  function verifyAdminAccess(req: express.Request, db: DbState): { allowed: boolean; user?: any; error?: string } {
    const username = (req.headers["x-user-username"] as string) || "";
    if (!username) {
      return { allowed: false, error: "Identificación de sesión ausente." };
    }
    const user = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
    if (!user) {
      return { allowed: false, error: "Sesión inválida o expirada." };
    }
    if (user.role !== "admin") {
      return { allowed: false, user, error: "Permiso Denegado: Se requieren privilegios de Administrador para gestionar usuarios." };
    }
    return { allowed: true, user };
  }

  function isFieldEmpty(val: any, type?: string) {
    if (val === undefined || val === null) return true;
    if (typeof val === "string" && val.trim() === "") return true;
    if (Array.isArray(val) && val.length === 0) return true;
    if (type === "number" && Number(val) === 0) return true;
    if (val === 0) return true;
    return false;
  }

  function runSyncForTable(db: DbState, updatedTableId: string, updatedRow: any, visitedRowIds: Set<string> = new Set()) {
    const rowKey = `${updatedTableId}:${updatedRow.id}`;
    if (visitedRowIds.has(rowKey)) return;
    visitedRowIds.add(rowKey);

    const correlations = db.correlations || [];
    const updatedTable = db.tables.find(t => t.id === updatedTableId);
    if (!updatedTable) return;

    for (const corr of correlations) {
      if (!corr.active) continue;

      const isSource = corr.sourceTableId === updatedTableId;
      const isTarget = corr.targetTableId === updatedTableId;

      if (!isSource && !isTarget) continue;

      const partnerTableId = isSource ? corr.targetTableId : corr.sourceTableId;
      const myKeyColId = isSource ? corr.sourceColumnId : corr.targetColumnId;
      const partnerKeyColId = isSource ? corr.targetColumnId : corr.sourceColumnId;

      const partnerTable = db.tables.find(t => t.id === partnerTableId);
      if (!partnerTable) continue;

      const myKeyValue = updatedRow[myKeyColId];
      if (myKeyValue === undefined || myKeyValue === null || String(myKeyValue).trim() === "") continue;

      const cleanMyKeyValue = String(myKeyValue).trim().toLowerCase();

      const partnerRows = partnerTable.rows.filter(r => {
        const val = r[partnerKeyColId];
        return val !== undefined && val !== null && String(val).trim().toLowerCase() === cleanMyKeyValue;
      });

      for (const partnerRow of partnerRows) {
        let rowChanged = false;
        let partnerChanged = false;

        for (const colMy of updatedTable.columns) {
          if (colMy.id === myKeyColId) continue;

          const colPartner = partnerTable.columns.find(c => 
            c.id !== partnerKeyColId && 
            c.name.trim().toLowerCase() === colMy.name.trim().toLowerCase()
          );

          if (!colPartner) continue;

          const valMy = updatedRow[colMy.id];
          const valPartner = partnerRow[colPartner.id];

          const isMyEmpty = isFieldEmpty(valMy, colMy.type);
          const isPartnerEmpty = isFieldEmpty(valPartner, colPartner.type);

          if (!isMyEmpty && isPartnerEmpty) {
            partnerRow[colPartner.id] = valMy;
            partnerChanged = true;
          } else if (isMyEmpty && !isPartnerEmpty) {
            updatedRow[colMy.id] = valPartner;
            rowChanged = true;
          } else if (!isMyEmpty && !isPartnerEmpty && valMy !== valPartner) {
            partnerRow[colPartner.id] = valMy;
            partnerChanged = true;
          }
        }

        if (partnerChanged) {
          runSyncForTable(db, partnerTableId, partnerRow, visitedRowIds);
        }
      }
    }
  }

  function verifyTableAccess(req: express.Request, db: DbState, tableId: string): boolean {
    const username = (req.headers["x-user-username"] as string) || "";
    if (!username) return false;
    const user = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
    if (!user) return false;
    // Admins always have access to all tables
    if (user.role === "admin") return true;
    // If unrestricted, they can access anything
    if (!user.allowedTables || user.allowedTables.length === 0 || user.allowedTables.includes("*")) {
      return true;
    }
    return user.allowedTables.includes(tableId);
  }

  // API de Login
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "El nombre de usuario y contraseña son estrictamente necesarios." });
    }
    const db = await loadDb();
    const user = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase().trim() && u.password === password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas. Por favor, intente nuevamente." });
    }
    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      allowedTables: user.allowedTables || []
    });
  });

  // APIs para la administración de usuarios (Solo administrador)
  app.get("/api/users", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }
    // Retornamos los usuarios desnudando los passwords por seguridad si es necesario,
    // o incluyéndolos para que el admin pueda verlos y editarlos cómodamente.
    res.json(db.users || []);
  });

  app.post("/api/users", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { username, name, password, role, permissions, allowedTables } = req.body;
    if (!username || !name || !password || !role || !permissions) {
      return res.status(400).json({ error: "Todos los campos de usuario son requeridos para el alta física." });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const exists = db.users?.some(u => u.username.toLowerCase() === trimmedUsername);
    if (exists) {
      return res.status(400).json({ error: `El nombre de usuario '${username}' ya está ocupado.` });
    }

    const newUser = {
      id: "usr_" + Date.now(),
      username: trimmedUsername,
      name: name.trim(),
      password: password,
      role: role,
      permissions: permissions,
      allowedTables: Array.isArray(allowedTables) ? allowedTables : []
    };

    if (!db.users) db.users = [];
    db.users.push(newUser);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "users",
      tableName: "Control de Accesos",
      details: `Creó la cuenta de usuario '${newUser.name}' con rol '${newUser.role}' y permisos de '${newUser.permissions}'.`
    });

    await saveDb(db);
    res.json(db.users);
  });

  app.put("/api/users/:userId", async (req, res) => {
    const { userId } = req.params;
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const userIdx = db.users?.findIndex(u => u.id === userId);
    if (userIdx === undefined || userIdx === -1) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const targetUser = db.users![userIdx];
    const { name, password, role, permissions, allowedTables } = req.body;

    if (targetUser.username === "admin" && role !== "admin") {
      return res.status(400).json({ error: "No es posible degradar al administrador del sistema principal para no perder acceso." });
    }

    if (name) targetUser.name = name.trim();
    if (password) targetUser.password = password;
    if (role) targetUser.role = role;
    if (permissions) targetUser.permissions = permissions;
    if (allowedTables !== undefined) targetUser.allowedTables = Array.isArray(allowedTables) ? allowedTables : [];

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "users",
      tableName: "Control de Accesos",
      details: `Modificó las credenciales/permisos de la cuenta de usuario '${targetUser.name}'.`
    });

    await saveDb(db);
    res.json(db.users);
  });

  app.delete("/api/users/:userId", async (req, res) => {
    const { userId } = req.params;
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const userIdx = db.users?.findIndex(u => u.id === userId);
    if (userIdx === undefined || userIdx === -1) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const targetUser = db.users![userIdx];
    if (targetUser.username === "admin") {
      return res.status(400).json({ error: "No es posible eliminar al usuario administrador ('admin') maestro del sistema." });
    }

    db.users!.splice(userIdx, 1);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "users",
      tableName: "Control de Accesos",
      details: `Eliminó la cuenta de usuario '${targetUser.name}' (${targetUser.username}).`
    });

    await saveDb(db);
    res.json(db.users);
  });

  // Rutas API Primero

  // Obtener estado actual de la DB
  app.get("/api/db", async (req, res) => {
    let db = await loadDb();
    const username = (req.headers["x-user-username"] as string) || "";
    if (username) {
      const user = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
      if (user && user.role !== "admin") {
        if (user.allowedTables && user.allowedTables.length > 0 && !user.allowedTables.includes("*")) {
          db = {
            ...db,
            tables: db.tables.filter(t => user.allowedTables!.includes(t.id))
          };
        }
      }
    }
    res.json(db);
  });

  // ==========================================
  //  PROPIA API DE ACCESO REST COMPATIBLE PARA n8n (estilo NocoDB / Airtable)
  // ==========================================

  // Función inteligente para buscar el índice de una fila por ID o valor identificador
  function findRowIndexInTable(table: any, searchKey: string): number {
    if (!searchKey) return -1;
    const cleanSearchKey = searchKey.trim().toLowerCase();

    // 1. Coincidencia por ID interno absoluto (ej: row_12345)
    let idx = table.rows.findIndex((r: any) => r.id === searchKey);
    if (idx !== -1) return idx;

    // 2. Coincidencia por la columna Identificadora Principal (Índice 0, ej: "Documento", "Numero de cliente")
    if (table.columns && table.columns.length > 0) {
      const primaryCol = table.columns[0];
      idx = table.rows.findIndex((r: any) => {
        const val = r[primaryCol.id];
        return val !== undefined && val !== null && String(val).trim().toLowerCase() === cleanSearchKey;
      });
      if (idx !== -1) return idx;
    }

    // 3. Coincidencia por otras columnas indicadoras de clave comunes (ej: key, documento, dni, email...)
    const keyIndicators = ["key", "documento", "dni", "numero", "codigo", "cliente", "numero_de_cliente", "email", "matricula"];
    const matchedCols = table.columns.filter((c: any) => {
      const nameLower = c.name.toLowerCase();
      const idLower = c.id.toLowerCase();
      const sanitizedName = sanitizePhysicalName(c.name);
      return keyIndicators.some(ind => 
        nameLower === ind || 
        idLower === ind || 
        sanitizedName === ind ||
        nameLower.includes(ind)
      );
    });

    for (const col of matchedCols) {
      idx = table.rows.findIndex((r: any) => {
        const val = r[col.id];
        return val !== undefined && val !== null && String(val).trim().toLowerCase() === cleanSearchKey;
      });
      if (idx !== -1) return idx;
    }

    return -1;
  }

  // 1. OBTENER FILAS (GET)
  app.get("/api/v1/db/data/v1/:projectName/:tableName", async (req, res) => {
    try {
      const db = await loadDb();
      const { tableName } = req.params;
      const format = req.query.format || "nocodb"; // supports "flat" or "nocodb"
      const cleanSearchName = tableName.trim().toLowerCase();

      // Buscar tabla por ID, nombre exacto o nombre en formato físico sql
      const table = db.tables.find(t => 
        t.id.toLowerCase() === cleanSearchName ||
        t.name.toLowerCase() === cleanSearchName ||
        getPhysicalTableName(t).toLowerCase() === cleanSearchName ||
        sanitizePhysicalName(t.name) === cleanSearchName
      );

      if (!table) {
        return res.status(404).json({ error: `La tabla con el identificador o nombre '${tableName}' no existe en esta Base de Datos.` });
      }

      // Convertir filas internas (col_xxx) a un mapeado limpio
      // Por defecto ("human"), devolvemos únicamente el par "Nombre de Columna Humana": valor para una salida libre de redundancias.
      // Modificable con ?view=api (formato api amigable), ?view=id (IDs de columna) o ?view=all (retrocompatibilidad completa).
      const viewMode = (req.query.view || "human").toString().toLowerCase();

      const mappedRows = (table.rows || []).map(row => {
        const mappedRow: any = { id: row.id };
        table.columns.forEach(col => {
          const val = row[col.id];
          
          if (viewMode === "api") {
            // "nombre", "obra_social", "fecha_de_cirugia"
            mappedRow[sanitizePhysicalName(col.name)] = val;
          } else if (viewMode === "id") {
            // "col_5_0", "col_20_6"
            mappedRow[col.id] = val;
          } else if (viewMode === "all") {
            // Mantiene las tres opciones para máxima retrocompatibilidad si es necesario
            mappedRow[col.id] = val;
            mappedRow[col.name] = val;
            mappedRow[sanitizePhysicalName(col.name)] = val;
          } else {
            // "human" (Por defecto) - Súper limpio: "Nombre", "Obra social", "Patología", "Laboratorio"
            mappedRow[col.name] = val;
          }
        });
        return mappedRow;
      });

      if (format === "flat") {
        return res.json(mappedRows);
      }

      // Devolver formato estándar compatible con el nodo nativo NocoDB de n8n
      res.json({
        list: mappedRows,
        pageInfo: {
          totalRows: mappedRows.length,
          page: 1,
          pageSize: 1000,
          isFirstPage: true,
          isLastPage: true
        }
      });
    } catch (apiErr: any) {
      console.error("[n8n API GET] Error consultando tabla:", apiErr);
      res.status(500).json({ error: apiErr.message });
    }
  });

  // 1b. OBTENER FILA INDIVIDUAL (GET por ID o Identificador)
  app.get("/api/v1/db/data/v1/:projectName/:tableName/:rowId", async (req, res) => {
    try {
      const db = await loadDb();
      const { tableName, rowId } = req.params;
      const cleanSearchName = tableName.trim().toLowerCase();

      const table = db.tables.find(t => 
        t.id.toLowerCase() === cleanSearchName ||
        t.name.toLowerCase() === cleanSearchName ||
        getPhysicalTableName(t).toLowerCase() === cleanSearchName ||
        sanitizePhysicalName(t.name) === cleanSearchName
      );

      if (!table) {
        return res.status(404).json({ error: `La tabla con el identificador o nombre '${tableName}' no existe.` });
      }

      const rIdx = findRowIndexInTable(table, rowId);
      if (rIdx === -1) {
        return res.status(404).json({ error: `La fila con el ID o Identificador (key, cédula, DNI/código) '${rowId}' no se encuentra en esta tabla.` });
      }
      const existingRow = table.rows[rIdx];

      const viewMode = (req.query.view || "human").toString().toLowerCase();
      const mappedRow: any = { id: existingRow.id };
      table.columns.forEach(col => {
        const val = existingRow[col.id];
        if (viewMode === "api") {
          mappedRow[sanitizePhysicalName(col.name)] = val;
        } else if (viewMode === "id") {
          mappedRow[col.id] = val;
        } else if (viewMode === "all") {
          mappedRow[col.id] = val;
          mappedRow[col.name] = val;
          mappedRow[sanitizePhysicalName(col.name)] = val;
        } else {
          mappedRow[col.name] = val;
        }
      });

      res.json(mappedRow);
    } catch (apiErr: any) {
      console.error("[n8n API GET INDIVIDUAL] Error recuperando fila:", apiErr);
      res.status(500).json({ error: apiErr.message });
    }
  });

  // 2. INSERTAR NUEVA(S) FILA(S) (POST)
  app.post("/api/v1/db/data/v1/:projectName/:tableName", async (req, res) => {
    try {
      const db = await loadDb();
      const { tableName } = req.params;
      const cleanSearchName = tableName.trim().toLowerCase();

      const table = db.tables.find(t => 
        t.id.toLowerCase() === cleanSearchName ||
        t.name.toLowerCase() === cleanSearchName ||
        getPhysicalTableName(t).toLowerCase() === cleanSearchName ||
        sanitizePhysicalName(t.name) === cleanSearchName
      );

      if (!table) {
        return res.status(404).json({ error: `La tabla '${tableName}' no existe.` });
      }

      const isArray = Array.isArray(req.body);
      const rowsToInsert = isArray ? req.body : [req.body];
      let timestampIncr = Date.now();
      const newlyCreatedRows: any[] = [];

      for (const inputRow of rowsToInsert) {
        const rowId = "row_" + (timestampIncr++) + "_" + Math.random().toString(36).substring(2, 6);
        const newRow: any = { id: rowId };

        table.columns.forEach(col => {
          // Candidatos de búsqueda en el body para este campo
          const candidates = [
            col.id,
            col.name,
            sanitizePhysicalName(col.name),
            col.name.toLowerCase()
          ];
          
          let val: any = undefined;
          for (const cand of candidates) {
            if (inputRow[cand] !== undefined) {
              val = inputRow[cand];
              break;
            }
          }

          // Convertir y limpiar tipo de dato
          if (col.type === "boolean") {
            newRow[col.id] = val === undefined ? false : (val === true || String(val).toLowerCase() === "true" || String(val) === "1" || String(val).trim().toLowerCase() === "si");
          } else if (col.type === "number") {
            newRow[col.id] = val === undefined || val === "" || val === null ? "" : Number(val);
          } else if (col.type === "file") {
            newRow[col.id] = Array.isArray(val) ? val : (val ? [val] : []);
          } else {
            newRow[col.id] = val === undefined || val === null ? "" : String(val);
          }
        });

        table.rows.push(newRow);
        newlyCreatedRows.push(newRow);
      }

      // Loguear inserción en auditoría
      db.logs.push({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString(),
        user: "API n8n",
        action: "CREATE",
        tableId: table.id,
        tableName: table.name,
        details: `Se insertó(aron) ${newlyCreatedRows.length} fila(s) mediante el API REST de n8n.`
      });

      for (const row of newlyCreatedRows) {
        runSyncForTable(db, table.id, row);
      }

      await saveDb(db);

      // Formatear respuesta con los campos extendidos duales
      const responseData = newlyCreatedRows.map(row => {
        const r: any = { id: row.id };
        table.columns.forEach(col => {
          r[col.id] = row[col.id];
          r[col.name] = row[col.id];
          r[sanitizePhysicalName(col.name)] = row[col.id];
        });
        return r;
      });

      res.status(201).json(isArray ? responseData : responseData[0]);
    } catch (apiErr: any) {
      console.error("[n8n API POST] Error insertando fila:", apiErr);
      res.status(500).json({ error: apiErr.message });
    }
  });

  // 3. ACTUALIZAR UNA FILA (PATCH)
  app.patch("/api/v1/db/data/v1/:projectName/:tableName/:rowId", async (req, res) => {
    try {
      const db = await loadDb();
      const { tableName, rowId } = req.params;
      const cleanSearchName = tableName.trim().toLowerCase();

      const table = db.tables.find(t => 
        t.id.toLowerCase() === cleanSearchName ||
        t.name.toLowerCase() === cleanSearchName ||
        getPhysicalTableName(t).toLowerCase() === cleanSearchName ||
        sanitizePhysicalName(t.name) === cleanSearchName
      );

      if (!table) {
        return res.status(404).json({ error: `La tabla '${tableName}' no existe.` });
      }

      const rIdx = findRowIndexInTable(table, rowId);
      if (rIdx === -1) {
        return res.status(404).json({ error: `La fila con el ID o Identificador (key, cédula, DNI/código) '${rowId}' no se encuentra en esta tabla.` });
      }
      const existingRow = table.rows[rIdx];

      const inputRow = req.body || {};

      table.columns.forEach(col => {
        const candidates = [
          col.id,
          col.name,
          sanitizePhysicalName(col.name),
          col.name.toLowerCase()
        ];
        
        let val: any = undefined;
        let found = false;
        for (const cand of candidates) {
          if (inputRow[cand] !== undefined) {
            val = inputRow[cand];
            found = true;
            break;
          }
        }

        if (found) {
          if (col.type === "boolean") {
            existingRow[col.id] = (val === true || String(val).toLowerCase() === "true" || String(val) === "1" || String(val).trim().toLowerCase() === "si");
          } else if (col.type === "number") {
            existingRow[col.id] = val === "" || val === null ? "" : Number(val);
          } else if (col.type === "file") {
            existingRow[col.id] = Array.isArray(val) ? val : (val ? [val] : []);
          } else {
            existingRow[col.id] = val === null ? "" : String(val);
          }
        }
      });

      db.logs.push({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString(),
        user: "API n8n",
        action: "UPDATE",
        tableId: table.id,
        tableName: table.name,
        details: `Se actualizó el registro ID '${rowId}' mediante el API REST de n8n.`
      });

      runSyncForTable(db, table.id, existingRow);

      await saveDb(db);

      const responseData: any = { id: existingRow.id };
      table.columns.forEach(col => {
        responseData[col.id] = existingRow[col.id];
        responseData[col.name] = existingRow[col.id];
        responseData[sanitizePhysicalName(col.name)] = existingRow[col.id];
      });

      res.json(responseData);
    } catch (apiErr: any) {
      console.error("[n8n API PATCH] Error actualizando fila:", apiErr);
      res.status(500).json({ error: apiErr.message });
    }
  });

  // 4. ELIMINAR UNA FILA (DELETE)
  app.delete("/api/v1/db/data/v1/:projectName/:tableName/:rowId", async (req, res) => {
    try {
      const db = await loadDb();
      const { tableName, rowId } = req.params;
      const cleanSearchName = tableName.trim().toLowerCase();

      const table = db.tables.find(t => 
        t.id.toLowerCase() === cleanSearchName ||
        t.name.toLowerCase() === cleanSearchName ||
        getPhysicalTableName(t).toLowerCase() === cleanSearchName ||
        sanitizePhysicalName(t.name) === cleanSearchName
      );

      if (!table) {
        return res.status(404).json({ error: `La tabla '${tableName}' no existe.` });
      }

      const rIdx = findRowIndexInTable(table, rowId);

      if (rIdx === -1) {
        return res.status(404).json({ error: `La fila con el ID o Identificador (key, cédula, DNI/código) '${rowId}' no existe en esta tabla.` });
      }

      table.rows.splice(rIdx, 1);

      db.logs.push({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString(),
        user: "API n8n",
        action: "DELETE",
        tableId: table.id,
        tableName: table.name,
        details: `Se eliminó el registro ID '${rowId}' mediante el API REST de n8n.`
      });

      await saveDb(db);
      res.json({ success: true, message: `Registro '${rowId}' eliminado exitosamente.` });
    } catch (apiErr: any) {
      console.error("[n8n API DELETE] Error eliminando fila:", apiErr);
      res.status(500).json({ error: apiErr.message });
    }
  });

  // Diagnóstico de Postgres e inspección de errores de sincronización
  app.get("/api/debug/pg-status", async (req, res) => {
    const isEnabled = isPostgresEnabled();
    const pool = getPgPool();
    const db = await loadDb();
    
    if (!isEnabled || !pool) {
      return res.json({
        enabled: false,
        message: "PostgreSQL is not enabled or connection is not configured."
      });
    }

    try {
      // Obtener listado de tablas físicas
      const tablesQuery = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      const physicalTables = tablesQuery.rows.map(r => r.table_name);

      const tableCounts: Record<string, number> = {};
      for (const t of physicalTables) {
        try {
          const countQuery = await pool.query(`SELECT COUNT(*) FROM "${t}"`);
          tableCounts[t] = parseInt(countQuery.rows[0].count);
        } catch (e: any) {
          tableCounts[t] = -1;
        }
      }

      const syncErrors: any[] = [];
      const syncLog: string[] = [];

      await ensureMetadataTable();
      await syncPhysicalSchemaWithMetadata(db.tables);

      for (const table of db.tables) {
        const physTableName = getPhysicalTableName(table);
        const inMemoryRows = table.rows || [];
        
        syncLog.push(`Table ${table.name} (id: ${table.id}, physical: ${physTableName}) has ${inMemoryRows.length} in-memory rows.`);

        const sqlColumns = table.columns.filter(c => c.type !== "file");
        const physicalColNames = sqlColumns.map(c => getPhysicalColumnName(c));
        const colPlaceholders = physicalColNames.map((_, idx) => `$${idx + 2}`).join(", ");
        const updateSetClauses = physicalColNames.map((physColName, idx) => `"${physColName}" = $${idx + 2}`).join(", ");
        
        const upsertQuery = `
          INSERT INTO "${physTableName}" (id, ${physicalColNames.map(c => `"${c}"`).join(", ")})
          VALUES ($1, ${colPlaceholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSetClauses}
        `;

        let successCount = 0;
        for (const row of inMemoryRows) {
          try {
            const values = sqlColumns.map(colDef => {
              const val = row[colDef.id];
              if (val === undefined || val === null) return null;
              if (colDef.type === "boolean") {
                return (val === true || String(val).toLowerCase() === "true" || String(val) === "1" || String(val).trim().toLowerCase() === "si");
              }
              if (colDef.type === "number") {
                const num = Number(val);
                return isNaN(num) ? 0 : num;
              }
              return String(val);
            });
            
            await pool.query(upsertQuery, [row.id, ...values]);
            successCount++;
          } catch (rowErr: any) {
            syncErrors.push({
              tableName: table.name,
              rowId: row.id,
              error: rowErr.message,
              detail: rowErr.detail,
              hint: rowErr.hint,
              rowData: row
            });
          }
        }
        syncLog.push(`Synced ${successCount}/${inMemoryRows.length} rows successfully for Table ${table.name}.`);
      }

      res.json({
        enabled: true,
        physicalTables,
        tableCounts,
        syncLog,
        syncErrorsCount: syncErrors.length,
        syncErrors,
        databaseUrlConfigured: !!process.env.DATABASE_URL
      });
    } catch (err: any) {
      res.status(500).json({
        enabled: true,
        error: err.message,
        stack: err.stack
      });
    }
  });

  // Restaurar estado de prueba
  app.post("/api/db/reset", async (req, res) => {
    const db = await loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const freshDb = getInitialDbState();
    
    // Preserve users between resets
    freshDb.users = db.users;

    freshDb.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: "Se restauró toda la base de datos a los valores por defecto de fábrica."
    });
    await saveDb(freshDb);
    res.json(freshDb);
  });

  // API para Listar Snapshots / Backups
  app.get("/api/db/snapshots", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Solo administradores pueden ver copias de seguridad." });
    }
    res.json(db.snapshots || []);
  });

  // API para Crear un Snapshot de Seguridad
  app.post("/api/db/snapshots", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Solo administradores pueden crear copias de seguridad." });
    }

    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "El nombre del snapshot es obligatorio." });
    }

    const newSnapshot = {
      id: "snap_" + Date.now(),
      name: name.trim(),
      timestamp: new Date().toISOString(),
      creator: auth.user.name,
      tables: JSON.parse(JSON.stringify(db.tables)),
      affectedTables: ["*"] // Respaldo del esquema completo por defecto
    };

    if (!db.snapshots) {
      db.snapshots = [];
    }

    db.snapshots.push(newSnapshot);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se creó la copia de seguridad (Snapshot) '${newSnapshot.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // API para Restaurar un Snapshot
  app.post("/api/db/snapshots/:snapshotId/restore", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Solo administradores pueden restaurar copias de seguridad." });
    }

    const { snapshotId } = req.params;
    const snapshot = db.snapshots?.find(s => s.id === snapshotId);
    if (!snapshot) {
      return res.status(404).json({ error: "Copia de seguridad (Snapshot) no encontrada." });
    }

    // Restauración selectiva/incremental si el snapshot detalla tablas particulares
    let isSelective = false;
    let detailsMsg = `Se restauró la base de datos a la copia de seguridad (Snapshot) '${snapshot.name}' creada el ${new Date(snapshot.timestamp).toLocaleString()}.`;
    
    if (snapshot.affectedTables && !snapshot.affectedTables.includes("*")) {
      isSelective = true;
      const affectedSet = new Set(snapshot.affectedTables);
      
      // Reemplazar solo las tablas que estaban en el snapshot y marcadas como afectadas
      db.tables = db.tables.map(t => {
        if (affectedSet.has(t.id)) {
          const restoredTable = snapshot.tables.find(st => st.id === t.id);
          return restoredTable || t;
        }
        return t;
      });

      // Si una tabla restaurada fue borrada previamente de la base de datos viva, la reincorporamos
      snapshot.tables.forEach(st => {
        if (affectedSet.has(st.id) && !db.tables.some(t => t.id === st.id)) {
          db.tables.push(st);
        }
      });

      detailsMsg = `Se realizó una restauración selectiva/incremental desde la copia '${snapshot.name}'. Tablas afectadas restablecidas: ${snapshot.tables.map(st => `'${st.name}'`).join(", ")}.`;
    } else {
      // Reemplace total de todas las tablas por defecto (histórico)
      db.tables = JSON.parse(JSON.stringify(snapshot.tables));
    }

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: detailsMsg
    });

    await saveDb(db);
    res.json(db);
  });

  // API para Eliminar un Snapshot
  app.delete("/api/db/snapshots/:snapshotId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Solo administradores pueden eliminar copias de seguridad." });
    }

    const { snapshotId } = req.params;
    if (!db.snapshots) db.snapshots = [];

    const snapIdx = db.snapshots.findIndex(s => s.id === snapshotId);
    if (snapIdx === -1) {
      return res.status(404).json({ error: "Copia de seguridad (Snapshot) no encontrada." });
    }

    const deletedSnap = db.snapshots[snapIdx];
    db.snapshots.splice(snapIdx, 1);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se eliminó la copia de seguridad (Snapshot) '${deletedSnap.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Helper para calcular la siguiente corrida programada
  function getNextScheduledRun(frequency: string): string {
    const d = new Date();
    if (frequency === "hourly") {
      d.setHours(d.getHours() + 1);
    } else if (frequency === "daily") {
      d.setDate(d.getDate() + 1);
    } else if (frequency === "weekly") {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString();
  }

  // Tarea de Background para disparar Snapshots Automáticos programados
  function startScheduledSnapshotsWorker() {
    console.log("[Worker] Inicializando sistema de copias de seguridad programadas automáticas (30s interval)...");
    setInterval(async () => {
      try {
        const db = await loadDb();
        if (!db.scheduledSnapshots || db.scheduledSnapshots.length === 0) return;
        
        let changed = false;
        const now = new Date();

        for (const rule of db.scheduledSnapshots) {
          if (!rule.active) continue;
          
          let shouldRun = false;
          if (rule.nextRun) {
            shouldRun = new Date(rule.nextRun) <= now;
          } else {
            shouldRun = true;
          }

          if (shouldRun) {
            // Disparar copia de seguridad programada instantánea
            const isAll = rule.affectedTables.includes("*");
            const filteredTables = isAll
              ? db.tables
              : db.tables.filter(t => rule.affectedTables.includes(t.id));

            const snapshotName = `[Programado] ${rule.name}`;
            const newSnapshot = {
              id: "snap_" + Date.now(),
              name: snapshotName,
              timestamp: now.toISOString(),
              creator: "Sistema Automático",
              tables: JSON.parse(JSON.stringify(filteredTables)),
              affectedTables: rule.affectedTables
            };

            if (!db.snapshots) db.snapshots = [];
            db.snapshots.push(newSnapshot);

            rule.lastRun = now.toISOString();
            rule.nextRun = getNextScheduledRun(rule.frequency);

            db.logs.push({
              id: "log_" + Date.now(),
              timestamp: now.toISOString(),
              user: "Sistema Automático",
              action: "SCHEMA_CHANGE",
              tableId: "*",
              tableName: "Base de Datos",
              details: `Copia programada ejecutada: '${rule.name}'. Se respaldaron ${filteredTables.length} tabla(s) de forma incremental/desduplicada.`
            });

            changed = true;
          }
        }

        if (changed) {
          await saveDb(db);
          console.log("[Worker] Base de datos guardada tras ejecución programada automática.");
        }
      } catch (err) {
        console.error("[Worker Error] Excepción en worker de copias programadas:", err);
      }
    }, 1000 * 30);
  }

  // Iniciar el worker de copias programadas
  startScheduledSnapshotsWorker();

  // API para Listar Tareas de snapshots programadas
  app.get("/api/db/scheduled-snapshots", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Solo administradores pueden previsualizar tareas programadas." });
    }
    res.json(db.scheduledSnapshots || []);
  });

  // API para Crear una Tarea de Snapshot programado
  app.post("/api/db/scheduled-snapshots", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { name, frequency, affectedTables } = req.body;
    if (!name || !frequency || !affectedTables) {
      return res.status(400).json({ error: "El nombre, frecuencia y tablas afectadas son parámetros requeridos." });
    }

    const newRule = {
      id: "sched_" + Date.now(),
      name: name.trim(),
      frequency, // "hourly" | "daily" | "weekly"
      affectedTables, // ["*"] o ["tbl_xxx"]
      active: true,
      creator: auth.user.name,
      nextRun: getNextScheduledRun(frequency)
    };

    if (!db.scheduledSnapshots) db.scheduledSnapshots = [];
    db.scheduledSnapshots.push(newRule);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se configuró la tarea programada de snapshot '${newRule.name}' (${frequency}).`
    });

    await saveDb(db);
    res.json(db);
  });

  // API para Actualizar/Alternar una Tarea de Snapshot programado
  app.put("/api/db/scheduled-snapshots/:ruleId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { ruleId } = req.params;
    const { name, frequency, affectedTables, active } = req.body;

    if (!db.scheduledSnapshots) db.scheduledSnapshots = [];
    const rule = db.scheduledSnapshots.find(r => r.id === ruleId);
    if (!rule) {
      return res.status(404).json({ error: "Tarea programada no encontrada." });
    }

    if (name !== undefined) rule.name = name.trim();
    if (frequency !== undefined) {
      rule.frequency = frequency;
      rule.nextRun = getNextScheduledRun(frequency);
    }
    if (affectedTables !== undefined) rule.affectedTables = affectedTables;
    if (active !== undefined) rule.active = active;

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se modificaron parámetros de la tarea programada '${rule.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // API para Eliminar una Tarea de Snapshot programado
  app.delete("/api/db/scheduled-snapshots/:ruleId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { ruleId } = req.params;
    if (!db.scheduledSnapshots) db.scheduledSnapshots = [];
    const idx = db.scheduledSnapshots.findIndex(r => r.id === ruleId);
    if (idx === -1) {
      return res.status(404).json({ error: "Tarea programada no encontrada." });
    }

    const deletedRule = db.scheduledSnapshots.splice(idx, 1)[0];

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se eliminó la tarea programada de snapshot '${deletedRule.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // API para Forzar ejecución manual e instantánea de una Tarea de Snapshot programada
  app.post("/api/db/scheduled-snapshots/:ruleId/trigger", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { ruleId } = req.params;
    if (!db.scheduledSnapshots) db.scheduledSnapshots = [];
    const rule = db.scheduledSnapshots.find(r => r.id === ruleId);
    if (!rule) {
      return res.status(404).json({ error: "Tarea programada no encontrada." });
    }

    const isAll = rule.affectedTables.includes("*");
    const filteredTables = isAll
      ? db.tables
      : db.tables.filter(t => rule.affectedTables.includes(t.id));

    const newSnapshot = {
      id: "snap_" + Date.now(),
      name: `[Manual run] ${rule.name}`,
      timestamp: new Date().toISOString(),
      creator: auth.user.name,
      tables: JSON.parse(JSON.stringify(filteredTables)),
      affectedTables: rule.affectedTables
    };

    if (!db.snapshots) db.snapshots = [];
    db.snapshots.push(newSnapshot);

    rule.lastRun = new Date().toISOString();
    rule.nextRun = getNextScheduledRun(rule.frequency);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se forzó ejecución manual de la tarea '${rule.name}'. Respaldadas ${filteredTables.length} tablas.`
    });

    await saveDb(db);
    res.json(db);
  });

  // ==========================================
  // API para Correlaciones de Tablas Sincronizadas
  // ==========================================

  // Listar correlaciones
  app.get("/api/db/correlations", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }
    res.json(db.correlations || []);
  });

  // Crear correlación
  app.post("/api/db/correlations", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { sourceTableId, sourceColumnId, targetTableId, targetColumnId } = req.body;
    if (!sourceTableId || !sourceColumnId || !targetTableId || !targetColumnId) {
      return res.status(400).json({ error: "Todos los campos de la relación son requeridos." });
    }

    const newCorr = {
      id: "corr_" + Date.now(),
      sourceTableId,
      sourceColumnId,
      targetTableId,
      targetColumnId,
      active: true
    };

    if (!db.correlations) db.correlations = [];
    db.correlations.push(newCorr);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se configuró una correlación inteligente entre las tablas '${sourceTableId}' y '${targetTableId}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Alternar/Actualizar estado de una correlación
  app.put("/api/db/correlations/:id", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { id } = req.params;
    const { active } = req.body;

    if (!db.correlations) db.correlations = [];
    const corr = db.correlations.find(c => c.id === id);
    if (!corr) {
      return res.status(404).json({ error: "Correlación no encontrada." });
    }

    if (active !== undefined) corr.active = active;

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se ${active ? "activó" : "desactivó"} la correlación inteligente '${id}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Eliminar correlación
  app.delete("/api/db/correlations/:id", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { id } = req.params;
    if (!db.correlations) db.correlations = [];
    const idx = db.correlations.findIndex(c => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Correlación no encontrada." });
    }

    const deleted = db.correlations.splice(idx, 1)[0];

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se eliminó la correlación inteligente entre las tablas '${deleted.sourceTableId}' y '${deleted.targetTableId}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Forzar sincronización masiva retrospectiva de correlación
  app.post("/api/db/correlations/:id/sync", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { id } = req.params;
    if (!db.correlations) db.correlations = [];
    const corr = db.correlations.find(c => c.id === id);
    if (!corr) {
      return res.status(404).json({ error: "Correlación no encontrada." });
    }

    const sourceTable = db.tables.find(t => t.id === corr.sourceTableId);
    if (!sourceTable) {
      return res.status(400).json({ error: "La tabla origen de la correlación ya no existe." });
    }

    let totalSync = 0;
    const visited = new Set<string>();
    
    for (const r of sourceTable.rows) {
      runSyncForTable(db, corr.sourceTableId, r, visited);
      totalSync++;
    }

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se ejecutó sincronización masiva retrospectiva para la correlación inteligente '${id}'. Sincronizados ${totalSync} registros.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Crear una nueva tabla
  app.post("/api/db/tables", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede crear tablas." });
    }

    const currentUser = auth.user.name;
    const { name, columns, rows } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "El nombre de la tabla es obligatorio." });
    }

    const tableId = "tbl_" + Date.now();
    let dbColumns = [
      { id: "col_name", name: "Nombre", type: "text" }
    ];
    let dbRows = [
      { id: "row_first", col_name: "Fila de ejemplo" }
    ];

    if (Array.isArray(columns) && columns.length > 0) {
      dbColumns = columns.map((col: any) => ({
        id: col.id || "col_" + Math.random().toString(36).substr(2, 9),
        name: col.name || "Columna",
        type: col.type || "text",
        options: Array.isArray(col.options) ? col.options : undefined
      }));

      if (Array.isArray(rows)) {
        dbRows = rows.map((row: any, rIdx: number) => {
          const newRow: any = { id: row.id || "row_" + Date.now() + "_" + rIdx };
          dbColumns.forEach((col: any) => {
            let val = row[col.id];
            if (val === undefined) {
              const lookupCandidates = [
                col.name,
                col.title,
                col.name ? String(col.name).toLowerCase() : "",
                col.id && col.id.startsWith("col_") ? col.id.substring(4) : ""
              ].filter(Boolean);
              for (const cand of lookupCandidates) {
                if (row[cand] !== undefined) {
                  val = row[cand];
                  break;
                }
              }
            }

            if (col.type === "boolean") {
              newRow[col.id] = (val === true || String(val).toLowerCase() === "true" || String(val) === "1");
            } else if (col.type === "number") {
              if (val === undefined || val === null || val === "") {
                newRow[col.id] = "";
              } else {
                const num = Number(val);
                newRow[col.id] = isNaN(num) ? "" : num;
              }
            } else if (col.type === "file") {
              if (Array.isArray(val)) {
                newRow[col.id] = val;
              } else if (val !== undefined && val !== null) {
                const strVal = String(val).trim();
                if (strVal.startsWith("[") && strVal.endsWith("]")) {
                  try {
                    newRow[col.id] = JSON.parse(strVal);
                  } catch (e) {
                    newRow[col.id] = strVal ? [strVal] : [];
                  }
                } else {
                  newRow[col.id] = strVal ? [strVal] : [];
                }
              } else {
                newRow[col.id] = [];
              }
            } else {
              newRow[col.id] = val !== undefined && val !== null ? String(val) : "";
            }
          });
          return newRow;
        });
      } else {
        dbRows = [];
      }
    }

    const newTable: TableSchema = {
      id: tableId,
      name: name.trim(),
      columns: dbColumns as any,
      rows: dbRows
    };

    db.tables.push(newTable);
    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: newTable.name,
      details: `Se creó la tabla '${newTable.name}' con ${dbColumns.length} columnas en el esquema.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Recrear una tabla existente (importar estructura + datos)
  app.post("/api/db/tables/:tableId/recreate", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede recrear estructuras de tabla por importación." });
    }

    const { tableId } = req.params;
    const tableIndex = db.tables.findIndex(t => t.id === tableId);
    if (tableIndex === -1) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const { columns, rows } = req.body;
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: "El archivo para recrear debe contener al menos un campo/columna." });
    }

    const dbColumns = columns.map((col: any) => ({
      id: col.id || "col_" + Math.random().toString(36).substr(2, 9),
      name: col.name || "Columna",
      type: col.type || "text",
      options: Array.isArray(col.options) ? col.options : undefined
    }));

    const dbRows = Array.isArray(rows)
      ? rows.map((row: any, rIdx: number) => {
          const newRow: any = { id: row.id || "row_" + Date.now() + "_" + rIdx };
          dbColumns.forEach((col: any) => {
            let val = row[col.id];
            if (val === undefined) {
              const lookupCandidates = [
                col.name,
                col.title,
                col.name ? String(col.name).toLowerCase() : "",
                col.id && col.id.startsWith("col_") ? col.id.substring(4) : ""
              ].filter(Boolean);
              for (const cand of lookupCandidates) {
                if (row[cand] !== undefined) {
                  val = row[cand];
                  break;
                }
              }
            }

            if (col.type === "boolean") {
              newRow[col.id] = (val === true || String(val).toLowerCase() === "true" || String(val) === "1");
            } else if (col.type === "number") {
              if (val === undefined || val === null || val === "") {
                newRow[col.id] = "";
              } else {
                const num = Number(val);
                newRow[col.id] = isNaN(num) ? "" : num;
              }
            } else if (col.type === "file") {
              if (Array.isArray(val)) {
                newRow[col.id] = val;
              } else if (val !== undefined && val !== null) {
                const strVal = String(val).trim();
                if (strVal.startsWith("[") && strVal.endsWith("]")) {
                  try {
                    newRow[col.id] = JSON.parse(strVal);
                  } catch (e) {
                    newRow[col.id] = strVal ? [strVal] : [];
                  }
                } else {
                  newRow[col.id] = strVal ? [strVal] : [];
                }
              } else {
                newRow[col.id] = [];
              }
            } else {
              newRow[col.id] = val !== undefined && val !== null ? String(val) : "";
            }
          });
          return newRow;
        })
      : [];

    const existingTable = db.tables[tableIndex];
    
    // Si PostgreSQL está habilitado, eliminamos la tabla física CASCADE para asegurar que se cree desde cero sin conflicto de tipos antiguos
    const pool = getPgPool();
    if (pool) {
      try {
        const physName = getPhysicalTableName(existingTable);
        console.log(`[Postgres Recreate] Eliminando tabla física '${physName}' de cascada para recrearla limpia...`);
        await pool.query(`DROP TABLE IF EXISTS "${physName}" CASCADE`);
      } catch (dropErr) {
        console.error("[Postgres Recreate] Error al drop de tabla física:", dropErr);
      }
    }

    existingTable.columns = dbColumns as any;
    existingTable.rows = dbRows;

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: existingTable.name,
      details: `La tabla '${existingTable.name}' fue totalmente recreada/sobrescrita por importación de archivo (${dbColumns.length} columnas, ${dbRows.length} registros).`
    });

    await saveDb(db);
    res.json(db);
  });

  // Borrar una tabla
  app.delete("/api/db/tables/:tableId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede borrar tablas." });
    }

    const currentUser = auth.user.name;
    const { tableId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const tableIdx = db.tables.findIndex(t => t.id === tableId);
    if (tableIdx === -1) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const deletedTable = db.tables[tableIdx];
    db.tables.splice(tableIdx, 1);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: deletedTable.name,
      details: `Se eliminó la tabla completa '${deletedTable.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Renombrar una tabla (solo administradores)
  app.put("/api/db/tables/:tableId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede renombrar tablas." });
    }

    const { tableId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "El nuevo nombre de la tabla es obligatorio." });
    }

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const oldName = table.name;
    table.name = name.trim();

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: table.name,
      details: `Se renombró la tabla de '${oldName}' a '${table.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Agregar una nueva columna a una tabla
  app.post("/api/db/tables/:tableId/columns", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede gestionar columnas." });
    }

    const currentUser = auth.user.name;
    const { tableId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const { name, type, options } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Nombre y tipo de columna son obligatorios." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const colId = "col_" + Date.now();
    const newColumn: Column = {
      id: colId,
      name: name.trim(),
      type: type,
      options: options ? options : undefined
    };

    table.columns.push(newColumn);

    // Inicializar el valor de esta columna para todas las filas
    table.rows = table.rows.map(row => {
      let defaultValue: any = "";
      if (type === "boolean") defaultValue = false;
      if (type === "number") defaultValue = 0;
      if (type === "file") defaultValue = []; // Initialize empty array of attachments
      return { ...row, [colId]: defaultValue };
    });

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: table.name,
      details: `Se agregó la columna '${newColumn.name}' de tipo '${type}' a la tabla '${table.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Borrar una columna
  app.delete("/api/db/tables/:tableId/columns/:columnId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede borrar columnas." });
    }

    const currentUser = auth.user.name;
    const { tableId, columnId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const colIdx = table.columns.findIndex(c => c.id === columnId);
    if (colIdx === -1) {
      return res.status(404).json({ error: "Columna no encontrada." });
    }

    const colName = table.columns[colIdx].name;
    table.columns.splice(colIdx, 1);

    // Remover la propiedad de todas las filas
    table.rows = table.rows.map(row => {
      const copy = { ...row };
      delete copy[columnId];
      return copy;
    });

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: table.name,
      details: `Se eliminó la columna '${colName}' de la tabla '${table.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Modificar una columna existente (Nombre, tipo, opciones, varcharLength)
  app.put("/api/db/tables/:tableId/columns/:columnId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede gestionar columnas." });
    }

    const currentUser = auth.user.name;
    const { tableId, columnId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const { name, type, options, varcharLength } = req.body;

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const col = table.columns.find(c => c.id === columnId);
    if (!col) {
      return res.status(404).json({ error: "Columna no encontrada." });
    }

    const prevName = col.name;
    const prevType = col.type;

    if (name) col.name = name.trim();
    if (type) col.type = type;
    if (options !== undefined) col.options = Array.isArray(options) ? options : undefined;
    if (varcharLength !== undefined) {
      const len = Number(varcharLength);
      col.varcharLength = isNaN(len) || len <= 0 ? 50 : len;
    }

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: table.name,
      details: `Se modificó la columna '${prevName}' (tipo: ${prevType}) a '${col.name}' (tipo: ${col.type}) en la tabla '${table.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Establecer columna como identificadora principal (moverla al índice 0)
  app.put("/api/db/tables/:tableId/primary-column/:columnId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede cambiar la columna identificadora." });
    }

    const currentUser = auth.user.name;
    const { tableId, columnId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const colIndex = table.columns.findIndex(c => c.id === columnId);
    if (colIndex === -1) {
      return res.status(404).json({ error: "Columna no encontrada." });
    }

    const [col] = table.columns.splice(colIndex, 1);
    table.columns.unshift(col); // Mover al primer elemento (índice 0)

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: table.name,
      details: `Se estableció la columna '${col.name}' como la columna identificadora principal de la tabla '${table.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // API de Carga Masiva de Filas (Importación CSV)
  app.post("/api/db/tables/:tableId/bulk-rows", async (req, res) => {
    const db = await loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId } = req.params;
    const rowsData = req.body; // Array de registros

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    if (!Array.isArray(rowsData)) {
      return res.status(400).json({ error: "Datos de carga masiva inválidos (esperaba Array)." });
    }

    let timestampIncr = Date.now();
    const importedCount = rowsData.length;

    rowsData.forEach(rowData => {
      const rowId = "row_" + (timestampIncr++);
      const cleanRow: Row = { id: rowId };

      table.columns.forEach(col => {
        let val = rowData[col.id];
        if (col.type === "boolean") {
          val = (val === true || String(val).toLowerCase() === "true" || String(val) === "1" || String(val).trim().toLowerCase() === "si" || String(val).trim().toLowerCase() === "verdadero");
        } else if (col.type === "number") {
          val = val !== undefined && val !== "" ? Number(val) : 0;
          if (isNaN(val)) val = 0;
        } else if (col.type === "file") {
          if (Array.isArray(val)) {
            val = val;
          } else if (val !== undefined && val !== null) {
            const strVal = String(val).trim();
            if (strVal.startsWith("[") && strVal.endsWith("]")) {
              try {
                val = JSON.parse(strVal);
              } catch (e) {
                val = strVal ? [strVal] : [];
              }
            } else {
              val = strVal ? [strVal] : [];
            }
          } else {
            val = [];
          }
        } else {
          val = val !== undefined && val !== null ? String(val) : "";
        }
        cleanRow[col.id] = val;
      });

      table.rows.push(cleanRow);
    });

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "CREATE",
      tableId: tableId,
      tableName: table.name,
      details: `Importación CSV exitosa: Cargó ${importedCount} registros de pacientes en '${table.name}'.`
    });

    const newlyCreatedRows = table.rows.slice(-importedCount);
    for (const row of newlyCreatedRows) {
      runSyncForTable(db, tableId, row);
    }

    await saveDb(db);
    res.json(db);
  });

  // Crear una nueva fila
  app.post("/api/db/tables/:tableId/rows", async (req, res) => {
    const db = await loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const rowData = req.body;

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const rowId = "row_" + Date.now();
    const cleanRow: Row = { id: rowId };

    // Solo conservar valores para columnas existentes para mantener la integridad de la base de datos
    table.columns.forEach(col => {
      let val = rowData[col.id];
      if (val === undefined) {
        if (col.type === "boolean") val = false;
        else if (col.type === "number") val = 0;
        else val = "";
      }
      cleanRow[col.id] = val;
    });

    table.rows.push(cleanRow);

    // Encontrar campo identificador para el log
    const firstColId = table.columns[0]?.id;
    const titleVal = cleanRow[firstColId] || "";

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "CREATE",
      tableId: tableId,
      tableName: table.name,
      details: `Creó una nueva fila en '${table.name}' (${titleVal ? `Identificación: '${titleVal}'` : `ID: ${rowId}`}).`
    });

    runSyncForTable(db, tableId, cleanRow);

    await saveDb(db);
    res.json(db);
  });

  // Actualizar una fila
  app.put("/api/db/tables/:tableId/rows/:rowId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId, rowId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const newValues = req.body;

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const row = table.rows.find(r => r.id === rowId);
    if (!row) {
      return res.status(404).json({ error: "Fila no encontrada." });
    }

    const changes: string[] = [];
    table.columns.forEach(col => {
      const colId = col.id;
      if (newValues[colId] !== undefined) {
        const oldVal = row[colId];
        const newVal = newValues[colId];

        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push(`[${col.name}] cambió de '${oldVal ?? "nulo"}' a '${newVal ?? "nulo"}'`);
          row[colId] = newVal;
        }
      }
    });

    if (changes.length > 0) {
      const firstColId = table.columns[0]?.id;
      const titleVal = row[firstColId] || "";

      db.logs.push({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString(),
        user: currentUser,
        action: "UPDATE",
        tableId: tableId,
        tableName: table.name,
        details: `Modificó fila en '${table.name}' (${titleVal ? `Identificación: '${titleVal}'` : `ID: ${rowId}`}). Detalle: ${changes.join(", ")}.`
      });
      runSyncForTable(db, tableId, row);
      await saveDb(db);
    }

    res.json(db);
  });

  // Eliminar una fila
  app.delete("/api/db/tables/:tableId/rows/:rowId", async (req, res) => {
    const db = await loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId, rowId } = req.params;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    const rowIdx = table.rows.findIndex(r => r.id === rowId);
    if (rowIdx === -1) {
      return res.status(404).json({ error: "Fila no encontrada." });
    }

    const deletedRow = table.rows[rowIdx];
    const firstColId = table.columns[0]?.id;
    const titleVal = deletedRow[firstColId] || "";

    table.rows.splice(rowIdx, 1);

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "DELETE",
      tableId: tableId,
      tableName: table.name,
      details: `Eliminó fila en '${table.name}' (${titleVal ? `Identificado como: '${titleVal}'` : `ID: ${rowId}`}).`
    });

    await saveDb(db);
    res.json(db);
  });

  // Actualizar la columna de agrupación de Kanban de una tabla (solo administradores)
  app.put("/api/db/tables/:tableId/kanban-column", async (req, res) => {
    const db = await loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: Solo el Administrador puede definir el campo del Kanban." });
    }

    const { tableId } = req.params;
    const { kanbanColumnId } = req.body;

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    table.kanbanColumnId = kanbanColumnId;

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: table.name,
      details: `Se configuró la columna Kanban predeterminada de '${table.name}' a '${kanbanColumnId || "Ninguna"}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // Reordenar las columnas de una tabla
  app.put("/api/db/tables/:tableId/reorder-columns", async (req, res) => {
    const db = await loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error || "Permiso Denegado: No tienes permisos para reordenar columnas." });
    }

    const { tableId } = req.params;
    const { columnIds } = req.body;

    if (!Array.isArray(columnIds)) {
      return res.status(400).json({ error: "Se requiere un array de IDs de columnas ('columnIds')." });
    }

    if (!verifyTableAccess(req, db, tableId)) {
      return res.status(403).json({ error: "Permiso Denegado: No tienes acceso a esta tabla." });
    }

    const table = db.tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ error: "Tabla no encontrada." });
    }

    // Reordenar las columnas de forma segura
    const colMap = new Map(table.columns.map(c => [c.id, c]));
    const newColumns: any[] = [];

    for (const id of columnIds) {
      const col = colMap.get(id);
      if (col) {
        newColumns.push(col);
        colMap.delete(id);
      }
    }
    for (const [_, col] of colMap.entries()) {
      newColumns.push(col);
    }

    table.columns = newColumns;

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: table.name,
      details: `Reordenó el orden de las columnas en la tabla '${table.name}'.`
    });

    await saveDb(db);
    res.json(db);
  });

  // API de Subida de Archivos Corporativos (Imágenes y PDFs)
  app.post("/api/upload", async (req, res) => {
    const db = await loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { files } = req.body; // array of { name: string, base64: string }
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "No se proporcionaron archivos válidos." });
    }

    try {
      const urls: string[] = [];
      const uploadsDir = path.join(process.cwd(), "data", "uploads");

      for (const file of files) {
        let { name, base64 } = file;
        if (!name || !base64) continue;

        // Strip data url prefix if exists: e.g. "data:image/png;base64,"
        if (base64.indexOf(";base64,") !== -1) {
          base64 = base64.split(";base64,").pop() || "";
        }

        const buffer = Buffer.from(base64, "base64");
        // Clean special characters
        const cleanName = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const fileName = `${Date.now()}_${cleanName}`;
        const filePath = path.join(uploadsDir, fileName);

        fs.writeFileSync(filePath, buffer);
        urls.push(`/uploads/${fileName}`);
      }

      res.json({ urls });
    } catch (err: any) {
      console.error("Error al procesar subida de archivo corporativo:", err);
      res.status(500).json({ error: "Error interno al guardar los adjuntos." });
    }
  });

  // Inicialización del Motor Model Context Protocol (MCP) para optimizar interacción con Agentes AI
  setupMcp(app, loadDb, saveDb);

  // Integración de Vite Middleware para Desarrollo
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[NocoClone Server] Corriendo en http://0.0.0.0:${PORT}`);
    // Sincronizar con Postgres al arranque
    loadDb().then(() => {
      console.log("[NocoClone Server] Auto-sincronización con PostgreSQL al arranque completada.");
    }).catch(err => {
      console.error("[NocoClone Server] Error al sincronizar con PostgreSQL al arranque:", err);
    });
  });
}

startServer().catch(err => {
  console.error("Error al iniciar el servidor Express + Vite:", err);
});
