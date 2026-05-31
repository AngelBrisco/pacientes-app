import React, { useEffect, useState } from "react";
import { TableSchema, DbState, ColumnType, AuditLog, UserAccount } from "./types";
import Sidebar from "./components/Sidebar";
import LoginView from "./components/LoginView";
import UserManagementView from "./components/UserManagementView";
import TableView from "./components/TableView";
import KanbanView from "./components/KanbanView";
import DictionaryView from "./components/DictionaryView";
import CalendarView from "./components/CalendarView";
import BackupsView from "./components/BackupsView";
import ApiIntegrationView from "./components/ApiIntegrationView";
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
  Eye,
  Calendar,
  Archive,
  Menu,
  X
} from "lucide-react";

export default function App() {
  const [dbState, setDbState] = useState<DbState | null>(null);
  const [activeTableId, setActiveTableId] = useState<string>("");
  const [activeView, setActiveView] = useState<"table" | "kanban" | "dictionary" | "users" | "backups" | "api">("table");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      return window.innerWidth > 1024;
    } catch {
      return true;
    }
  });

  const handleSelectTable = (tableId: string) => {
    setActiveTableId(tableId);
    if (window.innerWidth <= 1024) {
      setIsSidebarOpen(false);
    }
  };
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
      setError(err.message || "No se pudo conectar con el motor local de base de datos.");
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
      alert(`Fallo de Base de Datos (SQL Execute Reject): ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // CREATE TABLE
  const handleCreateTable = async (name: string, columns?: any[], rows?: any[]) => {
    await apiAction("/api/db/tables", "POST", { name, columns, rows });
  };

  // RECREATE TABLE SCHEMA & DATA
  const handleRecreateTable = async (tableId: string, columns: any[], rows: any[]) => {
    await apiAction(`/api/db/tables/${tableId}/recreate`, "POST", { columns, rows });
  };

  // BACKUPS/SNAPSHOTS HANDLERS
  const handleTakeSnapshot = async (name: string) => {
    await apiAction("/api/db/snapshots", "POST", { name });
  };

  const handleRestoreSnapshot = async (id: string) => {
    await apiAction(`/api/db/snapshots/${id}/restore`, "POST");
  };

  const handleDeleteSnapshot = async (id: string) => {
    await apiAction(`/api/db/snapshots/${id}`, "DELETE");
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

  // EDIT COLUMN
  const handleEditColumn = async (columnId: string, name: string, type: ColumnType, options?: string[], varcharLength?: number) => {
    if (!activeTableId) return;
    await apiAction(`/api/db/tables/${activeTableId}/columns/${columnId}`, "PUT", { name, type, options, varcharLength });
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

  // BULK INSERT ROWS (CSV IMPORT)
  const handleBulkAddRows = async (rowsData: Record<string, any>[]) => {
    if (!activeTableId) return;
    await apiAction(`/api/db/tables/${activeTableId}/bulk-rows`, "POST", rowsData);
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
    <div id="app-root-container" className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans relative">
      
      {/* Mobile backdrop for sidebar */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          id="sidebar-backdrop"
        />
      )}

      {/* Lateral schemas & audit trails control sidebar */}
      <Sidebar
        tables={dbState?.tables || []}
        activeTableId={activeTableId}
        onSelectTable={handleSelectTable}
        onCreateTable={handleCreateTable}
        onDeleteTable={handleDeleteTable}
        logs={dbState?.logs || []}
        readOnly={currentUser.permissions === "read-only"}
        isAdmin={currentUser.role === "admin"}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Studio Console workspace */}
      <main id="workspace-main-panel" className="flex-1 flex flex-col h-full overflow-hidden bg-[#09090b]/40">
        
        {/* Workspace Dynamic Header */}
        <header id="console-header" className="h-16 border-b border-zinc-900 flex items-center justify-between px-4 sm:px-6 shrink-0 bg-[#09090b]/80 backdrop-blur-md gap-4 min-w-0">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
            {/* Sidebar folding Toggle Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 sm:p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800/80 rounded-lg cursor-pointer transition-all flex items-center justify-center hover:text-indigo-455 shrink-0"
              title={isSidebarOpen ? "Plegar barra lateral" : "Mostrar barra lateral"}
              id="btn-toggle-sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Active Table Details with raw schema name hint */}
            <div className="flex flex-col min-w-0 shrink-0" id="header-schema-title">
              <h2 className="text-xs sm:text-sm font-bold text-zinc-200 truncate flex items-center gap-1 sm:gap-2">
                <span className="font-mono text-[10px] sm:text-xs text-indigo-400 font-bold hidden xs:inline">public.</span>
                {activeView === "users" ? "control_de_usuarios" : activeTable ? activeTable.name : "Seleccione Schema"}
              </h2>
              <span className="font-mono text-[8.5px] sm:text-[9.5px] text-zinc-500 uppercase tracking-wider block truncate">
                {activeView === "users" ? "SISTEMA DE PRIVILEGIOS" : activeTable ? `ID FISCO: ${activeTable.id}` : "Esquemas vacíos"}
              </span>
            </div>

            {/* Tab view controllers for Table, Kanban, Dictionary & User Admin */}
            <div className="flex h-16 items-center space-x-2 sm:space-x-4 border-l border-zinc-900 pl-3 sm:pl-5 select-none shrink-0" id="header-views-navbar">
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
                    title="Vista de Tabla SQL"
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tabla</span>
                  </button>

                  <button
                    id="tab-view-kanban"
                    onClick={() => setActiveView("kanban")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "kanban"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                    title="Vista Kanban de Estado"
                  >
                    <Kanban className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Kanban</span>
                  </button>

                  {currentUser.role === "admin" && (
                    <button
                      id="tab-view-dictionary"
                      onClick={() => setActiveView("dictionary")}
                      className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                        activeView === "dictionary"
                          ? "text-indigo-400 border-b-2 border-indigo-500"
                          : "text-zinc-500 hover:text-zinc-300"
                    }`}
                      title="Diccionario DDL de Datos"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Diccionario</span>
                    </button>
                  )}

                  <button
                    id="tab-view-calendar"
                    onClick={() => setActiveView("calendar")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "calendar"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                    title="Vista Calendario"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Calendario</span>
                  </button>

                  <button
                    id="tab-view-api"
                    onClick={() => setActiveView("api")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "api"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-505 hover:text-zinc-300"
                    }`}
                    title="Integración API para n8n"
                  >
                    <Workflow className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Conexión n8n</span>
                  </button>
                </>
              )}

              {currentUser.role === "admin" && (
                <>
                  <button
                    id="tab-view-users"
                    onClick={() => setActiveView("users")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "users"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                    title="Control de Accesos y Privilegios"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Accesos</span>
                  </button>

                  <button
                    id="tab-view-backups"
                    onClick={() => setActiveView("backups")}
                    className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeView === "backups"
                        ? "text-indigo-400 border-b-2 border-indigo-500"
                        : "text-zinc-505 hover:text-zinc-300"
                    }`}
                    title="Copias de Seguridad (Snapshots)"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Copias</span>
                  </button>
                </>
              )}

              {/* Botón Integrado de Sesión de Usuario al final de las pestañas */}
              <div className="border-l border-zinc-800/80 pl-3 sm:pl-4 flex items-center gap-2 shrink-0 select-none" id="header-user-tab-integration">
                <div className="hidden md:flex flex-col text-left text-xs shrink-0 bg-transparent">
                  <span className="font-semibold text-zinc-300 font-sans flex items-center gap-1 leading-none">
                    <ShieldCheck className="w-3 h-3 text-indigo-404 shrink-0" />
                    <span className="truncate max-w-[80px]" title={currentUser.name}>{currentUser.name}</span>
                  </span>
                  <span className="text-[8.5px] font-mono text-zinc-500 uppercase leading-none mt-0.5">
                    {currentUser.role === "admin" ? "Admin" : "User"}
                  </span>
                </div>
                <button
                  id="btn-logout"
                  onClick={handleLogout}
                  className="px-2.5 py-1 bg-zinc-90 w bg-zinc-900 hover:bg-rose-500/10 hover:text-rose-400 text-zinc-400 hover:border-rose-500/20 border border-zinc-800 rounded-lg cursor-pointer transition-all flex items-center gap-1 text-[10.5px]"
                  title="Cerrar sesión de forma segura"
                >
                  <span className="md:hidden text-zinc-350 font-semibold font-sans truncate max-w-[70px]">{currentUser.name}</span>
                  <LogOut className="w-3 h-3 text-zinc-550 shrink-0" />
                  <span className="hidden sm:inline-block">Salir</span>
                </button>
              </div>

            </div>
          </div>

          {/* Sync indicator only */}
          <div className="flex items-center shrink-0" id="header-right-tools">
            {isSyncing && (
              <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-mono font-bold uppercase animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
                <span>Sync...</span>
              </div>
            )}
          </div>
        </header>

        {/* Content body wrapper */}
        <div id="console-body-wrapper" className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-zinc-950/20">
          
          {/* Read Only general warning header */}
          {currentUser.permissions === "read-only" && activeView !== "users" && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex gap-2.5 items-center text-amber-500 text-xs font-sans max-w-4xl mx-auto block" id="readonly-warning-banner">
              <Eye className="w-4 h-4 text-amber-500" />
              <span><strong>Sesión Consulta (Solo Lectura):</strong> Tienes permisos restringidos de Base de Datos. Puedes explorar tablas, Kanban y Diccionarios DDL pero tu rol no está auditado para ejecutar cambios WRITE u operaciones DML (INSERT, UPDATE, DELETE).</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400 max-w-xl mx-auto" id="error-card-display">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-sans font-bold text-xs uppercase">Error de Conexión de Base de Datos</h4>
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
                Estableciendo Conexión Física SQL...
              </p>
            </div>
          ) : activeView === "users" ? (
            <UserManagementView currentUser={currentUser} tables={dbState?.tables || []} />
          ) : activeView === "backups" ? (
            <BackupsView
              snapshots={dbState?.snapshots || []}
              onTakeSnapshot={handleTakeSnapshot}
              onRestoreSnapshot={handleRestoreSnapshot}
              onDeleteSnapshot={handleDeleteSnapshot}
              isSyncing={isSyncing}
            />
          ) : !activeTable ? (
            <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-4" id="view-empty-schema-panel">
              <Server className="w-12 h-12 text-zinc-700" />
              <h3 className="text-zinc-300 font-sans font-bold text-sm">No se cargó ningún Schema en la Base de Datos</h3>
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
                  onBulkAddRows={handleBulkAddRows}
                  onRecreateTable={handleRecreateTable}
                  onUpdateRow={handleUpdateRow}
                  onDeleteRow={handleDeleteRow}
                  readOnly={currentUser.permissions === "read-only"}
                  isAdmin={currentUser.role === "admin"}
                />
              )}

              {activeView === "kanban" && (
                <KanbanView
                  table={activeTable}
                  onUpdateRow={handleUpdateRow}
                  readOnly={currentUser.permissions === "read-only"}
                />
              )}

              {activeView === "dictionary" && currentUser.role === "admin" && (
                <DictionaryView table={activeTable} onEditColumn={handleEditColumn} />
              )}

              {activeView === "calendar" && <CalendarView table={activeTable} />}

              {activeView === "api" && <ApiIntegrationView table={activeTable} />}
            </div>
          )}
        </div>

        {/* Global DDBB Live Console Footer Status bar */}
        {currentUser.role === "admin" && (
          <footer id="console-footer-statusbar" className="h-10 border-t border-zinc-900 bg-[#09090b]/90 px-6 flex items-center justify-between text-[10px] text-zinc-500 shrink-0 select-none">
            <div className="flex gap-4 items-center">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping-once border border-emerald-500/20"></span>
                Container ID: <span className="text-emerald-500 font-mono font-bold">nococlone_app_node_1</span>
              </span>
              <span className="text-zinc-700">|</span>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-zinc-650" /> SQL Core Client Stable
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
        )}

      </main>
    </div>
  );
}
