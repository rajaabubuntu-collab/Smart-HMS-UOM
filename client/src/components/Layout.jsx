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
} from 'lucide-react';
import { useAuth } from '../auth';
import { Brand, Notice } from './ui';

export default function Layout() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const links = [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard }];
  links.push({ to: '/appointments', label: 'Appointments', icon: CalendarDays });
  if (user.role === 'doctor')
    links.push({ to: '/queue', label: 'Consultation queue', icon: HeartPulse });
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
      { to: '/admin/departments', label: 'Departments', icon: Building2 },
      { to: '/admin/staff', label: 'Care team', icon: UsersRound },
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
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link to="/dashboard" className="brand-link" onClick={() => setMenu(false)}>
          <Brand />
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X size={22} />
        </button>
        <div className="workspace-label">
          {user.role === 'admin' ? 'Hospital administration' : `${user.role} workspace`}
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenu(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-care">
          <span className="care-mini">
            <HeartPulse size={21} />
          </span>
          <strong>A connected care journey.</strong>
          <p>Better experiences begin with the details.</p>
          <span className="tiny-label">SMART HMS</span>
        </div>
        <div className="sidebar-bottom">
          <span>
            <ShieldCheck size={16} /> Protected workspace
          </span>
          <small>Final-year project · v0.5</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="topbar-title">Your hospital, connected.</span>
          </div>
          <div className="topbar-user">
            <div className="avatar">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="user-label">
              <strong>{user.name}</strong>
              <span>{user.role === 'admin' ? 'Administrator' : user.role}</span>
            </div>
            <button
              className="icon-button logout"
              title="Sign out"
              aria-label="Sign out"
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
            Smart HMS <span className="footer-dot">·</span> Care, connected.
          </span>
          <span>University of Moratuwa · BIT Project</span>
        </footer>
      </div>
    </div>
  );
}
