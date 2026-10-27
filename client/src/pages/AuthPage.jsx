import LoginPage from './LoginPage';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { t } from '../i18n/locale';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowUpRight, Check, ShieldCheck, HeartPulse, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth';
import { Brand, Field, Notice, Submit } from '../components/ui';
import { safePatientReturn } from '../auth-destinations';
import { today } from '../scheduling';
import { DisplayPreference } from '../components/DisplayPreference';

export default function AuthPage({ register = false }) {
  const auth = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  // Email destinations must remain local and still pass the destination's role/ownership checks.
  const returnTo = location.state?.returnTo;
  const safeReturn = auth.user?.role === 'patient' && safePatientReturn(returnTo);
  if (auth.user) return <Navigate to={safeReturn ? returnTo : '/dashboard'} replace />;
  async function submit(event) {
    event.preventDefault();
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (register && values.password !== values.confirmPassword) {
      setError({
        message: 'Passwords do not match.',
        fields: { confirmPassword: 'Enter the same password again.' },
      });
      return;
    }
    delete values.confirmPassword;
    setBusy(true);
    try {
      await (register ? auth.register(values) : auth.login(values));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (name) => error?.fields?.[name];
  if (!register)
    return (
      <LoginPage
        onSubmit={submit}
        busy={busy}
        error={error}
        returnTo={returnTo}
        showPassword={showPassword}
        onTogglePassword={() => setShowPassword(!showPassword)}
      />
    );
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link to="/" aria-label={t('Smart HMS home')}>
          <Brand light />
        </Link>
        <div className="story-copy">
          <div className="story-kicker">
            <span /> {t('A little more connected. A lot more care.')}{' '}
          </div>
          <h1>
            {t('Good care starts')} <br />
            {t('with a')} <em>{t('connection.')}</em>
          </h1>
          <p>
            {t(
              'One place for patients and care teams to come together. Simple, organised, and built around you.',
            )}{' '}
          </p>
          <div className="story-points">
            <span>
              <Check size={16} /> {t('Your information, in one place')}{' '}
            </span>
            <span>
              <Check size={16} /> {t('A workspace for every care team')}{' '}
            </span>
            <span>
              <Check size={16} /> {t('Secure access, made simple')}{' '}
            </span>
          </div>
        </div>
        <div className="care-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-cross">
            <HeartPulse size={68} strokeWidth={1.3} />
          </div>
          <span className="art-label">
            <span className="status-dot" /> {t('Connected care')}{' '}
          </span>
        </div>
        <footer>
          {t('SMART HOSPITAL MANAGEMENT SYSTEM')} <span>{t('01 / A BETTER START')}</span>
        </footer>
      </section>
      <section className="auth-panel">
        <div className="auth-home-row">
          <Link className="text-link" to="/">
            {t('← Hospital website')}{' '}
          </Link>
          <div className="auth-utilities">
            <LanguageSwitcher />
            <DisplayPreference />
          </div>
        </div>
        <div className="auth-top">
          <span>
            {t('New here?')}{' '}
            {register ? t('Already have an account?') : t('Join your care community.')}
          </span>
          <Link to={register ? '/login' : '/register'} state={{ returnTo }}>
            {register ? t('Sign in') : t('Create account')} <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className={`auth-form-wrap ${register ? 'registration' : ''}`}>
          <div className="auth-icon">
            <HeartPulse size={25} />
          </div>
          <p className="eyebrow">{t('YOUR CARE WORKSPACE')}</p>
          <h2>{register ? t('Let’s get you started.') : t('Welcome back.')}</h2>
          <p className="muted">
            {register
              ? t('Create your patient account. Your care starts here.')
              : t('Sign in to your Smart HMS account to continue.')}
          </p>
          <Notice>{error?.message}</Notice>
          <form onSubmit={submit} className="auth-form">
            {register && (
              <Field
                label={t('Full name')}
                name="name"
                autoComplete="name"
                placeholder={t('Your full name')}
                required
                maxLength={100}
                error={fieldError('name')}
              />
            )}
            <Field
              label={t('Email address')}
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t('you@example.com')}
              required
              maxLength={254}
              error={fieldError('email')}
            />
            {register && (
              <div className="form-grid">
                <Field
                  label={t('Date of birth')}
                  name="dateOfBirth"
                  type="date"
                  min="1900-01-01"
                  max={today()}
                  required
                  error={fieldError('dateOfBirth')}
                />
                <Field
                  label={t('Gender')}
                  name="gender"
                  as="select"
                  defaultValue=""
                  required
                  error={fieldError('gender')}
                >
                  <option value="" disabled>
                    {t('Select an option')}{' '}
                  </option>
                  <option value="female">{t('Female')}</option>
                  <option value="male">{t('Male')}</option>
                  <option value="other">{t('Other')}</option>
                  <option value="prefer-not-to-say">{t('Prefer not to say')}</option>
                </Field>
              </div>
            )}
            {register && (
              <Field
                label={t('Phone number')}
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder={t('e.g. +94 77 123 4567')}
                maxLength={25}
                error={fieldError('phone')}
              />
            )}
            <div className="password-field">
              <Field
                label={t('Password')}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? t('At least 10 characters') : t('Enter your password')}
                minLength={register ? 10 : undefined}
                required
                error={fieldError('password')}
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? t('Hide password') : t('Show password')}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {register && (
              <Field
                label={t('Confirm password')}
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('Re-enter your password')}
                required
                error={fieldError('confirmPassword')}
              />
            )}
            {!register && (
              <Link to="/forgot-password" className="text-link">
                {t('Forgot your password?')}{' '}
              </Link>
            )}
            <Submit busy={busy}>
              {register ? t('Create patient account') : t('Sign in to your workspace')}{' '}
              <ArrowUpRight size={17} />
            </Submit>
          </form>
          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>
              {register
                ? t('Staff accounts are created by your administrator.')
                : t('Your account connects you to the right workspace.')}
            </span>
          </div>
        </div>
        <footer className="auth-bottom">
          <span>{t('Built for better hospital experiences.')}</span>
          <span>{t('Smart HMS')}</span>
        </footer>
      </section>
    </main>
  );
}
