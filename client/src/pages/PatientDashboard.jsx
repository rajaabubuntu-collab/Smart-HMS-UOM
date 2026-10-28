import { openPatientAssistant } from '../patient-assistant-events';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  UserRound,
  ShieldCheck,
  ClipboardList,
  CalendarDays,
  HeartPulse,
  Clock3,
  CalendarCheck2,
  ReceiptText,
} from 'lucide-react';
import { t } from '../i18n/locale';
import { UserAvatar } from '../components/UserAvatar';
import { Loading, Notice, PageHeading, useResource } from '../components/ui';
import { dateLabel, timeLabel, statusClass } from '../scheduling';
const DashboardCharts = lazy(() => import('../components/DashboardCharts'));

export default function PatientDashboard({ user, profile, date }) {
  const headline = 'Your care, all in one place.';
  const description = 'Keep your details up to date for a smoother hospital experience.';
  return (
    <div className="patient-dashboard staff-dashboard">
      <PageHeading
        eyebrow={t('YOUR WORKSPACE')}
        title={t('Welcome, {name}.', { name: user.name.split(' ')[0] })}
        description={t('A fresh start for a more connected day.')}
      >
        <span className="date-pill">
          <CalendarDays size={16} />
          {date}
        </span>
      </PageHeading>
      <section className="welcome-banner staff-welcome">
        <div>
          <span className="banner-label">
            <span /> {t('CARE, CONNECTED')}{' '}
          </span>
          <h2>{t(headline)}</h2>
          <p>{t(description)}</p>
        </div>
        <Link className="button staff-primary-action" to="/book">
          {t('Book an appointment')} <ArrowUpRight size={17} />
        </Link>
        <HeartPulse className="staff-welcome-art" size={180} strokeWidth={1} aria-hidden="true" />
      </section>
      {user.role === 'patient' && (
        <div className="workspace-quick-actions">
          {[
            { to: '/recommendations', label: 'Department guide', icon: HeartPulse },
            { to: '/records', label: 'Medical records', icon: ClipboardList },
            { to: '/billing', label: 'Bills & payments', icon: ReceiptText },
          ].map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to}>
              <span className="quick-action-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <strong>{t(label)}</strong>
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
      <AppointmentOverview />
      <Suspense fallback={<Loading text="Loading charts…" />}>
        <DashboardCharts />
      </Suspense>
      {user.role === 'patient' && (
        <section className="card padded assistant-dashboard-shortcut">
          <div>
            <h2>{t('Your care assistant')}</h2>
            <p>{t('Find an appointment, check a bill or get help choosing a department.')}</p>
          </div>
          <button
            className="button primary"
            type="button"
            onClick={() => openPatientAssistant('guide')}
          >
            {t('Open care assistant')}
          </button>
        </section>
      )}
      {user.role === 'patient' && (
        <div className="dashboard-grid">
          <section className="card padded">
            <div className="section-heading">
              <h2>{t('Your health profile')}</h2>
              <UserRound size={21} />
            </div>
            <p className="muted">{t('Accurate contact details help your care team reach you.')}</p>
            <dl className="detail-list">
              <div>
                <dt>{t('Date of birth')}</dt>
                <dd>{profile.dateOfBirth}</dd>
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
            <div className="allergy-note">
              <ShieldCheck size={20} />
              <div>
                <strong>{t('Allergy information')}</strong>
                <p>
                  {profile.allergies.length
                    ? profile.allergies.join(', ')
                    : t('No allergy information recorded. Confirm with your care team.')}
                </p>
              </div>
            </div>
            <Link className="text-link" to="/profile">
              {t('Review my profile')} <ArrowUpRight size={16} />
            </Link>
          </section>
          <AccountCard user={user} />
        </div>
      )}
    </div>
  );
}
function AccountCard({ user }) {
  return (
    <section className="card padded account-card">
      <div className="section-heading">
        <h2>{t('Your account')}</h2>
        <ShieldCheck size={21} />
      </div>
      <UserAvatar user={user} className="account-avatar" />
      <h3>{user.name}</h3>
      <p className="muted email-wrap">{user.email}</p>
      <span className="role-badge">{user.role === 'admin' ? t('Administrator') : user.role}</span>
      <div className="account-status">
        <span className="status-dot" /> {t('Account active')}{' '}
      </div>
      <p className="small-text muted">{t('Only authorised users can access this workspace.')}</p>
    </section>
  );
}

function AppointmentOverview() {
  const { data, pending, error } = useResource('/appointments-summary', 0, true);
  if (pending) return <Loading text={t('Loading appointment overview…')} />;
  if (error) return <Notice>{error}</Notice>;
  return (
    <section className="appointment-overview">
      <div className="appointment-stats">
        <Link to="/appointments">
          <span className="stat-symbol" aria-hidden="true">
            <CalendarDays size={18} />
          </span>
          <ArrowUpRight className="stat-arrow" size={18} aria-hidden="true" />
          <strong>{data.today}</strong>
          <span>{t('Appointments today')}</span>
        </Link>
        <Link to="/appointments">
          <span className="stat-symbol" aria-hidden="true">
            <Clock3 size={18} />
          </span>
          <ArrowUpRight className="stat-arrow" size={18} aria-hidden="true" />
          <strong>{data.waiting}</strong>
          <span>{t('Waiting today')}</span>
        </Link>
        <Link to="/appointments">
          <span className="stat-symbol" aria-hidden="true">
            <CalendarCheck2 size={18} />
          </span>
          <ArrowUpRight className="stat-arrow" size={18} aria-hidden="true" />
          <strong>{data.upcoming}</strong>
          <span>{t('Upcoming bookings')}</span>
        </Link>
      </div>
      <div className="card padded">
        <div className="section-heading">
          <h2>{t('Coming up next')}</h2>
          <Link className="text-link" to="/appointments">
            {t('View all')} <ArrowUpRight size={15} />
          </Link>
        </div>
        {data.next.length ? (
          data.next.map((item) => (
            <Link key={item.id} to={`/appointments?selected=${item.id}`} className="upcoming-row">
              <div>
                <strong>{item.doctorName}</strong>
                <small>
                  {dateLabel(item.startsAt)} · {timeLabel(item.startsAt)} · {item.patient?.name}
                </small>
              </div>
              <span className={`status-pill ${statusClass(item.status)}`}>{t(item.status)}</span>
            </Link>
          ))
        ) : (
          <p className="muted small-text">
            {t('No upcoming appointments. Confirmed bookings will appear here.')}{' '}
          </p>
        )}
      </div>
    </section>
  );
}
