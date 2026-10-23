import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  UserCheck,
  TrendingUp,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { YieldRecord, CatalogData } from '../types';
import {
  normalizarCodigo,
  normalizarTexto,
  obtenerCodigoArea,
  buscarColaboradorEnMaestro,
  buscarColaboradorPorNombre,
  buscarAreaEnCatalogo,
  AREAS_RECONOCIDAS_LISTA,
} from '../lib/sheetsService';
import {
  calculateDurationHours,
  calculateHourlyYield,
  getDaysOfWeekForWeek,
  getDayOfWeekName,
  getWeekRange,
} from '../lib/dateUtils';

interface YieldTableSectionProps {
  records: YieldRecord[];
  catalogData: CatalogData;
  fecha: string;
  semana: string;
  observacionesGenerales?: string;
  onUpdateRecord: (id: string, field: keyof YieldRecord, value: any) => void;
  onAddRecord: () => void;
  onRemoveRecord: (id: string) => void;
  onDuplicateRecord: (record: YieldRecord) => void;
  onOpenSaveModal: () => void;
  onAutoFillMissingHours?: (defaultHour?: string) => void;
  onSemanaChange?: (semana: string) => void;
}

export const YieldTableSection: React.FC<YieldTableSectionProps> = ({
  records,
  catalogData,
  fecha,
  semana,
  observacionesGenerales,
  onUpdateRecord,
  onAddRecord,
  onRemoveRecord,
  onDuplicateRecord,
  onOpenSaveModal,
  onAutoFillMissingHours,
  onSemanaChange,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'doubtful' | 'errors'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Rango e info de la semana empresarial identificada
  const weekInfo = React.useMemo(() => getWeekRange(semana), [semana]);
  // 7 días de la semana de Domingo a Sábado
  const weekDays = React.useMemo(() => getDaysOfWeekForWeek(semana), [semana]);


  // Lista única y ordenada de códigos limpios de área (ej. F1..F6, GYPSO, ASTRONOVA, R1..R8)
  const availableAreaCodes = React.useMemo(() => {
    const set = new Set<string>();
    AREAS_RECONOCIDAS_LISTA.forEach((cod) => set.add(cod));
    catalogData.areas.forEach((a) => {
      const cod = obtenerCodigoArea(a.AreSup);
      if (cod) set.add(cod);
    });
    return Array.from(set);
  }, [catalogData.areas]);

  // Handle Code changes with auto-filling collaborator name from Maestro
  const handleCodigoChange = (id: string, newCodigo: string) => {
    const rawVal = newCodigo.trim();
    onUpdateRecord(id, 'codigo', rawVal);

    // Valida en Maestro por código o por nombre
    const colabEncontrado =
      buscarColaboradorEnMaestro(rawVal, catalogData.colaboradores) ||
      buscarColaboradorPorNombre(rawVal, catalogData.colaboradores);

    if (colabEncontrado) {
      onUpdateRecord(id, 'codigo', colabEncontrado['Código']);
      onUpdateRecord(id, 'colaborador', colabEncontrado.Nombre);
    } else {
      onUpdateRecord(id, 'colaborador', '');
    }
  };

  // Handle Area selection (muestra exclusivamente el código limpio de área en la foto)
  const handleAreaChange = (id: string, newAreaCode: string) => {
    const areaReal = buscarAreaEnCatalogo(newAreaCode, catalogData.areas);
    onUpdateRecord(id, 'areSup', areaReal ? areaReal.AreSup : newAreaCode);
  };

  // Inspect validation state of a record
  const getRecordValidation = (r: YieldRecord) => {
    const warnings: string[] = [];
    const errors: string[] = [];

    const codRaw = String(r.codigo || '').trim();
    if (!codRaw) {
      errors.push('Falta el código de colaborador');
    } else {
      const colabEncontrado = buscarColaboradorEnMaestro(codRaw, catalogData.colaboradores);
      if (!colabEncontrado) {
        warnings.push(`Código '${r.codigo}' no encontrado en Maestro`);
      } else if (!r.colaborador) {
        errors.push('Colaborador sin nombre asignado');
      }
    }

    const areaRaw = String(r.areSup || '').trim();
    if (!areaRaw) {
      errors.push('Selecciona el área de corte');
    } else {
      const areaEncontrada = buscarAreaEnCatalogo(areaRaw, catalogData.areas);
      if (!areaEncontrada) {
        warnings.push(`Área '${r.areSup}' no reconocida en catálogo`);
      }
    }

    if (!r.horaInicio || !r.horaFin) {
      errors.push('Completa las horas de inicio y fin');
    } else {
      const dur = calculateDurationHours(r.horaInicio, r.horaFin);
      if (dur === null || dur <= 0) {
        errors.push('Hora fin debe ser mayor a hora inicio');
      }
    }

    if (r.tallos === null || r.tallos === undefined || isNaN(r.tallos)) {
      errors.push('Ingresa la cantidad de tallos cortados');
    } else if (r.tallos < 0 || !Number.isInteger(Number(r.tallos))) {
      errors.push('Tallos debe ser entero mayor o igual a 0');
    }

    if (r.observaciones) {
      warnings.push(r.observaciones);
    }

    const hasError = errors.length > 0;
    const hasWarning = warnings.length > 0;

    return {
      isValid: !hasError && !hasWarning,
      hasError,
      hasWarning,
      allIssues: [...errors, ...warnings],
    };
  };

  // Filtered rows
  const filteredRecords = records.filter((r) => {
    const validation = getRecordValidation(r);

    if (filterType === 'doubtful' && !r.observaciones && !validation.hasWarning) {
      return false;
    }
    if (filterType === 'errors' && !validation.hasError) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCod = r.codigo.toLowerCase().includes(q);
      const matchNom = r.colaborador.toLowerCase().includes(q);
      const matchArea = r.areSup.toLowerCase().includes(q);
      return matchCod || matchNom || matchArea;
    }

    return true;
  });

  // Totals & stats
  const totalTallos = records.reduce((acc, r) => acc + (Number(r.tallos) || 0), 0);
  const totalHoras = records.reduce((acc, r) => acc + (r.duracion || 0), 0);
  const promedioRendimiento = totalHoras > 0 ? totalTallos / totalHoras : 0;
  const countWithErrors = records.filter((r) => getRecordValidation(r).hasError).length;
  const countWithWarnings = records.filter((r) => getRecordValidation(r).hasWarning).length;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
      {/* Datalist para autocompletar y validar colaboradores directamente de Maestro */}
      <datalist id="colaboradores-maestro">
        {catalogData.colaboradores.map((c, i) => (
          <option key={i} value={c['Código']}>
            {c.Nombre}
          </option>
        ))}
      </datalist>

      {/* Header and stats */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between pb-5 border-b border-slate-100 gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              2
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Revisión y corrección de registros
            </h2>
            {semana && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold font-mono">
                Semana {semana}
                {weekInfo.valid && weekInfo.range && (
                  <span className="ml-1 text-[11px] text-emerald-700 font-normal">
                    (Dom {weekInfo.range.domingoStr.slice(0, 5)} - Sáb {weekInfo.range.sabadoStr.slice(0, 5)})
                  </span>
                )}
              </span>
            )}
          </div>
          {observacionesGenerales && (
            <p className="mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded inline-block">
              <span className="font-semibold">Planillas:</span> {observacionesGenerales}
            </p>
          )}
        </div>


        {/* Quick summary metrics */}
        <div className="flex items-center space-x-2 text-center bg-slate-50 p-2 rounded-xl border border-slate-200">
          <div className="px-3 py-1">
            <span className="block text-[11px] font-semibold text-slate-500 uppercase">Colaboradores</span>
            <span className="text-sm font-bold text-slate-800 font-mono">{records.length}</span>
          </div>
          <div className="px-3 py-1 border-l border-slate-200">
            <span className="block text-[11px] font-semibold text-slate-500 uppercase">Rend./Hora Prom.</span>
            <span className="text-sm font-bold text-emerald-700 font-mono">
              {promedioRendimiento.toFixed(1)} t/h
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search & Filter Tabs */}
      <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filterType === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({records.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('doubtful')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center space-x-1 transition-colors ${
              filterType === 'doubtful'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Con dudas/observaciones ({countWithWarnings})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('errors')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center space-x-1 transition-colors ${
              filterType === 'errors'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Incompletos ({countWithErrors})</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar colaborador o código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:bg-white text-slate-800"
            />
          </div>

          <button
            type="button"
            onClick={onAddRecord}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded-lg text-xs font-semibold transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Agregar colaborador</span>
          </button>
        </div>
      </div>

      {/* Responsive Table */}
      <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-left text-xs border-collapse min-w-[960px]">
            <thead className="bg-slate-100/80 text-slate-700 font-semibold uppercase text-[11px] sticky top-0 z-10 border-b border-slate-200 backdrop-blur-xs">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-2.5 w-32">Día / Fecha</th>
                <th className="py-2.5 px-3 w-28">Código</th>
                <th className="py-2.5 px-3 min-w-[200px]">Colaborador (Maestro)</th>
                <th className="py-2.5 px-3 w-32">Área</th>
                <th className="py-2.5 px-2 w-24">Hora Inicio</th>
                <th className="py-2.5 px-2 w-24">Hora Fin</th>
                <th className="py-2.5 px-3 w-28">Total Tallos</th>
                <th className="py-2.5 px-2 w-20 text-right">Duración</th>
                <th className="py-2.5 px-2 w-24 text-right">Rend./h</th>
                <th className="py-2.5 px-3 w-20 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium text-sm text-slate-600">No hay registros para mostrar</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {records.length === 0
                        ? 'Carga fotografías arriba para leer con Gemini o haz clic en "+ Agregar colaborador" para ingresar manualmente.'
                        : 'Ningún registro coincide con el filtro o búsqueda seleccionada.'}
                    </p>
                    {records.length === 0 && (
                      <button
                        type="button"
                        onClick={onAddRecord}
                        className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agregar primer colaborador</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record, index) => {
                  const validation = getRecordValidation(record);
                  const isAreaInCatalog = Boolean(buscarAreaEnCatalogo(record.areSup, catalogData.areas));
                  const cleanAreaCode = obtenerCodigoArea(record.areSup);

                  return (
                    <tr
                      key={record.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        validation.hasError
                          ? 'bg-rose-50/30'
                          : validation.hasWarning
                          ? 'bg-amber-50/30'
                          : ''
                      }`}
                    >
                      {/* Row Index and Status Indicator */}
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <span className="font-mono text-slate-400 text-[11px]">{index + 1}</span>
                          {validation.hasError ? (
                            <span title={validation.allIssues.join(' • ')}>
                              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            </span>
                          ) : validation.hasWarning ? (
                            <span title={validation.allIssues.join(' • ')}>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            </span>
                          ) : (
                            <span>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Día / Fecha Select o Input */}
                      <td className="py-2 px-2.5">
                        {weekDays.length > 0 ? (
                          <select
                            value={record.fecha || fecha}
                            onChange={(e) => {
                              const selFecha = e.target.value;
                              const matched = weekDays.find((d) => d.fecha === selFecha);
                              onUpdateRecord(record.id, 'fecha', selFecha);
                              if (matched) {
                                onUpdateRecord(record.id, 'dia', matched.dia);
                              }
                            }}
                            className="w-full px-2 py-1 text-xs font-semibold rounded border border-slate-300 bg-white text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                          >
                            {weekDays.map((d) => (
                              <option key={d.fecha} value={d.fecha}>
                                {d.diaCorto} {d.fechaDisplay}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="date"
                            value={record.fecha || fecha}
                            onChange={(e) => {
                              const val = e.target.value;
                              onUpdateRecord(record.id, 'fecha', val);
                              onUpdateRecord(record.id, 'dia', getDayOfWeekName(val));
                            }}
                            className="w-full px-1.5 py-1 text-xs rounded border border-slate-300 bg-white text-slate-800 font-mono"
                          />
                        )}
                      </td>


                      {/* Código Input con autocompletar de Maestro */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          list="colaboradores-maestro"
                          value={record.codigo}
                          onChange={(e) => handleCodigoChange(record.id, e.target.value)}
                          placeholder="Código RH"
                          className={`w-full px-2 py-1 text-xs font-mono font-medium rounded border ${
                            !record.codigo
                              ? 'border-rose-300 bg-rose-50/50'
                              : !buscarColaboradorEnMaestro(record.codigo, catalogData.colaboradores)
                              ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold'
                              : 'border-slate-300 bg-white text-slate-900'
                          } focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500`}
                        />
                      </td>

                      {/* Colaborador (Valida con Maestro) */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <span
                            className={`font-semibold truncate max-w-[240px] ${
                              record.colaborador ? 'text-slate-900' : 'text-rose-600 italic'
                            }`}
                          >
                            {record.colaborador || 'No encontrado en Maestro'}
                          </span>
                          {!record.colaborador && record.codigo && (
                            <span className="text-[10px] text-amber-700 font-medium">
                              Código '{record.codigo}' no registrado en Maestro
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Area Select: Muestra ÚNICAMENTE el código limpio identificado en la foto */}
                      <td className="py-2 px-3">
                        <select
                          value={cleanAreaCode}
                          onChange={(e) => handleAreaChange(record.id, e.target.value)}
                          className={`w-full px-2.5 py-1 text-xs font-mono font-bold rounded border ${
                            !record.areSup || !isAreaInCatalog
                              ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold'
                              : 'border-slate-300 bg-white text-emerald-800'
                          } focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500`}
                        >
                          <option value="">-- Área --</option>
                          {availableAreaCodes.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                          {cleanAreaCode && !availableAreaCodes.includes(cleanAreaCode) && (
                            <option value={cleanAreaCode} disabled>
                              ⚠️ {cleanAreaCode}
                            </option>
                          )}
                        </select>
                      </td>

                      {/* Hora Inicio */}
                      <td className="py-2 px-2">
                        <input
                          type="time"
                          value={record.horaInicio}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateRecord(record.id, 'horaInicio', val);
                            const dur = calculateDurationHours(val, record.horaFin);
                            onUpdateRecord(record.id, 'duracion', dur || 0);
                            onUpdateRecord(record.id, 'rendimiento', calculateHourlyYield(record.tallos, dur));
                          }}
                          className="w-full px-1.5 py-1 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </td>

                      {/* Hora Fin */}
                      <td className="py-2 px-2">
                        <input
                          type="time"
                          value={record.horaFin}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateRecord(record.id, 'horaFin', val);
                            const dur = calculateDurationHours(record.horaInicio, val);
                            onUpdateRecord(record.id, 'duracion', dur || 0);
                            onUpdateRecord(record.id, 'rendimiento', calculateHourlyYield(record.tallos, dur));
                          }}
                          className={`w-full px-1.5 py-1 text-xs font-mono rounded border ${
                            calculateDurationHours(record.horaInicio, record.horaFin) === null
                              ? 'border-rose-300 bg-rose-50/50 text-rose-900'
                              : 'border-slate-300 bg-white'
                          } focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500`}
                        />
                      </td>

                      {/* Total Tallos */}
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Tallos"
                          value={record.tallos === null || record.tallos === undefined ? '' : record.tallos}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                            onUpdateRecord(record.id, 'tallos', val);
                            onUpdateRecord(record.id, 'rendimiento', calculateHourlyYield(val, record.duracion));
                          }}
                          className={`w-full px-2 py-1 text-xs font-mono font-semibold text-right rounded border ${
                            record.tallos === null || record.tallos < 0
                              ? 'border-rose-300 bg-rose-50/50'
                              : 'border-slate-300 bg-white text-emerald-800'
                          } focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500`}
                        />
                      </td>

                      {/* Duración (Horas) */}
                      <td className="py-2 px-2 text-right font-mono font-medium text-slate-700">
                        {record.duracion > 0 ? (
                          <span>{record.duracion.toFixed(2)} h</span>
                        ) : (
                          <span className="text-rose-500 text-[11px]">Revisar</span>
                        )}
                      </td>

                      {/* Rendimiento / Hora */}
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                        {record.rendimiento > 0 ? (
                          <span className="text-emerald-700">{record.rendimiento.toFixed(1)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => onDuplicateRecord(record)}
                            title="Duplicar colaborador"
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveRecord(record.id)}
                            title="Eliminar fila"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer controls & Save button */}
      <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddRecord}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar colaborador</span>
          </button>

          {countWithErrors > 0 && onAutoFillMissingHours && (
            <button
              type="button"
              onClick={() => onAutoFillMissingHours('14:30')}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
            >
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              <span>Auto-completar horas fin pendientes (14:30)</span>
            </button>
          )}

          {countWithWarnings > 0 && (
            <span className="text-xs text-amber-700 font-medium inline-flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Hay {countWithWarnings} registro(s) con advertencias</span>
            </span>
          )}
        </div>

        {/* Primary Save Button */}
        <button
          type="button"
          onClick={onOpenSaveModal}
          disabled={records.length === 0}
          className="inline-flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#0a2958] hover:bg-[#071f43] active:bg-[#05152e] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
        >
          <UserCheck className="w-4 h-4 text-blue-200" />
          <span>Guardar registros aprobados ({records.length})</span>
        </button>
      </div>
    </section>
  );
};
