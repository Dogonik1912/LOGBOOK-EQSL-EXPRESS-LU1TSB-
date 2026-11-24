import React, { useEffect, useRef, useState } from 'react';
import { Radio, Clock3, Signal, RefreshCw, Wifi, WifiOff, Trash2, Heart, Trophy, ChevronDown, ShieldCheck, X, Share2 } from 'lucide-react';
import { QSO, HAM_BANDS, HAM_MODES } from '../types';
import { supabase } from '../services/supabaseClient';
import { getUserCallsign } from '../services/qrzService';
import { countryForCallsign, flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { capitalPointForCountry, countryUsesMiles, distanceForSpot, maidenheadToPoint } from '../services/dxDistance';
import { DistanceShareModal } from './DistanceShareModal';

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
  llota_reference?: string | null; llota_reference_name?: string | null;
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
  // Clave simétrica: el mismo QSO se reconoce aunque lo publique cualquiera de las dos estaciones.
  // Banda, frecuencia y modo permanecen en la clave para no mezclar servicios/contactos distintos.
  const [firstCall, secondCall] = [ownCall, remoteCall].sort((a, b) => a.localeCompare(b));
  const frequencyNumber = Number(String(qso.frequency).trim().replace(',', '.'));
  if (!Number.isFinite(frequencyNumber) || frequencyNumber <= 0) return;
  const normalizedFrequency = frequencyNumber.toFixed(3);
  const spotKey = [firstCall, secondCall, qso.date, qso.time, String(qso.band).trim().toLowerCase(), normalizedFrequency, String(qso.mode || '').trim().toUpperCase()].join('|');
  const { error } = await supabase.from('live_qso_spots').upsert({
    spot_key: spotKey,
    callsign: remoteCall,
    station_callsign: ownCall,
    qso_date: qso.date,
    qso_time: qso.time,
    band: qso.band,
    frequency: normalizedFrequency,
    mode: qso.mode || '',
    country: countryForCallsign(remoteCall, qso.country, isElevenMeterSpot(String(qso.band || ''), String(qso.frequency || ''))),
    ...(qso.llotaReference ? { llota_reference: qso.llotaReference, llota_reference_name: qso.llotaReferenceName || null } : {}),
  }, { onConflict: 'spot_key', ignoreDuplicates: true });
  if (error) console.warn('No se pudo publicar el spot en vivo:', error.message);
}

const continentForSpot = (spot: Spot): string => {
 const country=String(spot.country || countryForCallsign(spot.callsign, undefined, isElevenMeterSpot(spot.band,spot.frequency))).toLowerCase();
 if(/argentina|brasil|uruguay|chile|peru|bolivia|paraguay|colombia|venezuela|ecuador|mexico|canada|estados unidos|cuba|panama|costa rica|guatemala|honduras|nicaragua|jamaica|bahamas|surinam|malvinas/.test(country)) return 'América';
 if(/españa|portugal|italia|francia|alemania|reino unido|polonia|rusia|ucrania|belgica|paises bajos|noruega|suecia|dinamarca|finlandia|grecia|rumania|hungria|suiza|austria|irlanda|croacia|eslovenia|eslovaquia|lituania|letonia|estonia|islandia|bulgaria/.test(country)) return 'Europa';
 if(/japon|china|corea|india|tailandia|indonesia|filipinas|singapur|malasia|taiwan|pakistan|bangladesh|nepal|mongolia|vietnam|hong kong|israel|jordania/.test(country)) return 'Asia';
 if(/australia|nueva zelanda|fiyi|samoa|guam|tonga|vanuatu|kiribati|nauru|tuvalu|caledonia|tahiti/.test(country)) return 'Oceanía';
 if(/sudafrica|marruecos|egipto|tunez|kenia|nigeria|ghana|senegal|madagascar|liberia|gambia/.test(country)) return 'África';
 if(/antartida|antártida|antarctica|south pole|polo sur/.test(country)) return 'Antártida';
 return 'Otros';
}

type SpotMapProps = { spot: Spot; firstGrid?: string; secondGrid?: string; onClose: () => void };
const loadLeaflet = (): Promise<any> => new Promise((resolve, reject) => {
  const w = window as any;
  if (w.L) { resolve(w.L); return; }
  if (!document.querySelector('link[data-live-spot-leaflet]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; link.dataset.liveSpotLeaflet = 'true'; document.head.appendChild(link);
  }
  const existing = document.querySelector('script[data-live-spot-leaflet]') as HTMLScriptElement | null;
  if (existing) {
    existing.addEventListener('load', () => resolve((window as any).L), { once: true });
    existing.addEventListener('error', () => reject(new Error('No se pudo cargar el mapa')), { once: true });
    if (w.L) resolve(w.L); return;
  }
  const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.async = true; script.dataset.liveSpotLeaflet = 'true';
  script.onload = () => w.L ? resolve(w.L) : reject(new Error('Leaflet no disponible'));
  script.onerror = () => reject(new Error('No se pudo cargar el mapa')); document.head.appendChild(script);
});
const SpotDistanceMap: React.FC<SpotMapProps> = ({ spot, firstGrid, secondGrid, onClose }) => {
  const mapElement = useRef<HTMLDivElement>(null);
  const shareCaptureRef = useRef<HTMLElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [mapError, setMapError] = useState('');
  const [points, setPoints] = useState<{ first: {lat:number;lon:number}; second: {lat:number;lon:number}; firstSource:string; secondSource:string } | null>(null);
  const is11m = isElevenMeterSpot(spot.band, spot.frequency);
  const firstCountry = countryForCallsign(spot.callsign, spot.country || undefined, is11m);
  const secondCountry = countryForCallsign(spot.station_callsign, undefined, is11m);
  // El grid local solo se aplica a la estación propia del usuario que está viendo el spot.
  // Esto cubre las dos identidades del administrador (LU1TSB y 4RC978) sin asignar
  // accidentalmente la ubicación del visitante a la estación remota.
  const ownIdentifiers = new Set([
    localStorage.getItem('community_chat_active_callsign'),
    localStorage.getItem('community_chat_sd'),
    localStorage.getItem('cb_station_callsign'),
    getUserCallsign(),
  ].map(value => String(value || '').trim().toUpperCase()).filter(Boolean));
  const savedOwnGrid = String(localStorage.getItem('user_grid_locator') || '').trim().toUpperCase();
  const ownGridIsValid = Boolean(maidenheadToPoint(savedOwnGrid));
  const resolvedFirstGrid = firstGrid || (ownIdentifiers.has(spot.callsign.trim().toUpperCase()) && ownGridIsValid ? savedOwnGrid : undefined);
  const resolvedSecondGrid = secondGrid || (ownIdentifiers.has(spot.station_callsign.trim().toUpperCase()) && ownGridIsValid ? savedOwnGrid : undefined);
  useEffect(() => {
    let cancelled = false;
    const resolvePoint = async (grid: string | undefined, country: string, callsign: string) => {
      const gridPoint = maidenheadToPoint(grid || '');
      if (gridPoint) return { point: gridPoint, source: 'Grid Locator ' + String(grid).toUpperCase() };
      if (!country) throw new Error('No se pudo identificar el país de ' + callsign + ' para usar su capital.');
      const knownCapital = capitalPointForCountry(country);
      if (!knownCapital) throw new Error('No hay una coordenada de capital configurada para ' + country + '.');
      return { point: knownCapital, source: 'Capital de ' + country };
    };
    setPoints(null);
    setMapError('');
    void Promise.all([
      resolvePoint(resolvedFirstGrid, firstCountry, spot.callsign),
      resolvePoint(resolvedSecondGrid, secondCountry, spot.station_callsign),
    ]).then(([a,b]) => { if (!cancelled) setPoints({ first:a.point, second:b.point, firstSource:a.source, secondSource:b.source }); })
      .catch(error => { if (!cancelled) setMapError(error instanceof Error ? error.message : 'No se pudieron resolver las ubicaciones.'); });
    return () => { cancelled = true; };
  }, [spot.callsign, spot.station_callsign, spot.band, spot.frequency, resolvedFirstGrid, resolvedSecondGrid, firstCountry, secondCountry]);
  const km = points ? (() => {
    const rad = (v: number) => v * Math.PI / 180;
    const dLat = rad(points.second.lat-points.first.lat), dLon = rad(points.second.lon-points.first.lon);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(points.first.lat))*Math.cos(rad(points.second.lat))*Math.sin(dLon/2)**2;
    return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  })() : null;
  const usesCapitalEstimate = Boolean(points && (points.firstSource.startsWith('Capital de ') || points.secondSource.startsWith('Capital de ')));
  // Al abrir la distancia desde Live Spot, mostrar directamente las opciones de envío.
  useEffect(() => { if (points && km !== null) setShareOpen(true); }, [points, km]);
  const currentCallsign = String(localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
  const privateRecipient = currentCallsign === spot.callsign ? spot.station_callsign : spot.callsign;
  useEffect(() => {
    if (!points || !mapElement.current) return;
    let map: any, cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !mapElement.current) return;
      map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, touchZoom: true, doubleClickZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      const a: [number,number] = [points.first.lat,points.first.lon], b: [number,number] = [points.second.lat,points.second.lon];
      L.marker(a).addTo(map).bindPopup('Estación '+spot.callsign+' · '+points.firstSource).bindTooltip(spot.callsign+' · '+points.firstSource, { permanent:true, direction:'top', offset:[0,-10], opacity:0.95 });
      L.marker(b).addTo(map).bindPopup('Estación '+spot.station_callsign+' · '+points.secondSource).bindTooltip(spot.station_callsign+' · '+points.secondSource, { permanent:true, direction:'top', offset:[0,-10], opacity:0.95 });
      L.polyline([a,b], { color:'#06b6d4', weight:4, opacity:0.9 }).addTo(map);
      map.fitBounds(L.latLngBounds([a,b]), { padding:[55,55], maxZoom:12 });
      window.setTimeout(() => { if (!cancelled && map) map.invalidateSize(); }, 100);
    }).catch(error => setMapError(error instanceof Error ? error.message : 'No se pudo cargar el mapa.'));
    return () => { cancelled = true; if (map) map.remove(); };
  }, [points, spot.callsign, spot.station_callsign]);
  return <><div className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Mapa de distancia del QSO" onMouseDown={event => { if (event.target === event.currentTarget && !shareOpen) onClose(); }}>
    <section ref={shareCaptureRef} className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cyan-500/50 bg-slate-900 text-white shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3"><div className="min-w-0"><h3 className="font-bold">Distancia del QSO</h3><p className="text-xs text-slate-300">{spot.callsign} ({firstGrid || firstCountry || 'Capital pendiente'}) ↔ {spot.station_callsign} ({secondGrid || secondCountry || 'Capital pendiente'})</p>{spot.llota_reference && <p className="mt-1 text-xs font-bold text-cyan-200">🌊 LLOTA · REFERENCIA: {spot.llota_reference}{spot.llota_reference_name ? ' — ' + spot.llota_reference_name : ''}</p>}</div><button type="button" data-share-ignore onClick={onClose} className="rounded-lg p-2 hover:bg-slate-800" aria-label="Cerrar mapa"><X className="h-5 w-5" /></button></header>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-700 px-4 py-3 text-sm"><span><strong>{km === null ? 'Calculando…' : km.toLocaleString('es-ES',{maximumFractionDigits:1})+' km'}</strong></span><span><strong>{km === null ? '—' : (km/1.609344).toLocaleString('es-ES',{maximumFractionDigits:1})+' mi'}</strong></span></div>
      {points ? <><div ref={mapElement} className="h-[55dvh] min-h-[300px] w-full bg-slate-800" /><div className="grid grid-cols-1 gap-2 border-t border-slate-700 bg-slate-950 px-4 py-3 text-xs sm:grid-cols-2"><div className="rounded-lg border border-slate-700 p-2"><strong className="block text-cyan-200">{spot.callsign}</strong><span className="text-slate-300">{points.firstSource}</span><span className="mt-1 block font-mono text-[10px] text-slate-500">{points.first.lat.toFixed(4)}, {points.first.lon.toFixed(4)}</span></div><div className="rounded-lg border border-slate-700 p-2"><strong className="block text-cyan-200">{spot.station_callsign}</strong><span className="text-slate-300">{points.secondSource}</span><span className="mt-1 block font-mono text-[10px] text-slate-500">{points.second.lat.toFixed(4)}, {points.second.lon.toFixed(4)}</span></div></div><p className="px-4 py-2 text-[11px] text-slate-400">Las etiquetas de ambas estaciones permanecen visibles al ampliar el mapa. Tocá cada marcador para ver sus detalles. Línea recta entre ambos puntos.</p>{usesCapitalEstimate && <p className="mx-4 mb-3 rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-xs font-bold text-amber-200">DISTANCIA APROXIMADA: se utilizó la capital del país donde falta el Grid Locator. La ubicación real puede variar.</p>}</> : <div className="p-6 text-sm text-amber-200">{mapError || 'Buscando el Grid Locator o, si falta, la capital de cada país…'}</div>}
      <footer data-share-ignore className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-4 py-3">
        <div className="min-w-0 flex-1">{usesCapitalEstimate && <p className="text-[11px] text-amber-300">Se compartirá una distancia aproximada usando la capital para la estación sin Grid Locator. Para mayor precisión, registrá el locator en Ajustes.</p>}</div>
        <div className="flex gap-2"><button type="button" disabled={!points || km === null} onClick={() => setShareOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"><Share2 className="h-4 w-4" />Compartir distancia</button><button type="button" onClick={onClose} className="rounded-lg bg-slate-700 px-5 py-2.5 text-sm font-bold">Cerrar</button></div>
      </footer>
    </section>
  </div>
  {shareOpen && points && km !== null && <DistanceShareModal onClose={() => setShareOpen(false)} captureElement={() => shareCaptureRef.current} firstCallsign={spot.callsign} secondCallsign={spot.station_callsign} distanceKm={km} llotaReference={spot.llota_reference || undefined} llotaReferenceName={spot.llota_reference_name || undefined} privateRecipients={[privateRecipient]} defaultPrivateRecipient={privateRecipient} />}
  </>;
};

export const LiveSpots: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedBands, setSelectedBands] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('live_spot_filter_bands') || '[]'); } catch { return []; } });
  const [selectedModes, setSelectedModes] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('live_spot_filter_modes') || '[]'); } catch { return []; } });
  const [selectedContinents, setSelectedContinents] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('live_spot_filter_continents') || '[]'); } catch { return []; } });
  const [showAllActivity, setShowAllActivity] = useState(() => localStorage.getItem('live_spot_show_all') !== 'false');
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
  const [mapSpot, setMapSpot] = useState<Spot | null>(null);

  // Las bandas del filtro Live Spot son exactamente las del Libro de Guardia.
  const bandOptions=HAM_BANDS.map(item=>item.name);
  // Los modos del filtro Live Spot son exactamente los disponibles en Libro de Guardia.
  const modeOptions=HAM_MODES;
  const continentOptions=['África','América','Asia','Europa','Oceanía','Antártida','Otros'];
  const normalizeFilterValue=(value:string)=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ');
  const allSpots = [...spots].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  const filteredSpots=showAllActivity ? allSpots : allSpots.filter(spot=>
    (!selectedBands.length||selectedBands.some(value=>normalizeFilterValue(value)===normalizeFilterValue(spot.band))) &&
    (!selectedModes.length||selectedModes.some(value=>normalizeFilterValue(value)===normalizeFilterValue(spot.mode))) &&
    (!selectedContinents.length||selectedContinents.includes(continentForSpot(spot)))
  );
  useEffect(()=>{localStorage.setItem('live_spot_filter_bands',JSON.stringify(selectedBands));},[selectedBands]);
  useEffect(()=>{localStorage.setItem('live_spot_filter_modes',JSON.stringify(selectedModes));},[selectedModes]);
  useEffect(()=>{localStorage.setItem('live_spot_filter_continents',JSON.stringify(selectedContinents));},[selectedContinents]);
  useEffect(()=>{localStorage.setItem('live_spot_show_all',String(showAllActivity));},[showAllActivity]);
  const toggleFilter=(values:string[],value:string,setter:(next:string[])=>void)=>{setShowAllActivity(false);setter(values.includes(value)?values.filter(item=>item!==value):[...values,value]);};
  const enableShowAll=(checked:boolean)=>{setShowAllActivity(checked);if(checked){setSelectedBands([]);setSelectedModes([]);setSelectedContinents([]);}};
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
    <button type="button" onClick={() => setIsExpanded(open => !open)} aria-expanded={isExpanded} className="flex min-h-[56px] w-full min-w-0 items-center justify-between gap-2 bg-slate-900 px-3 py-2.5 text-left text-white hover:bg-slate-800/80">
      <span className="flex min-w-0 items-center gap-2"><Radio className="h-5 w-5 shrink-0 text-cyan-300" /><span className="whitespace-nowrap text-sm font-bold sm:text-base">Spot en vivo</span><span className="text-[10px] text-slate-400">({showAllActivity ? allSpots.length : filteredSpots.length})</span></span>
      <span className="flex shrink-0 items-center gap-2"><span className="flex items-center gap-1 text-[10px]">{connected ? <><Wifi className="h-4 w-4 text-emerald-300" /> En vivo</> : <><WifiOff className="h-4 w-4 text-amber-300" /> Conectando</>}</span><ChevronDown className={`h-4 w-4 text-cyan-200 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></span>
    </button>
    {isExpanded && <div>
    <div className="border-b border-slate-800 px-3 py-2">
      <button type="button" onClick={()=>setFilterOpen(open=>!open)} aria-expanded={filterOpen} className="text-[11px] font-medium text-cyan-300 underline decoration-dotted underline-offset-2">Filtra los spot que quieres ver</button>
      {!showAllActivity&&<span className="ml-2 text-[10px] text-slate-400">Mostrando {filteredSpots.length} de {allSpots.length}</span>}
      {filterOpen&&<div className="mt-2 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
        <div><p className="mb-1 text-xs font-bold text-white">Bandas</p><div className="flex flex-wrap gap-2">{bandOptions.map(value=><label key={value} className="flex items-center gap-1 text-xs text-slate-200"><input type="checkbox" checked={selectedBands.includes(value)} onChange={()=>toggleFilter(selectedBands,value,setSelectedBands)}/>{value}</label>)}</div></div>
        <div><p className="mb-1 text-xs font-bold text-white">Modos</p><div className="flex flex-wrap gap-2">{modeOptions.map(value=><label key={value} className="flex items-center gap-1 text-xs text-slate-200"><input type="checkbox" checked={selectedModes.includes(value)} onChange={()=>toggleFilter(selectedModes,value,setSelectedModes)}/>{value}</label>)}</div></div>
        <div><p className="mb-1 text-xs font-bold text-white">Continentes</p><div className="flex flex-wrap gap-2">{continentOptions.map(value=><label key={value} className="flex items-center gap-1 text-xs text-slate-200"><input type="checkbox" checked={selectedContinents.includes(value)} onChange={()=>toggleFilter(selectedContinents,value,setSelectedContinents)}/>{value}</label>)}</div></div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-700 pt-3"><label className="flex min-h-8 items-center gap-2 text-sm font-bold text-cyan-200"><input type="checkbox" checked={showAllActivity} onChange={event=>enableShowAll(event.target.checked)} className="h-4 w-4 accent-cyan-400"/>Ver todo</label><button type="button" onClick={()=>setFilterOpen(false)} className="ml-auto rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-white">Cerrar</button></div>
      </div>}
    </div>
    {weeklyWinner && <section aria-label="Spot ganador semanal" className="w-full border-b border-amber-700/60 bg-amber-950/60 px-3 py-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-amber-300"><Trophy className="h-4 w-4 shrink-0" /> SPOT GANADOR DE LA SEMANA</span>
        <span className="inline-flex items-center gap-1 font-bold text-amber-300"><Heart className="h-4 w-4 fill-rose-500 text-rose-500" /> {weeklyWinner.votes} votos</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-base font-extrabold leading-snug text-white">
        <span>{flagForCallsign(weeklyWinner.callsign, weeklyWinner.country, isElevenMeterSpot(weeklyWinner.band, weeklyWinner.frequency))} {weeklyWinner.callsign}</span>
        <span className="text-amber-300">↔</span>
        <span>{flagForCallsign(weeklyWinner.station_callsign, undefined, isElevenMeterSpot(weeklyWinner.band, weeklyWinner.frequency))} {weeklyWinner.station_callsign}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-amber-100">
        <span>Frecuencia: {weeklyWinner.frequency} MHz</span>
        <span>Banda: {weeklyWinner.band}</span>
        <span>Modo: {weeklyWinner.mode}</span>
        <span>Fecha: {weeklyWinner.qso_date}</span>
        <span>Hora: {weeklyWinner.qso_time} UTC</span>
        <span>Distancia: {distanceForSpot(weeklyWinner.callsign, gridLocators[weeklyWinner.callsign], weeklyWinner.country || countryForCallsign(weeklyWinner.callsign, undefined, isElevenMeterSpot(weeklyWinner.band, weeklyWinner.frequency)), weeklyWinner.station_callsign, gridLocators[weeklyWinner.station_callsign], countryForCallsign(weeklyWinner.station_callsign, undefined, isElevenMeterSpot(weeklyWinner.band, weeklyWinner.frequency)), countryUsesMiles(countryForCallsign(adminCallsign, undefined, is11MeterStationIdentifier(adminCallsign))))}</span>
      </div>
    </section>}
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
    {!loading && !errorMessage && allSpots.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Todavía no hay contactos compartidos. Se mostrarán cuando un operador registre un QSO o envíe una eQSL.</p>}
    {!loading && !errorMessage && allSpots.length>0 && filteredSpots.length===0 && <p className="px-4 py-4 text-sm text-slate-400">No hay spots que coincidan con los filtros elegidos. Marca «Ver todo» para mostrar toda la actividad.</p>}
    {filteredSpots.length > 0 && <div className="max-h-[30rem] overflow-y-auto overscroll-contain divide-y divide-slate-800">{filteredSpots.map(spot => <article key={spot.spot_key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5">
      <div className="min-w-[3.5rem] text-center"><button type="button" onClick={() => setMapSpot(spot)} title="Abrir mapa y ver distancia en km y millas" className="inline-flex min-h-8 min-w-[3.5rem] items-center justify-center rounded-md border border-cyan-500/60 bg-slate-900 px-1.5 py-1 text-sm font-extrabold leading-none text-cyan-200 shadow-sm">{distanceForSpot(spot.callsign, gridLocators[spot.callsign], spot.country || countryForCallsign(spot.callsign, undefined, isElevenMeterSpot(spot.band, spot.frequency)), spot.station_callsign, gridLocators[spot.station_callsign], countryForCallsign(spot.station_callsign, undefined, isElevenMeterSpot(spot.band, spot.frequency)), countryUsesMiles(countryForCallsign(adminCallsign, undefined, /^\\d/.test(adminCallsign))))}</button></div>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 font-mono text-xs font-bold text-slate-100"><button type="button" onClick={() => openPrivateMessage(spot.callsign)} className="rounded underline decoration-dotted underline-offset-2 hover:text-cyan-300" title={`Escribir mensaje privado a ${spot.callsign}`}>{flagForCallsign(spot.callsign, isElevenMeterSpot(spot.band, spot.frequency) ? undefined : spot.country, isElevenMeterSpot(spot.band, spot.frequency))} {spot.callsign}</button><span className="text-slate-500">↔</span><button type="button" onClick={() => openPrivateMessage(spot.station_callsign)} className="rounded underline decoration-dotted underline-offset-2 hover:text-cyan-300" title={`Escribir mensaje privado a ${spot.station_callsign}`}>{flagForCallsign(spot.station_callsign, undefined, isElevenMeterSpot(spot.band, spot.frequency))} {spot.station_callsign}</button></div><div className="flex flex-wrap gap-x-2 gap-y-0 text-[10px] leading-4 text-slate-300"><span className="inline-flex items-center gap-1"><Signal className="h-3 w-3" /> {spot.frequency} MHz · {spot.band}</span><span>{spot.mode}</span></div>{spot.llota_reference && <div className="mt-0.5 text-[10px] font-bold leading-4 text-cyan-300">🌊 LLOTA · {spot.llota_reference}{spot.llota_reference_name ? ' — ' + spot.llota_reference_name : ''}</div>}</div>
      <div className="flex items-center gap-1 text-right text-[10px] text-slate-300"><div><div className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{spot.qso_time} UTC</div><div className="leading-3">{spot.qso_date}</div></div><button type="button" aria-label={votedSpotKeys.has(spot.spot_key) ? 'Spot votado' : 'Votar por este spot'} disabled={!adminCallsign || !identityToken || votedSpotKeys.has(spot.spot_key) || votingKey === spot.spot_key || Boolean(votingKey)} onClick={() => void voteForSpot(spot)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:cursor-default" style={{ color: votedSpotKeys.has(spot.spot_key) ? '#ff3040' : '#ffffff' }}><Heart className={`h-4 w-4 ${votedSpotKeys.has(spot.spot_key) ? 'fill-current' : ''}`} strokeWidth={2.2} /></button>{isAdmin && <button type="button" aria-label={`Borrar spot ${spot.callsign}`} title="Borrar este spot" disabled={Boolean(deletingKey) || deletingAll} onClick={() => void deleteSpot(spot)} className="rounded-md p-1.5 text-rose-700 hover:bg-rose-950 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
    </article>)}</div>}
    <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2"><span className="text-[10px] text-slate-500">Contactos registrados por operadores · hora UTC.</span><button type="button" onClick={() => { setLoading(true); void loadSpots(); }} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200"><RefreshCw className="h-3.5 w-3.5" /> Actualizar</button></div>
    <div className="flex justify-end border-t border-slate-800 px-3 py-3"><button type="button" onClick={() => setIsExpanded(false)} className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Cerrar</button></div>
    </div>}
    {mapSpot && <SpotDistanceMap spot={mapSpot} firstGrid={gridLocators[mapSpot.callsign]} secondGrid={gridLocators[mapSpot.station_callsign]} onClose={() => setMapSpot(null)} />}
  </section>;
};
