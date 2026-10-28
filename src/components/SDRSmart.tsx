import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Radio, RefreshCw, ExternalLink, Volume2, Waves } from 'lucide-react';

type KiwiReceiver = {
  id?: string;
  url: string;
  name?: string;
  loc?: string;
  grid?: string;
  gps?: [number, number];
  bands?: [number, number];
  users?: number;
  users_max?: number;
  offline?: boolean | string;
  flagged?: boolean | string;
};

type KiwiDirectory = {
  schema?: number;
  fetched_at?: string;
  receivers?: KiwiReceiver[];
};

const DIRECTORY_URL = 'https://cdn.aethersdr.com/kiwi.json';
const CACHE_KEY = 'logbook_sdr_kiwi_directory_v1';
const CACHE_MS = 30 * 60 * 1000;

const bands = [
  { label: 'LF · 2200 m', frequency: 0.136, low: 0.1357e6, high: 0.1378e6 },
  { label: 'MF · 630 m', frequency: 0.475, low: 0.472e6, high: 0.479e6 },
  { label: '160 m', frequency: 1.9, low: 1.8e6, high: 2e6 },
  { label: '80 m', frequency: 3.7, low: 3.5e6, high: 4e6 },
  { label: '60 m', frequency: 5.357, low: 5.25e6, high: 5.45e6 },
  { label: '40 m', frequency: 7.1, low: 7e6, high: 7.3e6 },
  { label: '30 m', frequency: 10.12, low: 10.1e6, high: 10.15e6 },
  { label: '20 m', frequency: 14.2, low: 14e6, high: 14.35e6 },
  { label: '17 m', frequency: 18.1, low: 18.068e6, high: 18.168e6 },
  { label: '15 m', frequency: 21.2, low: 21e6, high: 21.45e6 },
  { label: '12 m', frequency: 24.94, low: 24.89e6, high: 24.99e6 },
  { label: '11 m · CB', frequency: 27.555, low: 26.965e6, high: 27.855e6 },
  { label: '10 m', frequency: 28.4, low: 28e6, high: 29.7e6 },
  { label: '6 m', frequency: 50.2, low: 50e6, high: 54e6 },
  { label: '2 m', frequency: 145.5, low: 144e6, high: 148e6 },
  { label: '70 cm', frequency: 435, low: 420e6, high: 450e6 },
];

const modes = [
  { label: 'AM', value: 'am' }, { label: 'AM estrecho', value: 'amn' },
  { label: 'LSB', value: 'lsb' }, { label: 'USB', value: 'usb' },
  { label: 'CW', value: 'cw' }, { label: 'CW estrecho', value: 'cwn' },
  { label: 'FM angosta', value: 'nbfm' }, { label: 'IQ', value: 'iq' },
];

function distanceKm(a: [number, number], b: [number, number]) {
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function receiverIsUsable(receiver: KiwiReceiver) {
  const offline = receiver.offline === true || receiver.offline === 'yes' || receiver.offline === 'true';
  const flagged = receiver.flagged === true || receiver.flagged === 'yes' || receiver.flagged === 'true';
  let secureUrl = false;
  try { secureUrl = new URL(receiver.url).protocol === 'https:'; } catch { secureUrl = false; }
  return Boolean(receiver.url)
    && secureUrl
    && !offline
    && !flagged
    && Array.isArray(receiver.gps)
    && receiver.gps.length === 2
    && receiver.gps.every(Number.isFinite)
    && (receiver.gps[0] !== 0 || receiver.gps[1] !== 0);
}

function receiverSupports(receiver: KiwiReceiver, frequencyMHz: number) {
  if (!Array.isArray(receiver.bands) || receiver.bands.length !== 2) return true;
  const hz = frequencyMHz * 1_000_000;
  return hz >= receiver.bands[0] && hz <= receiver.bands[1];
}

function toSecureUrl(rawUrl: string, frequencyMHz: number, mode: string) {
  try {
    const source = new URL(rawUrl);
    // Only HTTPS receivers can be embedded by an HTTPS app; do not create mixed content.
    if (source.protocol !== 'https:') return null;
    source.searchParams.set('f', String(frequencyMHz * 1000) + mode);
    return source.toString();
  } catch {
    return null;
  }
}

export function SDRSmart() {
  const [open, setOpen] = useState(false);
  const [receivers, setReceivers] = useState<KiwiReceiver[]>([]);
  const [loading, setLoading] = useState(false);
  const [directoryStatus, setDirectoryStatus] = useState('Preparado para buscar receptores SDR públicos.');
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [locationStatus, setLocationStatus] = useState('Ubicación automática pendiente; la lista manual siempre está disponible.');
  const [manualList, setManualList] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [bandIndex, setBandIndex] = useState(7);
  const [mode, setMode] = useState('usb');
  const [frequency, setFrequency] = useState('14.200');
  const [search, setSearch] = useState('');
  const [mutedHint, setMutedHint] = useState(false);

  const loadDirectory = useCallback(async (force = false) => {
    setLoading(true);
    setDirectoryStatus('Consultando el directorio público de KiwiSDR…');
    try {
      if (!force) {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { at: number; payload: KiwiDirectory };
          if (Date.now() - parsed.at < CACHE_MS && Array.isArray(parsed.payload.receivers)) {
            setReceivers(parsed.payload.receivers.filter(receiverIsUsable));
            setDirectoryStatus('Lista pública cargada desde caché reciente.');
            setLoading(false);
            return;
          }
        }
      }
      const response = await fetch(DIRECTORY_URL, { cache: force ? 'reload' : 'default' });
      if (!response.ok) throw new Error('El directorio público no respondió.');
      const payload = await response.json() as KiwiDirectory;
      if (payload.schema !== 1 || !Array.isArray(payload.receivers)) throw new Error('El formato del directorio SDR no es compatible.');
      const usable = payload.receivers.filter(receiverIsUsable);
      setReceivers(usable);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), payload }));
      const date = payload.fetched_at ? new Date(payload.fetched_at).toLocaleString() : 'fecha no indicada';
      setDirectoryStatus(`${usable.length} receptores KiwiSDR disponibles en la lista · directorio actualizado: ${date}.`);
    } catch {
      setDirectoryStatus('No se pudo actualizar el directorio ahora. Podés usar los directorios manuales mientras tanto.');
    } finally {
      setLoading(false);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('Este navegador no ofrece ubicación automática. La selección manual sigue disponible.');
      return;
    }
    setLocationStatus('Solicitando autorización de ubicación para el buen funcionamiento del SDR…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation([position.coords.latitude, position.coords.longitude]);
        setSelectedId('');
        setLocationStatus('Ubicación autorizada: seleccionando el receptor más cercano.');
      },
      () => setLocationStatus('No se autorizó la ubicación. Podés elegir un receptor manualmente.'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const sortedReceivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return receivers
      .filter(receiver => !query || [receiver.name, receiver.loc, receiver.grid, receiver.url].some(value => String(value || '').toLowerCase().includes(query)))
      .map(receiver => ({ receiver, distance: location && receiver.gps ? distanceKm(location, receiver.gps) : null }))
      .sort((a, b) => {
        if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
        return String(a.receiver.name || '').localeCompare(String(b.receiver.name || ''));
      });
  }, [receivers, location, search]);

  const selected = sortedReceivers.find(item => (item.receiver.id || item.receiver.url) === selectedId)?.receiver
    || receivers.find(receiver => (receiver.id || receiver.url) === selectedId)
    || sortedReceivers[0]?.receiver
    || null;

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id || selected.url);
  }, [selected, selectedId]);

  const activeBand = bands[bandIndex] || bands[7];
  const parsedFrequency = Number(frequency.replace(',', '.'));
  const frequencyMHz = Number.isFinite(parsedFrequency) && parsedFrequency > 0 ? parsedFrequency : activeBand.frequency;
  const frameUrl = selected ? toSecureUrl(selected.url, frequencyMHz, mode) : null;
  const receiverUrl = selected ? (() => {
    try {
      const url = new URL(selected.url);
      url.searchParams.set('f', String(frequencyMHz * 1000) + mode);
      return url.toString();
    } catch { return selected.url; }
  })() : '';
  const supported = selected ? receiverSupports(selected, frequencyMHz) : false;

  const selectBand = (value: string) => {
    const index = Number(value);
    setBandIndex(index);
    setFrequency(bands[index].frequency.toFixed(3));
  };

  return <section className="my-4 min-w-0 overflow-hidden rounded-2xl border border-cyan-300 bg-slate-950 text-white shadow-sm" aria-label="LogBook SDR Smart">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center gap-3 bg-gradient-to-r from-slate-900 to-cyan-950 px-4 py-4 text-left">
      <span className="rounded-xl bg-cyan-300 p-2 text-slate-950"><Radio className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-base">SDR LogBook eQSL EXPRESS</strong><span className="block text-xs text-cyan-100">Receptores remotos · espectro y cascada en directo</span></span>
      <Waves className="h-5 w-5 text-cyan-200" />
    </button>
    {open && <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-cyan-100"><span>Banda</span><select value={bandIndex} onChange={event => selectBand(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">{bands.map((band, index) => <option key={band.label} value={index}>{band.label}</option>)}</select></label>
        <label className="flex items-center gap-2 text-xs text-cyan-100"><span>Modo</span><select value={mode} onChange={event => setMode(event.target.value)} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">{modes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-xs text-cyan-100">Frecuencia (MHz)
          <input inputMode="decimal" value={frequency} onChange={event => setFrequency(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base font-mono text-white" aria-label="Frecuencia en MHz" />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" onClick={() => { setManualList(value => !value); if (!receivers.length) void loadDirectory(); }} className="rounded-lg border border-cyan-500 px-3 py-2 text-sm font-semibold text-cyan-100">{manualList ? 'Ocultar lista' : 'Elegir receptor'}</button>
          <button type="button" onClick={() => void loadDirectory(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 flex-1 items-start gap-2 text-xs text-slate-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />{locationStatus}</p>
        {!location && <button type="button" onClick={requestLocation} className="rounded-lg border border-cyan-500 px-3 py-2 text-xs font-semibold text-cyan-100">Autoriza para el buen funcionamiento del SDR</button>}
      </div>
      <p role="status" className="text-xs text-slate-400">{directoryStatus}</p>
      {manualList && <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por receptor, ubicación o dirección…" className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white" aria-label="Buscar receptores SDR" />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {sortedReceivers.slice(0, 150).map(({ receiver, distance }) => <button type="button" key={receiver.id || receiver.url} onClick={() => { setSelectedId(receiver.id || receiver.url); setManualList(false); }} className={`w-full rounded-lg border px-3 py-2 text-left ${(receiver.id || receiver.url) === (selected?.id || selected?.url) ? 'border-cyan-300 bg-cyan-950' : 'border-slate-700 bg-slate-950 hover:bg-slate-800'}`}>
            <span className="block text-sm font-semibold text-white">{receiver.name || 'KiwiSDR'}</span>
            <span className="block text-xs text-slate-400">{receiver.loc || 'Ubicación no indicada'}{distance !== null ? ` · ${Math.round(distance)} km` : ''}</span>
            <span className="block text-[10px] text-slate-500">{receiver.users ?? '?'} / {receiver.users_max ?? '?'} oyentes · {receiver.grid || 'locator no indicado'}</span>
          </button>)}
          {sortedReceivers.length === 0 && <p className="p-3 text-sm text-slate-400">No hay resultados para esa búsqueda.</p>}
        </div>
      </div>}
      {selected ? <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2">
          <div className="min-w-0"><strong className="block truncate text-sm">{selected.name || 'KiwiSDR seleccionado'}</strong><span className="block text-xs text-slate-400">{selected.loc || selected.url}</span></div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${supported ? 'bg-emerald-900 text-emerald-200' : 'bg-amber-900 text-amber-200'}`}>{supported ? 'Banda dentro del rango publicado' : 'Banda fuera del rango publicado'}</span>
        </div>
        {frameUrl ? <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
          <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-3 py-2 text-xs text-slate-300"><span className="flex items-center gap-2"><Waves className="h-4 w-4 text-cyan-300" /> SDR en vivo · espectro/cascada del receptor</span><button type="button" onClick={() => setMutedHint(value => !value)} className="rounded-md border border-slate-600 px-2 py-1">{mutedHint ? 'Ocultar ayuda de audio' : 'Cómo silenciar audio'}</button></div>
          {mutedHint && <p className="border-b border-slate-700 bg-slate-900 p-3 text-xs text-cyan-100"><Volume2 className="mr-1 inline h-3.5 w-3.5" />Silenciá el audio con el control de volumen/mute del propio receptor: la cascada continuará. La app no fuerza el silencio del audio de una página externa.</p>}
          <iframe key={frameUrl} title={`Receptor SDR ${selected.name || ''}`} src={frameUrl} className="h-[65vh] min-h-[440px] w-full bg-black" loading="lazy" allow="autoplay; fullscreen" referrerPolicy="no-referrer" />
        </div> : <div className="rounded-xl border border-amber-700 bg-amber-950/50 p-4">
          <p className="text-sm font-semibold text-amber-100">Este receptor publica una dirección HTTP y no se puede incrustar con seguridad dentro de la app HTTPS.</p>
          <p className="mt-1 text-xs text-amber-200">Para evitar contenido mixto, abrilo directamente. La selección manual permite buscar otro receptor que admita HTTPS.</p>
          <a href={receiverUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-sm font-bold text-slate-950"><ExternalLink className="h-4 w-4" /> Abrir receptor SDR</a>
        </div>}
      </div> : <p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-300">Cargando receptores. Si el directorio no responde, podés consultar los directorios manuales de KiwiSDR, OpenWebRX+ y WebSDR.</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-800 pt-3 text-xs">
        <a href="https://rx.kiwisdr.com/" target="_blank" rel="noreferrer" className="text-cyan-200 underline">Directorio KiwiSDR</a>
        <a href="https://openwebrx.nl/map" target="_blank" rel="noreferrer" className="text-cyan-200 underline">Mapa OpenWebRX+</a>
        <a href="https://receiverbook.de/" target="_blank" rel="noreferrer" className="text-cyan-200 underline">ReceiverBook · OpenWebRX</a>
        <a href="https://www.websdr.org/" target="_blank" rel="noreferrer" className="text-cyan-200 underline">Directorio WebSDR</a>
      </div>
    </div>}
  </section>;
}
