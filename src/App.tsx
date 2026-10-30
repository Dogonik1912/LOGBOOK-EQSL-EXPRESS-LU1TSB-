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
import { EQSLViewErrorBoundary } from './components/EQSLViewErrorBoundary';
import { EQSLMailbox } from './components/EQSLMailbox';
import { Send } from 'lucide-react';
import { CommunityChat } from './components/CommunityChat';
import { MorseDecoder } from './components/MorseDecoder';
import { SDRSmart } from './components/SDRSmart';
import { PrivateMessages } from './components/PrivateMessages';
import { LiveSpots, publishQsoSpot } from './components/LiveSpots';
import { startAutomaticUiTranslation } from './services/appLanguage';
import { getUserCallsign } from './services/qrzService';
import { InitialSdValidation } from './components/InitialSdValidation';
import { PropagationReport } from './components/PropagationReport';
import { PatentGenerator } from './components/PatentGenerator';


interface ContestLogRecord { id: string; name: string; type: string; finishedAt: string; qsos?: QSO[]; }
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

  const [contestLogs, setContestLogs] = useState<ContestLogRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('logbook_contest_logs') || '[]') as ContestLogRecord[]; }
    catch { return []; }
  });
  const handleFinishContest = (log: ContestLogRecord): boolean => {
    // No cerrar el concurso si no podemos confirmar que hay QSO asociados y archivados.
    const snapshot = qsos
      .filter((q) => q.contestLogId === log.id || q.contestLogName === log.name)
      .map((q) => ({ ...q }));
    if (snapshot.length === 0) {
      window.alert('No se encontraron QSO vinculados a este concurso. El concurso sigue activo para proteger sus datos.');
      return false;
    }

    const archivedLog: ContestLogRecord = { ...log, qsos: snapshot };
    const updated = [archivedLog, ...contestLogs.filter((item) => item.id !== log.id)];
    try {
      // Persistir primero; solo después confirmar el cierre al formulario.
      localStorage.setItem('logbook_contest_logs', JSON.stringify(updated));
      const verification = JSON.parse(localStorage.getItem('logbook_contest_logs') || '[]') as ContestLogRecord[];
      const saved = verification.find((item) => item.id === log.id);
      if (!saved || !Array.isArray(saved.qsos) || saved.qsos.length !== snapshot.length) {
        throw new Error('La verificación del log archivado no coincide.');
      }
      setContestLogs(updated);
      return true;
    } catch (error) {
      console.error('No se pudo archivar el log del concurso:', error);
      window.alert('No se pudo verificar el archivo del concurso. El concurso sigue activo y sus datos no se han limpiado.');
      return false;
    }
  };

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const settingsHistoryEntry = useRef(false);

  useEffect(() => {
    // Atrás debe cerrar primero Ajustes si está abierto; si no, dejamos que
    // el navegador o el sistema operativo salga de la app de forma normal.
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
    originalEqslId?: string;
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
            myCall: /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(card.band || '')) ? (localStorage.getItem('cb_station_callsign') || String(card.to || '')) : (String(card.to || '').trim().toUpperCase() || getUserCallsign() || DEFAULT_CALLSIGN),
            date: String(card.date || ''),
            time: String(card.time || ''),
            band: String(card.band || '40m'),
            frequency: String(card.frequency || '7.120'),
            mode: String(card.mode || 'SSB'),
            rst: String(card.rstRcvd || '59'),
            originalEqslId: replyEQSLId,
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

  const handleAddQSO = (qso: QSO, openEQSL = true, publishSpot = true) => {
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
    // Las respuestas eQSL actualizan el libro local, pero no son un nuevo QSO/spot.
    // Solo el formulario de un contacto real puede publicar un spot compartido.
    if (publishSpot) void publishQsoSpot(trackedQSO);
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

  const handleDeleteQSOs = (ids: string[]) => {
    if (!ids.length) return;
    if (window.confirm(`¿Eliminar definitivamente ${ids.length} QSO seleccionados? Esta acción no se puede deshacer.`)) {
      const idSet = new Set(ids);
      handleSaveQsos(qsos.filter((q) => !idSet.has(q.id)));
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
    const myCurrentCall = getUserCallsign() || DEFAULT_CALLSIGN;
    setReplyData({
      replyToCall: qso.callsign,
      myCall: /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(qso.band || '')) ? (qso.stationCallsign || localStorage.getItem('cb_station_callsign') || myCurrentCall) : myCurrentCall,
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
    const myCurrentCall = getUserCallsign() || DEFAULT_CALLSIGN;
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
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 text-slate-900 flex flex-col font-sans selection:bg-amber-300 selection:text-slate-950">
      {/* Encabezado con reloj UTC, botón de WhatsApp y accesos */}
      <Header
        onOpenSettings={handleOpenSettings}
        onOpenReplyModal={handleOpenManualReply}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <EQSLMailbox />
          <PrivateMessages />
        </div>

        <CommunityChat />

        <LiveSpots />

        <MorseDecoder />

        <SDRSmart />

        {/* Formulario de Nuevo QSO (con precarga de banda, fecha, hora y modo) */}
        <NewQSOForm
          onAddQSO={handleAddQSO}
          onFinishContest={handleFinishContest}
        />

        {/* Tabla Live Log (con columna Email editable, filtros y acciones) */}
        <LiveLog
          qsos={qsos}
          contestLogs={contestLogs}
          onUpdateQSO={handleUpdateQSO}
          onDeleteQSO={handleDeleteQSO}
          onDeleteQSOs={handleDeleteQSOs}
          onOpenEQSL={(qso) => setActiveEQSLQSO(qso)}
          onImportADIF={handleImportADIF}
          onOpenReply={handleOpenReplyForQSO}
        />
      </main>

      {/* Informe de propagación al final del contenido, antes del pie de página. */}
      <PropagationReport />
      <PatentGenerator />

      {/* Pie de página al final de la aplicación. */}
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
        onSaveQSO={(qso) => handleAddQSO(qso, false, false)}
      />


    </div>
  );
}

export default function App() {
  useEffect(() => startAutomaticUiTranslation(), []);
  // Las páginas de eQSL compartidas también conservan al usuario dentro de LogBook
  // cuando pulsa Atrás: se vuelve a Inicio en lugar de abandonar el sitio.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('e') && !params.has('view_eqsl')) return;
    window.history.pushState({ logbookSharedEqsl: true }, '', window.location.href);
    const returnHomeOnBack = () => window.location.replace('/');
    window.addEventListener('popstate', returnHomeOnBack);
    return () => window.removeEventListener('popstate', returnHomeOnBack);
  }, []);
  // Si la última operación fue responder una eQSL, la próxima entrada debe empezar
  // en Inicio, incluso si el navegador vuelve a abrir un enlace antiguo.
  const returningAfterReply = localStorage.getItem('logbook_return_home_after_reply') === '1';
  if (returningAfterReply) {
    localStorage.removeItem('logbook_return_home_after_reply');
    if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
      window.history.replaceState({}, '', '/');
    }
  }

  const sharedParams = new URLSearchParams(window.location.search);
  if (!returningAfterReply && (sharedParams.has('e') || sharedParams.has('view_eqsl'))) return <EQSLViewErrorBoundary><ReceivedEQSLPage /></EQSLViewErrorBoundary>;
  return <InitialSdValidation><MainApp /></InitialSdValidation>;
}
