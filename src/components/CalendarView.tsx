import React, { useState } from "react";
import { TableSchema, Column, Row } from "../types";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, Table, AlertCircle, Eye } from "lucide-react";

interface CalendarViewProps {
  table: TableSchema;
}

export default function CalendarView({ table }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  
  // Find all date columns
  const dateColumns = table.columns.filter(col => col.type === "date");
  const [selectedColId, setSelectedColId] = useState(() => {
    return dateColumns[0]?.id || "";
  });

  // Keep track of active col if selection was not established yet
  const dateColId = selectedColId || dateColumns[0]?.id || "";

  // Navigate months
  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  if (dateColumns.length === 0) {
    return (
      <div id="calendar-warning-fallback" className="p-8 bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl mx-auto text-center space-y-4 my-12 animate-in fade-in">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full inline-block">
          <CalendarIcon className="w-8 h-8" />
        </div>
        <h3 className="font-sans font-bold text-base text-zinc-100">Sin columna de Fecha detectable</h3>
        <p className="text-xs text-zinc-400 font-sans leading-relaxed">
          Para ubicar los registros en el calendario, la tabla <strong>{table.name}</strong> debe contener al menos un campo de tipo <strong>DATE (Fecha)</strong>.
        </p>
        <p className="text-xs text-zinc-500 font-mono">
          Cree una columna con Tipo de Dato "DATE (Fecha)" en la pestaña "Tabla DDL" para comenzar.
        </p>
      </div>
    );
  }

  // Render Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  // First day of month structure
  const firstDayIndex = new Date(year, month, 1).getDay();
  // Total days in month
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Create calendar cells array
  const cells: (number | null)[] = [];
  // Left padding cells
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push(null);
  }
  // Days of month
  for (let d = 1; d <= totalDays; d++) {
    cells.push(d);
  }

  // Match rows for a cell day
  const getRowsForDay = (day: number) => {
    if (!dateColId) return [];
    const formattedDay = String(day).padStart(2, "0");
    const formattedMonth = String(month + 1).padStart(2, "0");
    const targetDateStr = `${year}-${formattedMonth}-${formattedDay}`;

    return table.rows.filter(row => {
      const val = row[dateColId];
      if (!val) return false;
      return String(val).startsWith(targetDateStr);
    });
  };

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const activeDayRows = selectedDay ? getRowsForDay(selectedDay) : [];

  return (
    <div id="calendar-container" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Selector header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-90 w-full max-w-full p-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xs">
        <div className="flex items-start gap-3">
          <CalendarIcon className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h3 className="font-sans font-bold text-xs text-zinc-150 uppercase tracking-wider">Planificación & Agenda</h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Planificación interactiva para visualizar registros del esquema relacional según la fecha mapeada.
            </p>
          </div>
        </div>

        {/* Column selector drop-down */}
        {dateColumns.length > 1 && (
          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-850 shrink-0">
            <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold">Mapear por:</span>
            <select
              value={dateColId}
              onChange={(e) => {
                setSelectedColId(e.target.value);
                setSelectedDay(null);
              }}
              className="bg-transparent border-none text-xs text-zinc-300 outline-none focus:ring-0 cursor-pointer font-sans font-semibold"
            >
              {dateColumns.map(col => (
                <option key={col.id} value={col.id} className="bg-zinc-950">
                  {col.name} ({col.id})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Main Calendar Month component */}
        <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
          
          {/* Month control header */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-1">
              <span className="font-sans font-extrabold text-base text-zinc-100 uppercase tracking-tight">
                {monthNames[month]}
              </span>
              <span className="font-mono text-sm text-zinc-500 font-bold ml-1">
                {year}
              </span>
            </div>
            <div className="flex items-center gap-1.5 select-none font-mono text-xs">
              <button
                onClick={handlePrevMonth}
                className="p-1 px-2.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-lg cursor-pointer transition-all hover:text-indigo-400"
                title="Mes Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleToday}
                className="px-3 py-1 bg-zinc-950 hover:bg-indigo-600/10 hover:border-indigo-500/25 border border-zinc-800 text-zinc-400 text-[10.5px] uppercase font-bold tracking-wider rounded-lg cursor-pointer transition-all"
                title="Volver a Hoy"
              >
                Hoy
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1 px-2.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-lg cursor-pointer transition-all hover:text-indigo-400"
                title="Mes Siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Days Week labels */}
          <div className="grid grid-cols-7 gap-2.5 text-center">
            {dayNames.map((name, idx) => (
              <span key={name} className={`font-mono text-[10.5px] font-bold uppercase tracking-widest ${idx === 0 || idx === 6 ? 'text-rose-400/70' : 'text-zinc-500'}`}>
                {name}
              </span>
            ))}
          </div>

          {/* Grid Cells content */}
          <div className="grid grid-cols-7 gap-2">
            {cells.map((day, idx) => {
              if (day === null) {
                return (
                  <div key={`empty-${idx}`} className="aspect-square bg-zinc-950/20 rounded-xl border border-transparent"></div>
                );
              }

              const rows = getRowsForDay(day);
              const isSelected = selectedDay === day;
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

              return (
                <div
                  key={`day-${day}`}
                  onClick={() => setSelectedDay(day)}
                  className={`aspect-square p-2 bg-zinc-950/50 border rounded-xl cursor-pointer flex flex-col justify-between transition-all hover:border-zinc-700 hover:bg-zinc-900/60 group relative ${
                    isToday 
                      ? "border-emerald-500/40 bg-emerald-500/5 shadow-xs" 
                      : isSelected 
                        ? "border-indigo-500 bg-indigo-500/5" 
                        : "border-zinc-850/60"
                  }`}
                >
                  {/* Day scalar indicator number */}
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-xs font-bold ${
                      isToday 
                        ? "text-emerald-400 font-extrabold" 
                        : isSelected 
                          ? "text-indigo-400 font-extrabold" 
                          : "text-zinc-400 group-hover:text-zinc-200"
                    }`}>
                      {day}
                    </span>
                    {rows.length > 0 && (
                      <span className="flex items-center gap-0.5 font-mono text-[9px] font-extrabold text-indigo-400 bg-indigo-500/10 px-1 rounded border border-indigo-500/20">
                        {rows.length}
                      </span>
                    )}
                  </div>

                  {/* Micro list preview of patient badges */}
                  <div className="space-y-0.5 truncate hidden sm:block">
                    {rows.slice(0, 2).map((row) => {
                      const firstColId = table.columns[0]?.id;
                      const title = String(row[firstColId] || "");
                      return (
                        <div key={row.id} className="text-[10px] font-medium leading-tight truncate text-zinc-350 bg-zinc-900 border border-zinc-800/80 px-1 py-0.5 rounded-md text-left">
                          {title}
                        </div>
                      );
                    })}
                    {rows.length > 2 && (
                      <div className="text-[8px] font-mono text-zinc-500 font-bold text-left px-1">
                        + {rows.length - 2} más...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Live Detail panel */}
        <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4" id="calendar-detail-panel">
          <h4 className="font-mono text-[10.5px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-800/80 pb-2">
            <Users className="w-3.5 h-3.5 text-indigo-400" /> Registros Agendados
          </h4>

          {selectedDay === null ? (
            <div className="py-20 text-center font-sans text-xs text-zinc-500 space-y-2 border border-dashed border-zinc-800 rounded-xl">
              <CalendarIcon className="w-7 h-7 text-zinc-750 mx-auto" />
              <p>Selecciona un día en el calendario de planificación.</p>
            </div>
          ) : activeDayRows.length === 0 ? (
            <div className="py-20 text-center font-sans text-xs text-zinc-500 space-y-2 border border-dashed border-zinc-800 rounded-xl">
              <AlertCircle className="w-7 h-7 text-zinc-750 mx-auto" />
              <p>No se encontraron citas ni pacientes registrados para el día {selectedDay} de {monthNames[month]}.</p>
            </div>
          ) : (
            <div className="space-y-3" id="patients-cites-layout">
              <div className="text-[10px] uppercase font-mono text-zinc-500 font-bold">
                Día {selectedDay} de {monthNames[month]} ({activeDayRows.length} registro{activeDayRows.length > 1 ? "s" : ""})
              </div>
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto custom-scrollbar">
                {activeDayRows.map((row) => {
                  const firstColId = table.columns[0]?.id;
                  const patientName = String(row[firstColId] || "Sin nombre");
                  return (
                    <div key={row.id} className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-sans font-extrabold text-xs text-zinc-250 leading-tight">
                          {patientName}
                        </span>
                        <span className="font-mono text-[9px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-md shrink-0">
                          {row.id}
                        </span>
                      </div>
                      
                      {/* Grid representation of this detail row */}
                      <div className="bg-zinc-900/40 border border-[#1e1e24] p-2 rounded-lg divide-y divide-[#1e1e24] space-y-1.5 text-[11px] font-sans">
                        {table.columns.slice(1).map(col => {
                          const val = row[col.id];
                          if (val === undefined || val === null || val === "") return null;
                          return (
                            <div key={col.id} className="flex justify-between gap-2 pt-1.5 first:pt-0">
                              <span className="text-zinc-500 font-mono text-[9.5px] tracking-tight">{col.name}:</span>
                              <span className="text-zinc-350 text-right truncate max-w-[170px] font-medium font-sans">
                                {col.type === "boolean" ? (val ? "SÍ" : "NO") : String(val)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
