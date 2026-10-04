import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../auth';
import { Loading, Notice, PageHeading, useResource } from '../components/ui';
import { dateLabel, timeLabel, statusClass } from '../scheduling';

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
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, pending, error } = useResource(endpoints[user.role]);
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Colombo',
  }).format(new Date());
  if (pending) return <Loading />;
  if (error) return <Notice>{error}</Notice>;
  const [headline, description] = roleCopy[user.role];
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title={`Welcome, ${user.name.split(' ')[0]}.`}
        description="A fresh start for a more connected day."
      >
        <span className="date-pill">
          <CalendarDays size={16} />
          {date}
        </span>
      </PageHeading>
      <section className="welcome-banner">
        <div>
          <span className="banner-label">
            <span /> CARE, CONNECTED
          </span>
          <h2>{headline}</h2>
          <p>{description}</p>
          {user.role === 'admin' ? (
            <Link className="button lime" to="/admin/staff">
              Manage care team <ArrowUpRight size={17} />
            </Link>
          ) : user.role === 'patient' ? (
            <Link className="button lime" to="/book">
              Book an appointment <ArrowUpRight size={17} />
            </Link>
          ) : (
            <Link className="button lime" to={user.role === 'doctor' ? '/queue' : '/appointments'}>
              {user.role === 'doctor' ? 'Open consultation queue' : 'View appointments'}{' '}
              <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
        <div className="banner-art" aria-hidden="true">
          <div />
          <HeartPulse size={100} strokeWidth={1} />
        </div>
      </section>
      <AppointmentOverview />
      {user.role === 'admin' && (
        <>
          <div className="section-heading">
            <h2>Hospital at a glance</h2>
            <span>Current registered records</span>
          </div>
          <div className="metric-grid">
            <Metric
              icon={UserRound}
              label="Patients"
              value={data.patients}
              detail="Registered patient profiles"
            />
            <Metric
              icon={Stethoscope}
              label="Doctors"
              value={data.doctors}
              detail="Members of your care team"
            />
            <Metric
              icon={UsersRound}
              label="Receptionists"
              value={data.receptionists}
              detail="Front-desk staff"
            />
            <Metric
              icon={Building2}
              label="Departments"
              value={data.departments}
              detail="Hospital departments"
            />
          </div>
          <div className="dashboard-grid">
            <section className="card padded">
              <div className="section-heading">
                <h2>Build your care team</h2>
                <span className="tag">GET STARTED</span>
              </div>
              <p className="muted">
                Set up your hospital’s departments, then add the people who bring them to life.
              </p>
              <Link className="action-row" to="/admin/departments">
                <span className="action-icon">
                  <Building2 size={22} />
                </span>
                <div>
                  <strong>Organise departments</strong>
                  <small>Create departments for your hospital.</small>
                </div>
                <ArrowUpRight size={20} />
              </Link>
              <Link className="action-row" to="/admin/staff">
                <span className="action-icon">
                  <UsersRound size={22} />
                </span>
                <div>
                  <strong>Manage staff accounts</strong>
                  <small>Add doctors and receptionists.</small>
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
              <h2>Your health profile</h2>
              <UserRound size={21} />
            </div>
            <p className="muted">Accurate contact details help your care team reach you.</p>
            <dl className="detail-list">
              <div>
                <dt>Date of birth</dt>
                <dd>{data.profile.dateOfBirth}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{user.phone || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Emergency contact</dt>
                <dd>{data.profile.emergencyContact?.name || 'Not provided'}</dd>
              </div>
            </dl>
            <div className="allergy-note">
              <ShieldCheck size={20} />
              <div>
                <strong>Allergy information</strong>
                <p>
                  {data.profile.allergies.length
                    ? data.profile.allergies.join(', ')
                    : 'No allergy information recorded. Confirm with your care team.'}
                </p>
              </div>
            </div>
            <Link className="text-link" to="/profile">
              Review my profile <ArrowUpRight size={16} />
            </Link>
          </section>
          <AccountCard user={user} />
        </div>
      )}
      {user.role === 'doctor' && (
        <div className="dashboard-grid">
          <section className="card padded">
            <div className="section-heading">
              <h2>Your clinical profile</h2>
              <Stethoscope size={22} />
            </div>
            <dl className="detail-list">
              <div>
                <dt>Department</dt>
                <dd>{data.profile.department?.name || 'Not assigned'}</dd>
              </div>
              <div>
                <dt>Specialisation</dt>
                <dd>{data.profile.specialization}</dd>
              </div>
              <div>
                <dt>Qualifications</dt>
                <dd>{data.profile.qualification || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Consultation fee</dt>
                <dd>
                  {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(
                    data.profile.consultationFeeMinor / 100,
                  )}
                </dd>
              </div>
            </dl>
            <p className="muted small-text">Contact your administrator to update these details.</p>
          </section>
          <AccountCard user={user} />
        </div>
      )}
      {user.role === 'receptionist' && (
        <div className="dashboard-grid">
          <section className="card padded">
            <div className="section-heading">
              <h2>Front desk overview</h2>
              <ClipboardList size={22} />
            </div>
            <div className="single-stat">
              <strong>{data.patientCount}</strong>
              <span>registered patient profiles</span>
            </div>
            <p className="muted">
              Find an existing patient or register a walk-in, then book a slot and check them in on
              arrival.
            </p>
          </section>
          <AccountCard user={user} />
        </div>
      )}
      <section className="roadmap-note">
        <span className="action-icon">
          <CalendarDays size={20} />
        </span>
        <div>
          <strong>Next in your care journey</strong>
          <p>
            Notifications and operational reports are planned for upcoming development milestones.
          </p>
        </div>
        <span className="tag">COMING NEXT</span>
      </section>
    </>
  );
}
function AccountCard({ user }) {
  return (
    <section className="card padded account-card">
      <div className="section-heading">
        <h2>Your account</h2>
        <ShieldCheck size={21} />
      </div>
      <div className="account-avatar">{user.name.charAt(0)}</div>
      <h3>{user.name}</h3>
      <p className="muted email-wrap">{user.email}</p>
      <span className="role-badge">{user.role === 'admin' ? 'Administrator' : user.role}</span>
      <div className="account-status">
        <span className="status-dot" /> Account active
      </div>
      <p className="small-text muted">Only authorised users can access this workspace.</p>
    </section>
  );
}

function AppointmentOverview() {
  const { data, pending, error } = useResource('/appointments-summary');
  if (pending) return <Loading text="Loading appointment overview…" />;
  if (error) return <Notice>{error}</Notice>;
  return (
    <section className="appointment-overview">
      <div className="appointment-stats">
        <Link to="/appointments">
          <strong>{data.today}</strong>
          <span>Appointments today</span>
        </Link>
        <Link to="/appointments">
          <strong>{data.waiting}</strong>
          <span>Waiting today</span>
        </Link>
        <Link to="/appointments">
          <strong>{data.upcoming}</strong>
          <span>Upcoming bookings</span>
        </Link>
      </div>
      <div className="card padded">
        <div className="section-heading">
          <h2>Coming up next</h2>
          <Link className="text-link" to="/appointments">
            View all <ArrowUpRight size={15} />
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
              <span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span>
            </Link>
          ))
        ) : (
          <p className="muted small-text">
            No upcoming appointments. Confirmed bookings will appear here.
          </p>
        )}
      </div>
    </section>
  );
}
