import React from 'react';
import { Calendar, Hash, AlertTriangle, CheckCircle2, Clock, Info } from 'lucide-react';
import { getWeekRange, validateDateInWeek, getCurrentWeekCode } from '../lib/dateUtils';

interface DateWeekSectionProps {
  fecha: string;
  semana: string;
  observacionesGenerales?: string;
  onFechaChange: (fecha: string) => void;
  onSemanaChange: (semana: string) => void;
}

export const DateWeekSection: React.FC<DateWeekSectionProps> = ({
  fecha,
  semana,
  observacionesGenerales,
  onFechaChange,
  onSemanaChange,
}) => {
  const weekInfo = getWeekRange(semana);
  const dateCheck = validateDateInWeek(fecha, semana);

  const handleSetToday = () => {
    const current = getCurrentWeekCode();
    onFechaChange(current.fecha);
    onSemanaChange(current.semana);
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
            2
          </span>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Fecha y semana de trabajo
          </h2>
        </div>

        <button
          type="button"
          onClick={handleSetToday}
          className="text-xs text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center space-x-1 self-start sm:self-auto"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Fijar fecha y semana de hoy</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Fecha Input */}
        <div>
          <label htmlFor="fecha-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Fecha de corte (AAAA-MM-DD)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Calendar className="w-4 h-4" />
            </div>
            <input
              id="fecha-input"
              type="date"
              value={fecha}
              onChange={(e) => onFechaChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 font-mono"
              required
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Fecha manuscrita registrada en el encabezado de las planillas.
          </p>
        </div>

        {/* Semana Input */}
        <div>
          <label htmlFor="semana-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Semana empresarial (AASS)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Hash className="w-4 h-4" />
            </div>
            <input
              id="semana-input"
              type="text"
              maxLength={4}
              placeholder="Ej. 2641 (Año 2026, Semana 41)"
              value={semana}
              onChange={(e) => onSemanaChange(e.target.value.trim())}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 font-mono uppercase"
              required
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Formato de cuatro dígitos: 2 dígitos para el año y 2 para el número de semana.
          </p>
        </div>
      </div>

      {/* Week and Date Validation Card */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        {weekInfo.valid && weekInfo.range ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Semana {semana}:</span>
              <span className="text-slate-600 font-mono">
                Domingo {weekInfo.range.domingoStr} al Sábado {weekInfo.range.sabadoStr}
              </span>
            </div>

            <div>
              {dateCheck.valid ? (
                <span className="inline-flex items-center space-x-1 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>La fecha corresponde a la semana empresarial</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-amber-700 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{dateCheck.error}</span>
                </span>
              )}
            </div>
          </div>
        ) : semana ? (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{weekInfo.error}</span>
          </div>
        ) : (
          <div className="p-2.5 rounded-lg bg-slate-50 text-slate-500 text-xs flex items-center space-x-2">
            <Info className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Ingresa o reconoce la fecha y semana para verificar el calendario empresarial (domingo a sábado).</span>
          </div>
        )}

        {/* General OCR Observations banner */}
        {observacionesGenerales && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <span className="font-semibold">Observación general de la lectura:</span>{' '}
              <span>{observacionesGenerales}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
