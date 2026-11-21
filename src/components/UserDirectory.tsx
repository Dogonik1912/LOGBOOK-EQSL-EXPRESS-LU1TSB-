import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Mail, MessageCircle, RefreshCw, Search, Users, UserRound } from 'lucide-react';
import { countryForCallsign, flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type DirectoryCategory = 'ham' | '11m';
type DirectoryUser = { callsign: string; has_grid_locator?: boolean };
type DirectoryEntry = DirectoryUser & { country: string; flag: string };

const countryFor = (callsign: string, category: DirectoryCategory) =>
  countryForCallsign(callsign, undefined, category === '11m') || 'País no identificado';

export const UserDirectory: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<DirectoryCategory>('ham');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const loadDirectory = async (force = false) => {
    if (loading || (loaded && !force)) return;
    const token = (localStorage.getItem('community_chat_identity_token') || '').trim();
    if (!token) {
      setError('Primero tenés que validar tu indicativo en LOGBOOK para consultar el directorio.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/directory?action=lookup', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'x-identity-token': token },
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.users)) {
        throw new Error(result.error || 'No se pudo cargar el directorio de usuarios.');
      }
      const cleanUsers = result.users
        .map((item: unknown) => ({
          callsign: String((item as DirectoryUser)?.callsign || '').trim().toUpperCase(),
          has_grid_locator: (item as DirectoryUser)?.has_grid_locator === true,
        }))
        .filter((user: DirectoryUser) => !['DOGON1K', 'LU1TSB/4RC978', 'PRONTO', 'ERC001'].includes(user.callsign))
        .filter((user: DirectoryUser) => /^[A-Z0-9][A-Z0-9/]{2,39}$/.test(user.callsign))
        .filter((user: DirectoryUser, index: number, all: DirectoryUser[]) => all.findIndex((entry) => entry.callsign === user.callsign) === index);
      setUsers(cleanUsers);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el directorio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadDirectory();
  }, [open]);

  const entries = useMemo<DirectoryEntry[]>(() => users
    .filter((user) => category === '11m'
      ? is11MeterStationIdentifier(user.callsign)
      : !is11MeterStationIdentifier(user.callsign))
    .map((user) => ({
      ...user,
      country: countryFor(user.callsign, category),
      flag: flagForCallsign(user.callsign, undefined, category === '11m'),
    })), [users, category]);

  const normalizedQuery = query.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
  const filteredEntries = useMemo(() => entries
    .filter((entry) => !normalizedQuery || entry.callsign.startsWith(normalizedQuery))
    .sort((a, b) => a.country.localeCompare(b.country, 'es', { sensitivity: 'base' }) || a.callsign.localeCompare(b.callsign)),
  [entries, normalizedQuery]);

  const grouped = useMemo(() => {
    const result = new Map<string, DirectoryEntry[]>();
    filteredEntries.forEach((entry) => {
      const current = result.get(entry.country) || [];
      current.push(entry);
      result.set(entry.country, current);
    });
    return Array.from(result.entries()).sort((a, b) => {
      if (a[0] === 'País no identificado') return b[0] === 'País no identificado' ? 0 : 1;
      if (b[0] === 'País no identificado') return -1;
      return a[0].localeCompare(b[0], 'es', { sensitivity: 'base' });
    });
  }, [filteredEntries]);

  const exactMatch = normalizedQuery.length > 0
    ? entries.find((entry) => entry.callsign === normalizedQuery)
    : undefined;

  const startPrivateMessage = (callsign: string) => {
    window.dispatchEvent(new CustomEvent('open-private-message', { detail: { callsign } }));
  };

  return (
    <section className="w-full px-3 sm:px-6 lg:px-8 pb-5" aria-label="Directorio de usuarios">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-h-[56px] items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-800 px-4 py-3 text-center font-extrabold tracking-wide text-white shadow-md hover:bg-violet-900"
        aria-expanded={open}
      >
        <Users size={20} />
        DIRECTORIO DE USUARIOS
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-violet-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-slate-900">Directorio mundial</h2>
            <button type="button" onClick={() => void loadDirectory(true)} disabled={loading} className="rounded-lg border border-violet-200 p-2 text-violet-800 disabled:opacity-50" aria-label="Actualizar directorio">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { setCategory('ham'); setSelected(''); setQuery(''); }} className={'min-h-[52px] rounded-xl border px-3 py-3 text-sm font-extrabold ' + (category === 'ham' ? 'border-violet-700 bg-violet-800 text-white' : 'border-slate-300 bg-slate-100 text-slate-800')}>
              DIRECTORIO DE RADIOAFICIONADOS
            </button>
            <button type="button" onClick={() => { setCategory('11m'); setSelected(''); setQuery(''); }} className={'min-h-[52px] rounded-xl border px-3 py-3 text-sm font-extrabold ' + (category === '11m' ? 'border-violet-700 bg-violet-800 text-white' : 'border-slate-300 bg-slate-100 text-slate-800')}>
              DIRECTORIO 11 METROS
            </button>
          </div>

          <label htmlFor="logbook-user-directory-search" className="mb-1 block text-sm font-bold text-slate-700">{category === '11m' ? 'Buscar por SD de 11 metros' : 'Buscar por indicativo de radioaficionado'}</label>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2.5 focus-within:border-violet-600 focus-within:ring-2 focus-within:ring-violet-200">
            <Search size={19} className="shrink-0 text-violet-700" />
            <input
              key={category}
              id="logbook-user-directory-search"
              value={query}
              onChange={(event) => { setQuery(event.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, '')); setSelected(''); }}
              maxLength={40}
              autoComplete="off"
              placeholder={category === '11m' ? 'Ej.: 4RC978 o 34RC879' : 'Ej.: LU1TSB o EA1ABC'}
              className="min-w-0 w-full bg-transparent font-mono text-base font-bold uppercase tracking-wide text-slate-950 outline-none placeholder:font-normal placeholder:tracking-normal"
            />
            {query && <button type="button" onClick={() => { setQuery(''); setSelected(''); }} className="rounded-md px-2 py-1 text-xs font-bold text-violet-800">BORRAR</button>}
          </div>

          {loading && <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">Cargando todos los usuarios registrados y validados…</p>}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              {error}
              <button type="button" onClick={() => void loadDirectory(true)} className="ml-2 font-bold underline">Reintentar</button>
            </div>
          )}

          {!loading && !error && loaded && (
            <>
              {normalizedQuery && exactMatch && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
                  <CheckCircle2 size={18} /> {exactMatch.callsign} está registrado en este directorio.
                </div>
              )}
              {filteredEntries.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-950">
                  {normalizedQuery
                    ? normalizedQuery.length >= 3
                      ? <>No hay coincidencias. <strong>{normalizedQuery}</strong> todavía no figura registrado en este directorio.</>
                      : 'No hay coincidencias con las letras ingresadas todavía.'
                    : 'Todavía no hay usuarios registrados en esta categoría.'}
                </div>
              ) : (
                <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                  {grouped.map(([country, countryUsers]) => (
                    <div key={country} className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between gap-2 bg-slate-100 px-3 py-2">
                        <span className="flex items-center gap-2 font-extrabold text-slate-800"><span className="text-xl">{countryUsers[0].flag}</span>{country}</span>
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-900">{countryUsers.length}</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {countryUsers.map((entry) => (
                          <div key={entry.callsign} className="p-2">
                            <button type="button" onClick={() => setSelected((current) => current === entry.callsign ? '' : entry.callsign)} className={'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-sm font-black tracking-wide ' + (selected === entry.callsign ? 'bg-violet-100 text-violet-950' : 'text-slate-900 hover:bg-slate-50')}>
                              <span className="inline-flex min-w-0 items-center gap-2"><span>{entry.callsign}</span>{entry.has_grid_locator && <span aria-label="Tiene Grid Locator cargado" title="Tiene Grid Locator cargado" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />}</span>
                              <span className="text-xs font-sans font-semibold text-violet-700">{selected === entry.callsign ? 'Cerrar opción' : 'Ver opciones'}</span>
                            </button>
                            {selected === entry.callsign && (
                              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign: entry.callsign } }))} className="flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-800">
                                  <UserRound size={17} /> VER PERFIL
                                </button>
                                <button type="button" onClick={() => startPrivateMessage(entry.callsign)} disabled={entry.callsign === (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase()} className="flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-violet-800 px-3 py-2 text-sm font-bold text-white hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-50">
                                  <MessageCircle size={17} /> ENVIAR MENSAJE PRIVADO
                                </button>
                                <button type="button" onClick={() => {
                                  window.dispatchEvent(new CustomEvent('logbook-prefill-correspondent', { detail: { callsign: entry.callsign } }));
                                  setOpen(false);
                                  setSelected('');
                                }} className="flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800">
                                  <Mail size={17} /> ENVIAR eQSL
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button type="button" onClick={() => { setOpen(false); setSelected(''); }} className="mt-4 min-h-[48px] w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 font-extrabold text-slate-700 hover:bg-slate-200">
            CERRAR DIRECTORIO
          </button>
        </div>
      )}
    </section>
  );
};
