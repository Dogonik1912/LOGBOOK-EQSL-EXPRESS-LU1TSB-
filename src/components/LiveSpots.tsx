import React, { useEffect, useState } from 'react';
import { Radio, Clock3, Signal, RefreshCw, Wifi, WifiOff, Trash2, Heart, Trophy, ChevronDown, ShieldCheck } from 'lucide-react';
import { QSO } from '../types';
import { supabase } from '../services/supabaseClient';
import { getUserCallsign } from '../services/qrzService';
import { countryForCallsign, flagForCallsign } from '../services/callsignCountry';
import { countryUsesMiles, distanceForSpot } from '../services/dxDistance';

// Los indicativos del feed abren la conversación privada del usuario correspondiente.
const openPrivateMessage = (rawCallsign: string) => {
  const callsign = String(rawCallsign || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (callsign.length < 3) return;
  window.dispatchEvent(new CustomEvent('open-private-message', { detail: { callsign } }));
};

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

type WeeklyWinner = {
  week_start: string; spot_key: string; callsign: string; station_callsign: string;
  qso_date: string; qso_time: string; band: string; frequency: string; mode: string;
  country: string | null; votes: number; published_at: string;
};

export async function publishQsoSpot(qso: QSO) {
  if (!supabase) return;
  const ownCall = (qso.stationCallsign || getUserCallsign() || '').trim().toUpperCase();
  const remoteCall = String(qso.callsign || '').trim().toUpperCase();
  // Nunca publicar un contacto consigo mismo; también protege contra indicativos mal asignados.
  if (!ownCall || !remoteCall || ownCall === remoteCall || !qso.date || !qso.time || !qso.frequency || !qso.band) return;
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
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminCallsign, setAdminCallsign] = useState(() => (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
  const [identityToken, setIdentityToken] = useState(() => localStorage.getItem('community_chat_identity_token') || '');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [votedSpotKeys, setVotedSpotKeys] = useState<Set<string>>(() => new Set());
  const [votingKey, setVotingKey] = useState<string | null>(null);
  const [voteMessage, setVoteMessage] = useState('');
  const [weeklyWinner, setWeeklyWinner] = useState<WeeklyWinner | null>(null);
  const [gridLocators, setGridLocators] = useState<Record<string, string>>({});

  const loadGridLocators = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('live_spot_grid_locators').select('callsign,grid_locator');
    if (error) { console.warn('[LogBook spots] No se pudieron cargar los Grid Locator:', error.message); return; }
    const locators: Record<string, string> = {};
    (data || []).forEach((item: { callsign: string; grid_locator: string | null }) => {
      if (item.grid_locator) locators[String(item.callsign).trim().toUpperCase()] = item.grid_locator;
    });
    setGridLocators(locators);
  };

  const loadSpots = async () => {
    if (!supabase) { setErrorMessage('La conexión compartida no está configurada.'); setLoading(false); return; }
    const { data, error } = await supabase.from('live_qso_spots').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) { setErrorMessage('Falta configurar la tabla compartida de spots en Supabase.'); setLoading(false); return; }
    // Ocultar registros históricos inválidos que muestran una estación contactándose a sí misma.
    setSpots(((data || []) as Spot[]).filter((spot) => {
      const remote = String(spot.callsign || '').trim().toUpperCase();
      const own = String(spot.station_callsign || '').trim().toUpperCase();
      return Boolean(remote && own && remote !== own);
    }));
    setErrorMessage('');
    setLoading(false);
  };

  const loadWeeklyWinnerAndVotes = async () => {
    if (!supabase) return;
    // Cierra de forma idempotente la semana UTC ya terminada y conserva su ganador.
    const { error: finalizeError } = await supabase.rpc('finalize_previous_live_spot_week');
    if (finalizeError) console.warn('[LogBook spots] No se pudo publicar el ganador semanal:', finalizeError.message);
    const { data: winners, error: winnerError } = await supabase
      .from('live_qso_spot_weekly_winners').select('*').order('week_start', { ascending: false }).limit(1);
    if (!winnerError) setWeeklyWinner((winners?.[0] as WeeklyWinner | undefined) || null);
    if (!adminCallsign || !identityToken) return;
    const { data: voted, error: votesError } = await supabase.rpc('get_my_live_spot_votes', {
      p_callsign: adminCallsign, p_token: identityToken,
    });
    if (!votesError && Array.isArray(voted)) setVotedSpotKeys(new Set(voted.map((item: any) => typeof item === 'string' ? item : item.spot_key).filter(Boolean)));
  };

  const voteForSpot = async (spot: Spot) => {
    if (!supabase || !adminCallsign || !identityToken || votedSpotKeys.has(spot.spot_key) || votingKey) return;
    setVotingKey(spot.spot_key);
    setVoteMessage('');
    const { data, error } = await supabase.rpc('vote_live_qso_spot', {
      p_callsign: adminCallsign, p_token: identityToken, p_spot_key: spot.spot_key,
    });
    setVotingKey(null);
    if (error || !data?.ok) {
      const reason = data?.reason;
      if (reason === 'already_voted') {
        setVotedSpotKeys(current => new Set(current).add(spot.spot_key));
        setVoteMessage('Ya habías votado este spot esta semana.');
      } else if (reason === 'identity_not_verified') {
        setVoteMessage('No se pudo validar tu indicativo. Revisá tu registro compartido e ingresá nuevamente.');
      } else {
        setVoteMessage('No se pudo registrar el voto. Comprobá la conexión e intentá de nuevo.');
      }
      console.warn('[LogBook spots] No se pudo registrar el voto:', error?.message || reason);
      return;
    }
    setVotedSpotKeys(current => new Set(current).add(spot.spot_key));
    setVoteMessage('Voto registrado. El corazón quedará rojo para este spot durante esta semana.');
    if (data.winner) setWeeklyWinner(data.winner as WeeklyWinner);
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
    void loadGridLocators();
    if (!supabase) return;
    const channel = supabase.channel('live-qso-spots-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_qso_spots' }, () => { void loadSpots(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_spot_grid_locators' }, () => { void loadGridLocators(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_qso_spot_weekly_winners' }, () => { void loadWeeklyWinnerAndVotes(); })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    void loadWeeklyWinnerAndVotes();
  }, [adminCallsign, identityToken]);

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
    {weeklyWinner && <div className="flex min-w-0 items-center gap-2 overflow-hidden border-b border-amber-700/60 bg-amber-950/50 px-2 py-1.5 text-xs">
      <span className="flex shrink-0 items-center gap-1 font-bold uppercase tracking-wide text-amber-300"><Trophy className="h-3.5 w-3.5" /> CONCURSO DX SEMANAL</span>
      <span className="min-w-0 flex-1 truncate font-mono font-bold text-white" title={`${weeklyWinner.callsign} ↔ ${weeklyWinner.station_callsign} · ${weeklyWinner.frequency} MHz · ${weeklyWinner.band} · ${weeklyWinner.mode}`}>{flagForCallsign(weeklyWinner.callsign, weeklyWinner.country, isElevenMeterSpot(weeklyWinner.band, weeklyWinner.frequency))} {weeklyWinner.callsign} ↔ {weeklyWinner.station_callsign} · {weeklyWinner.frequency} MHz</span>
      <span className="shrink-0 font-bold text-cyan-200">{distanceForSpot(weeklyWinner.callsign, gridLocators[weeklyWinner.callsign], weeklyWinner.country || countryForCallsign(weeklyWinner.callsign, undefined, isElevenMeterSpot(weeklyWinner.band, weeklyWinner.frequency)), weeklyWinner.station_callsign, gridLocators[weeklyWinner.station_callsign], countryForCallsign(weeklyWinner.station_callsign, undefined, isElevenMeterSpot(weeklyWinner.band, weeklyWinner.frequency)), countryUsesMiles(countryForCallsign(adminCallsign, undefined, /^\d/.test(adminCallsign))))}</span>
      <span className="flex shrink-0 items-center gap-1 font-bold text-amber-300"><Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />{weeklyWinner.votes}</span>
    </div>}
    {errorMessage && <p className="px-4 py-3 text-sm text-amber-300">{errorMessage}</p>}
    {adminStatus && <p role="status" className="px-4 py-2 text-sm text-slate-200">{adminStatus}</p>}
    {voteMessage && <p role="status" className="px-4 py-2 text-sm text-cyan-200">{voteMessage}</p>}
    {isAdmin && <div className="border-b border-rose-900 bg-slate-900">
      <button type="button" onClick={() => setAdminPanelOpen(open => !open)} aria-expanded={adminPanelOpen} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left">
        <span className="flex min-w-0 items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-rose-300" /><span className="text-xs font-bold text-rose-200">Administración de spots</span><span className="rounded-full bg-rose-950 px-2 py-0.5 text-[10px] text-rose-200">{spots.length} activos</span></span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-rose-200 transition-transform ${adminPanelOpen ? 'rotate-180' : ''}`} />
      </button>
      {adminPanelOpen && <div className="space-y-3 border-t border-rose-900/70 px-3 py-3">
        <p className="text-xs leading-relaxed text-slate-300">Herramientas exclusivas del administrador. Podés borrar un spot individual con la papelera que aparece junto a cada registro, o limpiar todos los spots compartidos. Los QSO guardados, votos, ganadores publicados, eQSL y mensajes del chat no se borran con estas acciones.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setLoading(true); void loadSpots(); }} disabled={loading || deletingAll || Boolean(deletingKey)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-700 bg-slate-800 px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Actualizar lista</button>
          <button type="button" disabled={spots.length === 0 || deletingAll || Boolean(deletingKey)} onClick={() => void deleteAllSpots()} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{deletingAll ? 'Borrando todos…' : 'Borrar todos los spots'}</button>
        </div>
        {weeklyWinner && <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-xs text-amber-100"><p className="font-bold"><Trophy className="mr-1 inline h-4 w-4" />Último ganador DX publicado</p><p className="mt-1">{weeklyWinner.callsign} ↔ {weeklyWinner.station_callsign} · {weeklyWinner.votes} voto(s)</p><p className="mt-1 text-amber-200/80">El cierre semanal conserva el ganador publicado y limpia únicamente los spots activos.</p></div>}
      </div>}
    </div>}
    {loading && <p className="px-4 py-3 text-sm text-slate-500">Cargando spots…</p>}
    {!loading && !errorMessage && spots.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Todavía no hay spots compartidos. Al registrar un QSO aparecerá aquí.</p>}
    {spots.length > 0 && <div className="max-h-[30rem] overflow-y-auto overscroll-contain divide-y divide-slate-800">{spots.map(spot => <article key={spot.spot_key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5">
      <div className="min-w-[3.5rem] text-center"><div className="inline-flex min-h-8 min-w-[3.5rem] items-center justify-center rounded-md border border-cyan-500/60 bg-slate-900 px-1.5 py-1 text-sm font-extrabold leading-none text-cyan-200 shadow-sm">{distanceForSpot(spot.callsign, gridLocators[spot.callsign], spot.country || countryForCallsign(spot.callsign, undefined, isElevenMeterSpot(spot.band, spot.frequency)), spot.station_callsign, gridLocators[spot.station_callsign], countryForCallsign(spot.station_callsign, undefined, isElevenMeterSpot(spot.band, spot.frequency)), countryUsesMiles(countryForCallsign(adminCallsign, undefined, /^\d/.test(adminCallsign))))}</div></div>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 font-mono text-xs font-bold text-slate-100"><button type="button" onClick={() => openPrivateMessage(spot.callsign)} className="rounded underline decoration-dotted underline-offset-2 hover:text-cyan-300" title={`Escribir mensaje privado a ${spot.callsign}`}>{flagForCallsign(spot.callsign, isElevenMeterSpot(spot.band, spot.frequency) ? undefined : spot.country, isElevenMeterSpot(spot.band, spot.frequency))} {spot.callsign}</button><span className="text-slate-500">↔</span><button type="button" onClick={() => openPrivateMessage(spot.station_callsign)} className="rounded underline decoration-dotted underline-offset-2 hover:text-cyan-300" title={`Escribir mensaje privado a ${spot.station_callsign}`}>{flagForCallsign(spot.station_callsign, undefined, isElevenMeterSpot(spot.band, spot.frequency))} {spot.station_callsign}</button></div><div className="flex flex-wrap gap-x-2 gap-y-0 text-[10px] leading-4 text-slate-300"><span className="inline-flex items-center gap-1"><Signal className="h-3 w-3" /> {spot.frequency} MHz · {spot.band}</span><span>{spot.mode}</span></div></div>
      <div className="flex items-center gap-1 text-right text-[10px] text-slate-300"><div><div className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{spot.qso_time} UTC</div><div className="leading-3">{spot.qso_date}</div></div><button type="button" aria-label={votedSpotKeys.has(spot.spot_key) ? 'Spot votado' : 'Votar por este spot'} disabled={!adminCallsign || !identityToken || votedSpotKeys.has(spot.spot_key) || votingKey === spot.spot_key || Boolean(votingKey)} onClick={() => void voteForSpot(spot)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:cursor-default" style={{ color: votedSpotKeys.has(spot.spot_key) ? '#ff3040' : '#ffffff' }}><Heart className={`h-4 w-4 ${votedSpotKeys.has(spot.spot_key) ? 'fill-current' : ''}`} strokeWidth={2.2} /></button>{isAdmin && <button type="button" aria-label={`Borrar spot ${spot.callsign}`} title="Borrar este spot" disabled={Boolean(deletingKey) || deletingAll} onClick={() => void deleteSpot(spot)} className="rounded-md p-1.5 text-rose-700 hover:bg-rose-950 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
    </article>)}</div>}
    <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2"><span className="text-[10px] text-slate-500">Solo contactos guardados; hora UTC registrada.</span><button type="button" onClick={() => { setLoading(true); void loadSpots(); }} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-800"><RefreshCw className="h-3.5 w-3.5" /> Actualizar</button></div>
  </section>;
};
