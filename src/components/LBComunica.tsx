import React, { useEffect, useMemo, useState } from 'react';
import { Headphones, Mic, Users, Wifi, X } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type RoomParticipant = {
  callsign: string;
  status?: string;
  joinedAt?: string;
};

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

const readActiveCallsign = () => (
  localStorage.getItem('community_chat_active_callsign')
  || localStorage.getItem('community_chat_sd')
  || ''
).trim().toUpperCase();

export const LBComunica: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCallsign, setActiveCallsign] = useState(readActiveCallsign);
  const [identityToken, setIdentityToken] = useState('');
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [mobileListOpen, setMobileListOpen] = useState(false);

  useEffect(() => {
    const updateIdentity = (event?: Event) => {
      const eventCallsign = event instanceof CustomEvent
        ? String((event.detail as { callsign?: string } | undefined)?.callsign || '')
        : '';
      setActiveCallsign((eventCallsign || readActiveCallsign()).trim().toUpperCase());
    };
    window.addEventListener('community-active-identity-changed', updateIdentity);
    window.addEventListener('community-account-identities-loaded', updateIdentity);
    window.addEventListener('user-profile-updated', updateIdentity);
    window.addEventListener('storage', updateIdentity);
    return () => {
      window.removeEventListener('community-active-identity-changed', updateIdentity);
      window.removeEventListener('community-account-identities-loaded', updateIdentity);
      window.removeEventListener('user-profile-updated', updateIdentity);
      window.removeEventListener('storage', updateIdentity);
    };
  }, []);

  const isElevenMeters = useMemo(
    () => is11MeterStationIdentifier(activeCallsign),
    [activeCallsign]
  );
  const roomKey = isElevenMeters ? '11m' : 'ham';
  const roomTitle = isElevenMeters ? '11 METROS' : 'RADIOAFICIONADOS';

  const openRoom = () => {
    const currentIdentity = readActiveCallsign() || activeCallsign;
    if (currentIdentity) setActiveCallsign(currentIdentity);
    let token = localStorage.getItem('community_chat_identity_token') || '';
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem('community_chat_identity_token', token);
    }
    setIdentityToken(token);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!activeCallsign || !identityToken) {
      setConnection('error');
      return;
    }
    const client = supabase;
    if (!client) {
      setConnection('error');
      return;
    }

    let mounted = true;
    setConnection('connecting');
    setParticipants([]);

    const channel = client.channel(`lb-comunica:${roomKey}`, {
      config: { presence: { key: identityToken } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        if (!mounted) return;
        const state = channel.presenceState<RoomParticipant>();
        const all = Object.values(state).flat();
        const unique = new Map<string, RoomParticipant>();
        all.forEach((person) => {
          const call = String(person.callsign || '').trim().toUpperCase();
          if (call) unique.set(call, { ...person, callsign: call });
        });
        setParticipants(Array.from(unique.values()).sort((a, b) => a.callsign.localeCompare(b.callsign)));
      })
      .subscribe(async (status) => {
        if (!mounted) return;
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              callsign: activeCallsign,
              status: 'Escuchando',
              joinedAt: new Date().toISOString(),
            });
            if (mounted) setConnection('connected');
          } catch {
            if (mounted) setConnection('error');
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('error');
        }
      });

    return () => {
      mounted = false;
      void client.removeChannel(channel);
    };
  }, [isOpen, activeCallsign, identityToken, roomKey]);

  const closeRoom = () => {
    setIsOpen(false);
    setConnection('idle');
    setParticipants([]);
  };

  return (
    <>
      <button
        type="button"
        onClick={openRoom}
        className="mb-3 flex min-h-11 w-full flex-col items-center justify-center rounded-lg border border-emerald-300 bg-gradient-to-r from-emerald-950 via-teal-900 to-cyan-900 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:text-sm"
        aria-label="LB COMUNICACION, pulsa y habla"
      >
        <span className="inline-flex items-center gap-2">
          <Headphones className="h-5 w-5 shrink-0" aria-hidden="true" />
          LB COMUNICACION
        </span>
        <span className="mt-0.5 text-xs font-semibold sm:text-sm">pulsa y habla</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="lb-comunica-title">
          <section className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-emerald-400/40 bg-slate-950 text-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <h2 id="lb-comunica-title" className="text-base font-bold tracking-wide">LB COMUNICACION</h2>
                <p className="text-xs font-semibold text-emerald-300">Sala {roomTitle}</p>
              </div>
              <button type="button" onClick={closeRoom} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Salir de la sala">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-emerald-300" />
                Usuarios conectados
              </div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-bold tabular-nums text-emerald-300">
                {connection === 'connected' ? participants.length : '—'}
              </span>
            </div>

            {!activeCallsign ? (
              <div className="p-6 text-center">
                <p className="font-semibold">Primero debes validar tu SD o indicativo en el chat general.</p>
                <p className="mt-2 text-sm text-slate-400">Al volver a entrar, LB COMUNICACION seleccionará automáticamente tu sala.</p>
              </div>
            ) : (
              <div className="grid min-h-0 gap-4 p-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
                <aside className="min-w-0">
                  <button type="button" onClick={() => setMobileListOpen((value) => !value)} className="mb-2 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold md:hidden">
                    Usuarios de la sala <span className="text-emerald-300">{participants.length}</span>
                  </button>
                  <div className={`${mobileListOpen ? 'block' : 'hidden'} md:block`}>
                    <h3 className="mb-2 hidden text-sm font-semibold text-slate-300 md:block">Participantes</h3>
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/70 p-2 md:max-h-[52vh]">
                      {participants.length ? participants.map((person) => (
                        <div key={person.callsign} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="mr-2" aria-hidden="true">{flagForCallsign(person.callsign, undefined, is11MeterStationIdentifier(person.callsign))}</span>
                            <span className="font-semibold">{person.callsign}</span>
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">Escuchando</span>
                        </div>
                      )) : (
                        <p className="px-2 py-4 text-center text-sm text-slate-400">
                          {connection === 'connected' ? 'Todavía no hay participantes.' : 'Conectando con la sala…'}
                        </p>
                      )}
                    </div>
                  </div>
                </aside>

                <div className="flex min-w-0 flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center">
                  <div className="flex items-center gap-2 text-sm">
                    <Wifi className={connection === 'connected' ? 'h-4 w-4 text-emerald-300' : 'h-4 w-4 text-amber-300'} />
                    <span>{connection === 'connected' ? 'Conectado a la sala' : connection === 'connecting' ? 'Conectando…' : 'Sin conexión con la sala'}</span>
                  </div>
                  <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-slate-600 bg-slate-800 text-slate-400 shadow-inner">
                    <Mic className="mb-2 h-8 w-8" />
                    <span className="text-xs font-bold">PULSA Y HABLA</span>
                  </div>
                  <p className="max-w-md text-sm text-amber-200">
                    La sala y la presencia en tiempo real están iniciadas. La transmisión de voz y el control PTT todavía no están habilitados; se activarán después de integrar y probar el audio de baja latencia.
                  </p>
                </div>
              </div>
            )}

            <footer className="border-t border-white/10 px-4 py-3 text-center text-xs text-slate-400">
              Tu identidad activa determina la sala. HAM y 11 metros permanecen completamente separados.
            </footer>
          </section>
        </div>
      )}
    </>
  );
};
