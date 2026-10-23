import React, { useMemo } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  X,
  Loader2,
  ShieldCheck,
  ArrowRight,
  Clock,
  LogIn,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { YieldRecord, CatalogData } from '../types';
import {
  formatDisplayDate,
  getWeekRange,
  calculateDurationHours,
  normalizeTimeFormat,
  getDateForWeekDay,
} from '../lib/dateUtils';
import { obtenerCodigoArea, buscarColaboradorEnMaestro, buscarAreaEnCatalogo } from '../lib/sheetsService';

interface SaveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: YieldRecord[];
  fecha: string;
  semana: string;
  catalogData: CatalogData;
  onConfirmSave: () => Promise<void>;
  isSaving: boolean;
  saveError?: string | null;
  onAutoFillHours?: (time?: string) => void;
  onSignIn?: () => void;
  hasAccessToken?: boolean;
  hasScriptUrl?: boolean;
}

export const SaveConfirmationModal: React.FC<SaveConfirmationModalProps> = ({
  isOpen,
  onClose,
  records,
  fecha,
  semana,
  catalogData,
  onConfirmSave,
  isSaving,
  saveError,
  onAutoFillHours,
  onSignIn,
  hasAccessToken = true,
  hasScriptUrl = false,
}) => {
  if (!isOpen) return null;

  const totalTallos = records.reduce((acc, r) => acc + (Number(r.tallos) || 0), 0);
  const totalHoras = records.reduce((acc, r) => acc + (r.duracion || 0), 0);
  const rendimientoProm = totalHoras > 0 ? totalTallos / totalHoras : 0;

  const weekInfo = getWeekRange(semana);

  // Pre-flight validation of all records
  const validationIssues = useMemo(() => {
    return records
      .map((r, i) => {
        const issues: string[] = [];
        const codLimpio = String(r.codigo || '').trim();

        if (!codLimpio) {
          issues.push('Falta código');
        } else {
          const colab = buscarColaboradorEnMaestro(codLimpio, catalogData.colaboradores);
          if (!colab) {
            issues.push(`Código '${r.codigo}' no está en Maestro`);
          }
        }

        const normInicio = normalizeTimeFormat(r.horaInicio, false) || '06:00';
        const normFin = normalizeTimeFormat(r.horaFin, true, normInicio);

        if (!normFin) {
          issues.push('Falta hora de fin');
        } else {
          const dur = calculateDurationHours(normInicio, normFin);
          if (dur === null || dur <= 0) {
            issues.push(`Hora fin (${normFin}) debe ser mayor a inicio (${normInicio})`);
          }
        }

        if (r.tallos === null || r.tallos === undefined || isNaN(r.tallos)) {
          issues.push('Falta número de tallos');
        } else if (r.tallos < 0 || !Number.isInteger(Number(r.tallos))) {
          issues.push('Tallos debe ser entero >= 0');
        }

        const areaEncontrada = buscarAreaEnCatalogo(r.areSup, catalogData.areas);
        if (!areaEncontrada) {
          issues.push(`Área '${r.areSup || 'vacía'}' no reconocida`);
        }

        return {
          index: i + 1,
          record: r,
          issues,
        };
      })
      .filter((x) => x.issues.length > 0);
  }, [records, catalogData]);

  const hasMissingHoursOnly =
    validationIssues.length > 0 &&
    validationIssues.every((v) => v.issues.every((iss) => iss.includes('hora')));

  const uniqueDates = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      const d = (r.dia && semana ? getDateForWeekDay(semana, r.dia) : null) || r.fecha || fecha;
      if (d) set.add(d);
    });
    return Array.from(set).filter(Boolean);
  }, [records, fecha, semana]);


  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">4. Confirmación de guardado en Google Sheets</h3>
              <p className="text-xs text-slate-300">
                Se escribirán únicamente los registros revisados y aprobados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Target destination card */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start space-x-3 text-xs">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-emerald-950">
                Destino: Hoja <span className="font-mono underline">Rendimientos</span>
              </p>
              <p className="text-emerald-800">
                ID de archivo: <span className="font-mono text-[11px] font-medium">{catalogData.spreadsheetId}</span>
              </p>
              <p className="text-[11px] text-emerald-700">
                Se completarán automáticamente las columnas: <span className="font-mono">Id_Captura, Sede, AreSup, Producto, Código, Colaborador, Fecha, Año, Sem, Hora Inicio, Hora Fin, Duración, Total Tallos, Rendimiento Hora</span>.
              </p>
            </div>
          </div>

          {/* Authentication Alert only if neither scriptUrl nor accessToken is available */}
          {!hasScriptUrl && !hasAccessToken && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-start space-x-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Sesión de Google requerida</p>
                  <p className="text-amber-800 text-[11px]">
                    Debes conectar tu cuenta de Google con acceso a Sheets para que la API permita guardar los registros.
                  </p>
                </div>
              </div>
              {onSignIn && (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="shrink-0 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#0a2958] hover:bg-[#071f43] text-white rounded-lg text-xs font-bold transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Conectar cuenta</span>
                </button>
              )}
            </div>
          )}

          {/* Previous Save Error Display Banner */}
          {saveError && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl flex items-start space-x-3 text-xs text-rose-950 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="font-bold text-rose-900">No se pudieron guardar los registros:</p>
                <p className="font-mono text-[11px] text-rose-800 bg-rose-100/60 p-2 rounded-md break-all">
                  {saveError}
                </p>
                <p className="text-[11px] text-rose-700">
                  Por favor revisa la fila indicada o utiliza la corrección automática abajo para que coincidan todos los datos requeridos.
                </p>
              </div>
            </div>
          )}

          {/* Validation Warnings / Blockers Alert */}
          {validationIssues.length > 0 && (
            <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-950">
                      Atención: Hay {validationIssues.length} registro(s) con datos pendientes o a revisar
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Antes de enviar a la hoja de Google Sheets, todos los registros deben tener horas válidas, tallos y código en Maestro.
                    </p>
                  </div>
                </div>

                {hasMissingHoursOnly && onAutoFillHours && (
                  <button
                    type="button"
                    onClick={() => onAutoFillHours('14:30')}
                    className="shrink-0 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Completar hora fin con 14:30</span>
                  </button>
                )}
              </div>

              {/* List of issues */}
              <div className="max-h-28 overflow-y-auto bg-white/80 p-2 rounded-lg border border-amber-200 text-[11px] space-y-1">
                {validationIssues.map((v) => (
                  <div key={v.index} className="flex items-center justify-between text-slate-700">
                    <span className="font-mono font-medium">
                      Fila {v.index} ({v.record.colaborador || v.record.codigo || 'Sin código'}):
                    </span>
                    <span className="text-amber-800 font-semibold">{v.issues.join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key batch summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block text-[11px] font-semibold text-slate-500 uppercase">
                {uniqueDates.length > 1 ? 'Días incluidos' : 'Fecha'}
              </span>
              <span className="text-sm font-bold text-slate-900 font-mono">
                {uniqueDates.length > 1
                  ? `${uniqueDates.length} días detectados`
                  : formatDisplayDate(fecha)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block text-[11px] font-semibold text-slate-500 uppercase">Semana (Dom-Sáb)</span>
              <span className="text-sm font-bold text-slate-900 font-mono">{semana}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block text-[11px] font-semibold text-slate-500 uppercase">Colaboradores</span>
              <span className="text-sm font-bold text-slate-900 font-mono">{records.length}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block text-[11px] font-semibold text-slate-500 uppercase">Total Tallos</span>
              <span className="text-sm font-bold text-emerald-700 font-mono">
                {totalTallos.toLocaleString('es-CO')}
              </span>
            </div>
          </div>

          {/* Quick list preview of records */}
          <div>
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                Vista previa de registros a enviar ({records.length})
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Duración total: {totalHoras.toFixed(2)} h • Rendimiento prom: {rendimientoProm.toFixed(1)} t/h
              </span>
            </div>

            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs bg-slate-50/50">
              {records.map((r, i) => {
                const normInicio = normalizeTimeFormat(r.horaInicio, false) || '06:00';
                const normFin = normalizeTimeFormat(r.horaFin, true, normInicio);
                const dur = calculateDurationHours(normInicio, normFin);
                const hasError = !r.codigo || !normFin || dur === null || dur <= 0 || r.tallos === null;
                const rowDate = (r.dia && semana ? getDateForWeekDay(semana, r.dia) : null) || r.fecha || fecha;

                return (
                  <div
                    key={r.id}
                    className={`p-2 flex items-center justify-between text-[11px] ${
                      hasError ? 'bg-amber-50/60' : 'hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate pr-2">
                      <span className="font-mono text-slate-400 w-5">{i + 1}.</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-semibold">
                        {r.dia ? `${r.dia.slice(0, 3)} ${formatDisplayDate(rowDate).slice(0, 5)}` : formatDisplayDate(rowDate)}
                      </span>
                      <span className="font-mono font-semibold text-slate-700">{r.codigo}</span>
                      <span className="font-medium text-slate-900 truncate max-w-[150px]">{r.colaborador}</span>
                      <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono text-[10px]">
                        {obtenerCodigoArea(r.areSup)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0 font-mono">
                      <span className={normFin ? 'text-slate-600' : 'text-rose-600 font-bold'}>
                        {normInicio} - {normFin || '??:??'}
                      </span>
                      <span className="font-bold text-emerald-700">
                        {r.tallos !== null ? `${r.tallos} tallos` : '—'}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        ({dur ? `${dur.toFixed(1)}h` : '0h'})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


          <p className="text-xs text-slate-500 text-center">
            ¿Confirmas que revisaste todos los registros y deseas guardarlos en la hoja de Google Sheets?
          </p>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            {validationIssues.length > 0 && onAutoFillHours && (
              <button
                type="button"
                onClick={() => onAutoFillHours('14:30')}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center space-x-1 underline"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-completar horas de salida faltantes</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Volver a revisar
            </button>

            <button
              type="button"
              onClick={onConfirmSave}
              disabled={isSaving || (!hasScriptUrl && !hasAccessToken)}
              className="inline-flex items-center space-x-2 px-6 py-2.5 text-xs font-bold text-white bg-[#0a2958] hover:bg-[#071f43] active:bg-[#05152e] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Guardando en Google Sheets...</span>
                </>
              ) : (
                <>
                  <span>Sí, guardar {records.length} registros</span>
                  <ArrowRight className="w-4 h-4 text-blue-200" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
