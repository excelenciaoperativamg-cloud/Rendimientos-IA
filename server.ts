import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// High body limit to support up to 6 high-resolution photos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS for API requests (especially for Vercel preview & custom domains)
app.use((req: Request, res: Response, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Capture and format JSON body parser errors as JSON (never HTML)
app.use((err: any, _req: Request, res: Response, next: any) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      error: 'Las fotografías son demasiado pesadas para el servidor. La aplicación las optimizará automáticamente antes de enviar.',
    });
  }
  if (err && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Formato de datos JSON inválido en la solicitud.' });
  }
  next(err);
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

interface ImageDataInput {
  mimeType: string;
  data: string; // base64 without prefix
  fileName?: string;
}

// Gemini OCR Endpoint for handwritten yield sheets
app.post('/api/ocr-gemini', async (req: Request, res: Response) => {
  try {
    const { images } = req.body as { images: ImageDataInput[] };

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos una fotografía.' });
    }

    if (images.length > 6) {
      return res.status(400).json({ error: 'Por ahora puedes procesar máximo 6 fotografías por lectura.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'No se encontró GEMINI_API_KEY en las variables de entorno del servidor. Configúralo en el panel de Secrets.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
      'image/bmp',
    ];

    const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img || !img.data || !img.mimeType) {
        return res.status(400).json({
          error: `La fotografía número ${i + 1} no tiene un formato válido o faltan datos base64.`,
        });
      }

      const mimeType = String(img.mimeType).toLowerCase();
      if (!allowedMimes.includes(mimeType)) {
        return res.status(400).json({
          error: `Formato de imagen no admitido en la fotografía ${i + 1}: ${mimeType}. Se admiten JPEG, PNG, WebP y HEIC.`,
        });
      }

      imageParts.push({
        inlineData: {
          mimeType,
          data: img.data,
        },
      });
    }

    const promptText = `
Analiza las fotografías de formatos manuscritos de rendimiento diario de corte de flores y devuelve exclusivamente un objeto JSON válido con la siguiente estructura:

{
  "semana": "",
  "fecha": "",
  "observacionesGenerales": "",
  "registros": [
    {
      "codigo": "",
      "area": "",
      "dia": "",
      "fecha": "",
      "horaInicio": "06:00",
      "horaFin": "",
      "tallos": null,
      "observaciones": ""
    }
  ]
}

Instrucciones detalladas de lectura e integridad:
1. REGLA FUNDAMENTAL DE DÍAS Y FECHAS (Semana de Domingo a Sábado):
   - En la floricultura empresarial la semana va de DOMINGO a SÁBADO.
     (Domingo = día 1, Lunes = día 2, Martes = día 3, Miércoles = día 4, Jueves = día 5, Viernes = día 6, Sábado = día 7).
   - Identifica con máxima atención qué día de la semana corresponde a cada registro o sección (busca encabezados como 'DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', o abreviaturas 'DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', o fechas manuscritas).
   - En cada registro individual, llena el campo "dia" con el nombre del día identificado ('Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado').
   - En cada registro individual, asigna su "fecha" exacta en formato AAAA-MM-DD calculada a partir de la semana y el día identificado (o de la fecha manuscrita). SI LA CARGA CONTIENE REGISTROS DE DIFERENTES DÍAS, CADA REGISTRO DEBE TENER LA FECHA DE SU DÍA, NUNCA LA MISMA FECHA PARA TODOS.
2. "semana": código de cuatro dígitos en formato AASS (ejemplo 2641 para año 2026 semana 41). Si no está clara o no aparece, devuelve "".
3. "fecha": fecha representativa principal del lote en formato AAAA-MM-DD. Si hay múltiples días, anota en "observacionesGenerales" los días detectados (ej. "Contiene planillas de Lunes y Martes").
4. Lee un registro por cada fila de colaborador visible en el formato manuscrito.
5. "codigo": código o ID de recursos humanos (RH) del colaborador (numérico o alfanumérico tal como está escrito). No inventes dígitos.
6. "area": código corto del área visible en la foto (ejemplo: F1, F2, F3, F4, F5, F6, GYPSO, ASTRONOVA, R1, R2, R3, R4, R5, R6, R7, R8). Devuelve ÚNICAMENTE este código corto en mayúsculas, sin texto o descripción adicional.
7. "horaInicio" y "horaFin": formato HH:mm de 24 horas (ejemplo 06:00, 14:30).
   - Si la hora final está escrita en formato de 12 horas de la tarde (ejemplo 1:00, 01:00, 1:15, 1:30, 2:00, 2:30, 3:00), conviértela a formato de 24 horas (ejemplo 13:00, 13:15, 13:30, 14:00, 14:30, 15:00).
   - Si la hora inicial no está escrita o no se puede leer, asigna "06:00" y anota en "observaciones" que se asumió esa hora.
   - Si la hora final no se puede leer con seguridad, anótalo en "observaciones".
8. "tallos": número entero de tallos cortados. Si no se puede leer con total seguridad, coloca null y describe la duda en "observaciones".
9. Si un dato es dudoso o ilegible, no adivines: deja el campo vacío o en null, y explica la duda en "observaciones".
10. No inventes nombres de colaboradores ni códigos.
11. No incluyas filas de títulos, totales generales ni renglones en blanco.
12. No calcules ni inventes el rendimiento por hora.
13. Si aparecen varias fotografías del mismo formato o partes superpuestas, evita duplicar registros que correspondan a la misma persona y tarea.
14. Devuelve ÚNICAMENTE la estructura JSON solicitada.
`;

    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let response: any = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                ...imageParts,
                { text: promptText },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });
          if (response && response.text) {
            break;
          }
        } catch (genErr: any) {
          lastError = genErr;
          const errMsg = String(genErr?.message || '');
          const isDailyQuota =
            errMsg.includes('limit: 20') ||
            errMsg.includes('per day limit exceeded') ||
            errMsg.includes('free_tier_requests') ||
            (errMsg.includes('429') && errMsg.includes('Quota exceeded'));

          // Si este modelo superó la cuota diaria en Free Tier, no reintentar inútilmente y pasar de inmediato al siguiente modelo
          if (isDailyQuota) {
            console.warn(`Cuota diaria alcanzada para ${modelName}. Probando siguiente modelo...`);
            break;
          }

          const isTemporary =
            errMsg.includes('503') ||
            errMsg.includes('high demand') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('429');

          if (isTemporary && attempt < 2) {
            await new Promise((res) => setTimeout(res, 1200));
            continue;
          }
          break;
        }
      }
      if (response && response.text) {
        break;
      }
    }

    if (!response || !response.text) {
      if (lastError) {
        throw lastError;
      }
      return res.status(200).json({
        success: false,
        error:
          'Gemini no devolvió texto en la respuesta. Intenta con imágenes más nítidas o un lote menor de fotos.',
      });
    }

    const rawText = response.text || '';
    let parsedData: any;
    try {
      // Clean potential markdown delimiters
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      parsedData = JSON.parse(cleaned);
    } catch (parseError: any) {
      console.error('Error parsing Gemini response:', rawText);
      return res.status(200).json({
        success: false,
        error: 'La respuesta de Gemini no es un JSON válido. Detalle: ' + parseError.message,
        rawResponse: rawText.substring(0, 500),
      });
    }

    if (!parsedData || !Array.isArray(parsedData.registros)) {
      return res.status(200).json({
        success: false,
        error: 'La respuesta no contiene la lista "registros" requerida.',
        data: parsedData,
      });
    }

    // Post-procesamiento inteligente de fechas según la semana (Domingo a Sábado)
    const semanaStr = String(parsedData.semana || '').trim();
    const semMatch = semanaStr.match(/^(\d{2})(\d{2})$/);
    let domingoSemana: Date | null = null;

    if (semMatch) {
      const anio = 2000 + Number(semMatch[1]);
      const numSem = Number(semMatch[2]);
      if (numSem >= 1 && numSem <= 53) {
        const primero = new Date(anio, 0, 1, 12);
        const domInicial = new Date(primero);
        domInicial.setDate(primero.getDate() - primero.getDay());
        domingoSemana = new Date(domInicial);
        domingoSemana.setDate(domInicial.getDate() + (numSem - 1) * 7);
      }
    }

    const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const normDiaMap: Record<string, number> = {
      domingo: 0, dom: 0,
      lunes: 1, lun: 1,
      martes: 2, mar: 2,
      miercoles: 3, mie: 3, miércoles: 3,
      jueves: 4, jue: 4,
      viernes: 5, vie: 5,
      sabado: 6, sab: 6, sábado: 6,
    };

    // Asegurar que cada registro tenga su día y fecha calculada estrictamente según la semana del formato (Domingo a Sábado)
    parsedData.registros = parsedData.registros.map((item: any) => {
      let dia = String(item.dia || '').trim();
      let fecha = String(item.fecha || '').trim();

      const diaKey = dia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const dayIdx = normDiaMap[diaKey];

      if (dayIdx !== undefined) {
        dia = diasNombres[dayIdx];
        if (domingoSemana) {
          // La fecha se calcula de acuerdo a la semana y al día que dice el formato
          const d = new Date(domingoSemana);
          d.setDate(d.getDate() + dayIdx);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          fecha = `${y}-${m}-${day}`;
        }
      } else if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const parts = fecha.split('-');
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
        dia = diasNombres[d.getDay()] || '';
      } else if (domingoSemana) {
        // Por defecto asignar lunes si no se especificó día
        const d = new Date(domingoSemana);
        d.setDate(d.getDate() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        fecha = `${y}-${m}-${day}`;
        dia = 'Lunes';
      }

      return {
        ...item,
        dia,
        fecha,
      };
    });

    if (parsedData.registros.length > 0 && parsedData.registros[0]?.fecha) {
      parsedData.fecha = parsedData.registros[0].fecha;
    }



    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error in /api/ocr-gemini:', error);
    let userMsg = error?.message || 'Error inesperado al procesar las fotografías con Gemini.';

    if (userMsg.includes('high demand') || userMsg.includes('503') || userMsg.includes('UNAVAILABLE')) {
      userMsg =
        'El servicio de análisis de Gemini está experimentando alta demanda momentánea. Por favor intenta procesar nuevamente en unos momentos.';
    } else if (
      userMsg.includes('limit: 20') ||
      userMsg.includes('per day limit exceeded') ||
      userMsg.includes('free_tier_requests') ||
      userMsg.includes('quota') ||
      userMsg.includes('Quota') ||
      userMsg.includes('429') ||
      userMsg.includes('RESOURCE_EXHAUSTED')
    ) {
      userMsg =
        'Se alcanzó la cuota de solicitudes de la API de Gemini para la clave actual (límite diario en cuenta gratuita). Si tienes otra clave de Gemini, puedes actualizarla en Vercel (Project Settings > Environment Variables > GEMINI_API_KEY) o en los Secretos de la aplicación.';
    }

    res.status(200).json({
      success: false,
      error: userMsg,
    });
  }
});

let cachedCatalogsPayload: any = null;

// Endpoint para consultar y validar catálogos de Google Sheets desde el backend
app.post('/api/catalogs', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const spreadsheetId = req.body?.spreadsheetId || '1SgV5hv-Am41A18dt2uXl_Air0V_ttRGQxY7-NcvaXP0';

    if (!token) {
      if (cachedCatalogsPayload) {
        return res.json({
          ...cachedCatalogsPayload,
          diagnostics: {
            ...cachedCatalogsPayload.diagnostics,
            source: 'backend_cache',
          },
        });
      }
      return res.status(401).json({
        error: 'No se proporcionó token de autorización Bearer para consultar Google Sheets.',
      });
    }

    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;

    const [resArea, resMaestro, resRend] = await Promise.all([
      fetch(`${baseUrl}/Area?valueRenderOption=FORMATTED_VALUE`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${baseUrl}/Maestro?valueRenderOption=FORMATTED_VALUE`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${baseUrl}/Rendimientos!1:1?valueRenderOption=FORMATTED_VALUE`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (!resArea.ok) {
      const err = await resArea.json().catch(() => ({}));
      return res.status(resArea.status).json({
        error: `Error al consultar pestaña Area: ${err?.error?.message || resArea.statusText}`,
      });
    }

    if (!resMaestro.ok) {
      const err = await resMaestro.json().catch(() => ({}));
      return res.status(resMaestro.status).json({
        error: `Error al consultar pestaña Maestro: ${err?.error?.message || resMaestro.statusText}`,
      });
    }

    const dataArea = await resArea.json();
    const dataMaestro = await resMaestro.json();
    const dataRend = resRend.ok ? await resRend.json() : { values: [] };

    const norm = (s: any) =>
      String(s ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Area
    const rowsArea: string[][] = dataArea.values || [];
    const headersArea = (rowsArea[0] || []).map((h) => String(h).trim());
    const normHeadersArea = headersArea.map(norm);

    const idxAreSup = normHeadersArea.findIndex((h) => ['ARESUP', 'AREA', 'ARE_SUP'].includes(h));
    const idxProducto = normHeadersArea.findIndex((h) => ['PRODUCTO', 'VARIEDAD'].includes(h));
    const idxSede = normHeadersArea.findIndex((h) => ['SEDE', 'FINCA', 'UBICACION'].includes(h));

    if (idxAreSup === -1 || idxProducto === -1 || idxSede === -1) {
      return res.status(422).json({
        error: `Encabezados incompletos en Area. Se requiere AreSup, Producto y Sede. Encontrados: ${headersArea.join(', ')}`,
      });
    }

    const areas = rowsArea
      .slice(1)
      .filter((r) => r[idxAreSup])
      .map((r) => ({
        AreSup: String(r[idxAreSup] || '').trim(),
        Producto: String(r[idxProducto] || '').trim(),
        Sede: String(r[idxSede] || '').trim(),
      }));

    // Maestro
    const rowsMaestro: string[][] = dataMaestro.values || [];
    const headersMaestro = (rowsMaestro[0] || []).map((h) => String(h).trim());
    const normHeadersMaestro = headersMaestro.map(norm);

    const idxCodigo = normHeadersMaestro.findIndex((h) =>
      ['CODIGO', 'CODIGO RH', 'ID RH', 'ID'].includes(h)
    );
    const idxNombre = normHeadersMaestro.findIndex((h) =>
      ['NOMBRE', 'COLABORADOR', 'NOMBRE COMPLETO'].includes(h)
    );

    if (idxCodigo === -1 || idxNombre === -1) {
      return res.status(422).json({
        error: `Encabezados incompletos en Maestro. Se requiere Código y Nombre. Encontrados: ${headersMaestro.join(', ')}`,
      });
    }

    const cleanCodigo = (v: any) => {
      let str = String(v ?? '').replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '').trim();
      str = str.replace(/^['"]+|['"]+$/g, '');
      if (/^\d+[,.]0+$/.test(str)) str = str.replace(/[,.]0+$/, '');
      if (/^\d{1,3}([,.]\d{3})+$/.test(str)) str = str.replace(/[,.]/g, '');
      return str.replace(/\s+/g, '').toUpperCase();
    };

    const colaboradores = rowsMaestro
      .slice(1)
      .filter((r) => r[idxCodigo] && r[idxNombre])
      .map((r) => ({
        'Código': cleanCodigo(r[idxCodigo]),
        Nombre: String(r[idxNombre] || '').trim(),
      }));

    const encabezadosRendimientos = (dataRend.values && dataRend.values[0]) || [];

    const diagnostics = {
      source: 'backend_api',
      totalColaboradores: colaboradores.length,
      totalAreas: areas.length,
      sampleCodigos: colaboradores.slice(0, 5).map((c: any) => c['Código']),
      sampleAreas: areas.slice(0, 5).map((a: any) => a.AreSup),
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

    const resultPayload = {
      success: true,
      spreadsheetId,
      areas,
      colaboradores,
      encabezadosRendimientos,
      diagnostics,
    };

    cachedCatalogsPayload = resultPayload;
    res.json(resultPayload);
  } catch (error: any) {
    console.error('Error in /api/catalogs:', error);
    res.status(500).json({ error: error?.message || 'Error al consultar catálogos en el backend.' });
  }
});

// Endpoint para guardar registros en Google Sheets sin pedir login a cada usuario (vía Google Apps Script)
app.post('/api/save-records', async (req: Request, res: Response) => {
  try {
    const scriptUrl =
      req.body?.scriptUrl ||
      process.env.GOOGLE_SCRIPT_URL ||
      process.env.VITE_GOOGLE_SCRIPT_URL;

    const rows = req.body?.rows || [];
    const spreadsheetId = req.body?.spreadsheetId || '1SgV5hv-Am41A18dt2uXl_Air0V_ttRGQxY7-NcvaXP0';

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibieron filas para guardar.' });
    }

    if (!scriptUrl) {
      return res.status(400).json({
        success: false,
        error:
          'No se ha configurado la URL de Google Apps Script para guardar sin cuenta de Google. Configúrala en Diagnóstico del libro o en las variables de entorno (GOOGLE_SCRIPT_URL).',
      });
    }

    const scriptResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveRendimientos',
        spreadsheetId,
        rows,
      }),
      redirect: 'follow',
    });

    const responseText = await scriptResponse.text();
    let scriptData: any = {};
    try {
      scriptData = JSON.parse(responseText);
    } catch {
      if (responseText.toLowerCase().includes('success') || scriptResponse.ok) {
        scriptData = { success: true, guardados: rows.length };
      } else {
        throw new Error(`Google Apps Script respondió con error: ${responseText.substring(0, 200)}`);
      }
    }

    if (!scriptResponse.ok && !scriptData.success) {
      throw new Error(scriptData.error || `Error HTTP ${scriptResponse.status} desde Google Apps Script`);
    }

    res.status(200).json({
      success: true,
      guardados: scriptData.guardados || rows.length,
      message: `Se guardaron exitosamente ${scriptData.guardados || rows.length} registro(s) en la hoja Rendimientos.`,
    });
  } catch (error: any) {
    console.error('Error in /api/save-records:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Error al guardar registros mediante Google Apps Script.',
    });
  }
});

// Any unmatched API route returns JSON (not HTML fallback)
app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

// Start server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Only launch standalone HTTP listener if not running in Vercel Serverless environment
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}

export default app;
export { app };
