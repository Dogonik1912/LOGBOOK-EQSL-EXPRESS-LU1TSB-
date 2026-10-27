import React, { useState } from 'react';
import { Radio, Waves, ExternalLink, AlertTriangle } from 'lucide-react';

const PARDINHO_URL = 'https://pardinho.websdr.com.br/';

export function PardinhoSDRTest() {
  const [open, setOpen] = useState(false);
  const [frameFailed, setFrameFailed] = useState(false);

  return (
    <section className="my-4 min-w-0 overflow-hidden rounded-2xl border border-violet-300 bg-slate-950 text-white shadow-sm" aria-label="Prueba experimental Pardinho WebSDR">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-gradient-to-r from-slate-900 to-violet-950 px-4 py-4 text-left"
      >
        <span className="rounded-xl bg-violet-300 p-2 text-slate-950"><Radio className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1">
          <strong className="block text-base">Pardinho WebSDR · Prueba</strong>
          <span className="block text-xs text-violet-100">Receptor remoto · intento de uso dentro de la app</span>
        </span>
        <Waves className="h-5 w-5 text-violet-200" />
      </button>
      {open && <div className="space-y-3 p-3 sm:p-5">
        <p className="text-sm text-slate-200">
          Esta es una prueba aislada. Si Pardinho permite la integración, podrás sintonizar y escuchar aquí sin salir de LogBook eQSL EXPRESS.
        </p>
        <div className="flex items-start gap-2 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>La web externa puede bloquear la visualización integrada o impedir el audio. Eso depende del servidor Pardinho; la app no puede quitar esas restricciones.</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
          <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-3 py-2 text-xs text-slate-300">
            <span>Receptor Pardinho · modo de prueba</span>
            <a href={PARDINHO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-violet-200 underline">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir aparte
            </a>
          </div>
          <iframe
            title="Pardinho WebSDR integrado (prueba)"
            src={PARDINHO_URL}
            className="h-[70vh] min-h-[480px] w-full bg-black"
            loading="lazy"
            allow="autoplay; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setFrameFailed(true)}
          />
        </div>
        {frameFailed && <p role="status" className="text-xs text-amber-200">El navegador informó un error al cargar el marco. La política de seguridad del sitio también puede bloquearlo sin notificarlo a la app.</p>}
        <p className="text-xs text-slate-400">No se modifica LogBook SDR Smart ni ninguna función existente. Esta sección solo está en la versión de prueba.</p>
      </div>}
    </section>
  );
}
