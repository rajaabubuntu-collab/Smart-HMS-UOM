import { t } from '../i18n/locale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Field, Notice, PageHeading, Submit } from '../components/ui';
import { money } from '../scheduling';

const warning =
  'This guide suggests a department only. It is not a diagnosis or an urgency assessment, and cannot rule out an emergency. It does not suggest medicines or treatment.';
function EmergencyHelp() {
  return (
    <div className="guide-emergency" role="alert">
      <h2>{t('Possible emergency? Get help now.')}</h2>
      <p>
        {t('Do not wait for a routine appointment. In Sri Lanka, call')} <a href="tel:1990">1990</a>{' '}
        {t('for an emergency ambulance. Elsewhere, call your local emergency number.')}{' '}
      </p>
      <a href="https://www.1990.lk/faq/" target="_blank" rel="noreferrer">
        {t('About the Suwa Seriya emergency service')}{' '}
      </a>
    </div>
  );
}
export default function Recommendations() {
  const [form, setForm] = useState({
    symptoms: '',
    durationValue: '',
    durationUnit: 'days',
    painLevel: '',
    comments: '',
    emergencySigns: '',
    acknowledged: false,
  });
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
    setError(null);
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api('/recommendations', {
          method: 'POST',
          body: {
            symptoms: form.symptoms,
            duration: { value: Number(form.durationValue), unit: form.durationUnit },
            ...(form.painLevel ? { painLevel: Number(form.painLevel) } : {}),
            comments: form.comments,
            emergencySigns: form.emergencySigns,
            acknowledged: form.acknowledged,
          },
        }),
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t('FIND THE RIGHT SERVICE')}
        title={t('Department guide')}
        description={t(
          'Describe your symptoms to find a possible hospital department. For adults with non-emergency concerns; English descriptions are supported.',
        )}
      />
      <div className="card padded guide-intro">
        <h2>{t('Before you start')}</h2>
        <p>{warning}</p>
        <p>
          {t(
            'If symptoms are severe, sudden or worsening, seek medical help rather than waiting for an appointment. This limited project guide has not been clinically validated.',
          )}{' '}
        </p>
        <p className="muted">
          {t(
            'Your description is processed for this request and is not saved to your medical record or copied into an appointment. You can discuss it with the clinician.',
          )}{' '}
        </p>
      </div>
      <div className="guide-grid">
        <section className="card padded">
          <form onSubmit={submit}>
            <Notice>{error?.message}</Notice>
            <fieldset className="clinical-fieldset" disabled={busy}>
              <h2>{t('Describe your concern')}</h2>
              <Field
                name="emergencySigns"
                label={t('Do any warning signs apply now?')}
                required
                as="select"
                value={form.emergencySigns}
                onChange={(e) => change('emergencySigns', e.target.value)}
                hint={t(
                  'Examples: chest pain, severe breathing difficulty, new face drooping or speech difficulty, unconsciousness, uncontrolled bleeding, or a severe allergic reaction. This list is not exhaustive.',
                )}
                error={error?.fields?.emergencySigns}
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
                  )}{' '}
                </Notice>
              )}
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
                hint={t(
                  'Use your own description. This guide can miss or misunderstand symptoms; it cannot assess safety.',
                )}
              />
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
              <Field
                name="painLevel"
                label={t('Pain level (optional)')}
                as="select"
                value={form.painLevel}
                onChange={(e) => change('painLevel', e.target.value)}
                hint={t(
                  '1 = lowest, 10 = highest. Leave blank if there is no pain or you prefer not to say.',
                )}
                error={error?.fields?.painLevel}
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
                rows={3}
                maxLength={1000}
                value={form.comments}
                onChange={(e) => change('comments', e.target.value)}
                error={error?.fields?.comments}
              />
              <label className="clinical-check">
                <input
                  type="checkbox"
                  required
                  checked={form.acknowledged}
                  onChange={(e) => change('acknowledged', e.target.checked)}
                />{' '}
                {t(
                  'I understand this is a department guide, not a diagnosis or emergency service.',
                )}{' '}
              </label>
              <Submit busy={busy} disabled={!form.acknowledged}>
                {t('Get department guidance')}{' '}
              </Submit>
            </fieldset>
          </form>
        </section>
        <section className="guide-results" aria-live="polite" aria-busy={busy}>
          {!result && (
            <div className="card padded">
              <h2>{busy ? t('Checking the guide…') : t('Your guidance will appear here')}</h2>
              <p>
                {t(
                  'Suggestions explain which symptom words matched. They do not show a probability of having a condition or guarantee that routine booking is appropriate.',
                )}{' '}
              </p>
              <p>
                {t(
                  'If no clear match is available, contact your hospital reception using its usual contact details.',
                )}{' '}
              </p>
            </div>
          )}
          {result && (
            <>
              <div className="card padded">
                <h2>
                  {result.outcome === 'matched'
                    ? t('A possible department')
                    : result.outcome === 'urgent'
                      ? t('Routine booking suggestions stopped')
                      : result.outcome === 'review'
                        ? t('Speak to a health professional')
                        : t('Contact hospital reception')}
                </h2>
                <p>{result.explanation}</p>
                <p className="muted">{result.disclaimer}</p>
                {['staff', 'unavailable'].includes(result.outcome) && (
                  <p>
                    {t(
                      'Contact your hospital reception using its usual contact details or visit the reception desk. No appointment has been created.',
                    )}{' '}
                  </p>
                )}
              </div>
              {['urgent', 'review'].includes(result.outcome) && <EmergencyHelp />}
              {result.suggestions.map((s) => (
                <article className="card padded guide-suggestion" key={s.department.id}>
                  <h2>{s.department.name}</h2>
                  <p>{s.explanation}</p>
                  <p>
                    <strong>{t('Matched words:')}</strong> {s.matchedTerms.join(', ')}
                  </p>
                  <p className="muted">
                    {t(
                      'Doctors are listed from this department, without a clinical ranking. Select a doctor to check available dates and times.',
                    )}{' '}
                  </p>
                  {!s.doctors.length && (
                    <Notice>
                      {t(
                        'No active doctors are listed in this department. Contact reception for help arranging care.',
                      )}{' '}
                    </Notice>
                  )}
                  {s.doctors.map((d) => (
                    <div className="guide-doctor" key={d.id}>
                      <h3>{d.name}</h3>
                      <p>
                        {d.specialization} · {money(d.consultationFeeMinor)}
                      </p>
                      <Link className="button primary" to={`/book?doctor=${d.id}`}>
                        {t('View times with')} {d.name}
                      </Link>
                    </div>
                  ))}
                  {s.doctorCount > s.doctors.length && (
                    <Link className="button subtle" to={`/book?department=${s.department.id}`}>
                      {t('Browse all')} {s.doctorCount} {t('doctors in this department')}{' '}
                    </Link>
                  )}
                </article>
              ))}
            </>
          )}
        </section>
      </div>
    </>
  );
}
