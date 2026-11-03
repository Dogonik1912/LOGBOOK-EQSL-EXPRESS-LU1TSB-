import React, { useEffect, useState } from 'react';
import { Download, RadioTower, Smartphone, ShieldCheck } from 'lucide-react';

const APP_URL = 'https://logbook-eqsl-express-lu-1-tsb.vercel.app/';

export const PatentSharePage: React.FC = () => {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('patent') || '';
    if (!/^[a-f0-9]{16,32}$/i.test(id)) {
      setError('El enlace de la patente no es válido.');
      setLoading(false);
      return;
    }
    fetch('/api/patent-share?id=' + encodeURIComponent(id), { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || typeof result.imageDataUrl !== 'string') {
          throw new Error(result.error || 'La patente no existe o el enlace venció.');
        }
        setImage(result.imageDataUrl);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar la patente.'))
      .finally(() => setLoading(false));
  }, []);

  const download = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = 'patente-radio.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.location.replace('/?patentDownloaded=1'), 1200);
  };

  return <main className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 px-4 py-8 text-slate-900">
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-sky-200 bg-white p-5 shadow-xl sm:p-7">
      <header className="mb-5 flex items-center justify-center gap-3">
        <RadioTower className="text-sky-800" size={28}/>
        <h1 className="text-center text-xl font-black sm:text-2xl">LogBook eQSL EXPRESS</h1>
      </header>
      {loading ? <p className="py-10 text-center font-semibold">Cargando la patente…</p>
        : error ? <div role="alert" className="rounded-xl bg-amber-50 p-5 text-center text-amber-900"><p className="font-bold">{error}</p><a className="mt-4 inline-block font-bold underline" href={APP_URL}>Ir a la página principal</a></div>
        : <><p className="mb-4 text-center text-sm font-semibold text-slate-700">Tu colega te compartió esta patente de radio.</p>
          <img src={image} alt="Patente de radio compartida" className="mx-auto w-full rounded-xl border border-slate-200"/>
          <button type="button" onClick={download} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 py-3 font-black text-white shadow-md"><Download size={20}/> DESCARGAR PATENTE</button>
          <p className="mt-3 text-center text-xs text-slate-500">Después de descargarla, volverás a la página principal de LogBook eQSL EXPRESS.</p>
        </>}
    </section>
  </main>;
};

export const PatentDownloadedPage: React.FC = () => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showPage, setShowPage] = useState(false);

  useEffect(() => {
    // Si ya usa la app o tiene una SD validada/guardada, no mostrar el flujo de instalación.
    // Esto también cubre enlaces abiertos desde WhatsApp en el navegador externo.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const existingIdentity = Boolean(
      localStorage.getItem('logbook_sd_validated') === '1'
      || localStorage.getItem('community_chat_sd')
      || localStorage.getItem('user_callsign')
    );
    if (standalone || existingIdentity) {
      window.location.replace('/');
      return;
    }
    setShowPage(true);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as any);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
      return;
    }
    window.alert('En Chrome, abrí el menú ⋮ y elegí “Instalar aplicación” o “Agregar a pantalla principal”. Luego validá tu SD para acceder a las funciones.');
  };

  if (!showPage) return <main className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100"/>;

  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100 via-white to-cyan-100 px-4 py-8 text-slate-900">
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-sky-200 bg-white p-6 text-center shadow-xl sm:p-8">
      <RadioTower className="mx-auto text-sky-800" size={42}/>
      <h1 className="mt-3 text-2xl font-black">LogBook eQSL EXPRESS</h1>
      <p className="mt-4 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-900">¡Tu patente se descargó!</p>
      <p className="mt-4 text-base leading-relaxed">Si todavía no tenés LogBook eQSL EXPRESS instalado, podés instalarlo y validar tu SD para acceder a todas las funciones.</p>
      <div className="mt-6 grid gap-3">
        <button type="button" onClick={() => void install()} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-black text-white"><Smartphone size={20}/> INSTALAR LOGBOOK eQSL EXPRESS</button>
        <button type="button" onClick={() => window.location.replace('/')} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 font-black text-white"><ShieldCheck size={20}/> VALIDAR MI SD Y ACCEDER</button>
      </div>
      <p className="mt-4 text-xs text-slate-500">La descarga de patentes es libre. La validación de SD es necesaria para las funciones de la app.</p>
    </section>
  </main>;
};
