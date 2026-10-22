import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LogBook eQSL Express render failure:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
          <section className="mx-auto mt-12 max-w-2xl rounded-xl border border-amber-500/50 bg-slate-900 p-6">
            <h1 className="text-xl font-bold text-amber-400">Error al iniciar LogBook eQSL Express</h1>
            <p className="mt-3">La aplicación detectó un error de ejecución en lugar de dejar la pantalla en blanco.</p>
            <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm">{this.state.error.message || String(this.state.error)}</pre>
            <p className="mt-4 text-sm text-slate-400">Recargá la página. Si el error continúa, enviá este mensaje para poder corregir la causa.</p>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<main style="padding:24px;font-family:sans-serif">Error: no se encontró el elemento raíz de la aplicación (#root).</main>';
} else {
  createRoot(rootElement).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
