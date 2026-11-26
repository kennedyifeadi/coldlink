import React from 'react';

interface DevCodeHintProps {
  code: string;
  onUse: (code: string) => void;
}

// Local development, or the hosted demo with VITE_SHOW_DEV_CODE (decisions 57, 113). Not
// translated, since no real farmer ever sees it.
/* eslint-disable i18next/no-literal-string */
const DevCodeHint = ({ code, onUse }: DevCodeHintProps) => (
  <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-xl border border-dashed border-line-strong bg-surface-muted text-label text-copy-muted">
    <span>
      Dev code: <span className="font-bold text-copy tabular-nums">{code}</span>
    </span>
    <button
      type="button"
      onClick={() => onUse(code)}
      className="min-h-11 font-semibold text-primary-strong underline underline-offset-2"
    >
      Fill in
    </button>
  </div>
);
/* eslint-enable i18next/no-literal-string */

export default DevCodeHint;
