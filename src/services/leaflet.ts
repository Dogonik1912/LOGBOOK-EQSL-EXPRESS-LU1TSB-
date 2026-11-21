let leafletPromise: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('El mapa solo puede abrirse en el navegador.'));
  const w = window as any;
  if (w.L && document.querySelector('link[data-shared-leaflet-css="ready"]')) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = (async () => {
    const cssHref = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    let css = document.querySelector('link[data-shared-leaflet-css]') as HTMLLinkElement | null;
    if (!css || css.dataset.sharedLeafletCss !== 'ready') {
      if (css) css.remove();
      css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = cssHref;
      css.dataset.sharedLeafletCss = 'loading';
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Tiempo de espera agotado al cargar los estilos del mapa.')), 12000);
        css!.onload = () => { window.clearTimeout(timeout); css!.dataset.sharedLeafletCss = 'ready'; resolve(); };
        css!.onerror = () => { window.clearTimeout(timeout); css!.remove(); reject(new Error('No se pudieron cargar los estilos del mapa.')); };
        document.head.appendChild(css!);
      });
    }

    if (!w.L) {
      const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.sharedLeafletJs = 'true';
        const timeout = window.setTimeout(() => { script.remove(); reject(new Error('Tiempo de espera agotado al cargar el mapa.')); }, 12000);
        script.onload = () => { window.clearTimeout(timeout); resolve(); };
        script.onerror = () => { window.clearTimeout(timeout); script.remove(); reject(new Error('No se pudo descargar el motor del mapa.')); };
        document.head.appendChild(script);
      });
      try {
        await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      } catch {
        await loadScript('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js');
      }
    }
    if (!w.L) throw new Error('Leaflet no pudo inicializarse. Comprobá la conexión e intentá nuevamente.');
    return w.L;
  })().catch(error => {
    leafletPromise = null;
    throw error;
  });
  return leafletPromise;
}
