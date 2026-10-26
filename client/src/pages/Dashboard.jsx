import PatientDashboard from './PatientDashboard';
import { t, getLocale } from '../i18n/locale';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { lazy, Suspense } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Building2,
  UsersRound,
  Stethoscope,
  UserRound,
  ShieldCheck,
  ClipboardList,
  CalendarDays,
  HeartPulse,
  Clock3,
  CalendarCheck2,
  ReceiptText,
  CalendarPlus,
  ChartNoAxesCombined,
} from 'lucide-react';
import { useAuth } from '../auth';
import { Loading, Notice, PageHeading, useResource } from '../components/ui';
import { dateLabel, timeLabel, statusClass } from '../scheduling';
import './Dashboard.css';
const DashboardCharts = lazy(() => import('../components/DashboardCharts'));

const roleCopy = {
  admin: [
    'A clear view of your hospital.',
    'Manage the people and departments behind connected care.',
  ],
  doctor: [
    'More focus on the people you care for.',
    'Your clinical workspace starts with a connected care team.',
  ],
  receptionist: [
    'A better welcome starts here.',
    'Your front-desk workspace for a connected patient experience.',
  ],
};
const endpoints = {
  admin: '/admin/overview',
  patient: '/patients/me',
  doctor: '/doctors/me',
  receptionist: '/reception/overview',
};
const shortcuts = {
  admin: [
    ['/admin/staff', 'Manage care team', UsersRound],
    ['/admin/departments', 'Organise departments', Building2],
    ['/admin/reports', 'Reports & analytics', ChartNoAxesCombined],
    ['/billing', 'Billing', ReceiptText],
  ],
  doctor: [
    ['/queue', 'Consultation queue', HeartPulse],
    ['/schedules', 'Doctor schedules', CalendarDays],
    ['/appointments', 'Appointments', CalendarCheck2],
  ],
  receptionist: [
    ['/reception/patients', 'Patients & walk-ins', UserRound],
    ['/book', 'Book appointment', CalendarPlus],
    ['/appointments', 'Appointments', CalendarCheck2],
    ['/billing', 'Billing', ReceiptText],
  ],
};
function Metric({ icon: Icon, label, value, detail, to }) {
  return (
    <Link className="staff-metric" to={to}>
      <span className="staff-metric-top">
        <span className="staff-icon">
          <Icon size={21} aria-hidden="true" />
        </span>
        <ArrowUpRight size={17} aria-hidden="true" />
      </span>
      <span className="staff-metric-value">{new Intl.NumberFormat(getLocale()).format(value)}</span>
      <span className="staff-metric-label">{t(label)}</span>
      <span className="staff-metric-detail">{t(detail)}</span>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, pending, error } = useResource(endpoints[user.role], 0, true);
  const date = new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Colombo',
  }).format(new Date());
  if (pending) return <Loading />;
  if (error) return <Notice>{error}</Notice>;
  if (user.role === 'patient')
    return <PatientDashboard user={user} profile={data.profile} date={date} />;
  const [headline, description] = roleCopy[user.role];
  return (
    <div className="staff-dashboard">
      <PageHeading
        eyebrow={t('YOUR WORKSPACE')}
        title={t('Welcome, {name}.', { name: user.name.split(' ')[0] })}
        description={t('A fresh start for a more connected day.')}
      >
        <span className="date-pill">
          <CalendarDays size={17} aria-hidden="true" />
          {date}
        </span>
      </PageHeading>
      <section className="welcome-banner staff-welcome">
        <div>
          <span className="banner-label">
            <span />
            {t('CARE, CONNECTED')}
          </span>
          <h2>{t(headline)}</h2>
          <p>{t(description)}</p>
        </div>
        <Link
          className="button staff-primary-action"
          to={user.role === 'doctor' ? '/queue' : '/book'}
        >
          {user.role === 'doctor' ? t('Open consultation queue') : t('Book an appointment')}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
        <HeartPulse className="staff-welcome-art" size={180} strokeWidth={1} aria-hidden="true" />
      </section>
      {user.role === 'admin' && (
        <section aria-label={t('Hospital at a glance')}>
          <div className="section-heading staff-section-heading">
            <h2>{t('Hospital at a glance')}</h2>
            <span>{t('Current registered records')}</span>
          </div>
          <div className="staff-metrics">
            <Metric
              icon={UserRound}
              label="Patients"
              value={data.patients}
              detail="Registered patient profiles"
              to="/admin/patients"
            />
            <Metric
              icon={Stethoscope}
              label="Doctors"
              value={data.doctors}
              detail="Members of your care team"
              to="/admin/staff"
            />
            <Metric
              icon={UsersRound}
              label="Receptionists"
              value={data.receptionists}
              detail="Front-desk staff"
              to="/admin/staff"
            />
            <Metric
              icon={Building2}
              label="Departments"
              value={data.departments}
              detail="Hospital departments"
              to="/admin/departments"
            />
          </div>
        </section>
      )}
      <div className="staff-work-grid">
        <AppointmentOverview />
        <section className="card padded staff-shortcuts" aria-label={t('Quick actions')}>
          <div className="section-heading">
            <h2>{t('Quick actions')}</h2>
            <ClipboardList size={20} aria-hidden="true" />
          </div>
          <p className="muted small-text">{t('Your everyday tools, one click away.')}</p>
          <div className="staff-shortcut-list">
            {shortcuts[user.role].map(([to, label, Icon]) => (
              <Link key={to} to={to}>
                <span className="staff-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span>{t(label)}</span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <div className="staff-security-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{t('Protected workspace')}</span>
          </div>
        </section>
      </div>
      <Suspense fallback={<Loading text="Loading charts…" />}>
        <DashboardCharts />
      </Suspense>
      {user.role === 'admin' && (
        <div className="dashboard-grid">
          <section className="card padded staff-team-card">
            <span className="staff-icon">
              <UsersRound size={24} aria-hidden="true" />
            </span>
            <h2>{t('Build your care team')}</h2>
            <p className="muted">
              {t('Set up your hospital’s departments, then add the people who bring them to life.')}
            </p>
            <Link className="button primary" to="/admin/staff">
              {t('Manage staff accounts')}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </section>
          <AccountCard user={user} />
        </div>
      )}
      {user.role === 'doctor' && (
        <div className="dashboard-grid">
          <section className="card padded">
            <div className="section-heading">
              <h2>{t('Your clinical profile')}</h2>
              <Stethoscope size={22} />
            </div>
            <dl className="detail-list">
              <div>
                <dt>{t('Department')}</dt>
                <dd>{data.profile.department?.name || t('Not assigned')}</dd>
              </div>
              <div>
                <dt>{t('Specialisation')}</dt>
                <dd>{data.profile.specialization}</dd>
              </div>
              <div>
                <dt>{t('Qualifications')}</dt>
                <dd>{data.profile.qualification || t('Not provided')}</dd>
              </div>
              <div>
                <dt>{t('Consultation fee')}</dt>
                <dd>
                  {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(
                    data.profile.consultationFeeMinor / 100,
                  )}
                </dd>
              </div>
            </dl>
            <p className="muted small-text">
              {t('Contact your administrator to update these details.')}
            </p>
          </section>
          <AccountCard user={user} />
        </div>
      )}
      {user.role === 'receptionist' && (
        <div className="dashboard-grid">
          <section className="card padded">
            <div className="section-heading">
              <h2>{t('Front desk overview')}</h2>
              <ClipboardList size={22} />
            </div>
            <div className="single-stat">
              <strong>{data.patientCount}</strong>
              <span>{t('registered patient profiles')}</span>
            </div>
            <p className="muted">
              {t(
                'Find an existing patient or register a walk-in, then book a slot and check them in on arrival.',
              )}{' '}
            </p>
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
    <section className="appointment-overview" aria-label={t('Appointments')}>
      <div className="appointment-stats">
        {[
          [CalendarDays, data.today, 'Appointments today'],
          [Clock3, data.waiting, 'Waiting today'],
          [CalendarCheck2, data.upcoming, 'Upcoming bookings'],
        ].map(([Icon, value, label]) => (
          <Link to="/appointments" key={label}>
            <span className="stat-symbol" aria-hidden="true">
              <Icon size={19} />
            </span>
            <ArrowUpRight className="stat-arrow" size={16} aria-hidden="true" />
            <strong>{new Intl.NumberFormat(getLocale()).format(value)}</strong>
            <span>{t(label)}</span>
          </Link>
        ))}
      </div>
      <div className="card padded staff-upcoming">
        <div className="section-heading">
          <h2>{t('Coming up next')}</h2>
          <Link className="text-link" to="/appointments">
            {t('View all')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {data.next.length ? (
          data.next.map((item) => (
            <Link key={item.id} to={`/appointments?selected=${item.id}`} className="upcoming-row">
              <span className="staff-appointment-icon">
                <CalendarDays size={21} aria-hidden="true" />
              </span>
              <div className="staff-appointment-copy">
                <strong>{item.doctorName}</strong>
                <small>
                  {dateLabel(item.startsAt)} · {timeLabel(item.startsAt)}
                </small>
                {item.patient?.name && <small>{item.patient.name}</small>}
              </div>
              <span className={`status-pill ${statusClass(item.status)}`}>{t(item.status)}</span>
              <ArrowUpRight size={16} className="staff-row-arrow" aria-hidden="true" />
            </Link>
          ))
        ) : (
          <div className="staff-empty-state">
            <span className="staff-icon">
              <CalendarCheck2 size={26} aria-hidden="true" />
            </span>
            <p>{t('No upcoming appointments. Confirmed bookings will appear here.')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
