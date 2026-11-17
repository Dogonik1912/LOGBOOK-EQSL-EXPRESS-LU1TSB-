import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { deliverEqslJob, EQSL_QUEUE_EVENT, listEqslDeliveryJobs, retryPendingEqslJobs, EqslDeliveryJob } from '../services/offlineEqslQueue';

export const PendingEqslDeliveries: React.FC = () => {
  const [jobs, setJobs] = useState<EqslDeliveryJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(() => { void listEqslDeliveryJobs().then(setJobs).catch(error => console.warn('Cola eQSL:', error)); }, []);

  useEffect(() => {
    refresh();
    const onQueue = () => refresh();
    const onOnline = () => { void retryPendingEqslJobs().finally(refresh); };
    window.addEventListener(EQSL_QUEUE_EVENT, onQueue);
    window.addEventListener('online', onOnline);
    const timer = window.setTimeout(onOnline, 1200);
    return () => { window.removeEventListener(EQSL_QUEUE_EVENT, onQueue); window.removeEventListener('online', onOnline); window.clearTimeout(timer); };
  }, [refresh]);

  const retry = async (job: EqslDeliveryJob) => {
    setBusy(job.id);
    try { await deliverEqslJob(job.id, true); } finally { setBusy(null); refresh(); }
  };

  if (!jobs.length) return null;
  const attention = jobs.filter(job => job.status === 'needs_confirmation');
  return <section role="status" aria-live="polite" className="mx-3 mb-3 rounded-xl border border-amber-400/50 bg-amber-50 p-3 text-slate-900 shadow-sm">
    <div className="flex items-center gap-2 font-bold text-sm"><AlertTriangle className="h-5 w-5 text-amber-600" /> {jobs.length} eQSL pendiente(s) de entrega</div>
    <p className="mt-1 text-xs text-slate-700">{attention.length ? 'Algunos envíos automáticos fallaron. Autorizá manualmente cada reintento.' : 'Se conservaron en este dispositivo y se enviarán automáticamente cuando vuelva la conexión.'}</p>
    {!navigator.onLine && <p className="mt-2 flex items-center gap-1 text-xs text-slate-600"><WifiOff className="h-3.5 w-3.5" /> Sin conexión: tus eQSL siguen guardadas.</p>}
    <ul className="mt-2 space-y-2">{jobs.map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 p-2 text-xs">
      <span><strong>{job.inboxData.from}</strong> → <strong>{job.inboxData.to}</strong><span className="block text-slate-600">{job.status === 'needs_confirmation' ? (job.lastError || 'Requiere autorización') : 'Esperando conexión'}</span></span>
      {job.status === 'needs_confirmation' && <button type="button" disabled={!navigator.onLine || busy === job.id} onClick={() => void retry(job)} className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy === job.id ? 'animate-spin' : ''}`} /> {busy === job.id ? 'Reintentando…' : 'Autorizar y reintentar'}</button>}
    </li>)}</ul>
  </section>;
};
