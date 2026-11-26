export const inputClasses = (invalid = false) =>
  `w-full min-h-13 px-4 py-3 text-body text-ink bg-surface border rounded-xl placeholder:text-copy-subtle outline-none focus:ring-4 transition-[border-color,box-shadow] ${
    invalid
      ? 'border-alert focus:ring-alert-faint'
      : 'border-line-strong focus:border-primary focus:ring-primary-soft'
  }`;

export const labelClasses = 'block text-label font-semibold text-ink mb-1.5';
