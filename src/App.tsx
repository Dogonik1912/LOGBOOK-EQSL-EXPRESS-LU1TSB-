/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { QSO, DEFAULT_CALLSIGN } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { NewQSOForm } from './components/NewQSOForm';
import { LiveLog } from './components/LiveLog';
import { UserSettingsModal } from './components/UserSettingsModal';
import { EQSLCardModal } from './components/EQSLCardModal';
import { ReplyEQSLModal } from './components/ReplyEQSLModal';
import { Radio, Award, Globe, Zap, Send, Info, ArrowRightLeft } from 'lucide-react';

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
  } | null>(null);
  const [, setRefreshKey] = useState(0);

  // PRIORIDAD 4: Al cargar la app, si NO existen en localStorage las claves 'qrz_user' y 'qrz_pass'
  // y 'qrz_skipped' no existe, mostrar el modal de aviso
  // Y verificar si se abrió mediante un enlace de responder eQSL (?reply_to=...)
  useEffect(() => {
    // Revisar si vino desde un enlace de respuesta compartida
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const replyToParam = urlParams.get('reply_to');
    const profileImportCall = urlParams.get('qrz_call') || hashParams.get('qrz_call');
    // El puente desde QRZ usa el fragmento (#), que no se envía al servidor en la petición HTTP.
    // Se elimina tras leerlo para no dejar el correo en la barra de direcciones.
    if (profileImportCall) {
      const cleanParams = new URLSearchParams(urlParams);
      const cleanHash = new URLSearchParams(hashParams);
      ['qrz_call', 'qrz_email', 'qrz_name', 'qrz_country', 'qrz_grid'].forEach((key) => {
        cleanParams.delete(key);
        cleanHash.delete(key);
      });
      const nextQuery = cleanParams.toString();
      const nextHash = cleanHash.toString();
      window.history.replaceState({}, '', window.location.pathname + (nextQuery ? `?${nextQuery}` : '') + (nextHash ? `#${nextHash}` : ''));
    }

    // La ventana de inicio de sesión QRZ se muestra siempre al abrir la aplicación.
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
      });
      setIsReplyModalOpen(true);
    }

    // Recibir solo datos que el usuario decidió enviar desde la ficha QRZ abierta.
    // Se valida el origen; no se transfieren cookies ni credenciales.
    const bridgeHandler = (event: MessageEvent) => {
      if (!['https://www.qrz.com', 'https://qrz.com'].includes(event.origin)) return;
      if (event.data?.type !== 'LOGBOOK_QRZ_PROFILE') return;
      const profile = event.data.profile || {};
      const call = String(profile.call || '').toUpperCase().trim();
      if (!/^[A-Z0-9/]{3,20}$/.test(call)) return;
      window.dispatchEvent(new CustomEvent('qrz-profile-import', {
        detail: {
          call,
          email: String(profile.email || ''),
          name: String(profile.name || ''),
          country: String(profile.country || ''),
          grid: String(profile.grid || ''),
        },
      }));
    };
    window.addEventListener('message', bridgeHandler);

    // Inicializar callsign por defecto si no existe
    if (!localStorage.getItem('user_callsign')) {
      localStorage.setItem('user_callsign', DEFAULT_CALLSIGN);
    }

    return () => {
      window.removeEventListener('message', bridgeHandler);
    };
  }, []);

  // Guardar QSOs en localStorage cada vez que cambien
  const handleSaveQsos = (newQsos: QSO[]) => {
    setQsos(newQsos);
    localStorage.setItem('logbook_qsos', JSON.stringify(newQsos));
  };

  const handleAddQSO = (qso: QSO) => {
    const updated = [qso, ...qsos];
    handleSaveQsos(updated);
    // Tras guardar, abrir siempre el generador eQSL para que el usuario pueda elegir diseño
    // y completar el envío por email o WhatsApp, incluso si el correo no está disponible.
    setActiveEQSLQSO(qso);
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
    const updated = [...importedQsos, ...qsos];
    handleSaveQsos(updated);
  };

  const handleSettingsUpdated = () => {
    setRefreshKey((k) => k + 1);
  };

  // Estadísticas rápidas
  const uniqueCallsigns = new Set(qsos.map((q) => q.callsign)).size;
  const uniqueCountries = new Set(qsos.map((q) => q.country).filter(Boolean)).size;
  const eQslSentCount = qsos.filter((q) => q.qslSent).length;

  const handleOpenReplyForQSO = (qso: QSO) => {
    const myCurrentCall = localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN;
    setReplyData({
      replyToCall: qso.callsign,
      myCall: myCurrentCall,
      date: qso.date,
      time: qso.time,
      band: qso.band,
      frequency: qso.frequency,
      mode: qso.mode,
      rst: qso.rstRcvd || '59',
      email: qso.email,
      whatsapp: qso.whatsapp,
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
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenReplyModal={handleOpenManualReply}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner de resumen de estación */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-white">{qsos.length}</div>
              <div className="text-xs text-slate-400">Total QSOs</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-lg shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-white">{uniqueCallsigns}</div>
              <div className="text-xs text-slate-400">Indicativos únicos</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-white">{uniqueCountries}</div>
              <div className="text-xs text-slate-400">Países / DXCC</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-lg shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-white">{eQslSentCount}</div>
              <div className="text-xs text-slate-400">eQSLs Emitidas</div>
            </div>
          </div>
        </div>

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
        onClose={() => setIsSettingsModalOpen(false)}
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
        onSaveQSO={handleAddQSO}
      />
    </div>
  );
}

export default function App() {
  if (new URLSearchParams(window.location.search).has('view_eqsl')) return <ReceivedEQSLPage />;
  return <MainApp />;
}
