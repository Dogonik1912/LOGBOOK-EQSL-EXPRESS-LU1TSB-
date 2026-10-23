import React, { useEffect, useRef, useState } from 'react';

type SharedEQSL = {
  from: string; to: string; date: string; time: string; band: string;
  frequency: string; mode: string; rstSent: string; rstRcvd: string;
  name?: string; qth?: string; grid?: string;
};

export const ReceivedEQSLPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [card, setCard] = useState<SharedEQSL | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('view_eqsl');
      if (!raw) { setError('No se encontró la tarjeta eQSL en este enlace.'); return; }
      const data = JSON.parse(raw) as SharedEQSL;
      if (!data.from || !data.to || !data.date || !data.time) throw new Error('invalid');
      setCard(data);
    } catch {
      setError('El enlace de la eQSL está incompleto o dañado. Pedile al colega que vuelva a compartirla.');
    }
  }, []);

  useEffect(() => {
    if (!card || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 1200; canvas.height = 750;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bg = ctx.createLinearGradient(0, 0, 1200, 750);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(.55, '#1e293b'); bg.addColorStop(1, '#090d16');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 750);
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 5; ctx.strokeRect(35, 35, 1130, 680);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 28px sans-serif';
    ctx.fillText('TARJETA eQSL · CONFIRMACIÓN DE CONTACTO', 600, 95);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 82px sans-serif'; ctx.fillText(card.from, 600, 205);
    ctx.fillStyle = '#cbd5e1'; ctx.font = '28px sans-serif'; ctx.fillText('confirma el QSO con', 600, 260);
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 58px sans-serif'; ctx.fillText(card.to, 600, 330);
    ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif';
    ctx.fillText('Fecha: ' + card.date + '   ·   Hora: ' + card.time + ' UTC', 600, 410);
    ctx.fillText('Banda: ' + card.band + '   ·   Frecuencia: ' + card.frequency + ' MHz   ·   Modo: ' + card.mode, 600, 465);
    ctx.fillText('RST enviado/recibido: ' + (card.rstSent || '59') + ' / ' + (card.rstRcvd || '59'), 600, 520);
    if (card.qth || card.grid) {
      ctx.fillStyle = '#cbd5e1'; ctx.font = '23px sans-serif';
      ctx.fillText([card.qth, card.grid ? 'Grid ' + card.grid : ''].filter(Boolean).join(' · '), 600, 570);
    }
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('¡Gracias por el contacto! · 73', 600, 650);
  }, [card]);

  const download = () => {
    if (!canvasRef.current || !card) return;
    const link = document.createElement('a');
    link.download = 'eQSL_' + card.from.replace(/[^A-Z0-9]/gi, '') + '_' + card.to.replace(/[^A-Z0-9]/gi, '') + '_' + card.date + '.png';
    link.href = canvasRef.current.toDataURL('image/png'); link.click();
  };

  return <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
    <section className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold text-amber-300 mb-2">eQSL recibida</h1>
      <p className="text-sm text-slate-300 mb-4">Podés ver y descargar esta tarjeta sin instalar la aplicación ni crear una cuenta.</p>
      {error ? <p role="alert" className="rounded-lg bg-red-950 p-4 text-red-200">{error}</p> : card && <>
        <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-950 p-1"><canvas ref={canvasRef} className="block w-full h-auto" /></div>
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <button onClick={download} className="rounded-lg bg-amber-500 px-4 py-3 font-bold text-slate-950">Descargar eQSL (PNG)</button>
          <a href={window.location.origin + '/'} className="rounded-lg border border-slate-600 px-4 py-3 text-center font-semibold">Abrir LogBook eQSL Express</a>
        </div>
      </>}
      <p className="mt-5 text-xs text-slate-500">Esta tarjeta se reconstruye a partir de los datos incluidos en el enlace compartido. Conservá el enlace si querés volver a verla.</p>
    </section>
  </main>;
};
