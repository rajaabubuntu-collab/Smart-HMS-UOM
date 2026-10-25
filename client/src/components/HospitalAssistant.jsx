import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X, Send, LoaderCircle } from 'lucide-react';
import { api } from '../api';
import { t } from '../i18n/locale';
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
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null),
    launcher = useRef(null),
    end = useRef(null),
    request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [open, turns, busy, error]);
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  async function ask(value) {
    const text = value.trim();
    if (busy || text.length < 2) return;
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
          history: turns
            .filter((turn) => turn.response.mode === 'information')
            .slice(-2)
            .map((turn) => turn.question),
        },
      });
      if (controller.signal.aborted) return;
      setTurns((previous) => [...previous.slice(-5), { question: text, response }]);
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
    <>
      <button
        ref={launcher}
        type="button"
        className="hospital-assistant-launcher"
        aria-expanded={open}
        aria-controls="hospital-assistant-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle size={22} aria-hidden="true" /> {t('Ask Smart HMS')}
      </button>
      {open && (
        <section
          id="hospital-assistant-panel"
          className="hospital-assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="assistant-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <header className="hospital-assistant-header">
            <div>
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
          <div
            className="hospital-assistant-conversation"
            role="log"
            aria-label={t('Hospital conversation')}
            aria-live="polite"
            aria-relevant="additions text"
          >
            <p>{t('Ask about doctors, appointments, opening hours or getting here.')}</p>
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
              <div className="hospital-assistant-turn" key={index}>
                <p className="hospital-assistant-question">{turn.question}</p>
                <div className="hospital-assistant-answer">
                  <p>{t(messages[turn.response.mode] || messages.unavailable)}</p>
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
                'Questions are sent to Groq for AI matching. Do not share personal or medical details. This chat is not saved to your account.',
              )}
            </p>
            <label htmlFor="hospital-assistant-question">{t('Your question')}</label>
            <textarea
              id="hospital-assistant-question"
              ref={input}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
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
                  setTurns([]);
                  setQuestion('');
                  setError('');
                  input.current?.focus();
                }}
              >
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
                  <Send size={16} aria-hidden="true" />
                  {t('Send question')}
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </>
  );
}
