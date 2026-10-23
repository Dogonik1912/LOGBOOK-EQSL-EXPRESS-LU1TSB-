/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, MessageCircle, Download, Smartphone, Mail, Phone } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenReplyModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenReplyModal,
}) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showRegistration, setShowRegistration] = useState(() => !localStorage.getItem('user_email')?.trim() && !localStorage.getItem('user_whatsapp')?.trim());
  const [installAfterRegistration, setInstallAfterRegistration] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState(() => localStorage.getItem('user_email') || '');
  const [registrationWhatsapp, setRegistrationWhatsapp] = useState(() => localStorage.getItem('user_whatsapp') || '');
  const [registrationPassword, setRegistrationPassword] = useState('');

  const [callsign, setCallsign] = useState(() => localStorage.getItem('user_callsign')?.trim().toUpperCase() || 'SIN REGISTRO');

  useEffect(() => {
    const syncCallsign = () => setCallsign(localStorage.getItem('user_callsign')?.trim().toUpperCase() || 'SIN REGISTRO');
    window.addEventListener('user-profile-updated', syncCallsign);
    window.addEventListener('storage', syncCallsign);
    return () => {
      window.removeEventListener('user-profile-updated', syncCallsign);
      window.removeEventListener('storage', syncCallsign);
    };
  }, []);

  useEffect(() => {
    const checkInstalled = () => setIsInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    checkInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', checkInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', checkInstalled);
    };
  }, []);

  const handleInstall = () => {
    if (!localStorage.getItem('user_email')?.trim() && !localStorage.getItem('user_whatsapp')?.trim()) {
      setInstallAfterRegistration(true);
    }
    setShowRegistration(true);
  };

  const handleRegister = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = registrationEmail.trim();
    const whatsapp = registrationWhatsapp.trim();
    if (!email && !whatsapp) {
      window.alert('Para continuar, ingresá al menos un dato de contacto: correo electrónico o WhatsApp. Podés completar ambos.');
      return;
    }
    if (email) localStorage.setItem('user_email', email);
    else localStorage.removeItem('user_email');
    if (whatsapp) localStorage.setItem('user_whatsapp', whatsapp);
    else localStorage.removeItem('user_whatsapp');
    setShowRegistration(false);
    window.dispatchEvent(new Event('user-profile-updated'));
    window.alert('Datos de contacto guardados en este dispositivo. Importante: todavía no existe un servidor de cuentas, así que esto no crea una cuenta sincronizada entre dispositivos.');
    if (installAfterRegistration) {
      setInstallAfterRegistration(false);
      if (installPrompt) {
        void (async () => {
          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          if (choice?.outcome === 'accepted') setIsInstalled(true);
          setInstallPrompt(null);
        })();
      } else {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        window.alert(isInstalled
          ? 'LB EQSL EXPRESS ya está instalada en este equipo.'
          : isIOS
            ? 'Para instalar en iPhone/iPad: tocá Compartir en Safari y elegí “Agregar a pantalla de inicio”.'
            : 'Para instalar: abrí el menú del navegador (⋮ o …) y elegí “Instalar aplicación” o “Agregar a pantalla de inicio”. En PC, buscá el icono de instalación en la barra de direcciones.');
      }
    }
  };

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Marca y Callsign */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 rounded-xl shadow-lg shadow-amber-500/20">
            <img src="/icon.svg" alt="LB EQSL EXPRESS" className="w-10 h-10 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                <span className="text-amber-400">EQSL EXPRESS</span>
              </h1>
              <span className="px-2 py-0.5 bg-amber-400/10 border border-amber-400/30 text-amber-300 font-mono text-xs font-bold rounded-md">
                {callsign}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Libro de guardia y tarjetas eQSL
            </p>
          </div>
        </div>

        {/* Zona derecha: instalación, compartir app, responder eQSL y ajustes */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => { void handleInstall(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            title="Instalar LB EQSL EXPRESS en este equipo"
          >
            {isInstalled ? <Smartphone className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>{isInstalled ? 'App instalada' : 'Instalar app'}</span>
          </button>

          {/* PRIORIDAD 2: Botón Compartir app por WhatsApp */}
          <a
            href="https://wa.me/?text=LogBook%20eQSL%20Express%20-%20https%3A%2F%2Flogbook-eqsl-express-lu-1-tsb.vercel.app%2F"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow-emerald-500/20 transition-all cursor-pointer"
            title="Compartir app por WhatsApp"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
            <span>Compartir app por WhatsApp</span>
          </a>

          {/* Botón Responder eQSL */}
          {onOpenReplyModal && (
            <button
              type="button"
              onClick={onOpenReplyModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              title="Responder o confirmar una eQSL recibida de otro colega"
            >
              <span>Responder eQSL</span>
            </button>
          )}

          {/* Botón Ajustes */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Ajustes de estación"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      {showRegistration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="registration-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="registration-title" className="text-xl font-bold text-white">Registro obligatorio de contacto</h2>
            </div>
            <form onSubmit={handleRegister} className="space-y-3">
              <p className="text-sm leading-relaxed text-slate-300">Para usar LogBook eQSL Express, completá al menos un dato de contacto. Podés ingresar correo, WhatsApp o ambos.</p>
              <label className="block text-sm text-slate-300">Correo electrónico
                <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3"><Mail className="h-4 w-4 text-slate-500" /><input type="email" autoComplete="email" value={registrationEmail} onChange={(e) => setRegistrationEmail(e.target.value)} className="w-full bg-transparent py-2.5 text-white outline-none" placeholder="tu@correo.com" /></span>
              </label>
              <label className="block text-sm text-slate-300">WhatsApp
                <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3"><Phone className="h-4 w-4 text-slate-500" /><input type="tel" autoComplete="tel" value={registrationWhatsapp} onChange={(e) => setRegistrationWhatsapp(e.target.value)} className="w-full bg-transparent py-2.5 text-white outline-none" placeholder="+54 ..." /></span>
              </label>
              <div className="rounded-lg border border-sky-900 bg-sky-950/50 p-3 text-xs leading-relaxed text-sky-100">
                Este registro guarda los datos únicamente en este dispositivo. Todavía no hay un servidor seguro de cuentas ni sincronización entre dispositivos. No ingreses contraseñas: esta versión no las necesita ni las guarda.
              </div>
              <button type="submit" className="w-full rounded-xl bg-amber-500 px-4 py-3 font-bold text-slate-950 hover:bg-amber-400">Guardar contacto y entrar</button>
            </form>
          </div>
        </div>
      )}
      </div>
    </header>
  );
};
