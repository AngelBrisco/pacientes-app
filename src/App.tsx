import React, { useEffect, useState } from "react";
import { TableSchema, DbState, ColumnType, AuditLog, UserAccount } from "./types";
import Sidebar from "./components/Sidebar";
import LoginView from "./components/LoginView";
import UserManagementView from "./components/UserManagementView";
import TableView from "./components/TableView";
import KanbanView from "./components/KanbanView";
import DictionaryView from "./components/DictionaryView";
import {
  Table,
  Kanban,
  BookOpen,
  RefreshCw,
  Server,
  Workflow,
  AlertCircle,
  Clock,
  Terminal,
  Activity,
  Users,
  LogOut,
  ShieldCheck,
  Eye
} from "lucide-react";

export default function App() {
  const [dbState, setDbState] = useState<DbState | null>(null);
  const [activeTableId, setActiveTableId] = useState<string>("");
  const [activeView, setActiveView] = useState<"table" | "kanban" | "dictionary" | "users">("table");
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const stored = localStorage.getItem("nococlone_session");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const handleLoginSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    localStorage.setItem("nococlone_session", JSON.stringify(user));
    // Reset view to default
    setActiveView("table");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("nococlone_session");
  };

  // Sync DB from server
  const fetchDb = async (background = false) => {
    if (!currentUser) return;
    if (!background) setLoading(true);
    try {
      const res = await fetch("/api/db");
      if (!res.ok) throw new Error("Error al consultar la base de datos.");
      const data: DbState = await res.json();
      setDbState(data);

      // Automatically select first table if no active table is set or if active table doesn't exist
      if (data.tables.length > 0) {
        if (!activeTableId || !data.tables.some((t) => t.id === activeTableId)) {
          setActiveTableId(data.tables[0].id);
        }
      } else {
        setActiveTableId("");
      }
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo conectar con el motor local base de datos Postgres.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchDb();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  // API wrappers to coordinate endpoints with headers proxy
  const apiAction = async (url: string, method: string, body?: any) => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-user-username": currentUser.username,
      };

      const options: RequestInit = {
        method,
        headers,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(url, options);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Operación de base de datos fallida.");
      }

      const updatedDb: DbState = await res.json();
      setDbState(updatedDb);

      // Preserve active table safety
      if (updatedDb.tables.length > 0) {
        if (!activeTableId || !updatedDb.tables.some((t) => t.id === activeTableId)) {
          setActiveTableId(updatedDb.tables[0].id);
        }
      } else {
        setActiveTableId("");
      }
      setError(null);
    } catch (err: any) {
      console.error(err);
      alert(`Fallo en Postgres (SQL Execute Reject): ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // CREATE TABLE
  const handleCreateTable = async (name: string) => {
    await apiAction("/api/db/tables", "POST", { name });
  };

  // DELETE TABLE
  const handleDeleteTable = async (tableId: string) => {
    await apiAction(`/api/db/tables/${tableId}`, "DELETE");
  };

  // ADD COLUMN
  const handleAddColumn = async (name: string, type: ColumnType, options?: string[]) => {
    if (!activeTableId) return;
    await apiAction(`/api/db/tables/${activeTableId}/columns`, "POST", { name, type, options });
  };

  // DELETE COLUMN
  const handleDeleteColumn = async (columnId: string) => {
    if (!activeTableId) return;
    await apiAction(`/api/db/tables/${activeTableId}/columns/${columnId}`, "DELETE");
  };

  // ADD ROW (INSERT)
  const handleAddRow = async (rowData: Record<string, any>) => {
    if (!activeTableId) return;
    await apiAction(`/api/db/tables/${activeTableId}/rows`, "POST", rowData);
  };

  // UPDATE ROW (UPDATE)
  const handleUpdateRow = async (rowId: string, rowData: Record<string, any>) => {
    if (!activeTableId) return;
    await apiAction(`/api/db/tables/${activeTableId}/rows/${rowId}`, "PUT", rowData);
  };

  // DELETE ROW (DELETE)
  const handleDeleteRow = async (rowId: string) => {
    if (!activeTableId) return;
    await apiAction(`/api/db/tables/${activeTableId}/rows/${rowId}`, "DELETE");
  };

  // RESET TO DEFAULT FACTORY PRESETS
  const handleResetDb = async () => {
    if (confirm("¿Proceder con la restauración de fábrica? Esto volverá a construir los schemas iniciales 'Tareas de Ingeniería' y 'Cartera de Clientes' sobreescibiendo cambios actuales.")) {
      await apiAction("/api/db/reset", "POST");
    }
  };

  if (!currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // Selected table schema lookup
  const activeTable = dbState?.tables?.find((t) => t.id === activeTableId) || null;

  return (
    <div id="app-root-container" className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      
      {/* Lateral Postgres schemas & audit trails control sidebar */}
      <Sidebar
        tables={dbState?.tables || []}
        activeTableId={activeTableId}
        onSelectTable={setActiveTableId}
        onCreateTable={handleCreateTable}
        onDeleteTable={handleDeleteTable}
        logs={dbState?.logs || []}
        readOnly={currentUser.permissions === "read-only"}
      />

      {/* Main Studio Console workspace */}
      <main id="workspace-main-panel" className="flex-1 flex flex-col h-full overflow-hidden bg-[#09090b]/40">
        
        {/* Workspace Dynamic Header */}
        <header id="console-header" className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 shrink-0 bg-[#09090b]/80 backdrop-blur-md">
          <div className="flex items-center gap-8 min-w-0">
            {/* Active Table Details with raw schema name hint */}
            <div className="flex flex-col min-w-0" id="header-schema-title">
              <h2 className="text-sm font-bold text-zinc-200 truncate flex items-center gap-2">
                <span className="font-mono text-xs text-indigo-400 font-bold">public.</span>
                {activeView === "users" ? "control_de_usuarios" : activeTable ? activeTable.name : "Seleccione un Schema"}
              </h2>
              <span className="font-mono text-[9.5px] text-zinc-500 uppercase tracking-wider block truncate">
                {activeView === "users" ? "SISTEMA DE PRIVILEGIOS POSTGRES" : activeTable ? `ID FISICO: ${activeTable.id}` : "Esquemas vacíos"}
              </span>
            </div>

            {/* Tab view controllers for Table, Kanban, Dictionary & User Admin */}
            <div className="flex h-16 items-center space-x-6 border-l border-zinc-900 pl-8 select-none shrink-0" id="header-views-navbar">
              {activeTable && (
                <>
                  <button
                    id="tab-view-table"
                    onClick={() => setActiveView("table")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "table"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Tabla DDL</span>
                  </button>

                  <button
                    id="tab-view-kanban"
                    onClick={() => setActiveView("kanban")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "kanban"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Kanban className="w-3.5 h-3.5" />
                    <span>Kanban</span>
                  </button>

                  <button
                    id="tab-view-dictionary"
                    onClick={() => setActiveView("dictionary")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "dictionary"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Diccionario (DDL)</span>
                  </button>
                </>
              )}

              {currentUser.role === "admin" && (
                <button
                  id="tab-view-users"
                  onClick={() => setActiveView("users")}
                  className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeView === "users"
                      ? "text-indigo-400 border-b-2 border-indigo-500"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Control de Accesos</span>
                </button>
              )}
            </div>
          </div>

          {/* User session avatar console & sync loader */}
          <div className="flex items-center gap-4 shrink-0" id="header-right-tools">
            {/* Sync trigger Indicator */}
            {isSyncing && (
              <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-mono font-bold uppercase animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
                <span>Syncing SQL...</span>
              </div>
            )}
            
            {/* Active User session details card */}
            <div className="flex items-center gap-4 bg-zinc-900/60 border border-zinc-800/80 px-3 py-1.5 rounded-xl text-xs shrink-0 select-none">
              <div className="flex flex-col text-left">
                <span className="font-semibold text-zinc-200 font-sans flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate max-w-[110px]" title={currentUser.name}>{currentUser.name}</span>
                </span>
                <span className="text-[9.5px] font-mono text-zinc-500 uppercase flex items-center gap-1 leading-none mt-0.5">
                  {currentUser.role === "admin" ? "Administrador" : "Usuario"} • {currentUser.permissions === "read-write" ? "Escritura (Postgres)" : "Sólo Lectura"}
                </span>
              </div>
              <button
                id="btn-logout"
                onClick={handleLogout}
                className="p-1 px-2.5 bg-zinc-800 hover:bg-rose-500/10 hover:text-rose-400 text-zinc-400 border border-zinc-700/60 hover:border-rose-500/20 rounded-lg cursor-pointer transition-all flex items-center gap-1 font-semibold text-[11px]"
                title="Cerrar sesión de forma segura"
              >
                <LogOut className="w-3 h-3" />
                <span>Salir</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content body wrapper */}
        <div id="console-body-wrapper" className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-zinc-950/20">
          
          {/* Read Only general warning header */}
          {currentUser.permissions === "read-only" && activeView !== "users" && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex gap-2.5 items-center text-amber-500 text-xs font-sans max-w-4xl mx-auto block" id="readonly-warning-banner">
              <Eye className="w-4 h-4 text-amber-500" />
              <span><strong>Sesión Consulta (Solo Lectura):</strong> Tienes permisos restringidos de PostgreSQL. Puedes explorar tablas, Kanban y Diccionarios DDL pero tu rol no está auditado para ejecutar cambios WRITE u operaciones DML (INSERT, UPDATE, DELETE).</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400 max-w-xl mx-auto" id="error-card-display">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-sans font-bold text-xs uppercase">Error de Conexión Postgres</h4>
                <p className="text-xs font-sans text-zinc-400 leading-relaxed">{error}</p>
                <button
                  onClick={() => fetchDb()}
                  className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer underline block"
                >
                  Volver a intentar conexión física
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4" id="view-loading-panel">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest font-bold animate-pulse">
                Estableciendo Conexión Física Postgres...
              </p>
            </div>
          ) : activeView === "users" ? (
            <UserManagementView currentUser={currentUser} />
          ) : !activeTable ? (
            <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-4" id="view-empty-schema-panel">
              <Server className="w-12 h-12 text-zinc-700" />
              <h3 className="text-zinc-300 font-sans font-bold text-sm">No se cargó ningún Schema en Postgres</h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                Para comenzar a estructurar tu base de datos relacional style NocoDB, crea una nueva tabla desde el panel izquierdo o haz clic para restaurar presets.
              </p>
              {currentUser.permissions === "read-write" && (
                <button
                  onClick={handleResetDb}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all shadow-md"
                  id="btn-recover-initial-schemas"
                >
                  Cargar Presets de Base de Datos
                </button>
              )}
            </div>
          ) : (
            <div id="dynamic-component-view-renderer">
              {activeView === "table" && (
                <TableView
                  table={activeTable}
                  onAddColumn={handleAddColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onAddRow={handleAddRow}
                  onUpdateRow={handleUpdateRow}
                  onDeleteRow={handleDeleteRow}
                  readOnly={currentUser.permissions === "read-only"}
                />
              )}

              {activeView === "kanban" && (
                <KanbanView
                  table={activeTable}
                  onUpdateRow={handleUpdateRow}
                  readOnly={currentUser.permissions === "read-only"}
                />
              )}

              {activeView === "dictionary" && <DictionaryView table={activeTable} />}
            </div>
          )}
        </div>

        {/* Global DDBB Live Console Footer Status bar */}
        <footer id="console-footer-statusbar" className="h-10 border-t border-zinc-900 bg-[#09090b]/90 px-6 flex items-center justify-between text-[10px] text-zinc-500 shrink-0 select-none">
          <div className="flex gap-4 items-center">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping-once border border-emerald-500/20"></span>
              Container ID: <span className="text-emerald-500 font-mono font-bold">nococlone_app_node_1</span>
            </span>
            <span className="text-zinc-700">|</span>
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-zinc-650" /> Postgres Core Client Stable
            </span>
          </div>

          <div className="flex items-center gap-5">
            {currentUser.permissions === "read-write" && (
              <button
                onClick={handleResetDb}
                className="text-[10px] font-mono font-bold text-zinc-400 hover:text-indigo-400 transition-all cursor-pointer bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5"
                title="Restaurar toda la BD relacional"
                id="btn-bottom-restore-preset"
              >
                🔄 Rebuild DB Preset
              </button>
            )}
            <span className="text-zinc-700 animate-pulse select-none">•</span>
            <span className="font-mono text-indigo-400/80 uppercase font-semibold">Local v1.0.4-stable</span>
          </div>
        </footer>

      </main>
    </div>
  );
}
