import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw, MailOpen, Reply, Circle, ChevronDown } from 'lucide-react';

type InboxMessage = {
  id: string; from: string; to: string; isResponse: boolean;
  date?: string; band?: string; mode?: string; createdAt: string; readAt?: string | null;
};

export const EQSLInbox: React.FC = () => {
  const [callsign] = useState(() => (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
  const [identityToken] = useState(() => localStorage.getItem('community_chat_identity_token') || '');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback(async (countOnly: boolean) => {
    if (!identityToken || !callsign) {
      setError('El buzón necesita que tu señal distintiva ya esté verificada en el chat comunitario.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/eqsl-inbox' + (countOnly ? '?count=1' : ''), {
        cache: 'no-store', headers: { 'x-identity-token': identityToken },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar el buzón eQSL.');
      setError('');
      setUnread(Number(result.unread || 0));
      if (!countOnly) {
        setMessages(Array.isArray(result.items) ? result.items : []);
        // The verified inbox endpoint marks displayed messages as read.
        setUnread(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el buzón eQSL.');
    } finally {
      setLoading(false);
    }
  }, [callsign, identityToken]);

  useEffect(() => {
    void request(true);
    const timer = window.setInterval(() => { void request(true); }, 60000);
    return () => window.clearInterval(timer);
  }, [request]);

  const openCard = (message: InboxMessage, reply: boolean) => {
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { const next = !isOpen; setIsOpen(next); if (next) void request(false); }} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800">
            {isOpen ? 'Ocultar mensajes' : 'Ver mensajes'} <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={() => void request(isOpen ? false : true)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>
      {isOpen && <div className="space-y-2 p-3 sm:p-4">
        <p className="text-xs text-slate-500">Buzón verificado para {callsign || 'tu estación'}. Se actualiza automáticamente cada minuto.</p>
        {error && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
        {!error && !loading && messages.length === 0 && <p className="py-4 text-center text-sm text-slate-600">No hay eQSL recibidas todavía.</p>}
        {messages.map((message) => (
          <article key={message.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex min-w-0 items-start gap-2">
              {message.readAt ? <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <Circle className="mt-1 h-3 w-3 shrink-0 fill-sky-600 text-sky-600" />}
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{message.isResponse ? 'Respuesta eQSL de' : 'eQSL recibida de'} {message.from}</p>
                <p className="text-xs text-slate-500">{[message.date, message.band, message.mode].filter(Boolean).join(' · ')}{message.createdAt ? ' · ' + new Date(message.createdAt).toLocaleString() : ''}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => openCard(message, false)} className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800">Ver tarjeta</button>
              {!message.isResponse && <button type="button" onClick={() => openCard(message, true)} className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"><Reply className="h-3.5 w-3.5" /> Responder</button>}
            </div>
          </article>
        ))}
      </div>}
    </section>
  );
};
