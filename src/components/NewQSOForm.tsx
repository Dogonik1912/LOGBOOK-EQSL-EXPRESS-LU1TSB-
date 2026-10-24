/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { QSO, HAM_BANDS, HAM_MODES } from '../types';
import { 
  PlusCircle, 
  Search, 
  Radio, 
  Clock, 
  Calendar, 
  User, 
  Globe, 
  Sparkles, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';

interface NewQSOFormProps {
  onAddQSO: (qso: QSO, openEQSL?: boolean) => void;
}

export const NewQSOForm: React.FC<NewQSOFormProps> = ({ onAddQSO }) => {
  const getNowUTC = () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    return {
      date: `${y}-${m}-${d}`,
      time: `${hh}:${mm}`,
    };
  };

  // PRIORIDAD 5: Cargar último QSO desde localStorage ('last_qso')
  const getLastQSOData = () => {
    const stored = localStorage.getItem('last_qso');
    const now = getNowUTC();
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          date: parsed.date || now.date,
          time: parsed.time || now.time,
          band: parsed.band || '40m',
          frequency: parsed.frequency || '7.120',
          mode: parsed.mode || 'SSB',
        };
      } catch (e) {
        console.error('Error parsing last_qso', e);
      }
    }
    return {
      date: now.date,
      time: now.time,
      band: '40m',
      frequency: '7.120',
      mode: 'SSB',
    };
  };

  const initial = getLastQSOData();

  // Campos que se mantienen precargados del último QSO
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [band, setBand] = useState(initial.band);
  const [frequency, setFrequency] = useState(initial.frequency);
  const [mode, setMode] = useState(initial.mode);

  // Campos que se limpian al guardar (corresponsal, RST enviada, RST recibida, y detalles)
  const [callsign, setCallsign] = useState('');
  const [cbStationCallsign, setCbStationCallsign] = useState(() => localStorage.getItem('cb_station_callsign') || '');
  const [hasSavedCbStationCallsign, setHasSavedCbStationCallsign] = useState(() => Boolean(localStorage.getItem('cb_station_callsign')?.trim()));
  const [showCbStationCallsignPrompt, setShowCbStationCallsignPrompt] = useState(false);
  const [rstSent, setRstSent] = useState('59');
  const [rstRcvd, setRstRcvd] = useState('59');
  const [exchangeSent, setExchangeSent] = useState('');
  const [exchangeReceived, setExchangeReceived] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappUsername, setWhatsappUsername] = useState('');
  const [telegram, setTelegram] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [country, setCountry] = useState('');
  const [grid, setGrid] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState('');


  const callsignInputRef = useRef<HTMLInputElement>(null);
  const lookupRequestId = useRef(0);

  // Sincronizar banda y frecuencia sugerida al cambiar banda
  const handleBandChange = (newBand: string) => {
    // Mostrar el aviso una sola vez: si el usuario sale de 11 metros sin guardar
    // una señal, no volver a interrumpirlo en futuras visitas a esa banda.
    if (band === '11 metros' && newBand !== '11 metros' && !hasSavedCbStationCallsign) {
      localStorage.setItem('cb_station_callsign_prompt_seen', 'true');
      setShowCbStationCallsignPrompt(false);
    }
    if (newBand === '11 metros' && !hasSavedCbStationCallsign && localStorage.getItem('cb_station_callsign_prompt_seen') !== 'true') {
      setShowCbStationCallsignPrompt(true);
    }
    setBand(newBand);
    const found = HAM_BANDS.find((b) => b.name === newBand);
    if (found) setFrequency(found.defaultFreq);

    // Al entrar en banda ciudadana, restaurar automáticamente sus parámetros propios.
    // La señal CB se mantiene separada del indicativo de radioaficionado.
    if (newBand === '11 metros') {
      setCbStationCallsign(localStorage.getItem('cb_station_callsign') || '');
      setRstSent('59');
      setRstRcvd('59');
    }
  };

  // Las señales RST se precargan siempre como 59, independientemente del modo.
  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    if (!rstSent.trim()) setRstSent('59');
    if (!rstRcvd.trim()) setRstRcvd('59');
  };

  const handleUpdateToCurrentUTC = () => {
    const now = getNowUTC();
    setDate(now.date);
    setTime(now.time);
  };

  // Libreta local: reutiliza correos y datos que el usuario ya guardó.
  const getContactBook = (): Record<string, any> => {
    try { return JSON.parse(localStorage.getItem('logbook_contacts') || '{}'); }
    catch { return {}; }
  };
  const saveContact = (call: string, data: Record<string, any>) => {
    const key = call.trim().toUpperCase();
    if (!key) return;
    const book = getContactBook();
    const previous = book[key] || {};
    const merged = { ...previous };
    Object.entries(data).forEach(([field, value]) => {
      if (typeof value === 'string' && value.trim()) merged[field] = value.trim();
    });
    merged.callsign = key;
    merged.updatedAt = new Date().toISOString();
    book[key] = merged;
    localStorage.setItem('logbook_contacts', JSON.stringify(book));
  };


  // Completar solo información de país por prefijo, sin consultar servicios externos.
  const applyPrefixDetails = async (cleanCall: string, requestId: number) => {
    if (!cleanCall || cleanCall.length < 3 || requestId !== lookupRequestId.current) return;
    const prefixes: Record<string, string> = {
      LU: 'Argentina', LW: 'Argentina', AY: 'Argentina', AZ: 'Argentina',
      EA: 'España', EB: 'España', EC: 'España', ED: 'España',
      PY: 'Brasil', PP: 'Brasil', PR: 'Brasil', PU: 'Brasil', PT: 'Brasil', PZ: 'Surinam',
      CX: 'Uruguay', CE: 'Chile', CA: 'Chile', CB: 'Chile', OA: 'Perú', CP: 'Bolivia',
      ZP: 'Paraguay', HK: 'Colombia', YV: 'Venezuela', HC: 'Ecuador', TG: 'Guatemala',
      TI: 'Costa Rica', HP: 'Panamá', HR: 'Honduras', YS: 'El Salvador', YN: 'Nicaragua',
      XE: 'México', W: 'Estados Unidos', K: 'Estados Unidos', N: 'Estados Unidos',
      VE: 'Canadá', VA: 'Canadá', G: 'Reino Unido', M: 'Reino Unido', F: 'Francia',
      DL: 'Alemania', I: 'Italia', JA: 'Japón', VK: 'Australia', ZL: 'Nueva Zelanda'
    };
    setCountry(prefixes[cleanCall.slice(0, 2)] || prefixes[cleanCall.slice(0, 1)] || '');
    setGrid('');
  };

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleCallsignChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setCallsign(upper);
    const requestId = ++lookupRequestId.current;
    // Do not keep contact data from the previous operator while a new lookup is running.
    setEmail('');
    setWhatsapp('');
    setWhatsappUsername('');
    setTelegram('');
    setLookupMessage('');
    setCountry('');
    setGrid('');
    // Buscar primero la libreta local. Si falta una ficha, recuperar los datos del historial de QSOs
    // guardado en este mismo navegador (por ejemplo, contactos usados en eQSL anteriores).
    const contactBook = getContactBook();
    let localContact = contactBook[upper];
    if (!localContact) {
      try {
        const savedQsos = JSON.parse(localStorage.getItem('logbook_qsos') || '[]');
        if (Array.isArray(savedQsos)) {
          const previousQso = [...savedQsos].reverse().find((q: any) =>
            String(q?.callsign || '').trim().toUpperCase() === upper &&
            (String(q?.email || '').trim() || String(q?.whatsapp || q?.whatsappRaw || '').trim())
          );
          if (previousQso) {
            localContact = {
              callsign: upper,
              email: String(previousQso.email || ''),
              whatsapp: String(previousQso.whatsapp || previousQso.whatsappRaw || ''),
              whatsappUsername: String(previousQso.whatsappUsername || ''),
              telegram: String(previousQso.telegram || ''),
              country: String(previousQso.country || ''),
              grid: String(previousQso.grid || ''),
            };
            saveContact(upper, localContact);
          }
        }
      } catch {
        // Si el historial no se puede leer, continuar con el directorio sin interrumpir el formulario.
      }
    }
    if (localContact) {
      setEmail(String(localContact.email || ''));
      setWhatsapp(String(localContact.whatsapp || localContact.whatsappRaw || ''));
      setWhatsappUsername(String(localContact.whatsappUsername || ''));
      setTelegram(String(localContact.telegram || ''));
      setCountry(String(localContact.country || ''));
      setGrid(String(localContact.grid || '').toUpperCase());
      setLookupMessage('Datos recuperados de la libreta o de un QSO anterior para ' + upper + '.');
    }
    if (!localContact && upper.length >= 3) {
      setLookupMessage('No hay datos guardados en este dispositivo para este indicativo. El directorio comunitario compartido aún no está disponible.');
    }

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    if (upper.length >= 3) {
      debounceTimeout.current = setTimeout(() => {
        applyPrefixDetails(upper, requestId);
      }, 500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldOpenEQSL = submitter?.value === 'send';
    setValidationError('');
    const cleanCall = callsign.trim().toUpperCase();
    const cleanCBStationCallsign = cbStationCallsign.trim().toUpperCase();
    const validCall = band === '11 metros' ? /^[A-Z0-9][A-Z0-9 /-]{0,19}$/.test(cleanCall) : /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/.test(cleanCall);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const normalizedFrequency = frequency.trim().replace(',', '.');
    const numericFrequency = Number(normalizedFrequency);
    const validFrequency = normalizedFrequency !== '' && Number.isFinite(numericFrequency) && numericFrequency > 0 && numericFrequency <= 100000;
    const validMode = HAM_MODES.includes(mode);
    const missing = [
      !validCall ? (band === '11 metros' ? 'identificador de estación de 11 metros' : 'indicativo válido') : '',
      band === '11 metros' && !cleanCBStationCallsign ? 'tu señal distintiva de 11 metros' : '',
      !validDate ? 'fecha válida' : '',
      !validTime ? 'hora válida en UTC' : '',
      !validFrequency ? 'frecuencia válida en MHz' : '',
      !validMode ? 'modo válido' : '',
    ].filter(Boolean);
    if (missing.length) {
      setValidationError('No se guardó el QSO ni se puede emitir la eQSL. Corregí: ' + missing.join(', ') + '.');
      if (!validCall) callsignInputRef.current?.focus();
      if (band === '11 metros' && !cleanCBStationCallsign) document.getElementById('cb-station-callsign')?.focus();
      return;
    }

    const newQSO: QSO = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      callsign: cleanCall,
      ...(band === '11 metros' ? { stationCallsign: cleanCBStationCallsign } : {}),
      date,
      time,
      band,
      frequency: normalizedFrequency,
      mode,
      rstSent: rstSent.trim() || '59',
      rstRcvd: rstRcvd.trim() || '59',
      exchangeSent: exchangeSent.trim(),
      exchangeReceived: exchangeReceived.trim(),
      email: email.trim(),
      whatsapp: whatsapp.trim(),
      whatsappRaw: whatsapp.trim(),
      whatsappUsername: whatsappUsername.trim().replace(/^@+/, '') || (/^@/.test(whatsapp.trim()) ? whatsapp.trim().replace(/^@+/, '') : ''),
      telegram: telegram.trim().replace(/^@+/, ''),
      name: '',
      country: country.trim(),
      grid: grid.trim().toUpperCase(),
      notes: notes.trim(),
      qslSent: false,
      qslRcvd: false,
    };

    if (band === '11 metros') {
      localStorage.setItem('cb_station_callsign', cleanCBStationCallsign);
      setHasSavedCbStationCallsign(true);
      setShowCbStationCallsignPrompt(false);
      localStorage.setItem('cb_station_callsign_prompt_seen', 'true');
    }

    // Recordar los datos del corresponsal para próximos QSOs, incluso si el correo fue pegado manualmente.
    saveContact(cleanCall, { email: email.trim(), whatsapp: whatsapp.trim(), whatsappUsername: whatsappUsername.trim().replace(/^@+/, '') || (/^@/.test(whatsapp.trim()) ? whatsapp.trim().replace(/^@+/, '') : ''), telegram: telegram.trim().replace(/^@+/, ''), country: country.trim(), grid: grid.trim().toUpperCase() });
// Se conserva en la libreta local sin publicar automáticamente datos privados en el directorio mundial.
    // La tarjeta eQSL recibe el canal elegido por el usuario cuando corresponde.
    onAddQSO(newQSO, shouldOpenEQSL);

    // PRIORIDAD 5: Guardar el último QSO en localStorage ('last_qso')
    // Manteniendo hora (UTC), fecha, banda, frecuencia, modo
    const lastQSOToPersist = {
      date,
      time,
      band,
      frequency,
      mode,
    };
    localStorage.setItem('last_qso', JSON.stringify(lastQSOToPersist));

    // Limpiar indicativo, RST, correo y detalles al guardar
    setCallsign('');
    setRstSent('59');
    setRstRcvd('59');
    setExchangeSent('');
    setExchangeReceived('');
    setEmail('');
    setWhatsapp('');
    setTelegram('');
    setLookupMessage('');
    setCountry('');
    setGrid('');
    setNotes('');

    // No abrir el teclado del móvil al pasar al editor de eQSL.
    // Solo volver al campo de indicativo cuando se guarda un QSO sin abrir la eQSL.
    if (shouldOpenEQSL) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
    } else {
      setTimeout(() => {
        callsignInputRef.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">
              Nuevo QSO Express
            </h2>
            <p className="text-xs text-slate-400">
              Registro separado de radioafición y banda ciudadana
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUpdateToCurrentUTC}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
            title="Sincronizar a hora UTC actual"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Hora UTC actual
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banda rápida selector */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          <span className="text-xs font-semibold text-slate-400 mr-1">Banda:</span>
          {HAM_BANDS.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => handleBandChange(b.name)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all cursor-pointer ${
                band === b.name
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {band === '11 metros' && showCbStationCallsignPrompt && !hasSavedCbStationCallsign && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
            <label htmlFor="cb-station-callsign" className="block text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1">
              Mi señal distintiva de 11 metros *
            </label>
            <input
              id="cb-station-callsign"
              type="text"
              value={cbStationCallsign}
              onChange={(e) => setCbStationCallsign(e.target.value.toUpperCase())}
              placeholder="Ej. Estación Sol, móvil 23 o tu señal CB"
              autoComplete="off"
              required
              maxLength={20}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              La primera vez la escribís vos. Quedará guardada en este dispositivo y aparecerá automáticamente en tus próximos QSO de 11 metros.
            </p>
          </div>
        )}

        {/* Fila 1: Indicativo corresponsal, RSTs, Email, WhatsApp */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Indicativo Corresponsal (Principal) */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              Corresponsal (Callsign) *
            </label>
            <div className="relative">
              <input
                ref={callsignInputRef}
                type="text"
                required
                value={callsign}
                onChange={(e) => handleCallsignChange(e.target.value)}
                placeholder={band === '11 metros' ? 'Ej. móvil 23, estación Sol' : 'ej. LU7YS, EA1EXP'}
                className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 rounded-xl text-lg font-mono font-black text-amber-300 uppercase tracking-widest placeholder:text-slate-600 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />

            </div>
          </div>

          {/* RST Enviada */}
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              RST E.
            </label>
            <input
              type="text"
              value={rstSent}
              onChange={(e) => setRstSent(e.target.value)}
              placeholder="59"
              className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-center font-bold text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          {/* RST Recibida */}
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              RST R.
            </label>
            <input
              type="text"
              value={rstRcvd}
              onChange={(e) => setRstRcvd(e.target.value)}
              placeholder="59"
              className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-center font-bold text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

        </div>

        {lookupMessage && <p role="status" className="text-[11px] text-sky-300">{lookupMessage}</p>}

        {validationError && <div role="alert" className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{validationError}</div>}

        {/* Fila 2: Fecha UTC, Hora UTC, Frecuencia, Modo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Fecha UTC <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => { setDate(e.target.value); setValidationError(''); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Hora UTC <span className="text-rose-500">*</span>
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => { setTime(e.target.value); setValidationError(''); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Frecuencia (MHz) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={frequency}
              onChange={(e) => { setFrequency(e.target.value); setValidationError(''); }}
              placeholder={band === '11 metros' ? '27.125' : '7.120'}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-amber-300 font-semibold focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Modo <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={mode}
              onChange={(e) => { handleModeChange(e.target.value); setValidationError(''); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            >
              {HAM_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fila 3: Opcionales (País y notas) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">País / Entidad DXCC</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Argentina"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Comentarios / Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dipolo 40m / 100W"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-amber-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Intercambios opcionales para concursos; no forman parte de la tarjeta eQSL. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Progresivo / intercambio enviado (opcional)</label>
            <input
              type="text"
              value={exchangeSent}
              onChange={(e) => setExchangeSent(e.target.value)}
              placeholder="Ej. 001, GF05, JUJUY"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-400 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Progresivo / intercambio recibido (opcional)</label>
            <input
              type="text"
              value={exchangeReceived}
              onChange={(e) => setExchangeReceived(e.target.value)}
              placeholder="Ej. 014, GF05, CORDOBA"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* El QSO se puede guardar solo o preparar la eQSL tras guardarlo. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2">
          <button
            type="submit"
            name="qsoAction"
            value="save"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
          >
            <PlusCircle className="w-4 h-4" />
            CARGAR QSO
          </button>
          <button
            type="submit"
            name="qsoAction"
            value="send"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            GUARDAR QSO Y ENVIAR eQSL
          </button>
        </div>
      </form>
    </div>
  );
};
