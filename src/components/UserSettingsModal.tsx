/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings, Check, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import { DEFAULT_CALLSIGN } from '../types';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  onUpdate,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [callsign, setCallsign] = useState('');
  const [email, setEmail] = useState('');
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [defaultEQSLTheme, setDefaultEQSLTheme] = useState('navy');
  const [appLanguage, setAppLanguage] = useState('es');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCallsign(localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN);
      setEmail(localStorage.getItem('user_email') || '');
      setCustomBg(localStorage.getItem('eqsl_custom_bg') || null);
      setDefaultEQSLTheme(localStorage.getItem('eqsl_theme') || 'navy');
      setAppLanguage(localStorage.getItem('app_language') || 'es');
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCall = callsign.trim().toUpperCase() || DEFAULT_CALLSIGN;
    localStorage.setItem('user_callsign', finalCall);
    localStorage.setItem('user_email', email.trim());
    localStorage.setItem('eqsl_theme', defaultEQSLTheme);
    localStorage.setItem('app_language', appLanguage);

    localStorage.removeItem('hamqth_user');
    localStorage.removeItem('hamqth_pass');
    localStorage.removeItem('qrz_logbook_key');
    localStorage.removeItem('qrz_auto_upload');
    localStorage.removeItem('eqsl_user');
    localStorage.removeItem('eqsl_pass');

    setSavedSuccess(true);
    onUpdate();
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl text-slate-100 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Configuración del Operador</h2>
              <p className="text-xs text-slate-400">Tu indicativo, correo y diseño de tarjeta</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 pt-4">
          <div className="pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">1. Datos de estación</h3>
            <p className="text-[11px] text-slate-500 mt-1">Completá una sola vez los datos que aparecerán en tus tarjetas.</p>
          </div>
          {/* Idioma predeterminado de la interfaz */}
          <div className="rounded-xl border border-violet-500/25 bg-slate-950/60 p-3.5 space-y-2">
            <label className="block text-xs font-bold text-violet-300" htmlFor="app-language">Idioma predeterminado de la aplicación</label>
            <select
              id="app-language"
              value={appLanguage}
              onChange={(e) => setAppLanguage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-violet-400 focus:outline-hidden"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="pt">Português</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
              <option value="nl">Nederlands</option>
              <option value="pl">Polski</option>
              <option value="ru">Русский</option>
              <option value="uk">Українська</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="ar">العربية</option>
              <option value="hi">हिन्दी</option>
              <option value="tr">Türkçe</option>
              <option value="sv">Svenska</option>
              <option value="no">Norsk</option>
              <option value="da">Dansk</option>
              <option value="fi">Suomi</option>
              <option value="cs">Čeština</option>
              <option value="el">Ελληνικά</option>
              <option value="ro">Română</option>
              <option value="hu">Magyar</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
            
          </div>
          {/* Datos de mi Estación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mi Indicativo (Callsign) *
              </label>
              <input
                type="text"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                placeholder="ej. LU1TSB"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-amber-300 font-bold focus:border-amber-400 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-400">Por defecto: LU1TSB</span>
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Personal (para envío de eQSL)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lu1tsb@radioclub.org"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-400 focus:outline-hidden"
              />
            </div>

          </div>

          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">2. Diseño eQSL</h3>
            <p className="text-[11px] text-slate-500 mt-1">Los motivos visuales estarán disponibles más adelante como imágenes para elegir con un clic.</p>
          </div>
          {/* Diseños temáticos: galería visual pendiente */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-sky-500/20">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-sky-300">Diseño eQSL predeterminado</span>
            </div>
            <p className="text-[11px] text-slate-400">La selección de motivos se incorporará más adelante. Se mostrarán imágenes de cada diseño, sin una lista de nombres, y podrás seleccionar la que quieras con un solo clic.</p>
          </div>

          {/* Foto de fondo para tarjetas eQSL */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">
                  Foto de fondo para tu tarjeta eQSL
                </span>
              </div>
              {customBg && (
                <span className="text-[11px] text-emerald-400 font-semibold">
                  ✓ Foto activa
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Podés subir una foto de tu estación de radio, antenas o paisaje local desde tu galería para que aparezca de fondo en todas tus tarjetas eQSL.
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    if (dataUrl) {
                      setCustomBg(dataUrl);
                      localStorage.setItem('eqsl_custom_bg', dataUrl);
                      try {
                        const existing = JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]') as Array<{ id: string; name: string; dataUrl: string }>;
                        const entry = { id: `${Date.now()}-${file.name}`, name: file.name, dataUrl };
                        localStorage.setItem('eqsl_gallery_images', JSON.stringify([...existing, entry]));
                      } catch {
                        window.alert('La foto quedó aplicada, pero no se pudo añadir a la galería guardada.');
                      }
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {customBg ? 'Cambiar foto de galería' : 'Cargar foto desde mi galería'}
              </button>
              {customBg && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomBg(null);
                    localStorage.removeItem('eqsl_custom_bg');
                    try {
                      const existing = JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]') as Array<{ id: string; name: string; dataUrl: string }>;
                      localStorage.setItem('eqsl_gallery_images', JSON.stringify(existing.filter((item) => item.dataUrl !== customBg)));
                    } catch { /* La foto ya se ha desactivado aunque la galería no se pueda leer. */ }
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar foto
                </button>
              )}
            </div>
          </div>
          {/* Footer del Modal */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div className="text-xs text-emerald-400 font-medium">
              {savedSuccess ? '¡Guardado correctamente!' : ''}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Guardar Configuración
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
