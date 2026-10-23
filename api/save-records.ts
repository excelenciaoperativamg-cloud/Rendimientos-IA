import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
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

    const scriptUrl =
      body?.scriptUrl ||
      process.env.GOOGLE_SCRIPT_URL ||
      process.env.VITE_GOOGLE_SCRIPT_URL;

    const rows = body?.rows || [];
    const spreadsheetId = body?.spreadsheetId || '1SgV5hv-Am41A18dt2uXl_Air0V_ttRGQxY7-NcvaXP0';

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibieron filas para guardar.' });
    }

    if (!scriptUrl) {
      return res.status(400).json({
        success: false,
        error:
          'No se ha configurado la URL de Google Apps Script para guardar sin cuenta de Google. Configúrala en Diagnóstico del libro o en las variables de Vercel (GOOGLE_SCRIPT_URL).',
      });
    }

    // Call Google Apps Script Web App
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
      // If script returned plain text or html redirect
      if (responseText.toLowerCase().includes('success') || scriptResponse.ok) {
        scriptData = { success: true, guardados: rows.length };
      } else {
        throw new Error(`Google Apps Script respondió con error: ${responseText.substring(0, 200)}`);
      }
    }

    if (!scriptResponse.ok && !scriptData.success) {
      throw new Error(scriptData.error || `Error HTTP ${scriptResponse.status} desde Google Apps Script`);
    }

    return res.status(200).json({
      success: true,
      guardados: scriptData.guardados || rows.length,
      message: `Se guardaron exitosamente ${scriptData.guardados || rows.length} registro(s) en la hoja Rendimientos.`,
    });
  } catch (error: any) {
    console.error('Error in /api/save-records:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error al guardar registros mediante Google Apps Script.',
    });
  }
}
