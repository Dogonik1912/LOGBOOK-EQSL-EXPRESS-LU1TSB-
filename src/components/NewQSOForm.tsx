/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { QSO, HAM_BANDS, HAM_MODES } from '../types';
import { lookupQRZCallsign } from '../services/qrzService';
import { 
  PlusCircle, 
  Search, 
  Radio, 
  Clock, 
  Calendar, 
  Mail, 
  User, 
  Globe, 
  Sparkles, 
  RefreshCw,
  AlertCircle,
  Phone,
  ExternalLink
} from 'lucide-react';

interface NewQSOFormProps {
  onAddQSO: (qso: QSO) => void;
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
  const [rstSent, setRstSent] = useState('59');
  const [rstRcvd, setRstRcvd] = useState('59');
  const [exchangeSent, setExchangeSent] = useState('');
  const [exchangeReceived, setExchangeReceived] = useState('');
  const [email, setEmail] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [grid, setGrid] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState('');

  const [isSearchingQRZ, setIsSearchingQRZ] = useState(false);
  const [qrzFoundSource, setQrzFoundSource] = useState<'qrz' | 'qrz-bio' | 'qrz-web-session' | 'prefix-db' | null>(null);

  const callsignInputRef = useRef<HTMLInputElement>(null);
  const callsignCurrentRef = useRef(callsign);
  callsignCurrentRef.current = callsign;
  const lookupRequestId = useRef(0);

  // Importar datos visibles desde un perfil QRZ abierto mediante postMessage o un enlace de prueba.
  // Solo acepta campos explícitos enviados por el usuario; nunca deduce un correo.
  useEffect(() => {
    const applyProfile = (profile: { call?: string; email?: string; name?: string; country?: string; grid?: string }) => {
      const importedCall = String(profile.call || '').toUpperCase().trim();
      if (!/^[A-Z0-9/]{3,20}$/.test(importedCall)) return;
      const importedEmail = String(profile.email || '').trim();
      const currentCall = callsignCurrentRef.current.toUpperCase().trim();
      if (currentCall && currentCall !== importedCall) {
        setLookupMessage(`El perfil abierto es ${importedCall}, pero el QSO actual es ${currentCall}. No se importaron los datos para evitar mezclar corresponsales.`);
        return;
      }
      setCallsign(importedCall);
      setEmail(importedEmail);
      setName(String(profile.name || '').trim());
      setCountry(String(profile.country || '').trim());
      setGrid(String(profile.grid || '').trim().toUpperCase());
      setLookupMessage(importedEmail
        ? 'Correo importado desde el perfil QRZ abierto. Verificá que corresponda a este indicativo antes de guardar.'
        : 'Se importó el indicativo desde QRZ, pero no se encontró un correo visible en el perfil. No se completó ninguno automáticamente.');
      setQrzFoundSource(importedEmail ? 'qrz-web-session' : null);
    };

    const handleProfileImport = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      applyProfile(detail);
    };
    window.addEventListener('qrz-profile-import', handleProfileImport);

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const getImportValue = (key: string) => params.get(key) || hashParams.get(key) || '';
    const importedCall = getImportValue('qrz_call').toUpperCase().trim();
    if (/^[A-Z0-9/]{3,20}$/.test(importedCall)) {
      applyProfile({
        call: importedCall,
        email: getImportValue('qrz_email'),
        name: getImportValue('qrz_name'),
        country: getImportValue('qrz_country'),
        grid: getImportValue('qrz_grid'),
      });
    }

    return () => window.removeEventListener('qrz-profile-import', handleProfileImport);
  }, []);

  // Sincronizar banda y frecuencia sugerida al cambiar banda
  const handleBandChange = (newBand: string) => {
    setBand(newBand);
    const found = HAM_BANDS.find((b) => b.name === newBand);
    if (found) {
      setFrequency(found.defaultFreq);
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

  // Libreta local por SD: reutiliza correos y datos ya confirmados antes de consultar QRZ.
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

  // Primero usa la libreta local; solo consulta QRZ si faltan datos guardados.
  const searchCallsignDetails = async (cleanCall: string, requestId: number) => {
    if (!cleanCall || cleanCall.length < 3) return;
    const saved = getContactBook()[cleanCall];
    if (saved && (saved.email || saved.name || saved.whatsapp)) {
      if (requestId !== lookupRequestId.current) return;
      setName(saved.name || '');
      setEmail(saved.email || '');
      setCountry(saved.country || '');
      setGrid(saved.grid || '');
      setLookupMessage('Datos recuperados de tu libreta local para ' + cleanCall + '.');
      setQrzFoundSource(saved.email ? 'cache' : null);
      setIsSearchingQRZ(false);
      return;
    }
    setIsSearchingQRZ(true);
    try {
      const details = await lookupQRZCallsign(cleanCall);
      if (requestId !== lookupRequestId.current) return;
      if (details.name) setName(details.name);
      setEmail(details.email || '');
      setLookupMessage('');
      if (details.country) setCountry(details.country);
      if (details.grid) setGrid(details.grid);
      setQrzFoundSource(details.email ? (details.source as any) : null);
      if (details.email || details.name || details.whatsapp) saveContact(cleanCall, {
        email: details.email || '', name: details.name || '', country: details.country || '',
        grid: details.grid || '', whatsapp: details.whatsapp || '', whatsappRaw: details.whatsappRaw || '',
      });
    } catch (e) {
      if (requestId === lookupRequestId.current) console.warn(e);
    } finally {
      if (requestId === lookupRequestId.current) setIsSearchingQRZ(false);
    }
  };

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleCallsignChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setCallsign(upper);
    setQrzFoundSource(null);
    const requestId = ++lookupRequestId.current;
    // Do not keep contact data from the previous operator while a new lookup is running.
    setEmail('');
    setLookupMessage('');
    setName('');
    setCountry('');
    setGrid('');
    setIsSearchingQRZ(upper.length >= 3);

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    if (upper.length >= 3) {
      debounceTimeout.current = setTimeout(() => {
        searchCallsignDetails(upper, requestId);
      }, 500);
    }
  };

  const handlePasteEmailFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setLookupMessage('Este navegador no permite leer el portapapeles desde la app. Pegá el correo directamente en el campo Email.');
        return;
      }
      const copiedText = (await navigator.clipboard.readText()).trim();
      const emailMatch = copiedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (!emailMatch) {
        setLookupMessage('No encontré una dirección de correo en el portapapeles. En QRZ, copiá la dirección de correo y volvé a tocar “Pegar correo copiado”.');
        return;
      }
      setEmail(emailMatch[0]);
      setLookupMessage('Correo pegado desde el portapapeles. Verificá que corresponda al indicativo ' + callsign.trim().toUpperCase() + ' antes de guardar.');
      setQrzFoundSource(null);
    } catch {
      setLookupMessage('El navegador bloqueó el acceso al portapapeles. Permití el permiso si aparece o pegá el correo manualmente en el campo Email.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    const cleanCall = callsign.trim().toUpperCase();
    const validCall = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/.test(cleanCall);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const normalizedFrequency = frequency.trim().replace(',', '.');
    const numericFrequency = Number(normalizedFrequency);
    const validFrequency = normalizedFrequency !== '' && Number.isFinite(numericFrequency) && numericFrequency > 0 && numericFrequency <= 100000;
    const validMode = HAM_MODES.includes(mode);
    const missing = [
      !validCall ? 'SD del destinatario (indicativo válido)' : '',
      !validDate ? 'fecha válida' : '',
      !validTime ? 'hora válida en UTC' : '',
      !validFrequency ? 'frecuencia válida en MHz' : '',
      !validMode ? 'modo válido' : '',
    ].filter(Boolean);
    if (missing.length) {
      setValidationError('No se guardó el QSO ni se puede emitir la eQSL. Corregí: ' + missing.join(', ') + '.');
      if (!validCall) callsignInputRef.current?.focus();
      return;
    }

    const newQSO: QSO = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      callsign: cleanCall,
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
      whatsapp: '',
      whatsappRaw: '',
      name: name.trim(),
      country: country.trim(),
      grid: grid.trim().toUpperCase(),
      notes: notes.trim(),
      qslSent: false,
      qslRcvd: false,
    };

    // Recordar los datos del corresponsal para próximos QSOs, incluso si el correo fue pegado manualmente.
    saveContact(cleanCall, { email: email.trim(), name: name.trim(), country: country.trim(), grid: grid.trim().toUpperCase() });
    onAddQSO(newQSO);

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
    setWhatsappRaw('');
    setLookupMessage('');
    setName('');
    setCountry('');
    setGrid('');
    setNotes('');
    setQrzFoundSource(null);

    // Re-enfocar en el indicativo para el próximo QSO rápido
    setTimeout(() => {
      callsignInputRef.current?.focus();
    }, 50);
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
              Precarga automática de banda, hora y modo del QSO anterior
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
                placeholder="ej. LU7YS, EA1EXP"
                className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 rounded-xl text-lg font-mono font-black text-amber-300 uppercase tracking-widest placeholder:text-slate-600 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
              {isSearchingQRZ && (
                <div className="absolute right-3 top-2.5 text-xs text-amber-400 flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>
            {qrzFoundSource && (
              <span className="text-[11px] text-emerald-400 mt-1 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {qrzFoundSource === 'qrz-web-session'
                  ? 'Importado desde perfil QRZ abierto'
                  : qrzFoundSource === 'qrz-bio'
                  ? 'Correo de QRZ'
                  : qrzFoundSource === 'qrz'
                  ? 'Datos obtenidos de QRZ.com'
                  : 'País autodetectado'}
              </span>
            )}
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

          {/* Email del Corresponsal */}
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3 text-sky-400" />
                Email
              </span>
              <button
                type="button"
                onClick={() => { void handlePasteEmailFromClipboard(); }}
                className="inline-flex items-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200 underline mr-2"
                title="Pegar el correo que copiaste desde el perfil del corresponsal"
              >
                <Mail className="w-3 h-3" /> Pegar correo copiado
              </button>
              <button
                type="button"
                onClick={() => {
                  const call = callsign.trim().toUpperCase();
                  if (!/^[A-Z0-9/]{3,20}$/.test(call)) {
                    callsignInputRef.current?.focus();
                    setLookupMessage('Primero escribí el indicativo del corresponsal. Después abrí su perfil QRZ desde aquí.');
                    return;
                  }
                  const tab = window.open(`https://www.qrz.com/db/${encodeURIComponent(call)}`, '_blank', 'noopener=false');
                  if (!tab) {
                    setLookupMessage('El navegador bloqueó la pestaña de QRZ. Permití ventanas emergentes para esta aplicación e intentá nuevamente.');
                    return;
                  }
                  setLookupMessage('Se abrió el perfil QRZ de ' + call + '. En esa pestaña, ejecutá el marcador “Enviar perfil QRZ a LogBook” para importar los datos que estén visibles.');
                }}
                className="inline-flex items-center gap-1 text-[10px] text-sky-300 hover:text-sky-200 underline"
                title="Abrir el perfil QRZ del indicativo actual"
              >
                <ExternalLink className="w-3 h-3" /> Abrir QRZ / importar
              </button>
            </label>
            <input
              type="text"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Solo si está publicado en el perfil"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-sky-300 placeholder-slate-600 focus:border-sky-400 focus:outline-hidden"
            />
          </div>


        </div>

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
              placeholder="7.120"
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

        {/* Fila 3: Opcionales (Nombre, País, Grid, Notas) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Nombre Corresponsal</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Eduardo"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-amber-400 focus:outline-hidden"
            />
          </div>

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

        {/* Botón de Guardado */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400 italic">
            * Al guardar, se abre la tarjeta eQSL para elegir diseño y completar el envío por email o WhatsApp. Los datos del QSO quedan precargados.
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all transform active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            GUARDAR qso Y ENVIAR eqsl
          </button>
        </div>
      </form>
    </div>
  );
};
