import { useState } from 'react';
import { Field, Loading, Notice, PageHeading, Pager, useResource } from '../components/ui';
import { today, dateLabel, timeLabel, money } from '../scheduling';

function formatted(value, format) {
  if (value === null || value === undefined) return '—';
  if (format === 'money') return money(value);
  if (format === 'datetime') return `${dateLabel(value)} · ${timeLabel(value)}`;
  if (format === 'decimal') return Number(value).toFixed(2);
  if (format === 'number') return Number(value).toLocaleString('en-LK');
  return String(value);
}
export default function Reports() {
  const initial = { type: 'appointments', from: today(), to: today() };
  const [draft, setDraft] = useState(initial),
    [applied, setApplied] = useState(initial);
  const [page, setPage] = useState(1),
    [revision, refresh] = useState(0),
    [validation, setValidation] = useState('');
  const catalogue = useResource('/admin/reports', revision);
  const query = new URLSearchParams({ from: applied.from, to: applied.to, page });
  const { data, error, pending } = useResource(`/admin/reports/${applied.type}?${query}`, revision);
  const selected = catalogue.data?.reports.find((r) => r.id === draft.type);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  function update(key, value) {
    setValidation('');
    setDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (next.type === 'appointments') next.to = next.from;
      return next;
    });
  }
  function generate(event) {
    event.preventDefault();
    if (draft.from > draft.to || (new Date(draft.to) - new Date(draft.from)) / 86400000 >= 366) {
      setValidation(
        'Choose an end date on or after the start, within a range of at most 366 days.',
      );
      return;
    }
    setValidation('');
    setApplied({ ...draft });
    setPage(1);
    refresh((v) => v + 1);
  }
  return (
    <>
      <PageHeading
        eyebrow="HOSPITAL OPERATIONS"
        title="Reports & analytics"
        description="Generate operational summaries from saved records. Date ranges include both dates and use Sri Lanka time."
      />
      <Notice>{catalogue.error}</Notice>
      <form className="card padded report-filters" onSubmit={generate}>
        <Field
          label="Report type"
          name="reportType"
          as="select"
          value={draft.type}
          onChange={(e) => update('type', e.target.value)}
        >
          {!catalogue.data && <option value="appointments">Daily appointments</option>}
          {catalogue.data?.reports.map((report) => (
            <option key={report.id} value={report.id}>
              {report.title}
            </option>
          ))}
        </Field>
        <Field
          label={draft.type === 'appointments' ? 'Appointment date' : 'From date'}
          name="reportFrom"
          type="date"
          required
          min="1900-01-01"
          max="2199-12-31"
          value={draft.from}
          onChange={(e) => update('from', e.target.value)}
        />
        {draft.type !== 'appointments' && (
          <Field
            label="To date"
            name="reportTo"
            type="date"
            required
            min={draft.from || '1900-01-01'}
            max="2199-12-31"
            value={draft.to}
            onChange={(e) => update('to', e.target.value)}
          />
        )}
        <button className="button primary" type="submit" disabled={pending}>
          Generate report
        </button>
      </form>
      {selected && dirty && <p className="muted report-help">{selected.basis}</p>}
      <Notice>{validation || error}</Notice>
      {dirty && (
        <p role="status" className="report-draft-note">
          Filters changed. Select Generate report to update the results below.
        </p>
      )}
      {pending && <Loading text="Generating report…" />}
      {data && (
        <section className="report-results" aria-label="Generated report">
          <div className="section-heading">
            <div>
              <h2>{data.report.title}</h2>
              <p className="muted">
                {data.period.from} to {data.period.to} · {data.period.timezone}
              </p>
            </div>
            <small className="muted">
              Generated {dateLabel(data.period.generatedAt)} · {timeLabel(data.period.generatedAt)}
            </small>
          </div>
          <p className="report-basis">{data.report.basis}</p>
          <div className="report-metrics">
            {data.summary.map((metric) => (
              <div className="card padded" key={metric.key}>
                <p>{metric.label}</p>
                <strong>{formatted(metric.value, metric.format)}</strong>
              </div>
            ))}
          </div>
          <p className="muted small-text">
            Summary totals cover the entire selected period, including rows on other pages.
            Re-generating or changing pages reads current records.
          </p>
          {data.records.length > 0 && (
            <p className="report-scroll-hint">Scroll sideways to see all columns.</p>
          )}
          {data.records.length ? (
            <div
              className="card report-table-wrap"
              role="region"
              aria-label={`${data.report.title} results`}
              tabIndex={0}
            >
              <table className="report-table">
                <thead>
                  <tr>
                    {data.columns.map((column) => (
                      <th key={column.key} scope="col">
                        {column.label}
                        {column.format === 'money' ? ' (LKR)' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record, index) => (
                    <tr key={index}>
                      {data.columns.map((column) => (
                        <td key={column.key}>{formatted(record[column.key], column.format)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <section className="card padded">
              <h3>No records in this period</h3>
              <p>Choose another date or report to view saved activity.</p>
            </section>
          )}
          <Pager {...data} onChange={setPage} />
        </section>
      )}
    </>
  );
}
