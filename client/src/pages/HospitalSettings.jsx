import { t, getLanguage } from '../i18n/locale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, useResource } from '../components/ui';
import HospitalInformation from '../components/HospitalInformation';

function SettingsForm({ initial, reload }) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial.details);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved.details);
  const unpublishedChanges =
    saved.published && JSON.stringify(saved.details) !== JSON.stringify(saved.published);
  function change(key, value) {
    setValues((old) => ({ ...old, [key]: value }));
    setMessage('');
  }
  function hour(index, key, value) {
    change(
      'hours',
      values.hours.map((h, i) =>
        i === index
          ? {
              ...h,
              [key]: value,
              ...(key === 'closed' && value ? { allDay: false } : {}),
              ...(key === 'allDay' && value ? { closed: false } : {}),
            }
          : h,
      ),
    );
  }
  async function submit(action) {
    setBusy(true);
    setError('');
    setFields({});
    setMessage('');
    try {
      const data = await api(`/admin/hospital-settings${action === 'save' ? '' : `/${action}`}`, {
        method: action === 'save' ? 'PATCH' : 'POST',
        body: { version: saved.version, ...(action === 'save' ? { details: values } : {}) },
      });
      setSaved(data);
      setValues(data.details);
      setConflict(false);
      setMessage(
        action === 'save'
          ? 'Draft saved. The public website has not changed.'
          : action === 'publish'
            ? 'Hospital details published to the public website.'
            : 'Hospital details removed from the public website. Your draft is kept.',
      );
    } catch (e) {
      setError(e.message);
      setFields(e.fields || {});
      setConflict(e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  const input = (name, label, props = {}) => (
    <Field
      key={name}
      name={name}
      label={label}
      value={values[name]}
      onChange={(e) => change(name, e.target.value)}
      error={fields[`details.${name}`]}
      {...props}
    />
  );
  return (
    <div className="hospital-settings">
      <section className="card padded">
        <div className="section-heading">
          <h2>{t('Public website details')}</h2>
          <span className="status-pill">
            {saved.published ? t('Published') : t('Demonstration page')}
          </span>
        </div>
        <p>
          {t(
            'Save a draft, review the preview, then publish the details you have approved for visitors.',
          )}{' '}
        </p>
        <Notice>{error}</Notice>
        <Notice success>{message}</Notice>
        {conflict && (
          <button className="button subtle" onClick={reload}>
            {t('Reload latest and discard my edits')}{' '}
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit('save');
          }}
        >
          <fieldset disabled={busy} className="hospital-form-fields">
            <legend className="hospital-legend">{t('Hospital details')}</legend>
            {input('name', 'Hospital name', { maxLength: 120 })}
            {input('description', 'Hospital description', {
              as: 'textarea',
              rows: 3,
              maxLength: 600,
            })}
            {input('address', 'Hospital address', { as: 'textarea', rows: 3, maxLength: 400 })}
            <div className="hospital-contact-grid">
              {input('phone', 'Reception phone', {
                type: 'tel',
                maxLength: 30,
                hint: 'Local or +94 format, for example 0112345678. Saved as +94112345678.',
              })}
              {input('email', 'Public email (optional)', { type: 'email', maxLength: 254 })}
            </div>
            <label className="delivery-choice">
              <input
                type="checkbox"
                checked={values.isDemo}
                onChange={(e) => change('isDemo', e.target.checked)}
              />
              {t('Mark this as demonstration information')}{' '}
            </label>
            <h3>{t('Reception hours')}</h3>
            <p className="muted small-text">
              {t(
                'One opening period per day or open 24 hours, in Sri Lanka time. These hours do not change doctor schedules or appointment availability.',
              )}{' '}
            </p>
            <Notice>{fields['details.hours']}</Notice>
            <button
              type="button"
              className="button subtle"
              onClick={() =>
                change(
                  'hours',
                  values.hours.map((h) => ({
                    ...h,
                    closed: false,
                    allDay: true,
                    opens: '',
                    closes: '',
                  })),
                )
              }
            >
              {t('Set all days to open 24 hours')}{' '}
            </button>
            <div className="hours-editor">
              {values.hours.map((h, i) => (
                <div className="hours-editor-row" key={h.day}>
                  <strong>{t(h.day)}</strong>
                  <label className="hours-closed">
                    <input
                      type="checkbox"
                      checked={h.closed}
                      onChange={(e) => hour(i, 'closed', e.target.checked)}
                      aria-label={`${t(h.day)} closed`}
                    />
                    {t('Closed')}{' '}
                  </label>
                  <label className="hours-closed">
                    <input
                      type="checkbox"
                      checked={h.allDay}
                      onChange={(e) => hour(i, 'allDay', e.target.checked)}
                      aria-label={`${t(h.day)} open 24 hours`}
                    />
                    {t('24 hours')}{' '}
                  </label>
                  <div className="hours-times" hidden={h.closed || h.allDay}>
                    <Field
                      name={`opens-${i}`}
                      label={`${t(h.day)} opens`}
                      type="time"
                      value={h.opens}
                      onChange={(e) => hour(i, 'opens', e.target.value)}
                      disabled={busy || h.closed || h.allDay}
                      error={fields[`details.hours.${i}.opens`]}
                    />
                    <Field
                      name={`closes-${i}`}
                      label={`${t(h.day)} closes`}
                      type="time"
                      value={h.closes}
                      onChange={(e) => hour(i, 'closes', e.target.value)}
                      disabled={busy || h.closed || h.allDay}
                      error={fields[`details.hours.${i}.closes`]}
                    />
                  </div>
                </div>
              ))}
            </div>
            {input('visitNotes', 'Visitor notes (optional)', {
              as: 'textarea',
              rows: 3,
              maxLength: 600,
              hint: 'Only include approved instructions for visitors.',
            })}
            <div className="public-actions">
              <button className="button primary" disabled={busy || conflict}>
                {t('Save draft')}{' '}
              </button>
              {dirty && <span className="muted small-text">{t('Unsaved changes')}</span>}
            </div>
          </fieldset>
        </form>
      </section>
      <section className="card padded">
        <h2>{t('Website preview')}</h2>
        <p className="muted">
          {t('This preview includes your unsaved edits. Save the draft before publishing.')}{' '}
        </p>
        <HospitalInformation hospital={values} />
        {unpublishedChanges && (
          <p className="muted">{t('Your saved draft differs from the published website.')}</p>
        )}
        <div className="public-actions settings-publish-actions">
          <button
            className="button primary"
            disabled={busy || dirty || conflict || !saved.version}
            onClick={() => submit('publish')}
          >
            {t('Publish saved details')}{' '}
          </button>
          {saved.published && (
            <button
              className="button subtle"
              disabled={busy || dirty || conflict}
              onClick={() => submit('unpublish')}
            >
              {t('Unpublish details')}{' '}
            </button>
          )}
          <Link to="/" target="_blank" rel="noreferrer">
            {t('Open public website')}{' '}
          </Link>
        </div>
        {saved.publishedAt && (
          <p className="muted small-text">
            {t('Last published:')}{' '}
            {new Intl.DateTimeFormat('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Colombo',
            }).format(new Date(saved.publishedAt))}{' '}
            {t('· Sri Lanka time')}{' '}
          </p>
        )}
      </section>
      <section className="card padded">
        <h2>{t('Sri Lankan defaults')}</h2>
        <dl className="hospital-contacts">
          <div>
            <dt>{t('Timezone')}</dt>
            <dd>{saved.regional.timezone}</dd>
          </div>
          <div>
            <dt>{t('Currency')}</dt>
            <dd>{saved.regional.currency}</dd>
          </div>
          <div>
            <dt>{t('Portal language')}</dt>
            <dd>{{ en: 'English', si: 'සිංහල', ta: 'தமிழ்' }[getLanguage()]}</dd>
          </div>
        </dl>
        <p className="muted small-text">
          {t(
            'These defaults are fixed for this version. Notification preferences are available under Email & SMS.',
          )}{' '}
        </p>
      </section>
    </div>
  );
}
export default function HospitalSettings() {
  const [revision, setRevision] = useState(0);
  const { data, pending, error } = useResource('/admin/hospital-settings', revision);
  return (
    <>
      <PageHeading
        title={t('Hospital settings')}
        description={t('Manage the information visitors see on your hospital website.')}
      />
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <SettingsForm key={revision} initial={data} reload={() => setRevision((v) => v + 1)} />
      )}
    </>
  );
}
