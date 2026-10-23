import React, { useRef } from 'react';
import { Upload, X, ZoomIn, Sparkles, Image as ImageIcon, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { OCRPhoto } from '../types';

interface PhotoUploadSectionProps {
  photos: OCRPhoto[];
  isProcessing: boolean;
  statusMessage: string;
  onAddPhotos: (files: FileList | File[]) => void;
  onRemovePhoto: (index: number) => void;
  onClearPhotos: () => void;
  onStartOCR: () => void;
  onViewPhoto: (photo: OCRPhoto) => void;
}

export const PhotoUploadSection: React.FC<PhotoUploadSectionProps> = ({
  photos,
  isProcessing,
  statusMessage,
  onAddPhotos,
  onRemovePhoto,
  onClearPhotos,
  onStartOCR,
  onViewPhoto,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddPhotos(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddPhotos(e.dataTransfer.files);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              1
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Fotografías de formatos manuscritos
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Carga hasta 6 fotografías nítidas de los formatos diarios de corte para su reconocimiento automático.
          </p>
        </div>

        {photos.length > 0 && !isProcessing && (
          <button
            type="button"
            onClick={onClearPhotos}
            className="text-xs text-slate-500 hover:text-rose-600 transition-colors self-start sm:self-auto"
          >
            Quitar todas ({photos.length})
          </button>
        )}
      </div>

      {/* Upload Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          photos.length >= 6
            ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
            : 'border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/30 bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={isProcessing || photos.length >= 6}
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Upload className="w-6 h-6" />
          </div>
          <div className="text-sm">
            <span className="font-semibold text-emerald-700 hover:underline">
              Haz clic para seleccionar
            </span>{' '}
            <span className="text-slate-600">o arrastra las fotos aquí</span>
          </div>
          <p className="text-xs text-slate-500">
            Formatos admitidos: JPEG, PNG, WebP, HEIC • Máximo 6 imágenes ({photos.length}/6 seleccionadas)
          </p>
        </div>
      </div>

      {/* Previews Grid */}
      {photos.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Formatos seleccionados ({photos.length})
            </span>
            <span className="text-[11px] text-slate-500">
              Haz clic en la lupa para ampliar y comparar
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {photos.map((photo, idx) => (
              <div
                key={idx}
                className="group relative bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-2xs aspect-square flex flex-col"
              >
                <img
                  src={photo.previewUrl}
                  alt={photo.name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                />

                {/* Badge Number */}
                <div className="absolute top-1.5 left-1.5 bg-slate-900/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                  #{idx + 1}
                </div>

                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewPhoto(photo);
                    }}
                    title="Ampliar fotografía"
                    className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-full shadow-xs transition-colors"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>

                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePhoto(idx);
                      }}
                      title="Eliminar de la lista"
                      className="p-1.5 bg-rose-500/90 hover:bg-rose-600 text-white rounded-full shadow-xs transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Caption */}
                <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[10px] text-slate-200 px-1.5 py-1 truncate">
                  {photo.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action button & status */}
      <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
        <div className="flex-1">
          {statusMessage && (
            <div
              className={`text-xs p-2.5 rounded-lg flex items-start space-x-2 ${
                isProcessing
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('falló')
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
              ) : statusMessage.toLowerCase().includes('error') ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMessage}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onStartOCR}
          disabled={photos.length === 0 || isProcessing}
          className="inline-flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0a2958] hover:bg-[#071f43] active:bg-[#05152e] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Analizando con Gemini...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-blue-200" />
              <span>Leer fotografías ({photos.length})</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};
