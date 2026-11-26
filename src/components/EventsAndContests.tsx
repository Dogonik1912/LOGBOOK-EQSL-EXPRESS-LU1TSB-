import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Globe2, MapPin, ExternalLink, RadioTower, Trash2, Plus, Share2, ShieldCheck, ChevronDown } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { countryForCallsign, flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { resolveShareLanguage, translateShareText, type AppLanguage } from '../services/appLanguage';
import { ShareLanguageSelector } from './ShareLanguageSelector';

type StationType = 'ham' | '11m';
type EventScope = 'national' | 'international';
type EventKind = 'event' | 'contest';
type StationIdentity = { callsign: string; identity_type: StationType; is_primary?: boolean };
type RadioEvent = {
  id: string;
  title: string;
  description: string | null;
  event_scope: EventScope;
  event_kind: EventKind;
  station_type: StationType | 'both';
  country_code: string | null;
  country_name: string | null;
  organizer: string | null;
  start_at: string | null;
  end_at: string | null;
  rules_url: string | null;
  source_url: string | null;
  source_name: string | null;
  image_url: string | null;
  verified: boolean;
  is_auto: boolean;
};

const ZONA_TANGO_ID = 'zona-tango-permanent';
const ZONA_TANGO_SHARE_ID = '8d0d9c5a-5b3d-4b2e-9f61-5a4b8f6c2d10';
const ZONA_TANGO_EVENT: RadioEvent = {
  id: ZONA_TANGO_ID,
  title: 'Zona Tango – Radioaficionados de Jujuy',
  description: 'Fuente permanente de información radial de Jujuy: actividades, concursos, técnica, formación y novedades de radioafición.',
  event_scope: 'national',
  event_kind: 'event',
  station_type: 'both',
  country_code: 'AR',
  country_name: 'Argentina',
  organizer: 'Radioaficionados de Jujuy',
  start_at: null,
  end_at: null,
  rules_url: 'https://zonatango.wordpress.com/',
  source_url: 'https://zonatango.wordpress.com/',
  source_name: 'Zona Tango',
  image_url: null,
  verified: true,
  is_auto: false,
};

const COUNTRY_CODES: Record<string, string> = {
  Argentina:'AR',España:'ES',Canarias:'ES',Brasil:'BR',Chile:'CL',Uruguay:'UY',Colombia:'CO',Perú:'PE',Bolivia:'BO',Paraguay:'PY',
  Venezuela:'VE',Ecuador:'EC',México:'MX','Estados Unidos':'US',Canadá:'CA','Reino Unido':'GB',Italia:'IT',Francia:'FR',Alemania:'DE',
  Portugal:'PT',Australia:'AU','Nueva Zelanda':'NZ',Noruega:'NO',Dinamarca:'DK',Suecia:'SE',Finlandia:'FI',Grecia:'GR',Israel:'IL',
  China:'CN',India:'IN',Filipinas:'PH',Tailandia:'TH',Cuba:'CU',Panamá:'PA','Costa Rica':'CR','El Salvador':'SV',Guatemala:'GT',
  Honduras:'HN',Nicaragua:'NI',Jamaica:'JM',Escocia:'GB',Islandia:'IS',Suiza:'CH','Países Bajos':'NL',Serbia:'RS',Sudáfrica:'ZA',
  Austria:'AT',Bélgica:'BE',Polonia:'PL',Rumanía:'RO',Hungría:'HU',Chequia:'CZ',Eslovaquia:'SK',Croacia:'HR',Eslovenia:'SI',
  Rusia:'RU',Ucrania:'UA',Japón:'JP','Corea del Sur':'KR',Indonesia:'ID',Malasia:'MY',Singapur:'SG',Marruecos:'MA',Egipto:'EG',
  Nigeria:'NG',Ghana:'GH',Kenia:'KE',Namibia:'NA','Arabia Saudita':'SA','Emiratos Árabes Unidos':'AE',Turquía:'TR',Irlanda:'IE',
  Luxemburgo:'LU',Andorra:'AD',Malta:'MT',Gibraltar:'GI','Puerto Rico':'PR','República Dominicana':'DO',Haití:'HT','Guayana Francesa':'GF',
};

const countryCodeFromFlag = (flag: string) => {
  const letters = [...String(flag || '')]
    .map((character) => character.codePointAt(0) || 0)
    .filter((point) => point >= 0x1F1E6 && point <= 0x1F1FF)
    .map((point) => String.fromCharCode(point - 0x1F1E6 + 65));
  return letters.length >= 2 ? letters.slice(0, 2).join('') : '';
};

const countryCodeForCallsign = (callsign: string, type: StationType) => {
  const is11m = type === '11m';
  const name = countryForCallsign(callsign, '', is11m);
  return COUNTRY_CODES[name] || countryCodeFromFlag(flagForCallsign(callsign, '', is11m));
};

const countryLabel = (code: string) => {
  try { return new Intl.DisplayNames([navigator.language || 'es'], { type: 'region' }).of(code) || code; }
  catch { return code; }
};

const formatDate = (value: string | null) => {
  if (!value) return 'Fecha pendiente de publicación oficial';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha por confirmar';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
};
async function readApiPayload(response: Response, fallback: string): Promise<any> {
  const body = await response.text();
  if (!body.trim()) throw new Error(fallback);
  try {
    const payload = JSON.parse(body);
    if (payload && typeof payload === 'object') return payload;
  } catch { /* A Vercel HTML/text error page is not an API payload. */ }
  throw new Error(fallback);
}


export const EventsAndContests: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(() => new URLSearchParams(window.location.search).has('shared_event'));
  const [currentPage, setCurrentPage] = useState(1);
  const [identities, setIdentities] = useState<StationIdentity[]>([]);
  const [selectedType, setSelectedType] = useState<StationType>('ham');
  const [category, setCategory] = useState<EventScope>('national');
  const [selectedKind, setSelectedKind] = useState<EventKind>('event');
  const [homeCountry, setHomeCountry] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [shareLanguage, setShareLanguage] = useState<'auto' | AppLanguage>('auto');
  const [countries, setCountries] = useState<string[]>([]);
  const [events, setEvents] = useState<RadioEvent[]>([]);
  const [sharedEvent, setSharedEvent] = useState<RadioEvent | null>(null);
  const [sharedEventId, setSharedEventId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPublisher, setShowPublisher] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', event_scope: 'national' as EventScope, event_kind: 'event' as EventKind, station_type: 'ham' as StationType,
    country_code: '', organizer: '', start_at: '', end_at: '', rules_url: '', image_url: '',
  });

  const token = useMemo(() => {
    try { return localStorage.getItem('community_chat_identity_token') || ''; } catch { return ''; }
  }, []);
  const primaryCall = useMemo(() => {
    try { return (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase(); }
    catch { return ''; }
  }, []);
  const selectedIdentity = identities.find((identity) => identity.identity_type === selectedType) || identities[0];
  const selectedCall = selectedIdentity?.callsign || primaryCall;
  const countryName = countryForCallsign(selectedCall, '', selectedType === '11m');
  const inferredCountry = COUNTRY_CODES[countryName] || countryCodeFromFlag(flagForCallsign(selectedCall, '', selectedType === '11m'));
  const effectiveHomeCountry = homeCountry || inferredCountry;

  const loadIdentity = useCallback(async () => {
    const fallbackType: StationType = is11MeterStationIdentifier(primaryCall) ? '11m' : 'ham';
    if (!token || !supabase) {
      setIdentities(primaryCall ? [{ callsign: primaryCall, identity_type: fallbackType, is_primary: true }] : []);
      setSelectedType(fallbackType);
      const fallbackCountry = countryCodeForCallsign(primaryCall, fallbackType);
      setHomeCountry(fallbackCountry);
      setSelectedCountry(fallbackCountry);
      return;
    }
    try {
      const { data, error: identityError } = await supabase.rpc('community_account_identities', { p_token: token });
      if (identityError) throw identityError;
      const rows = (Array.isArray(data) ? data : []).filter((row: any) =>
        row && typeof row.callsign === 'string' && (row.identity_type === 'ham' || row.identity_type === '11m')
      ) as StationIdentity[];
      const normalized = rows.length ? rows : (primaryCall ? [{ callsign: primaryCall, identity_type: fallbackType, is_primary: true }] : []);
      setIdentities(normalized);
      const initial = normalized.find((item) => item.is_primary) || normalized[0];
      if (initial) {
        setSelectedType(initial.identity_type);
        const detected = countryCodeForCallsign(initial.callsign, initial.identity_type);
        setHomeCountry(detected);
        setSelectedCountry(detected);
        setForm((current) => ({ ...current, country_code: detected, station_type: initial.identity_type }));
      }
    } catch (identityError) {
      console.warn('[Eventos] No se pudo recuperar la identidad dual:', identityError);
      setIdentities(primaryCall ? [{ callsign: primaryCall, identity_type: fallbackType, is_primary: true }] : []);
      setSelectedType(fallbackType);
    }
  }, [primaryCall, token]);

  const loadEvents = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError('Validá tu identificación para consultar la agenda de la comunidad.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        category,
        event_kind: selectedKind,
        station_type: selectedType,
        country: category === 'national' ? (selectedCountry || effectiveHomeCountry) : selectedCountry,
      });
      const response = await fetch('/api/events?' + params.toString(), {
        headers: { 'x-identity-token': token, 'x-callsign': selectedCall },
        cache: 'no-store',
      });
      const payload = await readApiPayload(response, 'La agenda no está disponible temporalmente. Volvé a intentarlo.');
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo cargar la agenda.');
      const loadedEvents = Array.isArray(payload.events) ? payload.events as RadioEvent[] : [];
      const sharedMatchesFilters = Boolean(sharedEvent
        && sharedEvent.event_scope === category
        && sharedEvent.event_kind === selectedKind
        && (sharedEvent.station_type === selectedType || sharedEvent.station_type === 'both')
        && (category === 'international' || sharedEvent.country_code === (selectedCountry || effectiveHomeCountry)));
      setEvents(sharedMatchesFilters && sharedEvent && !loadedEvents.some((item) => item.id === sharedEvent.id)
        ? [sharedEvent, ...loadedEvents]
        : loadedEvents);
      setCountries(Array.isArray(payload.countries) ? payload.countries : []);
      setIsAdmin(payload.is_admin === true);
      setLastUpdated(payload.last_updated || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo consultar la agenda.');
    } finally {
      setLoading(false);
    }
  }, [category, effectiveHomeCountry, selectedCall, selectedCountry, selectedKind, selectedType, sharedEvent, token]);

  useEffect(() => { void loadIdentity(); }, [loadIdentity]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  useEffect(() => {
    const sharedToken = new URLSearchParams(window.location.search).get('shared_event');
    if (!sharedToken) return;
    let active = true;
    setIsExpanded(true);
    void (async () => {
      try {
        const response = await fetch('/api/events?share=' + encodeURIComponent(sharedToken) + '&format=json', { cache: 'no-store' });
        const payload = await readApiPayload(response, 'No se pudo recuperar el evento compartido.');
        if (!response.ok || !payload?.event) throw new Error(typeof payload?.error === 'string' ? payload.error : 'El evento compartido no está disponible.');
        if (!active) return;
        const item = payload.event as RadioEvent;
        setSharedEvent(item);
        setSharedEventId(item.id);
        setCategory(item.event_scope);
        setSelectedKind(item.event_kind);
        setSelectedType(item.station_type === '11m' ? '11m' : 'ham');
        setSelectedCountry(item.country_code || '');
      } catch (sharedError) {
        if (active) {
          setError(sharedError instanceof Error ? sharedError.message : 'No se pudo abrir el evento compartido.');
          setLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!sharedEventId || loading || !isExpanded) return;
    const target = document.getElementById('shared-event-' + sharedEventId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [events, sharedEventId, loading, isExpanded]);

  const changeIdentity = (type: StationType) => {
    const identity = identities.find((item) => item.identity_type === type);
    if (!identity) return;
    setSelectedType(type);
    const country = countryCodeForCallsign(identity.callsign, type);
    setHomeCountry(country);
    setSelectedCountry(category === 'national' ? country : '');
    setForm((current) => ({ ...current, station_type: type, country_code: country }));
  };

  const submitEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        country_code: form.event_scope === 'national' ? form.country_code : null,
      };
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-identity-token': token, 'x-callsign': selectedCall },
        body: JSON.stringify(body),
      });
      const payload = await readApiPayload(response, 'No se pudo publicar el evento en este momento.');
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo publicar el evento.');
      setShowPublisher(false);
      setForm((current) => ({ ...current, title: '', description: '', organizer: '', start_at: '', end_at: '', rules_url: '', image_url: '' }));
      await loadEvents();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo publicar el evento.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!token || !window.confirm('¿Borrar esta publicación? Esta acción es exclusiva de administración.')) return;
    try {
      const response = await fetch('/api/events?id=' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'x-identity-token': token, 'x-callsign': selectedCall },
      });
      const payload = await readApiPayload(response, 'No se pudo borrar el evento en este momento.');
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo borrar el evento.');
      setEvents((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo borrar el evento.');
    }
  };

  const shareEvent = async (item: RadioEvent) => {
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-identity-token': token, 'x-callsign': selectedCall },
        body: JSON.stringify({ action: 'share', id: item.id === ZONA_TANGO_ID ? ZONA_TANGO_SHARE_ID : item.id }),
        cache: 'no-store',
      });
      const payload = await readApiPayload(response, 'No se pudo preparar el enlace de la publicación en este momento.');
      if (!response.ok || !payload?.token) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo preparar el enlace de la publicación.');
      const language = resolveShareLanguage(shareLanguage);
      const urlObject = new URL('/', window.location.origin);
      urlObject.searchParams.set('shared_event', payload.token);
      urlObject.searchParams.set('lang', language);
      const url = urlObject.toString();
      const utcNote = item.source_url?.includes('rcqsl.com/news.php?id=62') ? 'Fechas expresadas en UTC, no hora local. El reglamento no especifica horas diarias de activación.' : '';
      const eventDate = item.start_at ? new Date(item.start_at) : null;
      const localizedDate = eventDate && !Number.isNaN(eventDate.getTime())
        ? eventDate.toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
        : 'Fecha pendiente de publicación oficial';
      const sourceText = [item.title, item.organizer, localizedDate, utcNote, 'Compartido desde LogBook eQSL EXPRESS'].filter(Boolean).join('\n');
      const [title, text] = await Promise.all([
        translateShareText(item.title, language),
        translateShareText(sourceText, language),
      ]);
      if (navigator.share) await navigator.share({ title, text, url });
      else { await navigator.clipboard.writeText([text, url].join('\n')); window.alert('Enlace de LogBook copiado para compartir.'); }
    } catch (shareError) {
      if ((shareError as Error)?.name !== 'AbortError') setError(shareError instanceof Error ? shareError.message : 'No se pudo compartir el evento desde este dispositivo.');
    }
  };

  const shareAgenda = async () => {
    const language = resolveShareLanguage(shareLanguage);
    const heading = (selectedKind === 'event' ? 'EVENTOS' : 'CONCURSOS') + ' · ' + (selectedType === '11m' ? '11 METROS' : 'RADIOAFICIONADO') + ' · ' + (category === 'national' ? 'NACIONAL' : 'INTERNACIONAL');
    const url = new URL('/', window.location.origin);
    url.searchParams.set('open_events', '1');
    url.searchParams.set('lang', language);
    url.searchParams.set('event_kind', selectedKind);
    url.searchParams.set('station_type', selectedType);
    url.searchParams.set('category', category);
    if (selectedCountry) url.searchParams.set('country', selectedCountry);
    const invitation = 'Consultá la agenda dentro de LogBook eQSL EXPRESS. Para acceder a las publicaciones y sus enlaces oficiales, ingresá o registrate en la aplicación.';
    const [translatedHeading, translatedInvitation] = await Promise.all([
      translateShareText(heading, language),
      translateShareText(invitation, language),
    ]);
    const message = [translatedHeading, translatedInvitation, url.toString()].join('\n\n');
    try {
      if (navigator.share) await navigator.share({ title: translatedHeading, text: message });
      else { await navigator.clipboard.writeText(message); window.alert('Agenda copiada para compartir.'); }
    } catch (shareError) {
      if ((shareError as Error)?.name !== 'AbortError') setError('No se pudo compartir la agenda desde este dispositivo.');
    }
  };

  const countryOptions = useMemo(() => {
    const values = new Set(countries);
    Object.values(COUNTRY_CODES).forEach((code) => values.add(code));
    if (effectiveHomeCountry) values.add(effectiveHomeCountry);
    return [...values].sort().map((code) => ({ code, label: countryLabel(code) }));
  }, [countries, effectiveHomeCountry]);
  const LU1AAS_EVENT_ID = '483f62c4-9e22-4f2d-89f6-2e773c1c3501';
  const priorityEvent = events.find((item) => item.id === LU1AAS_EVENT_ID);
  const showZonaTango = selectedType === 'ham'
    && category === 'national'
    && selectedKind === 'event'
    && (selectedCountry || effectiveHomeCountry) === 'AR';
  const displayEvents = [
    ...(showZonaTango ? [ZONA_TANGO_EVENT] : []),
    ...(priorityEvent ? [priorityEvent] : []),
    ...events.filter((item) => item.id !== LU1AAS_EVENT_ID && item.id !== ZONA_TANGO_ID),
  ];
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(displayEvents.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEvents = displayEvents.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [category, selectedKind, selectedType, selectedCountry]);

  useEffect(() => {
    if (!sharedEventId || loading || !isExpanded) return;
    const eventIndex = displayEvents.findIndex((item) => item.id === sharedEventId);
    if (eventIndex < 0) return;
    const targetPage = Math.floor(eventIndex / PAGE_SIZE) + 1;
    if (targetPage !== safeCurrentPage) { setCurrentPage(targetPage); return; }
    const target = document.getElementById('shared-event-' + sharedEventId);
    if (target) target.scrollIntoView(true);
  }, [displayEvents, sharedEventId, loading, isExpanded, safeCurrentPage]);

  return (
    <section className="mb-3">
      <button type="button" onClick={() => setIsExpanded((value) => !value)} aria-expanded={isExpanded} className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-between gap-1.5 rounded-lg border border-cyan-300 bg-gradient-to-r from-cyan-950 via-sky-900 to-blue-900 px-2 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300 sm:text-sm">
        <span className="inline-flex items-center gap-2"><CalendarDays className="h-5 w-5 shrink-0" /> EVENTOS Y CONCURSOS</span>
        <ChevronDown className={"h-4 w-4 shrink-0 transition-transform " + (isExpanded ? "rotate-180" : "")} />
      </button>
      {isExpanded && <div className="mt-2 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white shadow-lg">
      <div className="border-b border-white/10 bg-white/5 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-400/15 p-2 text-indigo-200"><CalendarDays className="h-6 w-6" /></span>
            <div>
              <h2 className="text-sm font-black tracking-wide sm:text-base">AGENDA DE LA COMUNIDAD</h2>
              <p className="text-xs text-indigo-100/75">Agenda de radioafición y 11 metros · información con fuentes</p>
            </div>
          </div>
          <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs font-bold text-emerald-100">
            <RadioTower className="h-4 w-4" /> Sincronización automática del servidor
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Categoría de eventos">
          <button type="button" onClick={() => { setCategory('national'); setSelectedCountry(homeCountry); }} aria-pressed={category === 'national'} className={`rounded-full px-4 py-2 text-sm font-black transition ${category === 'national' ? 'bg-amber-300 text-slate-950' : 'border border-white/20 bg-white/5 text-white'}`}>NACIONALES</button>
          <button type="button" onClick={() => { setCategory('international'); setSelectedCountry(''); }} aria-pressed={category === 'international'} className={`rounded-full px-4 py-2 text-sm font-black transition ${category === 'international' ? 'bg-amber-300 text-slate-950' : 'border border-white/20 bg-white/5 text-white'}`}>INTERNACIONALES</button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {identities.length > 1 && (
            <div className="flex gap-2 rounded-lg bg-black/20 p-1">
              <button type="button" onClick={() => changeIdentity('ham')} className={`flex-1 rounded-md px-3 py-2 text-xs font-bold ${selectedType === 'ham' ? 'bg-cyan-300 text-slate-950' : 'text-white'}`}>RADIOAFICIONADO</button>
              <button type="button" onClick={() => changeIdentity('11m')} className={`flex-1 rounded-md px-3 py-2 text-xs font-bold ${selectedType === '11m' ? 'bg-emerald-300 text-slate-950' : 'text-white'}`}>11 METROS</button>
            </div>
          )}
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3 text-xs">
            <MapPin className="h-4 w-4 shrink-0 text-amber-200" />
            <span className="whitespace-nowrap font-bold">País:</span>
            <select value={selectedCountry} onChange={(event) => setSelectedCountry(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none">
              {category === 'international' && <option value="" className="text-slate-900">Todos los países</option>}
              {countryOptions.map((country) => <option key={country.code} value={country.code} className="text-slate-900">{country.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-black/20 p-1" role="group" aria-label="Tipo de publicación">
          <button type="button" onClick={() => setSelectedKind('event')} aria-pressed={selectedKind === 'event'} className={`min-h-10 rounded-md px-2 py-2 text-xs font-black transition ${selectedKind === 'event' ? 'bg-amber-300 text-slate-950' : 'text-white hover:bg-white/10'}`}>EVENTOS</button>
          <button type="button" onClick={() => setSelectedKind('contest')} aria-pressed={selectedKind === 'contest'} className={`min-h-10 rounded-md px-2 py-2 text-xs font-black transition ${selectedKind === 'contest' ? 'bg-amber-300 text-slate-950' : 'text-white hover:bg-white/10'}`}>CONCURSOS</button>
        </div>
        <p className="mt-2 text-[11px] text-indigo-100/65">
          {selectedCall ? `Identificación: ${selectedCall} · ${selectedType === '11m' ? '11 metros' : 'Radioaficionado'}` : 'Identificación no disponible'}
          {homeCountry ? ` · País inicial: ${countryLabel(homeCountry)}` : ''}
        </p>
      </div>

      <div className="space-y-2 p-2 sm:p-3">
        <ShareLanguageSelector value={shareLanguage} onChange={setShareLanguage} label="Idioma para compartir eventos y agenda" />
        {error && <div className="rounded-lg border border-rose-300/40 bg-rose-950/50 px-3 py-2 text-sm text-rose-100" role="alert">{error}</div>}
        {!homeCountry && category === 'national' && <p className="rounded-lg border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">No pudimos asociar automáticamente un país a esta identificación. Elegí el país que querés consultar.</p>}
        {loading ? <div className="py-8 text-center text-sm text-indigo-100">Consultando eventos y concursos…</div>
          : <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {events.length === 0 && <div className="rounded-xl border border-dashed border-white/20 bg-black/15 px-4 py-5 text-center lg:col-span-2">
              <Globe2 className="mx-auto mb-2 h-7 w-7 text-indigo-200/70" />
              <p className="font-bold">Todavía no hay {selectedKind === 'event' ? 'eventos' : 'concursos'} confirmados para esta selección.</p>
              <p className="mt-1 text-xs text-indigo-100/65">Probá otro país o la agenda internacional. Las novedades se incorporan con las próximas actualizaciones automáticas.</p>
            </div>}
            {paginatedEvents.map((item) => (
              <article key={item.id} id={item.id === sharedEventId ? 'shared-event-' + item.id : undefined} className={"overflow-hidden rounded-lg border border-white/15 bg-white/[0.07] " + (item.id === sharedEventId ? 'ring-2 ring-amber-300 shadow-xl' : '')}>
                {item.image_url && <img src={item.image_url} alt="" loading="lazy" className="h-20 w-full object-cover" referrerPolicy="no-referrer" />}
                <div className="p-2">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-wide">
                    <span className="rounded-full bg-indigo-300/15 px-2 py-1 text-indigo-100">{item.event_scope === 'national' ? 'Nacional' : 'Internacional'}</span>
                    <span className="rounded-full bg-amber-300/15 px-2 py-1 text-amber-100">{item.id === ZONA_TANGO_ID ? 'Fuente permanente' : item.event_kind === 'contest' ? 'Concurso' : 'Evento'}</span>
                    <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-emerald-100">{item.station_type === '11m' ? '11 metros' : item.station_type === 'both' ? 'Ambas modalidades' : 'Radioafición'}</span>
                    {item.verified && <span className="inline-flex items-center gap-1 text-emerald-200"><ShieldCheck className="h-3 w-3" /> Fuente verificada</span>}
                  </div>
                  <h3 className="text-sm font-black leading-snug">{item.title}</h3>
                  {item.id !== ZONA_TANGO_ID && <p className="mt-1 text-xs text-amber-100"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{formatDate(item.start_at)}{item.end_at ? ` — ${formatDate(item.end_at)}` : ''}</p>}
                  {item.source_url?.includes('rcqsl.com/news.php?id=62') && <p className="mt-1 rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[11px] font-semibold text-amber-100">HORARIO DE REFERENCIA: UTC (Tiempo Universal Coordinado), no hora local. El reglamento oficial solo indica las fechas 11–27 de diciembre; no publica horas diarias de activación. Los límites 00:00 y 23:59 UTC representan los días completos.</p>}
                  {(item.country_name || item.country_code || item.organizer) && <p className="mt-1 text-xs text-indigo-100/80">{[item.organizer, item.country_name && item.country_name.length > 2 ? item.country_name : (item.country_code ? countryLabel(item.country_code) : '')].filter(Boolean).join(' · ')}</p>}
                  {item.description && <details className="mt-1 text-xs text-white/80"><summary className="cursor-pointer font-semibold text-cyan-200">Ver descripción y detalles</summary><p className="mt-1 whitespace-pre-line leading-relaxed">{item.description}</p><div className="mt-2 flex justify-end border-t border-white/10 pt-2"><button type="button" className="lb-disclosure-close" onClick={(event) => { const panel = event.currentTarget.closest('details'); if (panel) panel.open = false; }}>CERRAR</button></div></details>}
                  <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-white/10 pt-2 text-[11px] font-bold">
                    {item.id === ZONA_TANGO_ID
                      ? <a href="https://zonatango.wordpress.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-200 underline underline-offset-2">Ingresar a Zona Tango <ExternalLink className="h-3 w-3" /></a>
                      : (item.rules_url || item.source_url) && <a href={item.rules_url || item.source_url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-200 underline underline-offset-2">Bases / información oficial <ExternalLink className="h-3 w-3" /></a>}
                    <button type="button" onClick={() => void shareEvent(item)} className="inline-flex items-center gap-1 text-emerald-200"><Share2 className="h-3 w-3" /> Compartir</button>
                    {isAdmin && item.id !== ZONA_TANGO_ID && <button type="button" onClick={() => void deleteEvent(item.id)} className="inline-flex items-center gap-1 text-rose-200"><Trash2 className="h-3 w-3" /> Borrar</button>}
                  </div>
                  <p className="mt-1 text-[9px] text-indigo-100/55">Fuente: {item.source_name || 'Publicación de administración'}{item.is_auto ? ' · actualización automática' : ''}</p>
                </div>
              </article>
            ))}
          </div>}

        {!loading && displayEvents.length > PAGE_SIZE && <nav aria-label="Paginación de eventos y concursos" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
          <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage <= 1} className="min-h-9 rounded-md border border-white/20 px-3 font-bold text-white disabled:opacity-35">← Anterior</button>
          <label className="flex items-center gap-2 font-semibold text-indigo-100">Página
            <select value={safeCurrentPage} onChange={(event) => setCurrentPage(Number(event.target.value))} className="min-h-9 rounded-md border border-white/20 bg-slate-950 px-2 text-white">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <option key={page} value={page}>{page}</option>)}
            </select>
            <span>de {totalPages}</span>
          </label>
          <span className="text-indigo-100/65">{(safeCurrentPage - 1) * PAGE_SIZE + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, displayEvents.length)} de {displayEvents.length}</span>
          <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage >= totalPages} className="min-h-9 rounded-md border border-white/20 px-3 font-bold text-white disabled:opacity-35">Siguiente →</button>
        </nav>}

        {isAdmin && <div className="rounded-xl border border-amber-200/25 bg-amber-300/5">
          <button type="button" onClick={() => setShowPublisher((value) => !value)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-black text-amber-100">
            <Plus className="h-4 w-4" /> Publicar evento manualmente
          </button>
          {showPublisher && <form onSubmit={submitEvent} className="grid grid-cols-1 gap-2 border-t border-white/10 p-3 sm:grid-cols-2">
            <input required maxLength={220} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Nombre del evento o concurso" className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm sm:col-span-2" />
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descripción, bases resumidas y detalles" rows={3} className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm sm:col-span-2" />
            <select value={form.event_scope} onChange={(event) => setForm({ ...form, event_scope: event.target.value as EventScope })} className="rounded-lg bg-slate-950 px-3 py-2 text-sm"><option value="national">Nacional</option><option value="international">Internacional</option></select>
            <select value={form.event_kind} onChange={(event) => setForm({ ...form, event_kind: event.target.value as EventKind })} className="rounded-lg bg-slate-950 px-3 py-2 text-sm"><option value="event">Evento / Activación</option><option value="contest">Concurso</option></select>
            <select value={form.station_type} onChange={(event) => setForm({ ...form, station_type: event.target.value as StationType })} className="rounded-lg bg-slate-950 px-3 py-2 text-sm"><option value="ham">Radioaficionado</option><option value="11m">11 metros</option></select>
            {form.event_scope === 'national' && <input required maxLength={2} value={form.country_code} onChange={(event) => setForm({ ...form, country_code: event.target.value.toUpperCase() })} placeholder="País ISO (AR, ES, BR…)" className="rounded-lg bg-slate-950 px-3 py-2 text-sm" />}
            <input value={form.organizer} onChange={(event) => setForm({ ...form, organizer: event.target.value })} placeholder="Organizador" className="rounded-lg bg-slate-950 px-3 py-2 text-sm" />
            <label className="text-xs text-indigo-100">Inicio (hora local)<input type="datetime-local" value={form.start_at} onChange={(event) => setForm({ ...form, start_at: event.target.value })} className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-indigo-100">Finalización (hora local)<input type="datetime-local" value={form.end_at} onChange={(event) => setForm({ ...form, end_at: event.target.value })} className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm text-white" /></label>
            <input type="url" value={form.rules_url} onChange={(event) => setForm({ ...form, rules_url: event.target.value })} placeholder="Enlace a bases o web oficial" className="rounded-lg bg-slate-950 px-3 py-2 text-sm sm:col-span-2" />
            <input type="url" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder="Enlace a fotografía (opcional)" className="rounded-lg bg-slate-950 px-3 py-2 text-sm sm:col-span-2" />
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-amber-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50 sm:col-span-2">{saving ? 'Publicando…' : 'Publicar evento'}</button>
          </form>}
        </div>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] text-indigo-100/55">
          <span className="inline-flex items-center gap-1"><RadioTower className="h-3 w-3" /> Datos por servidor · no requiere abrir la app para actualizar</span>
          <span>{lastUpdated ? `Última actualización: ${new Date(lastUpdated).toLocaleString()}` : 'Actualización pendiente'}</span>
        </div>
        <div className="mt-3 flex flex-col-reverse gap-2 border-t border-white/10 pt-3 sm:flex-row">
          <button type="button" onClick={() => setIsExpanded(false)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-black text-white hover:bg-white/15">CERRAR</button>
          <button type="button" onClick={() => void shareAgenda()} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 text-xs font-black text-white shadow-sm hover:bg-emerald-600"><Share2 className="h-4 w-4" /> COMPARTIR AGENDA</button>
        </div>
      </div>
      </div>}
    </section>
  );
};
