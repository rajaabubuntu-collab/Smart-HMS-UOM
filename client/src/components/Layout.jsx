import PatientAssistant from './PatientAssistant';
import LanguageSwitcher from './LanguageSwitcher';
import { t } from '../i18n/locale';
import { NotificationBell } from '../pages/Notifications';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  UserRound,
  Building2,
  UsersRound,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  HeartPulse,
  CalendarDays,
  CalendarPlus,
  CalendarClock,
  Bell,
  MessageSquare,
  ChartNoAxesCombined,
  ScrollText,
  Settings,
  ReceiptText,
} from 'lucide-react';
import { useAuth } from '../auth';
import { Brand, Notice } from './ui';
import { DisplayPreference } from './DisplayPreference';
import ProfileAvatarControl from './ProfileAvatarControl';
import { RealtimeConnection, RealtimeStatus } from './Realtime';

export default function Layout() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const links = [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard }];
  links.push({ to: '/notifications', label: 'Notifications', icon: Bell });
  if (['patient', 'admin'].includes(user.role))
    links.push({ to: '/messages', label: 'Email & SMS', icon: MessageSquare });
  links.push({ to: '/appointments', label: 'Appointments', icon: CalendarDays });
  if (['admin', 'receptionist'].includes(user.role))
    links.push({ to: '/enquiries', label: 'Website enquiries', icon: MessageSquare });
  if (['patient', 'admin'].includes(user.role))
    links.push({
      to: user.role === 'patient' ? '/feedback' : '/admin/feedback',
      label: user.role === 'patient' ? 'My feedback' : 'Patient feedback',
      icon: MessageSquare,
    });
  if (user.role === 'doctor')
    links.push({ to: '/queue', label: 'Consultation queue', icon: HeartPulse });
  if (user.role === 'patient')
    links.push({ to: '/recommendations', label: 'Department guide', icon: HeartPulse });
  if (user.role === 'patient')
    links.push({ to: '/records', label: 'Medical records', icon: HeartPulse });
  if (user.role !== 'doctor')
    links.push({
      to: '/billing',
      label: user.role === 'patient' ? 'Bills & payments' : 'Billing',
      icon: CalendarDays,
    });
  if (user.role !== 'doctor')
    links.push({ to: '/book', label: 'Book appointment', icon: CalendarPlus });
  if (['receptionist', 'admin'].includes(user.role))
    links.push({ to: '/reception/patients', label: 'Patients & walk-ins', icon: UserRound });
  if (['doctor', 'admin'].includes(user.role))
    links.push({ to: '/schedules', label: 'Doctor schedules', icon: CalendarClock });
  if (user.role === 'patient') links.push({ to: '/profile', label: 'My profile', icon: UserRound });
  if (user.role === 'admin')
    links.push(
      { to: '/admin/patients', label: 'Patient accounts', icon: UserRound },
      { to: '/admin/settings', label: 'Hospital settings', icon: Settings },
      { to: '/admin/departments', label: 'Departments', icon: Building2 },
      { to: '/admin/staff', label: 'Care team', icon: UsersRound },
      { to: '/admin/reports', label: 'Reports & analytics', icon: ChartNoAxesCombined },
      { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
    );
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`app-shell ${user.role === 'patient' ? 'patient-workspace' : ''}`}>
      <RealtimeConnection />
      {user.role === 'patient' && <PatientAssistant key={user.id} />}
      <a className="skip-link" href="#main">
        {t('Skip to content')}{' '}
      </a>
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label={t('Close navigation')}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link to="/dashboard" className="brand-link" onClick={() => setMenu(false)}>
          <Brand />
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label={t('Close navigation')}
          onClick={() => setMenu(false)}
        >
          <X size={22} />
        </button>
        <div className="workspace-label">
          {user.role === 'admin' ? t('Hospital administration') : t(`${t(user.role)} workspace`)}
        </div>
        <p className="nav-label">{t('WORKSPACE')}</p>
        <nav>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenu(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={19} />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-care">
          <span className="care-mini">
            <HeartPulse size={21} />
          </span>
          <strong>{t('A connected care journey.')}</strong>
          <p>{t('Better experiences begin with the details.')}</p>
          <span className="tiny-label">{t('SMART HMS')}</span>
        </div>
        <div className="sidebar-bottom">
          <Link className="text-link hospital-home-link" to="/">
            {t('Hospital website')}{' '}
          </Link>
          <span>
            <ShieldCheck size={16} /> {t('Protected workspace')}{' '}
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label={t('Open navigation')}
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="topbar-title">{t('Your hospital, connected.')}</span>
            <RealtimeStatus />
          </div>
          <LanguageSwitcher />
          <div className="topbar-user">
            <DisplayPreference />
            <NotificationBell />
            <ProfileAvatarControl user={user} />
            <div className="user-label">
              <strong>{user.name}</strong>
              <span>{user.role === 'admin' ? t('Administrator') : user.role}</span>
            </div>
            <button
              className="icon-button logout"
              title={t('Sign out')}
              aria-label={t('Sign out')}
              onClick={signOut}
              disabled={busy}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main id="main" className="page-content">
          <Notice>{error}</Notice>
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>
            {t('Smart HMS')} <span className="footer-dot">·</span> {t('Care, connected.')}{' '}
          </span>
          <span>{t('Your hospital, connected.')}</span>
        </footer>
      </div>
      {user.role === 'patient' && (
        <nav className="workspace-mobile-nav" aria-label={t('WORKSPACE')}>
          {[
            { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
            { to: '/appointments', label: 'Appointments', icon: CalendarDays },
            { to: '/recommendations', label: 'Department guide', icon: HeartPulse },
            { to: '/billing', label: 'Bills & payments', icon: ReceiptText },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMenu(false)}>
              <Icon size={21} aria-hidden="true" />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
