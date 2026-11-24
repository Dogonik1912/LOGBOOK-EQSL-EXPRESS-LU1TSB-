import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, RadioTower, Globe2 } from 'lucide-react';
import { get11mDivisionLookupEntries, getRadioPrefixLookupEntries } from '../services/callsignCountry';

type LookupMode = 'ham' | '11m';
type OpenLookupEvent = CustomEvent<{ mode?: LookupMode }>;

const normalize = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

export const openRadioPrefixLookup = (mode: LookupMode) => {
  window.dispatchEvent(new CustomEvent('open-radio-prefix-lookup', { detail: { mode } }));
};

export const RadioPrefixLookup: React.FC = () => {
  const [mode, setMode] = useState<LookupMode>('ham');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as OpenLookupEvent).detail;
      setMode(detail?.mode === '11m' ? '11m' : 'ham');
      setQuery('');
      setOpen(true);
    };
    window.addEventListener('open-radio-prefix-lookup', handleOpen);
    return () => window.removeEventListener('open-radio-prefix-lookup', handleOpen);
  }, []);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    if (mode === 'ham') {
      const entries = getRadioPrefixLookupEntries();
      const typed = query.trim();
      const upperTyped = typed.toUpperCase();
      const isPrefixSearch = /[0-9]/.test(upperTyped) || entries.some((entry) => entry.prefix === upperTyped);
      return entries.filter(({ prefix, country }) => {
        const normalizedPrefix = normalize(prefix);
        return isPrefixSearch
          ? normalizedPrefix.startsWith(needle) || needle.startsWith(normalizedPrefix)
          : normalize(country).includes(needle);
      }).slice(0, 80);
    }
    const entries = get11mDivisionLookupEntries();
    const numericSearch = /^\d{1,3}$/.test(query.trim());
    return entries.filter(({ division, country }) => numericSearch
      ? division === query.trim()
      : normalize(country).includes(needle)).slice(0, 100);
  }, [mode, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="radio-lookup-title" className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-cyan-400/60 bg-slate-950 text-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === 'ham' ? <RadioTower className="h-5 w-5 text-cyan-300" /> : <Globe2 className="h-5 w-5 text-emerald-300" />}
            <h2 id="radio-lookup-title" className="text-base font-bold">{mode === 'ham' ? 'Prefijos de radioaficionado' : 'Divisiones de 11 metros'}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar consulta" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid grid-cols-2 gap-2 p-3">
          <button type="button" onClick={() => { setMode('ham'); setQuery(''); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${mode === 'ham' ? 'border-cyan-400 bg-cyan-900 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>Radioafición</button>
          <button type="button" onClick={() => { setMode('11m'); setQuery(''); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${mode === '11m' ? 'border-emerald-400 bg-emerald-900 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>11 metros</button>
        </div>

        <div className="px-3 pb-3">
          <label htmlFor="radio-prefix-lookup-query" className="mb-1 block text-xs font-semibold text-slate-300">
            {mode === 'ham' ? 'Escribí un país o un prefijo (ej.: Argentina, LU, EA)' : 'Escribí un país, territorio o número de división (ej.: Canarias, 34, Hong Kong)'}
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 focus-within:border-cyan-400">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input id="radio-prefix-lookup-query" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === 'ham' ? 'País o prefijo…' : 'País, territorio o división…'} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500" />
            {query && <button type="button" onClick={() => setQuery('')} className="text-xs text-cyan-300">Borrar</button>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-800 px-3 py-2">
          {!query.trim() && <p className="py-8 text-center text-sm text-slate-400">Ingresá un país o identificador para consultar.</p>}
          {query.trim() && results.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No se encontraron coincidencias en la tabla disponible.</p>}
          {results.length > 0 && (
            <div className="space-y-1">
              {mode === 'ham' ? results.map((entry) => (
                <div key={entry.prefix} className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2">
                  <span className="font-mono text-base font-black tracking-wide text-cyan-300">{entry.prefix}</span>
                  <span className="text-right text-sm text-slate-100">{entry.country}</span>
                </div>
              )) : results.map((entry) => (
                <div key={entry.division} className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2">
                  <span className="min-w-12 rounded-md bg-emerald-900 px-2 py-1 text-center font-mono text-base font-black text-emerald-200">{entry.division}</span>
                  <span className="flex-1 text-right text-sm text-slate-100">{entry.country}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="border-t border-slate-800 px-4 py-2 text-[10px] leading-relaxed text-slate-400">
          {mode === 'ham'
            ? 'Prefijos de consulta de radioafición incluidos en la tabla de la aplicación. Las asignaciones pueden variar por territorio y prefijos especiales.'
            : 'Divisiones 11 m de uso habitual en la comunidad DX; no son una asignación oficial de la UIT. Algunas divisiones se repiten en territorios o entidades diferentes.'}
        </footer>
      </section>
    </div>
  );
};
