import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { DbState, TableSchema, AuditLog, Column, Row } from "./src/types";

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
        details: "Creación inicial de tablas y esquemas de prueba (estilo relacional Postgres)."
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
        id: "usr_angel",
        username: "angel",
        name: "Ángel Brisco",
        password: "angel123",
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

function loadDb(): DbState {
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
            id: "usr_angel",
            username: "angel",
            name: "Ángel Brisco",
            password: "angel123",
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
        saveDb(parsed);
      }
      return parsed;
    }
  } catch (error) {
    console.error("Error fatal cargando base de datos, reiniciando:", error);
  }
  const defaultState = getInitialDbState();
  saveDb(defaultState);
  return defaultState;
}

function saveDb(state: DbState) {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("Error al persistir base de datos:", error);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

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

  // API de Login
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "El nombre de usuario y contraseña son estrictamente necesarios." });
    }
    const db = loadDb();
    const user = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase().trim() && u.password === password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas. Por favor, intente nuevamente." });
    }
    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: user.permissions
    });
  });

  // APIs para la administración de usuarios (Solo administrador)
  app.get("/api/users", (req, res) => {
    const db = loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }
    // Retornamos los usuarios desnudando los passwords por seguridad si es necesario,
    // o incluyéndolos para que el admin pueda verlos y editarlos cómodamente.
    res.json(db.users || []);
  });

  app.post("/api/users", (req, res) => {
    const db = loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const { username, name, password, role, permissions } = req.body;
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
      permissions: permissions
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

    saveDb(db);
    res.json(db.users);
  });

  app.put("/api/users/:userId", (req, res) => {
    const { userId } = req.params;
    const db = loadDb();
    const auth = verifyAdminAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const userIdx = db.users?.findIndex(u => u.id === userId);
    if (userIdx === undefined || userIdx === -1) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const targetUser = db.users![userIdx];
    const { name, password, role, permissions } = req.body;

    if (targetUser.username === "admin" && role !== "admin") {
      return res.status(400).json({ error: "No es posible degradar al administrador del sistema principal para no perder acceso." });
    }

    if (name) targetUser.name = name.trim();
    if (password) targetUser.password = password;
    if (role) targetUser.role = role;
    if (permissions) targetUser.permissions = permissions;

    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: auth.user.name,
      action: "SCHEMA_CHANGE",
      tableId: "users",
      tableName: "Control de Accesos",
      details: `Modificó las credenciales/permisos de la cuenta de usuario '${targetUser.name}'.`
    });

    saveDb(db);
    res.json(db.users);
  });

  app.delete("/api/users/:userId", (req, res) => {
    const { userId } = req.params;
    const db = loadDb();
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

    saveDb(db);
    res.json(db.users);
  });

  // Rutas API Primero

  // Obtener estado actual de la DB
  app.get("/api/db", (req, res) => {
    const db = loadDb();
    res.json(db);
  });

  // Restaurar estado de prueba
  app.post("/api/db/reset", (req, res) => {
    const db = loadDb();
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
    saveDb(freshDb);
    res.json(freshDb);
  });

  // Crear una nueva tabla
  app.post("/api/db/tables", (req, res) => {
    const db = loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "El nombre de la tabla es obligatorio." });
    }

    const tableId = "tbl_" + Date.now();
    const newTable: TableSchema = {
      id: tableId,
      name: name.trim(),
      columns: [
        { id: "col_name", name: "Nombre", type: "text" }
      ],
      rows: [
        { id: "row_first", col_name: "Fila de ejemplo" }
      ]
    };

    db.tables.push(newTable);
    db.logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: "SCHEMA_CHANGE",
      tableId: tableId,
      tableName: newTable.name,
      details: `Se creó la tabla '${newTable.name}' con la columna inicial 'Nombre'.`
    });

    saveDb(db);
    res.json(db);
  });

  // Borrar una tabla
  app.delete("/api/db/tables/:tableId", (req, res) => {
    const db = loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId } = req.params;

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

    saveDb(db);
    res.json(db);
  });

  // Agregar una nueva columna a una tabla
  app.post("/api/db/tables/:tableId/columns", (req, res) => {
    const db = loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId } = req.params;
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

    saveDb(db);
    res.json(db);
  });

  // Borrar una columna
  app.delete("/api/db/tables/:tableId/columns/:columnId", (req, res) => {
    const db = loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId, columnId } = req.params;

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

    saveDb(db);
    res.json(db);
  });

  // Crear una nueva fila
  app.post("/api/db/tables/:tableId/rows", (req, res) => {
    const db = loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId } = req.params;
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

    saveDb(db);
    res.json(db);
  });

  // Actualizar una fila
  app.put("/api/db/tables/:tableId/rows/:rowId", (req, res) => {
    const db = loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId, rowId } = req.params;
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
      saveDb(db);
    }

    res.json(db);
  });

  // Eliminar una fila
  app.delete("/api/db/tables/:tableId/rows/:rowId", (req, res) => {
    const db = loadDb();
    const auth = verifyWriteAccess(req, db);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }

    const currentUser = auth.user.name;
    const { tableId, rowId } = req.params;

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

    saveDb(db);
    res.json(db);
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
  });
}

startServer().catch(err => {
  console.error("Error al iniciar el servidor Express + Vite:", err);
});
