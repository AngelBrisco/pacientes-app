import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { DbState, TableSchema, AuditLog, Column, Row } from "./src/types";
import dotenv from "dotenv";
import pg from "pg";

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
    ]
  };
}

async function loadDb(): Promise<DbState> {
  try {
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
      tables: JSON.parse(JSON.stringify(db.tables))
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

    db.tables = JSON.parse(JSON.stringify(snapshot.tables));

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "*",
      tableName: "Base de Datos",
      details: `Se restauró la base de datos a la copia de seguridad (Snapshot) '${snapshot.name}' creada el ${new Date(snapshot.timestamp).toLocaleString()}.`
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
