import { AreaItem, ColaboradorItem, CatalogData, YieldRecord, CatalogDiagnostics } from '../types';
import {
  validateDateInWeek,
  calculateDurationHours,
  getWeekRange,
  normalizeTimeFormat,
  getDateForWeekDay,
} from './dateUtils';

export const DEFAULT_SPREADSHEET_ID = '1SgV5hv-Am41A18dt2uXl_Air0V_ttRGQxY7-NcvaXP0';

export const REQUERIDOS_RENDIMIENTOS = [
  'Id_Captura',
  'Sede',
  'AreSup',
  'Producto',
  'Código',
  'Colaborador',
  'Fecha',
  'Año',
  'Sem',
  'Hora Inicio',
  'Hora Fin',
  'Duración',
  'Total Tallos',
  'Rendimiento Hora',
];

// Lista oficial de áreas requeridas para formatos de corte
export const AREAS_RECONOCIDAS_LISTA = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'GYPSO',
  'ASTRONOVA',
  'R1',
  'R2',
  'R3',
  'R4',
  'R5',
  'R6',
  'R7',
  'R8',
];

// Catálogos iniciales con las áreas exactas del proceso de corte
export const SEED_AREAS: AreaItem[] = [
  { AreSup: 'F1', Producto: 'Rosa Freedom', Sede: 'Sabana Norte' },
  { AreSup: 'F2', Producto: 'Rosa Explorer', Sede: 'Sabana Norte' },
  { AreSup: 'F3', Producto: 'Rosa Mondial', Sede: 'Sabana Norte' },
  { AreSup: 'F4', Producto: 'Rosa Vendela', Sede: 'Sabana Norte' },
  { AreSup: 'F5', Producto: 'Rosa Hermosa', Sede: 'Sabana Norte' },
  { AreSup: 'F6', Producto: 'Rosa Topaz', Sede: 'Sabana Norte' },
  { AreSup: 'GYPSO', Producto: 'Gypsophila Million Stars', Sede: 'El Rosal' },
  { AreSup: 'ASTRONOVA', Producto: 'Alstroemeria Astronova', Sede: 'El Rosal' },
  { AreSup: 'R1', Producto: 'Clavel Standard', Sede: 'Facatativá' },
  { AreSup: 'R2', Producto: 'Mini Clavel', Sede: 'Facatativá' },
  { AreSup: 'R3', Producto: 'Clavel Exportación', Sede: 'Facatativá' },
  { AreSup: 'R4', Producto: 'Clavel Variedad Mix', Sede: 'Facatativá' },
  { AreSup: 'R5', Producto: 'Clavel Blanco', Sede: 'Facatativá' },
  { AreSup: 'R6', Producto: 'Clavel Rojo', Sede: 'Facatativá' },
  { AreSup: 'R7', Producto: 'Clavel Bicolor', Sede: 'Facatativá' },
  { AreSup: 'R8', Producto: 'Clavel Premium', Sede: 'Facatativá' },
];

export const SEED_COLABORADORES: ColaboradorItem[] = [
  { 'Código': '10452', Nombre: 'JUAN CARLOS PÉREZ MORA' },
  { 'Código': '1785', Nombre: 'JOSÉ ALBEIRO GUZMÁN SÁNCHEZ' },
  { 'Código': '5915', Nombre: 'LIDIA ESPERANZA CARDONA PEÑA' },
  { 'Código': '10488', Nombre: 'MARÍA FERNANDA GÓMEZ LÓPEZ' },
  { 'Código': '10512', Nombre: 'JOSÉ ANTONIO RODRÍGUEZ' },
  { 'Código': '10567', Nombre: 'ANA LUCÍA MARTÍNEZ RÍOS' },
  { 'Código': '10601', Nombre: 'CARLOS ALBERTO DÍAZ SILVA' },
  { 'Código': '10634', Nombre: 'LUZ MERY HERNÁNDEZ SOTO' },
  { 'Código': '10720', Nombre: 'DIEGO FERNANDO TORRES' },
  { 'Código': '10755', Nombre: 'GLORIA PATRICIA RAMÍREZ' },
];

/**
 * Normaliza códigos como texto:
 * - Conserva ceros iniciales intactos (ej. '01785' => '01785').
 * - Elimina espacios innecesarios (al inicio, al final e internos).
 * - Elimina caracteres invisibles de unicode (zero-width spaces, non-breaking spaces).
 * - Elimina comillas iniciales/finales (usadas en hojas de cálculo para forzar texto).
 * - Normaliza formatos numéricos con separador de miles si provienen de Google Sheets (ej. '1,785' o '1.785' => '1785').
 * - Elimina decimales nulos generados por celdas numéricas (ej. '1785.0' o '1785,0' => '1785').
 */
export function normalizarCodigo(valor: any): string {
  if (valor === null || valor === undefined) return '';

  let str = String(valor);

  // 1. Eliminar caracteres invisibles, saltos y espacios duros de unicode
  str = str.replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '').trim();

  // 2. Eliminar comillas iniciales o finales (ej. '1785 o "1785")
  str = str.replace(/^['"]+|['"]+$/g, '');

  // 3. Si tiene decimal nulo como 1785.0 o 1785,00
  if (/^\d+[,.]0+$/.test(str)) {
    str = str.replace(/[,.]0+$/, '');
  }

  // 4. Si es un número con separador de miles (ej. 1,785 o 1.785 o 10,452)
  if (/^\d{1,3}([,.]\d{3})+$/.test(str)) {
    str = str.replace(/[,.]/g, '');
  }

  // 5. Eliminar cualquier espacio interno (ej. '17 85' => '1785')
  str = str.replace(/\s+/g, '');

  return str.toUpperCase();
}

/**
 * Normaliza cadenas de texto para comparación (sin acentos, mayúsculas, sin espacios extras).
 */
export function normalizarTexto(valor: any): string {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Busca un colaborador en la lista de Maestro.
 * Compara primero por código normalizado exacto (conservando ceros iniciales).
 * Si no coincide, realiza una comparación flexible para casos donde el código en Maestro o
 * en la planilla tenga ceros iniciales omitidos o adicionales (ej. "01785" vs "1785").
 * También permite buscar por nombre en Maestro.
 */
export function buscarColaboradorEnMaestro(
  codigoBuscado: string,
  colaboradores: ColaboradorItem[]
): ColaboradorItem | null {
  const codLimpio = normalizarCodigo(codigoBuscado);
  if (!codLimpio || !colaboradores || colaboradores.length === 0) return null;

  // Paso 1: Coincidencia exacta de texto normalizado
  for (const c of colaboradores) {
    const codCatalogo = normalizarCodigo(c['Código']);
    if (codCatalogo === codLimpio) {
      return c;
    }
  }

  // Paso 2: Coincidencia flexible si uno tiene ceros iniciales y el otro no (sin inventar códigos)
  const codSinCeros = codLimpio.replace(/^0+/, '');
  if (codSinCeros.length > 0) {
    for (const c of colaboradores) {
      const codCatalogo = normalizarCodigo(c['Código']);
      const catSinCeros = codCatalogo.replace(/^0+/, '');
      if (catSinCeros === codSinCeros) {
        return c;
      }
    }
  }

  // Paso 3: Buscar por nombre completo en caso de que se haya ingresado el nombre directamente
  const nomLimpio = normalizarTexto(codigoBuscado);
  if (nomLimpio.length >= 4) {
    for (const c of colaboradores) {
      if (normalizarTexto(c.Nombre) === nomLimpio) {
        return c;
      }
    }
  }

  return null;
}

/**
 * Busca un colaborador directamente por nombre en Maestro
 */
export function buscarColaboradorPorNombre(
  nombreBuscado: string,
  colaboradores: ColaboradorItem[]
): ColaboradorItem | null {
  const nomLimpio = normalizarTexto(nombreBuscado);
  if (!nomLimpio || !colaboradores || colaboradores.length === 0) return null;

  for (const c of colaboradores) {
    if (normalizarTexto(c.Nombre) === nomLimpio) {
      return c;
    }
  }
  return null;
}

/**
 * Extrae el código corto representativo de un área (ej. "F1", "F2", "GYPSO", "ASTRONOVA", "R1", etc.)
 * Muestra exclusivamente el código de área identificado en la foto.
 */
export function obtenerCodigoArea(valor: string): string {
  if (!valor) return '';
  const limpio = String(valor).trim().toUpperCase();

  // 1. Si coincide directamente con alguna de las áreas oficiales reconocidas
  for (const cod of AREAS_RECONOCIDAS_LISTA) {
    if (limpio === cod) return cod;
  }

  // 2. Si contiene delimitadores (-, :, /, (, espacio), extraer el primer token
  const partes = limpio.split(/[-:/(_\s]/);
  const primerToken = partes[0].trim();
  for (const cod of AREAS_RECONOCIDAS_LISTA) {
    if (primerToken === cod) return cod;
  }

  // 3. Coincidencia alfanumérica sin guiones (ej. "F-1" => "F1")
  const alnum = limpio.replace(/[^A-Z0-9]/g, '');
  for (const cod of AREAS_RECONOCIDAS_LISTA) {
    if (alnum === cod) return cod;
  }

  return primerToken || limpio;
}

/**
 * Compara un área reconocida por Gemini con los valores reales de AreSup del catálogo Area.
 * Retorna el AreaItem real completo si coincide con AreSup o con su código corto.
 * Si no coincide de forma verificada, retorna null (no inventa áreas).
 */
export function buscarAreaEnCatalogo(areaInput: string, areas: AreaItem[]): AreaItem | null {
  if (!areaInput || !areas || areas.length === 0) return null;

  const inputNorm = normalizarTexto(areaInput);
  if (!inputNorm) return null;

  // 1. Coincidencia exacta con AreSup normalizado
  for (const a of areas) {
    if (normalizarTexto(a.AreSup) === inputNorm) {
      return a;
    }
  }

  // 2. Coincidencia con el código corto extraído de AreSup (antes de '-', ':', '/', etc.)
  for (const a of areas) {
    const codCorto = normalizarTexto(obtenerCodigoArea(a.AreSup));
    if (codCorto && codCorto === inputNorm) {
      return a;
    }
  }

  // 3. Coincidencia alfanumérica estricta (ej. "F-1" o "F 1" con "F1")
  const inputAlnum = inputNorm.replace(/[^A-Z0-9]/g, '');
  if (inputAlnum.length >= 2) {
    for (const a of areas) {
      const codCortoAlnum = normalizarTexto(obtenerCodigoArea(a.AreSup)).replace(/[^A-Z0-9]/g, '');
      if (codCortoAlnum && codCortoAlnum === inputAlnum) {
        return a;
      }
      const areSupAlnum = normalizarTexto(a.AreSup).replace(/[^A-Z0-9]/g, '');
      if (areSupAlnum === inputAlnum) {
        return a;
      }
    }
  }

  // 4. Coincidencia por palabra inicial si AreSup empieza exactamente con la palabra indicada
  for (const a of areas) {
    const palabras = normalizarTexto(a.AreSup).split(/\s+/);
    if (palabras.length > 0 && palabras[0] === inputNorm) {
      return a;
    }
  }

  return null;
}

/**
 * Busca de forma flexible el índice de una columna según nombres alternativos normalizados.
 */
function findHeaderIndex(headers: string[], posiblesNombres: string[]): number {
  const normHeaders = headers.map((h) => normalizarTexto(h));
  for (const nombre of posiblesNombres) {
    const norm = normalizarTexto(nombre);
    const idx = normHeaders.indexOf(norm);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Consulta las pestañas Area, Maestro y Rendimientos de Google Sheets API v4.
 * Incluye diagnóstico detallado y normalización estricta.
 */
export async function fetchGoogleSheetsCatalogos(
  accessToken: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID
): Promise<CatalogData> {
  if (!accessToken) {
    throw new Error('Debes iniciar sesión con Google para consultar las hojas de cálculo.');
  }

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;

  // 1. Obtener Área
  const resArea = await fetch(`${baseUrl}/Area?valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resArea.ok) {
    const err = await resArea.json().catch(() => ({}));
    throw new Error(`Error al leer pestaña 'Area': ${err?.error?.message || resArea.statusText}`);
  }
  const dataArea = await resArea.json();
  const rowsArea: string[][] = dataArea.values || [];
  if (rowsArea.length < 2) {
    throw new Error("La pestaña 'Area' no tiene datos suficientes.");
  }

  const headersArea = (rowsArea[0] || []).map((h) => String(h).trim());
  const idxAreSup = findHeaderIndex(headersArea, ['AreSup', 'ARESUP', 'Area', 'Área', 'Are_Sup']);
  const idxProducto = findHeaderIndex(headersArea, ['Producto', 'PRODUCTO', 'Variedad']);
  const idxSede = findHeaderIndex(headersArea, ['Sede', 'SEDE', 'Finca', 'Ubicación']);

  if (idxAreSup === -1 || idxProducto === -1 || idxSede === -1) {
    throw new Error(
      `La hoja 'Area' debe contener las columnas AreSup, Producto y Sede. Encontradas: ${headersArea.join(', ')}`
    );
  }

  const areas: AreaItem[] = rowsArea
    .slice(1)
    .filter((r) => r[idxAreSup])
    .map((r) => ({
      AreSup: String(r[idxAreSup] || '').trim(),
      Producto: String(r[idxProducto] || '').trim(),
      Sede: String(r[idxSede] || '').trim(),
    }));

  // 2. Obtener Maestro
  const resMaestro = await fetch(`${baseUrl}/Maestro?valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resMaestro.ok) {
    const err = await resMaestro.json().catch(() => ({}));
    throw new Error(`Error al leer pestaña 'Maestro': ${err?.error?.message || resMaestro.statusText}`);
  }
  const dataMaestro = await resMaestro.json();
  const rowsMaestro: string[][] = dataMaestro.values || [];
  if (rowsMaestro.length < 2) {
    throw new Error("La pestaña 'Maestro' no contiene colaboradores registrados.");
  }

  const headersMaestro = (rowsMaestro[0] || []).map((h) => String(h).trim());
  const idxCodigo = findHeaderIndex(headersMaestro, [
    'Código',
    'Codigo',
    'CÓDIGO',
    'CODIGO',
    'Código RH',
    'ID RH',
    'ID',
  ]);
  const idxNombre = findHeaderIndex(headersMaestro, [
    'Nombre',
    'NOMBRE',
    'Colaborador',
    'COLABORADOR',
    'Nombre Completo',
  ]);

  if (idxCodigo === -1 || idxNombre === -1) {
    throw new Error(
      `La hoja 'Maestro' debe contener las columnas 'Código' y 'Nombre'. Encontradas: ${headersMaestro.join(', ')}`
    );
  }

  const colaboradores: ColaboradorItem[] = rowsMaestro
    .slice(1)
    .filter((r) => r[idxCodigo] && r[idxNombre])
    .map((r) => ({
      'Código': normalizarCodigo(r[idxCodigo]),
      Nombre: String(r[idxNombre] || '').trim(),
    }));

  // 3. Obtener encabezados de Rendimientos
  const resRend = await fetch(`${baseUrl}/Rendimientos!1:1?valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resRend.ok) {
    const err = await resRend.json().catch(() => ({}));
    throw new Error(`Error al leer pestaña 'Rendimientos': ${err?.error?.message || resRend.statusText}`);
  }
  const dataRend = await resRend.json();
  const headersRend: string[] = (dataRend.values && dataRend.values[0]) || [];

  const faltantes = REQUERIDOS_RENDIMIENTOS.filter((req) => !headersRend.includes(req));
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan encabezados requeridos en la hoja 'Rendimientos': ${faltantes.join(', ')}`
    );
  }

  const diagnostics: CatalogDiagnostics = {
    source: 'google_sheets_direct',
    totalColaboradores: colaboradores.length,
    totalAreas: areas.length,
    sampleCodigos: colaboradores.slice(0, 5).map((c) => c['Código']),
    sampleAreas: areas.slice(0, 5).map((a) => a.AreSup),
    headerArea: headersArea,
    headerMaestro: headersMaestro,
    hasExactCodigoHeader: idxCodigo !== -1,
    hasExactNombreHeader: idxNombre !== -1,
    lastChecked: new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };

  return {
    areas,
    colaboradores,
    encabezadosRendimientos: headersRend,
    spreadsheetId,
    lastUpdated: diagnostics.lastChecked,
    diagnostics,
  };
}

const SCRIPT_URL_KEY = 'google_script_webapp_url';

export const getStoredScriptUrl = (): string => {
  try {
    return (
      localStorage.getItem(SCRIPT_URL_KEY) ||
      (import.meta as any).env?.VITE_GOOGLE_SCRIPT_URL ||
      ''
    );
  } catch {
    return '';
  }
};

export const saveStoredScriptUrl = (url: string) => {
  try {
    if (url && url.trim()) {
      localStorage.setItem(SCRIPT_URL_KEY, url.trim());
    } else {
      localStorage.removeItem(SCRIPT_URL_KEY);
    }
  } catch {}
};

/**
 * Parsea datos provenientes de Google Apps Script Web App
 */
export function parseGoogleScriptData(
  scriptData: any,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID
): CatalogData {
  if (!scriptData || (!scriptData.maestro && !scriptData.colaboradores)) {
    throw new Error('La respuesta de Google Apps Script no contiene datos de las hojas Maestro o Area.');
  }

  const rawColabs = scriptData.colaboradores || scriptData.maestro || [];
  const rawAreas = scriptData.areas || scriptData.area || [];

  const normH = (s: any) =>
    String(s || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  let colaboradores: ColaboradorItem[] = [];
  if (Array.isArray(rawColabs) && rawColabs.length > 0) {
    if (Array.isArray(rawColabs[0])) {
      const headerColabs = rawColabs[0].map(normH);
      let idxCod = headerColabs.findIndex((h: string) =>
        ['CODIGO', 'ID RH', 'ID', 'COD', 'CODIGO EMPLEADO', 'DOCUMENTO'].includes(h)
      );
      let idxNom = headerColabs.findIndex((h: string) =>
        ['NOMBRE', 'COLABORADOR', 'NOMBRE COMPLETO', 'NOMBRES', 'EMPLEADO'].includes(h)
      );
      if (idxCod === -1 && rawColabs[0].length >= 2) idxCod = 0;
      if (idxNom === -1 && rawColabs[0].length >= 2) idxNom = 1;

      colaboradores = rawColabs
        .slice(1)
        .filter((r: any) => r && r[idxCod] !== undefined && r[idxNom] !== undefined && String(r[idxCod]).trim() !== '')
        .map((r: any) => ({
          'Código': normalizarCodigo(r[idxCod]),
          Nombre: String(r[idxNom] || '').trim(),
        }));
    } else {
      colaboradores = rawColabs.map((c: any) => ({
        'Código': normalizarCodigo(c['Código'] || c.codigo || c.id),
        Nombre: String(c.Nombre || c.nombre || '').trim(),
      }));
    }
  }

  let areas: AreaItem[] = [];
  if (Array.isArray(rawAreas) && rawAreas.length > 0) {
    if (Array.isArray(rawAreas[0])) {
      const headerAreas = rawAreas[0].map(normH);
      let idxAre = headerAreas.findIndex((h: string) =>
        ['ARESUP', 'AREA', 'ARE_SUP', 'AREASUP', 'BLOQUE'].includes(h)
      );
      let idxProd = headerAreas.findIndex((h: string) =>
        ['PRODUCTO', 'VARIEDAD', 'VAR'].includes(h)
      );
      let idxSed = headerAreas.findIndex((h: string) =>
        ['SEDE', 'FINCA', 'UBICACION'].includes(h)
      );
      if (idxAre === -1 && rawAreas[0].length >= 1) idxAre = 0;
      if (idxProd === -1 && rawAreas[0].length >= 2) idxProd = 1;
      if (idxSed === -1 && rawAreas[0].length >= 3) idxSed = 2;

      areas = rawAreas
        .slice(1)
        .filter((r: any) => r && r[idxAre] !== undefined && String(r[idxAre]).trim() !== '')
        .map((r: any) => ({
          AreSup: String(r[idxAre] || '').trim(),
          Producto: String(r[idxProd] || '').trim(),
          Sede: String(r[idxSed] || '').trim(),
        }));
    } else {
      areas = rawAreas;
    }
  }

  const diagnostics: CatalogDiagnostics = {
    source: 'google_script_webapp',
    totalColaboradores: colaboradores.length,
    totalAreas: areas.length,
    sampleCodigos: colaboradores.slice(0, 5).map((c) => c['Código']),
    sampleAreas: areas.slice(0, 5).map((a) => a.AreSup),
    headerArea: ['AreSup', 'Producto', 'Sede'],
    headerMaestro: ['Código', 'Nombre'],
    hasExactCodigoHeader: true,
    hasExactNombreHeader: true,
    lastChecked: new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };

  return {
    areas,
    colaboradores,
    encabezadosRendimientos: REQUERIDOS_RENDIMIENTOS,
    spreadsheetId,
    lastUpdated: diagnostics.lastChecked,
    diagnostics,
  };
}

/**
 * Consulta catálogos directamente de Google Apps Script Web App o vía backend
 */
export async function fetchGoogleScriptCatalogos(
  scriptUrl: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID
): Promise<CatalogData> {
  const cleanUrl = scriptUrl.trim();
  if (!cleanUrl) {
    throw new Error('No se proporcionó la URL de Google Apps Script.');
  }

  // 1. Intentar consulta directa desde el navegador (rápida y sin depender de servidores intermedios)
  let responseText = '';
  try {
    const res = await fetch(cleanUrl, { redirect: 'follow' });
    responseText = await res.text();
  } catch (directErr: any) {
    console.warn('Consulta directa desde navegador no respondió, probando vía /api/catalogs:', directErr);
  }

  if (responseText) {
    try {
      const data = JSON.parse(responseText);
      if (data && (data.maestro || data.colaboradores)) {
        return parseGoogleScriptData(data, spreadsheetId);
      }
      if (data && data.success === false) {
        throw new Error(data.error || 'Error reportado por Apps Script');
      }
    } catch (parseErr: any) {
      if (
        responseText.includes('accounts.google.com') ||
        responseText.includes('ServiceLogin') ||
        responseText.includes('<!DOCTYPE') ||
        responseText.includes('<html')
      ) {
        throw new Error(
          'Google Apps Script está solicitando inicio de sesión. En el editor de Apps Script ve a "Implementar" > "Administrar implementaciones" > Editar (ícono de lápiz) > en "Quién tiene acceso" selecciona "Cualquier persona" (Anyone), crea una nueva versión y haz clic en "Implementar".'
        );
      }
      if (parseErr.message && parseErr.message.includes('Apps Script')) {
        throw parseErr;
      }
    }
  }

  // 2. Si falló la consulta directa en el navegador, consultar a través del backend (/api/catalogs)
  return fetchBackendCatalogos(null, spreadsheetId, cleanUrl);
}

/**
 * Consulta catálogos a través del backend (/api/catalogs) o directamente de Apps Script.
 * Admite token de usuario o URL de Google Apps Script Web App (sin login de usuario).
 */
export async function fetchBackendCatalogos(
  accessToken: string | null,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  scriptUrlOverride?: string
): Promise<CatalogData> {
  const scriptUrl = scriptUrlOverride || getStoredScriptUrl();

  // Si hay scriptUrl y no hay token de usuario, intentar consultar directamente a Apps Script primero
  if (scriptUrl && !accessToken) {
    try {
      return await fetchGoogleScriptCatalogos(scriptUrl, spreadsheetId);
    } catch (scriptErr: any) {
      if (scriptErr?.message && scriptErr.message.includes('Apps Script')) {
        throw scriptErr;
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch('/api/catalogs', {
    method: 'POST',
    headers,
    body: JSON.stringify({ spreadsheetId, scriptUrl }),
  });

  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Error del backend (${response.status})`);
  }

  return {
    areas: json.areas,
    colaboradores: json.colaboradores,
    encabezadosRendimientos: json.encabezadosRendimientos,
    spreadsheetId: json.spreadsheetId,
    lastUpdated: json.diagnostics?.lastChecked || new Date().toLocaleTimeString(),
    diagnostics: json.diagnostics,
  };
}

/**
 * Guarda registros aprobados en la hoja 'Rendimientos'.
 * Admite guardado directo mediante Google Apps Script (sin pedir cuenta a cada usuario)
 * o mediante Google Sheets API v4 con token OAuth del usuario.
 */
export async function saveRegistrosToGoogleSheets(
  accessToken: string | null,
  spreadsheetId: string,
  registros: YieldRecord[],
  fecha: string,
  semana: string,
  catalogos: CatalogData,
  scriptUrlOverride?: string
): Promise<{ guardados: number; message: string }> {
  const scriptUrl = scriptUrlOverride || getStoredScriptUrl();

  if (!accessToken && !scriptUrl) {
    throw new Error(
      'Se requiere conectar tu cuenta de Google o configurar la URL de Apps Script para guardar registros sin login.'
    );
  }

  if (!Array.isArray(registros) || registros.length === 0) {
    throw new Error('No hay registros para guardar.');
  }

  // Validar fecha y semana
  const dateValidation = validateDateInWeek(fecha, semana);
  if (!dateValidation.valid) {
    throw new Error(dateValidation.error || 'La fecha no corresponde a la semana indicada.');
  }

  const weekRange = getWeekRange(semana);
  const anio = weekRange.range ? weekRange.range.anio : 2026;

  const headers = catalogos.encabezadosRendimientos && catalogos.encabezadosRendimientos.length > 0
    ? catalogos.encabezadosRendimientos
    : REQUERIDOS_RENDIMIENTOS;

  const rowsToAppend: any[][] = [];

  for (let i = 0; i < registros.length; i++) {
    const r = registros[i];
    const codLimpio = normalizarCodigo(r.codigo);

    if (!codLimpio) {
      throw new Error(`Fila ${i + 1}: El código de colaborador está vacío.`);
    }

    const colaboradorEnMaestro = buscarColaboradorEnMaestro(codLimpio, catalogos.colaboradores);
    if (!colaboradorEnMaestro) {
      throw new Error(`Fila ${i + 1}: El código '${r.codigo}' no existe en el catálogo Maestro.`);
    }

    // Usar siempre el nombre oficial validado en la hoja Maestro
    const nombreOficial = colaboradorEnMaestro.Nombre;

    const areaEncontrada = buscarAreaEnCatalogo(r.areSup, catalogos.areas);
    if (!areaEncontrada) {
      throw new Error(`Fila ${i + 1} (${nombreOficial}): El área '${r.areSup}' no existe en el catálogo de áreas.`);
    }

    // Normalizar horas (convierte 12h tarde ej. 1:00 o 01:00 a 13:00, 2:30 a 14:30)
    const horaInicioNorm = normalizeTimeFormat(r.horaInicio, false) || '06:00';
    let horaFinNorm = normalizeTimeFormat(r.horaFin, true, horaInicioNorm);

    if (!horaFinNorm) {
      throw new Error(
        `Fila ${i + 1} (${nombreOficial}): Falta la Hora Fin. Por favor completa la hora de salida (ejemplo: 14:30).`
      );
    }

    const duracion = calculateDurationHours(horaInicioNorm, horaFinNorm);
    if (duracion === null || duracion <= 0) {
      throw new Error(
        `Fila ${i + 1} (${nombreOficial}): Hora Fin (${horaFinNorm}) debe ser posterior a Hora Inicio (${horaInicioNorm}).`
      );
    }

    const tallos = Number(r.tallos);
    if (!Number.isFinite(tallos) || tallos < 0 || !Number.isInteger(tallos)) {
      throw new Error(`Fila ${i + 1} (${nombreOficial}): Total Tallos debe ser un número entero mayor o igual a 0.`);
    }

    const rendimientoHora = duracion > 0 ? tallos / duracion : 0;
    const capturaId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `CAP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Cada registro lleva la fecha identificada para su día de la semana (domingo a sábado)
    let fechaRegistro = r.fecha || fecha;
    if (r.dia && semana) {
      const fechaPorDia = getDateForWeekDay(semana, r.dia);
      if (fechaPorDia) {
        fechaRegistro = fechaPorDia;
      }
    }

    const dateRowValidation = validateDateInWeek(fechaRegistro, semana);
    if (!dateRowValidation.valid) {
      const fechaSemana = r.dia ? getDateForWeekDay(semana, r.dia) : null;
      if (fechaSemana) {
        fechaRegistro = fechaSemana;
      } else {
        throw new Error(`Fila ${i + 1} (${nombreOficial}): ${dateRowValidation.error || 'La fecha no corresponde a la semana indicada.'}`);
      }
    }

    // Formato latinoamericano día/mes/año como la aplicación original (DD/MM/AAAA)
    const fechaPartes = fechaRegistro.split('-');
    const fechaFormateada = `${Number(fechaPartes[2])}/${Number(fechaPartes[1])}/${fechaPartes[0]}`;

    const recordValues: Record<string, any> = {
      Id_Captura: capturaId,
      Sede: areaEncontrada.Sede,
      AreSup: areaEncontrada.AreSup,
      Producto: areaEncontrada.Producto,
      'Código': colaboradorEnMaestro['Código'] || r.codigo,
      Colaborador: nombreOficial,
      Fecha: fechaFormateada,
      Año: anio,
      Sem: semana,
      'Hora Inicio': horaInicioNorm,
      'Hora Fin': horaFinNorm,
      Duración: Number(duracion.toFixed(2)),
      'Total Tallos': tallos,
      'Rendimiento Hora': Number(rendimientoHora.toFixed(2)),
    };

    const row = headers.map((h) => recordValues[h] ?? '');
    rowsToAppend.push(row);
  }

  // 1. Guardar vía Google Apps Script Web App (SIN requerir inicio de sesión a cada usuario)
  if (scriptUrl) {
    const response = await fetch('/api/save-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scriptUrl,
        spreadsheetId,
        rows: rowsToAppend,
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al guardar registros mediante Google Apps Script');
    }

    const rowsInserted = result.guardados || rowsToAppend.length;
    return {
      guardados: rowsInserted,
      message: `Se guardaron exitosamente ${rowsInserted} registro(s) en la hoja Rendimientos.`,
    };
  }

  if (!accessToken) {
    throw new Error('No hay sesión activa de Google ni URL de Apps Script configurada para guardar.');
  }

  // 2. Guardar vía Google Sheets API v4 (con token de usuario OAuth)
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Rendimientos!A:N:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(appendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: 'Rendimientos!A:N',
      majorDimension: 'ROWS',
      values: rowsToAppend,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Permiso denegado en Google Sheets (${response.status}): Tu sesión expiró o no tienes permiso de escritura en este archivo. Vuelve a iniciar sesión con tu cuenta de Google.`
      );
    }
    throw new Error(
      `Error al guardar en Google Sheets (${response.status}): ${
        errorData?.error?.message || response.statusText || 'Error de escritura'
      }`
    );
  }

  const result = await response.json();
  const rowsInserted = result.updates?.updatedRows || rowsToAppend.length;

  return {
    guardados: rowsInserted,
    message: `Se guardaron exitosamente ${rowsInserted} registro(s) en la hoja Rendimientos.`,
  };
}
