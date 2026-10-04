import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowUpRight, Check, ShieldCheck, HeartPulse, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth';
import { Brand, Field, Notice, Submit } from '../components/ui';
import { today } from '../scheduling';

export default function AuthPage({ register = false }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  if (auth.user) return <Navigate to="/dashboard" replace />;
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
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand light />
        <div className="story-copy">
          <div className="story-kicker">
            <span /> A little more connected. A lot more care.
          </div>
          <h1>
            Good care starts
            <br />
            with a <em>connection.</em>
          </h1>
          <p>
            One place for patients and care teams to come together. Simple, organised, and built
            around you.
          </p>
          <div className="story-points">
            <span>
              <Check size={16} /> Your information, in one place
            </span>
            <span>
              <Check size={16} /> A workspace for every care team
            </span>
            <span>
              <Check size={16} /> Secure access, made simple
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
            <span className="status-dot" /> Connected care
          </span>
        </div>
        <footer>
          SMART HOSPITAL MANAGEMENT SYSTEM <span>01 / A BETTER START</span>
        </footer>
      </section>
      <section className="auth-panel">
        <div className="auth-top">
          <span>
            New here? {register ? 'Already have an account?' : 'Join your care community.'}
          </span>
          <Link to={register ? '/login' : '/register'}>
            {register ? 'Sign in' : 'Create account'} <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className={`auth-form-wrap ${register ? 'registration' : ''}`}>
          <div className="auth-icon">
            <HeartPulse size={25} />
          </div>
          <p className="eyebrow">YOUR CARE WORKSPACE</p>
          <h2>{register ? 'Let’s get you started.' : 'Welcome back.'}</h2>
          <p className="muted">
            {register
              ? 'Create your patient account. Your care starts here.'
              : 'Sign in to your Smart HMS account to continue.'}
          </p>
          <Notice>{error?.message}</Notice>
          <form onSubmit={submit} className="auth-form">
            {register && (
              <Field
                label="Full name"
                name="name"
                autoComplete="name"
                placeholder="Your full name"
                required
                maxLength={100}
                error={fieldError('name')}
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              maxLength={254}
              error={fieldError('email')}
            />
            {register && (
              <div className="form-grid">
                <Field
                  label="Date of birth"
                  name="dateOfBirth"
                  type="date"
                  min="1900-01-01"
                  max={today()}
                  required
                  error={fieldError('dateOfBirth')}
                />
                <Field
                  label="Gender"
                  name="gender"
                  as="select"
                  defaultValue=""
                  required
                  error={fieldError('gender')}
                >
                  <option value="" disabled>
                    Select an option
                  </option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </Field>
              </div>
            )}
            {register && (
              <Field
                label="Phone number"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="e.g. +94 77 123 4567"
                maxLength={25}
                error={fieldError('phone')}
              />
            )}
            <div className="password-field">
              <Field
                label="Password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'At least 10 characters' : 'Enter your password'}
                minLength={register ? 10 : undefined}
                required
                error={fieldError('password')}
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {register && (
              <Field
                label="Confirm password"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                required
                error={fieldError('confirmPassword')}
              />
            )}
            <Submit busy={busy}>
              {register ? 'Create patient account' : 'Sign in to your workspace'}{' '}
              <ArrowUpRight size={17} />
            </Submit>
          </form>
          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>
              {register
                ? 'Staff accounts are created by your administrator.'
                : 'Your account connects you to the right workspace.'}
            </span>
          </div>
        </div>
        <footer className="auth-bottom">
          <span>Built for better hospital experiences.</span>
          <span>Smart HMS · University project</span>
        </footer>
      </section>
    </main>
  );
}
