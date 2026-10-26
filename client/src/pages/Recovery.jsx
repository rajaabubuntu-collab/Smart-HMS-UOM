import LanguageSwitcher from '../components/LanguageSwitcher';
import { t } from '../i18n/locale';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brand, Field, Notice, Submit } from '../components/ui';
import { api } from '../api';

export default function Recovery({ reset = false }) {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (reset) window.history.replaceState(null, '', window.location.pathname);
  }, [reset]);
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError(null);
    if (reset && values.password !== values.confirmPassword) {
      setError({ message: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      const result = await api(reset ? '/auth/reset-password' : '/auth/forgot-password', {
        method: 'POST',
        ignoreAuth: true,
        body: reset ? { token, password: values.password } : { email: values.email },
      });
      setMessage(result.message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="full-state">
      <section className="card padded recovery-card">
        <div className="recovery-utilities">
          <Link to="/" aria-label={t('Smart HMS home')}>
            <Brand />
          </Link>
          <LanguageSwitcher />
        </div>
        <h1>{reset ? t('Choose a new password') : t('Forgot your password?')}</h1>
        <p>
          {reset
            ? t('Your other sessions will be signed out.')
            : t('Enter your account email to request a reset link.')}
        </p>
        <Notice>{error?.message}</Notice>
        <Notice success>{message}</Notice>
        {reset && !token ? (
          <Notice>{t('This reset link is missing. Request a new link.')}</Notice>
        ) : (
          !message && (
            <form className="stack" onSubmit={submit}>
              {reset ? (
                <>
                  <Field
                    label={t('New password')}
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    required
                    error={error?.fields?.password}
                  />
                  <Field
                    label={t('Confirm password')}
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </>
              ) : (
                <Field
                  label={t('Email address')}
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  error={error?.fields?.email}
                />
              )}
              <Submit busy={busy}>{reset ? t('Change password') : t('Send reset link')}</Submit>
            </form>
          )
        )}
        <p>
          <Link to="/login">{t('Back to sign in')}</Link> ·{' '}
          <Link to="/forgot-password">{t('Request a new link')}</Link>
        </p>
      </section>
    </main>
  );
}
