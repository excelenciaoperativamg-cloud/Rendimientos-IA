/**
 * Reglas de negocio y cálculo de semana empresarial y fechas
 * de corte de flores.
 * Semana empresarial: domingo a sábado.
 * La semana 1 es la que contiene el 1 de enero.
 */

export interface WeekRange {
  domingo: Date;
  sabado: Date;
  anio: number;
  numSemana: number;
  domingoStr: string;
  sabadoStr: string;
}

/**
 * Parsea un código de semana en formato AASS (ej. 2641 => año 2026, semana 41)
 * y calcula el rango de fechas correspondientes (domingo a sábado).
 */
export function getWeekRange(semana: string): { valid: boolean; range?: WeekRange; error?: string } {
  const clean = String(semana || '').trim();
  const m = clean.match(/^(\d{2})(\d{2})$/);

  if (!m) {
    return {
      valid: false,
      error: 'La semana debe tener cuatro dígitos en formato AASS, por ejemplo 2641.',
    };
  }

  const anio = 2000 + Number(m[1]);
  const numSemana = Number(m[2]);

  if (numSemana < 1 || numSemana > 53) {
    return {
      valid: false,
      error: `El número de semana (${numSemana}) debe estar entre 01 y 53.`,
    };
  }

  // La semana 1 es la que contiene el 1 de enero.
  // Mediodía (12:00) para evitar desfases por horario de verano o zonas horarias
  const primero = new Date(anio, 0, 1, 12);
  const domingoInicial = new Date(primero);
  domingoInicial.setDate(primero.getDate() - primero.getDay());

  const domingo = new Date(domingoInicial);
  domingo.setDate(domingoInicial.getDate() + (numSemana - 1) * 7);

  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);

  const formatShort = (d: Date) => {
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  };

  return {
    valid: true,
    range: {
      domingo,
      sabado,
      anio,
      numSemana,
      domingoStr: formatShort(domingo),
      sabadoStr: formatShort(sabado),
    },
  };
}

/**
 * Valida si una fecha (YYYY-MM-DD) corresponde exactamente
 * a la semana empresarial en formato AASS.
 */
export function validateDateInWeek(fechaStr: string, semanaStr: string): { valid: boolean; error?: string } {
  if (!fechaStr) {
    return { valid: false, error: 'Indica la fecha de trabajo.' };
  }
  if (!semanaStr) {
    return { valid: false, error: 'Indica la semana (formato AASS).' };
  }

  const weekInfo = getWeekRange(semanaStr);
  if (!weekInfo.valid || !weekInfo.range) {
    return { valid: false, error: weekInfo.error };
  }

  const fechaPartes = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!fechaPartes) {
    return { valid: false, error: 'Fecha inválida. Usa formato AAAA-MM-DD.' };
  }

  const fecha = new Date(
    Number(fechaPartes[1]),
    Number(fechaPartes[2]) - 1,
    Number(fechaPartes[3]),
    12
  );

  const { domingo, anio, domingoStr, sabadoStr } = weekInfo.range;
  const diferencia = Math.floor((fecha.getTime() - domingo.getTime()) / 86400000);

  if (diferencia < 0 || diferencia > 6 || fecha.getFullYear() !== anio) {
    return {
      valid: false,
      error: `La fecha ${formatDisplayDate(fechaStr)} no corresponde a la semana ${semanaStr} (va del domingo ${domingoStr} al sábado ${sabadoStr}).`,
    };
  }

  return { valid: true };
}

/**
 * Normaliza una cadena de hora a formato HH:mm en reloj de 24 horas.
 * Maneja formatos como "1:00", "01:00", "14:30", "2:30", "8:10", etc.
 * En turnos de corte agrícola, si la hora de fin es de la tarde (ej. 1:00 a 6:59)
 * y la hora de inicio es matutina (ej. 06:00), se convierte automáticamente a 24h (13:00 a 18:59).
 */
export function normalizeTimeFormat(
  timeStr: string | null | undefined,
  isEndTime: boolean = false,
  startTimeRef: string = '06:00'
): string {
  if (!timeStr) return '';
  const clean = String(timeStr).trim().replace('.', ':');
  const m = clean.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return clean;

  let h = Number(m[1]);
  const min = m[2] !== undefined ? Number(m[2]) : 0;
  if (isNaN(h) || isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return clean;

  // Conversión automática de 12 horas a 24 horas para horas de fin en la tarde
  if (isEndTime) {
    if (h >= 1 && h <= 6) {
      h += 12;
    } else if (startTimeRef) {
      const minInicio = timeToMinutes(startTimeRef);
      const minActual = h * 60 + min;
      // Si la hora de fin es menor que la de inicio y al sumarle 12h cae dentro de la jornada laboral
      if (minInicio !== null && minActual <= minInicio && minActual + 720 <= 19 * 60) {
        h += 12;
      }
    }
  }

  const hStr = String(h).padStart(2, '0');
  const minStr = String(min).padStart(2, '0');
  return `${hStr}:${minStr}`;
}

/**
 * Convierte 'HH:mm' a minutos totales desde la medianoche.
 */
export function timeToMinutes(timeStr: string): number | null {
  const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Calcula la duración en horas entre Hora Inicio y Hora Fin.
 * Incluye corrección automática si la hora de fin fue anotada en formato 12h (tarde).
 */
export function calculateDurationHours(inicio: string, fin: string): number | null {
  if (!inicio || !fin) return null;

  const normInicio = normalizeTimeFormat(inicio, false);
  const normFin = normalizeTimeFormat(fin, true, normInicio);

  const minInicio = timeToMinutes(normInicio);
  const minFin = timeToMinutes(normFin);

  if (minInicio === null || minFin === null) return null;
  let diff = minFin - minInicio;

  // Si diff <= 0, verificar si sumando 12h da un turno válido de corte
  if (diff <= 0) {
    const minFinAjustado = minFin + 720;
    if (minFinAjustado - minInicio > 0 && minFinAjustado - minInicio <= 16 * 60) {
      diff = minFinAjustado - minInicio;
    }
  }

  if (diff <= 0) return null;

  return diff / 60;
}

/**
 * Calcula el rendimiento por hora (tallos / horas).
 */
export function calculateHourlyYield(tallos: number | null, duracionHoras: number | null): number {
  if (tallos === null || tallos < 0 || !duracionHoras || duracionHoras <= 0) {
    return 0;
  }
  return tallos / duracionHoras;
}

/**
 * Formatea fecha ISO (YYYY-MM-DD) a formato latinoamericano día/mes/año (DD/MM/AAAA).
 */
export function formatDisplayDate(fechaISO: string): string {
  if (!fechaISO) return '—';
  const parts = fechaISO.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return fechaISO;
}

/**
 * Sugiere el código de semana AASS actual para la fecha de hoy
 */
export function getCurrentWeekCode(): { fecha: string; semana: string } {
  const now = new Date();
  const year = now.getFullYear();
  const yy = String(year % 100).padStart(2, '0');

  // Buscar número de semana empresarial
  const primero = new Date(year, 0, 1, 12);
  const domingoInicial = new Date(primero);
  domingoInicial.setDate(primero.getDate() - primero.getDay());

  const currentMid = new Date(year, now.getMonth(), now.getDate(), 12);
  const diffDays = Math.floor((currentMid.getTime() - domingoInicial.getTime()) / 86400000);
  let weekNum = Math.floor(diffDays / 7) + 1;
  if (weekNum < 1) weekNum = 1;
  if (weekNum > 53) weekNum = 53;

  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return {
    fecha: `${year}-${month}-${day}`,
    semana: `${yy}${String(weekNum).padStart(2, '0')}`,
  };
}

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export const DIAS_SEMANA_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

/**
 * Normaliza nombres de días (ej. 'domingo', 'lun', 'miercoles', 'MIE', '1' => 'Miércoles')
 */
export function normalizarNombreDia(dia: any): string | null {
  if (dia === null || dia === undefined) return null;
  const str = String(dia)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/^dom(ingo)?$/.test(str) || str === '0' || str === 'd') return 'Domingo';
  if (/^lun(es)?$/.test(str) || str === '1' || str === 'l') return 'Lunes';
  if (/^mar(tes)?$/.test(str) || str === '2' || str === 'm') return 'Martes';
  if (/^mie(rcoles)?$/.test(str) || str === '3' || str === 'x') return 'Miércoles';
  if (/^jue(ves)?$/.test(str) || str === '4' || str === 'j') return 'Jueves';
  if (/^vie(rnes)?$/.test(str) || str === '5' || str === 'v') return 'Viernes';
  if (/^sab(ado)?$/.test(str) || str === '6' || str === 's') return 'Sábado';

  return null;
}

/**
 * Obtiene el índice (0 = Domingo .. 6 = Sábado) para un nombre de día
 */
export function getDiaIndex(dia: any): number | null {
  const norm = normalizarNombreDia(dia);
  if (!norm) return null;
  const idx = DIAS_SEMANA.indexOf(norm as any);
  return idx !== -1 ? idx : null;
}

/**
 * Calcula la fecha exacta (AAAA-MM-DD) para un día de la semana (domingo a sábado)
 * dado el código de semana AASS (ej. 2641).
 */
export function getDateForWeekDay(semana: string, diaNombreOIndice: string | number): string | null {
  const weekInfo = getWeekRange(semana);
  if (!weekInfo.valid || !weekInfo.range) return null;

  let dayIdx: number | null = null;
  if (typeof diaNombreOIndice === 'number') {
    if (diaNombreOIndice >= 0 && diaNombreOIndice <= 6) {
      dayIdx = diaNombreOIndice;
    }
  } else {
    dayIdx = getDiaIndex(diaNombreOIndice);
  }

  if (dayIdx === null) return null;

  const targetDate = new Date(weekInfo.range.domingo);
  targetDate.setDate(targetDate.getDate() + dayIdx);

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Retorna el nombre del día en español (ej. "Lunes") para una fecha YYYY-MM-DD.
 */
export function getDayOfWeekName(fechaStr: string): string {
  if (!fechaStr) return '';
  const match = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  const dayIdx = d.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  return DIAS_SEMANA[dayIdx] || '';
}

/**
 * Retorna los 7 días de la semana empresarial (Domingo a Sábado) con sus fechas calculadas.
 */
export function getDaysOfWeekForWeek(
  semana: string
): Array<{ dia: string; diaCorto: string; fecha: string; fechaDisplay: string; index: number }> {
  const weekInfo = getWeekRange(semana);
  if (!weekInfo.valid || !weekInfo.range) return [];

  const days: Array<{ dia: string; diaCorto: string; fecha: string; fechaDisplay: string; index: number }> = [];

  for (let i = 0; i < 7; i++) {
    const curDate = new Date(weekInfo.range.domingo);
    curDate.setDate(curDate.getDate() + i);

    const year = curDate.getFullYear();
    const month = String(curDate.getMonth() + 1).padStart(2, '0');
    const day = String(curDate.getDate()).padStart(2, '0');
    const iso = `${year}-${month}-${day}`;

    days.push({
      dia: DIAS_SEMANA[i],
      diaCorto: DIAS_SEMANA_CORTOS[i],
      fecha: iso,
      fechaDisplay: `${day}/${month}`,
      index: i,
    });
  }

  return days;
}

