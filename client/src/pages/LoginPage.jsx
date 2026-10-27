import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  FileHeart,
  ReceiptText,
  ShieldCheck,
  HeartPulse,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Brand, Field, Notice, Submit } from '../components/ui';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { DisplayPreference } from '../components/DisplayPreference';
import { t } from '../i18n/locale';
import './LoginPage.css';

gsap.registerPlugin(useGSAP);

// Presentation only: AuthPage retains authentication and protected return destinations.
export default function LoginPage({
  onSubmit,
  busy,
  error,
  returnTo,
  showPassword,
  onTogglePassword,
}) {
  const root = useRef(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        '(prefers-reduced-motion: no-preference)',
        () => {
          gsap
            .timeline({ defaults: { duration: 0.55, ease: 'power2.out' } })
            .from('[data-login-reveal]', { y: 12, stagger: 0.06, clearProps: 'transform' }, 0)
            .from(
              '.login-visual-hub',
              {
                scale: 0.88,
                rotation: -8,
                autoAlpha: 0,
                clearProps: 'transform,opacity,visibility',
              },
              0.1,
            )
            .from(
              '.login-visual-card',
              { y: 20, autoAlpha: 0, stagger: 0.1, clearProps: 'transform,opacity,visibility' },
              0.2,
            )
            .from(
              '.login-visual-ring',
              {
                scale: 0.9,
                autoAlpha: 0,
                stagger: 0.08,
                clearProps: 'transform,opacity,visibility',
              },
              0.1,
            );
        },
        root,
      );
      return () => media.revert();
    },
    { scope: root },
  );
  return (
    <main className="hms-login" ref={root}>
      <header className="login-header">
        <Link className="login-brand" to="/" aria-label={t('Smart HMS home')}>
          <Brand />
        </Link>
        <div className="login-utilities">
          <LanguageSwitcher />
          <DisplayPreference />
        </div>
      </header>
      <div className="login-layout">
        <section className="login-entry" aria-labelledby="login-title">
          <Link className="login-back" to="/">
            <ArrowLeft size={16} aria-hidden="true" />
            {t('Hospital website')}
          </Link>
          <div className="login-form-content">
            <p className="login-overline" data-login-reveal>
              {t('YOUR CARE WORKSPACE')}
            </p>
            <h1 id="login-title" data-login-reveal>
              {t('Welcome back.')}
            </h1>
            <p className="login-description" data-login-reveal>
              {t('Sign in to your Smart HMS account to continue.')}
            </p>
            <Notice>{error?.message}</Notice>
            <form onSubmit={onSubmit} aria-busy={busy}>
              <Field
                label={t('Email address')}
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t('you@example.com')}
                required
                maxLength={254}
                error={error?.fields?.email}
              />
              <div className="login-password">
                <Field
                  label={t('Password')}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('Enter your password')}
                  required
                  error={error?.fields?.password}
                />
                <button
                  className="login-password-toggle"
                  type="button"
                  aria-label={showPassword ? t('Hide password') : t('Show password')}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  onClick={onTogglePassword}
                >
                  {showPassword ? (
                    <EyeOff size={19} aria-hidden="true" />
                  ) : (
                    <Eye size={19} aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="login-recovery">
                <Link to="/forgot-password">{t('Forgot your password?')}</Link>
              </div>
              <Submit busy={busy}>
                {t('Sign in to your workspace')}
                <ArrowRight size={18} aria-hidden="true" />
              </Submit>
            </form>
            <p className="login-account">
              <span>{t('New here?')}</span>
              <Link to="/register" state={{ returnTo }}>
                {t('Create account')}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </p>
            <p className="login-security">
              <ShieldCheck size={17} aria-hidden="true" />
              <span>{t('Your account connects you to the right workspace.')}</span>
            </p>
          </div>
        </section>
        <section className="login-welcome" aria-labelledby="login-welcome-title">
          <div className="login-welcome-copy" data-login-reveal>
            <p className="login-overline">{t('CARE, CONNECTED.')}</p>
            <h2 id="login-welcome-title">
              {t('Good care starts')}
              <br />
              {t('with a')} <em>{t('connection.')}</em>
            </h2>
            <p>
              {t(
                'One place for patients and care teams to come together. Simple, organised, and built around you.',
              )}
            </p>
          </div>
          <div className="login-visual" aria-hidden="true">
            <div className="login-visual-ring login-ring-outer" />
            <div className="login-visual-ring login-ring-inner" />
            <div className="login-visual-hub">
              <HeartPulse size={68} strokeWidth={1.35} />
            </div>
            <div className="login-visual-card login-appointment-card">
              <span className="login-feature-icon">
                <CalendarDays size={23} />
              </span>
              <span>
                <strong>{t('Appointments')}</strong>
                <span className="login-preview-lines">
                  <i />
                  <i />
                </span>
              </span>
              <span className="login-card-check">
                <Check size={15} />
              </span>
            </div>
            <div className="login-visual-card login-record-card">
              <span className="login-feature-icon">
                <FileHeart size={23} />
              </span>
              <span>
                <strong>{t('Medical records')}</strong>
                <span className="login-preview-lines">
                  <i />
                  <i />
                </span>
              </span>
            </div>
            <div className="login-visual-card login-bill-card">
              <span className="login-feature-icon">
                <ReceiptText size={23} />
              </span>
              <strong>{t('Bills & payments')}</strong>
            </div>
            <span className="login-visual-dot login-dot-one" />
            <span className="login-visual-dot login-dot-two" />
          </div>
          <p className="login-welcome-footer">
            <ShieldCheck size={18} aria-hidden="true" />
            {t('Your information, in one place')}
          </p>
        </section>
      </div>
      <footer className="login-footer">
        <span>{t('Built for better hospital experiences.')}</span>
        <span>{t('Smart HMS')}</span>
      </footer>
    </main>
  );
}
