import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Clock3,
  HeartPulse,
  ClipboardList,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import { t, getLocale } from '../i18n/locale';
import { UserAvatar } from '../components/UserAvatar';
import { Loading, Notice, useResource } from '../components/ui';
import { today, dateLabel, timeLabel, statusClass } from '../scheduling';

const DashboardCharts = lazy(() => import('../components/DashboardCharts'));
const dayKey = (year, month, day) =>
  new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

function AppointmentCalendar() {
  const currentDay = today();
  const [selected, setSelected] = useState(currentDay);
  const [month, setMonth] = useState(currentDay.slice(0, 7));
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Math.ceil((offset + days) / 7) * 7;
  const { data, error, pending } = useResource(
    `/appointments?date=${selected}&view=all&limit=5&page=1`,
    0,
    true,
  );
  const monthTitle = new Intl.DateTimeFormat(getLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(first);
  function moveMonth(delta) {
    const next = dayKey(year, monthNumber - 1 + delta, 1);
    setMonth(next.slice(0, 7));
    setSelected(next);
  }
  return (
    <section className="card patient-calendar" aria-label={t('Your appointment calendar')}>
      <div className="patient-calendar-heading">
        <button
          className="icon-button"
          type="button"
          aria-label={t('Previous month')}
          onClick={() => moveMonth(-1)}
        >
          <ArrowLeft size={18} />
        </button>
        <h2 aria-live="polite">{monthTitle}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label={t('Next month')}
          onClick={() => moveMonth(1)}
        >
          <ArrowRight size={18} />
        </button>
      </div>
      <div className="patient-calendar-week" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>
            {new Intl.DateTimeFormat(getLocale(), { weekday: 'narrow', timeZone: 'UTC' }).format(
              new Date(Date.UTC(2026, 0, 5 + i)),
            )}
          </span>
        ))}
      </div>
      <div className="patient-calendar-days" role="group" aria-label={monthTitle}>
        {Array.from({ length: cells }, (_, i) => {
          const number = i - offset + 1;
          if (number < 1 || number > days) return <span key={i} />;
          const key = dayKey(year, monthNumber - 1, number);
          return (
            <button
              key={key}
              type="button"
              aria-label={dateLabel(key)}
              aria-pressed={selected === key}
              aria-current={key === currentDay ? 'date' : undefined}
              onClick={() => setSelected(key)}
            >
              {number}
            </button>
          );
        })}
      </div>
      <div className="patient-calendar-toolbar">
        <span>{t('Sri Lanka time')}</span>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setMonth(currentDay.slice(0, 7));
            setSelected(currentDay);
          }}
        >
          {t('Today')}
        </button>
      </div>
      <div className="patient-schedule-heading">
        <h3>{t('Your appointments')}</h3>
        <p>{dateLabel(selected)}</p>
      </div>
      <div aria-live="polite" aria-busy={pending}>
        {pending && <Loading text="Loading appointment overview…" />}
        <Notice>{error}</Notice>
        {!pending &&
          data &&
          (data.items.length ? (
            data.items.map((item) => (
              <Link
                className="patient-schedule-row"
                key={item.id}
                to={`/appointments?selected=${item.id}`}
              >
                <span className="patient-schedule-time">{timeLabel(item.startsAt)}</span>
                <span>
                  <strong>{item.doctorName}</strong>
                  <small>{item.departmentName}</small>
                  <span className={`status-pill ${statusClass(item.status)}`}>
                    {t(item.status)}
                  </span>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            ))
          ) : (
            <div className="patient-calendar-empty">
              <CalendarDays size={28} aria-hidden="true" />
              <p>{t('No appointments on this day.')}</p>
              <Link className="text-link" to="/book">
                {t('Book an appointment')} <ArrowUpRight size={15} />
              </Link>
            </div>
          ))}
      </div>
      <Link className="patient-view-all" to="/appointments">
        {t('View all appointments')}
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}

export default function PatientDashboard({ user, profile, date }) {
  const { data: summary, pending, error } = useResource('/appointments-summary', 0, true);
  const bills = useResource('/billing/bills?limit=1&page=1', 0, true);
  const next = summary?.next?.[0];
  return (
    <div className="patient-overview">
      <header className="patient-overview-heading">
        <div>
          <p className="eyebrow">{t('PATIENT WORKSPACE')}</p>
          <h1>{t('Welcome, {name}.', { name: user.name.split(' ')[0] })}</h1>
          <p>{t('Your care, all in one place.')}</p>
        </div>
        <div className="patient-heading-actions">
          <span>
            <CalendarDays size={16} aria-hidden="true" />
            {date}
          </span>
          <Link to="/book" className="button primary">
            <CalendarPlus size={17} />
            {t('Book an appointment')}
          </Link>
        </div>
      </header>
      <Notice>{error}</Notice>
      <Notice>{bills.error}</Notice>
      <div className="patient-overview-grid">
        <div className="patient-overview-main">
          <div className="patient-metrics" aria-label={t('Appointment overview')}>
            {[
              { label: 'Appointments today', value: summary?.today, icon: CalendarDays },
              { label: 'Waiting today', value: summary?.waiting, icon: Clock3 },
              { label: 'Upcoming bookings', value: summary?.upcoming, icon: CalendarPlus },
              { label: 'Invoices', value: bills.data?.total, icon: ReceiptText, to: '/billing' },
            ].map(({ label, value, icon: Icon, to }) => (
              <Link className="card patient-metric" to={to || '/appointments'} key={label}>
                <span className="patient-metric-label">{t(label)}</span>
                <span className="patient-metric-icon">
                  <Icon size={32} aria-hidden="true" />
                </span>
                <strong aria-busy={to ? bills.pending : pending}>{value ?? '—'}</strong>
              </Link>
            ))}
          </div>

          <div className="patient-feature-grid">
            <section className="card patient-next">
              <div className="patient-card-title">
                <h2>{t('Coming up next')}</h2>
                <CalendarDays size={20} aria-hidden="true" />
              </div>
              {pending ? (
                <Loading text="Loading appointment overview…" />
              ) : error ? (
                <Notice>{error}</Notice>
              ) : next ? (
                <>
                  <div className="patient-next-date">
                    <strong>{dateLabel(next.startsAt)}</strong>
                    <span>{timeLabel(next.startsAt)}</span>
                  </div>
                  <h3>{next.doctorName}</h3>
                  <p>{next.departmentName}</p>
                  <span className={`status-pill ${statusClass(next.status)}`}>
                    {t(next.status)}
                  </span>
                  <Link className="patient-view-all" to={`/appointments?selected=${next.id}`}>
                    {t('View appointment')}
                    <ArrowUpRight size={17} />
                  </Link>
                </>
              ) : (
                <>
                  <CalendarDays className="patient-empty-icon" size={36} aria-hidden="true" />
                  <p>{t('No upcoming appointments. Confirmed bookings will appear here.')}</p>
                  <Link className="text-link" to="/book">
                    {t('Book an appointment')}
                    <ArrowUpRight size={17} />
                  </Link>
                </>
              )}
            </section>
            <section className="card patient-guide-feature">
              <HeartPulse size={32} aria-hidden="true" />
              <h2>{t('Need help choosing a department?')}</h2>
              <p>
                {t(
                  'The department guide can suggest a service for non-emergency concerns. It is not a diagnosis.',
                )}
              </p>
              <Link className="button" to="/recommendations">
                {t('Open department guide')}
                <ArrowUpRight size={17} />
              </Link>
            </section>
          </div>
          <div className="workspace-quick-actions">
            {[
              { to: '/recommendations', label: 'Department guide', icon: HeartPulse },
              { to: '/records', label: 'Medical records', icon: ClipboardList },
              { to: '/billing', label: 'Bills & payments', icon: ReceiptText },
            ].map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to}>
                <span className="quick-action-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <strong>{t(label)}</strong>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <Suspense fallback={<Loading text="Loading charts…" />}>
            <DashboardCharts />
          </Suspense>
        </div>
        <AppointmentCalendar />
      </div>
      <section className="card patient-profile-summary">
        <div className="patient-profile-title">
          <UserAvatar user={user} className="account-avatar" />
          <div>
            <h2>{t('Your health profile')}</h2>
            <p>{user.name}</p>
          </div>
          <Link className="text-link" to="/profile">
            {t('Review my profile')}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <dl>
          <div>
            <dt>{t('Date of birth')}</dt>
            <dd>{profile.dateOfBirth ? dateLabel(profile.dateOfBirth) : t('Not provided')}</dd>
          </div>
          <div>
            <dt>{t('Phone')}</dt>
            <dd>{user.phone || t('Not provided')}</dd>
          </div>
          <div>
            <dt>{t('Emergency contact')}</dt>
            <dd>{profile.emergencyContact?.name || t('Not provided')}</dd>
          </div>
        </dl>
        <div className="patient-allergy">
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>{t('Allergy information')}</strong>
            <p>
              {profile.allergies.length
                ? profile.allergies.join(', ')
                : t('No allergy information recorded. Confirm with your care team.')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
