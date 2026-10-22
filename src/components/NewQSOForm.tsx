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
  MessageCircle,
  Phone
} from 'lucide-react';

interface NewQSOFormProps {
  onAddQSO: (qso: QSO) => void;
  onOpenQRZModal: () => void;
}

export const NewQSOForm: React.FC<NewQSOFormProps> = ({ onAddQSO, onOpenQRZModal }) => {
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
  const [rstSent, setRstSent] = useState('');
  const [rstRcvd, setRstRcvd] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappRaw, setWhatsappRaw] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [grid, setGrid] = useState('');
  const [notes, setNotes] = useState('');

  const [isSearchingQRZ, setIsSearchingQRZ] = useState(false);
  const [qrzFoundSource, setQrzFoundSource] = useState<'qrz' | 'qrz-bio' | 'prefix-db' | null>(null);

  const callsignInputRef = useRef<HTMLInputElement>(null);
  const lookupRequestId = useRef(0);

  // Comprobar si QRZ está configurado
  const activeQRZUser = sessionStorage.getItem('qrz_user') || localStorage.getItem('qrz_user') || '';
  const activeQRZPass = sessionStorage.getItem('qrz_pass') || localStorage.getItem('qrz_pass') || '';
  const hasQRZConfig = Boolean(activeQRZUser && activeQRZPass);

  // Sincronizar banda y frecuencia sugerida al cambiar banda
  const handleBandChange = (newBand: string) => {
    setBand(newBand);
    const found = HAM_BANDS.find((b) => b.name === newBand);
    if (found) {
      setFrequency(found.defaultFreq);
    }
  };

  // Asignar RST por defecto según el modo
  const setDefaultRstForMode = (m: string) => {
    if (m === 'CW' || m === 'FT8' || m === 'FT4' || m === 'RTTY' || m === 'PSK31') {
      if (!rstSent) setRstSent('599');
      if (!rstRcvd) setRstRcvd('599');
    } else {
      if (!rstSent) setRstSent('59');
      if (!rstRcvd) setRstRcvd('59');
    }
  };

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    setDefaultRstForMode(newMode);
  };

  const handleUpdateToCurrentUTC = () => {
    const now = getNowUTC();
    setDate(now.date);
    setTime(now.time);
  };

  // Autocompletado con QRZ / Prefijos cuando se escribe el indicativo
  const searchCallsignDetails = async (cleanCall: string, requestId: number) => {
    if (!cleanCall || cleanCall.length < 3) return;
    setIsSearchingQRZ(true);
    try {
      const details = await lookupQRZCallsign(cleanCall);
      // Ignore an older response if the operator has already typed another callsign.
      if (requestId !== lookupRequestId.current) return;
      if (details.name) setName(details.name);
      setEmail(details.email || '');
      setWhatsapp(details.whatsapp || '');
      setWhatsappRaw(details.whatsappRaw || '');
      if (details.country) setCountry(details.country);
      if (details.grid) setGrid(details.grid);
      setQrzFoundSource((details.email || details.whatsapp) ? (details.source as any) : null);
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
    setWhatsapp('');
    setWhatsappRaw('');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callsign.trim()) {
      callsignInputRef.current?.focus();
      return;
    }

    const newQSO: QSO = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      callsign: callsign.trim().toUpperCase(),
      date,
      time,
      band,
      frequency,
      mode,
      rstSent: rstSent.trim() || (mode === 'CW' ? '599' : '59'),
      rstRcvd: rstRcvd.trim() || (mode === 'CW' ? '599' : '59'),
      email: email.trim(),
      whatsapp: whatsapp.trim(),
      whatsappRaw: whatsappRaw.trim(),
      name: name.trim(),
      country: country.trim(),
      grid: grid.trim().toUpperCase(),
      notes: notes.trim(),
      qslSent: false,
      qslRcvd: false,
    };

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

    // Solo limpiar al guardar: corresponsal (callsign), RST enviada, RST recibida, email, whatsapp y detalles
    setCallsign('');
    setRstSent('');
    setRstRcvd('');
    setEmail('');
    setWhatsapp('');
    setWhatsappRaw('');
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

        {/* Estado de conexión QRZ */}
        <div className="flex items-center gap-2">
          {hasQRZConfig ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              QRZ configurado ({activeQRZUser})
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenQRZModal}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              Conectar QRZ para obtener Email
            </button>
          )}

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
                {qrzFoundSource === 'qrz-bio' 
                  ? 'Datos y WhatsApp de QRZ' 
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
              placeholder={mode === 'CW' ? '599' : '59'}
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
              placeholder={mode === 'CW' ? '599' : '59'}
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
              {email && email !== 'NOT FOUND' ? (
                <span className="text-[10px] text-emerald-400 font-semibold">✓ Dirección cargada</span>
              ) : !hasQRZConfig ? (
                <span className="text-[10px] text-amber-400/90 underline cursor-pointer" onClick={onOpenQRZModal}>
                  Conectar QRZ
                </span>
              ) : null}
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

          {/* WhatsApp / Teléfono del Corresponsal */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3 text-emerald-400" />
                WhatsApp / Tel
              </span>
              {whatsapp && (
                <span className="text-[10px] text-emerald-400 font-semibold">✓ QRZ</span>
              )}
            </label>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => {
                setWhatsapp(e.target.value);
                setWhatsappRaw(e.target.value);
              }}
              placeholder="ej. 5493886067078"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-emerald-300 placeholder-slate-600 focus:border-emerald-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Fila 2: Fecha UTC, Hora UTC, Frecuencia, Modo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Fecha UTC
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Hora UTC
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Frecuencia (MHz)
            </label>
            <input
              type="text"
              required
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="7.120"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-amber-300 font-semibold focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Modo
            </label>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value)}
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 pt-1">
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
            <label className="block text-[11px] text-slate-400 mb-1">Grid Locator</label>
            <input
              type="text"
              value={grid}
              onChange={(e) => setGrid(e.target.value)}
              placeholder="GF05"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono uppercase text-slate-200 focus:border-amber-400 focus:outline-hidden"
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

        {/* Botón de Guardado */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400 italic">
            * Al guardar, fecha, hora, banda, frecuencia y modo quedan precargados para el siguiente contacto.
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all transform active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Guardar QSO
          </button>
        </div>
      </form>
    </div>
  );
};
