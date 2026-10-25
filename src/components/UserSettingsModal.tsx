/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings, Check, X, Image as ImageIcon, Trash2, Mail, Copy } from 'lucide-react';
import { requestChatInvitation } from '../services/chatInvitation';

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
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappUsername, setWhatsappUsername] = useState('');
  const [telegram, setTelegram] = useState('');
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; name: string; dataUrl: string }>>([]);
  const [defaultEQSLTheme, setDefaultEQSLTheme] = useState('navy');
  const [appLanguage, setAppLanguage] = useState('es');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [chatInvitePending, setChatInvitePending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCallsign(localStorage.getItem('user_callsign') || '');
      setEmail(localStorage.getItem('user_email') || '');
      setWhatsapp(localStorage.getItem('user_whatsapp') || '');
      setWhatsappUsername(localStorage.getItem('user_whatsapp_username') || '');
      setTelegram(localStorage.getItem('user_telegram') || '');
      setCustomBg(localStorage.getItem('eqsl_custom_bg') || null);
      let savedGallery: Array<{ id: string; name: string; dataUrl: string }> = [];
      try {
        savedGallery = JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]');
        setGalleryImages(savedGallery);
      } catch { setGalleryImages([]); }
      // Recuperación única: si falta el encabezamiento protegido, copiar una sola
      // vez la primera imagen de la galería a una clave independiente.
      // Nunca modificarla después al cambiar o borrar diseños eQSL.
      if (!localStorage.getItem('app_header_image_locked')) {
        const existingHeader = localStorage.getItem('app_header_image');
        const recoveryImage = existingHeader || savedGallery[0]?.dataUrl;
        if (recoveryImage) {
          localStorage.setItem('app_header_image_locked', recoveryImage);
          window.dispatchEvent(new Event('user-branding-updated'));
        }
      }
      setDefaultEQSLTheme(localStorage.getItem('eqsl_theme') || 'navy');
      setAppLanguage(localStorage.getItem('app_language') || 'es');
      setChatInvitePending(localStorage.getItem('logbook_chat_invitation_pending') === '1' && localStorage.getItem('logbook_chat_authenticated') !== '1');
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // El encabezamiento pertenece a la aplicación, no al diseño eQSL.
  // Antes de modificar o borrar fondos eQSL, conservamos una copia independiente
  // de la imagen que ya se estaba usando en el encabezamiento.
  const preserveHeaderImage = (possibleCurrentHeader?: string | null) => {
    if (localStorage.getItem('app_header_image_locked')) return;
    const explicitHeader = localStorage.getItem('app_header_image');
    if (explicitHeader) {
      localStorage.setItem('app_header_image_locked', explicitHeader);
      return;
    }
    const imageToPreserve = possibleCurrentHeader || customBg;
    if (imageToPreserve) localStorage.setItem('app_header_image_locked', imageToPreserve);
  };

  // Importa varias fotos a la galería sin activar ninguna automáticamente.
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;

    const compressImage = (file: File) => new Promise<{ id: string; name: string; dataUrl: string } | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = (event) => {
        const source = event.target?.result as string;
        if (!source) return resolve(null);
        const image = new Image();
        image.onerror = () => resolve(null);
        image.onload = () => {
          const scale = Math.min(1, 900 / image.width, 560 / image.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`, name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.62) });
        };
        image.src = source;
      };
      reader.readAsDataURL(file);
    });

    const imported = [];
    for (const file of files) {
      const item = await compressImage(file);
      if (item) imported.push(item);
    }
    if (!imported.length) {
      window.alert('No se pudieron leer las imágenes seleccionadas. Probá con archivos JPG o PNG.');
      return;
    }
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]') as Array<{ id: string; name: string; dataUrl: string }>; }
      catch { return []; }
    })();
    const next = [...existing, ...imported];
    try {
      localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
      // Si el encabezamiento aún no existe, guardar una copia independiente
      // de la primera imagen recién subida. No se vuelve a sobrescribir.
      if (!localStorage.getItem('app_header_image_locked')) {
        const existingHeader = localStorage.getItem('app_header_image');
        const recoveryImage = existingHeader || imported[0]?.dataUrl;
        if (recoveryImage) localStorage.setItem('app_header_image_locked', recoveryImage);
      }
      setGalleryImages(next);
      window.dispatchEvent(new Event('user-branding-updated'));
    } catch {
      window.alert('No hay espacio suficiente para guardar todas las fotos. Elegí menos imágenes o archivos más pequeños. Las fotos anteriores no se han reemplazado.');
    }
  };

  const handleAnchorImage = (dataUrl: string) => {
    preserveHeaderImage();
    setCustomBg(dataUrl);
    localStorage.setItem('eqsl_custom_bg', dataUrl);
  };

  const handleDeleteGalleryImage = (id: string) => {
    const removedImage = galleryImages.find((item) => item.id === id);
    preserveHeaderImage(removedImage?.dataUrl || null);
    const next = galleryImages.filter((item) => item.id !== id);
    setGalleryImages(next);
    localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
    const removed = removedImage;
    window.dispatchEvent(new Event('user-branding-updated'));
    if (removed?.dataUrl === customBg) {
      setCustomBg(null);
      localStorage.removeItem('eqsl_custom_bg');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCall = callsign.trim().toUpperCase();
    if (!finalCall) {
      window.alert('Ingresá tu indicativo de radio antes de guardar.');
      return;
    }
    localStorage.setItem('user_callsign', finalCall);
    localStorage.setItem('user_email', email.trim());
    localStorage.setItem('user_whatsapp', whatsapp.trim());
    localStorage.setItem('user_whatsapp_username', whatsappUsername.trim().replace(/^@+/, ''));
    localStorage.setItem('user_telegram', telegram.trim().replace(/^@+/, ''));
    localStorage.setItem('eqsl_theme', defaultEQSLTheme);
    localStorage.setItem('app_language', appLanguage);
    window.dispatchEvent(new Event('user-profile-updated'));

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Mi email de respuesta</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-400 focus:outline-hidden" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Mi WhatsApp (teléfono internacional)</label>
              <input type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="54911..." className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-400 focus:outline-hidden" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Mi usuario de WhatsApp (opcional)</label>
              <input type="text" value={whatsappUsername} onChange={(e) => setWhatsappUsername(e.target.value.replace(/^@+/, ''))} placeholder="usuario" className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-400 focus:outline-hidden" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Mi usuario de Telegram (opcional)</label>
              <input type="text" value={telegram} onChange={(e) => setTelegram(e.target.value.replace(/^@+/, ''))} placeholder="usuario" className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-400 focus:outline-hidden" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">Estos datos se incluyen en el enlace de respuesta que compartís con el corresponsal para que pueda elegir un canal de vuelta. Completá solo los medios por los que aceptás recibir respuestas.</p>

          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">2. Diseño eQSL</h3>
            <p className="text-[11px] text-slate-500 mt-1">Las imágenes quedan en la galería. Podés elegir Fondo eQSL o eliminar una foto.</p>
          </div>
          {/* Galería única: las fotos cargadas quedan aquí y solo se activan al tocar Anclar. */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-sky-500/20 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-sky-300">Diseños eQSL predeterminados</span>
              </div>
              <span className="text-[10px] text-slate-500">{galleryImages.length} fotos</span>
            </div>
            <p className="text-[11px] text-slate-400">Cargá tus imágenes. Para cada foto podés elegir Fondo eQSL o eliminarla de la galería.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGalleryUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Añadir fotos de galería (selección múltiple)
            </button>
            {galleryImages.length === 0 ? (
              <p className="text-xs text-slate-400">Todavía no hay fotos guardadas. Cargá una o varias para verlas aquí.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {galleryImages.map((item) => {
                  const selected = customBg === item.dataUrl;
                  return (
                    <div key={item.id} className={`overflow-hidden rounded-lg border ${selected ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-slate-700'}`}>
                      <img src={item.dataUrl} alt={item.name} className="h-24 w-full object-cover" />
                      <p className="truncate px-2 pt-1 text-[10px] text-slate-200" title={item.name}>{item.name}</p>
                      <div className="grid grid-cols-2 gap-1 p-1.5">
                        <button type="button" onClick={() => handleAnchorImage(item.dataUrl)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-amber-300 hover:bg-slate-700'}`}>{selected ? '✓ Fondo eQSL' : 'Fondo eQSL'}</button>
                        <button type="button" onClick={() => handleDeleteGalleryImage(item.id)} className="rounded-md px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-950/50" aria-label={`Eliminar ${item.name}`}><Trash2 className="inline h-3 w-3" /> Eliminar</button>
                      </div>
                      {selected && <p className="bg-slate-800 px-2 pb-1.5 text-[10px] font-semibold text-slate-200">✓ Fondo activo para eQSL</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Foto de fondo para tu tarjeta eQSL</span>
              {customBg && <span className="text-[11px] text-emerald-400 font-semibold">✓ Foto activa</span>}
            </div>
            <p className="text-[11px] text-slate-400">La foto activa se elige con “Fondo eQSL”. Agregar fotos no cambia el fondo activo.</p>
            {customBg && (
              <button
                type="button"
                onClick={() => {
                  preserveHeaderImage();
                  setCustomBg(null);
                  localStorage.removeItem('eqsl_custom_bg');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Desactivar foto activa
              </button>
            )}
          </div>
          {chatInvitePending && (
            <section className="rounded-xl border border-sky-500/30 bg-sky-950/40 p-3.5 space-y-2" aria-label="Invitación pendiente al chat">
              <h3 className="text-sm font-bold text-sky-200">Invitación pendiente</h3>
              <p className="text-xs text-slate-300">Tienes una invitación pendiente para ingresar al chat.</p>
              <button type="button" onClick={() => requestChatInvitation('settings')} className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400">Aceptar invitación</button>
            </section>
          )}
          <section className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-4 space-y-2" aria-labelledby="logbook-contact-title">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-sky-300" />
              <h3 id="logbook-contact-title" className="text-sm font-bold text-sky-200">Contacto con LogBook eQSL EXPRESS</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">Para denuncias, suplantaciones, pérdida de acceso, recuperación de clave, consultas o solicitudes relacionadas con tus datos, contactá al administrador. Esta opción está disponible sin registro.</p>
            <a href="mailto:lu1tsb.4rc978@gmail.com?subject=Contacto%20con%20LogBook%20eQSL%20EXPRESS" className="block break-all text-sm font-semibold text-sky-300 underline underline-offset-2">lu1tsb.4rc978@gmail.com</a>
            <div className="flex flex-wrap gap-2">
              <a href="mailto:lu1tsb.4rc978@gmail.com?subject=Denuncia%20o%20suplantacion%20-%20LogBook%20eQSL%20EXPRESS" className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Enviar denuncia</a>
              <a href="mailto:lu1tsb.4rc978@gmail.com?subject=Perdida%20de%20acceso%20-%20LogBook%20eQSL%20EXPRESS" className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Recuperar acceso</a>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText('lu1tsb.4rc978@gmail.com').then(() => window.alert('Correo copiado.')).catch(() => window.alert('Correo de contacto: lu1tsb.4rc978@gmail.com')); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"><Copy className="h-3 w-3" /> Copiar correo</button>
            </div>
          </section>
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
