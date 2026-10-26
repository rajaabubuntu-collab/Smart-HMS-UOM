import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { t } from '../i18n/locale';
import { dateLabel, timeLabel, localDate, money } from '../scheduling';
export default function AssistantGuide({ initialSymptoms = '', onNavigate }) {
  const [symptoms, setSymptoms] = useState(initialSymptoms),
    [warning, setWarning] = useState(''),
    [ack, setAck] = useState(false),
    [consent, setConsent] = useState(false);
  const [status, setStatus] = useState(null),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef(null),
    output = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    api('/recommendations/status', { signal: controller.signal })
      .then(setStatus)
      .catch(() => {});
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (result || error || busy)
      output.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [result, error, busy]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setResult(null);
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await api('/recommendations', {
        method: 'POST',
        signal: controller.signal,
        body: {
          symptoms,
          comments: '',
          emergencySigns: warning,
          acknowledged: ack,
          cloudConsent: consent,
        },
      });
      if (!controller.signal.aborted) setResult(response);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  return (
    <section className="assistant-guide">
      <h3>{t('Department guide')}</h3>
      <p>
        {t(
          'For adults with non-emergency concerns. English descriptions only. This project guide has not been clinically validated and cannot rule out an emergency.',
        )}
      </p>
      <form onSubmit={submit}>
        <label>
          {t('Do any warning signs apply now?')}
          <select
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
            required
            disabled={busy}
          >
            <option value="">{t('Choose an answer')}</option>
            <option value="no">{t('None of these signs')}</option>
            <option value="yes">{t('Yes, a warning sign applies')}</option>
            <option value="unsure">{t('I’m unsure')}</option>
          </select>
        </label>
        <p className="assistant-small">
          {t(
            'Examples: chest pain, severe breathing difficulty, new face drooping or speech difficulty, unconsciousness, uncontrolled bleeding, or a severe allergic reaction. This list is not exhaustive.',
          )}
        </p>
        {(warning === 'yes' || warning === 'unsure') && (
          <p role="alert">
            {t(
              'Please speak to a qualified health professional promptly. If this could be an emergency, call 1990 in Sri Lanka or your local emergency number.',
            )}{' '}
            <a href="tel:1990">{t('Call 1990')}</a>
          </p>
        )}
        <label>
          {t('Primary symptoms')}
          <textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            minLength={3}
            maxLength={1000}
            rows={3}
            required
            disabled={busy}
          />
        </label>
        <label className="assistant-check">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            required
            disabled={busy}
          />
          <span>
            {t('I understand this is a department guide, not a diagnosis or emergency service.')}
          </span>
        </label>
        {status?.requiresCloudConsent !== false && (
          <label className="assistant-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              disabled={busy}
            />
            <span>{t('I agree to send this description to Groq for AI guidance.')}</span>
          </label>
        )}
        <button
          type="submit"
          disabled={
            busy || !ack || !warning || (status?.requiresCloudConsent !== false && !consent)
          }
        >
          {busy ? t('Checking your description') : t('Get department guidance')}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              request.current?.abort();
              setBusy(false);
            }}
          >
            {t('Cancel')}
          </button>
        )}
      </form>
      <div ref={output} aria-live="polite">
        {busy && (
          <p role="status" className="hospital-assistant-loading">
            <LoaderCircle size={18} aria-hidden="true" />
            {t('Checking your description')}
          </p>
        )}
        {error && <p role="alert">{t(error)}</p>}
        {result && (
          <>
            <p>{t(result.explanation)}</p>
            {result.outcome === 'urgent' && <a href="tel:1990">{t('Call 1990')}</a>}
            {result.suggestions?.map((group) => (
              <div key={group.department.id} className="assistant-guide-result">
                <h4>{group.department.name}</h4>
                {group.doctors.map((doctor) => (
                  <article className="hospital-assistant-doctor" key={doctor.id}>
                    <h4>{doctor.name}</h4>
                    <p>{doctor.specialization}</p>
                    {doctor.isDemo && <small>{t('Fictional demo doctor')}</small>}
                    <strong>{money(doctor.consultationFeeMinor)}</strong>
                    {doctor.nextSlots?.map((slot) => (
                      <Link
                        key={slot.id}
                        onClick={onNavigate}
                        to={`/book?doctor=${doctor.id}&date=${localDate(slot.startsAt)}&slot=${slot.id}`}
                        className="assistant-slot-link"
                      >
                        {dateLabel(slot.startsAt)} · {timeLabel(slot.startsAt)}
                      </Link>
                    ))}
                    <Link onClick={onNavigate} to={`/book?doctor=${doctor.id}`}>
                      {t('Browse appointment times')}
                    </Link>
                  </article>
                ))}
                {!group.doctors.length && (
                  <p>
                    {t(
                      'No upcoming times are listed. Check the booking page or contact reception.',
                    )}
                  </p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
