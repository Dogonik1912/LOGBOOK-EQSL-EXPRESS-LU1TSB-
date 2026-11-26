import React, { useEffect, useState } from 'react';
import { MapPin, MessageCircle, X, Map as MapIcon, Share2 } from 'lucide-react';
import { DistanceShareModal } from './DistanceShareModal';
import { supabase } from '../services/supabaseClient';
import { countryForCallsign, flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { isValidMaidenheadLocator, maidenheadToPoint } from '../services/dxDistance';

type PublicProfile = { callsign: string; photo: string; qraOperator: string; grid: string; location: string; elevation: number | null; loading: boolean };
type ProfileIdentity = { callsign: string; identity_type: 'ham' | '11m' };
type ProfileContact = { stationType: 'ham' | '11m'; remoteCallsign: string; country: string; division: string; band: string };
type ProfileGalleryItem = { senderCallsign: string; stationType: 'ham' | '11m'; receivedAt: string; card: { from?: string; to?: string; date?: string; band?: string; mode?: string; frequency?: string; imageDataUrl?: string } };
type PublicProfileOverview = { identities: ProfileIdentity[]; contacts: ProfileContact[]; gallery: ProfileGalleryItem[] };

type GridPoint = { latitude: number; longitude: number };
const localityCache = new Map<string, string>();

function maidenheadCenter(locator: string): GridPoint | null {
  const value = String(locator || '').trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(value)) return null;
  let lon = -180, lat = -90, lonSize = 20, latSize = 10;
  lon += (value.charCodeAt(0) - 65) * lonSize; lat += (value.charCodeAt(1) - 65) * latSize;
  lonSize /= 10; latSize /= 10;
  lon += Number(value[2]) * lonSize; lat += Number(value[3]) * latSize;
  if (value.length >= 6) { lonSize /= 24; latSize /= 24; lon += (value.charCodeAt(4) - 65) * lonSize; lat += (value.charCodeAt(5) - 65) * latSize; }
  if (value.length >= 8) { lonSize /= 10; latSize /= 10; lon += Number(value[6]) * lonSize; lat += Number(value[7]) * latSize; }
  if (value.length >= 10) { lonSize /= 24; latSize /= 24; lon += (value.charCodeAt(8) - 65) * lonSize; lat += (value.charCodeAt(9) - 65) * latSize; }
  return { latitude: lat + latSize / 2, longitude: lon + lonSize / 2 };
}

async function localityForGrid(locator: string, point: GridPoint): Promise<string> {
  const key = locator.toUpperCase();
  if (localityCache.has(key)) return localityCache.get(key) || '';

  const clean = (value: unknown) => String(value || '').trim();
  const format = (place: string, region: string, country: string) =>
    [place, region && region !== place ? region : '', country].filter(Boolean).join(', ');

  // Primero Photon: ofrece localidades cercanas y funciona bien en la mayoría de países.
  const radii = key.length <= 4 ? [30000, 50000] : key.length <= 6 ? [4000, 10000, 20000] : key.length <= 8 ? [500, 2000, 5000] : [100, 500, 1500];
  const settlementTypes = new Set(['city', 'town', 'village', 'hamlet', 'isolated_dwelling', 'suburb', 'neighbourhood']);
  for (const radius of radii) {
    try {
      const params = new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude), radius: String(radius), lang: 'es', limit: '8' });
      const response = await fetch('https://photon.komoot.io/reverse?' + params.toString());
      if (!response.ok) continue;
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      const ranked = [...features].sort((a: any, b: any) => {
        const aType = clean(a?.properties?.osm_value || a?.properties?.type).toLowerCase();
        const bType = clean(b?.properties?.osm_value || b?.properties?.type).toLowerCase();
        return Number(settlementTypes.has(bType)) - Number(settlementTypes.has(aType));
      });
      const properties = ranked.find((feature: any) => {
        const p = feature?.properties || {};
        return Boolean(p.locality || p.city || p.name || p.district || p.suburb || p.county);
      })?.properties || {};
      const place = clean(properties.locality || properties.city || properties.name || properties.district || properties.suburb || properties.county);
      const result = format(place, clean(properties.state || properties.county), clean(properties.country));
      if (result) {
        localityCache.set(key, result);
        return result;
      }
    } catch {
      // Si Photon falla o no conoce la zona, se consulta el proveedor alternativo.
    }
  }

  // Alternativa: Nominatim/OSM devuelve la jerarquía administrativa del punto.
  // Es especialmente útil en áreas urbanas donde Photon no devuelve resultados.
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(point.latitude),
      lon: String(point.longitude),
      zoom: '10',
      addressdetails: '1',
      'accept-language': 'es',
    });
    const response = await fetch('https://nominatim.openstreetmap.org/reverse?' + params.toString());
    if (response.ok) {
      const data = await response.json();
      const address = data?.address || {};
      const place = clean(
        address.city || address.town || address.village || address.municipality ||
        address.city_district || address.suburb || address.hamlet || address.county
      );
      const region = clean(address.state || address.province || address.region);
      const country = clean(address.country);
      const result = format(place, region, country);
      if (result) {
        localityCache.set(key, result);
        return result;
      }
    }
  } catch {
    // El perfil sigue disponible aunque los servicios externos no respondan.
  }
  return '';
}

export const openUserProfile = (rawCallsign: string) => {
  const callsign = String(rawCallsign || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (callsign.length >= 3) window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign } }));
};


type GridStation = { callsign: string; grid_locator: string };
type GridStationPoint = GridStation & { lat: number; lon: number };

const loadProfileLeaflet = (): Promise<any> => new Promise((resolve, reject) => {
  const w = window as any;
  if (w.L) { resolve(w.L); return; }
  if (!document.querySelector('link[data-profile-leaflet]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.dataset.profileLeaflet = 'true';
    document.head.appendChild(link);
  }
  const existing = document.querySelector('script[data-profile-leaflet]') as HTMLScriptElement | null;
  if (existing) {
    existing.addEventListener('load', () => resolve((window as any).L), { once: true });
    existing.addEventListener('error', () => reject(new Error('No se pudo cargar el mapa.')), { once: true });
    if (w.L) resolve(w.L);
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.async = true;
  script.dataset.profileLeaflet = 'true';
  script.onload = () => w.L ? resolve(w.L) : reject(new Error('Leaflet no está disponible.'));
  script.onerror = () => reject(new Error('No se pudo cargar el mapa.'));
  document.head.appendChild(script);
});

const distanceKmBetween = (a: {lat:number;lon:number}, b: {lat:number;lon:number}) => {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const GridStationsMap: React.FC<{ callsign: string; grid: string; onClose: () => void; autoOpenShare?: boolean; onAutoShareConsumed?: () => void }> = ({ callsign, grid, onClose, autoOpenShare = false, onAutoShareConsumed }) => {
  const mapElement = React.useRef<HTMLDivElement>(null);
  const shareCaptureRef = React.useRef<HTMLElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [stations, setStations] = useState<GridStationPoint[]>([]);
  const [viewerDistanceKm, setViewerDistanceKm] = useState<number | null>(null);
  const [viewerCallsign, setViewerCallsign] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const origin = maidenheadToPoint(grid);
  const viewerDistanceMi = viewerDistanceKm === null ? null : viewerDistanceKm / 1.609344;

  useEffect(() => {
    let active = true;
    const loadStations = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('community_chat_identity_token') || '';
        if (!token) throw new Error('Tenés que validar tu indicativo para consultar las estaciones del mapa.');
        const response = await fetch('/api/directory?action=grid-map', { headers: { 'x-identity-token': token }, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el mapa de estaciones.');
        const byCall = new Map<string, GridStation>();
        for (const item of Array.isArray(payload?.stations) ? payload.stations : []) {
          const stationCall = String(item?.callsign || '').trim().toUpperCase();
          const stationGrid = String(item?.grid_locator || '').trim().toUpperCase();
          if (stationCall && isValidMaidenheadLocator(stationGrid)) byCall.set(stationCall, { callsign: stationCall, grid_locator: stationGrid });
        }
        byCall.set(callsign, { callsign, grid_locator: grid.toUpperCase() });
        if (!origin) throw new Error('El Grid Locator del perfil no es válido.');
        const activeCall = String(localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
        const localViewerGrid = String(localStorage.getItem('user_grid_locator') || '').trim().toUpperCase();
        if (activeCall && isValidMaidenheadLocator(localViewerGrid)) byCall.set(activeCall, { callsign: activeCall, grid_locator: localViewerGrid });
        const viewer = activeCall ? byCall.get(activeCall) : undefined;
        const viewerPoint = viewer ? maidenheadToPoint(viewer.grid_locator) : null;
        const mapped: GridStationPoint[] = [];
        for (const item of byCall.values()) {
          const point = maidenheadToPoint(item.grid_locator);
          if (!point) continue;
          mapped.push({ ...item, lat: point.lat, lon: point.lon });
        }
        if (active) {
          setViewerCallsign(activeCall);
          setViewerDistanceKm(viewerPoint && activeCall !== callsign ? distanceKmBetween(origin, viewerPoint) : null);
          setStations(mapped);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las estaciones.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadStations();
    return () => { active = false; };
  }, [callsign, grid]);

  useEffect(() => {
    if (!stations.length || !mapElement.current) return;
    setMapReady(false);
    let map: any;
    let cancelled = false;
    void loadProfileLeaflet().then((L) => {
      if (cancelled || !mapElement.current) return;
      map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, touchZoom: true, doubleClickZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      const bounds: Array<[number, number]> = [];
      const reference = stations.find((item) => item.callsign === callsign);
      const viewer = viewerCallsign ? stations.find((item) => item.callsign === viewerCallsign) : undefined;
      if (reference) {
        const originCoords: [number, number] = [reference.lat, reference.lon];
        bounds.push(originCoords);
        L.marker(originCoords).addTo(map).bindPopup('<strong>Perfil consultado: ' + reference.callsign + '</strong><br>Grid: ' + reference.grid_locator)
          .on('click', () => openUserProfile(reference.callsign));
      }
      if (viewer && viewer.callsign !== callsign) {
        const viewerCoords: [number, number] = [viewer.lat, viewer.lon];
        bounds.push(viewerCoords);
        L.marker(viewerCoords).addTo(map).bindPopup('<strong>Tu estación: ' + viewer.callsign + '</strong><br>Grid: ' + viewer.grid_locator)
          .on('click', () => openUserProfile(viewer.callsign));
        if (reference) L.polyline([[reference.lat, reference.lon], viewerCoords], { color: '#06b6d4', weight: 4, opacity: 0.9 }).addTo(map);
      }
      for (const station of stations) {
        if (station.callsign === callsign || station.callsign === viewerCallsign) continue;
        const coords: [number, number] = [station.lat, station.lon];
        bounds.push(coords);
        L.marker(coords).addTo(map).bindPopup('<strong>' + station.callsign + '</strong><br>Grid: ' + station.grid_locator + '<br><button type="button" class="profile-map-open" data-callsign="' + station.callsign + '">Ver perfil</button>')
          .on('click', () => openUserProfile(station.callsign));
      }
      if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35], maxZoom: 8 });
      else if (reference) map.setView([reference.lat, reference.lon], 7);
      window.setTimeout(() => { if (!cancelled && map) { map.invalidateSize(); setMapReady(true); } }, 180);
    }).catch((reason) => { if (!cancelled) setMapError(reason instanceof Error ? reason.message : 'No se pudo cargar el mapa.'); });
    return () => { cancelled = true; if (map) map.remove(); };
  }, [stations, callsign, viewerCallsign]);

  useEffect(() => {
    if (!autoOpenShare || !mapReady) return;
    if (viewerDistanceKm !== null) setShareOpen(true);
    else setShareNotice('Para compartir la distancia exacta, primero guardá tu propio Grid Locator en Ajustes.');
    onAutoShareConsumed?.();
  }, [autoOpenShare, mapReady, viewerDistanceKm, onAutoShareConsumed]);

  return <><div className="fixed inset-0 z-[11050] flex items-center justify-center bg-slate-950/90 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label="Mapa de estaciones con Grid Locator" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={shareCaptureRef} className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-cyan-500/50 bg-slate-900 text-white shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <div><h3 className="font-black">Estaciones con Grid Locator</h3><p className="text-xs text-slate-300">Ubicaciones de estaciones registradas · {grid.toUpperCase()}</p></div>
        <button type="button" data-share-ignore onClick={onClose} className="rounded-lg p-2 hover:bg-slate-800" aria-label="Cerrar mapa"><X className="h-5 w-5" /></button>
      </header>
      {loading ? <div className="p-5 text-sm text-slate-200">Buscando estaciones con Grid Locator…</div> : error ? <div className="p-5 text-sm text-rose-300">{error}</div> : <>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-4 py-2 text-sm"><span><strong>{stations.length}</strong> estaciones con Grid Locator válido</span>{viewerDistanceKm !== null && <span className="text-xs text-cyan-200">Distancia entre {callsign} y {viewerCallsign}: <strong>{viewerDistanceKm.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km · {viewerDistanceMi?.toLocaleString('es-ES', { maximumFractionDigits: 1 })} mi</strong></span>}</div>
        {mapError ? <div className="p-4 text-sm text-rose-300">{mapError}</div> : <div ref={mapElement} className="h-[48dvh] min-h-[260px] w-full bg-slate-800" />}
        <div className="max-h-[24dvh] overflow-y-auto border-t border-slate-700 px-4 py-2">
          {stations.map((station) => <button type="button" key={station.callsign} onClick={() => openUserProfile(station.callsign)} className="flex w-full items-center justify-between gap-3 border-b border-slate-800 py-2 text-left text-sm last:border-0 hover:bg-slate-800/70"><span className="min-w-0"><strong className="font-mono">{station.callsign}</strong><span className="ml-2 text-xs text-slate-400">{station.grid_locator}{station.callsign === callsign ? ' · perfil consultado' : station.callsign === viewerCallsign ? ' · tu estación' : ''}</span></span><span className="shrink-0 text-xs text-cyan-300">Ver perfil</span></button>)}
        </div>
      </>}
      <footer data-share-ignore className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-4 py-3"><div className="min-w-0 flex-1">{shareNotice && <p role="status" className="text-xs text-amber-300">{shareNotice}</p>}</div><div className="flex gap-2">{viewerDistanceKm !== null && <button type="button" onClick={() => setShareOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"><Share2 className="h-4 w-4" />Compartir distancia</button>}<button type="button" onClick={onClose} className="rounded-lg bg-slate-700 px-5 py-2.5 text-sm font-bold">Cerrar</button></div></footer>
    </section>
  </div>
  {shareOpen && viewerDistanceKm !== null && <DistanceShareModal onClose={() => setShareOpen(false)} captureElement={() => shareCaptureRef.current} firstCallsign={callsign} secondCallsign={viewerCallsign} distanceKm={viewerDistanceKm} radioRecipients={is11MeterStationIdentifier(callsign) ? [] : [callsign]} elevenMeterRecipients={is11MeterStationIdentifier(callsign) ? [callsign] : []} defaultPrivateRecipient={callsign} />}
  </>;
};

export const UserPublicProfile: React.FC = () => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [autoShare, setAutoShare] = useState(false);
  const [overview, setOverview] = useState<PublicProfileOverview | null>(null);
  const [activeType, setActiveType] = useState<'ham' | '11m'>('ham');
  useEffect(() => {
    const onOpen = (event: Event) => {
      const callsign = String((event as CustomEvent<{callsign?: string}>).detail?.callsign || '').trim().toUpperCase();
      if (callsign.length < 3) return;
      setMapOpen(false);
      setAutoShare(false);
      setOverview(null);
      setActiveType(is11MeterStationIdentifier(callsign) ? '11m' : 'ham');
      setProfile({ callsign, photo: '', qraOperator: '', grid: '', location: '', elevation: null, loading: true });
    };
    window.addEventListener('open-user-profile', onOpen);
    return () => window.removeEventListener('open-user-profile', onOpen);
  }, []);
  useEffect(() => {
    if (!profile?.callsign) return;
    let active = true;
    const callsign = profile.callsign;
    const load = async () => {
      let photo = ''; let qraOperator = ''; let grid = '';
      if (supabase) {
        // Una única consulta pública devuelve los mismos campos para cualquier
        // SD/indicativo registrado, sin depender de que sea LU1TSB ni del RLS
        // de lectura directa de las tablas internas.
        const { data, error } = await supabase.rpc('community_public_profile_details', { p_callsigns: [callsign] });
        if (error) {
          console.warn('[LogBook] No se pudieron cargar los datos públicos del perfil:', error.message);
        } else if (Array.isArray(data)) {
          const details = data.find((row: any) => String(row.callsign || '').trim().toUpperCase() === callsign);
          if (details) {
            photo = String(details.photo_data_url || '');
            qraOperator = String(details.qra_operator || '').trim();
            grid = String(details.grid_locator || '').trim().toUpperCase();
          }
        }
      }
      let loadedOverview: PublicProfileOverview | null = null;
      try {
        const response = await fetch('/api/directory?action=public-profile&callsign=' + encodeURIComponent(callsign), { cache: 'no-store' });
        if (response.ok) loadedOverview = await response.json() as PublicProfileOverview;
      } catch { /* El perfil básico sigue disponible si fallan las estadísticas públicas. */ }
      const point = maidenheadCenter(grid);
      let elevation: number | null = null;
      let location = '';
      if (point) {
        const [place] = await Promise.all([
          localityForGrid(grid, point),
          (async () => {
            try {
              const url = 'https://api.open-meteo.com/v1/elevation?latitude=' + point.latitude.toFixed(5) + '&longitude=' + point.longitude.toFixed(5);
              const response = await fetch(url);
              if (response.ok) { const result = await response.json(); const value = Number(result?.elevation?.[0]); if (Number.isFinite(value)) elevation = Math.round(value); }
            } catch { /* La ficha sigue disponible aunque falle el servicio de elevación. */ }
          })(),
        ]);
        location = place;
      }
      if (active) {
        setOverview(loadedOverview);
        if (loadedOverview?.identities?.length) {
          const requested = loadedOverview.identities.find(item => item.callsign === callsign);
          setActiveType(requested?.identity_type || loadedOverview.identities[0].identity_type);
        }
        setProfile({ callsign, photo, qraOperator, grid, location, elevation, loading: false });
      }
    };
    void load();
    return () => { active = false; };
  }, [profile?.callsign]);
  if (!profile) return null;
  const visibleIdentities = overview?.identities?.length ? overview.identities : [{ callsign: profile.callsign, identity_type: is11MeterStationIdentifier(profile.callsign) ? '11m' as const : 'ham' as const }];
  const activeIdentity = visibleIdentities.find(item => item.identity_type === activeType) || visibleIdentities[0];
  const displayCallsign = activeIdentity?.callsign || profile.callsign;
  const is11m = activeIdentity?.identity_type === '11m';
  const activeContacts = (overview?.contacts || []).filter(item => item.stationType === (is11m ? '11m' : 'ham'));
  const destinationMap = new Map<string, { key: string; remoteCallsign: string; country: string; division: string; bands: Set<string> }>();
  for (const item of activeContacts) {
    const countryName = countryForCallsign(item.remoteCallsign, item.country || undefined, is11m) || item.country || 'País no identificado';
    const key = is11m ? (item.division || countryName) : countryName.toLocaleLowerCase();
    const current = destinationMap.get(key) || { key, remoteCallsign: item.remoteCallsign, country: countryName, division: item.division, bands: new Set<string>() };
    if (!is11m && item.band) current.bands.add(item.band);
    destinationMap.set(key, current);
  }
  const destinations = Array.from(destinationMap.values()).sort((a, b) => a.country.localeCompare(b.country));
  const activeGallery = (overview?.gallery || []).filter(item => item.stationType === (is11m ? '11m' : 'ham'));

  const flag = flagForCallsign(displayCallsign, undefined, is11m);
  const country = countryForCallsign(displayCallsign, undefined, is11m) || 'País no identificado';
  return <div className='fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/80 p-4' role='dialog' aria-modal='true' aria-labelledby='public-profile-title' onMouseDown={(event) => { if (event.target === event.currentTarget) setProfile(null); }}>
    <section className='w-full max-w-xl max-h-[95dvh] overflow-y-auto rounded-2xl border border-sky-400/50 bg-slate-900 p-5 text-white shadow-2xl'>
      <div className='flex items-center justify-between gap-3'><h3 id='public-profile-title' className='text-lg font-black'>Perfil del usuario</h3><button type='button' onClick={() => setProfile(null)} className='rounded-lg p-2 text-slate-300 hover:bg-slate-800' aria-label='Cerrar perfil'><X className='h-5 w-5' /></button></div>
      <div className='mt-4 flex flex-col items-center gap-2'><div className='h-24 w-24 overflow-hidden rounded-full border-2 border-sky-300 bg-slate-800'>{profile.photo ? <img src={profile.photo} alt={'Foto de '+profile.callsign} className='h-full w-full object-cover' /> : <div className='flex h-full items-center justify-center font-mono text-xl font-black'>{profile.callsign.slice(0,3)}</div>}</div>
        <h4 className='font-mono text-xl font-black tracking-wider'>{displayCallsign}</h4><p className='text-sm text-slate-300'>{flag} {country} · {is11m ? '11 metros' : 'Radioaficionado'}</p></div>
      {visibleIdentities.length > 1 && <div className='mt-4 grid grid-cols-2 gap-2'>
        <button type='button' onClick={() => setActiveType('ham')} className={`rounded-lg px-3 py-2.5 text-sm font-black ${!is11m ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}>RADIOAFICIÓN</button>
        <button type='button' onClick={() => setActiveType('11m')} className={`rounded-lg px-3 py-2.5 text-sm font-black ${is11m ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}>11 METROS</button>
      </div>}
      {overview && <section className='mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3'>
        <h5 className='text-sm font-black uppercase tracking-wide text-sky-200'>Estadísticas de {is11m ? '11 metros' : 'radioafición'}</h5>
        <div className='mt-3 grid grid-cols-2 gap-2'>
          <div className='rounded-lg bg-slate-900 p-3 text-center'><strong className='block text-2xl tabular-nums'>{activeContacts.length}</strong><span className='text-xs text-slate-300'>Contactos registrados</span></div>
          <div className='rounded-lg bg-slate-900 p-3 text-center'><strong className='block text-2xl tabular-nums'>{destinations.length}</strong><span className='text-xs text-slate-300'>{is11m ? 'Países / divisiones' : 'Países contactados'}</span></div>
        </div>
        <div className='mt-3 space-y-1.5'>
          {destinations.length ? destinations.map(item => <div key={item.key} className='flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2 text-sm'>
            <span className='min-w-0'><span className='mr-2'>{flagForCallsign(item.remoteCallsign, item.country, is11m)}</span><strong>{is11m && item.division ? 'División ' + item.division + ' · ' : ''}{item.country}</strong></span>
            {!is11m && <span className='shrink-0 text-xs text-cyan-200'>{Array.from(item.bands).sort().join(' · ')}</span>}
          </div>) : <p className='text-xs text-slate-400'>Todavía no hay destinos registrados en esta modalidad.</p>}
        </div>
      </section>}
      {overview && <section className='mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3'>
        <div className='flex items-center justify-between gap-2'><h5 className='text-sm font-black uppercase tracking-wide text-sky-200'>Galería de eQSL recibidas</h5><span className='rounded-full bg-slate-800 px-2 py-1 text-xs tabular-nums'>{activeGallery.length}</span></div>
        <p className='mt-1 text-[11px] text-slate-400'>Se conserva la primera tarjeta recibida de cada estación.</p>
        {activeGallery.length ? <div className='mt-3 grid grid-cols-2 gap-2'>
          {activeGallery.map(item => <article key={item.senderCallsign} className='min-w-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-2'>
            <strong className='block truncate text-center font-mono text-sm'>{item.senderCallsign}</strong>
            {item.card.imageDataUrl ? <img src={item.card.imageDataUrl} alt={'eQSL recibida de ' + item.senderCallsign} loading='lazy' className='mt-2 h-28 w-full rounded bg-white object-contain' /> : <div className='mt-2 flex h-28 flex-col items-center justify-center rounded bg-slate-800 text-center text-xs text-slate-300'><span>{item.card.date || ''}</span><span>{item.card.band || ''} · {item.card.mode || ''}</span></div>}
            <p className='mt-1 text-center text-[10px] text-slate-400'>{item.card.date || ''} · {item.card.band || ''}</p>
          </article>)}
        </div> : <p className='mt-3 text-xs text-slate-400'>Todavía no hay eQSL recibidas en esta modalidad.</p>}
      </section>}
      <div className='mt-5 space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm'>
        <p className='flex items-center gap-2'><MapPin className='h-4 w-4 shrink-0 text-sky-300' /><span><strong>Ciudad / pueblo:</strong> {profile.loading ? 'Buscando…' : profile.location || 'No disponible para este Grid Locator'}</span></p>
        <p className='pl-6 text-slate-300'><strong>Grid Locator:</strong> {profile.grid || (profile.loading ? 'Consultando…' : 'No informado')}</p>
        {profile.qraOperator && <p className='pl-6 break-words text-slate-300'><strong>QRA OPERADOR:</strong> {profile.qraOperator}</p>}
        <p className='pl-6 text-slate-300'><strong>Altitud sobre el nivel del mar:</strong> {profile.loading ? 'Calculando…' : profile.elevation === null ? 'No disponible' : '≈ '+profile.elevation+' m s. n. m.'}</p>
        <p className='pl-6 text-[11px] leading-relaxed text-slate-400'>Ciudad, pueblo y altitud estimados a partir del centro de la cuadrícula Maidenhead. No representan una dirección exacta ni la altura de la antena.</p>
      </div>
      {activeType === 'ham' && isValidMaidenheadLocator(profile.grid) && <div className='mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2'><button type='button' onClick={() => { setAutoShare(false); setMapOpen(true); }} className='flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-3 font-bold text-white hover:bg-cyan-600'><MapIcon className='h-4 w-4' />VER EN EL MAPA</button><button type='button' onClick={() => { setAutoShare(true); setMapOpen(true); }} className='flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-500'><Share2 className='h-4 w-4' />COMPARTIR DISTANCIA</button></div>}
      <button type='button' disabled={displayCallsign === (localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase()} onClick={() => { const target = displayCallsign; setProfile(null); window.dispatchEvent(new CustomEvent('open-private-message', { detail: { callsign: target } })); }} className='mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 font-bold text-white hover:bg-sky-600 disabled:opacity-40'><MessageCircle className='h-4 w-4' />Enviar mensaje privado</button>
      <button type='button' onClick={() => setProfile(null)} className='mt-2 w-full rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200'>Cerrar</button>
    </section>
    {activeType === 'ham' && mapOpen && isValidMaidenheadLocator(profile.grid) && <GridStationsMap callsign={displayCallsign} grid={profile.grid} autoOpenShare={autoShare} onAutoShareConsumed={() => setAutoShare(false)} onClose={() => { setMapOpen(false); setAutoShare(false); }} />}
  </div>;
};
