import { t } from '../i18n/locale';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  Sparkles,
  BrainCircuit,
  Building2,
  CalendarDays,
  Check,
  FlaskConical,
  Info,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Phone,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Users,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../api';
import { Field, Notice, PageHeading } from '../components/ui';
import { money, dateLabel, timeLabel, localDate } from '../scheduling';
import './Recommendations.css';

const emptyForm = {
  symptoms: '',
  durationValue: '',
  durationUnit: 'days',
  painLevel: '',
  comments: '',
  emergencySigns: '',
  acknowledged: false,
  cloudConsent: false,
};
function GuideLoading({ thinkingEnabled }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="guide-loading">
      <div
        className="guide-loading-track"
        role="progressbar"
        aria-label={t('Checking your description')}
      >
        <span />
      </div>
      <p role="status">
        {t('Checking your description')}
        <span className="guide-loading-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
      <small aria-live="off">{t('Elapsed: {seconds} seconds', { seconds: elapsed })}</small>
      {thinkingEnabled && (
        <p className="guide-loading-help">
          {t(
            'If the first check is inconclusive, a second local model may review it. This can take up to three minutes.',
          )}
        </p>
      )}
      {elapsed >= 30 && <p role="status">{t('Still working. You can cancel at any time.')}</p>}
    </div>
  );
}
function EmergencyHelp() {
  return (
    <div className="guide-emergency" role="alert">
      <h2>{t('Possible emergency? Get help now.')}</h2>
      <p>
        {t('Do not wait for a routine appointment. In Sri Lanka, call')} <a href="tel:1990">1990</a>{' '}
        {t('for an emergency ambulance. Elsewhere, call your local emergency number.')}
      </p>
    </div>
  );
}
function DoctorCard({ doctor }) {
  const firstSlot = doctor.nextSlots?.[0];
  const bookingUrl = `/book?doctor=${doctor.id}${firstSlot ? `&date=${localDate(firstSlot.startsAt)}` : ''}`;
  const initials = doctor.name
    .replace(/^Dr\.?\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('');
  return (
    <div className="card guide-doctor">
      <div className="guide-doctor-heading">
        <span className="guide-doctor-avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <h3>{doctor.name}</h3>
          <p>{doctor.specialization}</p>
          {doctor.isDemo && <span className="guide-demo-tag">{t('Fictional demo doctor')}</span>}
        </div>
        <div className="guide-fee">
          <strong>{money(doctor.consultationFeeMinor)}</strong>
          <small>{t('Consultation fee')}</small>
        </div>
      </div>
      <details className="guide-profile">
        <summary>{t('View doctor profile')}</summary>
        <p>{doctor.qualification || t('Qualification information is not listed.')}</p>
      </details>
      <div className="guide-availability">
        <p>
          <CalendarDays size={16} aria-hidden="true" />{' '}
          <strong>{t('Upcoming appointment times')}</strong>
        </p>
        {doctor.nextSlots?.length ? (
          <>
            <div className="guide-slot-grid">
              {doctor.nextSlots.map((slot) => (
                <Link
                  key={slot.id}
                  to={`/book?doctor=${doctor.id}&date=${localDate(slot.startsAt)}`}
                  className="guide-slot"
                >
                  <span>{dateLabel(slot.startsAt)}</span>
                  <strong>{timeLabel(slot.startsAt)}</strong>
                </Link>
              ))}
            </div>
            <small>{t('Sri Lanka time. Availability is checked again when you book.')}</small>
          </>
        ) : (
          <p className="muted">
            {t('No upcoming times are listed. Check the booking page or contact reception.')}
          </p>
        )}
      </div>
      <Link className="button primary guide-book" to={bookingUrl}>
        <CalendarDays size={17} aria-hidden="true" />
        {t('View times with')} {doctor.name}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
export default function Recommendations() {
  const [directory, setDirectory] = useState(null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const pending = useRef(null);
  const resultsPanel = useRef(null);
  const aiEnabled = Boolean(directory?.aiEnabled);
  const cloudProvider = directory?.provider === 'groq';
  useEffect(() => {
    if ((busy || result) && window.matchMedia('(max-width: 1000px)').matches)
      resultsPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [busy, result]);
  useEffect(() => {
    const controller = new AbortController();
    api('/recommendations/status', { signal: controller.signal })
      .then(setDirectory)
      .catch(() => {});
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, []);
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
    setError(null);
  }
  function clear() {
    setForm({ ...emptyForm });
    setOptionalOpen(false);
    setResult(null);
    setError(null);
  }
  async function submit(event) {
    event.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api('/recommendations', {
        method: 'POST',
        signal: controller.signal,
        body: {
          symptoms: form.symptoms,
          duration: { value: Number(form.durationValue), unit: form.durationUnit },
          ...(form.painLevel ? { painLevel: Number(form.painLevel) } : {}),
          comments: form.comments,
          emergencySigns: form.emergencySigns,
          acknowledged: form.acknowledged,
          cloudConsent: cloudProvider && form.cloudConsent,
        },
      });
      if (!controller.signal.aborted) setResult(response);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="recommendation-page">
      <div className="guide-alert-strip">
        <span className="guide-alert-icon">
          <TriangleAlert size={22} aria-hidden="true" />
        </span>
        <div>
          <strong>{t('Need urgent medical help?')}</strong>
          <p>
            {t(
              'For severe, sudden or worsening symptoms, seek medical help immediately. This guide cannot assess emergencies.',
            )}
          </p>
        </div>
        <a href="tel:1990">
          <Phone size={16} aria-hidden="true" />
          {t('Call 1990')}
        </a>
      </div>
      <PageHeading
        eyebrow="PATIENT WORKSPACE"
        title="Find your next step in care"
        description="Describe your concern in your own words. Find a possible department and explore the doctors available to book."
      >
        {directory && (
          <div className="guide-directory-stats" aria-label={t('Hospital directory')}>
            <div>
              <Building2 size={18} aria-hidden="true" />
              <strong>{directory.departmentCount ?? '—'}</strong>
              <span>{t('Departments')}</span>
            </div>
            <div>
              <Users size={18} aria-hidden="true" />
              <strong>{directory.doctorCount ?? '—'}</strong>
              <span>{t('Doctors')}</span>
            </div>
          </div>
        )}
      </PageHeading>
      <div className="guide-badges">
        <span className="guide-engine">
          <BrainCircuit size={15} aria-hidden="true" />
          {aiEnabled ? t('AI-assisted department guide') : t('Department matching guide')}
        </span>
        <span className="guide-subtle-badge">
          <ShieldCheck size={14} aria-hidden="true" />
          {t('Guidance, not a diagnosis')}
        </span>
      </div>
      <div className="guide-scope-note">
        <Info size={18} aria-hidden="true" />
        <p>
          {t(
            'For adults with non-emergency concerns. English descriptions only. This project guide has not been clinically validated and cannot rule out an emergency.',
          )}
        </p>
      </div>
      <div className="recommendation-grid">
        <div className="guide-intake-column">
          <section className="card padded guide-panel guide-form-card">
            <form onSubmit={submit}>
              <Notice>{error?.message}</Notice>
              <fieldset className="clinical-fieldset" disabled={busy}>
                <div className="guide-panel-heading">
                  <span className="guide-section-icon">
                    <MessageSquareText size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <h2>{t('Tell us about your symptoms')}</h2>
                    <p>{t('Start with what you are experiencing')}</p>
                  </div>
                  <button type="button" className="guide-clear" onClick={clear}>
                    <RotateCcw size={14} aria-hidden="true" />
                    {t('Clear')}
                  </button>
                </div>
                <div className="guide-form-section">
                  <h3 className="guide-step-title">
                    <span>1</span>
                    {t('First, check for warning signs')}
                  </h3>
                  <Field
                    name="emergencySigns"
                    label={t('Do any warning signs apply now?')}
                    required
                    as="select"
                    value={form.emergencySigns}
                    onChange={(e) => change('emergencySigns', e.target.value)}
                    error={error?.fields?.emergencySigns}
                    hint={t(
                      'Examples: chest pain, severe breathing difficulty, new face drooping or speech difficulty, unconsciousness, uncontrolled bleeding, or a severe allergic reaction. This list is not exhaustive.',
                    )}
                  >
                    <option value="">{t('Choose an answer')}</option>
                    <option value="no">{t('None of these signs')}</option>
                    <option value="yes">{t('Yes, a warning sign applies')}</option>
                    <option value="unsure">{t('I’m unsure')}</option>
                  </Field>
                  {form.emergencySigns === 'yes' && <EmergencyHelp />}
                  {form.emergencySigns === 'unsure' && (
                    <Notice>
                      {t(
                        'Please speak to a qualified health professional promptly. If this could be an emergency, call 1990 in Sri Lanka or your local emergency number.',
                      )}
                    </Notice>
                  )}
                </div>
                <div className="guide-form-section">
                  <h3 className="guide-step-title">
                    <span>2</span>
                    {t('Describe your concern')}
                  </h3>
                  <Field
                    name="symptoms"
                    label={t('Primary symptoms')}
                    required
                    as="textarea"
                    rows={4}
                    minLength={3}
                    maxLength={1000}
                    value={form.symptoms}
                    onChange={(e) => change('symptoms', e.target.value)}
                    error={error?.fields?.symptoms}
                    placeholder={t('Describe how you feel and where you notice the problem…')}
                  />
                  <div className="guide-input-meta">
                    <span>
                      <LockKeyhole size={13} aria-hidden="true" />
                      {t('Leave out personal details')}
                    </span>
                    <span>{form.symptoms.length}/1000</span>
                  </div>
                </div>
                <div className="guide-form-section">
                  <h3 className="guide-step-title">
                    <span>3</span>
                    {t('Tell us how long')}
                  </h3>
                  <div className="guide-duration-chips" aria-label={t('Quick duration choices')}>
                    {[
                      [1, 'days', '1 day'],
                      [3, 'days', '3 days'],
                      [7, 'days', '1 week'],
                      [2, 'weeks', '2 weeks'],
                    ].map(([value, unit, label]) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={
                          Number(form.durationValue) === value && form.durationUnit === unit
                        }
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            durationValue: String(value),
                            durationUnit: unit,
                          }));
                          setResult(null);
                          setError(null);
                        }}
                      >
                        {t(label)}
                        {Number(form.durationValue) === value && form.durationUnit === unit && (
                          <Check size={14} aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="form-grid">
                    <Field
                      name="durationValue"
                      label={t('How long have you had these symptoms?')}
                      required
                      type="number"
                      min={1}
                      max={3650}
                      step={1}
                      value={form.durationValue}
                      onChange={(e) => change('durationValue', e.target.value)}
                      error={error?.fields?.['duration.value']}
                    />
                    <Field
                      name="durationUnit"
                      label={t('Duration unit')}
                      as="select"
                      value={form.durationUnit}
                      onChange={(e) => change('durationUnit', e.target.value)}
                    >
                      {['hours', 'days', 'weeks', 'months'].map((unit) => (
                        <option key={unit} value={unit}>
                          {t(unit)}
                        </option>
                      ))}
                    </Field>
                  </div>
                </div>
                <details
                  className="guide-optional"
                  open={optionalOpen}
                  onToggle={(event) => setOptionalOpen(event.currentTarget.open)}
                >
                  <summary>
                    <span>{t('Add more details (optional)')}</span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <div className="guide-optional-content">
                    <Field
                      name="painLevel"
                      label={t('Pain level (optional)')}
                      as="select"
                      value={form.painLevel}
                      onChange={(e) => change('painLevel', e.target.value)}
                      error={error?.fields?.painLevel}
                      hint={t(
                        '1 = lowest, 10 = highest. Leave blank if there is no pain or you prefer not to say.',
                      )}
                    >
                      <option value="">{t('Not provided')}</option>
                      {Array.from({ length: 10 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </Field>
                    <Field
                      name="comments"
                      label={t('Additional comments (optional)')}
                      as="textarea"
                      rows={2}
                      maxLength={1000}
                      value={form.comments}
                      onChange={(e) => change('comments', e.target.value)}
                      error={error?.fields?.comments}
                    />
                  </div>
                </details>
                <div className="guide-confirmation">
                  <label className="clinical-check">
                    <input
                      type="checkbox"
                      required
                      checked={form.acknowledged}
                      onChange={(e) => change('acknowledged', e.target.checked)}
                    />
                    {t(
                      'I understand this is a department guide, not a diagnosis or emergency service.',
                    )}
                  </label>
                  {cloudProvider && (
                    <div className="guide-cloud-consent">
                      <p>
                        {t(
                          'Groq processes the description you submit. Use fictional examples for project testing and leave out names, contact details and identification numbers.',
                        )}
                      </p>
                      <label className="clinical-check">
                        <input
                          type="checkbox"
                          required
                          checked={form.cloudConsent}
                          onChange={(e) => change('cloudConsent', e.target.checked)}
                        />
                        {t('I agree to send this description to Groq for AI guidance.')}
                      </label>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="button primary guide-submit"
                  disabled={busy || !form.acknowledged || (cloudProvider && !form.cloudConsent)}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={20} aria-hidden="true" />
                  ) : (
                    <BrainCircuit size={20} aria-hidden="true" />
                  )}
                  {busy ? t('Checking the guide…') : t('Get department guidance')}
                </button>
                {(!form.acknowledged || (cloudProvider && !form.cloudConsent)) && (
                  <p className="guide-submit-help">
                    {t('Tick the required boxes above to continue.')}
                  </p>
                )}
                <p className="guide-local-note">
                  <LockKeyhole size={14} aria-hidden="true" />
                  {t('Your description is not saved to your medical record.')}
                </p>
              </fieldset>
            </form>
          </section>
          {directory?.demoAvailable && (
            <details className="card padded guide-panel guide-demo-panel">
              <summary>
                <FlaskConical size={20} aria-hidden="true" />
                {t('Try a demo scenario')}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                {t(
                  'These fictional examples help you explore the guide. Demo doctors are test profiles, not real clinicians.',
                )}
              </p>
              <Field
                name="demoScenario"
                label={t('Example department')}
                as="select"
                value=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) change('symptoms', e.target.value);
                }}
              >
                <option value="">{t('Choose a sample description')}</option>
                {directory.examples.map((example) => (
                  <option key={example.department} value={example.symptoms}>
                    {example.department}
                  </option>
                ))}
              </Field>
              <p className="small-text">
                {t('Review the warning signs and complete the form before submitting.')}
              </p>
            </details>
          )}
        </div>
        <section
          ref={resultsPanel}
          className="guide-results"
          data-active={busy || Boolean(result)}
          aria-live="polite"
          aria-busy={busy}
          aria-label={t('Your guidance')}
        >
          {!result && (
            <div className="card padded guide-panel guide-empty">
              <div className={`guide-orbit ${busy ? 'is-busy' : ''}`}>
                <Sparkles size={38} aria-hidden="true" />
              </div>
              <span className="guide-overline">{t('YOUR NEXT STEP IN CARE')}</span>
              <h2>{busy ? t('Reading your description…') : t('Your guidance will appear here')}</h2>
              <p>
                {busy
                  ? t(
                      cloudProvider
                        ? 'Groq is reviewing your description. If AI is unavailable, clearly labelled basic matching rules will be used.'
                        : aiEnabled
                          ? 'The local model is reviewing your description. If AI is unavailable, clearly labelled basic matching rules will be used.'
                          : 'Checking your description against the department matching rules.',
                    )
                  : t(
                      'Complete the form to see a possible department, an explanation and doctor booking options.',
                    )}
              </p>
              {busy ? (
                <>
                  <GuideLoading thinkingEnabled={directory?.thinkingEnabled} />
                  <button
                    type="button"
                    className="guide-clear"
                    onClick={() => {
                      pending.current?.abort();
                      setBusy(false);
                    }}
                  >
                    {t('Cancel request')}
                  </button>
                </>
              ) : (
                <div className="guide-empty-steps">
                  <span>
                    <MessageSquareText size={18} aria-hidden="true" />
                    {t('Describe')}
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                  <span>
                    <Lightbulb size={18} aria-hidden="true" />
                    {t('Understand')}
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                  <span>
                    <CalendarDays size={18} aria-hidden="true" />
                    {t('Choose care')}
                  </span>
                </div>
              )}
              <div className="guide-empty-footer">
                <ShieldCheck size={17} aria-hidden="true" />
                {t('No diagnosis, treatment advice or medical certainty score.')}
              </div>
            </div>
          )}
          {result && (
            <>
              <div className="card padded guide-panel guide-result-summary">
                <div className="guide-result-top">
                  <span className="guide-section-icon">
                    <BrainCircuit size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <span className="guide-overline">{t('YOUR GUIDANCE')}</span>
                    <h2>
                      {result.outcome === 'matched'
                        ? t('A possible department')
                        : result.outcome === 'urgent'
                          ? t('Routine booking suggestions stopped')
                          : result.outcome === 'review'
                            ? t('Speak to a health professional')
                            : t('Contact hospital reception')}
                    </h2>
                  </div>
                </div>
                <span className="guide-engine">
                  {result.source === 'ai'
                    ? t(result.provider === 'groq' ? 'Groq AI guidance' : 'AI-assisted guidance')
                    : result.source === 'safety'
                      ? t('Safety and scope check')
                      : t('Rule-based guidance')}
                </span>
                {result.thinkingAttempted && (
                  <p className="guide-thinking-note">
                    {result.thinkingStatus === 'ok'
                      ? t(
                          'A second local thinking model checked this request. It may still refer you to a clinician.',
                        )
                      : t(
                          'The second local check could not finish. The original guidance is shown.',
                        )}
                  </p>
                )}
                {result.fallback && (
                  <Notice>
                    {t(
                      'AI guidance is unavailable for this request. This result uses basic matching rules, not an AI recommendation.',
                    )}
                  </Notice>
                )}
                <p>{result.explanation}</p>
                {['staff', 'unavailable'].includes(result.outcome) && (
                  <p>
                    {t(
                      'Contact your hospital reception using its usual contact details or visit the reception desk. No appointment has been created.',
                    )}
                  </p>
                )}
              </div>
              {['urgent', 'review'].includes(result.outcome) && <EmergencyHelp />}
              {result.suggestions.map((suggestion) => (
                <article
                  className="card padded guide-panel guide-suggestion"
                  key={suggestion.department.id}
                >
                  <div className="guide-department">
                    <span className="guide-department-icon">
                      <Stethoscope size={28} aria-hidden="true" />
                    </span>
                    <div>
                      <span className="guide-overline">{t('SUGGESTED DEPARTMENT')}</span>
                      <h2>{suggestion.department.name}</h2>
                      <p>{t('{count} doctors listed', { count: suggestion.doctorCount })}</p>
                    </div>
                  </div>
                  <div className="guide-reason">
                    <h3>
                      <Lightbulb size={20} aria-hidden="true" />
                      {t('Why this department?')}
                    </h3>
                    <p>{suggestion.explanation}</p>
                    {suggestion.matchedTerms.length > 0 && (
                      <p>
                        <strong>{t('Matched words:')}</strong> {suggestion.matchedTerms.join(', ')}
                      </p>
                    )}
                    {suggestion.evidence?.length > 0 && (
                      <p>
                        <strong>{t('From your description:')}</strong>{' '}
                        {suggestion.evidence.map((quote) => `“${quote}”`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="guide-doctors-title">
                    <h3>{t('Doctors in this department')}</h3>
                    <span>{t('Listed without clinical ranking')}</span>
                  </div>
                  {!suggestion.doctors.length && (
                    <Notice>
                      {t(
                        'No active doctors are listed in this department. Contact reception for help arranging care.',
                      )}
                    </Notice>
                  )}
                  {suggestion.doctors.map((doctor) => (
                    <DoctorCard key={doctor.id} doctor={doctor} />
                  ))}
                  {suggestion.doctorCount > suggestion.doctors.length && (
                    <Link
                      className="button subtle"
                      to={`/book?department=${suggestion.department.id}`}
                    >
                      {t('Browse all')} {suggestion.doctorCount} {t('doctors in this department')}
                    </Link>
                  )}
                </article>
              ))}
              <div className="guide-result-disclaimer">
                <ShieldCheck size={20} aria-hidden="true" />
                <p>{result.disclaimer}</p>
              </div>
            </>
          )}
        </section>
      </div>
      <footer className="card padded guide-privacy-footer">
        <LockKeyhole size={21} aria-hidden="true" />
        <div>
          <strong>
            {t(
              cloudProvider
                ? 'How your description is processed'
                : 'Your description stays private',
            )}
          </strong>
          <p>
            {t(
              cloudProvider
                ? 'Groq processes your submitted description. Smart HMS does not save it in your medical record or copy it into appointments. Your name, account details and medical records are not attached to the request.'
                : 'Descriptions are processed for this request and are not saved in your record or copied into appointments. Please leave out names, contact details and identification numbers.',
            )}
          </p>
        </div>
        <Link to="/contact">
          {t('Contact reception')}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
