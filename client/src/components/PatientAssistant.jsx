import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sparkles,
  X,
  ArrowUp,
  CalendarDays,
  ReceiptText,
  FileHeart,
  Stethoscope,
  LoaderCircle,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { api } from '../api';
import { t, getLanguage } from '../i18n/locale';
import { dateLabel, timeLabel, money } from '../scheduling';
import AssistantGuide from './AssistantGuide';
import './HospitalAssistant.css';
const actions = [
  ['appointments', 'My appointments', CalendarDays],
  ['bills', 'Bills & payments', ReceiptText],
  ['records', 'Medical records', FileHeart],
  ['guide', 'Department guide', Stethoscope],
];
const format = (field) =>
  field.value === ''
    ? '—'
    : field.format === 'money'
      ? money(field.value)
      : field.format === 'datetime'
        ? `${dateLabel(field.value)} · ${timeLabel(field.value)}`
        : t(String(field.value));
const modeCopy = {
  consent: 'Enable AI understanding below, or use a shortcut without sending a message to Groq.',
  privacy: 'Please remove passwords, security codes and API keys from your message.',
  busy: 'AI understanding is busy. You can still use the account shortcuts.',
  unavailable: 'AI understanding is unavailable. You can still use the account shortcuts.',
  help: 'I can find your appointments, bills, payments, completed records, prescriptions, notifications and profile. Changes and payments must be completed on their own pages.',
  hospital: 'Use the hospital website to explore published doctors and services.',
  urgent:
    'This assistant cannot assess an emergency. If you need urgent help, call 1990 or seek emergency care now.',
};
export default function PatientAssistant() {
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState(''),
    [turns, setTurns] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [consent, setConsent] = useState(false),
    [guide, setGuide] = useState(null),
    [privacyOpen, setPrivacyOpen] = useState(false);
  const [activity, setActivity] = useState(() => Date.now());
  const controller = useRef(null),
    launcher = useRef(null),
    input = useRef(null),
    latest = useRef(null),
    newestTurn = useRef(null),
    guideStart = useRef(null);
  const { pathname } = useLocation();
  function handleActivity() {
    // Called only by interaction handlers, never during render.
    // eslint-disable-next-line react-hooks/purity
    setActivity(Date.now());
  }
  function clear() {
    controller.current?.abort();
    setBusy(false);
    setTurns([]);
    setQuestion('');
    setGuide(null);
    setError('');
    setConsent(false);
    setPrivacyOpen(false);
  }
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const timer = setTimeout(clear, 30 * 60000);
    return () => clearTimeout(timer);
  }, [activity]);
  useEffect(() => {
    function wake() {
      if (Date.now() - activity >= 30 * 60000) clear();
    }
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [activity]);
  useEffect(() => {
    function show(event) {
      setOpen(true);
      setActivity(Date.now());
      if (event.detail?.mode === 'guide') setGuide({ symptoms: '' });
    }
    window.addEventListener('hms:patient-assistant', show);
    return () => window.removeEventListener('hms:patient-assistant', show);
  }, []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const target = busy || error ? latest.current : guide ? guideStart.current : newestTurn.current;
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [open, turns, busy, error, guide]);
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  async function ask(text, action, search) {
    if (busy || text.trim().length < 2) return;
    handleActivity();
    setError('');
    if (action === 'guide') {
      setGuide({ symptoms: '' });
      return;
    }
    setGuide(null);
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await api('/patient/assistant', {
        method: 'POST',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
        body: {
          message: text,
          cloudConsent: consent,
          language: getLanguage(),
          ...(action ? { action } : {}),
          ...(search ? { search } : {}),
          ...(turns.at(-1)?.response.search ? { context: turns.at(-1).response.search } : {}),
        },
      });
      if (request.signal.aborted) return;
      if (result.mode === 'consent') setPrivacyOpen(true);
      if (result.mode === 'guide') setGuide({ symptoms: text });
      else setTurns((prev) => [...prev.slice(-5), { question: text, response: result }]);
      setQuestion('');
    } catch (e) {
      if (!request.signal.aborted) setError(e.message);
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="hospital-assistant-widget patient-assistant" data-route={pathname}>
      <button
        className="hospital-assistant-launcher"
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls="patient-assistant-panel"
        onClick={() => {
          handleActivity();
          setOpen(!open);
        }}
      >
        <Sparkles size={20} aria-hidden="true" />
        {t('My care assistant')}
      </button>
      {open && (
        <section
          id="patient-assistant-panel"
          className="hospital-assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="patient-assistant-title"
          onPointerDownCapture={handleActivity}
          onKeyDownCapture={handleActivity}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="hospital-assistant-header">
            <span className="assistant-header-icon">
              <Sparkles size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="assistant-eyebrow">{t('SMART HMS')}</p>
              <h2 id="patient-assistant-title">{t('My care assistant')}</h2>
              <p>{t('Your care, one conversation')}</p>
            </div>
            <button
              className="hospital-assistant-close"
              type="button"
              onClick={close}
              aria-label={t('Close assistant')}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="assistant-trust-line">
            <ShieldCheck size={14} aria-hidden="true" />
            {t('Your account only · Records stay in Smart HMS')}
          </div>
          <div
            className="hospital-assistant-conversation"
            role="log"
            aria-label={t('Patient conversation')}
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!turns.length && !guide && (
              <div className="assistant-welcome">
                <span className="assistant-welcome-icon">
                  <Sparkles size={28} aria-hidden="true" />
                </span>
                <h3>{t('How can I help with your care?')}</h3>
                <p>{t('Find an appointment, check a bill or get help choosing a department.')}</p>
              </div>
            )}
            <div className="hospital-assistant-suggestions">
              {actions.map(([kind, label, Icon]) => (
                <button
                  type="button"
                  key={kind}
                  onClick={() => ask(t(label), kind)}
                  disabled={busy}
                >
                  <Icon size={16} aria-hidden="true" />
                  {t(label)}
                </button>
              ))}
            </div>
            {turns.map((turn, i) => (
              <div
                key={i}
                ref={i === turns.length - 1 ? newestTurn : null}
                className="hospital-assistant-turn"
              >
                <p className="hospital-assistant-question">{turn.question}</p>
                <div className="hospital-assistant-answer">
                  {turn.response.mode === 'account' ? (
                    <>
                      <p>
                        {t('Found {count} matching items in your account.', {
                          count: turn.response.total,
                        })}
                      </p>
                      {(turn.response.search.dateFrom || turn.response.search.dateTo) && (
                        <p className="assistant-small">
                          {t('Date range')}: {turn.response.search.dateFrom || '…'} —{' '}
                          {turn.response.search.dateTo || '…'}
                        </p>
                      )}
                      {turn.response.summary?.length > 0 && (
                        <dl className="assistant-summary">
                          {turn.response.summary.map((f) => (
                            <div key={f.label}>
                              <dt>{t(f.label)}</dt>
                              <dd>{format(f)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {turn.response.items.map((item) => (
                        <article key={item.id} className="assistant-account-card">
                          <h3>{t(item.title)}</h3>
                          {item.subtitle && <p>{item.subtitle}</p>}
                          <dl>
                            {item.fields.map((f) => (
                              <div key={f.label}>
                                <dt>{t(f.label)}</dt>
                                <dd>{format(f)}</dd>
                              </div>
                            ))}
                          </dl>
                          {item.charges?.length > 0 && (
                            <details>
                              <summary>{t('Bill items')}</summary>
                              {item.charges.map((charge, n) => (
                                <p key={n}>
                                  {charge.description} × {charge.quantity} —{' '}
                                  {money(charge.totalMinor)}
                                </p>
                              ))}
                            </details>
                          )}
                          {item.medications?.length > 0 && (
                            <>
                              <p className="assistant-small">
                                {t(
                                  'As recorded by your clinician. Do not change medication based on chat advice.',
                                )}
                              </p>
                              {item.medications.map((m, n) => (
                                <div className="assistant-medication" key={n}>
                                  <strong>{m.name}</strong>
                                  <p>
                                    {m.dosage} · {m.frequency} · {m.duration}
                                  </p>
                                </div>
                              ))}
                            </>
                          )}
                          {item.noMedicationReason && <p>{item.noMedicationReason}</p>}
                          <Link to={item.href} onClick={close}>
                            {t('View details')}
                          </Link>
                        </article>
                      ))}
                      {turn.response.total === 0 && (
                        <p>
                          {t('No matching items were found. Try a different date or search term.')}
                        </p>
                      )}
                      {turn.response.offset + turn.response.items.length < turn.response.total && (
                        <button
                          type="button"
                          disabled={busy}
                          className="assistant-more"
                          onClick={() =>
                            ask(t('Show more'), undefined, {
                              ...turn.response.search,
                              offset: turn.response.offset + 5,
                            })
                          }
                        >
                          {t('Show more')}
                        </button>
                      )}
                    </>
                  ) : (
                    <p>{t(modeCopy[turn.response.mode] || modeCopy.help)}</p>
                  )}
                  {turn.response.mode === 'urgent' && <a href="tel:1990">{t('Call 1990')}</a>}
                  {turn.response.mode === 'hospital' && (
                    <Link to="/doctors" onClick={close}>
                      {t('Doctors & services')}
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {guide && (
              <div ref={guideStart}>
                <AssistantGuide
                  key={guide.symptoms}
                  initialSymptoms={guide.symptoms}
                  onNavigate={close}
                />
              </div>
            )}
            {busy && (
              <p role="status" className="hospital-assistant-loading">
                <LoaderCircle size={18} aria-hidden="true" />
                {t('Checking your account…')}
              </p>
            )}
            {error && (
              <p role="alert" className="hospital-assistant-error">
                {t(error)}
              </p>
            )}
            <div ref={latest} />
          </div>
          <form
            className="hospital-assistant-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <details
              className="assistant-consent"
              open={privacyOpen}
              onToggle={(event) => setPrivacyOpen(event.currentTarget.open)}
            >
              <summary>{t(consent ? 'AI enabled for messages' : 'Enable AI for messages')}</summary>
              <label className="assistant-check assistant-small">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (e.target.checked) setPrivacyOpen(false);
                  }}
                />
                <span>
                  {t(
                    'Use AI to understand my message. My message goes to Groq; my account records stay in Smart HMS.',
                  )}
                </span>
              </label>
            </details>
            <label className="assistant-composer-label" htmlFor="patient-assistant-question">
              {t('Your question')}
            </label>
            <div className="assistant-compose-row">
              <textarea
                id="patient-assistant-question"
                ref={input}
                rows={2}
                maxLength={500}
                readOnly={busy}
                value={question}
                onChange={(e) => {
                  handleActivity();
                  setQuestion(e.target.value);
                }}
                placeholder={t('Ask about your appointments or bills…')}
              />
              <button
                type="submit"
                disabled={busy || question.trim().length < 2}
                aria-label={t('Send question')}
              >
                <ArrowUp size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="hospital-assistant-actions">
              <button type="button" onClick={clear}>
                <RotateCcw size={14} aria-hidden="true" />
                {t('Clear')}
              </button>
              {busy && (
                <button
                  type="button"
                  onClick={() => {
                    controller.current?.abort();
                    setBusy(false);
                  }}
                >
                  {t('Cancel')}
                </button>
              )}
              <small>{t('Private to this visit · Clears after 30 minutes idle')}</small>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
