import PatientDashboard from './PatientDashboard';
import { t, getLocale } from '../i18n/locale';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { lazy, Suspense } from 'react';
import {
  ArrowUpRight,
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
} from 'lucide-react';
import { useAuth } from '../auth';
import { Loading, Notice, PageHeading, useResource } from '../components/ui';
import { dateLabel, timeLabel, statusClass } from '../scheduling';
const DashboardCharts = lazy(() => import('../components/DashboardCharts'));

const roleCopy = {
  admin: [
    'A clear view of your hospital.',
    'Manage the people and departments behind connected care.',
  ],
  patient: [
    'Your care, all in one place.',
    'Keep your details up to date for a smoother hospital experience.',
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
function Metric({ icon: Icon, label, value, detail }) {
  return (
    <div className="metric card">
      <span className="metric-icon">
        <Icon size={20} />
      </span>
      <p>{t(label)}</p>
      <strong>{value}</strong>
      <small>{t(detail)}</small>
    </div>
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
    <>
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
      <section className="welcome-banner">
        <div>
          <span className="banner-label">
            <span /> {t('CARE, CONNECTED')}{' '}
          </span>
          <h2>{t(headline)}</h2>
          <p>{t(description)}</p>
          {user.role === 'admin' ? (
            <Link className="button lime" to="/admin/staff">
              {t('Manage care team')} <ArrowUpRight size={17} />
            </Link>
          ) : user.role === 'patient' ? (
            <Link className="button lime" to="/book">
              {t('Book an appointment')} <ArrowUpRight size={17} />
            </Link>
          ) : (
            <Link className="button lime" to={user.role === 'doctor' ? '/queue' : '/appointments'}>
              {user.role === 'doctor' ? t('Open consultation queue') : t('View appointments')}{' '}
              <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
        <div className="banner-art" aria-hidden="true">
          <div />
          <HeartPulse size={100} strokeWidth={1} />
        </div>
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
        <section className="card padded guide-shortcut">
          <h2>{t('Need help choosing a department?')}</h2>
          <p>
            {t(
              'The department guide can suggest a service for non-emergency concerns. It is not a diagnosis.',
            )}{' '}
          </p>
          <Link className="button primary" to="/recommendations">
            {t('Open department guide')}{' '}
          </Link>
        </section>
      )}
      {user.role === 'admin' && (
        <>
          <div className="section-heading">
            <h2>{t('Hospital at a glance')}</h2>
            <span>{t('Current registered records')}</span>
          </div>
          <div className="metric-grid">
            <Metric
              icon={UserRound}
              label={t('Patients')}
              value={data.patients}
              detail="Registered patient profiles"
            />
            <Metric
              icon={Stethoscope}
              label={t('Doctors')}
              value={data.doctors}
              detail="Members of your care team"
            />
            <Metric
              icon={UsersRound}
              label={t('Receptionists')}
              value={data.receptionists}
              detail="Front-desk staff"
            />
            <Metric
              icon={Building2}
              label={t('Departments')}
              value={data.departments}
              detail="Hospital departments"
            />
          </div>
          <div className="dashboard-grid">
            <section className="card padded">
              <div className="section-heading">
                <h2>{t('Build your care team')}</h2>
                <span className="tag">{t('GET STARTED')}</span>
              </div>
              <p className="muted">
                {t(
                  'Set up your hospital’s departments, then add the people who bring them to life.',
                )}{' '}
              </p>
              <Link className="action-row" to="/admin/departments">
                <span className="action-icon">
                  <Building2 size={22} />
                </span>
                <div>
                  <strong>{t('Organise departments')}</strong>
                  <small>{t('Create departments for your hospital.')}</small>
                </div>
                <ArrowUpRight size={20} />
              </Link>
              <Link className="action-row" to="/admin/staff">
                <span className="action-icon">
                  <UsersRound size={22} />
                </span>
                <div>
                  <strong>{t('Manage staff accounts')}</strong>
                  <small>{t('Add doctors and receptionists.')}</small>
                </div>
                <ArrowUpRight size={20} />
              </Link>
            </section>
            <AccountCard user={user} />
          </div>
        </>
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
                <dd>{data.profile.dateOfBirth}</dd>
              </div>
              <div>
                <dt>{t('Phone')}</dt>
                <dd>{user.phone || t('Not provided')}</dd>
              </div>
              <div>
                <dt>{t('Emergency contact')}</dt>
                <dd>{data.profile.emergencyContact?.name || t('Not provided')}</dd>
              </div>
            </dl>
            <div className="allergy-note">
              <ShieldCheck size={20} />
              <div>
                <strong>{t('Allergy information')}</strong>
                <p>
                  {data.profile.allergies.length
                    ? data.profile.allergies.join(', ')
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
    </>
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
