import React, { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { inputClasses, labelClasses } from '../../components/ui/inputStyles';

const errorId = (id: string) => `${id}-error`;
const hintId = (id: string) => `${id}-hint`;

const describedBy = (id: string, hint: boolean, error: boolean) =>
  [hint && hintId(id), error && errorId(id)].filter(Boolean).join(' ') || undefined;

const FieldLabel = ({
  htmlFor,
  optional,
  children,
}: {
  htmlFor: string;
  optional: boolean;
  children: string;
}) => {
  const { t } = useTranslation();
  return (
    <label htmlFor={htmlFor} className={labelClasses}>
      {children}
      {optional && (
        <span className="text-copy-subtle font-normal"> {t('provider.onboarding.optional')}</span>
      )}
    </label>
  );
};

const FieldError = ({ id, error }: { id: string; error: string | undefined }) =>
  error ? (
    <div className="mt-2">
      <ErrorMessage id={errorId(id)}>{error}</ErrorMessage>
    </div>
  ) : null;

const FieldHint = ({ id, hint }: { id: string; hint: string | undefined }) =>
  hint ? (
    <p id={hintId(id)} className="text-copy-muted text-label mb-2">
      {hint}
    </p>
  ) : null;

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel';
  type?: 'text' | 'tel';
  autoComplete?: string;
  /** Text after the input, such as a unit. */
  suffix?: string;
}

export const TextField = ({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  optional = false,
  placeholder,
  inputMode = 'text',
  type = 'text',
  autoComplete = 'off',
  suffix,
}: TextFieldProps) => (
  <div>
    <FieldLabel htmlFor={id} optional={optional}>
      {label}
    </FieldLabel>
    <FieldHint id={id} hint={hint} />
    <div className="flex items-center gap-3">
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, hint !== undefined, error !== undefined)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses(error !== undefined)}
      />
      {suffix && <span className="text-copy-muted text-body shrink-0">{suffix}</span>}
    </div>
    <FieldError id={id} error={error} />
  </div>
);

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  optional?: boolean;
  error?: string;
}

export const SelectField = ({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  optional = false,
  error,
}: SelectFieldProps) => (
  <div>
    <FieldLabel htmlFor={id} optional={optional}>
      {label}
    </FieldLabel>
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error !== undefined}
      aria-describedby={describedBy(id, false, error !== undefined)}
      className={`${inputClasses(error !== undefined)} min-h-12`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    <FieldError id={id} error={error} />
  </div>
);

interface Choice<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface ChoiceListProps<T extends string> {
  name: string;
  legend: string;
  hint?: string;
  choices: readonly Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  error?: string;
  optional?: boolean;
  /** Extra content under a choice while it is picked, such as a field it opens. */
  detail?: (value: T) => ReactNode;
}

/** Radio buttons as the Amount step's unit list draws them. */
export const ChoiceList = <T extends string>({
  name,
  legend,
  hint,
  choices,
  value,
  onChange,
  error,
  optional = false,
  detail,
}: ChoiceListProps<T>) => {
  const { t } = useTranslation();
  const id = `${name}-choices`;

  return (
    <fieldset aria-describedby={describedBy(id, hint !== undefined, error !== undefined)}>
      <legend className="block text-label font-semibold text-ink mb-1">
        {legend}
        {optional && (
          <span className="text-copy-subtle font-normal"> {t('provider.onboarding.optional')}</span>
        )}
      </legend>
      {hint ? (
        <p id={hintId(id)} className="text-copy-muted text-label mb-3">
          {hint}
        </p>
      ) : (
        <div className="mb-2" />
      )}
      <div className="flex flex-col border border-line rounded-xl divide-y divide-line overflow-hidden">
        {choices.map(({ value: option, label, icon: Icon }) => (
          <div key={option} className="flex flex-col">
            <label className="flex items-center gap-3 min-h-13 px-4 py-3 bg-surface cursor-pointer transition-colors hover:bg-surface-muted has-checked:bg-primary-faint has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-primary">
              <input
                type="radio"
                name={name}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="w-5 h-5 accent-primary shrink-0"
              />
              {Icon && (
                <Icon size={20} className="text-primary-strong shrink-0" aria-hidden="true" />
              )}
              <span className="text-ink text-body font-medium">{label}</span>
            </label>
            {value === option && detail && (
              <div className="px-4 pb-4 bg-primary-faint">{detail(option)}</div>
            )}
          </div>
        ))}
      </div>
      <FieldError id={id} error={error} />
    </fieldset>
  );
};
