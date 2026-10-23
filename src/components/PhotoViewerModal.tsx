import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { OCRPhoto } from '../types';

interface PhotoViewerModalProps {
  photo: OCRPhoto | null;
  onClose: () => void;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ photo, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!photo) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4">
      {/* Top Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between text-white pb-3 px-2">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-sm truncate max-w-xs">{photo.name}</span>
          <span className="text-xs text-slate-400 font-mono">
            ({Math.round(photo.size / 1024)} KB)
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleZoomOut}
            title="Reducir zoom"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono px-1">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={handleZoomIn}
            title="Aumentar zoom"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRotate}
            title="Girar 90 grados"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar visor"
            className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div className="relative max-w-5xl w-full h-[75vh] bg-slate-900 rounded-xl overflow-auto border border-slate-800 flex items-center justify-center p-4">
        <img
          src={photo.previewUrl}
          alt={photo.name}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
          }}
          className="max-h-full max-w-full object-contain shadow-2xl select-none"
        />
      </div>

      <p className="text-xs text-slate-400 mt-2">
        Usa los controles superiores para ajustar el zoom y rotación para leer caligrafía dudosa.
      </p>
    </div>
  );
};
