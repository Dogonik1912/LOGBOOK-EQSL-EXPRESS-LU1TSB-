import React, { useEffect, useState } from 'react';
import { Radio, Clock3, Signal, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { QSO } from '../types';
import { supabase } from '../services/supabaseClient';
import { getUserCallsign } from '../services/qrzService';

type Spot = {
  spot_key: string; callsign: string; station_callsign: string; qso_date: string;
  qso_time: string; band: string; frequency: string; mode: string; country: string | null;
  created_at: string;
};

const prefixCountry = (call: string, savedCountry?: string) => {
  if (savedCountry?.trim()) return savedCountry.trim();
  const c = call.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const map: Record<string, string> = {
    LU:'Argentina',LW:'Argentina',AY:'Argentina',AZ:'Argentina',EA:'España',EB:'España',EC:'España',
    PY:'Brasil',PP:'Brasil',PR:'Brasil',PU:'Brasil',PT:'Brasil',CX:'Uruguay',CE:'Chile',CA:'Chile',
    CB:'Chile',OA:'Perú',CP:'Bolivia',ZP:'Paraguay',HK:'Colombia',YV:'Venezuela',HC:'Ecuador',
    XE:'México',XE1:'México',W:'Estados Unidos',K:'Estados Unidos',N:'Estados Unidos',VE:'Canadá',
    VA:'Canadá',G:'Reino Unido',M:'Reino Unido',F:'Francia',DL:'Alemania',I:'Italia',JA:'Japón',
    VK:'Australia',ZL:'Nueva Zelanda',CE0:'Chile',9A:'Croacia',CT:'Portugal',ON:'Bélgica',
    OE:'Austria',HB:'Suiza',SM:'Suecia',SP:'Polonia',YO:'Rumania',UR:'Ucrania',UA:'Rusia'
  };
  return map[c.slice(0,2)] || map[c.slice(0,1)] || '';
};

const flagFor = (country: string) => {
  const flags: Record<string,string> = {
    'Argentina':'🇦🇷','España':'🇪🇸','Brasil':'🇧🇷','Uruguay':'🇺🇾','Chile':'🇨🇱','Perú':'🇵🇪',
    'Bolivia':'🇧🇴','Paraguay':'🇵🇾','Colombia':'🇨🇴','Venezuela':'🇻🇪','Ecuador':'🇪🇨',
    'México':'🇲🇽','Estados Unidos':'🇺🇸','Canadá':'🇨🇦','Reino Unido':'🇬🇧','Francia':'🇫🇷',
    'Alemania':'🇩🇪','Italia':'🇮🇹','Japón':'🇯🇵','Australia':'🇦🇺','Nueva Zelanda':'🇳🇿',
    'Croacia':'🇭🇷','Portugal':'🇵🇹','Bélgica':'🇧🇪','Austria':'🇦🇹','Suiza':'🇨🇭','Suecia':'🇸🇪',
    'Polonia':'🇵🇱','Rumania':'🇷🇴','Ucrania':'🇺🇦','Rusia':'🇷🇺','Surinam':'🇸🇷','Guatemala':'🇬🇹',
    'Costa Rica':'🇨🇷','Panamá':'🇵🇦','Honduras':'🇭🇳','El Salvador':'🇸🇻','Nicaragua':'🇳🇮'
  };
  return flags[country] || '🏳️';
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
    country: prefixCountry(remoteCall, qso.country),
  }, { onConflict: 'spot_key', ignoreDuplicates: true });
  if (error) console.warn('No se pudo publicar el spot en vivo:', error.message);
}

export const LiveSpots: React.FC = () => {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSpots = async () => {
    if (!supabase) { setErrorMessage('La conexión compartida no está configurada.'); setLoading(false); return; }
    const { data, error } = await supabase.from('live_qso_spots').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) { setErrorMessage('Falta configurar la tabla compartida de spots en Supabase.'); setLoading(false); return; }
    setSpots((data || []) as Spot[]);
    setErrorMessage('');
    setLoading(false);
  };

  useEffect(() => {
    void loadSpots();
    if (!supabase) return;
    const channel = supabase.channel('live-qso-spots-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_qso_spots' }, () => { void loadSpots(); })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  return <section className="mb-5 overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-md">
    <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
      <div className="flex items-center gap-2"><Radio className="h-5 w-5 text-cyan-300" /><div><h2 className="font-bold">Spot en vivo</h2><p className="text-[11px] text-slate-300">QSOs registrados en LogBook · no requiere envío de eQSL</p></div></div>
      <div className="flex items-center gap-1 text-[10px]">{connected ? <><Wifi className="h-4 w-4 text-emerald-300" /> En vivo</> : <><WifiOff className="h-4 w-4 text-amber-300" /> Conectando</>}</div>
    </div>
    {errorMessage && <p className="px-4 py-3 text-sm text-amber-800">{errorMessage}</p>}
    {loading && <p className="px-4 py-3 text-sm text-slate-500">Cargando spots…</p>}
    {!loading && !errorMessage && spots.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Todavía no hay spots compartidos. Al registrar un QSO aparecerá aquí.</p>}
    {spots.length > 0 && <div className="divide-y divide-slate-100">{spots.map(spot => <article key={spot.spot_key} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm font-bold text-slate-900"><span>{flagFor(prefixCountry(spot.callsign, spot.country))} {spot.callsign}</span><span className="text-slate-400">↔</span><span>{flagFor(prefixCountry(spot.station_callsign))} {spot.station_callsign}</span></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><Signal className="h-3.5 w-3.5" /> {spot.frequency} MHz · {spot.band}</span><span>{spot.mode}</span></div></div>
      <div className="text-right text-xs text-slate-600"><div className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{spot.qso_time} UTC</div><div className="mt-1">{spot.qso_date}</div></div>
    </article>)}</div>}
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2"><span className="text-[10px] text-slate-400">Solo contactos guardados; hora UTC registrada.</span><button type="button" onClick={() => { setLoading(true); void loadSpots(); }} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-800"><RefreshCw className="h-3.5 w-3.5" /> Actualizar</button></div>
  </section>;
};
