// Labelled form controls with hints and errors wired up for assistive technology.
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
      <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...input} />
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({ label, hint, error, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
      <textarea id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...input} />
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Polite status messages and assertive errors for async actions. */
export function Notice({ error, status }: { error?: string | null; status?: string | null }) {
  return (
    <>
      <div role="alert" className={error ? 'notice notice-error' : 'visually-hidden'}>
        {error ?? ''}
      </div>
      <div role="status" className={status ? 'notice notice-ok' : 'visually-hidden'}>
        {status ?? ''}
      </div>
    </>
  );
}
