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
  const [helpChoice, setHelpChoice] = useState<'radio' | 'other' | null>(null);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      let token = localStorage.getItem('community_chat_identity_token') || '';
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem('community_chat_identity_token', token);
      }
      const savedCall = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (localStorage.getItem('logbook_sd_validated') === '1' && savedCall) {
        if (active) { setCallsign(savedCall); setReady(true); }
        return;
      }
      // Older installations that already completed the community identity flow
      // should not be prompted again.
      if (savedCall && token) {
        localStorage.setItem('logbook_sd_validated', '1');
        if (active) { setCallsign(savedCall); setReady(true); }
        return;
      }
      if (token && supabase) {
        const { data, error: recoveryError } = await supabase.rpc('resolve_community_callsign', { p_token: token });
        if (!recoveryError && typeof data === 'string' && data.trim()) {
          const recovered = data.trim().toUpperCase();
          localStorage.setItem('community_chat_sd', recovered);
          localStorage.setItem('logbook_sd_validated', '1');
          if (active) { setCallsign(recovered); setReady(true); }
          return;
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
      setRequired(false);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;
  if (!required) return <>{children}</>;

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
