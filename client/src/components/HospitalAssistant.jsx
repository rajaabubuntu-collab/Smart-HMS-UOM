import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X, ArrowUp, LoaderCircle, ShieldCheck, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useLocation } from 'react-router-dom';
import { assistantSession } from '../public-assistant-session';
import { t, getLanguage } from '../i18n/locale';
import { dateLabel, timeLabel, money } from '../scheduling';
import './HospitalAssistant.css';

const suggestions = [
  'How do I book an appointment?',
  'Reception opening hours',
  'Doctors & services',
];
const messages = {
  information: 'Here is the published information that may help.',
  medical:
    'This assistant cannot assess symptoms or recommend treatment. Please speak to a qualified health professional. The patient portal has a separate department guide.',
  urgent:
    'This assistant cannot assess an emergency. If you need urgent help, call 1990 or seek emergency care now.',
  unknown:
    'I can help with hospital information and using Smart HMS. Please ask about appointments, doctors, visiting hours or reception.',
  privacy:
    'Please remove personal details, passwords, phone numbers and medical records before sending your question.',
  unavailable: 'AI help is temporarily unavailable. You can still use these hospital links.',
  busy: 'AI help is busy right now. Please try again later or use these hospital links.',
};

export default function HospitalAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const turns = useSyncExternalStore(assistantSession.subscribe, assistantSession.getSnapshot);
  const { loading: authLoading, error: authError } = useAuth();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null),
    launcher = useRef(null),
    end = useRef(null),
    latestTurn = useRef(null),
    request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(
    () =>
      assistantSession.onReset(() => {
        request.current?.abort();
        setQuestion('');
        setError('');
        setBusy(false);
      }),
    [],
  );
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (busy || error) end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    else latestTurn.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [open, turns, busy, error]);
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  async function ask(value) {
    const text = value.trim();
    if (busy || text.length < 2 || authLoading) return;
    if (authError) assistantSession.clear();
    assistantSession.touch();
    const revision = assistantSession.getRevision();
    const currentTurns = assistantSession.getSnapshot();
    setBusy(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await api('/public/assistant', {
        method: 'POST',
        ignoreAuth: true,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
        body: {
          message: text,
          language: getLanguage(),
          context:
            [...currentTurns].reverse().find((turn) => turn.response.context)?.response.context ||
            '',
          history: currentTurns
            .filter((turn) => turn.response.mode === 'information')
            .slice(-2)
            .map((turn) => turn.question),
        },
      });
      if (controller.signal.aborted) return;
      assistantSession.append({ question: text, response }, revision);
      setQuestion('');
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err.name === 'TimeoutError'
            ? 'AI help took too long. Please try again or contact reception.'
            : err.message,
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="hospital-assistant-widget" key={pathname}>
      <button
        ref={launcher}
        type="button"
        className="hospital-assistant-launcher"
        aria-expanded={open}
        aria-controls="hospital-assistant-panel"
        disabled={authLoading}
        onClick={() => {
          if (authError) assistantSession.clear();
          assistantSession.touch();
          setOpen((value) => !value);
        }}
      >
        <Sparkles size={22} aria-hidden="true" /> {t('Ask Smart HMS')}
      </button>
      {open && (
        <section
          id="hospital-assistant-panel"
          className="hospital-assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="assistant-title"
          onPointerDownCapture={() => assistantSession.touch()}
          onKeyDownCapture={() => assistantSession.touch()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <header className="hospital-assistant-header">
            <span className="assistant-header-icon">
              <Sparkles size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="assistant-eyebrow">{t('SMART HMS')}</p>
              <h2 id="assistant-title">{t('Hospital assistant')}</h2>
              <p>{t('AI help with your visit')}</p>
            </div>
            <button
              type="button"
              className="hospital-assistant-close"
              onClick={close}
              aria-label={t('Close assistant')}
            >
              <X size={22} aria-hidden="true" />
            </button>
          </header>
          <div className="assistant-trust-line">
            <ShieldCheck size={14} aria-hidden="true" />
            {t('Hospital information · Powered by Groq')}
          </div>
          <div
            className="hospital-assistant-conversation"
            role="log"
            aria-label={t('Hospital conversation')}
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!turns.length && (
              <div className="assistant-welcome">
                <span className="assistant-welcome-icon">
                  <Sparkles size={28} aria-hidden="true" />
                </span>
                <h3>{t('How can I help with your visit?')}</h3>
                <p>{t('Ask about doctors, appointments, opening hours or getting here.')}</p>
              </div>
            )}
            {!turns.length && (
              <div className="hospital-assistant-suggestions">
                {suggestions.map((label) => (
                  <button type="button" key={label} disabled={busy} onClick={() => ask(t(label))}>
                    {t(label)}
                  </button>
                ))}
              </div>
            )}
            {turns.map((turn, index) => (
              <div
                className="hospital-assistant-turn"
                key={index}
                ref={index === turns.length - 1 ? latestTurn : null}
              >
                <p className="hospital-assistant-question">{turn.question}</p>
                <div className="hospital-assistant-answer">
                  <p>
                    {turn.response.reply || t(messages[turn.response.mode] || messages.unavailable)}
                  </p>
                  {turn.response.doctors && (
                    <div className="hospital-assistant-results">
                      {turn.response.status === 'invalid-date' ? (
                        <p>{t('Please choose a date within the next 180 days.')}</p>
                      ) : (
                        <>
                          <p className="hospital-assistant-result-count">
                            {t('Showing {shown} of {total} matching doctors.', {
                              shown: turn.response.doctors.length,
                              total: turn.response.total,
                            })}
                          </p>
                          {turn.response.filters?.date && (
                            <p>
                              {t('Appointment date')}:{' '}
                              {dateLabel(`${turn.response.filters.date}T00:00:00+05:30`)}
                            </p>
                          )}
                          {turn.response.filters?.period &&
                            turn.response.filters.period !== 'any' && (
                              <p>
                                {t(
                                  {
                                    morning: 'Morning',
                                    afternoon: 'Afternoon',
                                    evening: 'Evening',
                                  }[turn.response.filters.period],
                                )}
                              </p>
                            )}
                          {!turn.response.doctors.length && (
                            <p>
                              {t(
                                'No published doctors matched this search. Try a different name or specialty, or contact reception.',
                              )}
                            </p>
                          )}
                          {turn.response.doctors.map((doctor) => (
                            <article className="hospital-assistant-doctor" key={doctor.id}>
                              {doctor.demo && <small>{t('Demonstration information')}</small>}
                              <h3>{doctor.name}</h3>
                              <p>
                                {doctor.department} · {doctor.specialization}
                              </p>
                              <p>{doctor.qualification}</p>
                              <strong>
                                {money(doctor.consultationFeeMinor)}{' '}
                                <span>{t('Consultation fee')}</span>
                              </strong>
                              <p className="hospital-assistant-slot-label">
                                {t('Available times')}
                              </p>
                              {doctor.slots.length ? (
                                <div className="hospital-assistant-slots">
                                  {doctor.slots.map((slot) => (
                                    <Link
                                      key={slot.id}
                                      to={slot.href}
                                      onClick={close}
                                      aria-label={`${t('Choose time')}: ${doctor.name}, ${dateLabel(slot.startsAt)}, ${timeLabel(slot.startsAt)}`}
                                    >
                                      <span>{dateLabel(slot.startsAt)}</span>
                                      <strong>
                                        {timeLabel(slot.startsAt)} – {timeLabel(slot.endsAt)}
                                      </strong>
                                    </Link>
                                  ))}
                                </div>
                              ) : (
                                <p>
                                  {t(
                                    'No available times match these filters. Try another date or contact reception.',
                                  )}
                                </p>
                              )}
                              <div className="hospital-assistant-doctor-actions">
                                <Link to={doctor.href} onClick={close}>
                                  {t('View profile')}
                                </Link>
                                <Link to={doctor.bookingHref} onClick={close}>
                                  {t('Browse appointment times')}
                                </Link>
                              </div>
                            </article>
                          ))}
                          <p className="hospital-assistant-slot-note">
                            {t('All times are Sri Lanka time (UTC+05:30).')}{' '}
                            {t('Times remain available until someone confirms a booking.')}
                          </p>
                          {turn.response.checkedAt && (
                            <small>
                              {t('Availability checked at {time}.', {
                                time: timeLabel(turn.response.checkedAt),
                              })}
                            </small>
                          )}
                        </>
                      )}
                      <Link to="/doctors" onClick={close}>
                        {t('Browse doctors')}
                      </Link>
                      {' · '}
                      <Link to="/contact" onClick={close}>
                        {t('Contact us')}
                      </Link>
                    </div>
                  )}
                  {turn.response.facts.map((entry) => (
                    <div className="hospital-assistant-fact" key={entry.id}>
                      <h3>{t(entry.title)}</h3>
                      {entry.demo && <small>{t('Demonstration information')}</small>}
                      {entry.hours &&
                        (entry.allDay ? (
                          <p>{t('Reception open 24/7')}</p>
                        ) : (
                          <dl>
                            {entry.hours.map((day) => (
                              <div key={day.day}>
                                <dt>{t(day.day)}</dt>
                                <dd>
                                  {day.closed
                                    ? t('Closed')
                                    : day.allDay
                                      ? t('Open 24 hours')
                                      : `${day.opens}–${day.closes}`}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ))}
                      <p>{t(entry.text, entry.values)}</p>
                      <Link to={entry.href} onClick={close}>
                        {t('View details')}
                      </Link>
                    </div>
                  ))}
                  {turn.response.mode === 'urgent' && <a href="tel:1990">{t('Call 1990')}</a>}
                  {turn.response.mode === 'medical' && (
                    <Link to="/recommendations" onClick={close}>
                      {t('Patient portal')}
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <p className="hospital-assistant-loading" role="status">
                <LoaderCircle size={18} aria-hidden="true" />
                {t('Checking hospital information…')}
              </p>
            )}
            {error && (
              <p className="hospital-assistant-error" role="alert">
                {t(error)}
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            className="hospital-assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
          >
            <p className="hospital-assistant-privacy">
              {t(
                'Questions are sent to Groq. General chat is kept in this tab and expires after 30 minutes of inactivity. Do not share personal or medical details.',
              )}
            </p>
            <label htmlFor="hospital-assistant-question">{t('Your question')}</label>
            <textarea
              id="hospital-assistant-question"
              ref={input}
              value={question}
              onChange={(event) => {
                assistantSession.touch();
                setQuestion(event.target.value);
              }}
              maxLength={500}
              rows={2}
              readOnly={busy}
              placeholder={t('Ask about your hospital visit…')}
            />
            <div className="hospital-assistant-actions">
              <button
                type="button"
                disabled={busy || !turns.length}
                onClick={() => {
                  assistantSession.clear();
                  setQuestion('');
                  setError('');
                  input.current?.focus();
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t('Clear')}
              </button>
              {busy ? (
                <button
                  type="button"
                  onClick={() => {
                    request.current?.abort();
                    setBusy(false);
                  }}
                >
                  {t('Cancel')}
                </button>
              ) : (
                <button type="submit" disabled={question.trim().length < 2}>
                  <ArrowUp size={18} aria-hidden="true" />
                  {t('Send question')}
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
