/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-12 py-6 border-t border-slate-800/80 bg-slate-950/60 text-center">
      <div className="max-w-7xl mx-auto px-4">
        {/* PRIORIDAD 1: Texto exacto en estilo discreto (texto pequeño, color gris) */}
        <p className="text-xs text-slate-500 font-sans tracking-wide">
          Desarrollado por LU1TSB · LogBook eQSL Express
        </p>
      </div>
    </footer>
  );
};
