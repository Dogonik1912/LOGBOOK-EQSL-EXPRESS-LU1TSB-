import React, { useEffect, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

const isValidGridLocator = (value: string) =>
  /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/i.test(value.trim());

export const GridLocatorReminder: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;

    const checkGridLocator = async () => {
      const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      const token = (localStorage.getItem('community_chat_identity_token') || '').trim();

      if (!callsign || !token) {
        if (active) setVisible(false);
        return;
      }

      const localGrid = (localStorage.getItem('user_grid_locator') || '').trim().toUpperCase();
      if (isValidGridLocator(localGrid)) {
        if (active) setVisible(false);
        return;
      }

      if (!supabase) {
        if (active) setVisible(true);
        return;
      }

      try {
        // Consultar el registro central para no volver a avisar a quien ya
        // guardó su locator en otro dispositivo autorizado.
        const { data, error } = await supabase
          .from('live_spot_grid_locators')
          .select('grid_locator')
          .eq('callsign', callsign)
          .maybeSingle();

        if (!active) return;
        const savedGrid = String(data?.grid_locator || '').trim().toUpperCase();
        if (!error && isValidGridLocator(savedGrid)) {
          try { localStorage.setItem('user_grid_locator', savedGrid); } catch { /* La consulta central ya confirmó el dato. */ }
          setVisible(false);
        } else {
          // Si la consulta falla, mantenemos el recordatorio visible; el usuario
          // podrá abrir Ajustes y volver a guardar su locator.
          setVisible(true);
        }
      } catch {
        if (active) setVisible(true);
      }
    };

    const refresh = () => { void checkGridLocator(); };
    refresh();
    window.addEventListener('user-profile-updated', refresh);
    window.addEventListener('pageshow', refresh);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener('user-profile-updated', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  if (!visible) return null;

  return (
    <section
      className="mx-3 mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-slate-900 shadow-lg sm:mx-6 sm:p-4"
      role="status"
      aria-live="polite"
      aria-labelledby="grid-locator-reminder-title"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900">
          <MapPin className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="grid-locator-reminder-title" className="text-sm font-black uppercase tracking-wide text-amber-950 sm:text-base">
            ¡Registrá tu Grid Locator!
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-800">
            Completá el campo Grid Locator (Maidenhead) en tu perfil. Si no lo registrás, las mediciones de distancia de tus QSO no serán exactas.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('open-user-settings-grid'))}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 sm:w-auto"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            COMPLETAR GRID LOCATOR
          </button>
        </div>
      </div>
    </section>
  );
};
