import { useState } from 'react';
import { Field, Loading, Notice, PageHeading, Pager, useResource } from '../components/ui';
import { today, dateAfter } from '../scheduling';
const utc = (value) => new Date(value).toISOString().replace('T', ' ').replace('Z', ' UTC');
export default function AuditLog() {
  const initial = { from: dateAfter(-6), to: today(), user: '', action: '', module: '', q: '' };
  const [draft, setDraft] = useState(initial),
    [applied, setApplied] = useState(initial);
  const [page, setPage] = useState(1),
    [revision, refresh] = useState(0),
    [validation, setValidation] = useState('');
  const options = useResource('/admin/audit/options', revision);
  const query = new URLSearchParams({ ...applied, page });
  const { data, error, pending } = useResource(`/admin/audit?${query}`, revision);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  function change(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setValidation('');
  }
  function apply(event) {
    event.preventDefault();
    if (draft.from > draft.to || (new Date(draft.to) - new Date(draft.from)) / 86400000 >= 366) {
      setValidation(
        'Choose an end date on or after the start, within a range of at most 366 days.',
      );
      return;
    }
    setApplied({ ...draft });
    setPage(1);
    setValidation('');
    refresh((v) => v + 1);
  }
  return (
    <>
      <PageHeading
        eyebrow="ACCOUNTABILITY"
        title="Audit log"
        description="Read-only history of recorded actions. Filter dates use Sri Lanka time; each event timestamp is shown in UTC."
      />
      <Notice>{options.error}</Notice>
      <form className="card padded audit-filters" onSubmit={apply}>
        <Field
          label="From date"
          name="auditFrom"
          type="date"
          required
          min="1900-01-01"
          max="2199-12-31"
          value={draft.from}
          onChange={(e) => change('from', e.target.value)}
        />
        <Field
          label="To date"
          name="auditTo"
          type="date"
          required
          min={draft.from || '1900-01-01'}
          max="2199-12-31"
          value={draft.to}
          onChange={(e) => change('to', e.target.value)}
        />
        <Field
          label="User name or user ID"
          name="auditUser"
          value={draft.user}
          maxLength={100}
          onChange={(e) => change('user', e.target.value)}
          hint="Search a current name or enter an exact user ID"
        />
        <Field
          label="Action"
          name="auditAction"
          as="select"
          value={draft.action}
          onChange={(e) => change('action', e.target.value)}
        >
          <option value="">All actions</option>
          {options.data?.actions.map((action) => (
            <option key={action} value={action}>
              {action.replaceAll('_', ' ')}
            </option>
          ))}
        </Field>
        <Field
          label="Module"
          name="auditModule"
          as="select"
          value={draft.module}
          onChange={(e) => change('module', e.target.value)}
        >
          <option value="">All modules</option>
          {options.data?.modules.map((module) => (
            <option key={module} value={module}>
              {module}
            </option>
          ))}
        </Field>
        <Field
          label="Search action, module or target"
          name="auditSearch"
          value={draft.q}
          maxLength={100}
          onChange={(e) => change('q', e.target.value)}
        />
        <div className="clinical-actions">
          <button className="button primary" type="submit" disabled={pending}>
            Apply filters
          </button>
          <button
            className="button subtle"
            type="button"
            disabled={pending}
            onClick={() => {
              setDraft(initial);
              setApplied(initial);
              setPage(1);
              setValidation('');
              refresh((v) => v + 1);
            }}
          >
            Reset filters
          </button>
        </div>
      </form>
      <Notice>{validation || error}</Notice>
      {dirty && (
        <p role="status" className="report-draft-note">
          Filters changed. Select Apply filters to update the results below.
        </p>
      )}
      {pending && <Loading text="Loading audit events…" />}
      {data && (
        <>
          <p className="muted">
            {data.total} {data.total === 1 ? 'event' : 'events'} · {data.period.from} to{' '}
            {data.period.to} · {data.period.timezone}
          </p>
          {data.records.length > 0 && (
            <p className="report-scroll-hint">Scroll sideways to see all columns.</p>
          )}
          {data.records.length ? (
            <div
              className="card report-table-wrap"
              role="region"
              aria-label="Audit events"
              tabIndex={0}
            >
              <table className="report-table audit-table">
                <thead>
                  <tr>
                    <th scope="col">Timestamp (UTC)</th>
                    <th scope="col">User</th>
                    <th scope="col">Action</th>
                    <th scope="col">Module</th>
                    <th scope="col">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <time dateTime={record.createdAt}>{utc(record.createdAt)}</time>
                      </td>
                      <td>
                        <strong>{record.actorName}</strong>
                        <small>{record.actorRole || 'No linked account'}</small>
                        <code>{record.actorId || '—'}</code>
                      </td>
                      <td>{record.action}</td>
                      <td>{record.module}</td>
                      <td>
                        <code>{record.target || '—'}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <section className="card padded">
              <h2>No audit events found</h2>
              <p>Try another date range or reset the filters.</p>
            </section>
          )}
          <Pager {...data} onChange={setPage} />
        </>
      )}
      <p className="muted small-text">
        Events cannot be edited or deleted here. User names and roles reflect current profiles.
        “Unlinked actor” means the event has no available account, such as an unsuccessful sign-in.
        Audit records contain action metadata, not clinical notes.
      </p>
    </>
  );
}
