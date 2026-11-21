import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Search, MapPin, X, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { getUserCallsign } from '../services/qrzService';
import { countryForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { capitalPointForCountry, isValidMaidenheadLocator, maidenheadToPoint } from '../services/dxDistance';
import { openUserProfile } from './UserPublicProfile';
import { loadLeaflet } from '../services/leaflet';

type Point = { lat: number; lon: number };
type Place = { name: string; lat: number; lon: number; type?: string };
async function searchPlaces(query: string): Promise<Place[]> {
  const clean = query.trim();
  if (!clean) return [];
  const requestJson = async (url: string, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'Accept-Language': 'es,es-419;q=0.9,en;q=0.7' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { window.clearTimeout(timer); }
  };

  const nominatimParams = new URLSearchParams({
    q: clean, format: 'jsonv2', limit: '10', addressdetails: '1',
    'accept-language': 'es',
  });
  const photonParams = new URLSearchParams({ q: clean, limit: '10', lang: 'es' });

  // Consultar ambos geocodificadores en paralelo evita que un proveedor lento
  // impida obtener resultados del otro y amplía las coincidencias mundiales.
  const [nomResult, photonResult] = await Promise.allSettled([
    requestJson('https://nominatim.openstreetmap.org/search?' + nominatimParams.toString()),
    requestJson('https://photon.komoot.io/api/?' + photonParams.toString()),
  ]);

  const places: Place[] = [];
  if (nomResult.status === 'fulfilled' && Array.isArray(nomResult.value)) {
    for (const row of nomResult.value) {
      const address = row.address || {};
      const primary = row.name || row.namedetails?.name || String(row.display_name || '').split(',')[0];
      const locality = address.city || address.town || address.village || address.municipality || address.county;
      const region = address.state || address.region || address.province;
      const country = address.country;
      const label = [primary, locality && locality !== primary ? locality : '', region, country]
        .filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(', ');
      const lat = Number(row.lat), lon = Number(row.lon);
      if (label && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        places.push({ name: label, lat, lon, type: String(row.type || row.class || '') });
      }
    }
  }
  if (photonResult.status === 'fulfilled' && Array.isArray(photonResult.value?.features)) {
    for (const feature of photonResult.value.features) {
      const props = feature?.properties || {};
      const coords = feature?.geometry?.coordinates || [];
      const primary = props.name || props.street || props.locality || clean;
      const label = [primary, props.city, props.state, props.country]
        .filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(', ');
      const lat = Number(coords[1]), lon = Number(coords[0]);
      if (label && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        places.push({ name: label, lat, lon, type: String(props.type || '') });
      }
    }
  }

  // Quitar duplicados entre proveedores, conservando nombres con país y región.
  const unique = new Map<string, Place>();
  for (const place of places) {
    const key = place.name.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim() + ':' +
      place.lat.toFixed(3) + ':' + place.lon.toFixed(3);
    if (!unique.has(key)) unique.set(key, place);
  }
  const normalizedQuery = clean.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  return [...unique.values()]
    .sort((a, b) => {
      const score = (place: Place) => {
        const name = place.name.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
        return name.split(',')[0].trim() === normalizedQuery ? 0 : name.startsWith(normalizedQuery) ? 1 : name.includes(normalizedQuery) ? 2 : 3;
      };
      return score(a) - score(b) || a.name.localeCompare(b.name);
    })
    .slice(0, 15);
}
function distanceKm(a: Point, b: Point) {
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b.lat-a.lat), dLon = rad(b.lon-a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function pointToMaidenhead(point: Point): string {
  let lon = point.lon + 180;
  let lat = point.lat + 90;
  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(lat / 10);
  let locator = String.fromCharCode(65 + fieldLon, 65 + fieldLat);
  lon -= fieldLon * 20;
  lat -= fieldLat * 10;
  const squareLon = Math.floor(lon / 2);
  const squareLat = Math.floor(lat);
  locator += String(squareLon) + String(squareLat);
  lon -= squareLon * 2;
  lat -= squareLat;
  const subLon = Math.min(23, Math.floor(lon * 12));
  const subLat = Math.min(23, Math.floor(lat * 24));
  locator += String.fromCharCode(97 + subLon, 97 + subLat);
  return locator.toUpperCase();
}
function bearingDegrees(a: Point, b: Point) {
  const rad = (v: number) => v * Math.PI / 180;
  const y = Math.sin(rad(b.lon-a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat))*Math.sin(rad(b.lat)) - Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  return (Math.atan2(y,x) * 180 / Math.PI + 360) % 360;
}
const DistanceMap: React.FC<{ origin: Point; destination: Place | null; focusPlace: Place | null; originLabel: string; onDestinationChange: (place: Place | null) => void }> = ({ origin, destination, focusPlace, originLabel, onDestinationChange }) => {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const focusRef = useRef<any>(null);
  const changeRef = useRef(onDestinationChange);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => { changeRef.current = onDestinationChange; }, [onDestinationChange]);
  // Mantener una única instancia Leaflet: elegir destino no debe reiniciar el mapa.
  useEffect(() => {
    if (!element.current) return;
    let cancelled = false; let map: any; let resizeTimer = 0;
    let handleMapClick: ((event: MouseEvent) => void) | null = null;
    void loadLeaflet().then(L => {
      if (cancelled || !element.current) return;
      map = L.map(element.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, touchZoom: true, doubleClickZoom: true, worldCopyJump: true, minZoom: 2, maxZoom: 19 });
      mapRef.current = map;
      leafletRef.current = L;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, noWrap: false, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      // Pane dedicado: la ruta queda siempre por encima de las teselas y los marcadores.
      const routePane = map.createPane('distanceRoutePane');
      routePane.style.zIndex = '650';
      routePane.style.pointerEvents = 'none';
      L.marker([origin.lat, origin.lon]).addTo(map).bindPopup('Origen: ' + originLabel);
      map.setView([20, 0], 2);
      // Capturar el click nativo del contenedor además del sistema de eventos
      // de Leaflet mejora la selección en navegadores móviles dentro del modal.
      handleMapClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.leaflet-control')) return;
        const point = map.mouseEventToLatLng(event);
        const lat = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
        const lon = Math.max(-180, Math.min(180, point.lng));
        changeRef.current({ name: 'Punto seleccionado en el mapa', lat, lon });
      };
      element.current.addEventListener('click', handleMapClick);
      const resize = () => { if (!cancelled && map) map.invalidateSize({ pan: false }); };
      window.requestAnimationFrame(resize); resizeTimer = window.setTimeout(resize, 300);
      // Los efectos de destino/búsqueda pueden ejecutarse antes de que Leaflet termine
      // de cargar. Este estado los vuelve a ejecutar cuando el mapa ya está disponible.
      setMapReady(true);
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo abrir el mapa.'); });
    return () => { cancelled = true; setMapReady(false); if (resizeTimer) window.clearTimeout(resizeTimer); if (element.current && handleMapClick) element.current.removeEventListener('click', handleMapClick); if (map) map.remove(); mapRef.current = null; leafletRef.current = null; markerRef.current = null; lineRef.current = null; focusRef.current = null; };
  }, [origin.lat, origin.lon, originLabel]);
  useEffect(() => {
    const map = mapRef.current; const L = leafletRef.current || (window as any).L; if (!map || !L) return;
    if (focusRef.current) { map.removeLayer(focusRef.current); focusRef.current = null; }
    if (focusPlace) { focusRef.current = L.circleMarker([focusPlace.lat, focusPlace.lon], { radius: 8, color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: 0.85 }).addTo(map).bindPopup('Zona buscada: ' + focusPlace.name); map.setView([focusPlace.lat, focusPlace.lon], 12); }
  }, [mapReady, focusPlace?.lat, focusPlace?.lon, focusPlace?.name]);
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !mapReady) return;

    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (lineRef.current && map.hasLayer(lineRef.current)) {
      map.removeLayer(lineRef.current);
    }
    lineRef.current = null;
    if (!destination) return;

    // Dibujar la ruta con el renderer nativo de Leaflet en un pane dedicado.
    // Leaflet recalcula automáticamente la geometría en cada zoom y movimiento;
    // no depende de temporizadores, SVG manual ni de la posición CSS del mapa.
    const route = L.polyline(
      [[origin.lat, origin.lon], [destination.lat, destination.lon]],
      {
        pane: 'distanceRoutePane',
        color: '#ffeb00',
        weight: 7,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        smoothFactor: 0
      }
    ).addTo(map);
    lineRef.current = route;
    route.bringToFront();

    const group = L.layerGroup().addTo(map);
    const marker = L.marker([destination.lat, destination.lon], { draggable: true })
      .addTo(group).bindPopup('Destino: ' + destination.name);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      changeRef.current({ name: 'Punto seleccionado en el mapa', lat: p.lat, lon: p.lng });
    });
    markerRef.current = group;

    map.fitBounds(L.latLngBounds([[origin.lat, origin.lon], [destination.lat, destination.lon]]),
      { padding: [48, 48], maxZoom: 8, animate: false });
    route.redraw();

    return () => {
      if (map.hasLayer(route)) map.removeLayer(route);
      if (markerRef.current === group) markerRef.current = null;
      if (map.hasLayer(group)) map.removeLayer(group);
      if (lineRef.current === route) lineRef.current = null;
    };
  }, [mapReady, origin.lat, origin.lon, destination?.lat, destination?.lon, destination?.name]);
  const km = destination ? distanceKm(origin, destination) : null;
  const bearing = destination ? bearingDegrees(origin, destination) : null;
  const locator = destination ? pointToMaidenhead(destination) : '';
  const shareMeasurement = () => { if (!destination || km === null || bearing === null) return; const message = 'LOGBOOK eQSL EXPRESS\nDistancia desde mi estación (' + originLabel + ') hasta ' + destination.name + '\nDistancia: ' + km.toFixed(1) + ' km / ' + (km / 1.609344).toFixed(1) + ' mi\nRumbo: ' + bearing.toFixed(0) + '°\nGrid Locator destino: ' + locator + '\nCoordenadas: ' + destination.lat.toFixed(5) + ', ' + destination.lon.toFixed(5); if (navigator.share) void navigator.share({ title: 'Calculador de distancia', text: message }).catch(() => {}); else if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(message); };
  return <div className="mt-3 overflow-hidden rounded-xl border border-slate-600">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 px-3 py-3 text-sm text-white">
      {destination && km !== null ? <div className="flex flex-wrap gap-x-5 gap-y-1"><span><strong>{km.toLocaleString('es-ES',{maximumFractionDigits:1})} km</strong></span><span><strong>{(km/1.609344).toLocaleString('es-ES',{maximumFractionDigits:1})} mi</strong></span><span>Rumbo: <strong>{bearing!.toFixed(0)}°</strong></span></div> : <strong className="text-cyan-200">Mapa mundial: tocá cualquier punto para medir</strong>}
      <button type="button" onClick={() => mapRef.current?.setView([20, 0], 2)} className="rounded-lg border border-slate-500 px-3 py-1.5 text-xs font-bold hover:bg-slate-700">Ver todo el mundo</button>
    </div>
    <div ref={element} className="h-[58dvh] min-h-[360px] w-full bg-slate-800" />
    {destination && <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-3 py-3 text-xs text-slate-200"><span>Destino: {destination.name} · {destination.lat.toFixed(5)}, {destination.lon.toFixed(5)} · Grid: <strong className="font-mono text-cyan-300">{locator}</strong></span><div className="flex gap-2"><button type="button" onClick={shareMeasurement} className="rounded-lg bg-cyan-700 px-3 py-1.5 font-bold text-white hover:bg-cyan-600">Compartir medición</button><button type="button" onClick={() => onDestinationChange(null)} className="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold hover:bg-slate-800">Limpiar destino</button></div></div>}
    <p className="bg-slate-900 px-3 py-2 text-[11px] text-slate-400">Desplazate por todo el planeta, acercá o alejá y tocá cualquier lugar. También podés arrastrar el marcador. La distancia se mide en línea recta desde tu estación.</p>
    {error && <p className="bg-slate-900 px-3 pb-3 text-xs text-amber-300">{error}</p>}
  </div>;
};


type RegisteredStation = { callsign: string; grid_locator: string; lat: number; lon: number };
const RegisteredGridStations: React.FC<{ origin: Point | null; onOpenProfile: (callsign: string) => void }> = ({ origin, onOpenProfile }) => {
  const mapElement = useRef<HTMLDivElement>(null);
  const [stations, setStations] = useState<RegisteredStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const token = localStorage.getItem('community_chat_identity_token') || '';
        if (!token) throw new Error('Validá tu SD o indicativo para consultar las estaciones registradas.');
        const response = await fetch('/api/directory?action=grid-map', {
          headers: { 'x-identity-token': token }, cache: 'no-store'
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el directorio de estaciones.');
        const unique = new Map<string, RegisteredStation>();
        for (const row of Array.isArray(payload?.stations) ? payload.stations : []) {
          const callsign = String(row?.callsign || '').trim().toUpperCase();
          const grid = String(row?.grid_locator || '').trim().toUpperCase();
          const point = isValidMaidenheadLocator(grid) ? maidenheadToPoint(grid) : null;
          if (callsign && point) unique.set(callsign, { callsign, grid_locator: grid, lat: point.lat, lon: point.lon });
        }
        if (active) setStations([...unique.values()].sort((a,b) => a.callsign.localeCompare(b.callsign)));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las estaciones.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mapElement.current || !stations.length) return;
    let map: any, cancelled = false;
    void loadLeaflet().then(L => {
      if (cancelled || !mapElement.current) return;
      map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, touchZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      const bounds: [number, number][] = [];
      for (const station of stations) {
        const coords: [number, number] = [station.lat, station.lon];
        bounds.push(coords);
        const marker = L.marker(coords).addTo(map);
        marker.bindPopup('<strong>' + station.callsign + '</strong><br>Grid: ' + station.grid_locator + '<br><button type="button" class="grid-station-profile">Ver perfil</button>');
        marker.on('popupopen', (event: any) => {
          const button = event.popup?.getElement()?.querySelector('.grid-station-profile') as HTMLButtonElement | null;
          if (!button) return;
          button.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            onOpenProfile(station.callsign);
          }, { once: true });
        });
      }
      if (origin) {
        const originCoords: [number, number] = [origin.lat, origin.lon];
        bounds.push(originCoords);
        L.marker(originCoords).addTo(map).bindPopup('Tu estación (origen)');
        if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [35,35], maxZoom: 8 });
        else map.setView(originCoords, 6);
      } else if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [35,35], maxZoom: 8 });
      window.setTimeout(() => { if (!cancelled && map) map.invalidateSize(); }, 120);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el mapa.'); });
    return () => { cancelled = true; if (map) map.remove(); };
  }, [stations, origin?.lat, origin?.lon]);

  return <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-bold text-cyan-200">Estaciones registradas con Grid Locator</h3><p className="text-xs text-slate-400">Tocá una SD o indicativo para abrir su perfil público.</p></div>
      {!loading && !error && <strong className="text-sm text-cyan-300">{stations.length} estaciones</strong>}
    </div>
    {loading ? <p className="text-sm text-slate-300">Buscando estaciones registradas…</p> : error ? <p className="text-sm text-amber-300">{error}</p> : stations.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay estaciones con Grid Locator válido.</p> : <>
      <div ref={mapElement} className="mb-3 h-[38dvh] min-h-[230px] w-full overflow-hidden rounded-lg bg-slate-800" />
      <details className="rounded-lg border border-slate-700 bg-slate-900">
        <summary className="cursor-pointer list-none px-3 py-3 text-sm font-bold text-cyan-200">Ver estaciones registradas ({stations.length}) <span className="float-right text-slate-400">＋</span></summary>
        <div className="max-h-64 space-y-1 overflow-y-auto border-t border-slate-700 p-2">
          {stations.map(station => <button key={station.callsign} type="button" onClick={() => onOpenProfile(station.callsign)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-cyan-500/60 hover:bg-slate-950">
            <span className="min-w-0"><strong className="block truncate font-mono text-sm">{station.callsign}</strong><span className="text-xs text-slate-400">Grid: {station.grid_locator}</span></span><span className="shrink-0 text-xs font-bold text-cyan-300">Ver perfil</span>
          </button>)}
        </div>
      </details>
    </>}
  </div>;
};

export const DistanceCalculator: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [originLabel, setOriginLabel] = useState('');
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState('');
  const [needsGridLocator, setNeedsGridLocator] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [mapFocus, setMapFocus] = useState<Place | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (!open || origin || originLoading) return;
    let active = true;
    const loadOrigin = async () => {
      setOriginLoading(true); setOriginError('');
      try {
        const callsign = String(localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || getUserCallsign() || localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
        const is11m = is11MeterStationIdentifier(callsign);
        const savedCountry = localStorage.getItem('user_country') || localStorage.getItem('cb_station_country') || undefined;
        const country = countryForCallsign(callsign, savedCountry, is11m);
        const localGrid = String(localStorage.getItem('user_grid_locator') || '').trim().toUpperCase();
        const localGridPoint = isValidMaidenheadLocator(localGrid) ? maidenheadToPoint(localGrid) : null;
        if (localGridPoint) {
          if (active) { setOrigin(localGridPoint); setOriginLabel('Tu estación · ' + localGrid); setNeedsGridLocator(false); }
          return;
        }
        if (active) setNeedsGridLocator(true);

        // La capital está precargada localmente: no se espera a servicios geográficos externos.
        const capital = capitalPointForCountry(country);
        if (!capital) throw new Error(country ? 'No hay una capital configurada para ' + country + '.' : 'No se pudo identificar el país a partir de tu SD o indicativo.');
        if (active) {
          setOrigin(capital);
          setOriginLabel('Capital de ' + country);
          setOriginLoading(false);
        }

        // En otro dispositivo puede existir un Grid guardado en el servidor.
        // Se consulta en segundo plano; el mapa ya tiene una ubicación inmediata.
        const token = localStorage.getItem('community_chat_identity_token') || '';
        if (callsign && token && supabase) {
          const { data, error } = await supabase.from('live_spot_grid_locators').select('grid_locator').eq('callsign', callsign).maybeSingle();
          const remoteGrid = String(data?.grid_locator || '').trim().toUpperCase();
          const remotePoint = !error && isValidMaidenheadLocator(remoteGrid) ? maidenheadToPoint(remoteGrid) : null;
          if (active && remotePoint) {
            setOrigin(remotePoint);
            setOriginLabel('Tu estación · ' + remoteGrid);
            setNeedsGridLocator(false);
            try { localStorage.setItem('user_grid_locator', remoteGrid); } catch { /* El dato remoto sigue siendo válido. */ }
          } else if (active) setNeedsGridLocator(true);
        }
      } catch (e) {
        if (active) setOriginError(e instanceof Error ? e.message : 'No se pudo determinar tu ubicación inicial.');
      } finally { if (active) setOriginLoading(false); }
    };
    void loadOrigin();
    return () => { active = false; };
  }, [open]);

  const runSearch = async () => {
    const term = query.trim();
    if (term.length < 2) { setSearchError('Escribí al menos dos caracteres para buscar un lugar.'); return; }
    setSearching(true); setSearchError(''); setSelected(null);
    try {
      const found = await searchPlaces(term);
      setResults(found);
      if (found.length === 1) {
        // Si hay una sola coincidencia inequívoca, seleccionarla permite medir
        // inmediatamente. Si hay varias, nunca elegir una ubicación por el usuario.
        setMapFocus(found[0]);
        setSelected(found[0]);
      } else if (found.length > 1) {
        setSelected(null);
        setMapFocus(null);
      } else setSearchError('No se encontraron coincidencias para «' + term + '». Probá agregando el país o una región.');
    } catch (e) { setSearchError(e instanceof Error ? e.message : 'No se pudo realizar la búsqueda.'); }
    finally { setSearching(false); }
  };

  return <>
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-md">
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-[56px] w-full min-w-0 items-center gap-2 bg-slate-900 px-3 py-2.5 text-left text-white hover:bg-slate-800/80">
        <Calculator className="h-5 w-5 shrink-0 text-cyan-300" />
        <span className="text-sm font-bold sm:text-base">CALCULADOR DE DISTANCIA</span>
      </button>
    </section>
    {open && <div className="fixed inset-0 z-[11020] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Calculador de distancia" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="flex max-h-[95dvh] w-full max-w-4xl flex-col overflow-y-auto rounded-2xl border border-cyan-500/50 bg-slate-900 p-4 text-white shadow-2xl">
        <header className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-black">CALCULADOR DE DISTANCIA</h2><p className="text-xs text-slate-400">Medición en línea recta entre dos lugares del mundo.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5" /></button></header>
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"><p className="mb-1 font-bold text-cyan-200">Tu ubicación de origen</p>{originLoading ? <span className="flex items-center gap-2 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Localizando tu Grid Locator o la capital de tu país…</span> : origin ? <><p>{originLabel}</p><p className="mt-1 text-[11px] text-slate-400">Si tenés un Grid Locator guardado se utiliza el centro de esa cuadrícula; de lo contrario se usa la capital de tu país.</p></> : <p className="text-amber-300">{originError || 'No se pudo determinar la ubicación de origen.'}</p>}</div>
        {needsGridLocator && <div className="mt-3 rounded-xl border border-amber-400/50 bg-amber-950/40 p-3">
          <p className="text-sm font-bold text-amber-200">Completá tu Grid Locator para obtener mediciones de distancia más exactas.</p>
          <p className="mt-1 text-xs text-slate-300">Sin este dato, la ubicación de origen se estima usando la capital de tu país.</p>
          <button type="button" onClick={() => { localStorage.setItem('focus_user_grid_locator', '1'); window.dispatchEvent(new Event('open-user-settings-grid')); }} className="mt-2 rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-300">Completar mi Grid Locator</button>
        </div>}
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); void runSearch(); }}>
          <label className="sr-only" htmlFor="distance-place-search">Lugar de destino</label><input id="distance-place-search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }} placeholder="Escribí una ciudad, localidad o lugar del mundo…" className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-500" />
          <button type="submit" disabled={searching} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold hover:bg-cyan-600 disabled:opacity-50">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{searching ? 'Buscando…' : 'Buscar lugar'}</button>
        </form>
        {searching && <p role="status" className="mt-2 text-xs text-cyan-200">Buscando el lugar en el mapa mundial…</p>}{searchError && <p role="alert" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2 text-xs text-amber-200">{searchError}</p>}
        {selected && origin && <div role="status" className="mt-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3">
          <p className="text-sm font-black text-emerald-200">MEDICIÓN CALCULADA</p>
          <p className="mt-1 text-sm">{originLabel} → {selected.name}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-base font-black">
            <span>{distanceKm(origin, selected).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km</span>
            <span>{(distanceKm(origin, selected) / 1.609344).toLocaleString('es-ES', { maximumFractionDigits: 1 })} millas</span>
            <span>Rumbo {bearingDegrees(origin, selected).toFixed(0)}°</span>
          </div>
          <p className="mt-1 text-xs text-slate-300">Grid Locator destino: {pointToMaidenhead(selected).toUpperCase()} · {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</p>
        </div>}
        {results.length > 0 && <div className="mt-2 rounded-lg border border-cyan-500/40 bg-slate-950 p-2">
          <p className="px-2 pb-2 text-xs font-bold text-cyan-200">{results.length} coincidencias encontradas. Elegí el lugar correcto:</p>
          <div className="max-h-52 space-y-1 overflow-y-auto">{results.map((place, index) => <button type="button" key={place.name + place.lat + place.lon + index} onClick={() => { setMapFocus(place); setSelected(place); setResults([]); }} className="flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:border-cyan-500/50 hover:bg-slate-800"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><span className="min-w-0"><strong className="block">{place.name}</strong><span className="text-[11px] text-slate-400">{place.lat.toFixed(4)}, {place.lon.toFixed(4)}</span></span></button>)}</div>
        </div>}
        {origin && <DistanceMap origin={origin} destination={selected} focusPlace={mapFocus} originLabel={originLabel} onDestinationChange={setSelected} />}
        <RegisteredGridStations origin={origin} onOpenProfile={(callsign) => { setOpen(false); window.setTimeout(() => { openUserProfile(callsign); }, 80); }} />
      </section>
    </div>}
  </>;
};
