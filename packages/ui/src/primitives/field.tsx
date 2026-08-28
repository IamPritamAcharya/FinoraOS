import type {
  InputHTMLAttributes,
  PropsWithChildren,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function FinoraField({
  label,
  hint,
  error,
  children,
}: PropsWithChildren<{ label: string; hint?: string; error?: string }>) {
  return (
    <label className="finora-ui-field">
      <span>{label}</span>
      {children}
      {error ? (
        <small className="finora-ui-field__error">{error}</small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

export function FinoraInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`finora-ui-input ${props.className ?? ''}`.trim()} />;
}

export function FinoraSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`finora-ui-input ${props.className ?? ''}`.trim()} />;
}

export function FinoraTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`finora-ui-input finora-ui-textarea ${props.className ?? ''}`.trim()}
    />
  );
}
