/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QRZ_LOGIN_URL } from '../types';
import { Radio, ExternalLink, ShieldCheck, Check, X, Key, User } from 'lucide-react';

interface QRZLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (user: string) => void;
}

export const QRZLoginModal: React.FC<QRZLoginModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [saveOnDevice, setSaveOnDevice] = useState(false);
  const [error, setError] = useState('');
  const hasSavedCredentials = Boolean(localStorage.getItem('qrz_user') && localStorage.getItem('qrz_pass'));

  const useSavedCredentials = () => {
    setUser(localStorage.getItem('qrz_user') || '');
    setPass(localStorage.getItem('qrz_pass') || '');
    setSaveOnDevice(true);
    setError('');
  };

  if (!isOpen) return null;

  const handleOpenQRZ = () => {
    window.open(QRZ_LOGIN_URL, '_blank', 'noopener,noreferrer');
  };

  const handleSaveAndConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user.trim() || !pass.trim()) {
      setError('Por favor completá tu usuario y contraseña de QRZ.com');
      return;
    }

    // Por defecto las credenciales solo duran en esta pestaña/sesión.
    // El almacenamiento persistente solo se activa con consentimiento explícito.
    if (saveOnDevice) {
      localStorage.setItem('qrz_user', user.trim());
      localStorage.setItem('qrz_pass', pass);
      sessionStorage.removeItem('qrz_user');
      sessionStorage.removeItem('qrz_pass');
    } else {
      localStorage.removeItem('qrz_user');
      localStorage.removeItem('qrz_pass');
      sessionStorage.setItem('qrz_user', user.trim());
      sessionStorage.setItem('qrz_pass', pass);
    }
    localStorage.removeItem('qrz_skipped');
    setError('');
    onSaved(user.trim());
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem('qrz_skipped', '1');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl text-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Encabezado con Icono */}
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 shrink-0">
            <Radio className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white tracking-wide">
              Conectá tu cuenta QRZ
            </h2>
            <p className="text-sm text-slate-300 mt-1 leading-relaxed">
              Iniciá sesión en QRZ.com para consultar los datos disponibles de tus corresponsales. Cada vez que abras la app te preguntaremos si querés conectar. Guardar tus credenciales es opcional.
            </p>
          </div>
        </div>

        {/* Botón para abrir QRZ.com */}
        <div className="my-4 p-3.5 bg-slate-800/80 rounded-xl border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-300">
            ¿No tenés sesión abierta en el navegador o necesitás verificar tu cuenta?
          </div>
          <button
            type="button"
            onClick={handleOpenQRZ}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-amber-300 text-xs font-semibold rounded-lg border border-amber-400/20 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir QRZ.com para iniciar sesión
          </button>
        </div>

        {/* Selección explícita de credenciales guardadas */}
        {hasSavedCredentials && (
          <button
            type="button"
            onClick={useSavedCredentials}
            className="w-full mb-3 px-4 py-2.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Usar credenciales guardadas en este dispositivo
          </button>
        )}

        {/* Formulario de credenciales */}
        <form onSubmit={handleSaveAndConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Usuario QRZ (Callsign o Nombre de Usuario)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="ej. LU1TSB"
                className="w-full pl-10 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Contraseña QRZ
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded-lg border border-rose-900/60">
              {error}
            </p>
          )}

          <label className="flex items-start gap-2 text-xs text-slate-300 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={saveOnDevice}
              onChange={(e) => setSaveOnDevice(e.target.checked)}
              className="mt-0.5 accent-amber-400"
            />
            <span>Guardar usuario y contraseña en este dispositivo para poder elegirlos la próxima vez. Si no marcás esta opción, solo se conservarán durante esta sesión.</span>
          </label>
          <div className="flex items-center gap-2 text-xs text-amber-300/90">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Las credenciales guardadas en el navegador no están cifradas por la app. Guardalas solo en un dispositivo de confianza.</span>
          </div>

          {/* Botones de acción principales */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleSkip}
              className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
            >
              Ahora no
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold rounded-lg shadow-md transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Guardar y conectar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
