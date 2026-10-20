import { t } from '../i18n/locale';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Field, Loading, Notice, useResource } from './ui';
import { money } from '../scheduling';

function ChartCard({ title, points, currency = false, description, color = '#096b60' }) {
  const rows = points.map((p) => ({ ...p, value: currency ? p.value / 100 : p.value }));
  return (
    <section
      className="card padded analytics-chart"
      aria-label={title}
      style={{ '--chart-color': color }}
    >
      <h3 className="chart-title">
        <span aria-hidden="true" />
        {title}
      </h3>
      <p className="muted small-text">{description}</p>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={rows}
            accessibilityLayer
            margin={{ top: 10, right: 8, bottom: 35, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={65}
              tickFormatter={(v) => (/^\d{4}-/.test(v) ? v.slice(5) : v)}
            />
            <YAxis allowDecimals={currency} width={52} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [
                currency ? money(v * 100) : v,
                currency ? 'Net receipts' : 'Appointments',
              ]}
            />
            <Bar
              dataKey="value"
              name={currency ? 'LKR' : 'Appointments'}
              fill={color}
              maxBarSize={44}
              radius={[5, 5, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!points.some((p) => p.value !== 0) && (
        <p className="muted small-text">{t('No activity in this period.')}</p>
      )}
      <details>
        <summary>{t('View chart data')}</summary>
        <table className="chart-data">
          <thead>
            <tr>
              <th scope="col">{t('Category')}</th>
              <th scope="col">{currency ? t('LKR') : t('Appointments')}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.label}</th>
                <td>{currency ? money(p.value) : p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
export default function DashboardCharts() {
  const [window, setWindow] = useState('recent');
  const { data, error, pending } = useResource(`/dashboard/analytics?window=${window}`, 0, true);
  return (
    <section className="dashboard-analytics" aria-label={t('Dashboard charts')}>
      <div className="section-heading">
        <h2>{t('Activity at a glance')}</h2>
        <Field
          label={t('Chart period')}
          name="chartPeriod"
          as="select"
          value={window}
          onChange={(e) => setWindow(e.target.value)}
        >
          <option value="recent">{t('Last 7 days, including today')}</option>
          <option value="upcoming">{t('Today and next 6 days')}</option>
        </Field>
      </div>
      <Notice>{error}</Notice>
      {pending && <Loading text={t('Loading charts…')} />}
      {data && (
        <>
          <p className="muted small-text">
            {t(data.scope)} · {data.from} {t('to')} {data.to} · {data.timezone}
            {t('. Counts use appointment dates and include cancellations.')}{' '}
          </p>
          <div className="analytics-grid">
            <ChartCard
              title={t('Appointments by day')}
              points={data.days}
              description={t('All appointments scheduled in this period.')}
            />
            <ChartCard
              title={t('Appointment status')}
              points={data.statuses}
              color="#247e94"
              description={t('Current status of the appointments in this period.')}
            />
            {data.revenue && (
              <ChartCard
                title={t('Net receipts (LKR)')}
                points={data.revenue}
                color="#20806c"
                currency
                description={t(
                  'Payments received minus reversals, on the day each transaction occurred.',
                )}
              />
            )}
            {data.departments && (
              <ChartCard
                title={t('Department activity')}
                points={data.departments}
                color="#b8633f"
                description={t(
                  'Top 10 departments by appointment count, including cancellations. Not a capacity measure.',
                )}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
