import { t } from '../i18n/locale';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Loading, Notice, PageHeading, Pager, useResource } from '../components/ui';
import { dateLabel, timeLabel } from '../scheduling';

const labels = {
  queued: 'Queued',
  processing: 'Sending',
  simulated: 'Local preview — not sent',
  accepted: 'Accepted by provider',
  delivered: 'Delivery confirmed',
  failed: 'Failed',
  skipped: 'Skipped',
  unknown: 'Delivery uncertain — check provider',
};
function PreferencesForm({ data }) {
  const [values, setValues] = useState(data.preferences);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api('/notifications/preferences', { method: 'PATCH', body: values });
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card padded delivery-preferences" onSubmit={submit}>
      <h2>{t('Messages outside the portal')}</h2>
      <p>
        {t(
          'Email and SMS include appointment times, doctor details and billing amounts. Clinical notes and prescription instructions stay in the portal. Changes apply to future events.',
        )}{' '}
      </p>
      {['email', 'sms'].map((channel) => (
        <label key={channel} className="delivery-choice">
          <input
            type="checkbox"
            checked={values[channel]}
            onChange={(e) => {
              setValues({ ...values, [channel]: e.target.checked });
              setSaved(false);
            }}
            disabled={busy}
          />
          {channel === 'email' ? t('Email updates') : t('SMS updates')}
          <small>
            {data.modes[channel] === 'local'
              ? t('Local preview only; no message will be sent')
              : data.modes[channel] === 'off'
                ? t('Channel currently disabled')
                : t('External delivery configured')}
          </small>
        </label>
      ))}
      <Notice>{error}</Notice>
      {saved && <Notice success>{t('Notification preferences saved.')}</Notice>}
      <button className="button primary" disabled={busy}>
        {t('Save notification preferences')}{' '}
      </button>
    </form>
  );
}
export default function Delivery() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const preferences = useResource(user.role === 'patient' ? '/notifications/preferences' : null);
  const { data, error, pending } = useResource(
    `${user.role === 'admin' ? '/admin' : '/notifications'}/deliveries?page=${page}`,
    0,
    true,
  );
  return (
    <>
      <PageHeading
        title={t('Email & SMS')}
        description={
          user.role === 'patient'
            ? t('Control your messages and see delivery history.')
            : t('Monitor email and SMS delivery attempts.')
        }
      />
      <Notice>{error || preferences.error}</Notice>
      {preferences.data && <PreferencesForm data={preferences.data} />}
      {data && (
        <p className="muted delivery-mode">
          {t('Email:')} {data.modes.email} {t('· SMS:')} {data.modes.sms}
          {t(
            '. Local previews are stored here and never sent externally. Provider acceptance does not confirm delivery.',
          )}{' '}
        </p>
      )}
      {pending && <Loading />}
      {data && (
        <section className="card padded">
          <h2>{t('Delivery history')}</h2>
          {!data.records.length && (
            <p>
              {t(
                'No delivery attempts yet. Opted-in patients will see messages after a new appointment or care update.',
              )}{' '}
            </p>
          )}
          {data.records.map((job) => (
            <article className="delivery-row" key={job.id}>
              <div>
                <strong>
                  {job.channel.toUpperCase()} · {job.destination}
                </strong>
                {job.emailSubject && <p>{job.emailSubject}</p>}
                <p>{t(labels[job.status])}</p>
                <small>
                  {dateLabel(job.createdAt)} · {timeLabel(job.createdAt)} {t('· Attempts:')}{' '}
                  {job.attempts}
                </small>
                {job.lastError && (
                  <p className="muted small-text">{job.lastError.replaceAll('_', ' ')}</p>
                )}
                {job.preview && (
                  <details>
                    <summary>{t('View local message preview')}</summary>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{job.preview}</p>
                  </details>
                )}
              </div>
              <span className="status-pill">{job.transport}</span>
            </article>
          ))}
          <Pager {...data} onChange={setPage} />
        </section>
      )}
    </>
  );
}
