/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QSO } from '../types';
import { getFirma, getUserCallsign } from '../services/qrzService';
import {
  Mail,
  Share2,
  Trash2,
  Send,
  Edit2,
  Check,
  Search,
  Download,
  Upload,
  Radio,
  ExternalLink,
  MessageSquare,
  Sparkles,
  FileText,
  ArrowRightLeft
} from 'lucide-react';

interface LiveLogProps {
  qsos: QSO[];
  onUpdateQSO: (qso: QSO) => void;
  onDeleteQSO: (id: string) => void;
  onOpenEQSL: (qso: QSO) => void;
  onImportADIF: (newQsos: QSO[]) => void;
  onOpenReply?: (qso: QSO) => void;
}

export const LiveLog: React.FC<LiveLogProps> = ({
  qsos,
  onUpdateQSO,
  onDeleteQSO,
  onOpenEQSL,
  onImportADIF,
  onOpenReply,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeLog, setActiveLog] = useState<'ham' | 'cb'>('ham');
  const isCitizenBand = (q: QSO) => /^(11 metros|11m|27 ?mhz)$/i.test(String(q.band || '').trim()) || (() => { const f = Number(String(q.frequency || '').replace(',', '.')); return Number.isFinite(f) && f >= 26.9 && f <= 27.5; })();
  const hamQSOs = qsos.filter((q) => !isCitizenBand(q));
  const cbQSOs = qsos.filter(isCitizenBand);
  const categoryQSOs = activeLog === 'cb' ? cbQSOs : hamQSOs;
  const [filterBand, setFilterBand] = useState('ALL');
  const [filterMode, setFilterMode] = useState('ALL');
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [tempEmailValue, setTempEmailValue] = useState('');
  const [editingWhatsappId, setEditingWhatsappId] = useState<string | null>(null);
  const [tempWhatsappValue, setTempWhatsappValue] = useState('');

  // Manejo de edición directa en columna Email (PRIORIDAD 3)
  const handleStartEditEmail = (qso: QSO) => {
    setEditingEmailId(qso.id);
    setTempEmailValue(qso.email || '');
  };

  const handleSaveEmail = (qso: QSO) => {
    onUpdateQSO({
      ...qso,
      email: tempEmailValue.trim(),
    });
    setEditingEmailId(null);
  };

  const handleKeyDownEmail = (e: React.KeyboardEvent, qso: QSO) => {
    if (e.key === 'Enter') {
      handleSaveEmail(qso);
    } else if (e.key === 'Escape') {
      setEditingEmailId(null);
    }
  };

  // Manejo de edición directa en WhatsApp
  const handleStartEditWhatsapp = (qso: QSO) => {
    setEditingWhatsappId(qso.id);
    setTempWhatsappValue(qso.whatsapp || '');
  };

  const handleSaveWhatsapp = (qso: QSO) => {
    const cleanDigits = tempWhatsappValue.replace(/[^0-9]/g, '');
    onUpdateQSO({
      ...qso,
      whatsapp: cleanDigits,
      whatsappRaw: tempWhatsappValue.trim(),
    });
    setEditingWhatsappId(null);
  };

  const handleKeyDownWhatsapp = (e: React.KeyboardEvent, qso: QSO) => {
    if (e.key === 'Enter') {
      handleSaveWhatsapp(qso);
    } else if (e.key === 'Escape') {
      setEditingWhatsappId(null);
    }
  };

  // PRIORIDAD 1: Compartir QSO con firma dinámica y targeting a número de WhatsApp si existe
  const handleShareQSOWhatsApp = (qso: QSO) => {
    const callsign = localStorage.getItem('user_callsign') || 'LU1TSB';
    const firma = `73 cordiales de ${callsign}`;

    const text = `📻 *QSO Confirmado con ${qso.callsign}*\n` +
      `📅 Fecha: ${qso.date} ${qso.time} UTC\n` +
      `📡 Banda: ${qso.band} (${qso.frequency} MHz) - Modo: ${qso.mode}\n` +
      `📶 RST: ${qso.rstSent} / ${qso.rstRcvd}\n` +
      (qso.grid ? `🌐 Grid: ${qso.grid}\n` : '') +
      `\n${firma}\nLogBook eQSL Express`;

    const cleanPhone = qso.whatsapp ? qso.whatsapp.replace(/[^0-9]/g, '') : '';
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Enviar email directo con mailto conteniendo firma dinámica
  const handleSendEmailDirect = (qso: QSO) => {
    const myCallsign = getUserCallsign();
    const firma = getFirma();

    if (!qso.email) {
      handleStartEditEmail(qso);
      return;
    }

    const subject = encodeURIComponent(`eQSL de ${myCallsign} para ${qso.callsign} [${qso.band} ${qso.mode}]`);
    const body = encodeURIComponent(
      `Estimado operador de ${qso.callsign},\n\n` +
      `Ha sido un gusto contactarte. Te adjunto los detalles de nuestro QSO registrado en LogBook eQSL Express:\n\n` +
      `• Indicativo: ${qso.callsign}\n` +
      `• Fecha: ${qso.date} a las ${qso.time} UTC\n` +
      `• Banda: ${qso.band} (${qso.frequency} MHz)\n` +
      `• Modo: ${qso.mode}\n` +
      `• RST Enviada: ${qso.rstSent} | RST Recibida: ${qso.rstRcvd}\n` +
      (qso.grid ? `• Grid Locator: ${qso.grid}\n` : '') +
      `\n¡Gracias por el QSO y nos encontramos en las bandas!\n\n` +
      `${firma}`
    );

    window.open(`mailto:${qso.email}?subject=${subject}&body=${body}`);

    // Abrir el correo no confirma que el usuario haya enviado el mensaje.
  };

  // Exportar a ADIF estándar para LoTW / eQSL.cc
  const handleExportADIF = () => {
    const myCallsign = getUserCallsign();
    let adif = `ADIF Export from LogBook eQSL Express\n`;
    adif += `Generated: ${new Date().toISOString()}\n`;
    adif += `<PROGRAMID:20>LogBook eQSL Express\n`;
    adif += `<EOH>\n\n`;

    categoryQSOs.forEach((q) => {
      const qDate = q.date.replace(/-/g, '');
      const qTime = q.time.replace(/:/g, '') + '00';
      adif += `<CALL:${q.callsign.length}>${q.callsign}`;
      adif += `<QSO_DATE:${qDate.length}>${qDate}`;
      adif += `<TIME_ON:${qTime.length}>${qTime}`;
      adif += `<BAND:${q.band.length}>${q.band}`;
      adif += `<FREQ:${q.frequency.length}>${q.frequency}`;
      adif += `<MODE:${q.mode.length}>${q.mode}`;
      const rstSent = q.rstSent || '59';
      const rstRcvd = q.rstRcvd || '59';
      adif += `<RST_SENT:${rstSent.length}>${rstSent}`;
      adif += `<RST_RCVD:${rstRcvd.length}>${rstRcvd}`;
      if (q.exchangeSent) adif += `<STX_STRING:${q.exchangeSent.length}>${q.exchangeSent}`;
      if (q.exchangeReceived) adif += `<SRX_STRING:${q.exchangeReceived.length}>${q.exchangeReceived}`;
      if (q.email) adif += `<EMAIL:${q.email.length}>${q.email}`;
      if (q.name) adif += `<NAME:${q.name.length}>${q.name}`;
      if (q.country) adif += `<COUNTRY:${q.country.length}>${q.country}`;
      if (q.grid) adif += `<GRIDSQUARE:${q.grid.length}>${q.grid}`;
      if (q.notes) adif += `<COMMENT:${q.notes.length}>${q.notes}`;
      adif += `<OPERATOR:${myCallsign.length}>${myCallsign}`;
      adif += `<EOR>\n`;
    });

    const blob = new Blob([adif], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LogBook_${myCallsign}_${new Date().toISOString().slice(0, 10)}.adi`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Exportar Cabrillo para concursos. El formato es genérico; algunos concursos exigen categorías/cabeceras específicas.
  const handleExportCabrillo = () => {
    if (!categoryQSOs.length) return;
    const contestInput = window.prompt('Código oficial del concurso para la cabecera Cabrillo:', 'GENERIC');
    if (contestInput === null) return;
    const contestCode = contestInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'GENERIC';
    const myCall = getUserCallsign();
    const lines = [
      'START-OF-LOG: 3.0',
      `CONTEST: ${contestCode}`,
      `CALLSIGN: ${myCall}`,
      'CATEGORY-OPERATOR: SINGLE-OP',
      'CATEGORY-BAND: ALL',
      'CATEGORY-MODE: MIXED',
      'CATEGORY-POWER: LOW',
      'CATEGORY-ASSISTED: NON-ASSISTED',
      'CATEGORY-STATION: FIXED',
      'CATEGORY-TRANSMITTER: ONE',
      `OPERATORS: ${myCall}`,
      'CREATED-BY: LogBook eQSL Express',
    ];
    [...categoryQSOs].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).forEach((q) => {
      const date = q.date || '';
      const time = (q.time || '').replace(/:/g, '').slice(0, 4).padEnd(4, '0');
      const frequencyMHz = Number.parseFloat((q.frequency || '').trim());
      const freqKHz = Number.isFinite(frequencyMHz) ? String(Math.round(frequencyMHz * 1000)) : '14000';
      const mode = /^CW$/i.test(q.mode) ? 'CW' : (/^(RTTY|FT8|FT4|PSK31|JS8|D-STAR|DMR)$/i.test(q.mode) ? 'RY' : 'PH');
      const sentExchange = (q.exchangeSent || '').trim();
      const receivedExchange = (q.exchangeReceived || '').trim();
      const exchangeFields = sentExchange || receivedExchange
        ? ` ${sentExchange || '-'}`
        : '';
      const receivedField = sentExchange || receivedExchange
        ? ` ${receivedExchange || '-'}`
        : '';
      lines.push(`QSO: ${freqKHz} ${mode} ${date} ${time} ${myCall} ${q.rstSent || '59'}${exchangeFields} ${q.callsign} ${q.rstRcvd || '59'}${receivedField} 0`);
    });
    lines.push('END-OF-LOG:');
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LogBook_${myCall}_${new Date().toISOString().slice(0, 10)}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Importar archivo ADIF
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const records = content.split(/<EOR>/i);
      const parsed: QSO[] = [];

      records.forEach((rec) => {
        if (!rec.trim()) return;

        const getField = (name: string): string => {
          const match = rec.match(new RegExp(`<${name}:(\\d+)(?::[^>]*)?>([^<]*)`, 'i'));
          return match ? match[2].trim() : '';
        };

        const call = getField('CALL');
        if (!call) return;

        const rawDate = getField('QSO_DATE');
        const formattedDate = rawDate.length === 8 
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : new Date().toISOString().slice(0, 10);

        const rawTime = getField('TIME_ON');
        const formattedTime = rawTime.length >= 4
          ? `${rawTime.slice(0, 2)}:${rawTime.slice(2, 4)}`
          : '12:00';

        parsed.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          callsign: call.toUpperCase(),
          date: formattedDate,
          time: formattedTime,
          band: getField('BAND') || '40m',
          frequency: getField('FREQ') || '7.120',
          mode: getField('MODE') || 'SSB',
          rstSent: getField('RST_SENT') || '59',
          rstRcvd: getField('RST_RCVD') || '59',
          exchangeSent: getField('STX_STRING') || '',
          exchangeReceived: getField('SRX_STRING') || '',
          email: getField('EMAIL') || '',
          name: getField('NAME') || '',
          country: getField('COUNTRY') || '',
          grid: getField('GRIDSQUARE') || '',
          notes: getField('COMMENT') || '',
          qslSent: false,
          qslRcvd: false,
        });
      });

      if (parsed.length > 0) {
        onImportADIF(parsed);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Filtrado de QSOs
  const filteredQSOs = categoryQSOs.filter((q) => {
    const matchesSearch =
      q.callsign.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.name && q.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (q.country && q.country.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (q.grid && q.grid.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesBand = filterBand === 'ALL' || q.band === filterBand;
    const matchesMode = filterMode === 'ALL' || q.mode === filterMode;

    return matchesSearch && matchesBand && matchesMode;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
      {/* Barra superior de Live Log */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                {activeLog === 'ham' ? 'Radioafición' : '11 metros'} ({categoryQSOs.length} QSO)
              </h2>
              <p className="text-xs text-slate-400">
</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-3" role="tablist" aria-label="Listas de contactos">
          <button type="button" role="tab" aria-selected={activeLog === 'ham'} onClick={() => { setActiveLog('ham'); setFilterBand('ALL'); }} className={`flex-1 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${activeLog === 'ham' ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
            Radioafición <span className="ml-1 rounded-md bg-black/15 px-2 py-0.5">{hamQSOs.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeLog === 'cb'} onClick={() => { setActiveLog('cb'); setFilterBand('ALL'); }} className={`flex-1 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${activeLog === 'cb' ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
            11 metros <span className="ml-1 rounded-md bg-black/15 px-2 py-0.5">{cbQSOs.length}</span>
          </button>
        </div>

        {/* Búsqueda, Filtros y Acciones ADIF */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Campo de búsqueda */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar indicativo, email..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {/* Filtro Banda */}
          <select
            value={filterBand}
            onChange={(e) => setFilterBand(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 focus:border-amber-400 focus:outline-hidden"
          >
            <option value="ALL">Todas las bandas</option>
            {['160m', '80m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '11 metros', '6m', '2m', '70cm'].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          {/* Filtro Modo */}
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 focus:border-amber-400 focus:outline-hidden"
          >
            <option value="ALL">Todos los modos</option>
            {['SSB', 'CW', 'FT8', 'FT4', 'AM', 'FM', 'RTTY'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Importar ADIF */}
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Importar ADIF
            <input
              type="file"
              accept=".adi,.adif,.txt"
              onChange={handleFileImport}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleExportCabrillo}
            disabled={categoryQSOs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            title="Exportar Cabrillo base; los intercambios y categorías específicos dependen del concurso"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Cabrillo
          </button>

          {/* Exportar ADIF */}
          <button
            type="button"
            onClick={handleExportADIF}
            disabled={qsos.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            title="Exportar a formato ADIF estándar (.adi)"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar ADIF
          </button>
        </div>
      </div>

      {/* Tabla Live Log */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
              <th className="py-3 px-3">Fecha / Hora</th>
              <th className="py-3 px-3">Corresponsal</th>
              <th className="py-3 px-2">Banda / MHz</th>
              <th className="py-3 px-2">Modo</th>
              <th className="py-3 px-2">RST E/R</th>
              {/* PRIORIDAD 3: Columna Email y WhatsApp editables */}
              <th className="py-3 px-3 min-w-[220px] text-sky-400">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-sky-400" />
                  <span>Email & WhatsApp (Editables)</span>
                </div>
              </th>
              <th className="py-3 px-3">País / Grid</th>
              <th className="py-3 px-2 text-center">eQSL</th>
              <th className="py-3 px-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {filteredQSOs.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  {searchTerm ? 'No se encontraron contactos con los filtros actuales.' : `Todavía no hay QSO en la lista de ${activeLog === 'ham' ? 'radioafición' : '11 metros'}.`}
                </td>
              </tr>
            ) : (
              filteredQSOs.map((q) => {
                const isEditingEmail = editingEmailId === q.id;

                return (
                  <tr
                    key={q.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Fecha / Hora UTC */}
                    <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                      <div>{q.date}</div>
                      <div className="text-[11px] text-amber-400/90">{q.time} UTC</div>
                    </td>

                    {/* Indicativo */}
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-bold text-amber-300 text-sm tracking-wide">
                        {q.callsign}
                      </div>
                      {q.name && (
                        <div className="text-[11px] text-slate-400 truncate max-w-[120px]">
                          {q.name}
                        </div>
                      )}
                    </td>

                    {/* Banda y Frecuencia */}
                    <td className="py-2.5 px-2 font-mono whitespace-nowrap">
                      <span className="font-semibold text-slate-200">{q.band}</span>
                      <div className="text-[11px] text-slate-400">{q.frequency} MHz</div>
                    </td>

                    {/* Modo */}
                    <td className="py-2.5 px-2 font-mono">
                      <span className="px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-200 text-[11px] font-semibold border border-slate-700">
                        {q.mode}
                      </span>
                    </td>

                    {/* RST Enviada / Recibida */}
                    <td className="py-2.5 px-2 font-mono text-slate-300 whitespace-nowrap">
                      <span className="text-emerald-400 font-bold">{q.rstSent || '59'}</span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-sky-400 font-bold">{q.rstRcvd || '59'}</span>
                    </td>

                    {/* PRIORIDAD 3: Columna Email y WhatsApp Editables en el Live Log */}
                    <td className="py-2.5 px-3 min-w-[220px]">
                      {/* Email Editable */}
                      {isEditingEmail ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="email"
                            value={tempEmailValue}
                            onChange={(e) => setTempEmailValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDownEmail(e, q)}
                            placeholder="correo@ejemplo.com"
                            autoFocus
                            className="w-full px-2 py-0.5 bg-slate-950 border border-sky-400 rounded-md text-xs text-sky-300 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEmail(q)}
                            className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md cursor-pointer"
                            title="Guardar email"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEditEmail(q)}
                          className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-800/80 cursor-pointer group/email transition-colors"
                          title="Hacé clic para editar el email del corresponsal"
                        >
                          <span className={`truncate text-xs ${q.email ? 'text-sky-300 font-medium' : 'text-slate-600 italic'}`}>
                            {q.email || 'Sin email (clic)'}
                          </span>
                          <Edit2 className="w-2.5 h-2.5 text-slate-500 group-hover/email:text-sky-400 shrink-0 opacity-0 group-hover/email:opacity-100 transition-opacity" />
                        </div>
                      )}

                      {/* WhatsApp Editable */}
                      {editingWhatsappId === q.id ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="text"
                            value={tempWhatsappValue}
                            onChange={(e) => setTempWhatsappValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDownWhatsapp(e, q)}
                            placeholder="5493886067078"
                            autoFocus
                            className="w-full px-2 py-0.5 bg-slate-950 border border-emerald-400 rounded-md text-xs font-mono text-emerald-300 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveWhatsapp(q)}
                            className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md cursor-pointer"
                            title="Guardar WhatsApp"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEditWhatsapp(q)}
                          className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-md hover:bg-slate-800/80 cursor-pointer group/wa transition-colors mt-0.5"
                          title="Hacé clic para editar el número de WhatsApp"
                        >
                          <span className={`flex items-center gap-1 text-[11px] font-mono ${q.whatsapp ? 'text-emerald-400 font-semibold' : 'text-slate-600 italic'}`}>
                            <MessageSquare className="w-3 h-3 text-emerald-500 shrink-0" />
                            {q.whatsapp ? (q.whatsapp.startsWith('+') ? q.whatsapp : `+${q.whatsapp}`) : 'Agregar WSP'}
                          </span>
                          <Edit2 className="w-2.5 h-2.5 text-slate-500 group-hover/wa:text-emerald-400 shrink-0 opacity-0 group-hover/wa:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </td>

                    {/* País y Grid */}
                    <td className="py-2.5 px-3 text-slate-300">
                      <div>{q.country || '—'}</div>
                      {q.grid && (
                        <span className="text-[10px] font-mono text-slate-400 uppercase bg-slate-800/70 px-1 py-0.5 rounded-sm">
                          {q.grid}
                        </span>
                      )}
                    </td>

                    {/* Estado eQSL */}
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenEQSL(q)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${
                          q.qslSent
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                        }`}
                        title={q.qslSent ? 'Tarjeta compartida por correo o WhatsApp' : 'Ver o emitir tarjeta eQSL'}
                      >
                        {q.qslSent ? '✓ Enviada' : 'Emitir eQSL'}
                      </button>
                      <div className="mt-1 flex justify-center gap-1">
                        <button type="button" onClick={() => onUpdateQSO({ ...q, qslSent: !q.qslSent })} className={`rounded px-1.5 py-0.5 text-[9px] border ${q.qslSent ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10' : 'border-slate-700 text-slate-400'}`} title="Marcar si la eQSL fue enviada">
                          E: {q.qslSent ? 'Sí' : 'No'}
                        </button>
                        <button type="button" onClick={() => onUpdateQSO({ ...q, qslRcvd: !q.qslRcvd })} className={`rounded px-1.5 py-0.5 text-[9px] border ${q.qslRcvd ? 'border-sky-500/50 text-sky-300 bg-sky-500/10' : 'border-slate-700 text-slate-400'}`} title="Marcar si la eQSL fue recibida">
                          R: {q.qslRcvd ? 'Sí' : 'No'}
                        </button>
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Enviar email directo con mailto y firma */}
                        {q.email && (
                          <button
                            type="button"
                            onClick={() => handleSendEmailDirect(q)}
                            className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title={`Enviar eQSL por correo a ${q.email}`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Compartir por WhatsApp con firma dinámica */}
                        <button
                          type="button"
                          onClick={() => handleShareQSOWhatsApp(q)}
                          className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Compartir QSO por WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Responder con eQSL */}
                        {onOpenReply && (
                          <button
                            type="button"
                            onClick={() => onOpenReply(q)}
                            className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title={`Responder con mi eQSL a ${q.callsign}`}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Generar tarjeta eQSL */}
                        <button
                          type="button"
                          onClick={() => onOpenEQSL(q)}
                          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Generar y descargar tarjeta eQSL"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        {/* Eliminar QSO */}
                        <button
                          type="button"
                          onClick={() => onDeleteQSO(q.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar este contacto del log"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-slate-800 pt-4" aria-label={`Contadores de ${activeLog === 'ham' ? 'radioafición' : '11 metros'}`}>
        <div className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-3">
          <div className="text-xs text-slate-400">QSO cargados</div>
          <div className="text-xl font-bold text-white">{categoryQSOs.length}</div>
        </div>
        <div className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-3">
          <div className="text-xs text-slate-400">eQSL enviadas</div>
          <div className="text-xl font-bold text-emerald-400">{categoryQSOs.filter((q) => q.qslSent).length}</div>
        </div>
        <div className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-3">
          <div className="text-xs text-slate-400">eQSL recibidas</div>
          <div className="text-xl font-bold text-sky-400">{categoryQSOs.filter((q) => q.qslRcvd).length}</div>
        </div>
      </div>
    </div>
  );
};
