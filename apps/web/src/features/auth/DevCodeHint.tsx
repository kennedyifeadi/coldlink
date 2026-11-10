import React from 'react';

interface DevCodeHintProps {
  code: string;
  onUse: (code: string) => void;
}

// Local development only (decision 57): callers render it behind import.meta.env.DEV, so a
// production build drops it. Not translated, since no farmer ever sees it.
/* eslint-disable i18next/no-literal-string */
const DevCodeHint = ({ code, onUse }: DevCodeHintProps) => (
  <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-lg border border-dashed border-line-strong bg-surface-muted text-label text-copy-muted">
    <span>
      Dev code: <span className="font-bold text-copy tabular-nums">{code}</span>
    </span>
    <button
      type="button"
      onClick={() => onUse(code)}
      className="font-medium text-primary-strong underline"
    >
      Fill in
    </button>
  </div>
);
/* eslint-enable i18next/no-literal-string */

export default DevCodeHint;
