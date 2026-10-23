import type { Request, Response } from 'express';

let cachedCatalogsPayload: any = null;

export default async function handler(req: Request, res: Response) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Utiliza POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const spreadsheetId = body?.spreadsheetId || '1SgV5hv-Am41A18dt2uXl_Air0V_ttRGQxY7-NcvaXP0';
    const scriptUrl =
      body?.scriptUrl ||
      process.env.GOOGLE_SCRIPT_URL ||
      process.env.VITE_GOOGLE_SCRIPT_URL;

    // 1. Si hay una URL de Google Apps Script configurada, obtener directamente sin requerir token de usuario
    if (scriptUrl) {
      let scriptRes: any;
      let responseText = '';
      try {
        scriptRes = await fetch(scriptUrl, { redirect: 'follow' });
        responseText = await scriptRes.text();
      } catch (fetchErr: any) {
        if (!token) {
          return res.status(502).json({
            success: false,
            error: `No se pudo conectar a la URL de Google Apps Script: ${fetchErr?.message || 'Error de red'}. Verifica que la URL esté activa.`,
          });
        }
      }

      if (responseText) {
        let scriptData: any = null;
        try {
          scriptData = JSON.parse(responseText);
        } catch {
          if (!token) {
            if (
              responseText.includes('accounts.google.com') ||
              responseText.includes('ServiceLogin') ||
              responseText.includes('<!DOCTYPE') ||
              responseText.includes('<html')
            ) {
              return res.status(403).json({
                success: false,
                error:
                  'Google Apps Script está solicitando inicio de sesión. En el editor de Apps Script ve a "Implementar" > "Administrar implementaciones" > selecciona editar (ícono de lápiz) > en "Quién tiene acceso" selecciona "Cualquier persona" (Anyone) y luego haz clic en "Implementar".',
              });
            }
            return res.status(502).json({
              success: false,
              error: `Google Apps Script no devolvió datos en formato JSON. Respuesta recibida: ${responseText.substring(0, 150)}...`,
            });
          }
        }

        if (scriptData) {
          if (scriptData.success === false) {
            if (!token) {
              return res.status(400).json({
                success: false,
                error: `Error reportado por Google Apps Script: ${scriptData.error || 'Error desconocido'}.`,
              });
            }
          } else if (scriptData.maestro || scriptData.colaboradores) {
            const rawColabs = scriptData.colaboradores || scriptData.maestro || [];
            const rawAreas = scriptData.areas || scriptData.area || [];

            const normH = (s: any) =>
              String(s || '')
                .trim()
                .toUpperCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

            let colaboradores: any[] = [];
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
                  .filter((r: any) => r[idxCod] && r[idxNom])
                  .map((r: any) => ({
                    'Código': String(r[idxCod] || '').trim(),
                    Nombre: String(r[idxNom] || '').trim(),
                  }));
              } else {
                colaboradores = rawColabs;
              }
            }

            let areas: any[] = [];
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
                  .filter((r: any) => r[idxAre])
                  .map((r: any) => ({
                    AreSup: String(r[idxAre] || '').trim(),
                    Producto: String(r[idxProd] || '').trim(),
                    Sede: String(r[idxSed] || '').trim(),
                  }));
              } else {
                areas = rawAreas;
              }
            }

            const diagnostics = {
              source: 'google_script_webapp',
              totalColaboradores: colaboradores.length,
              totalAreas: areas.length,
              sampleCodigos: colaboradores.slice(0, 5).map((c: any) => c['Código']),
              sampleAreas: areas.slice(0, 5).map((a: any) => a.AreSup),
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

            const payload = {
              success: true,
              spreadsheetId,
              areas,
              colaboradores,
              encabezadosRendimientos: [
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
              ],
              diagnostics,
            };

            cachedCatalogsPayload = payload;
            return res.status(200).json(payload);
          }
        }
      }
    }

    if (!token) {
      if (cachedCatalogsPayload) {
        return res.status(200).json({
          ...cachedCatalogsPayload,
          diagnostics: {
            ...cachedCatalogsPayload.diagnostics,
            source: 'backend_cache',
          },
        });
      }
      return res.status(401).json({
        success: false,
        error: 'No se proporcionó token de autorización Bearer ni URL de Google Apps Script para consultar Google Sheets.',
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
        success: false,
        error: `Error al consultar pestaña Area: ${err?.error?.message || resArea.statusText}`,
      });
    }

    if (!resMaestro.ok) {
      const err = await resMaestro.json().catch(() => ({}));
      return res.status(resMaestro.status).json({
        success: false,
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
        success: false,
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
        success: false,
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
    return res.status(200).json(resultPayload);
  } catch (error: any) {
    console.error('Error in /api/catalogs:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Error al consultar catálogos en el backend.' });
  }
}
