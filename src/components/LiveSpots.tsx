import React, { useEffect, useState } from 'react';
import { Radio, Clock3, Signal, RefreshCw, Wifi, WifiOff, Trash2 } from 'lucide-react';
import { QSO } from '../types';
import { supabase } from '../services/supabaseClient';
import { getUserCallsign } from '../services/qrzService';
import { countryForCallsign, flagForCallsign } from '../services/callsignCountry';

const isElevenMeterSpot = (band: string, frequency: string): boolean => {
  const normalizedBand = String(band || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mhz = Number(String(frequency || '').replace(',', '.'));
  return /11\s*metros|11\s*m|27\s*mhz|banda ciudadana|\bcb\b/.test(normalizedBand)
    || (Number.isFinite(mhz) && mhz >= 26 && mhz <= 28);
};

type Spot = {
  spot_key: string; callsign: string; station_callsign: string; qso_date: string;
  qso_time: string; band: string; frequency: string; mode: string; country: string | null;
  created_at: string;
};

export async function publishQsoSpot(qso: QSO) {
  if (!supabase) return;
  const ownCall = (qso.stationCallsign || getUserCallsign() || '').trim().toUpperCase();
  const remoteCall = String(qso.callsign || '').trim().toUpperCase();
  if (!ownCall || !remoteCall || !qso.date || !qso.time || !qso.frequency || !qso.band) return;
  const spotKey = [ownCall, remoteCall, qso.date, qso.time, qso.band, String(qso.frequency).replace(',', '.'), qso.mode].join('|');
  const { error } = await supabase.from('live_qso_spots').upsert({
    spot_key: spotKey,
    callsign: remoteCall,
    station_callsign: ownCall,
    qso_date: qso.date,
    qso_time: qso.time,
    band: qso.band,
    frequency: String(qso.frequency).replace(',', '.'),
    mode: qso.mode || '',
    country: countryForCallsign(remoteCall, qso.country, isElevenMeterSpot(String(qso.band || ''), String(qso.frequency || ''))),
  }, { onConflict: 'spot_key', ignoreDuplicates: true });
  if (error) console.warn('No se pudo publicar el spot en vivo:', error.message);
}

export const LiveSpots: React.FC = () => {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [adminStatus, setAdminStatus] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCallsign, setAdminCallsign] = useState(() => (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
  const [identityToken, setIdentityToken] = useState(() => localStorage.getItem('community_chat_identity_token') || '');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const loadSpots = async () => {
    if (!supabase) { setErrorMessage('La conexión compartida no está configurada.'); setLoading(false); return; }
    const { data, error } = await supabase.from('live_qso_spots').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) { setErrorMessage('Falta configurar la tabla compartida de spots en Supabase.'); setLoading(false); return; }
    setSpots((data || []) as Spot[]);
    setErrorMessage('');
    setLoading(false);
  };

  useEffect(() => {
    const syncIdentity = () => {
      setAdminCallsign((localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
      setIdentityToken(localStorage.getItem('community_chat_identity_token') || '');
    };
    window.addEventListener('user-profile-updated', syncIdentity);
    window.addEventListener('storage', syncIdentity);
    syncIdentity();
    return () => {
      window.removeEventListener('user-profile-updated', syncIdentity);
      window.removeEventListener('storage', syncIdentity);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const verifyAdmin = async () => {
      if (!supabase || !adminCallsign || !identityToken) {
        if (active) setIsAdmin(false);
        return;
      }
      const { data, error } = await supabase.rpc('community_actor_role', {
        p_callsign: adminCallsign,
        p_token: identityToken,
      });
      if (!active) return;
      setIsAdmin(!error && data === 'admin');
      if (error) console.warn('[LogBook spots] No se pudo verificar el rol de administrador:', error.message);
    };
    void verifyAdmin();
    return () => { active = false; };
  }, [adminCallsign, identityToken]);

  useEffect(() => {
    void loadSpots();
    if (!supabase) return;
    const channel = supabase.channel('live-qso-spots-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_qso_spots' }, () => { void loadSpots(); })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const deleteSpot = async (spot: Spot) => {
    if (!supabase || !isAdmin || !identityToken || !adminCallsign) return;
    if (!window.confirm(`¿Borrar únicamente el spot de ${spot.callsign} ↔ ${spot.station_callsign} (${spot.qso_date} ${spot.qso_time} UTC)? El QSO guardado y las eQSL no se modificarán.`)) return;
    setDeletingKey(spot.spot_key);
    setAdminStatus('');
    const { data, error } = await supabase.rpc('admin_delete_live_qso_spot', {
      p_callsign: adminCallsign,
      p_token: identityToken,
      p_spot_key: spot.spot_key,
    });
    setDeletingKey(null);
    if (error) { setAdminStatus('No se pudo borrar el spot. Verificá que esté aplicada la migración de administración en Supabase.'); return; }
    if (Number(data) > 0) {
      setSpots(current => current.filter(item => item.spot_key !== spot.spot_key));
      setAdminStatus('Spot eliminado.');
    } else {
      await loadSpots();
      setAdminStatus('El spot ya no estaba disponible.');
    }
  };

  const deleteAllSpots = async () => {
    if (!supabase || !isAdmin || !identityToken || !adminCallsign || spots.length === 0) return;
    if (!window.confirm(`¿Borrar TODOS los spots en vivo? Esta acción eliminará los spots compartidos de todos los usuarios, pero no los QSO guardados, las eQSL ni los mensajes del chat. No se puede deshacer.`)) return;
    setDeletingAll(true);
    setAdminStatus('');
    const { data, error } = await supabase.rpc('admin_delete_all_live_qso_spots', {
      p_callsign: adminCallsign,
      p_token: identityToken,
    });
    setDeletingAll(false);
    if (error) { setAdminStatus('No se pudieron borrar los spots. Verificá que esté aplicada la migración de administración en Supabase.'); return; }
    setSpots([]);
    setAdminStatus(`Se eliminaron ${Number(data) || 0} spot(s).`);
  };

  return <section className="mb-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-md">
    <div className="flex min-w-0 items-center justify-between gap-2 bg-slate-900 px-3 py-3 text-white">
      <div className="flex min-w-0 items-center gap-2"><Radio className="h-5 w-5 shrink-0 text-cyan-300" /><h2 className="whitespace-nowrap text-sm font-bold sm:text-base">Spot en vivo</h2></div>
      <div className="flex shrink-0 items-center gap-1 text-[10px]">{connected ? <><Wifi className="h-4 w-4 text-emerald-300" /> En vivo</> : <><WifiOff className="h-4 w-4 text-amber-300" /> Conectando</>}</div>
    </div>
    {errorMessage && <p className="px-4 py-3 text-sm text-amber-300">{errorMessage}</p>}
    {adminStatus && <p role="status" className="px-4 py-2 text-sm text-slate-200">{adminStatus}</p>}
    {isAdmin && <div className="flex items-center justify-between gap-2 border-b border-rose-900 bg-slate-900 px-3 py-2">
      <span className="text-xs font-semibold text-rose-200">Administración de spots</span>
      <button type="button" disabled={spots.length === 0 || deletingAll || Boolean(deletingKey)} onClick={() => void deleteAllSpots()} className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-2.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{deletingAll ? 'Borrando…' : 'Borrar todos'}</button>
    </div>}
    {loading && <p className="px-4 py-3 text-sm text-slate-500">Cargando spots…</p>}
    {!loading && !errorMessage && spots.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Todavía no hay spots compartidos. Al registrar un QSO aparecerá aquí.</p>}
    {spots.length > 0 && <div className="divide-y divide-slate-800">{spots.map(spot => <article key={spot.spot_key} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-bold text-slate-100"><span>{flagForCallsign(spot.callsign, isElevenMeterSpot(spot.band, spot.frequency) ? undefined : spot.country, isElevenMeterSpot(spot.band, spot.frequency))} {spot.callsign}</span><span className="text-slate-500">↔</span><span>{flagForCallsign(spot.station_callsign, undefined, isElevenMeterSpot(spot.band, spot.frequency))} {spot.station_callsign}</span></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300"><span className="inline-flex items-center gap-1"><Signal className="h-3.5 w-3.5" /> {spot.frequency} MHz · {spot.band}</span><span>{spot.mode}</span></div></div>
      <div className="flex items-center gap-2 text-right text-xs text-slate-300"><div><div className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{spot.qso_time} UTC</div><div className="mt-1">{spot.qso_date}</div></div>{isAdmin && <button type="button" aria-label={`Borrar spot ${spot.callsign}`} title="Borrar este spot" disabled={Boolean(deletingKey) || deletingAll} onClick={() => void deleteSpot(spot)} className="rounded-lg p-2 text-rose-700 hover:bg-rose-950 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}</div>
    </article>)}</div>}
    <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2"><span className="text-[10px] text-slate-500">Solo contactos guardados; hora UTC registrada.</span><button type="button" onClick={() => { setLoading(true); void loadSpots(); }} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-800"><RefreshCw className="h-3.5 w-3.5" /> Actualizar</button></div>
  </section>;
};
