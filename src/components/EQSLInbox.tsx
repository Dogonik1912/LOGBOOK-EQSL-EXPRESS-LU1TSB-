import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw, MailOpen, Reply, Circle } from 'lucide-react';

type InboxMessage = {
  id: string;
  from: string;
  to: string;
  isResponse: boolean;
  createdAt: string;
};

export const EQSLInbox: React.FC = () => {
  const [callsign, setCallsign] = useState(() =>
    (localStorage.getItem('user_callsign') || localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase()
  );
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const seenKey = `logbook_eqsl_inbox_seen_${callsign}`;

  const loadInbox = useCallback(async () => {
    if (!callsign) {
      setMessages([]);
      setError('Primero debe estar guardada tu señal distintiva en este dispositivo.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/eqsl-share?inbox=' + encodeURIComponent(callsign), { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar el buzón.');
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      try {
        const saved = JSON.parse(localStorage.getItem(seenKey) || '[]');
        setSeen(Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : []);
      } catch { setSeen([]); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el buzón.');
    } finally {
      setLoading(false);
    }
  }, [callsign, seenKey]);

  useEffect(() => {
    void loadInbox();
    const timer = window.setInterval(() => { void loadInbox(); }, 60000);
    return () => window.clearInterval(timer);
  }, [loadInbox]);

  const unread = messages.filter((message) => !seen.includes(message.id)).length;
  const markSeen = (id: string) => {
    const next = Array.from(new Set([...seen, id]));
    setSeen(next);
    localStorage.setItem(seenKey, JSON.stringify(next));
  };
  const openCard = (message: InboxMessage, reply: boolean) => {
    markSeen(message.id);
    window.location.href = '/?' + (reply ? 'reply_eqsl=' : 'e=') + encodeURIComponent(message.id);
  };

  return (
    <section className="my-5 overflow-hidden rounded-2xl border border-amber-300 bg-white/95 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-sky-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-sky-700" />
          <h2 className="font-bold text-slate-900">Buzón de mensajes eQSL</h2>
          <span className="rounded-full bg-sky-700 px-2 py-0.5 text-xs font-bold text-white">{unread} nuevas</span>
        </div>
        <div className="flex items-center gap-2">
          {localStorage.getItem('cb_station_callsign') && localStorage.getItem('user_callsign') && (
            <select aria-label="Señal distintiva del buzón" value={callsign} onChange={(e) => setCallsign(e.target.value)} className="max-w-40 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800">
              <option value={String(localStorage.getItem('user_callsign') || '').toUpperCase()}>{String(localStorage.getItem('user_callsign') || '').toUpperCase()}</option>
              <option value={String(localStorage.getItem('cb_station_callsign') || '').toUpperCase()}>{String(localStorage.getItem('cb_station_callsign') || '').toUpperCase()} (11 m)</option>
            </select>
          )}
          <button type="button" onClick={() => void loadInbox()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>
      <div className="space-y-2 p-3 sm:p-4">
        {error && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
        {!error && !loading && messages.length === 0 && <p className="py-4 text-center text-sm text-slate-600">No hay eQSL recibidas para {callsign || 'tu estación'} todavía. El buzón se actualiza automáticamente cada minuto.</p>}
        {messages.map((message) => (
          <article key={message.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex min-w-0 items-start gap-2">
              {seen.includes(message.id) ? <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <Circle className="mt-1 h-3 w-3 shrink-0 fill-sky-600 text-sky-600" />}
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{message.isResponse ? 'Respuesta eQSL de' : 'eQSL recibida de'} {message.from}</p>
                <p className="text-xs text-slate-500">{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Fecha no disponible'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => openCard(message, false)} className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800">Ver tarjeta</button>
              {!message.isResponse && <button type="button" onClick={() => openCard(message, true)} className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"><Reply className="h-3.5 w-3.5" /> Responder</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
