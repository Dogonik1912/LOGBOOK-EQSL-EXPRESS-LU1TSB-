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
import { Radio, Award, Globe, Send, Download, ChevronDown } from 'lucide-react';


const MAP_ACTIVITY_WINDOW_MS = 30 * 60 * 1000;

// Convierte un Maidenhead locator (4/6 caracteres) a coordenadas geográficas.
function locatorToLatLon(locator?: string): { lat: number; lon: number } | null {
  const value = String(locator || '').trim().toUpperCase();
  if (value.length < 4 || !/^[A-R]{2}[0-9]{2}([A-X]{2})?/.test(value)) return null;
  let lon = -180 + (value.charCodeAt(0) - 65) * 20;
  let lat = -90 + (value.charCodeAt(1) - 65) * 10;
  lon += Number(value[2]) * 2;
  lat += Number(value[3]);
  if (value.length >= 6) {
    lon += (value.charCodeAt(4) - 65) * (5 / 60);
    lat += (value.charCodeAt(5) - 65) * (2.5 / 60);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function mapPoint(locator?: string): { x: number; y: number } | null {
  const position = locatorToLatLon(locator);
  if (!position) return null;
  return { x: ((position.lon + 180) / 360) * 900, y: ((90 - position.lat) / 180) * 360 + 20 };
}

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
  const [mapClock, setMapClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setMapClock(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const myStationGrid = localStorage.getItem('user_grid') || '';
  const stationMapPoint = mapPoint(myStationGrid);
  const recentMapContacts = qsos.filter((q) => typeof q.mapActivityAt === 'number' && mapClock - q.mapActivityAt < MAP_ACTIVITY_WINDOW_MS && mapClock >= q.mapActivityAt && mapPoint(q.grid));
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
  const [registeredUsersCount, setRegisteredUsersCount] = useState<number | null>(null);
  const [combinedEqslCount, setCombinedEqslCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refreshDirectoryStats = async () => {
      try {
        const response = await fetch('/api/directory?action=count', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (active) {
          setRegisteredUsersCount(Number.isFinite(data.activeUsers) ? data.activeUsers : null);
          setCombinedEqslCount(Number.isFinite(data.totalActions) ? data.totalActions : null);
        }
      } catch { /* El directorio global puede no estar configurado todavía. */ }
    };
    void refreshDirectoryStats();
    const interval = window.setInterval(refreshDirectoryStats, 60000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);


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
        whatsappUsername: urlParams.get('wa_user') || '',
        telegram: urlParams.get('telegram') || '',
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

    return () => {
      window.removeEventListener('message', bridgeHandler);
    };
  }, []);

  // Guardar QSOs en localStorage cada vez que cambien
  const handleSaveQsos = (newQsos: QSO[]) => {
    setQsos(newQsos);
    localStorage.setItem('logbook_qsos', JSON.stringify(newQsos));
  };

  const handleAddQSO = (qso: QSO, openEQSL = true) => {
    const trackedQSO: QSO = { ...qso, mapActivityAt: Date.now() };
    const updated = [trackedQSO, ...qsos];
    handleSaveQsos(updated);
    // La carga simple guarda el contacto sin forzar el generador; la acción eQSL lo abre explícitamente.
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
      myCall: myCurrentCall,
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
            <div className="min-w-0"><div className="text-lg sm:text-xl font-bold font-mono text-white">{registeredUsersCount ?? '—'}</div><div className="text-[10px] sm:text-xs leading-tight text-slate-400">Estaciones activas eQSL</div></div>
          </div>
          <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex items-center gap-2">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg shrink-0"><Send className="w-4 h-4" /></div>
            <div className="min-w-0"><div className="text-lg sm:text-xl font-bold font-mono text-white">{combinedEqslCount ?? '—'}</div><div className="text-[10px] sm:text-xs leading-tight text-slate-400">Acciones registradas</div></div>
          </div>
          <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3">
            <div className="text-[10px] sm:text-xs leading-tight text-slate-400 mb-2">Ranking mundial</div>
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
            <span className="text-lg font-bold text-white">Mapamundi de actividad eQSL</span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-amber-400 transition-transform duration-300 ${showWorldMap ? 'rotate-180' : ''}`} />
          </button>
          <div
            id="world-map-panel"
            hidden={!showWorldMap}
            className="border-t border-slate-800"
          >
            <div className="grid gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#071525] p-2 sm:p-4">
                <svg viewBox="0 0 900 440" role="img" aria-label="Mapamundi ilustrativo" className="h-auto w-full">
                  <defs><pattern id="worldGrid" width="75" height="55" patternUnits="userSpaceOnUse"><path d="M75 0H0V55" fill="none" stroke="#24445d" strokeWidth="1"/></pattern></defs>
                  <rect width="900" height="440" rx="12" fill="#0b2033"/><rect width="900" height="440" fill="url(#worldGrid)"/>
                  <g fill="#214d57" stroke="#3e7780" strokeWidth="2">
                    <path d="M72 91L104 61 151 52 184 67 213 64 242 88 269 96 283 123 261 143 242 148 228 175 203 184 192 213 171 225 159 255 141 247 128 215 111 195 97 162 77 144 64 116Z"/>
                    <path d="M222 235L251 224 278 239 290 270 279 301 267 333 250 369 232 391 219 359 211 326 199 294 203 266Z"/>
                    <path d="M362 89L391 70 424 75 444 91 464 89 483 105 508 105 523 127 507 144 482 141 467 160 447 153 434 174 414 163 402 139 381 127 366 109Z"/>
                    <path d="M407 175L437 160 466 174 486 206 478 244 459 278 445 315 427 339 411 307 400 273 389 235 391 202Z"/>
                    <path d="M479 84L521 58 574 49 624 64 664 70 704 91 744 91 776 117 804 147 786 169 752 165 728 187 693 180 671 202 643 191 624 165 598 156 577 135 548 141 525 124 498 126Z"/>
                    <path d="M677 248L706 235 738 245 758 267 748 291 721 306 695 294 678 274Z"/>
                  </g>
                  {recentMapContacts.map((contact) => {
                    const target = mapPoint(contact.grid);
                    if (!target) return null;
                    const start = stationMapPoint;
                    return (
                      <g key={contact.id}>
                        {start && <line x1={start.x} y1={start.y} x2={target.x} y2={target.y} stroke="#22c55e" strokeWidth="6" strokeLinecap="round" strokeDasharray="3 10" opacity="0.98" />}
                        <circle cx={target.x} cy={target.y} r="6" fill="#22c55e" stroke="#dcfce7" strokeWidth="2" />
                        {start && <circle cx={start.x} cy={start.y} r="7" fill="#16a34a" stroke="#dcfce7" strokeWidth="2" />}
                        <title>{contact.callsign} · {contact.grid} · contacto reciente</title>
                      </g>
                    );
                  })}
                  <text x="450" y="415" textAnchor="middle" fill="#8aa8bb" fontSize="13">CONTACTOS DE LOS ÚLTIMOS 30 MINUTOS</text>
                </svg>
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
        onSaveQSO={handleAddQSO}
      />
    </div>
  );
}

export default function App() {
  if (new URLSearchParams(window.location.search).has('view_eqsl')) return <ReceivedEQSLPage />;
  return <MainApp />;
}
