import React from 'react';

interface HeaderProps {
  onOpenSpreadsheetModal?: () => void;
}

export const Header: React.FC<HeaderProps> = () => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <img
              src="/assets/aistudio/logo_rend_7c0570c8.png"
              alt="Rendimientos de Corte"
              className="w-10 h-10 object-contain drop-shadow-xs"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Rendimientos de Corte
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#0a2958]/10 text-[#0a2958] border border-[#0a2958]/20">
                  IA Gemini + Sheets
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Lectura inteligente de formatos manuscritos y registro consolidado
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
