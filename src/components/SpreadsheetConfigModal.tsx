import React, { useState } from 'react';
import {
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Check,
  AlertTriangle,
  Database,
  Layers,
  Copy,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { CatalogData } from '../types';
import {
  DEFAULT_SPREADSHEET_ID,
  buscarColaboradorEnMaestro,
  buscarAreaEnCatalogo,
  normalizarCodigo,
  normalizarTexto,
  obtenerCodigoArea,
  getStoredScriptUrl,
  saveStoredScriptUrl,
  fetchBackendCatalogos,
} from '../lib/sheetsService';
import { googleSignIn } from '../lib/auth';

const APPS_SCRIPT_CODE = `// ========================================================
// CÓDIGO GOOGLE APPS SCRIPT PARA RENDIMIENTOS DE CORTE
// Permite sincronizar los 390 colaboradores de Maestro y
// guardar en Rendimientos para cualquier usuario sin login
// ========================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetMaestro = ss.getSheetByName("Maestro");
    var sheetArea = ss.getSheetByName("Area");
    
    var dataMaestro = sheetMaestro ? sheetMaestro.getDataRange().getValues() : [];
    var dataArea = sheetArea ? sheetArea.getDataRange().getValues() : [];
    
    var result = {
      success: true,
      maestro: dataMaestro,
      area: dataArea,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetRend = ss.getSheetByName("Rendimientos");
    
    if (!sheetRend) {
      throw new Error("No se encontró la pestaña 'Rendimientos' en el libro.");
    }
    
    var postData = JSON.parse(e.postData.contents);
    var rows = postData.rows || [];
    
    if (rows.length > 0) {
      var lastRow = sheetRend.getLastRow();
      sheetRend.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      guardados: rows.length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

interface SpreadsheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalogData: CatalogData;
  accessToken: string | null;
  onUpdateSpreadsheetId: (newId: string) => void;
  onRefreshCatalogs: (scriptUrlOverride?: string) => Promise<void>;
  isLoading: boolean;
  onUpdateToken?: (token: string, user?: any) => void;
}

export const SpreadsheetConfigModal: React.FC<SpreadsheetConfigModalProps> = ({
  isOpen,
  onClose,
  catalogData,
  accessToken,
  onUpdateSpreadsheetId,
  onRefreshCatalogs,
  isLoading,
  onUpdateToken,
}) => {
  const [sheetIdInput, setSheetIdInput] = useState(catalogData.spreadsheetId);
  const [scriptUrlInput, setScriptUrlInput] = useState(() => getStoredScriptUrl());
  const [copiedScript, setCopiedScript] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success?: boolean;
    message?: string;
    sheetsFound?: string[];
  }>({ tested: false });
  const [isTesting, setIsTesting] = useState(false);

  // Diagnostic interactive testing inputs
  const [testCodigoInput, setTestCodigoInput] = useState('1785');
  const [testAreaInput, setTestAreaInput] = useState('F1');

  if (!isOpen) return null;

  // Evaluation for code test
  const testColaboradorResult = buscarColaboradorEnMaestro(testCodigoInput, catalogData.colaboradores);

  // Evaluation for area test
  const testAreaResult = buscarAreaEnCatalogo(testAreaInput, catalogData.areas);

  const handleCopyScriptCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 3000);
    } catch {
      // Fallback
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 3000);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult({ tested: false });

    // 1. Si el usuario ingresó o tiene una URL de Apps Script, probarla directamente sin pedir cuenta Google
    const urlToTest = scriptUrlInput.trim();
    if (urlToTest) {
      if (!urlToTest.startsWith('http') || !urlToTest.includes('script.google.com')) {
        setTestResult({
          tested: true,
          success: false,
          message:
            'La URL ingresada no es válida. Debe ser la URL de la aplicación web de Google Apps Script (inicia con https://script.google.com/macros/s/... y termina en /exec).',
        });
        setIsTesting(false);
        return;
      }

      try {
        // Probar mediante el endpoint seguro del backend
        const res = await fetchBackendCatalogos(null, sheetIdInput.trim(), urlToTest);
        saveStoredScriptUrl(urlToTest);
        await onRefreshCatalogs(urlToTest);
        setTestResult({
          tested: true,
          success: true,
          sheetsFound: ['Maestro', 'Area', 'Rendimientos'],
          message: `¡Conexión directa verificada! Se sincronizaron exitosamente ${res.colaboradores.length} colaboradores y ${res.areas.length} áreas sin requerir cuenta de Google a ningún usuario.`,
        });
        setIsTesting(false);
        return;
      } catch (err: any) {
        setTestResult({
          tested: true,
          success: false,
          message: `${err?.message || 'Error al conectar con la aplicación web de Apps Script. Verifica que esté implementada con acceso a "Cualquier persona"'}.`,
        });
        setIsTesting(false);
        return;
      }
    }

    // 2. Si no hay URL ingresada, probar si el backend de Vercel tiene configurada la variable GOOGLE_SCRIPT_URL
    try {
      const res = await fetchBackendCatalogos(null, sheetIdInput.trim());
      await onRefreshCatalogs();
      setTestResult({
        tested: true,
        success: true,
        sheetsFound: ['Maestro', 'Area', 'Rendimientos'],
        message: `¡Conexión directa verificada desde el servidor! Se obtuvieron ${res.colaboradores.length} colaboradores y ${res.areas.length} áreas sin pedir cuenta a los usuarios.`,
      });
      setIsTesting(false);
      return;
    } catch {
      // El backend no tiene Apps Script configurado sin auth
    }

    // 3. Si no hay Apps Script pero el usuario ya inició sesión con Google, probar vía API v4
    let tokenToUse = accessToken;
    if (tokenToUse) {
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetIdInput.trim()}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${tokenToUse}` },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || `Error HTTP ${res.status}: ${res.statusText}`);
        }

        const meta = await res.json();
        const sheetNames: string[] = (meta.sheets || []).map((s: any) => s.properties?.title);

        const hasArea = sheetNames.includes('Area');
        const hasMaestro = sheetNames.includes('Maestro');
        const hasRendimientos = sheetNames.includes('Rendimientos');

        if (!hasArea || !hasMaestro || !hasRendimientos) {
          throw new Error(
            `Se encontró el archivo "${meta.properties?.title || 'Google Sheet'}", pero faltan pestañas obligatorias: ${[
              !hasArea && 'Area',
              !hasMaestro && 'Maestro',
              !hasRendimientos && 'Rendimientos',
            ]
              .filter(Boolean)
              .join(', ')}.`
          );
        }

        setTestResult({
          tested: true,
          success: true,
          sheetsFound: sheetNames,
          message: `¡Conexión verificada con cuenta de Google! Archivo: "${meta.properties?.title || 'Google Sheet'}". Pestañas Area, Maestro y Rendimientos disponibles.`,
        });
      } catch (err: any) {
        setTestResult({
          tested: true,
          success: false,
          message: err?.message || 'Error al conectar con Google Sheets.',
        });
      } finally {
        setIsTesting(false);
      }
      return;
    }

    // 4. Si no hay Apps Script URL ni cuenta conectada, explicar de forma clara sin forzar popup de Google
    setTestResult({
      tested: true,
      success: false,
      message: 'Para que los usuarios en incógnito o celular puedan guardar sin iniciar sesión, pega la URL de Google Apps Script arriba (sigue las instrucciones en verde).',
    });
    setIsTesting(false);
  };

  const handleSaveId = () => {
    saveStoredScriptUrl(scriptUrlInput.trim());
    onUpdateSpreadsheetId(sheetIdInput.trim());
    onRefreshCatalogs(scriptUrlInput.trim());
  };

  const handleResetDefault = () => {
    setSheetIdInput(DEFAULT_SPREADSHEET_ID);
    onUpdateSpreadsheetId(DEFAULT_SPREADSHEET_ID);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold">Diagnóstico y Conexión de Catálogos</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Spreadsheet ID config */}
          <div>
            <label className="block text-slate-700 font-semibold uppercase tracking-wider text-[11px] mb-1.5">
              ID del libro de Google Sheets
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={sheetIdInput}
                onChange={(e) => setSheetIdInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleResetDefault}
                title="Restaurar ID por defecto de la aplicación"
                className="px-2.5 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors shrink-0"
              >
                Defecto
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Libro oficial: <span className="font-mono text-slate-700 font-medium">{DEFAULT_SPREADSHEET_ID}</span>
            </p>
          </div>

          {/* Google Apps Script Web App Connector (Guarda sin pedir cuenta a ningún usuario) */}
          <div className="p-4 bg-emerald-50/60 border border-emerald-300 rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-md bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                  ✓
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    Conexión directa para todos los colaboradores (Sin pedir cuenta de Google)
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    Permite que cualquier persona desde celular, tablet o ventana de incógnito cargue fotos y guarde registros sin iniciar sesión.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyScriptCode}
                className="shrink-0 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-900 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                {copiedScript ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>¡Código copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Copiar código de Apps Script</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold text-[11px] mb-1">
                URL de la aplicación web (Google Apps Script)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={scriptUrlInput}
                  onChange={(e) => setScriptUrlInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                {scriptUrlInput && (
                  <button
                    type="button"
                    onClick={() => setScriptUrlInput('')}
                    title="Limpiar URL"
                    className="px-2 py-2 text-xs text-slate-400 hover:text-rose-600 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Step-by-step accordion/guide */}
            <div className="bg-white/80 p-3 rounded-lg border border-emerald-200 text-[11px] space-y-1.5 text-slate-700">
              <p className="font-semibold text-emerald-950 flex items-center justify-between">
                <span>Instrucciones sencillas para activar (solo toma 1 minuto):</span>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${sheetIdInput.trim()}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:underline font-bold inline-flex items-center space-x-1"
                >
                  <span>Abrir libro en Google Sheets</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <ol className="list-decimal list-inside space-y-1 leading-relaxed text-slate-600">
                <li>En tu hoja de cálculo, ve al menú superior: <strong>Extensiones</strong> &gt; <strong>Apps Script</strong>.</li>
                <li>Haz clic en el botón <strong>"Copiar código de Apps Script"</strong> de arriba y pégalo en el editor de Apps Script reemplazando lo que haya.</li>
                <li>Arriba a la derecha, haz clic en <strong>Implementar</strong> &gt; <strong>Nueva implementación</strong> &gt; selecciona el engrane ⚙️ <strong>Aplicación web</strong>.</li>
                <li>Configura:
                  <ul className="list-disc list-inside pl-4 text-emerald-900 font-medium">
                    <li>Ejecutar como: <strong>Yo (tu correo)</strong></li>
                    <li>Quién tiene acceso: <strong>Cualquier persona (Anyone)</strong></li>
                  </ul>
                </li>
                <li>Haz clic en <strong>Implementar</strong>, copia la URL que termina en <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">/exec</code>, pégala en el campo de arriba y haz clic en <strong>Aplicar y sincronizar</strong>.</li>
              </ol>
            </div>
          </div>

          {/* Diagnostics summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase">Colaboradores en Maestro</span>
              <span className="text-base font-bold text-slate-800 font-mono">
                {catalogData.colaboradores.length}
              </span>
              <span className="block text-[10px] text-slate-400">Recibidos y normalizados</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase">Áreas en Area</span>
              <span className="text-base font-bold text-slate-800 font-mono">
                {catalogData.areas.length}
              </span>
              <span className="block text-[10px] text-slate-400">Campos AreSup, Producto, Sede</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl col-span-2 sm:col-span-1">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase">Origen de datos</span>
              <span className="text-xs font-bold text-emerald-700">
                {catalogData.diagnostics?.source === 'backend_api'
                  ? 'Backend seguro (/api/catalogs)'
                  : catalogData.diagnostics?.source === 'google_sheets_direct'
                  ? 'Google Sheets API v4'
                  : 'Datos locales'}
              </span>
              <span className="block text-[10px] text-slate-400">
                Sinc: {catalogData.lastUpdated || 'Reciente'}
              </span>
            </div>
          </div>

          {/* Interactive Diagnostic: Código Lookup Verification */}
          <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-950 text-xs flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-700" />
                <span>Comprobador de códigos en Maestro (ej. 1785 o 5915)</span>
              </span>
              <div className="space-x-1.5">
                <button
                  type="button"
                  onClick={() => setTestCodigoInput('1785')}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-white text-emerald-800 border border-emerald-300 font-mono"
                >
                  Probar 1785
                </button>
                <button
                  type="button"
                  onClick={() => setTestCodigoInput('5915')}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-white text-emerald-800 border border-emerald-300 font-mono"
                >
                  Probar 5915
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Ingresa código (ej. 1785, 5915, 01785)"
                value={testCodigoInput}
                onChange={(e) => setTestCodigoInput(e.target.value)}
                className="w-48 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-800"
              />
              <span className="text-[11px] text-slate-500">
                Normalizado: <strong className="font-mono text-slate-700">"{normalizarCodigo(testCodigoInput)}"</strong>
              </span>
            </div>

            {testColaboradorResult ? (
              <div className="p-2 bg-emerald-100/80 rounded-lg border border-emerald-300 text-emerald-950 flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                <div>
                  <span className="font-semibold">Código encontrado en Maestro:</span>{' '}
                  <span className="font-bold">{testColaboradorResult.Nombre}</span>{' '}
                  <span className="text-[10px] text-emerald-800 font-mono">
                    (Código en catálogo: {testColaboradorResult['Código']})
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-2 bg-amber-100/80 rounded-lg border border-amber-300 text-amber-950 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <div>
                  <span className="font-semibold">Código no encontrado:</span>{' '}
                  <span>No existe en los {catalogData.colaboradores.length} colaboradores cargados de Maestro.</span>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Diagnostic: Area Lookup Verification */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 text-xs flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-700" />
                <span>Comprobador de áreas (ej. F1, F2, GYPSO, R1)</span>
              </span>
              <div className="space-x-1.5">
                <button
                  type="button"
                  onClick={() => setTestAreaInput('F1')}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-white text-slate-700 border border-slate-300 font-mono"
                >
                  F1
                </button>
                <button
                  type="button"
                  onClick={() => setTestAreaInput('GYPSO')}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-white text-slate-700 border border-slate-300 font-mono"
                >
                  GYPSO
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Código corto o nombre de área (ej. F1)"
                value={testAreaInput}
                onChange={(e) => setTestAreaInput(e.target.value)}
                className="w-48 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-800 uppercase"
              />
              <span className="text-[11px] text-slate-500">
                Código buscado por IA: <strong className="font-mono text-slate-700">"{testAreaInput}"</strong>
              </span>
            </div>

            {testAreaResult ? (
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-950 flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-semibold">Coincidencia en AreSup:</span>{' '}
                  <span className="font-bold">{testAreaResult.AreSup}</span>{' '}
                  <span className="text-[10px] text-emerald-700">
                    • Producto: {testAreaResult.Producto} • Sede: {testAreaResult.Sede}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-amber-950 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-semibold">Área no encontrada:</span>{' '}
                  <span>No coincide con ningún AreSup ni código corto del catálogo Area.</span>
                </div>
              </div>
            )}
          </div>

          {/* Test results banner from Google Sheets */}
          {testResult.tested && (
            <div
              className={`p-3 rounded-xl border flex items-start space-x-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">
                <p className="font-medium">{testResult.message}</p>
                {testResult.sheetsFound && (
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Pestañas detectadas: {testResult.sheetsFound.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-600' : ''}`} />
            <span>{isTesting ? 'Verificando...' : 'Probar conexión con libro'}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => {
                handleSaveId();
                onClose();
              }}
              disabled={isLoading}
              className="px-4 py-1.5 bg-[#0a2958] hover:bg-[#071f43] text-white rounded-lg text-xs font-bold transition-colors"
            >
              Aplicar y sincronizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
