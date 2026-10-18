import { useState } from 'react';
import { Field, Loading, Notice, PageHeading, Pager, useResource } from '../components/ui';
import { api } from '../api';
import { dateLabel, timeLabel } from '../scheduling';
import { t } from '../i18n/locale';
const labels = { new: 'New', in_progress: 'In progress', resolved: 'Resolved' };
export default function Enquiries() {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [revision, refresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const resource = useResource(
    `/enquiries?${new URLSearchParams({ page, ...(status ? { status } : {}) })}`,
    revision,
  );
  async function update(event, record) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/enquiries/${record._id}`, {
        method: 'PATCH',
        body: {
          status: new FormData(event.currentTarget).get('status'),
          expectedStatus: record.status,
        },
      });
      refresh((v) => v + 1);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title={t('Website enquiries')}
        description={t(
          'General enquiries from the public website. Follow up using the supplied contact details, then update the status.',
        )}
      >
        <button className="button subtle" onClick={() => refresh((v) => v + 1)}>
          {t('Refresh')}
        </button>
      </PageHeading>
      <Field
        label={t('Enquiry status')}
        name="enquiry-filter"
        as="select"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
      >
        <option value="">{t('All enquiries')}</option>
        {Object.entries(labels).map(([key, label]) => (
          <option value={key} key={key}>
            {t(label)}
          </option>
        ))}
      </Field>
      <Notice>{error || resource.error}</Notice>
      {resource.pending && <Loading />}
      {resource.data && (
        <>
          {!resource.data.items.length && <p>{t('No enquiries in this view.')}</p>}
          <div className="hospital-inbox">
            {resource.data.items.map((record) => (
              <article className="card padded" key={`${record._id}:${record.status}`}>
                <div className="section-heading">
                  <h2>{record.reference}</h2>
                  <span className="status-pill">{t(labels[record.status])}</span>
                </div>
                <p>
                  <strong>{record.name}</strong> ·{' '}
                  {t(
                    {
                      appointments: 'Appointments',
                      services: 'Services',
                      visiting: 'Visiting information',
                      billing: 'Billing',
                      other: 'Other',
                    }[record.subject],
                  )}
                </p>
                <p>
                  {record.email}
                  {record.phone ? ` · ${record.phone}` : ''}
                </p>
                <p className="hospital-multiline">{record.message}</p>
                <p className="small-text muted">
                  {dateLabel(record.createdAt)} · {timeLabel(record.createdAt)}
                </p>
                <form className="hospital-inbox-actions" onSubmit={(e) => update(e, record)}>
                  <Field
                    label={t('Update enquiry status')}
                    name="status"
                    as="select"
                    id={`enquiry-${record._id}`}
                    defaultValue={record.status}
                    disabled={busy}
                  >
                    {Object.entries(labels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {t(label)}
                      </option>
                    ))}
                  </Field>
                  <button className="button primary" disabled={busy}>
                    {t('Save status')}
                  </button>
                </form>
              </article>
            ))}
          </div>
          <Pager {...resource.data} onChange={setPage} />
        </>
      )}
    </>
  );
}
