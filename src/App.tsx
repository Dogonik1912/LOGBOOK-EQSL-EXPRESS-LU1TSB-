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
import { QRZLoginModal } from './components/QRZLoginModal';
import { UserSettingsModal } from './components/UserSettingsModal';
import { EQSLCardModal } from './components/EQSLCardModal';
import { ReplyEQSLModal } from './components/ReplyEQSLModal';
import { Radio, Award, Globe, Zap, Send, Info, ArrowRightLeft } from 'lucide-react';

export default function App() {
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

  const [isQRZModalOpen, setIsQRZModalOpen] = useState(false);
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
    const handleQRZAuthRequired = () => setIsQRZModalOpen(true);
    window.addEventListener('qrz-auth-required', handleQRZAuthRequired);

    // Revisar si vino desde un enlace de respuesta compartida
    const urlParams = new URLSearchParams(window.location.search);
    const forceQRZConnect = urlParams.get('connect_qrz') === '1';
    const replyToParam = urlParams.get('reply_to');

    // Mostrar el formulario solo si se pidió expresamente o faltan credenciales.
    // Las credenciales no persistentes viven en sessionStorage.
    const hasQRZCredentials = Boolean(
      (sessionStorage.getItem('qrz_user') || localStorage.getItem('qrz_user')) &&
      (sessionStorage.getItem('qrz_pass') || localStorage.getItem('qrz_pass'))
    );
    if (forceQRZConnect) {
      setIsQRZModalOpen(true);
    } else if (replyToParam) {
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
    } else if (!hasQRZCredentials) {
      // Si no hay credenciales activas, solicitar conexión al abrir.
      setIsQRZModalOpen(true);
    } else if (!replyToParam) {
      // Las credenciales antiguas pueden estar guardadas sin haber sido validadas.
      // Verificar con QRZ en segundo plano y pedir intervención solo si la sesión falla.
      const savedUser = sessionStorage.getItem('qrz_user') || localStorage.getItem('qrz_user') || '';
      const savedPass = sessionStorage.getItem('qrz_pass') || localStorage.getItem('qrz_pass') || '';
      fetch('/api/qrz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: savedUser, password: savedPass }),
      })
        .then(async (response) => {
          const xml = await response.text();
          const doc = new DOMParser().parseFromString(xml, 'text/xml');
          const key = doc.querySelector('Key')?.textContent?.trim();
          if (!response.ok || !key) setIsQRZModalOpen(true);
        })
        .catch(() => setIsQRZModalOpen(true));
    }

    // Inicializar callsign por defecto si no existe
    if (!localStorage.getItem('user_callsign')) {
      localStorage.setItem('user_callsign', DEFAULT_CALLSIGN);
    }

    return () => window.removeEventListener('qrz-auth-required', handleQRZAuthRequired);
  }, []);

  // Guardar QSOs en localStorage cada vez que cambien
  const handleSaveQsos = (newQsos: QSO[]) => {
    setQsos(newQsos);
    localStorage.setItem('logbook_qsos', JSON.stringify(newQsos));
  };

  const updatePersistedQSO = (id: string, patch: Partial<QSO>) => {
    let saved: QSO[] = [];
    try { saved = JSON.parse(localStorage.getItem('logbook_qsos') || '[]') as QSO[]; } catch {}
    const updated = saved.map((item) => item.id === id ? { ...item, ...patch } : item);
    localStorage.setItem('logbook_qsos', JSON.stringify(updated));
    setQsos(updated);
  };

  const handleUploadToQRZ = async (qso: QSO, quiet = false) => {
    if (qso.qrzUploaded) return;
    const key = localStorage.getItem('qrz_logbook_key') || '';
    if (!key) {
      if (!quiet) alert('Configurá la clave API del libro de guardia QRZ en Ajustes.');
      return;
    }
    const stationCallsign = localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN;
    try {
      const response = await fetch('/api/qrz-logbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key, callsign: qso.callsign, stationCallsign, date: qso.date, time: qso.time,
          band: qso.band, frequency: qso.frequency, mode: qso.mode, rstSent: qso.rstSent, rstRcvd: qso.rstRcvd,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'QRZ no confirmó la carga.');
      updatePersistedQSO(qso.id, { qrzUploaded: true, qrzUploadError: '' });
      if (!quiet) alert(`QSO con ${qso.callsign} cargado en QRZ Logbook correctamente.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al subir el QSO a QRZ.';
      updatePersistedQSO(qso.id, { qrzUploadError: message });
      if (!quiet) alert(`No se pudo cargar ${qso.callsign} en QRZ: ${message}`);
    }
  };

  const handleUploadToEQSL = async (qso: QSO) => {
    if (qso.eqslUploaded) return;
    const username = localStorage.getItem('eqsl_user') || '';
    const password = localStorage.getItem('eqsl_pass') || '';
    if (!username || !password) {
      alert('Configurá tu usuario y contraseña de eQSL.cc en Ajustes antes de enviar.');
      return;
    }
    if (!window.confirm(`¿Enviar únicamente el QSO con ${qso.callsign} a eQSL.cc?\\n\\n${qso.date} ${qso.time} UTC · ${qso.band} · ${qso.mode}`)) return;
    const stationCallsign = localStorage.getItem('user_callsign') || DEFAULT_CALLSIGN;
    try {
      const response = await fetch('/api/eqsl-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username, password, callsign: qso.callsign, stationCallsign, date: qso.date, time: qso.time,
          band: qso.band, frequency: qso.frequency, mode: qso.mode, rstSent: qso.rstSent, rstRcvd: qso.rstRcvd, grid: qso.grid,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'eQSL.cc no confirmó la carga.');
      updatePersistedQSO(qso.id, { eqslUploaded: true, qslSent: true });
      alert(`QSO con ${qso.callsign} enviado individualmente a eQSL.cc.\\n${data.details || data.message || ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al enviar a eQSL.cc.';
      alert(`No se pudo enviar el QSO con ${qso.callsign}: ${message}`);
    }
  };

  const handleAddQSO = (qso: QSO) => {
    const updated = [qso, ...qsos];
    handleSaveQsos(updated);
    if (localStorage.getItem('qrz_auto_upload') === 'true' && localStorage.getItem('qrz_logbook_key')) {
      void handleUploadToQRZ(qso, true);
    }
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

  const handleMarkEQSLSent = (id: string) => {
    const updated = qsos.map((q) => (q.id === id ? { ...q, qslSent: true } : q));
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
        onOpenQRZModal={() => setIsQRZModalOpen(true)}
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
          onOpenQRZModal={() => setIsQRZModalOpen(true)}
        />

        {/* Tabla Live Log (con columna Email editable, filtros y acciones) */}
        <LiveLog
          qsos={qsos}
          onUpdateQSO={handleUpdateQSO}
          onDeleteQSO={handleDeleteQSO}
          onOpenEQSL={(qso) => setActiveEQSLQSO(qso)}
          onImportADIF={handleImportADIF}
          onOpenReply={handleOpenReplyForQSO}
          onUploadToQRZ={handleUploadToQRZ}
          onUploadToEQSL={handleUploadToEQSL}
        />
      </main>

      {/* PRIORIDAD 1: Footer con crédito discreto */}
      <Footer />

      {/* Modales */}
      {/* PRIORIDAD 4: Modal de Conexión QRZ */}
      <QRZLoginModal
        isOpen={isQRZModalOpen}
        onClose={() => setIsQRZModalOpen(false)}
        onSaved={() => {
          setRefreshKey((k) => k + 1);
        }}
      />

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
        onMarkSent={handleMarkEQSLSent}
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
