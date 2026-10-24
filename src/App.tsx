/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { QSO, DEFAULT_CALLSIGN } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { NewQSOForm } from './components/NewQSOForm';
import { LiveLog } from './components/LiveLog';
import { UserSettingsModal } from './components/UserSettingsModal';
import { EQSLCardModal } from './components/EQSLCardModal';
import { ReplyEQSLModal } from './components/ReplyEQSLModal';
import { ReceivedEQSLPage } from './components/ReceivedEQSLPage';
import { Award, Send, ChevronDown } from 'lucide-react';


function MainApp() {
  const [qsos, setQsos] = useState<QSO[]>(() => {
    const saved = localStorage.getItem('logbook_qsos');
    if (saved) {
      try {
        return (JSON.parse(saved) as QSO[]).filter((q) => !['qso-1', 'qso-2', 'qso-3'].includes(q.id));
      } catch (e) {
        console.error('Error reading logbook_qsos', e);
      }
    }
    return [];
  });

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const settingsHistoryEntry = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      if (settingsHistoryEntry.current) {
        settingsHistoryEntry.current = false;
        setIsSettingsModalOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenSettings = () => {
    if (!settingsHistoryEntry.current) {
      window.history.pushState({ logbookSettingsModal: true }, '', window.location.href);
      settingsHistoryEntry.current = true;
    }
    setIsSettingsModalOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsModalOpen(false);
    if (settingsHistoryEntry.current) {
      settingsHistoryEntry.current = false;
      if (window.history.state?.logbookSettingsModal) window.history.back();
    }
  };
  const [showCountryRanking, setShowCountryRanking] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [activeEQSLQSO, setActiveEQSLQSO] = useState<QSO | null>(null);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [replyData, setReplyData] = useState<{
    replyToCall: string;
    myCall?: string;
    date?: string;
    time?: string;
    band?: string;
    frequency?: string;
    mode?: string;
    rst?: string;
    email?: string;
    whatsapp?: string;
    whatsappUsername?: string;
    telegram?: string;
  } | null>(null);
  const [, setRefreshKey] = useState(0);



  // Verificar si se abrió mediante un enlace de responder eQSL (?reply_to=...).
  useEffect(() => {
    // Revisar si vino desde un enlace de respuesta compartida
    const urlParams = new URLSearchParams(window.location.search);
    const replyToParam = urlParams.get('reply_to');
    const replyEQSLId = urlParams.get('reply_eqsl');
    // Abrir el editor de respuesta desde el enlace corto; los datos llegan desde el servidor,
    // no desde parámetros extensos en la URL.
    if (replyEQSLId) {
      fetch('/api/eqsl-share?id=' + encodeURIComponent(replyEQSLId), { cache: 'no-store' })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.card) throw new Error(result.error || 'No se encontró la eQSL.');
          const card = result.card;
          setReplyData({
            replyToCall: String(card.from || ''),
            myCall: card.band === '11 metros' ? (localStorage.getItem('cb_station_callsign') || String(card.to || '')) : (localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN),
            date: String(card.date || ''),
            time: String(card.time || ''),
            band: String(card.band || '40m'),
            frequency: String(card.frequency || '7.120'),
            mode: String(card.mode || 'SSB'),
            rst: String(card.rstRcvd || '59'),
          });
          setIsReplyModalOpen(true);
          const cleanParams = new URLSearchParams(window.location.search);
          cleanParams.delete('reply_eqsl');
          const nextQuery = cleanParams.toString();
          window.history.replaceState({}, '', window.location.pathname + (nextQuery ? '?' + nextQuery : ''));
        })
        .catch((error) => window.alert(error instanceof Error ? error.message : 'No se pudo abrir la respuesta eQSL.'));
    }

    // Enlaces antiguos compatibles: abrir el editor desde parámetros tradicionales.
    if (replyToParam) {
      setReplyData({
        replyToCall: replyToParam,
        myCall: urlParams.get('to_call') || '',
        date: urlParams.get('date') || '',
        time: urlParams.get('time') || '',
        band: urlParams.get('band') || '40m',
        frequency: urlParams.get('freq') || '7.120',
        mode: urlParams.get('mode') || 'SSB',
        rst: urlParams.get('rst') || '59',
        email: urlParams.get('email') || '',
        whatsapp: urlParams.get('wa') || '',
        whatsappUsername: urlParams.get('wa_user') || '',
        telegram: urlParams.get('telegram') || '',
      });
      setIsReplyModalOpen(true);
    }

  }, []);

  // Guardar QSOs en localStorage cada vez que cambien
  const handleSaveQsos = (newQsos: QSO[]) => {
    setQsos(newQsos);
    localStorage.setItem('logbook_qsos', JSON.stringify(newQsos));
  };

  const handleAddQSO = (qso: QSO, openEQSL = true) => {
    // Evitar duplicados al guardar una respuesta eQSL de un QSO que ya estaba cargado.
    const makeQsoKey = (item: QSO) => [
      String(item.callsign || '').trim().toUpperCase(),
      item.date,
      item.time,
      String(item.band || '').trim().toUpperCase(),
      String(item.frequency || '').trim().replace(',', '.'),
      String(item.mode || '').trim().toUpperCase(),
    ].join('|');
    const key = makeQsoKey(qso);
    const existing = qsos.find((item) => makeQsoKey(item) === key);
    const trackedQSO: QSO = existing
      ? {
          ...existing,
          ...qso,
          id: existing.id,
          email: qso.email || existing.email,
          whatsapp: qso.whatsapp || existing.whatsapp,
          whatsappRaw: qso.whatsappRaw || existing.whatsappRaw,
          whatsappUsername: qso.whatsappUsername || existing.whatsappUsername,
          telegram: qso.telegram || existing.telegram,
          notes: qso.notes || existing.notes,
          qslSent: Boolean(existing.qslSent || qso.qslSent),
          qslRcvd: Boolean(existing.qslRcvd || qso.qslRcvd),
        }
      : { ...qso };
    const updated = existing
      ? qsos.map((item) => item.id === existing.id ? trackedQSO : item)
      : [trackedQSO, ...qsos];
    handleSaveQsos(updated);
    // Cargar QSO y abrir la tarjeta son acciones distintas; la respuesta usa openEQSL=false.
    if (openEQSL) setActiveEQSLQSO(trackedQSO);
  };

  const handleUpdateQSO = (updatedQSO: QSO) => {
    const updated = qsos.map((q) => (q.id === updatedQSO.id ? updatedQSO : q));
    handleSaveQsos(updated);
  };

  const handleDeleteQSO = (id: string) => {
    if (window.confirm('¿Seguro que deseás eliminar este contacto del libro de guardia?')) {
      const updated = qsos.filter((q) => q.id !== id);
      handleSaveQsos(updated);
    }
  };

  const handleImportADIF = (importedQsos: QSO[]) => {
    // Evitar duplicados tanto frente al log actual como dentro del propio archivo ADIF.
    const makeQsoKey = (q: QSO) => [
      q.callsign.trim().toUpperCase(),
      q.date,
      q.time,
      String(q.frequency || '').trim().replace(',', '.'),
      q.mode.trim().toUpperCase(),
    ].join('|');
    const existingKeys = new Set(qsos.map(makeQsoKey));
    const uniqueImported = importedQsos.filter((q) => {
      const key = makeQsoKey(q);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    if (uniqueImported.length === 0) {
      window.alert('La importación terminó: no se agregaron contactos porque todos ya estaban en el libro de guardia.');
      return;
    }
    handleSaveQsos([...uniqueImported, ...qsos]);
    window.alert(`Importación completada: ${uniqueImported.length} QSO(s) nuevos; se omitieron ${importedQsos.length - uniqueImported.length} duplicado(s).`);
  };

  const handleSettingsUpdated = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleOpenReplyForQSO = (qso: QSO) => {
    const myCurrentCall = localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN;
    setReplyData({
      replyToCall: qso.callsign,
      myCall: qso.band === '11 metros' ? (qso.stationCallsign || localStorage.getItem('cb_station_callsign') || myCurrentCall) : myCurrentCall,
      date: qso.date,
      time: qso.time,
      band: qso.band,
      frequency: qso.frequency,
      mode: qso.mode,
      rst: qso.rstRcvd || '59',
      email: qso.email,
      whatsapp: qso.whatsapp,
      whatsappUsername: qso.whatsappUsername,
      telegram: qso.telegram,
    });
    setIsReplyModalOpen(true);
  };

  const handleOpenManualReply = () => {
    const myCurrentCall = localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN;
    setReplyData({
      replyToCall: '',
      myCall: myCurrentCall,
      date: new Date().toISOString().slice(0, 10),
      time: '12:00',
      band: '40m',
      frequency: '7.120',
      mode: 'SSB',
      rst: '59',
    });
    setIsReplyModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Encabezado con reloj UTC, botón de WhatsApp y accesos */}
      <Header
        onOpenSettings={handleOpenSettings}
        onOpenReplyModal={handleOpenManualReply}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex items-center gap-2">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg shrink-0"><Award className="w-4 h-4" /></div>
            <div className="min-w-0"><div className="text-lg sm:text-xl font-bold font-mono text-white">—</div><div className="text-[10px] sm:text-xs leading-tight text-slate-400">Estaciones activas · sin datos verificados</div></div>
          </div>
          <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex items-center gap-2">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg shrink-0"><Send className="w-4 h-4" /></div>
            <div className="min-w-0"><div className="text-lg sm:text-xl font-bold font-mono text-white">—</div><div className="text-[10px] sm:text-xs leading-tight text-slate-400">Acciones eQSL · sin datos verificados</div></div>
          </div>
          <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3">
            <div className="text-[10px] sm:text-xs leading-tight text-slate-400 mb-2">Ranking mundial · pendiente</div>
            <button type="button" onClick={() => setShowCountryRanking((open) => !open)} aria-expanded={showCountryRanking} className="w-full flex items-center justify-between gap-1 text-sm text-white">
              <span className="font-mono">—</span>
              <span className="text-slate-400"><svg className={`w-4 h-4 transition-transform ${showCountryRanking ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></span>
            </button>
            {showCountryRanking && <div className="mt-2 border-t border-slate-700 pt-2 text-[10px] leading-snug text-slate-400">El ranking por banderas y cantidad estará disponible al conectar el registro compartido.</div>}
          </div>
        </div>

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90">
          <button
            type="button"
            onClick={() => setShowWorldMap((open) => !open)}
            aria-expanded={showWorldMap}
            aria-controls="world-map-panel"
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5 hover:bg-slate-800/60 transition-colors"
          >
            <span className="text-lg font-bold text-white">Mapamundi de actividad eQSL (previsto)</span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-amber-400 transition-transform duration-300 ${showWorldMap ? 'rotate-180' : ''}`} />
          </button>
          <div
            id="world-map-panel"
            hidden={!showWorldMap}
            className="border-t border-slate-800"
          >
            <div className="grid gap-4 p-4 sm:p-5">
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-5 sm:p-7">
                <p className="text-sm font-bold text-amber-300">Función prevista — todavía no activa</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">El mapa mundial compartido en tiempo real necesita un servicio seguro y participación voluntaria. Esta versión no publica ni transmite tus QSOs al mapa y no muestra actividad mundial simulada.</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
                  <li>La futura participación será opcional y se podrá desactivar.</li>
                  <li>Se usará ubicación aproximada por locator o país, nunca coordenadas exactas por defecto.</li>
                  <li>Los eventos distinguirán QSOs guardados de eQSL preparadas o compartidas.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Formulario de Nuevo QSO (con precarga de banda, fecha, hora y modo) */}
        <NewQSOForm
          onAddQSO={handleAddQSO}
        />

        {/* Tabla Live Log (con columna Email editable, filtros y acciones) */}
        <LiveLog
          qsos={qsos}
          onUpdateQSO={handleUpdateQSO}
          onDeleteQSO={handleDeleteQSO}
          onOpenEQSL={(qso) => setActiveEQSLQSO(qso)}
          onImportADIF={handleImportADIF}
          onOpenReply={handleOpenReplyForQSO}
        />
      </main>

      {/* PRIORIDAD 1: Footer con crédito discreto */}
      <Footer />

      {/* Modales */}
      {/* Modal de Configuración General */}
      <UserSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
        onUpdate={handleSettingsUpdated}
      />

      {/* Modal de Tarjeta eQSL Express */}
      <EQSLCardModal
        isOpen={Boolean(activeEQSLQSO)}
        qso={activeEQSLQSO}
        onClose={() => setActiveEQSLQSO(null)}
        onOpenReply={handleOpenReplyForQSO}
      />

      {/* Modal de Responder con eQSL */}
      <ReplyEQSLModal
        isOpen={isReplyModalOpen}
        initialData={replyData}
        onClose={() => {
          setIsReplyModalOpen(false);
          setReplyData(null);
        }}
        onSaveQSO={(qso) => handleAddQSO(qso, false)}
      />
    </div>
  );
}

export default function App() {
  const sharedParams = new URLSearchParams(window.location.search);
  if (sharedParams.has('e') || sharedParams.has('view_eqsl')) return <ReceivedEQSLPage />;
  return <MainApp />;
}
