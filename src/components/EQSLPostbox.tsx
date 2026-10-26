import React, { useCallback, useEffect, useState } from 'react';
import { Archive, ArrowLeft, Inbox, LoaderCircle, MailOpen, MessageSquareReply, RefreshCw, X } from 'lucide-react';

type SharedEQSL = {
  from: string; to: string; date: string; time: string; band: string;
  frequency: string; mode: string; rstSent?: string; rstRcvd?: string;
  qth?: string; grid?: string; imageDataUrl?: string; isResponse?: boolean;
};
type InboxItem = { id: string; card: SharedEQSL; receivedAt: string; expiresAt: string };

type Props = {
  callsigns: string[];
  onClose: () => void;
  onReply: (card: SharedEQSL) => void;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export function EQSLPostbox({ callsigns, onClose, onReply }: Props) {
  const callsignKey = callsigns.join('|');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadInbox = useCallback(async () => {
    const normalizedCalls = [...new Set(callsignKey.split('|').map((value) => value.trim().toUpperCase()).filter(Boolean))];
    if (normalizedCalls.length === 0) {
      setError('Primero cargá tu señal distintiva en Ajustes para abrir tu buzón POST.');
      setItems([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(normalizedCalls.map(async (normalized) => {
        const response = await fetch('/api/eqsl-share?inbox=' + encodeURIComponent(normalized), { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo consultar el buzón POST.');
        return Array.isArray(result.cards) ? result.cards as InboxItem[] : [];
      }));
      const unique = new Map<string, InboxItem>();
      results.flat().forEach((item) => unique.set(item.id, item));
      setItems([...unique.values()].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)));
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el buzón POST.');
    } finally {
      setLoading(false);
    }
  }, [callsignKey]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);

  const openCard = async (item: InboxItem) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/eqsl-share?id=' + encodeURIComponent(item.id), { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.card) throw new Error(result.error || 'No se pudo abrir esta eQSL.');
      setSelected({ ...item, card: result.card });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir esta eQSL.');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = () => {
    if (!selected) return;
    const card = selected.card;
    setSelected(null);
    onClose();
    onReply(card);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="postbox-title">
      <section className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-400/50 bg-slate-950 text-slate-100 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-400/10 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-amber-400 p-2 text-slate-950"><Inbox className="h-6 w-6" /></div>
            <div className="min-w-0">
              <h2 id="postbox-title" className="text-lg font-black text-amber-300">POST · eQSL recibidas</h2>
              <p className="truncate text-xs text-slate-300">Buzón de {callsigns.filter(Boolean).join(' · ') || 'tu estación'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar buzón" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          {selected ? (
            <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-sm text-amber-300"><ArrowLeft className="h-4 w-4" /> Volver al buzón</button>
          ) : (
            <p className="text-sm text-slate-300"><strong className="text-white">{items.length}</strong> {items.length === 1 ? 'tarjeta recibida' : 'tarjetas recibidas'}</p>
          )}
          <button type="button" onClick={() => void loadInbox()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>

        {error && <p role="alert" className="mx-4 mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
        {loading && <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin" /> Consultando buzón…</div>}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!loading && selected && (
            <article className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs uppercase tracking-wide text-amber-300">{selected.card.isResponse ? 'Respuesta eQSL' : 'eQSL recibida'}</p>
                <h3 className="mt-1 text-xl font-bold">De {selected.card.from}</h3>
                <p className="mt-1 text-sm text-slate-300">Para {selected.card.to} · {selected.card.date} · {selected.card.time} UTC</p>
                <p className="mt-2 text-sm text-slate-300">{selected.card.band} · {selected.card.frequency} MHz · {selected.card.mode} · RST {selected.card.rstSent || '59'}/{selected.card.rstRcvd || '59'}</p>
              </div>
              {selected.card.imageDataUrl ? <img src={selected.card.imageDataUrl} alt={`Tarjeta eQSL de ${selected.card.from}`} className="max-h-[48vh] w-full rounded-xl border border-slate-700 bg-slate-900 object-contain" /> : <div className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-400">Esta tarjeta no incluye una imagen adjunta.</div>}
              <button type="button" onClick={handleReply} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950 hover:bg-amber-300">
                <MessageSquareReply className="h-5 w-5" /> Responder con mi eQSL
              </button>
            </article>
          )}

          {!loading && !selected && !error && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="rounded-full bg-amber-400/10 p-4 text-amber-300"><MailOpen className="h-8 w-8" /></div>
              <h3 className="text-lg font-bold text-white">Tu buzón está vacío</h3>
              <p className="max-w-sm text-sm text-slate-400">Cuando un colega envíe una eQSL a cualquiera de tus indicativos, aparecerá aquí para que puedas verla y responderla.</p>
            </div>
          )}

          {!loading && !selected && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => void openCard(item)} className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-left hover:border-amber-400/60 hover:bg-slate-900/80">
                    <div className="rounded-lg bg-amber-400/10 p-2 text-amber-300"><Archive className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-white">{item.card.isResponse ? 'Respuesta de ' : 'eQSL de '}{item.card.from}</p>
                      <p className="text-xs text-slate-400">{item.card.date} · {item.card.time} UTC · {item.card.band} · {item.card.mode}</p>
                      <p className="mt-1 text-[10px] text-slate-500">Recibida: {formatDate(item.receivedAt)}</p>
                    </div>
                    <span className="text-xs font-bold text-amber-300">Abrir →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="border-t border-slate-800 px-4 py-3 text-center text-[11px] text-slate-500">LogBook eQSL EXPRESS · las tarjetas compartidas caducan a los 180 días</footer>
      </section>
    </div>
  );
}
