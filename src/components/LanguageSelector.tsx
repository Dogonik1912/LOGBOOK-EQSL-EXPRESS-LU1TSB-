import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { APP_LANGUAGES, AppLanguage } from '../services/appLanguage';

const NAMES: Record<AppLanguage, string> = { es:'Español', en:'English', pt:'Português', fr:'Français', de:'Deutsch', it:'Italiano', nl:'Nederlands', pl:'Polski', ru:'Русский', uk:'Українська', zh:'中文', ja:'日本語', ko:'한국어', ar:'العربية', hi:'हिन्दी', tr:'Türkçe', sv:'Svenska', no:'Norsk', da:'Dansk', fi:'Suomi', cs:'Čeština', el:'Ελληνικά', ro:'Română', hu:'Magyar', id:'Bahasa Indonesia' };
const FLAGS: Record<AppLanguage, string> = { es:'es', en:'gb', pt:'pt', fr:'fr', de:'de', it:'it', nl:'nl', pl:'pl', ru:'ru', uk:'ua', zh:'cn', ja:'jp', ko:'kr', ar:'sa', hi:'in', tr:'tr', sv:'se', no:'no', da:'dk', fi:'fi', cs:'cz', el:'gr', ro:'ro', hu:'hu', id:'id' };
interface Props { value: AppLanguage; onChange: (value: AppLanguage) => void; className?: string; label?: string; }

export const LanguageSelector: React.FC<Props> = ({ value, onChange, className = '', label = 'Idioma de la aplicación' }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const selected: AppLanguage = NAMES[value] ? value : 'es';
  const flag = (language: AppLanguage) => 'https://flagcdn.com/w40/' + FLAGS[language] + '.png';
  const Flag = ({ language }: { language: AppLanguage }) => <span className="inline-flex h-5 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-white/20 bg-slate-700"><img src={flag(language)} alt={FLAGS[language].toUpperCase()} loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /></span>;
  return <div ref={root} className={'relative ' + className} data-no-translate="true">
    <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md border-2 border-sky-400 bg-slate-950 px-2.5 py-2 text-left text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-sky-300 sm:text-sm">
      <Flag language={selected} /><span className="min-w-0 flex-1 truncate">{NAMES[selected]}</span><span className="shrink-0 text-[10px] text-sky-200">{selected.toUpperCase()}</span><ChevronDown className={'h-4 w-4 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} />
    </button>
    {open && <div role="listbox" aria-label={label} className="absolute right-0 top-full z-[80] mt-1 max-h-72 w-full min-w-52 overflow-y-auto rounded-lg border border-slate-600 bg-slate-950 p-1 shadow-2xl">
      {APP_LANGUAGES.map((language) => <button key={language} type="button" role="option" aria-selected={selected === language} onClick={() => { onChange(language); setOpen(false); }} className={'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white hover:bg-slate-800 ' + (selected === language ? 'bg-sky-900/70 ring-1 ring-sky-500' : '')}>
        <Flag language={language} /><span className="min-w-0 flex-1">{NAMES[language]}</span><span className="text-[10px] text-slate-400">{language.toUpperCase()}</span>
      </button>)}
    </div>}
  </div>;
};