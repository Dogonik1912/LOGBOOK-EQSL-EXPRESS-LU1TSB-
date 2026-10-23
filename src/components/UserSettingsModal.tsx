/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings, User, Mail, MapPin, Radio, Key, Check, X, ExternalLink, Image as ImageIcon, Trash2 } from 'lucide-react';
import { QRZ_LOGIN_URL, DEFAULT_CALLSIGN } from '../types';
import { lookupQRZCallsign } from '../services/qrzService';

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qth, setQth] = useState('');
  const [grid, setGrid] = useState('');
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [defaultEQSLTheme, setDefaultEQSLTheme] = useState('navy');
  const [qrzUser, setQrzUser] = useState('');
  const [qrzPass, setQrzPass] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCallsign(localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN);
      setName(localStorage.getItem('user_name') || '');
      setEmail(localStorage.getItem('user_email') || '');
      setQth(localStorage.getItem('user_qth') || '');
      setGrid(localStorage.getItem('user_grid') || '');
      setCustomBg(localStorage.getItem('eqsl_custom_bg') || null);
      setDefaultEQSLTheme(localStorage.getItem('eqsl_theme') || 'navy');
      setQrzUser(localStorage.getItem('qrz_user') || '');
      setQrzPass(localStorage.getItem('qrz_pass') || '');
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCall = callsign.trim().toUpperCase() || DEFAULT_CALLSIGN;
    localStorage.setItem('user_callsign', finalCall);
    localStorage.setItem('user_name', name.trim());
    localStorage.setItem('user_email', email.trim());
    localStorage.setItem('user_qth', qth.trim());
    localStorage.setItem('user_grid', grid.trim().toUpperCase());
    localStorage.setItem('eqsl_theme', defaultEQSLTheme);

    if (qrzUser.trim()) {
      localStorage.setItem('qrz_user', qrzUser.trim());
      localStorage.removeItem('qrz_skipped');
    } else {
      localStorage.removeItem('qrz_user');
    }

    if (qrzPass) {
      localStorage.setItem('qrz_pass', qrzPass);
    } else {
      localStorage.removeItem('qrz_pass');
    }
    localStorage.removeItem('hamqth_user');
    localStorage.removeItem('hamqth_pass');
    localStorage.removeItem('qrz_logbook_key');
    localStorage.removeItem('qrz_auto_upload');
    localStorage.removeItem('eqsl_user');
    localStorage.removeItem('eqsl_pass');

    setSavedSuccess(true);
    onUpdate();
    // Intentar completar el nombre propio desde el perfil QRZ del indicativo de estación.
    // Si QRZ no devuelve un nombre, se conserva el dato existente y no se inventa uno.
    void lookupQRZCallsign(finalCall).then((profile) => {
      if (profile.name && profile.name.trim()) {
        localStorage.setItem('user_name', profile.name.trim());
        setName(profile.name.trim());
        onUpdate();
      }
    }).catch((error) => console.warn('No se pudo obtener el nombre del operador desde QRZ:', error));
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
              <p className="text-xs text-slate-400">Datos de estación y credenciales locales</p>
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre del Operador
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Martín"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-400 focus:outline-hidden"
              />
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Grid Locator
              </label>
              <input
                type="text"
                value={grid}
                onChange={(e) => setGrid(e.target.value)}
                placeholder="GF05te"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono uppercase text-white focus:border-amber-400 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              QTH / Ciudad y Provincia
            </label>
            <input
              type="text"
              value={qth}
              onChange={(e) => setQth(e.target.value)}
              placeholder="Buenos Aires, Argentina"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          {/* Modelo eQSL predeterminado */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-sky-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-sky-300">Diseño eQSL predeterminado</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Elegí el modelo que se usará automáticamente al abrir el generador. Podés cambiarlo para una tarjeta concreta cuando quieras.
            </p>
            <select
              value={defaultEQSLTheme}
              onChange={(e) => setDefaultEQSLTheme(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-sky-400 focus:outline-hidden"
            >
              <option value="navy">Clásico azul</option>
              <option value="gold">Dorado</option>
              <option value="cyber">Radio digital</option>
              <option value="sunset">Puesta de sol</option>
              <option value="mountain">Montaña y antenas</option>
              <option value="aurora">Aurora boreal</option>
              <option value="ocean">Mar y DX</option>
              <option value="forest">Radio en el bosque</option>
              <option value="space">Espacio y satélites</option>
              <option value="world">Mundo DX</option>
              <option value="cw">Código Morse</option>
              <option value="field">Radio portátil</option>
              <option value="vintage">Vintage radio</option>
              <option value="signal">Ondas de radio</option>
              <option value="contest">Concurso y diplomas</option>
              <option value="moon">Luna y noche</option>
              <option value="tropical">Tropical</option>
              <option value="arctic">Polar</option>
              <option value="red">Alta potencia</option>
              <option value="yl-radio">YL · Ondas y estrellas</option>
              <option value="yl-dx">YL · Mundo DX</option>
              <option value="yl-portable">YL · Aurora y naturaleza</option>
              <option value="yl-contest">YL · Brillo y concurso</option>
              <option value="yl-antenna">YL · Antenas al atardecer</option>
            </select>
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
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar foto
                </button>
              )}
            </div>
          </div>

          {/* Sección QRZ.com */}
          <div className="p-4 bg-slate-950/70 rounded-xl border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Cuenta QRZ.com (consulta de perfil)
                </span>
              </div>
              <a
                href={QRZ_LOGIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-300 hover:text-amber-200 inline-flex items-center gap-1"
              >
                Abrir QRZ <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Usuario QRZ</label>
                <input
                  type="text"
                  value={qrzUser}
                  onChange={(e) => setQrzUser(e.target.value)}
                  placeholder="ej. LU1TSB"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Contraseña QRZ</label>
                <input
                  type="password"
                  value={qrzPass}
                  onChange={(e) => setQrzPass(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-400 focus:outline-hidden"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              La app consultará los campos que QRZ permita devolver. No inventará correos ni tomará direcciones de scripts, anuncios o pies de página; el correo puede no estar disponible para todos los perfiles.
            </p>
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
