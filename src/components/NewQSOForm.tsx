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
  RefreshCw,
  ChevronDown
} from 'lucide-react';

interface NewQSOFormProps {
  onAddQSO: (qso: QSO, openEQSL?: boolean) => void;
  onFinishContest: (log: { id: string; name: string; type: string; finishedAt: string }) => boolean;
}

export const NewQSOForm: React.FC<NewQSOFormProps> = ({ onAddQSO, onFinishContest }) => {
  const formatDateTime = (date: Date, utc: boolean) => ({
    date: `${utc ? date.getUTCFullYear() : date.getFullYear()}-${String((utc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0')}-${String(utc ? date.getUTCDate() : date.getDate()).padStart(2, '0')}`,
    time: `${String(utc ? date.getUTCHours() : date.getHours()).padStart(2, '0')}:${String(utc ? date.getUTCMinutes() : date.getMinutes()).padStart(2, '0')}`,
  });
  const getNowUTC = () => formatDateTime(new Date(), true);
  const getNowLocal = () => formatDateTime(new Date(), false);
  const convertDateTime = (dateValue: string, timeValue: string, from: 'UTC' | 'LOCAL', to: 'UTC' | 'LOCAL') => {
    const [year, month, day] = dateValue.split('-').map(Number);
    const [hour, minute] = timeValue.split(':').map(Number);
    const instant = from === 'UTC'
      ? new Date(Date.UTC(year, month - 1, day, hour, minute))
      : new Date(year, month - 1, day, hour, minute);
    return formatDateTime(instant, to === 'UTC');
  };

  // PRIORIDAD 5: Cargar último QSO desde localStorage ('last_qso')
  const getLastQSOData = () => {
    const stored = localStorage.getItem('last_qso');
    const timeMode = localStorage.getItem('logbook_contest_time_mode') === 'LOCAL' ? 'LOCAL' : 'UTC';
    const now = timeMode === 'LOCAL' ? getNowLocal() : getNowUTC();
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          date: now.date,
          time: now.time,
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeMode, setTimeMode] = useState<'UTC' | 'LOCAL'>(() => localStorage.getItem('logbook_contest_time_mode') === 'LOCAL' ? 'LOCAL' : 'UTC');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const handleTimeModeChange = (nextMode: 'UTC' | 'LOCAL') => {
    if (nextMode === timeMode) return;
    const converted = convertDateTime(date, time, timeMode, nextMode);
    setDate(converted.date);
    setTime(converted.time);
    setTimeMode(nextMode);
    localStorage.setItem('logbook_contest_time_mode', nextMode);
  };
  // La banda seleccionada es temporal: cada nueva apertura comienza en 40 m,
  // aunque el último QSO guardado haya sido en 11 metros. Los datos del QSO
  // anterior siguen disponibles para fecha, hora y modo.
  const [band, setBand] = useState('40m');
  const [frequency, setFrequency] = useState(HAM_BANDS.find((b) => b.name === '40m')?.defaultFreq || '7.120');
  const [mode, setMode] = useState(initial.mode);

  // Campos que se limpian al guardar (corresponsal, RST enviada, RST recibida, y detalles)
  const [callsign, setCallsign] = useState('');
  const getRegisteredStationIdentity = () =>
    (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
  const isAmateurRadioCallsign = (value: string) =>
    /^[A-Z]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,8})?$/.test(value.trim().toUpperCase());
  const getSavedCbStationCallsign = () => {
    const saved = (localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
    if (saved) return saved;
    const registered = getRegisteredStationIdentity();
    // Si el usuario se registró directamente con una identificación CB (no un indicativo
    // de radioaficionado), esa misma identificación es su estación de 11 metros.
    return registered && !isAmateurRadioCallsign(registered) ? registered : '';
  };
  const [cbStationCallsign, setCbStationCallsign] = useState(() => getSavedCbStationCallsign());
  const [hasSavedCbStationCallsign, setHasSavedCbStationCallsign] = useState(() => Boolean(getSavedCbStationCallsign()));
  const [showCbStationCallsignPrompt, setShowCbStationCallsignPrompt] = useState(false);
  const [rstSent, setRstSent] = useState('59');
  const [rstRcvd, setRstRcvd] = useState('59');
  // El intercambio enviado es un valor preestablecido del operador: persiste entre QSOs y sesiones hasta cambiarlo manualmente.
  const [exchangeSent, setExchangeSent] = useState(() => localStorage.getItem('logbook_exchange_sent_default') || '');
  const [exchangeReceived, setExchangeReceived] = useState('');
  const [contestMode, setContestMode] = useState(() => localStorage.getItem('logbook_contest_active') === 'true');
  const [contestLogId, setContestLogId] = useState(() => localStorage.getItem('logbook_contest_id') || '');
  const [contestLogName, setContestLogName] = useState(() => localStorage.getItem('logbook_contest_name') || '');
  const [contestType, setContestType] = useState(() => localStorage.getItem('logbook_contest_type') || 'GENERIC');
  const [contestSetupOpen, setContestSetupOpen] = useState(false);
  const beginContest = () => {
    // El modo concurso solo puede cerrarse desde "Finalizar concurso y guardar log".
    // Nunca permitir que una segunda activación o un cambio accidental lo desactive.
    if (contestMode) return;
    const name = contestLogName.trim();
    if (!name) { setValidationError('Escribe un nombre para el log antes de activar el modo concurso.'); return; }
    const id = contestLogId || `contest-${Date.now()}`;
    setContestLogId(id);
    setContestLogName(name);
    setContestMode(true);
    setContestSetupOpen(false);
    localStorage.setItem('logbook_contest_active', 'true');
    localStorage.setItem('logbook_contest_id', id);
    localStorage.setItem('logbook_contest_name', name);
    localStorage.setItem('logbook_contest_type', contestType);
    setValidationError('');
  };
  const finishContest = () => {
    if (!contestMode || !contestLogName.trim()) return;
    const log = { id: contestLogId || `contest-${Date.now()}`, name: contestLogName.trim(), type: contestType, finishedAt: new Date().toISOString() };
    // El formulario solo cierra el concurso si App confirma que el log quedó archivado.
    const archived = onFinishContest(log);
    if (!archived) return;
    setContestMode(false);
    setContestSetupOpen(false);
    setContestLogId('');
    setContestLogName('');
    setContestType('GENERIC');
    // Conservar el progresivo/intercambio enviado preestablecido para el próximo concurso.
    setExchangeReceived('');
    localStorage.setItem('logbook_contest_active', 'false');
    localStorage.removeItem('logbook_contest_id');
    localStorage.removeItem('logbook_contest_name');
    localStorage.removeItem('logbook_contest_type');
    window.alert(`Concurso «${log.name}» finalizado. Encontrarás el log en QSO GUARDADOS para exportarlo.`);
  };
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappUsername, setWhatsappUsername] = useState('');
  const [telegram, setTelegram] = useState('');
  const [country, setCountry] = useState('');
  const [grid, setGrid] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState('');


  const callsignInputRef = useRef<HTMLInputElement>(null);
  const lookupRequestId = useRef(0);

  // Sincronizar banda y frecuencia sugerida al cambiar banda
  const handleBandChange = (newBand: string) => {
    setBand(newBand);
    const found = HAM_BANDS.find((b) => b.name === newBand);
    if (found) setFrequency(found.defaultFreq);

    // El campo CB solo se pide a quien tiene una SD de radioafición y aún no
    // guardó su identificación de 11 metros. Al cambiar de banda se oculta.
    if (newBand === '11 metros') {
      const savedCB = getSavedCbStationCallsign();
      if (savedCB) {
        setCbStationCallsign(savedCB);
        setHasSavedCbStationCallsign(true);
        localStorage.setItem('cb_station_callsign', savedCB);
        setShowCbStationCallsignPrompt(false);
      } else {
        setCbStationCallsign('');
        setShowCbStationCallsignPrompt(true);
      }
      setRstSent('59');
      setRstRcvd('59');
    } else {
      setShowCbStationCallsignPrompt(false);
    }
  };

  // Las señales RST se precargan siempre como 59, independientemente del modo.
  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    if (!rstSent.trim()) setRstSent('59');
    if (!rstRcvd.trim()) setRstRcvd('59');
  };

  const handleUpdateToCurrentUTC = () => {
    const now = timeMode === 'UTC' ? getNowUTC() : getNowLocal();
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

  const callsignKeyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCallsignChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setCallsign(upper);
    // En móvil, cerrar el teclado cuando la carga del indicativo se detiene.
    // Si el usuario continúa escribiendo, el temporizador se reinicia en cada tecla.
    if (callsignKeyboardTimer.current) clearTimeout(callsignKeyboardTimer.current);
    if (upper.length >= 3) {
      callsignKeyboardTimer.current = setTimeout(() => {
        const input = callsignInputRef.current;
        if (input && document.activeElement === input) input.blur();
      }, 1800);
    }
    const requestId = ++lookupRequestId.current;
    // Do not keep contact data from the previous operator while a new lookup is running.
    setEmail('');
    setWhatsapp('');
    setWhatsappUsername('');
    setTelegram('');
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
      band === '11 metros' && !cleanCBStationCallsign && !getSavedCbStationCallsign() ? 'tu señal distintiva de 11 metros' : '',
      !validDate ? 'fecha válida' : '',
      !validTime ? (timeMode === 'UTC' ? 'hora válida en UTC' : 'hora local válida') : '',
      !validFrequency ? 'frecuencia válida en MHz' : '',
      !validMode ? 'modo válido' : '',
    ].filter(Boolean);
    if (missing.length) {
      setValidationError('No se guardó el QSO ni se puede emitir la eQSL. Corregí: ' + missing.join(', ') + '.');
      if (!validCall) callsignInputRef.current?.focus();
      if (band === '11 metros' && !cleanCBStationCallsign) document.getElementById('cb-station-callsign')?.focus();
      return;
    }

    const qsoUtc = timeMode === 'UTC' ? { date, time } : convertDateTime(date, time, 'LOCAL', 'UTC');
    const newQSO: QSO = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      callsign: cleanCall,
      ...(band === '11 metros' ? { stationCallsign: cleanCBStationCallsign || getSavedCbStationCallsign() } : {}),
      date: qsoUtc.date,
      time: qsoUtc.time,
      band,
      frequency: normalizedFrequency,
      mode,
      rstSent: rstSent.trim() || '59',
      rstRcvd: rstRcvd.trim() || '59',
      exchangeSent: exchangeSent.trim(),
      exchangeReceived: exchangeReceived.trim(),
      ...(contestMode ? { contestLogId, contestLogName: contestLogName.trim(), contestType } : {}),
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
      const finalCBStationCallsign = cleanCBStationCallsign || getSavedCbStationCallsign();
      if (finalCBStationCallsign) {
        localStorage.setItem('cb_station_callsign', finalCBStationCallsign);
        // Vincular la identidad CB con la SD registrada en este dispositivo.
        const registeredSD = getRegisteredStationIdentity();
        if (registeredSD) localStorage.setItem('cb_station_linked_sd', registeredSD);
        setCbStationCallsign(finalCBStationCallsign);
        setHasSavedCbStationCallsign(true);
        setShowCbStationCallsignPrompt(false);
        localStorage.setItem('cb_station_callsign_prompt_seen', 'true');
      }
    }

    // Recordar los datos del corresponsal para próximos QSOs, incluso si el correo fue pegado manualmente.
    saveContact(cleanCall, { email: email.trim(), whatsapp: whatsapp.trim(), whatsappUsername: whatsappUsername.trim().replace(/^@+/, '') || (/^@/.test(whatsapp.trim()) ? whatsapp.trim().replace(/^@+/, '') : ''), telegram: telegram.trim().replace(/^@+/, ''), country: country.trim(), grid: grid.trim().toUpperCase() });
// Se conserva en la libreta local sin publicar automáticamente datos privados en el directorio mundial.
    // En móvil, cerrar el teclado ANTES de montar el editor de eQSL.
    // El navegador puede conservar el foco del campo anterior durante el cambio de pantalla.
    if (shouldOpenEQSL && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // La tarjeta eQSL recibe el canal elegido por el usuario cuando corresponde.
    onAddQSO(newQSO, shouldOpenEQSL);

    // PRIORIDAD 5: Guardar el último QSO en localStorage ('last_qso')
    // Manteniendo hora (UTC), fecha, banda, frecuencia, modo
    const lastQSOToPersist = {
      date: qsoUtc.date,
      time: qsoUtc.time,
      band,
      frequency,
      mode,
    };
    localStorage.setItem('last_qso', JSON.stringify(lastQSOToPersist));

    // Limpiar indicativo, RST, correo y detalles al guardar
    setCallsign('');
    setRstSent('59');
    setRstRcvd('59');
    // El enviado queda preestablecido hasta que el operador lo cambie manualmente.
    // El recibido corresponde a cada corresponsal y se limpia después de guardar.
    setExchangeReceived('');
    setEmail('');
    setWhatsapp('');
    setTelegram('');
    setCountry('');
    setGrid('');
    setNotes('');

    // Asegurar que el teclado siga cerrado después de que React monte el editor.
    // Se repite el blur tras el cambio de pantalla porque algunos navegadores móviles
    // restauran el foco del último campo durante el siguiente render.
    if (shouldOpenEQSL) {
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 180);
    } else {
      // Mantener el flujo rápido para cargar QSOs consecutivos sin abrir eQSL.
      window.setTimeout(() => {
        callsignInputRef.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl mb-6 overflow-hidden">
      <button type="button" onClick={() => setIsExpanded(open => !open)} aria-expanded={isExpanded} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-3 py-2.5 sm:px-4 text-left hover:bg-slate-800/70 transition-colors">
        <span className="flex items-center gap-3">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl"><Radio className="w-5 h-5" /></span>
          <span className="min-w-0 text-left">
            <span className="block text-base font-bold text-white tracking-wide">LIBRO DE GUARDIA</span>
            <span className="block text-xs text-slate-400">Registro separado de radioafición y banda ciudadana</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded && <div className="p-5 sm:p-6 pt-0">
      <div className="mb-3 rounded-xl border border-slate-700 bg-slate-950 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-300">HORARIO DEL LIBRO DE GUARDIA</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={timeMode === 'UTC'} onChange={() => handleTimeModeChange('UTC')} className="h-4 w-4 accent-amber-500" /> UTC
          </label>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={timeMode === 'LOCAL'} onChange={() => handleTimeModeChange('LOCAL')} className="h-4 w-4 accent-amber-500" /> Hora local
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Selecciona una sola opción. Los QSO se guardan internamente en UTC para mantener la compatibilidad de los registros y concursos.</p>
      </div>
      <div className="flex justify-end pb-3">
        <button type="button" onClick={handleUpdateToCurrentUTC} className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer" title="Sincronizar a hora UTC actual">
          <RefreshCw className="w-3.5 h-3.5" /> Hora UTC actual
        </button>
      </div>
      <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950 p-3 space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-white">
          <input type="checkbox" checked={contestMode || contestSetupOpen} onChange={(e) => {
            // Una vez activo, tocar la casilla no puede desactivar el concurso
            // ni abrir un diálogo que facilite perder el log por accidente.
            if (contestMode) return;
            if (e.target.checked) setContestSetupOpen(true);
            else setContestSetupOpen(false);
          }} className="h-4 w-4 accent-amber-500" />
          Activar modo concurso
        </label>
        {contestSetupOpen && !contestMode && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-800 p-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Nombre del log</label>
            <input value={contestLogName} onChange={(e) => { setContestLogName(e.target.value); localStorage.setItem('logbook_contest_name', e.target.value); }} placeholder="Ej. CQ WW SSB 2026" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Tipo / plantilla de concurso</label>
            <select value={contestType} onChange={(e) => { setContestType(e.target.value); localStorage.setItem('logbook_contest_type', e.target.value); }} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="GENERIC">Cabrillo genérico 3.0</option>
              <option value="CQ-WW">CQ World Wide DX</option>
              <option value="CQ-WPX">CQ WPX</option>
              <option value="ARRL-FIELD-DAY">ARRL Field Day</option>
              <option value="ARRL-SS">ARRL Sweepstakes</option>
              <option value="ADIF">ADIF</option>
              <option value="EDI">EDI (concursos VHF/UHF)</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="button" onClick={beginContest} disabled={!contestLogName.trim()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">Guardar y activar concurso</button>
          </div>
        </div>}
        {contestMode && <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs text-amber-300">Concurso activo: {contestLogName}. Los próximos QSO se vincularán a este log.</p>
          <button type="button" onClick={finishContest} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-bold text-white">Finalizar concurso y guardar log</button>
        </div>}
        {!contestMode && !contestSetupOpen && <p className="text-xs text-slate-400">Activa el modo para configurar el nombre y la plantilla del log de concurso.</p>}
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
              {b.name === '11 metros' ? '11' : b.name}
            </button>
          ))}
        </div>

        {band === '11 metros' && showCbStationCallsignPrompt && !hasSavedCbStationCallsign && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
            <label htmlFor="cb-station-callsign" className="block text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1">
              Mi señal distintiva de 11 metros (emisor) *
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
              Esta es la señal que aparecerá como emisora en tus eQSL y en tus QSO de 11 metros. Se guarda en este dispositivo.
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (callsignKeyboardTimer.current) clearTimeout(callsignKeyboardTimer.current);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
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

        {validationError && <div role="alert" className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{validationError}</div>}

        {/* Fila 2: Fecha UTC, Hora UTC, Frecuencia, Modo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Fecha {timeMode === 'UTC' ? 'UTC' : 'local'} <span className="text-rose-500">*</span>
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
              <Clock className="w-3 h-3" /> Hora {timeMode === 'UTC' ? 'UTC' : 'local'} <span className="text-rose-500">*</span>
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

        {/* Los datos adicionales se ocultan durante el concurso: quedan los datos esenciales y los dos intercambios. */}
        {!contestMode && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
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
        </div>}

        {/* Los progresivos solo se muestran al activar el modo concurso. */}
        {contestMode && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Progresivo / intercambio enviado (opcional)</label>
            <input
              type="text"
              value={exchangeSent}
              onChange={(e) => {
                setExchangeSent(e.target.value);
                localStorage.setItem('logbook_exchange_sent_default', e.target.value);
              }}
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
        </div>}

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
      <div className="flex justify-end mt-4 border-t border-slate-800 pt-4">
        <button type="button" onClick={() => setIsExpanded(false)} className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700 transition-colors">Cerrar</button>
      </div>
      </div>}
    </div>
  );
};
