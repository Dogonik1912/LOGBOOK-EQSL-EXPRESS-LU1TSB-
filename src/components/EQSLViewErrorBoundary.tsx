import React from 'react';

interface Props { children: React.ReactNode; }
interface State { failed: boolean; }

export class EQSLViewErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('Error al mostrar una eQSL recibida:', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
          <section className="w-full max-w-xl rounded-2xl border border-amber-400/60 bg-slate-900 p-6 text-center shadow-2xl">
            <h1 className="mb-3 text-2xl font-extrabold text-amber-300">No se pudo mostrar esta eQSL</h1>
            <p className="mb-5 text-sm text-slate-200">La tarjeta produjo un error al abrirse. Volvé a la bandeja e intentá abrirla otra vez. Si el problema continúa, actualizá la aplicación.</p>
            <button type="button" onClick={() => { window.location.href = '/'; }} className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-950">Volver a LogBook eQSL EXPRESS</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
