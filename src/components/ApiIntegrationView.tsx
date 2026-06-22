import React, { useState } from "react";
import { TableSchema, Column } from "../types";
import { 
  Terminal, Code2, Check, Copy, Cpu, Database, 
  ArrowRight, ShieldCheck, Zap, AlertTriangle, FileJson, Link, Send,
  Cpu as Bot, BookOpen, Layers, Eye, RefreshCw, Smartphone
} from "lucide-react";

interface ApiIntegrationViewProps {
  table: TableSchema;
}

export default function ApiIntegrationView({ table }: ApiIntegrationViewProps) {
  const [copiedText, setCopiedText] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"get_list" | "get_item" | "post" | "patch" | "delete">("get_list");
  const [activePlaygroundTab, setActivePlaygroundTab] = useState<"http" | "agent">("http");

  const baseUrl = window.location.origin;
  
  // Clean name helper
  const sanitizeName = (name: string): string => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/__+/g, "_")
      .trim()
      .replace(/^_+|_+$/g, "");
  };

  const getTableNameForApi = () => {
    return sanitizeName(table.name);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(""), 2000);
  };

  // La columna identificadora principal es la primera columna de la tabla (índice 0, ej: "Documento" o "Número de cliente")
  const primaryCol = table.columns?.[0];
  const primaryColName = primaryCol ? primaryCol.name : "id";

  // Find a column named 'key' (fallback)
  const keyCol = table.columns.find(c => 
    c.name.toLowerCase() === "key" || 
    c.id.toLowerCase() === "key" || 
    sanitizeName(c.name) === "key"
  );

  // Generate mock body for POST/PATCH based on columns
  const getMockBody = () => {
    const mock: Record<string, any> = {};
    table.columns.forEach(col => {
      if (col.id === "id") return;
      const cleanColName = sanitizeName(col.name);
      
      if (col.type === "number") {
        mock[cleanColName] = 42;
      } else if (col.type === "boolean") {
        mock[cleanColName] = true;
      } else if (col.type === "date") {
        mock[cleanColName] = new Date().toISOString().split("T")[0];
      } else if (col.type === "select") {
        mock[cleanColName] = col.options?.[0] || "Opción";
      } else if (col.type === "file") {
        mock[cleanColName] = ["https://url-del-archivo.pdf"];
      } else {
        if (cleanColName === "key") {
          mock[cleanColName] = "PAC-001";
        } else {
          mock[cleanColName] = `Ejemplo ${col.name}`;
        }
      }
    });
    return JSON.stringify(mock, null, 2);
  };

  // Generate mock response list
  const getMockGetResponse = () => {
    const mockRow: Record<string, any> = { id: "row_1780268347231_example" };
    table.columns.forEach(col => {
      if (col.type === "number") {
        mockRow[col.name] = 17207579;
      } else if (col.type === "boolean") {
        mockRow[col.name] = false;
      } else if (col.type === "date") {
        mockRow[col.name] = "2026-06-15";
      } else if (col.type === "select") {
        const val = col.options?.[0] || "Pami";
        mockRow[col.name] = val;
      } else if (col.type === "file") {
        mockRow[col.name] = [];
      } else {
        if (sanitizeName(col.name) === "key") {
          mockRow[col.name] = "PAC-001";
        } else {
          mockRow[col.name] = col.name === "Nombre" ? "Martinez Rufina" : `Ejemplo para ${col.name}`;
        }
      }
    });

    return JSON.stringify({
      list: [mockRow],
      pageInfo: {
        totalRows: table.rows?.length || 40,
        page: 1,
        pageSize: 1000,
        isFirstPage: true,
        isLastPage: true
      }
    }, null, 2);
  };

  // Get active row response example
  const getMockGetItemResponse = () => {
    const mockRow: Record<string, any> = { id: "row_1780268347231_example" };
    table.columns.forEach(col => {
      if (col.type === "number") {
        mockRow[col.name] = 17207579;
      } else if (col.type === "boolean") {
        mockRow[col.name] = true;
      } else if (col.type === "date") {
        mockRow[col.name] = "2026-06-22";
      } else if (col.type === "select") {
        mockRow[col.name] = col.options?.[0] || "Pami";
      } else if (col.type === "file") {
        mockRow[col.name] = [];
      } else {
        if (sanitizeName(col.name) === "key") {
          mockRow[col.name] = "PAC-001";
        } else {
          mockRow[col.name] = col.name === "Nombre" ? "Martinez Rufina" : `Ejemplo para ${col.name}`;
        }
      }
    });

    return JSON.stringify(mockRow, null, 2);
  };

  const getMethodColor = (method: string) => {
    switch (method.toLowerCase()) {
      case "get_list": return "text-sky-400 bg-sky-500/10 border-sky-500/20";
      case "get_item": return "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
      case "post": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "patch": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "delete": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  const getMethodName = (method: string) => {
    if (method === "get_list") return "GET (Colección)";
    if (method === "get_item") return "GET (Un Registro)";
    return method.toUpperCase();
  };

  // AI Agent System Prompt Generator
  const generateAgentPrompt = () => {
    const columnsDescription = table.columns.map(c => `- ${c.name} (${c.type}${c.options ? `: ${c.options.join(", ")}` : ""})`).join("\r\n");
    const primaryName = table.columns[0]?.name || "id";
    const exampleVal = table.rows[0]?.[table.columns[0]?.id] || "VAL_EJEMPLO";
    
    return `### CONTEXTO DE INTEGRACIÓN AI CO-PILOT
Estás interactuando en tiempo real con la Base de Datos NocoClone llamada "nococlone".
Tu objetivo es realizar consultas, inserciones, actualizaciones o eliminaciones en la tabla actual de forma segura.

#### INFORMACIÓN DE LA TABLA
- **Nombre de la tabla**: "${table.name}" (Slug de API: "${getTableNameForApi()}")
- **Columna Identificadora Principal (Airtable-style Primary Column)**: "${primaryName}" (Cualquier búsqueda buscará automáticamente de forma inteligente en esta columna)
- **Columnas Disponibles**:
${columnsDescription}

#### ENDPOINTS REST DISPONIBLES (Base URL: ${baseUrl})

1. **Listar filas (GET)**:
   \`GET /api/v1/db/data/v1/nococlone/${getTableNameForApi()}?view=human\`
   *Recomendación*: Utiliza el parámetro \`?view=human\` para obtener los registros con las claves exactas de columnas (ej: "Nombre", "Patología"), lo cual facilita su procesamiento.

2. **Obtener un registro individual (GET por ID o Identificador)**:
   \`GET /api/v1/db/data/v1/nococlone/${getTableNameForApi()}/:rowIdOrKey?view=human\`
   *Importante*: Puedes buscar pasando el ID físico interno (ej: "row_1234567") O directamente por el valor de la columna identificadora principal "${primaryName}" (ej: "${exampleVal}"). ¡El servidor lo resolverá inteligentemente de forma automatizada!

3. **Insertar Registro (POST)**:
   \`POST /api/v1/db/data/v1/nococlone/${getTableNameForApi()}\`
   *Payload*: JSON con los nombres de las columnas sanitizados o exactos.
   *Ejemplo*: { "${sanitizeName(primaryName)}": "${exampleVal}", ... }

4. **Actualizar Registro Individual (PATCH por ID o Identificador)**:
   \`PATCH /api/v1/db/data/v1/nococlone/${getTableNameForApi()}/:rowIdOrKey\`
   *Importante*: Modifica un registro pasándole en la URL el ID físico o el valor de la columna "${primaryName}". Solo envía los campos que deseas modificar en el JSON body.

5. **Eliminar Registro Individual (DELETE por ID o Identificador)**:
   \`DELETE /api/v1/db/data/v1/nococlone/${getTableNameForApi()}/:rowIdOrKey\`
   *Descripción*: Elimina de forma directa el registro coincidente con el ID físico o el valor en la columna "${primaryName}" proporcionado.

#### DIRECTIVAS DE COMPORTAMIENTO PARA HERMES / GEMINI:
1. No inventes IDs si vas a actualizar o eliminar. Búscalos primero usando el GET.
2. Si el usuario te pide editar o borrar un registro con "${primaryName}" = "${exampleVal}", no busques su ID físico en la lista general; invoca los endpoints individuales pasándole "${exampleVal}" como el parámetro ':rowIdOrKey'. El backend resolverá la búsqueda automáticamente.
3. El formato de las fechas debe ser siempre YYYY-MM-DD.`;
  };

  return (
    <div id="api-integration-view-container" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex gap-3.5 items-start">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg shrink-0">
            <Bot className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="font-sans font-bold text-sm text-zinc-150 uppercase tracking-wider flex items-center gap-2">
              Consola API REST & Agentes AI
              <span className="text-[9px] lowercase bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 font-mono px-1.5 py-0.5 rounded font-bold">V1.2 Completa</span>
            </h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed max-w-2xl">
              ¡Hemos expandido nuestra API REST! Diseñada para integraciones nativas con plataformas de automatización como <strong className="text-zinc-200">n8n</strong> y agentes AI avanzados como <strong className="text-indigo-400">Hermes</strong>. Ahora puedes consultar, editar y borrar registros de forma individual utilizando indistintamente el ID físico lógico o el valor del campo clave <code className="text-emerald-300 font-mono">key</code>.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800/80">
            Proyecto: <strong className="text-indigo-400">nococlone</strong>
          </span>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Columns (8 cols) - Terminal and Documentation */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Section Selector Tab */}
          <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-lg p-1.5">
            <div className="flex items-center gap-1 w-full">
              <button
                onClick={() => setActivePlaygroundTab("http")}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activePlaygroundTab === "http"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/50"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Code2 className="w-4 h-4" />
                Referencia API REST (Nodos HTTP / n8n)
              </button>
              <button
                onClick={() => setActivePlaygroundTab("agent")}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activePlaygroundTab === "agent"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/50"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Bot className="w-4 h-4 text-indigo-400" />
                Prompt de Contexto para Agente AI (Hermes / Gemini)
              </button>
            </div>
          </div>

          {activePlaygroundTab === "http" ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xs">
              <div className="border-b border-zinc-850 bg-zinc-900/60 p-4">
                <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block mb-2.5">ELIGE UN MÉTODO HTTP PARA ADAPTAR LA DOCUMENTACIÓN:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveTab("get_list")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "get_list" 
                        ? "bg-sky-500/10 border-sky-500/40 text-sky-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    GET (Consultar Colección)
                  </button>

                  <button
                    onClick={() => setActiveTab("get_item")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "get_item" 
                        ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    GET (Individual por ID/Key)
                  </button>

                  <button
                    onClick={() => setActiveTab("post")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "post" 
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    POST (Insertar Fila)
                  </button>

                  <button
                    onClick={() => setActiveTab("patch")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "patch" 
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    PATCH (Actualizar por ID/Key)
                  </button>

                  <button
                    onClick={() => setActiveTab("delete")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "delete" 
                        ? "bg-rose-500/10 border-rose-500/40 text-rose-400" 
                        : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    DELETE (Eliminar por ID/Key)
                  </button>
                </div>
              </div>

              {/* Tab content panel */}
              <div className="p-5 space-y-4 font-sans bg-zinc-950/20">
                
                {/* Endpoint signature */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider block">Endpoint API URL:</span>
                  <div className="flex items-center gap-2 bg-zinc-950 rounded-xl px-4 py-3 border border-zinc-850 overflow-hidden">
                    <span className={`font-mono text-xs font-extrabold uppercase border px-2 py-0.5 rounded shrink-0 ${getMethodColor(activeTab)}`}>
                      {activeTab === "get_list" ? "GET" : activeTab === "get_item" ? "GET" : activeTab.toUpperCase()}
                    </span>
                    <span className="font-mono text-xs text-indigo-300 break-all select-all">
                      {baseUrl}/api/v1/db/data/v1/nococlone/{getTableNameForApi()}
                      {activeTab === "get_item" && "/:rowIdOrKey"}
                      {activeTab === "patch" && "/:rowIdOrKey"}
                      {activeTab === "delete" && "/:rowIdOrKey"}
                      {activeTab === "get_list" && "?view=human"}
                    </span>
                    <button
                      onClick={() => handleCopy(
                        `${baseUrl}/api/v1/db/data/v1/nococlone/${getTableNameForApi()}${activeTab === "get_item" || activeTab === "patch" || activeTab === "delete" ? (keyCol ? "/PAC-001" : "/row_id_ejemplo") : ""}`, 
                        "endpoint_url"
                      )}
                      className="p-1 px-2.5 text-[10px] font-mono text-zinc-400 hover:text-indigo-400 bg-zinc-900 border border-zinc-800 rounded-lg shrink-0 ml-auto flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === "endpoint_url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedText === "endpoint_url" ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>

                {/* Endpoint details */}
                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl space-y-3">
                  <h5 className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-indigo-400" /> Operación Inteligente
                  </h5>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    {activeTab === "get_list" && (
                      <>
                        Este endpoint devuelve todas las filas de la tabla. Por defecto, devuelve cada fila adaptada al formato <strong className="text-zinc-200">"human"</strong> mapeando los nombres exactos definidos en la interfaz (ej: <code className="text-emerald-300 font-mono">"Nombre": "Rufina"</code>). Puedes cambiar la vista pasando el parámetro <code className="text-indigo-300 font-mono text-[11px]">?view=</code>:
                        <span className="block mt-2 pl-3 border-l-2 border-indigo-500/50 space-y-1 bg-zinc-950/45 p-2 rounded-lg font-mono text-[10.5px]">
                          <span>• <b className="text-indigo-400">?view=human</b> : Formato limpio por defecto (Nombres Exactos). Recomendo para agentes AI.</span><br/>
                          <span>• <b className="text-indigo-400">?view=api</b> : Nombres en minúsculas sanitizados (<code className="text-zinc-300">"fecha_de_cirugia"</code>).</span><br/>
                          <span>• <b className="text-indigo-450">?view=id</b> : IDs físicos originales de columna (<code className="text-zinc-300">"col_5_0"</code>).</span><br/>
                          <span>• <b className="text-indigo-450">?view=all</b> : Mapeo completo (los 3 formatos de forma simultánea).</span>
                        </span>
                      </>
                    )}
                    {activeTab === "get_item" && (
                      <>
                        Recupera un solo registro directamente. A diferencia de las bases tradicionales con IDs misteriosas, <strong className="text-zinc-200">¡puedes pasarle el código o valor clave de tu columna "key"!</strong> El backend resolverá automáticamente la fila que coincida si detecta una columna con nombre <code className="text-emerald-300 font-mono">key</code> (o similar). También soporta el parámetro <code className="text-indigo-300 font-mono text-[11px]">?view=</code> para formatear la respuesta.
                      </>
                    )}
                    {activeTab === "post" && (
                      <>
                        Inserta un nuevo registro en la base de datos de forma limpia. El motor inteligente procesa el body JSON mapeando los nombres. Puedes enviar el nombre humano de la columna, el slug sanitizado en minúsculas, o el ID físico (<code className="text-zinc-450 font-mono">"col_xxx"</code>). El servidor automáticamente consolidará los valores.
                      </>
                    )}
                    {activeTab === "patch" && (
                      <>
                        Actualiza parcialmente un registro pasándole en la URL el ID físico (ej: <code className="text-zinc-300 font-mono">row_123</code>) o el campo clave de la columna <strong className="text-emerald-400 font-mono">key</strong> (ej: <code className="text-emerald-300 font-mono">PAC-001</code>). Solo pasa las claves de las columnas que deseas actualizar. El resto se mantendrá intacto.
                      </>
                    )}
                    {activeTab === "delete" && (
                      <>
                        Elimina permanentemente una fila de la tabla pasándole en la URL su ID físico o su valor de campo único <strong className="text-emerald-400 font-mono">key</strong> (ej: <code className="text-zinc-200">PAC-001</code>). Retorna una confirmación exitosa con los datos del registro eliminado.
                      </>
                    )}
                  </p>
                </div>

                {/* Payload Templates */}
                {(activeTab === "post" || activeTab === "patch") && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Plantilla del Body JSON (Request):</span>
                      <button
                        onClick={() => handleCopy(getMockBody(), "body_json")}
                        className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 cursor-pointer font-sans"
                      >
                        {copiedText === "body_json" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedText === "body_json" ? "Copiado!" : "Copiar Body"}
                      </button>
                    </div>
                    <pre className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl text-indigo-400 text-xs overflow-x-auto leading-relaxed max-h-60 font-mono">
                      {getMockBody()}
                    </pre>
                  </div>
                )}

                {activeTab === "get_list" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Ejemplo de Respuesta HTTP (Response JSON):</span>
                      <button
                        onClick={() => handleCopy(getMockGetResponse(), "response_json")}
                        className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 cursor-pointer font-sans"
                      >
                        {copiedText === "response_json" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedText === "response_json" ? "Copiado!" : "Copiar Respuesta"}
                      </button>
                    </div>
                    <pre className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl text-sky-400 text-xs overflow-x-auto leading-relaxed max-h-60 font-mono">
                      {getMockGetResponse()}
                    </pre>
                  </div>
                )}

                {activeTab === "get_item" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Ejemplo de Registro Individual (Response JSON):</span>
                      <button
                        onClick={() => handleCopy(getMockGetItemResponse(), "response_json_item")}
                        className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 cursor-pointer font-sans"
                      >
                        {copiedText === "response_json_item" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedText === "response_json_item" ? "Copiado!" : "Copiar Respuesta"}
                      </button>
                    </div>
                    <pre className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl text-indigo-400 text-xs overflow-x-auto leading-relaxed max-h-60 font-mono">
                      {getMockGetItemResponse()}
                    </pre>
                  </div>
                )}

              </div>
            </div>
          ) : (
            // AI AGENT KNOWLEDGE BASE KIT (HERMES)
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h4 className="font-sans font-bold text-zinc-100 text-sm">Kit de Sincronización para Hermes / Gemini Co-Pilot</h4>
                    <p className="text-[11px] text-zinc-400">Pégale esta directiva literal de comportamiento al sistema de tu Agente AI.</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(generateAgentPrompt(), "agent_prompt")}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-505 text-white rounded-lg text-xs font-bold leading-none flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  {copiedText === "agent_prompt" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedText === "agent_prompt" ? "¡Copiado al portapapeles!" : "Copiar Prompt de Directiva"}
                </button>
              </div>

              <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 space-y-3 font-mono text-[11.5px] leading-relaxed text-zinc-300 select-all max-h-[420px] overflow-y-auto no-scrollbar">
                <p className="text-zinc-500 font-sans italic text-[11px] mb-2 bg-indigo-950/15 border border-indigo-900/35 p-2 rounded-lg leading-normal">
                  💡 Este prompt se genera en base al esquema real de la tabla actual "<strong>{table.name}</strong>". Al entregárselo a tu agente Hermes o al modelo Gemini con el cual trabajas de fondo, éste entenderá de inmediato las directivas del backend inteligente de NocoClone y podrá operar sin desbordamiento de límites.
                </p>
                <pre className="whitespace-pre-wrap">{generateAgentPrompt()}</pre>
              </div>
            </div>
          )}

        </div>
        
        {/* Right Columns (4 cols) - Guidelines & Recommendations */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Quick steps in n8n / Agents */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4.5 space-y-4">
            <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800 pb-2.5 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-indigo-450" /> Configuración de Agentes AI
            </h4>
            
            <div className="space-y-3.5 font-sans" id="steps-guidelines">
              
              <div className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center font-mono shrink-0 mt-0.5">
                  1
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-200">Entrega el Prompt generado</p>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Pestaña <strong className="text-zinc-300">"Prompt de Contexto"</strong> copia el bloque y pégalo en las instrucciones generales de tu Agente AI o System Instructions de Gemini.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center font-mono shrink-0 mt-0.5">
                  2
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-200">Columna Identificadora</p>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    La primera columna de la tabla (ej: <strong className="text-zinc-300">"{primaryColName}"</strong>) actúa automáticamente como campo clave del negocio, siendo ideal como localizador para automatizaciones.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center font-mono shrink-0 mt-0.5">
                  3
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-200">Integración con n8n Nodo HTTP</p>
                  <p className="text-[11px] text-zinc-405 leading-normal">
                    Fija el método deseado (<strong className="text-zinc-300">{activeTab === "get_list" || activeTab === "get_item" ? "GET" : activeTab.toUpperCase()}</strong>) y envía como JSON. No se requiere autenticación en desarrollo local.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Key Column Indicator */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4.5 space-y-3.5 shadow-sm">
            <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800 pb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-455" /> Identificador Principal Activo
            </h4>
            <div className="space-y-2.5 font-sans">
              {primaryCol ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-550/20 rounded-xl flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-emerald-400">¡Búsqueda Dual Activa!</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      La columna <strong className="text-zinc-200">"{primaryColName}"</strong> (columna 1) es tu primary key lógica empresarial.
                    </p>
                    <p className="text-[10px] text-zinc-500 leading-relaxed mt-1">
                      Cualquier consulta REST o Agente AI puede referenciar directamente sus valores (ej: "{table.rows[0]?.[primaryCol.id] || "VALOR"}") en herencias o URLs.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-505/20 rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-405">Sin Columnas</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Agrega al menos una columna a tu tabla para que actúe como Identificador Principal de negocio.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Core Recommendations */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4.5 space-y-3.5 shadow-sm">
            <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800 pb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-400" /> Tips para tu Agente Hermes
            </h4>
            <div className="space-y-2.5 text-xs text-zinc-400 font-sans" id="features-highlights">
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-zinc-300">Tolerancia Dual:</strong> Si Hermes envía la fecha como texto o timestamp, el backend la parseará adecuadamente a Date.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-zinc-300">Nombres Limpios:</strong> El parámetro <code className="text-indigo-305 bg-zinc-950 px-1 py-0.5 rounded text-[10px]/none whitespace-nowrap font-mono">?view=human</code> devuelve exactamente las etiquetas del hospital en español, simplificando el entendimiento de Gemini.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-zinc-300">Sincronización Inmediata:</strong> Cualquier operación de Hermes se refleja de inmediato en tu interfaz NocoClone sin demoras de pool de base de datos.
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
