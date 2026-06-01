import React, { useState } from "react";
import { TableSchema, Column } from "../types";
import { 
  Terminal, Code2, Check, Copy, Cpu, Database, 
  ArrowRight, ShieldCheck, Zap, AlertTriangle, FileJson, Link, Send
} from "lucide-react";

interface ApiIntegrationViewProps {
  table: TableSchema;
}

export default function ApiIntegrationView({ table }: ApiIntegrationViewProps) {
  const [copiedText, setCopiedText] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"get" | "post" | "patch" | "delete">("get");

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
        mock[cleanColName] = `Ejemplo ${col.name}`;
      }
    });
    return JSON.stringify(mock, null, 2);
  };

  // Generate mock response list
  const getMockGetResponse = () => {
    const mockRow: Record<string, any> = { id: "row_1780268347231_example" };
    table.columns.forEach(col => {
      // Bind human name clean format as default to reflect optimized output
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
        mockRow[col.name] = col.name === "Nombre" ? "Martinez Rufina" : `Diligenciado para ${col.name}`;
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

  const getMethodColor = (method: string) => {
    switch (method.toLowerCase()) {
      case "get": return "text-sky-400 bg-sky-500/10 border-sky-500/20";
      case "post": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "patch": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "delete": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div id="api-integration-view-container" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex gap-3.5 items-start">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg shrink-0">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="font-sans font-bold text-sm text-zinc-150 uppercase tracking-wider flex items-center gap-2">
              API REST de Integración n8n
              <span className="text-[9px] lowercase bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 font-mono px-1.5 py-0.5 rounded font-bold">online</span>
            </h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed max-w-2xl">
              ¡Hemos activado la API nativa de NocoClone! Desconectamos el Postgres directo secundario para evitar problemas de tipos de campo y truncado, logrando que el <strong className="text-zinc-200">100% de tus pacientes ({table.rows?.length || 0} registros)</strong> se sincronicen de manera inmediata y segura en n8n mediante HTTP REST estándar.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800/80">
            Proyecto: <strong className="text-indigo-400">nococlone</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Endpoints Console */}
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xs">
            <div className="border-b border-zinc-805/80 bg-zinc-900/60 p-4">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block mb-2.5">MÉTODOS HTTP DE BASE DE DATOS SOPORTADOS:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTab("get")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "get" 
                      ? "bg-sky-500/10 border-sky-500/40 text-sky-400" 
                      : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full bg-sky-400`} />
                  GET (Consultar Filas)
                </button>
                <button
                  onClick={() => setActiveTab("post")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "post" 
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" 
                      : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400`} />
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
                  <span className={`w-1.5 h-1.5 rounded-full bg-amber-400`} />
                  PATCH (Actualizar Fila)
                </button>
                <button
                  onClick={() => setActiveTab("delete")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "delete" 
                      ? "bg-rose-500/10 border-rose-500/40 text-rose-400" 
                      : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full bg-rose-400`} />
                  DELETE (Eliminar Fila)
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
                    {activeTab}
                  </span>
                  <span className="font-mono text-xs text-indigo-300 break-all select-all select-none">
                    {baseUrl}/api/v1/db/data/v1/nococlone/{getTableNameForApi()}{activeTab === "patch" || activeTab === "delete" ? "/:rowId" : ""}
                  </span>
                  <button
                    onClick={() => handleCopy(`${baseUrl}/api/v1/db/data/v1/nococlone/${getTableNameForApi()}${activeTab === "patch" || activeTab === "delete" ? "/row_id_ejemplo" : ""}`, "endpoint_url")}
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
                  <Send className="w-3.5 h-3.5 text-indigo-400" /> Detalles de Operación y Parámetros
                </h5>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                  {activeTab === "get" && (
                    <>
                      Por defecto, este endpoint devuelve cada fila de forma limpia <strong className="text-zinc-200">únicamente con sus nombres humanos de columna</strong> (ej: <code className="text-emerald-300 font-mono text-[11px]">"Nombre": "Martinez Rufina"</code>) para evitar triplicados redundantes. Si requieres otros formatos, puedes usar el parámetro <code className="text-indigo-300 font-mono text-[11px]">?view=</code>:
                      <span className="block mt-2 pl-3 border-l-2 border-indigo-500/50 space-y-1 bg-zinc-950/45 p-2 rounded-lg font-mono text-[10.5px]">
                        <span>• <b className="text-indigo-400">?view=human</b> : Formato limpio por defecto (Nombres Exactos).</span><br/>
                        <span>• <b className="text-indigo-400">?view=api</b> : Nombres en minúsculas sanitizados (<code className="text-zinc-300">"fecha_de_cirugia"</code>).</span><br/>
                        <span>• <b className="text-indigo-400">?view=id</b> : IDs físicos originales de columna (<code className="text-zinc-300">"col_5_0"</code>).</span><br/>
                        <span>• <b className="text-indigo-400">?view=all</b> : Mapeo completo (los 3 formatos de forma simultánea).</span>
                      </span>
                    </>
                  )}
                  {activeTab === "post" && (
                    <>
                      Inserta un nuevo registro en la base de datos de forma segura. El backend es inteligente: <strong className="text-indigo-350">¡NO necesitas triplicar los datos en el Body!</strong> Solo mapea los campos usando la opción que te quede más cómoda (Nombre de Columna humano o sanitizado o ID físico). El servidor automáticamente lo agrupará y guardará de manera unificada.
                    </>
                  )}
                  {activeTab === "patch" && (
                    <>
                      Actualiza parcialmente un registro por su ID de fila física. Al igual que en inserción, el backend inteligente procesa el par clave/valor usando cualquiera de las nomenclaturas que envíes. No necesitas duplicar nada ni enviar los campos que no vas a modificar.
                    </>
                  )}
                  {activeTab === "delete" && (
                    "Elimina permanentemente el registro coincidente con el ID por parámetro en cascada de forma inmediata."
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

              {activeTab === "get" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Ejemplo de Respuesta (Response JSON):</span>
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

            </div>
          </div>
        </div>

        {/* Right column: n8n settings instruction */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Quick steps in n8n */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4.5 space-y-4">
            <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/80 pb-2.5 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-indigo-400" /> Atajos de Configuración en n8n
            </h4>
            
            <div className="space-y-3.5 font-sans" id="steps-guidelines">
              
              <div className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center font-mono shrink-0 mt-0.5">
                  1
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-200">Usa el nodo "HTTP Request"</p>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    En n8n, agrega un nodo de tipo <strong className="text-zinc-300">HTTP Request</strong>. Es el nodo más genérico, rápido y compatible.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center font-mono shrink-0 mt-0.5">
                  2
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-200">Pega la URL de la Tabla</p>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Fija el método deseado (<strong className="text-zinc-300">{activeTab.toUpperCase()}</strong>) y pega el endpoint generado que ves a la izquierda.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center font-mono shrink-0 mt-0.5">
                  3
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-200">Envía como JSON estándar</p>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    No necesitas cabeceras de autenticación complejas en local. Asegúrate de marcar <code className="text-indigo-300 font-mono text-[9px] bg-zinc-950 px-1 py-0.5 rounded border border-zinc-900">Send Body: True</code> y de tipo <code className="text-zinc-350 bg-zinc-900 px-1 rounded text-[9.5px]">JSON</code>.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Core Advantages */}
          <div className="bg-zinc-90 w-full p-4.5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3.5 shadow-sm">
            <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/85 pb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-400" /> ¿Por qué es mejor este enfoque?
            </h4>
            <div className="space-y-2.5 text-xs text-zinc-400 font-sans" id="features-highlights">
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-zinc-300">100% de Registros de Pacientes:</strong> No hay pérdida de datos ni truncamientos arbitarios como pasaba bajo sql puro.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-zinc-300">Puesta en Marcha en Segundos:</strong> Sin configurar pools de conexión, puertos 5432, timezones o strings largos de SQL.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-zinc-300">Tolerancia a Vacíos (NULLs):</strong> Si un paciente no tiene fecha de cirugía asignada, la API lee un string vacío de manera exitosa en vez de crashear el servidor.
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
