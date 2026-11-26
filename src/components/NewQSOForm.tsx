/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { QSO, HAM_BANDS, HAM_MODES } from '../types';
import { loadLLOTAReferences, LLOTAReference } from '../services/llotaReferences';
import { supabase } from '../services/supabaseClient';
import { is11MeterStationIdentifier } from '../services/callsignCountry';
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
  onAddQSO: (qso: QSO, openEQSL?: boolean, publishSpot?: boolean, allowDuplicate?: boolean) => void;
  onFinishContest: (log: { id: string; name: string; type: string; finishedAt: string }) => boolean;
  onFinishLLOTA: (log: { id: string; name: string; reference: string; activityType: string; startedAt: string; finishedAt: string }) => boolean;
  hasDuplicateQSO: (qso: QSO) => boolean;
}

export const NewQSOForm: React.FC<NewQSOFormProps> = ({ onAddQSO, onFinishContest, onFinishLLOTA, hasDuplicateQSO }) => {
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
  const getInitialIdentityBand = () => is11MeterStationIdentifier(localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '') ? '11 metros' : '40m';
  const [band, setBand] = useState(getInitialIdentityBand);
  const [frequency, setFrequency] = useState(() => HAM_BANDS.find((b) => b.name === getInitialIdentityBand())?.defaultFreq || '7.120');
  const [mode, setMode] = useState(initial.mode);

  // Campos que se limpian al guardar (corresponsal, RST enviada, RST recibida, y detalles)
  const [callsign, setCallsign] = useState('');
  const getRegisteredStationIdentity = () =>
    (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
  const isAmateurRadioCallsign = (value: string) =>
    /^[A-Z0-9]{1,3}[0-9][A-Z]{1,7}(?:\/[A-Z0-9]{1,5})?$/.test(value.trim().toUpperCase());
  const getSavedCbStationCallsign = () => {
    const active = (localStorage.getItem('community_chat_active_callsign') || '').trim().toUpperCase();
    if (active && is11MeterStationIdentifier(active)) return active;
    const saved = (localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
    if (saved) return saved;
    const registered = getRegisteredStationIdentity();
    // Si el usuario se registró directamente con una identificación CB (no un indicativo
    // de radioaficionado), esa misma identificación es su estación de 11 metros.
    return registered && !isAmateurRadioCallsign(registered) ? registered : '';
  };
  const [cbStationCallsign, setCbStationCallsign] = useState(() => getSavedCbStationCallsign());
  const [hasSavedCbStationCallsign, setHasSavedCbStationCallsign] = useState(() => Boolean(getSavedCbStationCallsign()));
  useEffect(() => {
    const onIdentityChanged = (event: Event) => {
      if (callsign.trim()) return;
      const next = String((event as CustomEvent<{ callsign?: string }>).detail?.callsign || '').trim().toUpperCase();
      const nextBand = is11MeterStationIdentifier(next) ? '11 metros' : '40m';
      setBand(nextBand);
      setFrequency(HAM_BANDS.find((item) => item.name === nextBand)?.defaultFreq || '7.120');
      if (nextBand === '11 metros' && next) {
        setCbStationCallsign(next);
        setHasSavedCbStationCallsign(true);
      }
    };
    window.addEventListener('community-active-identity-changed', onIdentityChanged);
    return () => window.removeEventListener('community-active-identity-changed', onIdentityChanged);
  }, [callsign]);
  const [showCbStationCallsignPrompt, setShowCbStationCallsignPrompt] = useState(false);

  // Preload the already-linked 11m identity so the operator is not asked to type it again.
  useEffect(() => {
    let active = true;
    const syncLinked11mIdentity = async () => {
      const rootCallsign = getRegisteredStationIdentity();
      const identityToken = (localStorage.getItem('community_chat_identity_token') || '').trim();
      if (!supabase || !identityToken || !isAmateurRadioCallsign(rootCallsign)) return;
      const { data, error } = await supabase.rpc('community_account_identities', { p_token: identityToken });
      if (!active || error || !Array.isArray(data)) return;
      const linked = data.find((item: any) => item?.identity_type === '11m' && typeof item.callsign === 'string');
      if (!linked) return;
      const callsign11m = String(linked.callsign).trim().toUpperCase();
      localStorage.setItem('cb_station_callsign', callsign11m);
      setCbStationCallsign(callsign11m);
      setHasSavedCbStationCallsign(true);
      setShowCbStationCallsignPrompt(false);
    };
    void syncLinked11mIdentity();
    window.addEventListener('user-profile-updated', syncLinked11mIdentity);
    return () => {
      active = false;
      window.removeEventListener('user-profile-updated', syncLinked11mIdentity);
    };
  }, []);
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
  const [llotaReferences, setLLOTAReferences] = useState<LLOTAReference[]>([]);
  const [llotaLoading, setLLOTAloading] = useState(true);
  const [llotaLoadError, setLLOTAloadError] = useState('');
  const [llotaSearch, setLLOTAsearch] = useState('');
  const [selectedLLOTAReference, setSelectedLLOTAReference] = useState<(LLOTAReference & { activityId: string; startedAt: string }) | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('logbook_llota_selected_reference_v1') || 'null');
      return saved && typeof saved.code === 'string' && /^LL[A-Z]{2}-\d{4,5}$/i.test(saved.code)
        ? { code: saved.code.toUpperCase(), name: String(saved.name || ''), country: String(saved.country || ''), activityId: String(saved.activityId || `llota-${saved.code}-${Date.now()}`), startedAt: String(saved.startedAt || new Date().toISOString()) }
        : null;
    } catch { return null; }
  });
  // La referencia elegida es una preferencia persistente del operador: no se limpia al guardar QSO.
  useEffect(() => {
    try {
      if (selectedLLOTAReference) {
        localStorage.setItem('logbook_llota_selected_reference_v1', JSON.stringify(selectedLLOTAReference));
      } else {
        localStorage.removeItem('logbook_llota_selected_reference_v1');
      }
    } catch (error) {
      console.warn('No se pudo persistir la referencia LLOTA seleccionada:', error);
    }
  }, [selectedLLOTAReference]);
  useEffect(() => {
    let active = true;
    loadLLOTAReferences().then((references) => {
      if (!active) return;
      setLLOTAReferences(references);
      setLLOTAloadError('');
    }).catch((error) => {
      if (!active) return;
      console.warn('No se pudo cargar el catálogo oficial LLOTA:', error);
      setLLOTAloadError('No se pudo cargar el catálogo oficial. Comprobá tu conexión o consultá la página oficial.');
    }).finally(() => { if (active) setLLOTAloading(false); });
    return () => { active = false; };
  }, []);
  const [validationError, setValidationError] = useState('');
  const [recipientRegistration, setRecipientRegistration] = useState<'idle' | 'checking' | 'registered' | 'not_registered'>('idle');
  const recipientCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recipientCheckRequestId = useRef(0);

  const callsignInputRef = useRef<HTMLInputElement>(null);
  const checkRecipientRegistration = async (targetCallsign: string): Promise<boolean | null> => {
    const cleanTarget = targetCallsign.trim().toUpperCase();
    const token = (localStorage.getItem('community_chat_identity_token') || '').trim();
    if (!token || cleanTarget.length < 3) return null;
    try {
      const response = await fetch(`/api/directory?action=check&callsign=${encodeURIComponent(cleanTarget)}`, {
        method: 'GET', cache: 'no-store', headers: { 'x-identity-token': token },
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.registered === true;
    } catch {
      return null;
    }
  };

  // Acceso directo desde el Directorio: reutiliza este mismo formulario y sus vías de envío.
  useEffect(() => {
    const handleDirectoryEQSL = (event: Event) => {
      const detail = (event as CustomEvent<{ callsign?: string }>).detail;
      const targetCallsign = String(detail?.callsign || '').trim().toUpperCase();
      if (!targetCallsign) return;
      setIsExpanded(true);
      setCallsign(targetCallsign);
      setRecipientRegistration('checking');
      const recipientRequest = ++recipientCheckRequestId.current;
      void checkRecipientRegistration(targetCallsign).then((registered) => {
        if (recipientRequest === recipientCheckRequestId.current) {
          setRecipientRegistration(registered === null ? 'idle' : registered ? 'registered' : 'not_registered');
        }
      });
      setValidationError('');
      setEmail('');
      setWhatsapp('');
      setWhatsappUsername('');
      setTelegram('');
      setCountry('');
      setGrid('');
      const requestId = ++lookupRequestId.current;
      const contactBook = getContactBook();
      const contact = contactBook[targetCallsign];
      if (contact) {
        setEmail(String(contact.email || ''));
        setWhatsapp(String(contact.whatsapp || contact.whatsappRaw || ''));
        setWhatsappUsername(String(contact.whatsappUsername || ''));
        setTelegram(String(contact.telegram || ''));
        setCountry(String(contact.country || ''));
        setGrid(String(contact.grid || '').toUpperCase());
      }
      void applyPrefixDetails(targetCallsign, requestId);
      window.setTimeout(() => {
        const formElement = callsignInputRef.current;
        formElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        formElement?.focus({ preventScroll: true });
      }, 120);
    };
    window.addEventListener('logbook-prefill-correspondent', handleDirectoryEQSL);
    return () => window.removeEventListener('logbook-prefill-correspondent', handleDirectoryEQSL);
  }, []);
  const lookupRequestId = useRef(0);

  // Sincronizar banda y frecuencia sugerida al cambiar banda
  const handleBandChange = (newBand: string) => {
    setBand(newBand);
    const found = HAM_BANDS.find((b) => b.name === newBand);
    if (found) setFrequency(found.defaultFreq);

    // El campo CB solo se pide a quien tiene una SD de radioafición y aún no
    // guardó su identificación de 11 metros. Al cambiar de banda se oculta.
    if (newBand === '11 metros') {
      // La referencia LLOTA queda guardada aunque el formulario oculte el selector en 11 metros.
      setLLOTAsearch('');
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
    setRecipientRegistration(upper.length >= 3 ? 'checking' : 'idle');
    const recipientRequest = ++recipientCheckRequestId.current;
    if (recipientCheckTimer.current) clearTimeout(recipientCheckTimer.current);
    if (upper.length >= 3) {
      recipientCheckTimer.current = setTimeout(() => {
        void checkRecipientRegistration(upper).then((registered) => {
          if (recipientRequest === recipientCheckRequestId.current) {
            setRecipientRegistration(registered === null ? 'idle' : registered ? 'registered' : 'not_registered');
          }
        });
      }, 450);
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldOpenEQSL = submitter?.value === 'send';
    setValidationError('');
    const cleanCall = callsign.trim().toUpperCase();
    const cleanCBStationCallsign = cbStationCallsign.trim().toUpperCase();
    const validCall = band === '11 metros'
      ? /^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$/.test(cleanCall)
      : isAmateurRadioCallsign(cleanCall);
    const validStation11m = band !== '11 metros' || /^\d{1,3}[A-Z]{1,4}\d{1,4}$/.test(cleanCBStationCallsign || getSavedCbStationCallsign());
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const normalizedFrequency = frequency.trim().replace(',', '.');
    const numericFrequency = Number(normalizedFrequency);
    const validFrequency = normalizedFrequency !== '' && Number.isFinite(numericFrequency) && numericFrequency > 0 && numericFrequency <= 100000;
    const is11mFrequency = Number.isFinite(numericFrequency) && numericFrequency >= 26.965 && numericFrequency <= 27.999;
    const validBandFrequency = band === '11 metros' ? is11mFrequency : !is11mFrequency;
    const validMode = HAM_MODES.includes(mode);
    const missing = [
      !validCall ? (band === '11 metros' ? 'identificador de estación de 11 metros' : 'indicativo válido') : '',
      band === '11 metros' && !cleanCBStationCallsign && !getSavedCbStationCallsign() ? 'tu señal distintiva de 11 metros' : '',
      !validStation11m ? 'una SD válida de 11 metros (división, letras y números)' : '',
      !validDate ? 'fecha válida' : '',
      !validTime ? (timeMode === 'UTC' ? 'hora válida en UTC' : 'hora local válida') : '',
      !validFrequency ? 'frecuencia válida en MHz' : '',
      !validBandFrequency ? (band === '11 metros' ? 'frecuencia entre 26.965 y 27.999 MHz para 11 metros' : 'una frecuencia que corresponda a la banda seleccionada') : '',
      !validMode ? 'modo válido' : '',
    ].filter(Boolean);
    if (missing.length) {
      setValidationError('No se guardó el QSO ni se puede emitir la eQSL. Corregí: ' + missing.join(', ') + '.');
      if (!validCall) callsignInputRef.current?.focus();
      if (band === '11 metros' && !cleanCBStationCallsign) document.getElementById('cb-station-callsign')?.focus();
      return;
    }

    if (band === '11 metros') {
      const station11m = (cleanCBStationCallsign || getSavedCbStationCallsign()).trim().toUpperCase();
      const rootCallsign = getRegisteredStationIdentity();
      if (station11m) {
        localStorage.setItem('cb_station_callsign', station11m);
        if (rootCallsign && isAmateurRadioCallsign(rootCallsign)) {
          if (!supabase) {
            setValidationError('No se pudo vincular la SD de 11 metros porque no hay conexión con Supabase. El QSO no se guardó.');
            return;
          }
          const identityToken = (localStorage.getItem('community_chat_identity_token') || '').trim();
          const { data, error } = await supabase.rpc('link_community_account_identity', {
            p_primary_callsign: rootCallsign,
            p_token: identityToken,
            p_secondary_callsign: station11m,
          });
          if (error || !data?.ok) {
            const reason = String(data?.reason || '');
            setValidationError(reason === 'taken'
              ? 'Esa SD de 11 metros ya está registrada por otra cuenta.'
              : reason === '11m_identity_already_linked'
                ? 'Esta cuenta ya tiene otra identidad de 11 metros vinculada.'
                : 'No se pudo validar y vincular tu SD de 11 metros. No se guardó el QSO.');
            return;
          }
          localStorage.setItem('community_chat_active_callsign', station11m);
          window.dispatchEvent(new CustomEvent('community-active-identity-changed', { detail: { callsign: station11m } }));
          window.dispatchEvent(new Event('user-profile-updated'));
        }
      }
    }

    let recipientRegistered = false;
    if (shouldOpenEQSL) {
      const confirmedRegistration = await checkRecipientRegistration(cleanCall);
      recipientRegistered = confirmedRegistration === true;
      setRecipientRegistration(confirmedRegistration === null ? 'idle' : confirmedRegistration ? 'registered' : 'not_registered');
    }

    const qsoUtc = timeMode === 'UTC' ? { date, time } : convertDateTime(date, time, 'LOCAL', 'UTC');
    const newQSO: QSO & { recipientRegistered?: boolean } = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      callsign: cleanCall,
      recipientRegistered,
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
      ...(selectedLLOTAReference ? { llotaReference: selectedLLOTAReference.code, llotaReferenceName: selectedLLOTAReference.name, llotaActivityId: selectedLLOTAReference.activityId, llotaActivityType: 'LLOTA' } : {}),
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

    const duplicateLLOTA = Boolean(selectedLLOTAReference && hasDuplicateQSO(newQSO));
    const allowDuplicate = duplicateLLOTA ? window.confirm(`Este contacto ya figura en el log LLOTA ${selectedLLOTAReference?.code}. ¿Querés guardarlo igualmente como un nuevo registro?`) : false;
    if (duplicateLLOTA && !allowDuplicate) return;
    // La tarjeta eQSL recibe el canal elegido por el usuario cuando corresponde.
    onAddQSO(newQSO, shouldOpenEQSL, true, allowDuplicate);

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
    setRecipientRegistration('idle');
    recipientCheckRequestId.current += 1;
    if (recipientCheckTimer.current) clearTimeout(recipientCheckTimer.current);
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
    // La referencia seleccionada permanece activa para el siguiente QSO.
    setLLOTAsearch('');

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

  // Si el operador pega o escribe el código completo, reconocerlo directamente
  // contra el catálogo oficial ya cargado, sin exigir que toque una sugerencia.
  const handleLLOTAReferenceInput = (value: string) => {
    const normalized = value.trim().toUpperCase().replace(/\\s+/g, '');
    setLLOTAsearch(value.toUpperCase());
    if (!/^LL[A-Z]{2}-\\d{4,5}$/.test(normalized)) return;
    const official = llotaReferences.find((item) => item.code.trim().toUpperCase() === normalized);
    if (!official) return;
    setSelectedLLOTAReference({
      ...official,
      activityId: `llota-${official.code}-${Date.now()}`,
      startedAt: new Date().toISOString(),
    });
    setLLOTAsearch('');
  };

  const filteredLLOTAReferences = llotaSearch.trim().length >= 2
    ? llotaReferences.filter((item) => `${item.code} ${item.name} ${item.country}`.toLocaleLowerCase().includes(llotaSearch.trim().toLocaleLowerCase())).slice(0, 25)
    : [];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl mb-6 overflow-hidden">
      <button type="button" onClick={() => setIsExpanded(open => !open)} aria-expanded={isExpanded} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-3 py-2.5 sm:px-4 text-left hover:bg-slate-800/70 transition-colors">
        <span className="flex items-center gap-3">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl"><Radio className="w-5 h-5" /></span>
          <span className="min-w-0 text-left">
            <span className="block text-base font-bold text-white tracking-wide">LIBRO DE GUARDIA</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded && <div className="p-5 sm:p-6 pt-0">
      <div className="mb-3 rounded-xl border border-slate-700 bg-slate-950 p-3">
        <div className="flex flex-nowrap items-center gap-4">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-white cursor-pointer">
            <input type="checkbox" checked={timeMode === 'LOCAL'} onChange={() => handleTimeModeChange('LOCAL')} className="h-4 w-4 accent-amber-500" /> LOCAL
          </label>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-white cursor-pointer">
            <input type="checkbox" checked={timeMode === 'UTC'} onChange={() => handleTimeModeChange('UTC')} className="h-4 w-4 accent-amber-500" /> UTC
          </label>
        </div>
      </div>
      <div className="flex justify-end pb-3">
        <button type="button" onClick={handleUpdateToCurrentUTC} className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer" title="Sincronizar a hora UTC actual">
          <RefreshCw className="w-3.5 h-3.5" /> Hora UTC actual
        </button>
      </div>
      <details className="mb-4 rounded-xl border border-slate-700 bg-slate-950 p-3 space-y-3" open={contestSetupOpen || contestMode} onToggle={(e) => { if (!contestMode) setContestSetupOpen((e.currentTarget as HTMLDetailsElement).open); }}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-white">Modo concurso {contestMode ? `· Activo: ${contestLogName}` : ' - Configurar log'}</summary>
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
        {!contestMode && !contestSetupOpen && <p className="text-xs text-slate-400">Abrí este apartado para configurar el log de concurso.</p>}
        {!contestMode && <div className="flex justify-end border-t border-slate-800 pt-3"><button type="button" className="lb-disclosure-close" onClick={(event) => { const panel = event.currentTarget.closest('details'); if (panel) panel.open = false; setContestSetupOpen(false); }}>CERRAR</button></div>}
      </details>
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
              {b.name === '11 metros' ? '11m' : b.name}
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
              {recipientRegistration === 'registered' && <p className="mt-1 text-[11px] font-semibold text-emerald-400">Usuario registrado en la app</p>}
              {recipientRegistration === 'not_registered' && <p className="mt-1 text-[11px] font-semibold text-rose-400">Usuario no registrado en la app</p>}
              {recipientRegistration === 'checking' && <p className="mt-1 text-[10px] text-slate-400">Comprobando registro…</p>}
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

        {band !== '11 metros' && <details className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-2" open={Boolean(selectedLLOTAReference)}>
        <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wider text-teal-200">Actividad LLOTA {selectedLLOTAReference ? `· ${selectedLLOTAReference.code}` : '· Opcional'}</summary>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-teal-200">Seleccioná una referencia oficial para iniciar la actividad.</span>
            <a href="https://llota.app/referencias.html" target="_blank" rel="noreferrer" className="text-[11px] text-teal-300 underline">Catálogo oficial</a>
          </div>
          {selectedLLOTAReference ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-400/40 bg-slate-950 px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold text-teal-200">{selectedLLOTAReference.code}</div>
                <div className="text-xs text-slate-300">{selectedLLOTAReference.name}{selectedLLOTAReference.country ? ` · ${selectedLLOTAReference.country}` : ''}</div>
              </div>
              <button type="button" onClick={() => { const active = selectedLLOTAReference; if (!active) return; const ok = onFinishLLOTA({ id: active.activityId, name: active.name, reference: active.code, activityType: 'LLOTA', startedAt: active.startedAt, finishedAt: new Date().toISOString() }); if (ok) setSelectedLLOTAReference(null); }} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Finalizar y archivar</button>
            </div>
          ) : <>
            <input type="search" value={llotaSearch} onChange={(e) => handleLLOTAReferenceInput(e.target.value)} placeholder="Pegá o escribí el código LLOTA o buscá por lugar…" autoComplete="off" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-none" />
            {llotaLoading && <p className="text-xs text-slate-400">Cargando referencias oficiales de LLOTA…</p>}
            {!llotaLoading && llotaLoadError && <p role="status" className="text-xs text-amber-300">{llotaLoadError}</p>}
            {!llotaLoading && !llotaLoadError && llotaSearch.trim().length < 2 && <p className="text-xs text-slate-400">Escribí al menos 2 caracteres para buscar en el catálogo mundial oficial ({llotaReferences.length.toLocaleString()} referencias).</p>}
            {filteredLLOTAReferences.length > 0 && <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950">
              {filteredLLOTAReferences.map((reference) => <button key={reference.code} type="button" onClick={() => { setSelectedLLOTAReference({ ...reference, activityId: `llota-${reference.code}-${Date.now()}`, startedAt: new Date().toISOString() }); setLLOTAsearch(''); }} className="block w-full border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-teal-900/40">
                <span className="block font-mono text-xs font-bold text-teal-200">{reference.code}</span>
                <span className="block text-xs text-slate-200">{reference.name || 'Referencia LLOTA'}{reference.country ? ` · ${reference.country}` : ''}</span>
              </button>)}
            </div>}
            {!llotaLoading && !llotaLoadError && llotaSearch.trim().length >= 2 && filteredLLOTAReferences.length === 0 && <p className="text-xs text-slate-400">No hay coincidencias en el catálogo oficial. Revisá el código o consultá la página de LLOTA.</p>}
          </>}
          <p className="text-[11px] text-slate-500">La referencia queda seleccionada para los próximos QSO, incluso al cambiar de banda o salir de la app. Cada contacto guarda una copia propia. Usá «Quitar» para desactivarla cuando quieras cargar contactos sin referencia.</p>
        </details>}
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
