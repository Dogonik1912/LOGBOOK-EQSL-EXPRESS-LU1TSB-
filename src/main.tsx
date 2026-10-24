import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

type DiagnosticState = { message: string } | null;

class AppErrorBoundary extends React.Component<React.PropsWithChildren, DiagnosticState> {
  state: DiagnosticState = null;

  static getDerivedStateFromError(error: unknown): DiagnosticState {
    return {
      message: error instanceof Error ? error.message : String(error || 'Error desconocido al iniciar la aplicación'),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('LogBook eQSL Express: error de renderizado', error, info.componentStack);
  }

  render() {
    if (this.state) return <DiagnosticScreen message={this.state.message} />;
    return this.props.children;
  }
}

function DiagnosticScreen({ message }: { message: string }) {
  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px', background: '#0f172a', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 680, margin: '8vh auto', padding: 24, border: '1px solid #475569', borderRadius: 16, background: '#1e293b' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>LogBook eQSL Express</h1>
        <p style={{ marginBottom: 16 }}>La aplicación encontró un error al iniciarse. Tus contactos guardados no se han borrado.</p>
        <p style={{ fontSize: 14, color: '#cbd5e1', marginBottom: 8 }}>Detalle técnico para diagnosticar:</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 12, borderRadius: 8, background: '#020617', color: '#fca5a5', fontSize: 13 }}>{message}</pre>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 18, padding: '10px 16px', borderRadius: 8, background: '#38bdf8', color: '#082f49', fontWeight: 700 }}>Volver a intentar</button>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
} else {
  document.body.innerHTML = '<main style="padding:24px;font-family:system-ui"><h1>LogBook eQSL Express</h1><p>No se encontró el elemento raíz de la aplicación.</p></main>';
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('No se pudo activar el soporte de instalación/offline:', error);
    });
  });
}
