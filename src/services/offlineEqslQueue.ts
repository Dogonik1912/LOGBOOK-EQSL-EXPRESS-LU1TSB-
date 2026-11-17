export type EqslDeliveryJob = {
  id: string;
  cardData: Record<string, unknown>;
  inboxData: { from: string; senderIdentity: string; to: string; isResponse: boolean; date: string; band: string; mode: string; originalEqslId?: string };
  status: 'pending' | 'needs_confirmation';
  attempts: number;
  lastError?: string;
  createdAt: string;
};

const DB_NAME = 'logbook-eqsl-offline-delivery';
const STORE = 'deliveries';
const eventName = 'eqsl-delivery-queue-updated';

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) return reject(new Error('Este navegador no permite guardar envíos pendientes.'));
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir la cola eQSL.'));
});

const transact = async <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: Error) => void) => void): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      action(tx.objectStore(STORE), resolve, reject);
      tx.onerror = () => reject(tx.error || new Error('Error en la cola eQSL.'));
      tx.onabort = () => reject(tx.error || new Error('Se canceló la operación de la cola eQSL.'));
    });
  } finally { db.close(); }
};

const changed = () => window.dispatchEvent(new Event(eventName));

export const listEqslDeliveryJobs = () => transact<EqslDeliveryJob[]>('readonly', (store, resolve, reject) => {
  const request = store.getAll();
  request.onsuccess = () => resolve((request.result as EqslDeliveryJob[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  request.onerror = () => reject(new Error('No se pudieron leer los envíos eQSL pendientes.'));
});

export const enqueueEqslDelivery = async (cardData: Record<string, unknown>, inboxData: EqslDeliveryJob['inboxData'], status: EqslDeliveryJob['status'] = 'pending') => {
  const existing = (await listEqslDeliveryJobs()).find(job =>
    job.inboxData.from === inboxData.from &&
    job.inboxData.to === inboxData.to &&
    job.inboxData.date === inboxData.date &&
    job.inboxData.band === inboxData.band &&
    job.inboxData.mode === inboxData.mode &&
    job.inboxData.isResponse === inboxData.isResponse &&
    job.inboxData.originalEqslId === inboxData.originalEqslId &&
    job.cardData.time === cardData.time &&
    job.cardData.frequency === cardData.frequency
  );
  if (existing) return existing;
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `eqsl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const job: EqslDeliveryJob = { id, cardData, inboxData, status, attempts: 0, createdAt: new Date().toISOString() };
  await transact<void>('readwrite', (store, resolve, reject) => {
    const request = store.add(job);
    request.onsuccess = () => resolve(undefined as T);
    request.onerror = () => reject(new Error('No se pudo guardar la eQSL pendiente en este dispositivo.'));
  });
  changed();
  return job;
};

const updateJob = async (job: EqslDeliveryJob) => transact<void>('readwrite', (store, resolve, reject) => {
  const request = store.put(job);
  request.onsuccess = () => resolve(undefined as T);
  request.onerror = () => reject(new Error('No se pudo actualizar el envío eQSL.'));
});

const removeJob = async (id: string) => transact<void>('readwrite', (store, resolve, reject) => {
  const request = store.delete(id);
  request.onsuccess = () => resolve(undefined as T);
  request.onerror = () => reject(new Error('No se pudo retirar el envío confirmado.'));
});

export const deliverEqslJob = async (id: string, manual = false): Promise<boolean> => {
  const job = (await listEqslDeliveryJobs()).find(item => item.id === id);
  if (!job || (!manual && job.status !== 'pending')) return false;
  const token = localStorage.getItem('community_chat_identity_token') || '';
  const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
  if (!token || !callsign || callsign !== job.inboxData.senderIdentity.trim().toUpperCase()) {
    job.status = 'needs_confirmation';
    job.lastError = 'La identidad verificada de esta estación no está disponible en este dispositivo.';
    await updateJob(job); changed(); return false;
  }
  job.attempts += 1;
  try {
    const shareResponse = await fetch('/api/eqsl-share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job.cardData, clientDeliveryId: job.id }),
    });
    const share = await shareResponse.json();
    if (!shareResponse.ok || !share.id) throw new Error(share.error || 'No se pudo guardar la tarjeta eQSL.');
    const inboxResponse = await fetch('/api/eqsl-inbox', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: share.id, token, callsign, ...job.inboxData }),
    });
    const inbox = await inboxResponse.json().catch(() => ({}));
    if (!inboxResponse.ok) throw new Error(inbox.error || 'El servidor no confirmó la entrega al buzón.');
    if (job.inboxData.isResponse && job.inboxData.originalEqslId) {
      const answered = await fetch('/api/eqsl-inbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-answered', id: job.inboxData.originalEqslId, token, callsign }),
      });
      if (!answered.ok) throw new Error('La respuesta llegó al buzón, pero no se pudo actualizar la eQSL original.');
    }
    await removeJob(id);
    changed();
    window.dispatchEvent(new Event('eqsl-pending-count-updated'));
    return true;
  } catch (error) {
    job.status = 'needs_confirmation';
    job.lastError = error instanceof Error ? error.message : 'No se pudo confirmar la entrega.';
    await updateJob(job);
    changed();
    return false;
  }
};

export const retryPendingEqslJobs = async () => {
  if (!navigator.onLine) return;
  const jobs = await listEqslDeliveryJobs();
  for (const job of jobs) {
    if (job.status === 'pending') await deliverEqslJob(job.id, false);
  }
};

export const EQSL_QUEUE_EVENT = eventName;
