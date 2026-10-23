import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, Copy, Check, X, ShieldAlert } from 'lucide-react';

interface UnauthorizedDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  projectId: string;
  onRetry?: () => void;
}

export const UnauthorizedDomainModal: React.FC<UnauthorizedDomainModalProps> = ({
  isOpen,
  onClose,
  domain,
  projectId,
  onRetry,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(domain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const firebaseSettingsUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0a2958] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Autorizar dominio de Vercel en Firebase</h3>
              <p className="text-xs text-blue-200">Requisito único de seguridad para desplegar en Vercel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3 text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-bold">¿Por qué ocurre este error en Vercel?</p>
              <p className="mt-1 text-[11px] text-amber-800">
                Por seguridad, Google Firebase bloquea el inicio de sesión desde dominios nuevos hasta que se autorizan en la consola de Firebase. Solo debes registrar tu dominio de Vercel una única vez.
              </p>
            </div>
          </div>

          {/* Domain copy box */}
          <div>
            <label className="block text-slate-700 font-semibold uppercase tracking-wider text-[11px] mb-1.5">
              Dominio que debes autorizar:
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg font-mono text-xs text-slate-800 font-bold select-all truncate">
                {domain}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold transition-colors shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>Copiar dominio</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step by step guide */}
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
              Pasos para autorizarlo (toma menos de 1 minuto):
            </p>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 leading-relaxed">
              <li>
                Haz clic en el botón azul abajo para ir a la pestaña <strong>Settings</strong> de tu proyecto Firebase (<strong className="font-mono text-slate-800">{projectId}</strong>).
              </li>
              <li>
                Desplázate hacia abajo hasta la sección <strong>"Dominios autorizados"</strong> (Authorized domains).
              </li>
              <li>
                Haz clic en <strong>"Agregar dominio"</strong> (Add domain), pega <strong className="font-mono text-slate-800">{domain}</strong> y haz clic en <strong>Guardar</strong>.
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  (Opcional: también puedes agregar <strong className="font-mono">vercel.app</strong> para cubrir todas las ramas y vistas previas).
                </span>
              </li>
              <li>
                ¡Listo! Vuelve a esta pestaña y haz clic en <strong>Reintentar conexión</strong>.
              </li>
            </ol>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <a
            href={firebaseSettingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-[#0a2958] hover:bg-[#071f43] text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <span>Abrir consola de Firebase</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="flex items-center space-x-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cerrar
            </button>
            {onRetry && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRetry();
                }}
                className="px-4 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors shadow-2xs"
              >
                Reintentar conexión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
