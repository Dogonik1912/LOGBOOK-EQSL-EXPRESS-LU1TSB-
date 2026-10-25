import React, { useState } from 'react';
import { MessageCircle, Send, ShieldCheck, Users, Reply, AlertTriangle } from 'lucide-react';

type ChatMessage = { id: number; callsign: string; text: string; replyTo?: string };

const initialMessages: ChatMessage[] = [
  { id: 1, callsign: 'LU1TSB/4RC978', text: 'Bienvenidos al espacio de la comunidad LogBook eQSL EXPRESS.' },
  { id: 2, callsign: 'LW6HRN', text: '¡Saludos desde Argentina! Probando el chat comunitario.' },
  { id: 3, callsign: 'PY3FG', text: 'Buena iniciativa para compartir experiencias de radio.' },
];

export const CommunityChat: React.FC = () => {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [callsign, setCallsign] = useState(() => localStorage.getItem('user_callsign')?.trim().toUpperCase() || '');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !callsign) {
      if (!callsign) setShowInfo(true);
      return;
    }
    setMessages((items) => [...items, { id: Date.now(), callsign, text, replyTo: replyTo?.callsign }]);
    setDraft('');
    setReplyTo(null);
  };

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-sky-900/70 bg-white text-slate-900 shadow-xl" aria-label="Chat de la comunidad">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300"><MessageCircle className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="font-bold leading-tight">Comunidad LogBook eQSL EXPRESS</h2>
            <p className="mt-1 text-xs text-slate-300">Chat comunitario · vista previa</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowInfo((v) => !v)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Información de seguridad"><ShieldCheck className="h-5 w-5" /></button>
      </div>
      {showInfo && <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>Modo de prueba:</strong> los mensajes que ves son demostrativos y los que escribas quedan solo en esta sesión. Todavía no se comparten con otros usuarios. La administración y moderación no se habilitarán hasta que la autenticación y los permisos del servidor estén configurados.</div>}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 sm:px-5">
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> Conexión comunitaria: pendiente de configurar</span>
        <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900">Prueba visual</span>
      </div>
      <div className="max-h-[360px] min-h-[230px] space-y-3 overflow-y-auto bg-white px-4 py-4 sm:px-5">
        {messages.map((message) => (
          <article key={message.id} className="group rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:border-sky-200">
            {message.replyTo && <p className="mb-1 text-xs text-slate-500"><Reply className="mr-1 inline h-3 w-3" />Respuesta a {message.replyTo}</p>}
            <p className="break-words text-sm leading-relaxed"><strong className={message.callsign === 'LU1TSB/4RC978' ? 'font-mono font-extrabold uppercase text-red-600' : 'font-mono font-extrabold uppercase text-slate-950'}>{message.callsign} :</strong> <span className="text-slate-800">{message.text}</span></p>
            <div className="mt-1 flex justify-end">
              <button type="button" onClick={() => setReplyTo(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Reply className="h-3 w-3" /> Responder</button>
            </div>
          </article>
        ))}
      </div>
      {replyTo && <div className="flex items-center justify-between border-t border-slate-200 bg-sky-50 px-4 py-2 text-xs text-slate-700"><span>Respondiendo a <strong>{replyTo.callsign}</strong></span><button type="button" onClick={() => setReplyTo(null)} className="font-semibold underline">Cancelar</button></div>}
      <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
        <label htmlFor="community-callsign" className="mb-1 block text-xs font-semibold text-slate-600">Tu indicativo</label>
        <input id="community-callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} maxLength={24} placeholder="Ej.: LU1TSB" className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} maxLength={500} placeholder="Escribí un mensaje de prueba…" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          <button type="button" onClick={sendMessage} disabled={!draft.trim()} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Vista previa local: no ingreses datos privados. Los mensajes no se guardan ni se transmiten.</p>
      </div>
    </section>
  );
};
