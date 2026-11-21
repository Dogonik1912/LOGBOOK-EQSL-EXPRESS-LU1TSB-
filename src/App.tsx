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
import { PendingEqslDeliveries } from './components/PendingEqslDeliveries';
import { Send, Waves, ExternalLink } from 'lucide-react';
import { CommunityChat } from './components/CommunityChat';
import { MorseDecoder } from './components/MorseDecoder';
import { SDRSmart } from './components/SDRSmart';
import { PrivateMessages } from './components/PrivateMessages';
import { LiveSpots, publishQsoSpot } from './components/LiveSpots';
import { DistanceCalculator } from './components/DistanceCalculator';
import { startAutomaticUiTranslation } from './services/appLanguage';
import { getUserCallsign } from './services/qrzService';
import { InitialSdValidation } from './components/InitialSdValidation';
import { PropagationReport } from './components/PropagationReport';
import { PatentGenerator } from './components/PatentGenerator';
import { UserDirectory } from './components/UserDirectory';
import { UserPublicProfile } from './components/UserPublicProfile';
import { PatentDownloadedPage, PatentSharePage } from './components/PatentSharePage';


interface ContestLogRecord { id: string; name: string; type: string; finishedAt: string; qsos?: QSO[]; }
interface LLOTAActivityLog { id: string; name: string; reference: string; activityType: string; startedAt: string; finishedAt: string; qsos: QSO[]; }

const QSO_BACKUP_DB = 'logbook-offline-qso';
const QSO_BACKUP_STORE = 'qsos';

const openQsoBackupDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) { reject(new Error('IndexedDB no disponible')); return; }
  const request = indexedDB.open(QSO_BACKUP_DB, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(QSO_BACKUP_STORE)) {
      request.result.createObjectStore(QSO_BACKUP_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir el respaldo del Libro de Guardia'));
});

const saveQsoBackup = async (qsos: QSO[]) => {
  const db = await openQsoBackupDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QSO_BACKUP_STORE, 'readwrite');
    tx.objectStore(QSO_BACKUP_STORE).put(qsos, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el respaldo de QSO'));
    tx.onabort = () => reject(tx.error || new Error('Se canceló el respaldo de QSO'));
  });
  db.close();
};

const loadQsoBackup = async (): Promise<QSO[] | null> => {
  const db = await openQsoBackupDb();
  try {
    return await new Promise<QSO[] | null>((resolve, reject) => {
      const request = db.transaction(QSO_BACKUP_STORE, 'readonly').objectStore(QSO_BACKUP_STORE).get('current');
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as QSO[] : null);
      request.onerror = () => reject(request.error || new Error('No se pudo leer el respaldo de QSO'));
    });
  } finally {
    db.close();
  }
};
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

  // IndexedDB mantiene una segunda copia persistente del log para poder
  // recuperarlo si localStorage se borra, se corrompe o el navegador lo bloquea.
  useEffect(() => {
    let active = true;
    let localLogIsValid = false;
    try {
      const raw = localStorage.getItem('logbook_qsos');
      if (raw) {
        const parsed = JSON.parse(raw);
        localLogIsValid = Array.isArray(parsed);
      }
    } catch { /* Intentar recuperar la copia durable de IndexedDB. */ }

    if (!localLogIsValid) {
      void loadQsoBackup().then((backup) => {
        if (!active || !backup) return;
        const safeBackup = backup.filter((q) => q && typeof q.id === 'string' && typeof q.callsign === 'string');
        setQsos(safeBackup);
        try { localStorage.setItem('logbook_qsos', JSON.stringify(safeBackup)); } catch { /* IndexedDB conserva la copia. */ }
      }).catch((error) => console.warn('No se pudo recuperar el respaldo local de QSO:', error));
    }
    return () => { active = false; };
  }, []);

  const [contestLogs, setContestLogs] = useState<ContestLogRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('logbook_contest_logs') || '[]') as ContestLogRecord[]; }
    catch { return []; }
  });
  const [llotaLogs, setLLOTALogs] = useState<LLOTAActivityLog[]>(() => { try { return JSON.parse(localStorage.getItem('logbook_llota_activity_logs') || '[]') as LLOTAActivityLog[]; } catch { return []; } });
  const handleFinishLLOTA = (log: Omit<LLOTAActivityLog, 'qsos'>): boolean => {
    const snapshot = qsos.filter(q => q.llotaActivityId === log.id).map(q => ({ ...q }));
    if (!snapshot.length) { window.alert('No se encontraron QSO de esta actividad. La referencia seguirá activa para proteger los datos.'); return false; }
    const archived: LLOTAActivityLog = { ...log, qsos: snapshot, name: log.name || log.reference };
    const updated = [archived, ...llotaLogs.filter(item => item.id !== log.id)];
    try {
      localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(updated));
      const check = JSON.parse(localStorage.getItem('logbook_llota_activity_logs') || '[]') as LLOTAActivityLog[];
      const saved = check.find(item => item.id === log.id);
      if (!saved || saved.qsos?.length !== snapshot.length) throw new Error('Verificación de archivo fallida');
      setLLOTALogs(updated);
      return true;
    } catch (error) { console.error(error); window.alert('No se pudo verificar el archivo LLOTA. La actividad sigue activa.'); return false; }
  };
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

  useEffect(() => {
    const openGridSettings = () => handleOpenSettings();
    window.addEventListener('open-user-settings-grid', openGridSettings);
    return () => window.removeEventListener('open-user-settings-grid', openGridSettings);
  }, []);

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
    const serialized = JSON.stringify(newQsos);
    try {
      localStorage.setItem('logbook_qsos', serialized);
    } catch (error) {
      console.warn('No se pudo actualizar localStorage; se conserva el respaldo IndexedDB:', error);
    }
    // Guardar también en IndexedDB antes de depender de cualquier servicio remoto.
    void saveQsoBackup(newQsos).catch((error) => {
      console.error('No se pudo guardar la segunda copia local de QSO:', error);
    });
  };

  const handleAddQSO = (qso: QSO, openEQSL = true, publishSpot = true, allowDuplicate = false) => {
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
    const trackedQSO: QSO = existing && !allowDuplicate && !qso.llotaActivityId
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
    const updated = existing && !allowDuplicate && !qso.llotaActivityId
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

  const syncArchivedSnapshotsAfterQsoDeletion = (ids: string[]) => {
    const idSet = new Set(ids);
    const nextContestLogs = contestLogs.map((log) => ({ ...log, qsos: log.qsos?.filter((q) => !idSet.has(q.id)) }));
    const nextLLOTALogs = llotaLogs.map((log) => ({ ...log, qsos: log.qsos.filter((q) => !idSet.has(q.id)) }));
    try {
      localStorage.setItem('logbook_contest_logs', JSON.stringify(nextContestLogs));
      localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(nextLLOTALogs));
      setContestLogs(nextContestLogs);
      setLLOTALogs(nextLLOTALogs);
    } catch (error) {
      console.error('No se pudieron sincronizar los archivos después de borrar QSO:', error);
      window.alert('Los contactos se quitaron del Libro de Guardia, pero no se pudo actualizar algún archivo guardado. Revisá el almacenamiento local antes de continuar.');
    }
  };

  const handleDeleteQSO = (id: string) => {
    if (window.confirm('¿Seguro que deseás eliminar este contacto del libro de guardia?')) {
      handleSaveQsos(qsos.filter((q) => q.id !== id));
      syncArchivedSnapshotsAfterQsoDeletion([id]);
    }
  };

  const handleDeleteQSOs = (ids: string[]) => {
    if (!ids.length) return;
    if (window.confirm(`¿Eliminar definitivamente ${ids.length} QSO seleccionados? Esta acción no se puede deshacer.`)) {
      const idSet = new Set(ids);
      handleSaveQsos(qsos.filter((q) => !idSet.has(q.id)));
      syncArchivedSnapshotsAfterQsoDeletion(ids);
    }
  };

  const handleDeleteArchivedLog = (kind: 'contest' | 'llota', id: string) => {
    if (kind === 'llota') {
      const log = llotaLogs.find((item) => item.id === id);
      if (!log) return;
      const updatedLogs = llotaLogs.filter((item) => item.id !== id);
      try {
        localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(updatedLogs));
        setLLOTALogs(updatedLogs);
        handleSaveQsos(qsos.filter((q) => q.llotaActivityId !== id));
      } catch (error) {
        console.error('No se pudo eliminar el archivo LLOTA:', error);
        window.alert('No se pudo actualizar el archivo LLOTA. No se confirmó la eliminación.');
      }
      return;
    }

    const log = contestLogs.find((item) => item.id === id);
    if (!log) return;
    const archivedIds = new Set((log.qsos || []).map((q) => q.id));
    const updatedQSOs = qsos.filter((q) => !archivedIds.has(q.id) && !(q.contestLogId === id || (!q.contestLogId && q.contestLogName === log.name)));
    const updatedLogs = contestLogs.filter((item) => item.id !== id);
    try {
      localStorage.setItem('logbook_contest_logs', JSON.stringify(updatedLogs));
      setContestLogs(updatedLogs);
      handleSaveQsos(updatedQSOs);
      const nextLLOTALogs = llotaLogs.map((item) => ({ ...item, qsos: item.qsos.filter((q) => !archivedIds.has(q.id)) }));
      localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(nextLLOTALogs));
      setLLOTALogs(nextLLOTALogs);
    } catch (error) {
      console.error('No se pudo eliminar el archivo del concurso:', error);
      window.alert('No se pudo actualizar el archivo. No se confirmó la eliminación.');
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
        <div className="mb-3 flex items-center">
          <details className="group relative">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-cyan-300 bg-gradient-to-r from-cyan-950 via-sky-900 to-blue-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300">
              <Waves className="h-5 w-5" aria-hidden="true" />
              LLOTA oficial
              <span className="text-xs transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute left-0 top-full z-30 mt-2 flex min-w-56 flex-col gap-1 rounded-xl border border-cyan-300/40 bg-slate-950 p-2 text-white shadow-xl">
              <a href="https://llota.app/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-white/10">
                Abrir sitio oficial <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href="https://chat.whatsapp.com/CsQnKXyA49CD5zeyLsKNEN?s=cl&p=a&mlu=4&ilr=4" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-green-300 transition hover:bg-white/10">
                Unirse al grupo oficial de WhatsApp <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href="https://llota.app/referencias.html" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-white/10">
                Ver referencias oficiales <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </details>
        </div>
        <PendingEqslDeliveries />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <EQSLMailbox />
          <PrivateMessages />
        </div>

        <CommunityChat />

        <LiveSpots />

        <DistanceCalculator />

        <MorseDecoder />

        <SDRSmart />

        {/* Formulario de Nuevo QSO (con precarga de banda, fecha, hora y modo) */}
        <NewQSOForm
          onAddQSO={handleAddQSO}
          onFinishContest={handleFinishContest}
          onFinishLLOTA={handleFinishLLOTA}
          hasDuplicateQSO={(candidate) => qsos.some(q => q.llotaActivityId === candidate.llotaActivityId && q.callsign.trim().toUpperCase() === candidate.callsign.trim().toUpperCase() && q.date === candidate.date && q.time === candidate.time && q.frequency === candidate.frequency && q.mode === candidate.mode)}
        />

        {/* Tabla Live Log (con columna Email editable, filtros y acciones) */}
        <LiveLog
          qsos={qsos}
          contestLogs={contestLogs}
          llotaLogs={llotaLogs}
          onUpdateQSO={handleUpdateQSO}
          onDeleteQSO={handleDeleteQSO}
          onDeleteQSOs={handleDeleteQSOs}
          onDeleteArchivedLog={handleDeleteArchivedLog}
          onOpenEQSL={(qso) => setActiveEQSLQSO(qso)}
          onImportADIF={handleImportADIF}
          onOpenReply={handleOpenReplyForQSO}
        />
      </main>

      {/* Informe de propagación al final del contenido, antes del pie de página. */}
      <PropagationReport />
      <PatentGenerator />
      <UserDirectory />
      <UserPublicProfile />

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
  if (sharedParams.has('patent')) return <PatentSharePage />;
  if (sharedParams.has('patentDownloaded')) return <PatentDownloadedPage />;
  if (!returningAfterReply && (sharedParams.has('e') || sharedParams.has('view_eqsl'))) return <EQSLViewErrorBoundary><ReceivedEQSLPage /></EQSLViewErrorBoundary>;
  return <InitialSdValidation><MainApp /></InitialSdValidation>;
}
