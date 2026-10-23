import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { PhotoUploadSection } from './components/PhotoUploadSection';
import { YieldTableSection } from './components/YieldTableSection';
import { SaveConfirmationModal } from './components/SaveConfirmationModal';
import { PhotoViewerModal } from './components/PhotoViewerModal';
import { SpreadsheetConfigModal } from './components/SpreadsheetConfigModal';
import { UnauthorizedDomainModal } from './components/UnauthorizedDomainModal';
import {
  OCRPhoto,
  YieldRecord,
  CatalogData,
  OCRResponseData,
} from './types';
import {
  DEFAULT_SPREADSHEET_ID,
  SEED_AREAS,
  SEED_COLABORADORES,
  REQUERIDOS_RENDIMIENTOS,
  fetchGoogleSheetsCatalogos,
  fetchBackendCatalogos,
  saveRegistrosToGoogleSheets,
  buscarColaboradorEnMaestro,
  buscarAreaEnCatalogo,
  normalizarCodigo,
  normalizarTexto,
  obtenerCodigoArea,
  getStoredScriptUrl,
} from './lib/sheetsService';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  getStoredAccessToken,
} from './lib/auth';
import {
  getCurrentWeekCode,
  calculateDurationHours,
  calculateHourlyYield,
  validateDateInWeek,
  normalizeTimeFormat,
  getDayOfWeekName,
  getDateForWeekDay,
} from './lib/dateUtils';

import { AlertCircle, CheckCircle2, ShieldCheck, Database, Layers, ExternalLink } from 'lucide-react';

export default function App() {
  // Authentication & Google Workspace state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());

  // Catalogs state - Carga instantánea de caché persistente de Maestro
  const [catalogData, setCatalogData] = useState<CatalogData>(() => {
    try {
      const cached = localStorage.getItem('maestro_catalogs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.colaboradores) && parsed.colaboradores.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return {
      areas: SEED_AREAS,
      colaboradores: SEED_COLABORADORES,
      encabezadosRendimientos: REQUERIDOS_RENDIMIENTOS,
      spreadsheetId: DEFAULT_SPREADSHEET_ID,
      lastUpdated: 'Datos locales de inicio',
      diagnostics: {
        source: 'local_seed',
        totalColaboradores: SEED_COLABORADORES.length,
        totalAreas: SEED_AREAS.length,
        sampleCodigos: ['10452', '1785', '5915'],
        sampleAreas: ['F1', 'F2', 'GYPSO', 'R1'],
        headerArea: ['AreSup', 'Producto', 'Sede'],
        headerMaestro: ['Código', 'Nombre'],
        hasExactCodigoHeader: true,
        hasExactNombreHeader: true,
        lastChecked: 'Inicial',
      },
    };
  });
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);

  // Photos state (Section 1)
  const [photos, setPhotos] = useState<OCRPhoto[]>([]);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrStatusMessage, setOcrStatusMessage] = useState('');
  const [selectedPhotoForView, setSelectedPhotoForView] = useState<OCRPhoto | null>(null);

  // Week and Representative Date state (derived from formats)
  const initialDateWeek = getCurrentWeekCode();
  const [semana, setSemana] = useState<string>(initialDateWeek.semana);
  const initialMonday = getDateForWeekDay(initialDateWeek.semana, 'Lunes') || initialDateWeek.fecha;
  const [fecha, setFecha] = useState<string>(initialMonday);
  const [observacionesGenerales, setObservacionesGenerales] = useState<string>('');

  // Records state - Inicia vacío para carga de nuevas fotos o entrada manual
  const [records, setRecords] = useState<YieldRecord[]>([]);



  // Save Modal state (Section 4)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Spreadsheet config modal
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);

  // Unauthorized Domain helper modal (for Vercel deployment)
  const [unauthorizedDomainModal, setUnauthorizedDomainModal] = useState<{
    isOpen: boolean;
    domain: string;
    projectId: string;
  } | null>(null);

  // Notifications
  const [globalNotification, setGlobalNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setGlobalNotification({ type, message });
    setTimeout(() => {
      setGlobalNotification((prev) => (prev?.message === message ? null : prev));
    }, 7000);
  };

  // 1. Auto-sync catalogs on mount (via Apps Script or backend without requiring user login)
  useEffect(() => {
    const stored = getStoredAccessToken();
    if (stored) {
      setAccessToken(stored);
    }
    // Sincronizar catálogos inmediatamente sin forzar inicio de sesión
    loadCatalogsFromSheets(stored, catalogData.spreadsheetId);

    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        if (token) {
          loadCatalogsFromSheets(token, catalogData.spreadsheetId);
        }
      },
      () => {
        const storedToken = getStoredAccessToken();
        if (storedToken) {
          setAccessToken(storedToken);
        } else {
          setUser(null);
          setAccessToken(null);
        }
      }
    );
    return () => unsubscribe();
  }, [catalogData.spreadsheetId]);

  // Load catalogs: tries backend first (with Apps Script or GOOGLE_SCRIPT_URL), with fallback to direct Google Sheets API v4
  const loadCatalogsFromSheets = useCallback(
    async (token: string | null, sheetId: string, scriptUrlOverride?: string) => {
      const activeToken = token || getStoredAccessToken();
      const scriptUrl = scriptUrlOverride || getStoredScriptUrl();

      setIsLoadingCatalogs(true);
      try {
        let liveData: CatalogData;
        try {
          // Consultar a través del endpoint seguro del backend (soporta scriptUrl o variable de entorno de Vercel)
          liveData = await fetchBackendCatalogos(activeToken, sheetId, scriptUrl);
        } catch (backendErr) {
          if (activeToken) {
            console.warn('Backend catalogs endpoint falló, consultando Sheets directamente:', backendErr);
            liveData = await fetchGoogleSheetsCatalogos(activeToken, sheetId);
          } else {
            throw backendErr;
          }
        }

        setCatalogData(liveData);

        // Guardar en caché persistente para sincronización instantánea futura
        try {
          localStorage.setItem('maestro_catalogs_cache', JSON.stringify(liveData));
        } catch {}

        // Re-validar filas existentes con el nuevo catálogo cargado
        setRecords((prev) =>
          prev.map((r) => {
            const codLimpio = normalizarCodigo(r.codigo);
            const colab = buscarColaboradorEnMaestro(codLimpio, liveData.colaboradores);
            const areaReal = buscarAreaEnCatalogo(r.areSup, liveData.areas);
            return {
              ...r,
              colaborador: colab ? colab.Nombre : r.colaborador,
              areSup: areaReal ? areaReal.AreSup : r.areSup,
            };
          })
        );

        showNotification(
          'success',
          `Maestro sincronizado: ${liveData.colaboradores.length} colaboradores y ${liveData.areas.length} áreas cargadas.`
        );
      } catch (error: any) {
        console.warn('Sincronización inicial silenciosa:', error?.message);
      } finally {
        setIsLoadingCatalogs(false);
      }
    },
    []
  );

  const handleRefreshCatalogs = async (scriptUrlOverride?: string) => {
    setIsLoadingCatalogs(true);
    try {
      const scriptUrl = scriptUrlOverride || getStoredScriptUrl();
      let tokenToUse = accessToken || getStoredAccessToken();

      try {
        await loadCatalogsFromSheets(tokenToUse, catalogData.spreadsheetId, scriptUrl);
        return;
      } catch (fetchErr) {
        // Si falló y no hay token ni scriptUrl, ofrecer inicio de sesión con Google si el usuario lo desea
        if (!tokenToUse && !scriptUrl) {
          const signResult = await googleSignIn();
          if (signResult?.accessToken) {
            tokenToUse = signResult.accessToken;
            setUser(signResult.user);
            setAccessToken(tokenToUse);
            await loadCatalogsFromSheets(tokenToUse, catalogData.spreadsheetId);
            return;
          }
        }
        throw fetchErr;
      }
    } catch (err: any) {
      console.error('Error al sincronizar catálogos:', err);
      if (err?.isUnauthorizedDomain || String(err?.message || '').includes('unauthorized-domain')) {
        setUnauthorizedDomainModal({
          isOpen: true,
          domain: err?.domain || window.location.hostname,
          projectId: err?.projectId || 'gen-lang-client-0073264808',
        });
        return;
      }
      showNotification(
        'error',
        `No se pudieron sincronizar los catálogos: ${err?.message || 'Error de conexión o permisos'}.`
      );
    } finally {
      setIsLoadingCatalogs(false);
    }
  };

  // Google Sign In
  const handleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        showNotification('success', `Sesión iniciada como ${result.user.email || 'usuario'}.`);
        await loadCatalogsFromSheets(result.accessToken, catalogData.spreadsheetId);
      }
    } catch (err: any) {
      if (err?.isUnauthorizedDomain || String(err?.message || '').includes('unauthorized-domain')) {
        setUnauthorizedDomainModal({
          isOpen: true,
          domain: err?.domain || window.location.hostname,
          projectId: err?.projectId || 'gen-lang-client-0073264808',
        });
        return;
      }
      showNotification('error', `Error al iniciar sesión: ${err?.message || 'Ventana emergente cerrada'}`);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    showNotification('info', 'Sesión cerrada. Ahora estás en modo de vista previa local.');
  };

  // --- Photo handling ---
  const handleAddPhotos = (incomingFiles: FileList | File[]) => {
    const list = Array.from(incomingFiles);
    const remainingSlots = 6 - photos.length;

    if (remainingSlots <= 0) {
      showNotification('info', 'Por ahora puedes procesar un máximo de 6 fotografías por lote.');
      return;
    }

    const filesToAdd = list.slice(0, remainingSlots);
    if (list.length > remainingSlots) {
      showNotification('info', `Se agregaron ${remainingSlots} fotografías para no exceder el límite de 6.`);
    }

    const newPhotos: OCRPhoto[] = filesToAdd.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
    setOcrStatusMessage(`${photos.length + newPhotos.length} fotografía(s) preparadas para lectura.`);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => {
      const copy = [...prev];
      const removed = copy.splice(index, 1)[0];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  };

  const handleClearPhotos = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setOcrStatusMessage('');
  };

  // Optimiza y comprime fotografías a resolución adecuada para OCR manteniendo nitidez (JPEG ~350KB)
  const fileToOptimizedBase64 = (file: File): Promise<{ mimeType: string; data: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Límite de dimensión 1200px: óptimo para lectura OCR de caligrafía y transmisión rápida
          const MAX_DIM = 1200;
          let width = img.width;
          let height = img.height;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            const raw = String(reader.result || '');
            const sep = raw.indexOf(',');
            resolve({
              mimeType: file.type || 'image/jpeg',
              data: sep !== -1 ? raw.substring(sep + 1) : raw,
            });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          const sep = dataUrl.indexOf(',');
          resolve({
            mimeType: 'image/jpeg',
            data: dataUrl.substring(sep + 1),
          });
        };

        img.onerror = () => {
          const raw = String(reader.result || '');
          const sep = raw.indexOf(',');
          resolve({
            mimeType: file.type || 'image/jpeg',
            data: sep !== -1 ? raw.substring(sep + 1) : raw,
          });
        };

        img.src = String(reader.result || '');
      };

      reader.onerror = () => reject(new Error(`Error al leer archivo ${file.name}`));
      reader.readAsDataURL(file);
    });
  };

  // OCR Processing with Gemini via Backend
  const handleStartOCR = async () => {
    if (photos.length === 0) {
      showNotification('info', 'Selecciona al menos una fotografía de formato manuscrito.');
      return;
    }

    setIsProcessingOCR(true);
    setOcrStatusMessage('Optimizando fotografías para análisis nítido...');

    try {
      const convertedImages = await Promise.all(photos.map((p) => fileToOptimizedBase64(p.file)));

      setOcrStatusMessage('Gemini está analizando caligrafía, códigos, horarios y tallos...');

      const response = await fetch('/api/ocr-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: convertedImages }),
      });

      const rawText = await response.text();
      let result: any;

      try {
        result = JSON.parse(rawText);
      } catch {
        if (rawText.includes('FUNCTION_INVOCATION_FAILED')) {
          throw new Error(
            'La función de Vercel falló al ejecutarse. Asegúrate de haber agregado la variable GEMINI_API_KEY en Vercel (Project Settings > Environment Variables) y que la función tenga tiempo suficiente para responder.'
          );
        }
        if (rawText.includes('<!doctype') || rawText.includes('<html') || response.status === 502 || response.status === 504) {
          throw new Error(
            'El servidor de análisis tardó más de lo esperado en procesar las imágenes. Por favor intenta procesar un lote menor (ej. 2 a 4 fotos) o verifica que las imágenes sean nítidas.'
          );
        }
        const cleanMsg = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        throw new Error(
          `Respuesta no esperada del servidor (${response.status}): ${cleanMsg.substring(0, 160) || 'Error desconocido'}`
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Error del servidor (${response.status})`);
      }

      const ocrData: OCRResponseData = result.data;
      processOCRResult(ocrData);
    } catch (error: any) {
      console.error('Error al procesar fotografías:', error);
      const msg = `No se pudieron leer las fotografías: ${error?.message || 'Error de conexión'}`;
      setOcrStatusMessage(msg);
      showNotification('error', msg);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // Map OCR Data to App State using verified normalization & lookups
  const processOCRResult = (ocrData: OCRResponseData) => {
    const effectiveSemana = /^\d{4}$/.test(String(ocrData.semana || ''))
      ? String(ocrData.semana)
      : semana;

    if (effectiveSemana) {
      setSemana(effectiveSemana);
    }

    if (ocrData.observacionesGenerales) {
      setObservacionesGenerales(ocrData.observacionesGenerales);
    }

    if (!Array.isArray(ocrData.registros) || ocrData.registros.length === 0) {
      setOcrStatusMessage('No se reconocieron colaboradores legibles. Verifica la nitidez de las fotos.');
      showNotification('info', 'No se detectaron filas de colaboradores en las imágenes.');
      return;
    }

    let countDoubtful = 0;
    let fechaRepresentativa = '';

    const mappedRows: YieldRecord[] = ocrData.registros.map((item, index) => {
      const rawCod = String(item.codigo || '').trim();
      const colabEncontrado = buscarColaboradorEnMaestro(rawCod, catalogData.colaboradores);
      const nombreColaborador = colabEncontrado ? colabEncontrado.Nombre : '';

      const rawArea = String(item.area || '').trim();
      const areaEncontrada = buscarAreaEnCatalogo(rawArea, catalogData.areas);
      // Asignar exclusivamente el código de área limpio identificado en la foto (ej. F1, GYPSO, etc.)
      const areSupReal = areaEncontrada ? obtenerCodigoArea(areaEncontrada.AreSup) : rawArea;

      const horaInicio = normalizeTimeFormat(item.horaInicio, false) || '06:00';
      const horaFin = normalizeTimeFormat(item.horaFin, true, horaInicio);

      const tallos =
        item.tallos !== null &&
        item.tallos !== undefined &&
        Number.isInteger(Number(item.tallos)) &&
        Number(item.tallos) >= 0
          ? Number(item.tallos)
          : null;

      const duracion = calculateDurationHours(horaInicio, horaFin) || 0;
      const rendimiento = calculateHourlyYield(tallos, duracion);

      const obsArr: string[] = [];
      if (item.observaciones) obsArr.push(item.observaciones.trim());
      if (rawCod && !colabEncontrado) {
        obsArr.push(`Código '${rawCod}' no encontrado en Maestro`);
      }
      if (rawArea && !areaEncontrada) {
        obsArr.push(`Área reconocida '${rawArea}' no coincide con catálogo`);
      }
      const observaciones = obsArr.join(' • ');

      if (!rawCod || !nombreColaborador || !areSupReal || !horaFin || tallos === null || observaciones) {
        countDoubtful++;
      }

      // Identificar día de la semana y calcular fecha exacta según la semana del formato (Domingo a Sábado)
      let rowDia = item.dia || (item.fecha ? getDayOfWeekName(item.fecha) : getDayOfWeekName(fecha)) || 'Lunes';
      let rowFecha = item.fecha || ocrData.fecha || fecha;

      if (rowDia && effectiveSemana) {
        const fechaCalculada = getDateForWeekDay(effectiveSemana, rowDia);
        if (fechaCalculada) {
          rowFecha = fechaCalculada;
        }
      }

      if (!fechaRepresentativa) {
        fechaRepresentativa = rowFecha;
      }

      return {
        id: `ocr-${Date.now()}-${index}`,
        codigo: rawCod,
        colaborador: nombreColaborador,
        areSup: areSupReal,
        dia: rowDia,
        fecha: rowFecha,
        horaInicio,
        horaFin,
        tallos,
        duracion,
        rendimiento,
        observaciones,
        isDoubtful: Boolean(observaciones || !nombreColaborador || !areSupReal),
      };
    });

    if (fechaRepresentativa) {
      setFecha(fechaRepresentativa);
    }

    // Replace rows
    setRecords(mappedRows);

    const msg = `Lectura completada: ${mappedRows.length} colaboradores reconocidos. ${
      countDoubtful > 0
        ? `Se detectaron ${countDoubtful} campos con dudas u observaciones para revisión.`
        : 'Todos los campos se reconocieron con claridad.'
    }`;
    setOcrStatusMessage(msg);
    showNotification('success', msg);
  };

  const handleSemanaChange = (newSemana: string) => {
    setSemana(newSemana);
    if (/^\d{4}$/.test(newSemana)) {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.dia) {
            const nuevaFecha = getDateForWeekDay(newSemana, r.dia);
            if (nuevaFecha) {
              return { ...r, fecha: nuevaFecha };
            }
          }
          return r;
        })
      );
    }
  };

  // --- Records editing ---
  const handleUpdateRecord = (id: string, field: keyof YieldRecord, value: any) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        // Recalculate duration and yield if hours or tallos change
        if (field === 'horaInicio' || field === 'horaFin' || field === 'tallos') {
          const normInicio = normalizeTimeFormat(updated.horaInicio, false) || '06:00';
          const normFin = normalizeTimeFormat(updated.horaFin, true, normInicio);
          const dur = calculateDurationHours(normInicio, normFin) || 0;
          updated.duracion = dur;
          updated.rendimiento = calculateHourlyYield(updated.tallos, dur);
        }
        return updated;
      })
    );
  };

  const handleAutoFillMissingHours = (defaultHour = '14:30') => {

    let fixedCount = 0;
    setRecords((prev) =>
      prev.map((r) => {
        const normInicio = normalizeTimeFormat(r.horaInicio, false) || '06:00';
        let normFin = normalizeTimeFormat(r.horaFin, true, normInicio);
        let dur = calculateDurationHours(normInicio, normFin);

        if (!normFin || dur === null || dur <= 0) {
          normFin = defaultHour;
          dur = calculateDurationHours(normInicio, normFin) || 0;
          fixedCount++;
        }

        return {
          ...r,
          horaInicio: normInicio,
          horaFin: normFin,
          duracion: dur || 0,
          rendimiento: calculateHourlyYield(r.tallos, dur || 0),
        };
      })
    );
    setSaveError(null);
    showNotification(
      'info',
      `Se ajustaron las horas de la jornada y se completaron ${fixedCount} colaboradores con hora de fin ${defaultHour}.`
    );
  };

  const handleAddRecord = () => {
    const defaultDia = 'Lunes';
    const defaultFecha = semana ? (getDateForWeekDay(semana, defaultDia) || fecha) : fecha;
    const newRecord: YieldRecord = {
      id: `manual-${Date.now()}`,
      codigo: '',
      colaborador: '',
      areSup: catalogData.areas[0] ? obtenerCodigoArea(catalogData.areas[0].AreSup) : 'F1',
      dia: defaultDia,
      fecha: defaultFecha,
      horaInicio: '06:00',
      horaFin: '14:30',
      tallos: null,
      duracion: 8.5,
      rendimiento: 0,
    };
    setRecords((prev) => [...prev, newRecord]);
  };


  const handleRemoveRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDuplicateRecord = (record: YieldRecord) => {
    const duplicated: YieldRecord = {
      ...record,
      id: `dup-${Date.now()}`,
    };
    setRecords((prev) => [...prev, duplicated]);
  };

  // --- Saving to Google Sheets ---
  const handleConfirmSave = async () => {
    setSaveError(null);
    const scriptUrl = getStoredScriptUrl();
    let tokenToUse = accessToken || getStoredAccessToken();

    setIsSaving(true);
    try {
      const result = await saveRegistrosToGoogleSheets(
        tokenToUse,
        catalogData.spreadsheetId,
        records,
        fecha,
        semana,
        catalogData,
        scriptUrl
      );

      setIsSaveModalOpen(false);
      setSaveError(null);
      showNotification('success', result.message);

      // Clear records or offer reset
      setRecords([]);
      setPhotos([]);
      setOcrStatusMessage(`Guardado exitoso: ${result.guardados} registros en Google Sheets.`);
    } catch (error: any) {
      console.error('Error al guardar registros:', error);
      const errMsg = error?.message || 'Error al guardar en Google Sheets.';

      if (!tokenToUse && !scriptUrl) {
        setSaveError(
          'Para que cualquier usuario pueda guardar sin cuenta de Google, abre "Configuración y diagnóstico del libro" y pega la URL de Google Apps Script Web App.'
        );
      } else {
        setSaveError(errMsg);
      }
      showNotification('error', `No se pudieron guardar los registros: ${errMsg}`);
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        onOpenSpreadsheetModal={() => setIsSpreadsheetModalOpen(true)}
      />

      {/* Global Notification Toast (Floating bottom right) */}
      {globalNotification && (
        <div className="fixed bottom-5 right-5 z-[100] max-w-md animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`p-4 rounded-xl shadow-lg border flex items-start space-x-3 ${
              globalNotification.type === 'success'
                ? 'bg-emerald-900 text-emerald-50 border-emerald-700'
                : globalNotification.type === 'error'
                ? 'bg-rose-900 text-rose-50 border-rose-700'
                : 'bg-slate-900 text-slate-50 border-slate-700'
            }`}
          >
            {globalNotification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : globalNotification.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="text-xs leading-relaxed font-medium">
              {globalNotification.message}
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Section 1: Photos */}
        <PhotoUploadSection
          photos={photos}
          isProcessing={isProcessingOCR}
          statusMessage={ocrStatusMessage}
          onAddPhotos={handleAddPhotos}
          onRemovePhoto={handleRemovePhoto}
          onClearPhotos={handleClearPhotos}
          onStartOCR={handleStartOCR}
          onViewPhoto={(photo) => setSelectedPhotoForView(photo)}
        />

        {/* Section 2: Yields Review Table */}
        <YieldTableSection
          records={records}
          catalogData={catalogData}
          fecha={fecha}
          semana={semana}
          observacionesGenerales={observacionesGenerales}
          onUpdateRecord={handleUpdateRecord}
          onAddRecord={handleAddRecord}
          onRemoveRecord={handleRemoveRecord}
          onDuplicateRecord={handleDuplicateRecord}
          onOpenSaveModal={() => {
            setSaveError(null);
            setIsSaveModalOpen(true);
          }}
          onAutoFillMissingHours={handleAutoFillMissingHours}
          onSemanaChange={handleSemanaChange}
        />


      </main>

      {/* Section 4 Confirmation Modal */}
      <SaveConfirmationModal
        isOpen={isSaveModalOpen}
        onClose={() => {
          setIsSaveModalOpen(false);
          setSaveError(null);
        }}
        records={records}
        fecha={fecha}
        semana={semana}
        catalogData={catalogData}
        onConfirmSave={handleConfirmSave}
        isSaving={isSaving}
        saveError={saveError}
        onAutoFillHours={handleAutoFillMissingHours}
        onSignIn={handleSignIn}
        hasAccessToken={Boolean(accessToken || getStoredAccessToken())}
        hasScriptUrl={Boolean(getStoredScriptUrl())}
      />

      {/* Photo Viewer Modal */}
      <PhotoViewerModal
        photo={selectedPhotoForView}
        onClose={() => setSelectedPhotoForView(null)}
      />

      {/* Spreadsheet Configuration & Diagnostics Modal */}
      <SpreadsheetConfigModal
        isOpen={isSpreadsheetModalOpen}
        onClose={() => setIsSpreadsheetModalOpen(false)}
        catalogData={catalogData}
        accessToken={accessToken}
        onUpdateSpreadsheetId={(newId) =>
          setCatalogData((prev) => ({ ...prev, spreadsheetId: newId }))
        }
        onRefreshCatalogs={handleRefreshCatalogs}
        isLoading={isLoadingCatalogs}
        onUpdateToken={(tok, usr) => {
          setAccessToken(tok);
          if (usr) setUser(usr);
        }}
      />

      {/* Unauthorized Domain Modal (Firebase configuration helper for Vercel) */}
      {unauthorizedDomainModal && (
        <UnauthorizedDomainModal
          isOpen={unauthorizedDomainModal.isOpen}
          onClose={() => setUnauthorizedDomainModal(null)}
          domain={unauthorizedDomainModal.domain}
          projectId={unauthorizedDomainModal.projectId}
          onRetry={() => {
            setUnauthorizedDomainModal(null);
            handleRefreshCatalogs();
          }}
        />
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Rendimientos de Corte • Sincronización automática con Google Sheets</span>
          <button
            type="button"
            onClick={() => setIsSpreadsheetModalOpen(true)}
            className="text-slate-400 hover:text-[#0a2958] hover:underline inline-flex items-center space-x-1 font-medium transition-colors"
          >
            <span>Configuración y diagnóstico del libro</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </footer>
    </div>
  );
}
