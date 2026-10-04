import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HeartPulse,
  LoaderCircle,
} from 'lucide-react';
import { api } from '../api';

export function Brand({ light = false }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <HeartPulse size={24} />
      </span>
      <span>
        Smart<span className="brand-weight">HMS</span>
        <small>CARE, CONNECTED.</small>
      </span>
    </div>
  );
}
export function Loading({ text = 'Loading your workspace…' }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      {text}
    </div>
  );
}
export function Notice({ children, success = false }) {
  if (!children) return null;
  return (
    <div
      className={`notice ${success ? 'notice-success' : ''}`}
      role={success ? 'status' : 'alert'}
    >
      {success ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  name,
  error,
  as = 'input',
  children,
  hint,
  className = '',
  ...props
}) {
  const Component = as;
  const id = props.id || name;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {props.required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <Component
        {...props}
        id={id}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      >
        {children}
      </Component>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}
export function Submit({ busy, disabled = false, children }) {
  return (
    <button type="submit" className="button primary" disabled={busy || disabled}>
      {busy ? <LoaderCircle size={17} className="spin" /> : null}
      {busy ? 'Please wait…' : children}
    </button>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Pager({ page, total, limit, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <span>
        {total} {total === 1 ? 'record' : 'records'} · Page {page} of {pages}
      </span>
      <div>
        <button
          className="button subtle small"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="button subtle small"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useResource(path, revision = 0) {
  const key = `${path}:${revision}`;
  const [state, setState] = useState({ key: '', data: null, error: '', pending: true });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data, error: '', pending: false });
      })
      .catch((err) => {
        if (err.name !== 'AbortError')
          setState({ key, data: null, error: err.message, pending: false });
      });
    return () => controller.abort();
  }, [path, key]);
  if (!path) return { data: null, error: '', pending: false };
  return state.key === key ? state : { data: null, error: '', pending: true };
}
