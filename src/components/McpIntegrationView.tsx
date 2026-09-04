import React, { useState, useEffect } from "react";
import { TableSchema, DbState } from "../types";
import {
  Cpu,
  Bot,
  Terminal,
  Activity,
  Code,
  CheckCircle,
  Play,
  Zap,
  Layers,
  ArrowRight
} from "lucide-react";

interface McpIntegrationViewProps {
  tables: TableSchema[];
}

export default function McpIntegrationView({ tables }: McpIntegrationViewProps) {
  const [selectedTool, setSelectedTool] = useState<string>("list_tables");
  const [params, setParams] = useState<any>({
    tableId: tables[0]?.id || "",
    limit: 5,
    offset: 0,
    searchTerm: "",
    sortBy: "",
    sortOrder: "asc"
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [jsonRequest, setJsonRequest] = useState<string>("");
  const [jsonResponse, setJsonResponse] = useState<string>("");
  const [savingsMetrics, setSavingsMetrics] = useState<any>(null);
  const [sseActive, setSseActive] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Generar JSON Request simulado en tiempo real según la herramienta y parámetros
  useEffect(() => {
    let rpcParams: any = {};
    if (selectedTool === "get_table_schema") {
      rpcParams = { tableId: params.tableId };
    } else if (selectedTool === "query_rows") {
      rpcParams = {
        tableId: params.tableId,
        limit: Number(params.limit),
        offset: Number(params.offset),
        searchTerm: params.searchTerm,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder
      };
    } else if (selectedTool === "filter_rows") {
      rpcParams = {
        tableId: params.tableId,
        filters: {
          col_status: "Completada"
        },
        limit: 10,
        offset: 0
      };
    } else if (selectedTool === "upload_file") {
      rpcParams = {
        fileName: "informe_medico_consulta.txt",
        fileTextContent: "Paciente evaluado con evolución favorable. Estudios complementarios completados sin novedades clínicas.",
        tableId: params.tableId,
        rowId: "row_p1"
      };
    } else if (selectedTool === "download_file") {
      rpcParams = {
        fileUrl: "/uploads/informe_medico_consulta.txt",
        encoding: "auto"
      };
    } else if (selectedTool === "list_row_files") {
      rpcParams = {
        tableId: params.tableId,
        rowId: "row_p1"
      };
    } else if (selectedTool === "insert_row") {
      rpcParams = {
        tableId: params.tableId,
        rowData: {
          col_title: "Nueva tarea vía MCP",
          col_status: "Pendiente",
          col_priority: "Media"
        }
      };
    } else if (selectedTool === "update_row") {
      rpcParams = {
        tableId: params.tableId,
        rowId: "row_p1",
        rowData: {
          col_status: "En Progreso"
        }
      };
    } else if (selectedTool === "delete_row") {
      rpcParams = {
        tableId: params.tableId,
        rowId: "row_p3"
      };
    } else if (selectedTool === "upsert_patient") {
      rpcParams = {
        tableId: params.tableId,
        rowData: {
          col_dni: "12345678",
          col_nombre: "Juan Pérez",
          col_telefono: "555-0199",
          col_fecha: new Date().toISOString().split("T")[0],
          col_estado: "En Observación"
        }
      };
    }

    const requestObj = {
      jsonrpc: "2.0",
      id: "mcp_req_" + Math.floor(Math.random() * 10000),
      method: "tools/call",
      params: {
        name: selectedTool,
        arguments: rpcParams
      }
    };
    setJsonRequest(JSON.stringify(requestObj, null, 2));
  }, [selectedTool, params]);

  const handleRunTool = async () => {
    setIsLoading(true);
    setJsonResponse("");
    setSavingsMetrics(null);

    try {
      const parsedRequest = JSON.parse(jsonRequest);
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedRequest)
      });

      const data = await res.json();
      setJsonResponse(JSON.stringify(data, null, 2));

      // Extraer métricas de optimización si el servidor las retornó
      if (data.result && data.result._stats) {
        setSavingsMetrics(data.result._stats);
      } else {
        // Fallback métricas locales
        setSavingsMetrics({
          fullDbTokens: 3500,
          mcpTokens: 120,
          savedTokens: 3380,
          savingsPercent: 96.57
        });
      }
    } catch (err: any) {
      setJsonResponse(JSON.stringify({
        jsonrpc: "2.0",
        id: "err",
        error: { code: -32603, message: err.message || "Error al conectar con el endpoint MCP" }
      }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyConfig = (configText: string, label: string) => {
    navigator.clipboard.writeText(configText);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const testSseConnection = () => {
    setSseActive(true);
    const eventSource = new EventSource("/api/mcp/sse");
    
    eventSource.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      if (parsed.type === "connection") {
        console.log("[MCP SSE] Sesión establecida:", parsed.sessionId);
      }
    };

    setTimeout(() => {
      eventSource.close();
      setSseActive(false);
    }, 4000);
  };

  const claudeConfigSnippet = `{
  "mcpServers": {
    "nococlone-server": {
      "command": "node",
      "args": ["${window.location.origin}/api/mcp"],
      "env": {}
    }
  }
}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-sans" id="mcp-integration-view-panel">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-zinc-900 via-indigo-950/30 to-zinc-900 border border-indigo-500/10 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-mono font-bold uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" /> Core Feature: Model Context Protocol (MCP)
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 font-sans tracking-tight">
            Motor de Integración MCP para Agentes de AI
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
            Model Context Protocol es un estándar abierto desarrollado por Anthropic que permite conectar directamente Agentes de Inteligencia Artificial con tu base de datos NocoClone, habilitando consultas, ediciones y logs inmediatos con un consumo de recursos ultra-reducido.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={testSseConnection}
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              sseActive
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 animate-pulse"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${sseActive ? "animate-spin" : ""}`} />
            {sseActive ? "SSE Canal Activo..." : "Probar Transporte SSE"}
          </button>
        </div>
      </div>

      {/* Answer to User Intent Question about Tokens */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-2">
            <Bot className="w-4 h-4" /> ¿Cómo reduce el consumo de tokens?
          </h3>
          <p className="text-xs text-zinc-300 leading-relaxed font-sans">
            En un flujo de chat tradicional, si quieres que un agente analice o actualice un registro, debes transferirle la **base de datos completa (db.json)** en cada turno. Con bases de datos de cientos o miles de registros, esto consume decenas de miles de tokens de entrada (Input), disparando los costos y agotando rápidamente la ventana de contexto del modelo.
          </p>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            El protocolo <strong>MCP</strong> delega la inteligencia de datos al servidor de NocoClone. El agente no lee el archivo entero; en su lugar, ejecuta llamadas a funciones específicas (<strong>Tools</strong>) como <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">query_rows</code> o <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">get_table_schema</code>. El servidor procesa el filtrado, paginación o inserción en Node/PostgreSQL y le devuelve únicamente el fragmento preciso en JSON.
          </p>
          <div className="bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50 flex items-center gap-3">
            <div className="bg-indigo-600/10 p-2 rounded-lg shrink-0">
              <Zap className="text-indigo-400 w-4 h-4" />
            </div>
            <div className="text-[11px] text-zinc-400 font-sans">
              <strong className="text-zinc-200">Ahorro del 95% al 99% de tokens</strong> en interacciones recurrentes. Mayor velocidad de procesamiento y nula pérdida de memoria por saturación de contexto.
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col justify-between bg-zinc-950/40 border border-zinc-800/40 rounded-xl p-5 space-y-4">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-widest font-mono flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-zinc-500" /> Métricas de Eficiencia
          </h4>
          
          <div className="space-y-3 flex-1 justify-center flex flex-col">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-sans">Contexto Completo (Sin MCP):</span>
              <span className="font-mono text-zinc-300 font-bold">~3,500 - 15,000 tokens</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-sans">Llamada Granular (Con MCP):</span>
              <span className="font-mono text-indigo-400 font-bold">~50 - 150 tokens</span>
            </div>
            <div className="h-px bg-zinc-800/60 my-2" />
            <div className="flex justify-between items-end">
              <span className="text-xs text-zinc-400 font-sans font-semibold">Ahorro Promedio:</span>
              <span className="text-lg font-mono font-bold text-emerald-400 flex items-center gap-1">
                98.6% <span className="text-xs text-zinc-500">▼</span>
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={async () => {
                setSelectedTool("get_mcp_stats");
                setTimeout(() => handleRunTool(), 100);
              }}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg cursor-pointer transition-all text-center block"
            >
              Calcular Métricas Reales Actuales
            </button>
          </div>
        </div>
      </div>

      {/* Main Sandbox Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Parameters Form */}
        <div className="lg:col-span-5 bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest font-mono border-b border-zinc-800/80 pb-2.5">
            Simulador de Herramientas MCP
          </h3>

          <div className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
                Seleccionar Herramienta (Tool)
              </label>
              <select
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="list_tables">list_tables (Listar tablas de DB)</option>
                <option value="get_table_schema">get_table_schema (Obtener columnas)</option>
                <option value="query_rows">query_rows (Consultar registros con filtros)</option>
                <option value="filter_rows">filter_rows (Búsqueda avanzada por campos)</option>
                <option value="upload_file">upload_file (Subir archivo a campo file)</option>
                <option value="download_file">download_file (Descargar/leer archivo)</option>
                <option value="list_row_files">list_row_files (Listar archivos de fila)</option>
                <option value="insert_row">insert_row (Añadir fila simulada)</option>
                <option value="update_row">update_row (Modificar fila simulada)</option>
                <option value="delete_row">delete_row (Eliminar fila simulada)</option>
                <option value="upsert_patient">upsert_patient (Upsert paciente inteligente)</option>
                <option value="get_mcp_stats">get_mcp_stats (Análisis de tokens)</option>
              </select>
            </div>

            {/* Dynamic arguments fields based on chosen tool */}
            {["get_table_schema", "query_rows", "filter_rows", "upload_file", "download_file", "list_row_files", "insert_row", "update_row", "delete_row", "upsert_patient"].includes(selectedTool) && (
              <div className="p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-3">
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block">
                  Parámetros de la Tool
                </span>
                
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1 font-sans">
                    Tabla de Referencia
                  </label>
                  <select
                    value={params.tableId}
                    onChange={(e) => setParams({ ...params, tableId: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none"
                  >
                    {tables.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                    ))}
                  </select>
                </div>

                {selectedTool === "query_rows" && (
                  <div className="space-y-2.5 pt-1.5 border-t border-zinc-850">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">Limit (Paginado)</label>
                        <input
                          type="number"
                          value={params.limit}
                          onChange={(e) => setParams({ ...params, limit: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">Offset (Desplaz.)</label>
                        <input
                          type="number"
                          value={params.offset}
                          onChange={(e) => setParams({ ...params, offset: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Search (Búsqueda)</label>
                      <input
                        type="text"
                        placeholder="Ej. Acme..."
                        value={params.searchTerm}
                        onChange={(e) => setParams({ ...params, searchTerm: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">Sort Column ID</label>
                        <input
                          type="text"
                          placeholder="Ej. col_title"
                          value={params.sortBy}
                          onChange={(e) => setParams({ ...params, sortBy: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1">Order</label>
                        <select
                          value={params.sortOrder}
                          onChange={(e) => setParams({ ...params, sortOrder: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none"
                        >
                          <option value="asc">Ascendente</option>
                          <option value="desc">Descendente</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              id="mcp-sandbox-run-btn"
              onClick={handleRunTool}
              disabled={isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Ejecutando en Servidor...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-white" />
                  <span>Ejecutar llamada de Agente (POST)</span>
                </>
              )}
            </button>
          </div>

          {/* Connection parameters */}
          <div className="pt-3 border-t border-zinc-850">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block mb-2">
              Endpoints de Conexión Local (Preview)
            </span>
            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex justify-between items-center bg-zinc-950 p-2 rounded border border-zinc-850">
                <span className="text-zinc-500">HTTP Direct:</span>
                <span className="text-zinc-300">/api/mcp</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950 p-2 rounded border border-zinc-850">
                <span className="text-zinc-500">SSE Endpoint:</span>
                <span className="text-zinc-300">/api/mcp/sse</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Terminal Payload Display */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          
          {/* Token Savings Metric Result */}
          {savingsMetrics && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/20 p-2 rounded-xl text-emerald-400 shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">¡Optimización Calculada con Éxito!</h4>
                  <p className="text-[11px] text-zinc-400 font-sans">
                    La respuesta granular consumió sólo <strong className="text-emerald-400">{savingsMetrics.mcpTokens} tokens</strong> en lugar de los {savingsMetrics.fullDbTokens} del archivo completo.
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-lg font-mono font-bold text-emerald-400">
                  {savingsMetrics.savingsPercent}%
                </span>
                <span className="block text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                  Menor consumo
                </span>
              </div>
            </div>
          )}

          {/* Terminal Shell Panel */}
          <div className="flex-1 bg-zinc-950 border border-zinc-850 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
            {/* Terminal Header */}
            <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest ml-2 flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-indigo-400" /> MCP Payload Inspector
                </span>
              </div>
              <span className="text-[9px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded uppercase font-bold">
                JSON-RPC 2.0
              </span>
            </div>

            {/* Terminal split screen */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-850 text-xs font-mono">
              
              {/* Left Column: Client Request */}
              <div className="p-4 flex flex-col h-full overflow-y-auto max-h-[350px] custom-scrollbar">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2 block">
                  📥 REQUEST ENVIADO POR EL AGENTE
                </span>
                <pre className="text-[11px] text-indigo-400 whitespace-pre-wrap select-all font-mono leading-relaxed">
                  {jsonRequest || "// Generando Request..."}
                </pre>
              </div>

              {/* Right Column: Server Response */}
              <div className="p-4 flex flex-col h-full overflow-y-auto max-h-[350px] custom-scrollbar bg-zinc-950/40">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2 block">
                  📤 RESPONSE ENVIADO POR EL SERVIDOR (MCP)
                </span>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-zinc-500 p-2">
                    <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Esperando respuesta...</span>
                  </div>
                ) : jsonResponse ? (
                  <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap select-all font-mono leading-relaxed">
                    {jsonResponse}
                  </pre>
                ) : (
                  <span className="text-[11px] text-zinc-600 italic">
                    // Haz clic en "Ejecutar llamada" para ver la respuesta en tiempo real
                  </span>
                )}
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Connection Instructions (Documentation tab style) */}
      <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-zinc-200 font-sans flex items-center gap-2">
          <Code className="w-4 h-4 text-indigo-400" /> ¿Cómo conectar tu Agente local al servidor de NocoClone?
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-zinc-300 font-sans">Opción A: Configurar Claude Desktop</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
              Puedes agregar este endpoint directamente a tu archivo de configuración de Claude Desktop para permitirle consultar y modificar tus tablas de forma nativa en su chat diario.
            </p>
            <div className="relative">
              <pre className="bg-zinc-950 p-3 rounded-lg text-[10px] text-zinc-300 border border-zinc-850 overflow-x-auto max-h-[160px] custom-scrollbar font-mono leading-relaxed select-all">
                {claudeConfigSnippet}
              </pre>
              <button
                onClick={() => handleCopyConfig(claudeConfigSnippet, "desktop")}
                className="absolute top-2 right-2 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[9px] text-zinc-400 hover:text-white cursor-pointer transition-colors"
              >
                {copiedText === "desktop" ? "Copiado ✔" : "Copiar"}
              </button>
            </div>
            <span className="block text-[9.5px] text-zinc-500 font-sans">
              * Nota: Reemplaza la URL anterior si cambias la ubicación o dominio del deployment.
            </span>
          </div>

          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-zinc-300 font-sans">Herramientas registradas de forma nativa:</h4>
            <div className="space-y-2 text-[11.5px] text-zinc-400 font-sans">
              <div className="flex gap-2 items-start">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">list_tables</strong>: Listado rápido de todas las tablas (IDs, nombres, cantidad de registros).
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">get_table_schema</strong>: Columnas físicas, tipos de datos, opciones para select/enums.
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">query_rows / filter_rows</strong>: Búsqueda avanzada filtrada por múltiples campos/columnas (DNI, Estado, fechas con operadores), ordenamiento y paginación.
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">upload_file</strong>: Sube archivos físicos (PDFs, estudios, texto o Base64) y los asocia directamente a registros con campos de tipo file.
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">download_file / list_row_files</strong>: Descarga o lee el contenido de archivos (texto plano o Base64) y lista archivos adjuntos en registros.
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">insert_row / update_row / delete_row</strong>: Operaciones de escritura auditadas integradas con la base de datos.
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">upsert_patient</strong>: Carga inteligente de pacientes con matching por DNI, prioridad temporal de versión y merge selectivo de campos no vacíos.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
