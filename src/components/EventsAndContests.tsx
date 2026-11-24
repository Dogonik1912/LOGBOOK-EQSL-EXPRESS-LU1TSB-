import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Globe2, MapPin, RefreshCw, ExternalLink, RadioTower, Trash2, Plus, Share2, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { countryForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type StationType = 'ham' | '11m';
type EventScope = 'national' | 'international';
type StationIdentity = { callsign: string; identity_type: StationType; is_primary?: boolean };
type RadioEvent = {
  id: string;
  title: string;
  description: string | null;
  event_scope: EventScope;
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

const COUNTRY_CODES: Record<string, string> = {
  Argentina:'AR',España:'ES',Canarias:'ES',Brasil:'BR',Chile:'CL',Uruguay:'UY',Colombia:'CO',Perú:'PE',Bolivia:'BO',Paraguay:'PY',
  Venezuela:'VE',Ecuador:'EC',México:'MX','Estados Unidos':'US',Canadá:'CA','Reino Unido':'GB',Italia:'IT',Francia:'FR',Alemania:'DE',
  Portugal:'PT',Australia:'AU','Nueva Zelanda':'NZ',Noruega:'NO',Dinamarca:'DK',Suecia:'SE',Finlandia:'FI',Grecia:'GR',Israel:'IL',
  China:'CN',India:'IN',Filipinas:'PH',Tailandia:'TH',Cuba:'CU',Panamá:'PA','Costa Rica':'CR','El Salvador':'SV',Guatemala:'GT',
  Honduras:'HN',Nicaragua:'NI',Jamaica:'JM',Escocia:'GB',Islandia:'IS',Suiza:'CH','Países Bajos':'NL',Serbia:'RS',Sudáfrica:'ZA',
  Austria:'AT',Bélgica:'BE',Polonia:'PL',Rumanía:'RO',Hungría:'HU',Chequia:'CZ',Eslovaquia:'SK',Croacia:'HR',Eslovenia:'SI',
  Rusia:'RU',Ucrania:'UA',Japón:'JP','Corea del Sur':'KR',Indonesia:'ID',Malasia:'MY',Singapur:'SG',Marruecos:'MA',Egipto:'EG',
  Nigeria:'NG',Ghana:'GH',Kenia:'KE',Namibia:'NA','Arabia Saudita':'SA','Emiratos Árabes Unidos':'AE',Turquía:'TR',Irlanda:'IE',
  Luxemburgo:'LU',Andorra:'AD',Malta:'MT',Gibraltar:'GI',Puerto Rico:'PR','República Dominicana':'DO',Haití:'HT',Guayana Francesa:'GF',
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

export const EventsAndContests: React.FC = () => {
  const [identities, setIdentities] = useState<StationIdentity[]>([]);
  const [selectedType, setSelectedType] = useState<StationType>('ham');
  const [category, setCategory] = useState<EventScope>('national');
  const [homeCountry, setHomeCountry] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [events, setEvents] = useState<RadioEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPublisher, setShowPublisher] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', event_scope: 'national' as EventScope, station_type: 'ham' as StationType,
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
  const inferredCountry = COUNTRY_CODES[countryName] || '';
  const effectiveHomeCountry = homeCountry || inferredCountry || (() => {
    try { return (localStorage.getItem('user_country') || '').trim().toUpperCase(); } catch { return ''; }
  })();

  const loadIdentity = useCallback(async () => {
    const fallbackType: StationType = is11MeterStationIdentifier(primaryCall) ? '11m' : 'ham';
    if (!token || !supabase) {
      setIdentities(primaryCall ? [{ callsign: primaryCall, identity_type: fallbackType, is_primary: true }] : []);
      setSelectedType(fallbackType);
      const fallbackCountry = COUNTRY_CODES[countryForCallsign(primaryCall, '', fallbackType === '11m')] || '';
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
        const detected = COUNTRY_CODES[countryForCallsign(initial.callsign, '', initial.identity_type === '11m')] || '';
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
        station_type: selectedType,
        country: category === 'national' ? (selectedCountry || effectiveHomeCountry) : selectedCountry,
      });
      const response = await fetch('/api/events?' + params.toString(), {
        headers: { 'x-identity-token': token, 'x-callsign': selectedCall },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la agenda.');
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setCountries(Array.isArray(payload.countries) ? payload.countries : []);
      setIsAdmin(payload.is_admin === true);
      setLastUpdated(payload.last_updated || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo consultar la agenda.');
    } finally {
      setLoading(false);
    }
  }, [category, effectiveHomeCountry, selectedCall, selectedCountry, selectedType, token]);

  useEffect(() => { void loadIdentity(); }, [loadIdentity]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const handleRefresh = async () => {
    if (isAdmin && token) {
      setSyncing(true);
      setError('');
      try {
        const response = await fetch('/api/events-sync', { headers: { 'x-identity-token': token, 'x-callsign': selectedCall }, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'No se pudieron actualizar las fuentes.');
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : 'No se pudieron actualizar las fuentes.');
      } finally {
        setSyncing(false);
        await loadEvents();
      }
      return;
    }
    await loadEvents();
  };

  const changeIdentity = (type: StationType) => {
    const identity = identities.find((item) => item.identity_type === type);
    if (!identity) return;
    setSelectedType(type);
    const country = COUNTRY_CODES[countryForCallsign(identity.callsign, '', type === '11m')] || '';
    setHomeCountry(country);
    setSelectedCountry(country);
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'No se pudo publicar el evento.');
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'No se pudo borrar el evento.');
      setEvents((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo borrar el evento.');
    }
  };

  const shareEvent = async (item: RadioEvent) => {
    const url = item.rules_url || item.source_url || window.location.href;
    const text = [item.title, item.organizer, formatDate(item.start_at), url].filter(Boolean).join('\n');
    try {
      if (navigator.share) await navigator.share({ title: item.title, text, url });
      else { await navigator.clipboard.writeText(text); window.alert('Información del evento copiada.'); }
    } catch (shareError) {
      if ((shareError as Error)?.name !== 'AbortError') setError('No se pudo compartir el evento desde este dispositivo.');
    }
  };

  const countryOptions = useMemo(() => {
    const values = new Set(countries);
    if (effectiveHomeCountry) values.add(effectiveHomeCountry);
    return [...values].sort().map((code) => ({ code, label: countryLabel(code) }));
  }, [countries, effectiveHomeCountry]);

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white shadow-lg">
      <div className="border-b border-white/10 bg-white/5 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-400/15 p-2 text-indigo-200"><CalendarDays className="h-6 w-6" /></span>
            <div>
              <h2 className="text-lg font-black tracking-wide sm:text-xl">EVENTOS Y CONCURSOS</h2>
              <p className="text-xs text-indigo-100/75">Agenda de radioafición y 11 metros · información con fuentes</p>
            </div>
          </div>
          <button type="button" onClick={() => void handleRefresh()} disabled={loading || syncing} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-sm font-bold hover:bg-white/15 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Categoría de eventos">
          <button type="button" onClick={() => setCategory('national')} aria-pressed={category === 'national'} className={`rounded-full px-4 py-2 text-sm font-black transition ${category === 'national' ? 'bg-amber-300 text-slate-950' : 'border border-white/20 bg-white/5 text-white'}`}>NACIONALES</button>
          <button type="button" onClick={() => setCategory('international')} aria-pressed={category === 'international'} className={`rounded-full px-4 py-2 text-sm font-black transition ${category === 'international' ? 'bg-amber-300 text-slate-950' : 'border border-white/20 bg-white/5 text-white'}`}>INTERNACIONALES</button>
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
        <p className="mt-2 text-[11px] text-indigo-100/65">
          {selectedCall ? `Identificación: ${selectedCall} · ${selectedType === '11m' ? '11 metros' : 'Radioaficionado'}` : 'Identificación no disponible'}
          {homeCountry ? ` · País inicial: ${countryLabel(homeCountry)}` : ''}
        </p>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        {error && <div className="rounded-lg border border-rose-300/40 bg-rose-950/50 px-3 py-2 text-sm text-rose-100" role="alert">{error}</div>}
        {loading ? <div className="py-8 text-center text-sm text-indigo-100">Consultando eventos y concursos…</div>
          : events.length === 0 ? <div className="rounded-xl border border-dashed border-white/20 bg-black/15 px-4 py-8 text-center">
            <Globe2 className="mx-auto mb-2 h-8 w-8 text-indigo-200/70" />
            <p className="font-bold">Todavía no hay publicaciones para esta selección.</p>
            <p className="mt-1 text-xs text-indigo-100/65">Probá otro país o la agenda internacional. Las novedades se incorporan con las próximas actualizaciones automáticas.</p>
          </div>
          : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {events.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-xl border border-white/15 bg-white/[0.07]">
                {item.image_url && <img src={item.image_url} alt="" loading="lazy" className="h-40 w-full object-cover" referrerPolicy="no-referrer" />}
                <div className="p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wide">
                    <span className="rounded-full bg-indigo-300/15 px-2 py-1 text-indigo-100">{item.event_scope === 'national' ? 'Nacional' : 'Internacional'}</span>
                    <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-emerald-100">{item.station_type === '11m' ? '11 metros' : item.station_type === 'both' ? 'Ambas modalidades' : 'Radioafición'}</span>
                    {item.verified && <span className="inline-flex items-center gap-1 text-emerald-200"><ShieldCheck className="h-3 w-3" /> Fuente verificada</span>}
                  </div>
                  <h3 className="text-base font-black leading-snug">{item.title}</h3>
                  <p className="mt-1 text-xs text-amber-100"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{formatDate(item.start_at)}{item.end_at ? ` — ${formatDate(item.end_at)}` : ''}</p>
                  {(item.country_name || item.country_code || item.organizer) && <p className="mt-1 text-xs text-indigo-100/80">{[item.organizer, item.country_name && item.country_name.length > 2 ? item.country_name : (item.country_code ? countryLabel(item.country_code) : '')].filter(Boolean).join(' · ')}</p>}
                  {item.description && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/85">{item.description}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-xs font-bold">
                    {(item.rules_url || item.source_url) && <a href={item.rules_url || item.source_url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-200 underline underline-offset-2">Bases / información oficial <ExternalLink className="h-3 w-3" /></a>}
                    <button type="button" onClick={() => void shareEvent(item)} className="inline-flex items-center gap-1 text-emerald-200"><Share2 className="h-3 w-3" /> Compartir</button>
                    {isAdmin && <button type="button" onClick={() => void deleteEvent(item.id)} className="inline-flex items-center gap-1 text-rose-200"><Trash2 className="h-3 w-3" /> Borrar</button>}
                  </div>
                  <p className="mt-2 text-[10px] text-indigo-100/55">Fuente: {item.source_name || 'Publicación de administración'}{item.is_auto ? ' · actualización automática' : ''}</p>
                </div>
              </article>
            ))}
          </div>}

        {isAdmin && <div className="rounded-xl border border-amber-200/25 bg-amber-300/5">
          <button type="button" onClick={() => setShowPublisher((value) => !value)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-black text-amber-100">
            <Plus className="h-4 w-4" /> Publicar evento manualmente
          </button>
          {showPublisher && <form onSubmit={submitEvent} className="grid grid-cols-1 gap-2 border-t border-white/10 p-3 sm:grid-cols-2">
            <input required maxLength={220} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Nombre del evento o concurso" className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm sm:col-span-2" />
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descripción, bases resumidas y detalles" rows={3} className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm sm:col-span-2" />
            <select value={form.event_scope} onChange={(event) => setForm({ ...form, event_scope: event.target.value as EventScope })} className="rounded-lg bg-slate-950 px-3 py-2 text-sm"><option value="national">Nacional</option><option value="international">Internacional</option></select>
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
      </div>
    </section>
  );
};
