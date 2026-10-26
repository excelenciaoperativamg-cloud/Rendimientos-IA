export interface AreaItem {
  AreSup: string;
  Producto: string;
  Sede: string;
}

export interface ColaboradorItem {
  'Código': string;
  Nombre: string;
}

export interface YieldRecord {
  id: string; // Internal unique UI id
  codigo: string;
  colaborador: string;
  areSup: string;
  dia?: string;       // Día de la semana (ej. "Lunes", "Martes", etc.)
  fecha?: string;     // Fecha calculada o asignada en formato AAAA-MM-DD
  horaInicio: string; // HH:mm
  horaFin: string;    // HH:mm
  tallos: number | null;
  duracion: number;   // Calculated hours
  rendimiento: number; // Calculated stems/h
  observaciones?: string;
  isDoubtful?: boolean;
}

export interface BatchMetadata {
  fecha: string;  // YYYY-MM-DD
  semana: string; // AASS format e.g. 2641
  observacionesGenerales?: string;
}

export interface CatalogDiagnostics {
  source: 'backend_api' | 'google_sheets_direct' | 'local_seed' | 'google_script_webapp';
  totalColaboradores: number;
  totalAreas: number;
  sampleCodigos: string[];
  sampleAreas: string[];
  headerArea: string[];
  headerMaestro: string[];
  hasExactCodigoHeader: boolean;
  hasExactNombreHeader: boolean;
  lastChecked: string;
}

export interface CatalogData {
  areas: AreaItem[];
  colaboradores: ColaboradorItem[];
  encabezadosRendimientos: string[];
  spreadsheetId: string;
  lastUpdated?: string;
  isCustomSpreadsheet?: boolean;
  diagnostics?: CatalogDiagnostics;
}

export interface OCRPhoto {
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  base64Data?: string;
  mimeType?: string;
}

export interface OCRResultItem {
  codigo?: string;
  area?: string;
  dia?: string;
  fecha?: string;
  horaInicio?: string;
  horaFin?: string;
  tallos?: number | null;
  observaciones?: string;
}

export interface OCRResponseData {
  semana?: string;
  fecha?: string;
  observacionesGenerales?: string;
  registros: OCRResultItem[];
}

