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
    // Publicar el QSO como spot compartido, independientemente de que se envíe eQSL.
    // La clave única en Supabase evita spots duplicados al actualizar un contacto existente.
    void publishQsoSpot(trackedQSO);
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

      {/* Panel principal rediseñado: navegación clara y módulos enmarcados */}
      <main className="logbook-dashboard flex-1 w-full mx-auto px-3 sm:px-6 lg:px-8 pb-10">
        <section className="dashboard-welcome" aria-label="Bienvenida">
          <div className="welcome-copy">
            <span className="welcome-eyebrow"><span className="status-light" /> ESTACIÓN DIGITAL · LOGBOOK eQSL EXPRESS</span>
            <h1>Todo tu mundo de radio, <em>en un solo lugar.</em></h1>
            <p>Registra contactos, comparte tus eQSL y mantente conectado con la comunidad.</p>
          </div>
          <div className="welcome-mark" aria-hidden="true">
            <span className="mark-orbit orbit-one" /><span className="mark-orbit orbit-two" />
            <span className="mark-core">LB</span><span className="mark-signal">)))</span>
          </div>
        </section>

        <nav className="dashboard-nav" aria-label="Accesos rápidos">
          <a href="#bandeja"><span>✉</span> eQSL y mensajes</a>
          <a href="#comunidad"><span>◉</span> Comunidad</a>
          <a href="#spots"><span>⌁</span> Actividad de radio</a>
          <a href="#herramientas"><span>⌘</span> Herramientas</a>
          <a href="#nuevo-qso"><span>＋</span> Cargar QSO</a>
          <a href="#logbook"><span>▤</span> Libro de guardia</a>
        </nav>

        <section id="bandeja" className="dashboard-section">
          <div className="section-heading">
            <div><span className="section-kicker">TU ESTACIÓN</span><h2>Mensajes y eQSL</h2><p>Ten a mano tus tarjetas recibidas y conversaciones privadas.</p></div>
            <span className="section-index">01</span>
          </div>
          <div className="dashboard-module-grid">
            <div className="dashboard-module"><EQSLMailbox /></div>
            <div className="dashboard-module"><PrivateMessages /></div>
          </div>
        </section>

        <section id="comunidad" className="dashboard-section">
          <div className="section-heading">
            <div><span className="section-kicker">EN CONTACTO</span><h2>Comunidad de radio</h2><p>Conversá con otros operadores y compartí la actividad.</p></div>
            <span className="section-index">02</span>
          </div>
          <div className="dashboard-module dashboard-module-wide"><CommunityChat /></div>
        </section>

        <section id="spots" className="dashboard-section">
          <div className="section-heading">
            <div><span className="section-kicker">AL AIRE</span><h2>Actividad de radio</h2><p>Consultá la actividad disponible desde los módulos de la aplicación.</p></div>
            <span className="section-index">03</span>
          </div>
          <div className="dashboard-module dashboard-module-wide"><LiveSpots /></div>
        </section>

        <section id="herramientas" className="dashboard-section">
          <div className="section-heading">
            <div><span className="section-kicker">EXPLORAR</span><h2>Herramientas del operador</h2><p>Utilidades prácticas, reunidas en un espacio ordenado.</p></div>
            <span className="section-index">04</span>
          </div>
          <div className="dashboard-tools-grid">
            <div className="dashboard-module"><MorseDecoder /></div>
            <div className="dashboard-module"><SDRSmart /></div>
          </div>
        </section>

        <section id="nuevo-qso" className="dashboard-section dashboard-section-featured">
          <div className="section-heading">
            <div><span className="section-kicker">REGISTRO DE CONTACTOS</span><h2>Nuevo QSO</h2><p>Cargá los datos del contacto y continuá con el envío de tu eQSL.</p></div>
            <span className="section-index">05</span>
          </div>
          <div className="dashboard-module dashboard-module-wide"><NewQSOForm onAddQSO={handleAddQSO} /></div>
        </section>

        <section id="logbook" className="dashboard-section">
          <div className="section-heading">
            <div><span className="section-kicker">TU HISTORIAL</span><h2>Libro de guardia</h2><p>Revisá, editá y gestioná tus contactos registrados.</p></div>
            <span className="section-index">06</span>
          </div>
          <div className="dashboard-module dashboard-module-wide">
            <LiveLog qsos={qsos} onUpdateQSO={handleUpdateQSO} onDeleteQSO={handleDeleteQSO} onOpenEQSL={(qso) => setActiveEQSLQSO(qso)} onImportADIF={handleImportADIF} onOpenReply={handleOpenReplyForQSO} />
          </div>
        </section>
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
  useEffect(() => startAutomaticUiTranslation(), []);
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
  return <MainApp />;
}
