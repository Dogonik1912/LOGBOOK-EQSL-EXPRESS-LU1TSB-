import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * Initial one-time SD identity check. Existing devices with a saved community
 * identity are grandfathered in; new identities are registered server-side.
 */
export const InitialSdValidation: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [required, setRequired] = useState(false);
  const [callsign, setCallsign] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deviceLimit, setDeviceLimit] = useState(false);
  const [helpChoice, setHelpChoice] = useState<'radio' | 'other' | null>(null);
  const [welcome, setWelcome] = useState<{ callsign: string; name: string } | null>(null);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      let token = localStorage.getItem('community_chat_identity_token') || '';
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem('community_chat_identity_token', token);
      }
      const savedCall = (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
      if (token && supabase) {
        // Keep the installation validation as the single registration point for
        // all app features. Reconcile legacy local identities with the server.
        let canonicalCall = savedCall;
        const { data: recovered, error: recoveryError } = await supabase.rpc('resolve_community_callsign', { p_token: token });
        if (!recoveryError && typeof recovered === 'string' && recovered.trim()) {
          canonicalCall = recovered.trim().toUpperCase();
        }
        if (canonicalCall) {
          const { data: registration, error: registrationError } = await supabase.rpc('register_community_callsign', {
            p_callsign: canonicalCall,
            p_token: token,
          });
          if (!registrationError && registration?.ok) {
            localStorage.setItem('community_chat_sd', canonicalCall);
            localStorage.setItem('user_callsign', canonicalCall);
            localStorage.setItem('logbook_sd_validated', '1');
            if (active) { setCallsign(canonicalCall); setReady(true); }
            return;
          }
          const reason = String(registration?.reason || '');
          if (reason === 'taken' || reason === 'locked') {
            if (active) {
              setCallsign(canonicalCall);
              setError(reason === 'taken'
                ? 'Ese indicativo ya está vinculado a otra identidad. Contactá con administración para revisar el acceso.'
                : 'Este dispositivo tiene otro indicativo vinculado. Recuperá la señal distintiva original o solicitá una revisión.');
              setRequired(true);
              setReady(true);
            }
            return;
          }
          // A temporary network failure does not block an installation that was
          // already validated; reconciliation is retried on the next launch.
          if (localStorage.getItem('logbook_sd_validated') === '1' && savedCall) {
            if (active) { setCallsign(savedCall); setReady(true); }
            return;
          }
        }
      }
      if (active) { setRequired(true); setReady(true); }
    };
    void initialize();
    return () => { active = false; };
  }, []);

  const validate = async () => {
    if (!supabase) {
      setError('La validación no está disponible ahora. Volvé a intentarlo más tarde.');
      return;
    }
    const clean = callsign.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (clean.length < 3 || clean.length > 24) {
      setError('Ingresá una señal distintiva de entre 3 y 24 caracteres.');
      return;
    }
    const token = localStorage.getItem('community_chat_identity_token') || crypto.randomUUID();
    localStorage.setItem('community_chat_identity_token', token);
    setBusy(true);
    setError('');
    try {
      const { data, error: registerError } = await supabase.rpc('register_community_callsign', {
        p_callsign: clean,
        p_token: token,
      });
      if (data?.reason === 'device_limit') {
        setDeviceLimit(true);
        return;
      }
      if (registerError || !data?.ok) {
        setError(data?.reason === 'taken'
          ? 'Ese indicativo ya está registrado por otra persona.'
          : 'No se pudo validar el indicativo. Comprobá la conexión e intentá nuevamente.');
        return;
      }
      localStorage.setItem('community_chat_sd', clean);
      localStorage.setItem('logbook_sd_validated', '1');
      localStorage.setItem('user_callsign', clean);
      window.dispatchEvent(new Event('user-profile-updated'));
      // The official Argentine license-holder lookup is not connected yet.
      // Use a saved verified holder name only when one is already available; never invent it.
      const holderName = (localStorage.getItem('radio_license_holder_name') || '').trim();
      setWelcome({ callsign: clean, name: holderName });
      setRequired(false);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;
  if (deviceLimit) return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/90 p-4" role="alertdialog" aria-modal="true" aria-labelledby="device-limit-title">
      <section className="w-full max-w-md rounded-2xl border border-red-400 bg-slate-900 p-6 text-white shadow-2xl">
        <h2 id="device-limit-title" className="text-xl font-black text-red-300">Acceso bloqueado — Límite de dispositivos alcanzado</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">Este indicativo ya tiene 2 dispositivos autorizados. Si cambiaste de teléfono o computadora, o necesitás reemplazar un dispositivo, comunicate con el administrador para solicitar la revisión y autorización.</p>
        <p className="mt-4 text-sm font-semibold">Correo de administración:</p>
        <a className="mt-1 block break-all text-sky-300 underline" href="mailto:lu1tsb.4rc978@gmail.com">lu1tsb.4rc978@gmail.com</a>
        <p className="mt-4 text-xs text-slate-400">No necesitás crear otra cuenta ni proporcionar datos personales adicionales.</p>
      </section>
    </div>
  );
  if (!required) return <>{welcome && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><section className="w-full max-w-md rounded-2xl border border-sky-300 bg-white p-6 text-center text-slate-900 shadow-2xl"><p className="text-xl font-black text-sky-800">{welcome.callsign}{welcome.name ? ` · ${welcome.name}` : ''}</p><h2 id="welcome-title" className="mt-3 text-xl font-bold">¡Bienvenido a <strong>LogBook eQSL EXPRESS</strong>!</h2><p className="mt-4 text-base leading-relaxed">Aquí encontrarás<br />las herramientas<br />para hacer radio<br />de forma más fácil.</p><button type="button" autoFocus onClick={() => setWelcome(null)} className="mt-5 min-h-12 w-full rounded-xl bg-sky-700 px-4 py-3 text-base font-black text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-sky-300">CERRAR Y ENTRAR A LA APP</button></section></div>} {children}</>;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="sd-validation-title">
      <section className="w-full max-w-md rounded-2xl border border-sky-400 bg-slate-900 p-5 text-white shadow-2xl">
        <h2 id="sd-validation-title" className="text-lg font-black">Validación inicial de SD</h2>
        <p className="mt-2 text-sm text-slate-200">Para continuar e instalar LogBook eQSL EXPRESS, identificá tu estación una sola vez.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setHelpChoice('radio')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${helpChoice === 'radio' ? 'border-sky-300 bg-sky-800' : 'border-slate-600 bg-slate-800'}`}>Tengo SD de radioaficionado</button>
          <button type="button" onClick={() => setHelpChoice('other')} className={`rounded-xl border px-3 py-3 text-sm font-bold ${helpChoice === 'other' ? 'border-sky-300 bg-sky-800' : 'border-slate-600 bg-slate-800'}`}>No tengo SD de radioaficionado</button>
        </div>
        {helpChoice && <div className="mt-4">
          <label htmlFor="initial-sd" className="mb-1 block text-sm font-semibold"> {helpChoice === 'radio' ? 'Ingresá tu SD para validarla' : 'Ingresá el indicativo que usarás en la app'} </label>
          <input id="initial-sd" value={callsign} onChange={(event) => setCallsign(event.target.value.toUpperCase())} autoComplete="off" maxLength={24} placeholder="Ej.: LU1ABC" className="w-full rounded-lg border border-slate-500 bg-slate-950 px-3 py-3 font-mono text-base uppercase text-white outline-none focus:border-sky-400" />
          <p className="mt-2 text-xs text-slate-400">El sistema comprobará que el indicativo pueda registrarse y que no esté asignado a otra identidad. Esto no sustituye una comprobación oficial de licencia.</p>
        </div>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}
        <button type="button" disabled={!helpChoice || busy || !callsign.trim()} onClick={() => { void validate(); }} className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Validando…' : 'Validar y continuar'}</button>
        <p className="mt-3 text-center text-xs text-slate-400">Este aviso no volverá a aparecer en este dispositivo una vez validada la identidad.</p>
      </section>
    </div>
  );
};
