import { t } from '../i18n/locale';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loading, Notice, useResource } from '../components/ui';
import { dateLabel, timeLabel, money } from '../scheduling';
const formatted = (value, format) =>
  value == null
    ? '—'
    : format === 'money'
      ? money(value)
      : format === 'datetime'
        ? `${dateLabel(value)} ${timeLabel(value)}`
        : String(value);
export default function ReportPrint() {
  const { type } = useParams();
  const [query] = useSearchParams();
  const { data, pending, error } = useResource(
    `/admin/reports/${encodeURIComponent(type)}/export?${new URLSearchParams({ from: query.get('from') || '', to: query.get('to') || '', format: 'json' })}`,
  );
  return (
    <main className="print-report">
      <div className="print-controls">
        <button className="button primary" disabled={!data} onClick={() => window.print()}>
          {t('Print / save PDF')}
        </button>
        <p>
          {t(
            'Choose “Save as PDF” in the print dialog. This export includes all rows in the selected period, up to 5,000.',
          )}
        </p>
      </div>
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <>
          <h1>
            {t('Smart HMS ·')} {t(data.report.title)}
          </h1>
          <p>
            {data.period.from} {t('to')} {data.period.to} · {data.period.timezone}
          </p>
          <p>
            {t('Generated:')} {dateLabel(data.period.generatedAt)}{' '}
            {timeLabel(data.period.generatedAt)}
          </p>
          <p>{t(data.report.basis)}</p>
          <dl>
            {data.summary.map((metric) => (
              <div key={metric.key}>
                <dt>{t(metric.label)}</dt>
                <dd>{formatted(metric.value, metric.format)}</dd>
              </div>
            ))}
          </dl>
          <p>
            {data.total} {t('records')}
          </p>
          <table>
            <thead>
              <tr>
                {data.columns.map((c) => (
                  <th key={c.key}>
                    {t(c.label)}
                    {c.format === 'money' ? t(' (LKR)') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.records.map((record, index) => (
                <tr key={index}>
                  {data.columns.map((c) => (
                    <td key={c.key}>{formatted(record[c.key], c.format)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
