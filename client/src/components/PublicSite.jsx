import LanguageSwitcher from './LanguageSwitcher';
import HospitalAssistant from './HospitalAssistant';
import { usePublicMotion } from '../hooks/usePublicMotion';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  FileHeart,
  ReceiptText,
  Menu,
  X,
} from 'lucide-react';
import { Brand, useResource } from './ui';
import { DisplayPreference } from './DisplayPreference';
import { useAuth } from '../auth';
import { t } from '../i18n/locale';
import { HospitalContactStrip } from '../pages/PublicHospitalSections';
import PublicPagePhoto from './PublicPagePhoto';
import '../pages/PublicHome.css';
import './PublicSite.css';

export function PublicHeader({ hospital }) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <HospitalContactStrip hospital={hospital} />
      <header className="public-header glass-surface hospital-site-header">
        <Link to="/" aria-label={t('Smart HMS home')}>
          <Brand />
        </Link>
        <LanguageSwitcher />
        <button
          className="homepage-menu-toggle"
          type="button"
          aria-label={t('Hospital navigation')}
          aria-expanded={menuOpen}
          aria-controls="homepage-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        <nav
          aria-label={t('Hospital navigation')}
          id="homepage-navigation"
          className={!menuOpen ? 'homepage-navigation-closed' : undefined}
          onClick={() => setMenuOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenuOpen(false);
              event.currentTarget.previousElementSibling?.focus();
            }
          }}
        >
          <NavLink to="/" end>
            {t('Home')}
          </NavLink>
          <NavLink to="/about">{t('About us')}</NavLink>
          <NavLink to="/doctors">{t('Doctors & services')}</NavLink>
          <NavLink to="/departments">{t('Departments')}</NavLink>
          <NavLink to="/contact">{t('Contact us')}</NavLink>
        </nav>
        <div className="hospital-header-actions">
          <Link className="button primary" to={user?.role === 'doctor' ? '/dashboard' : '/book'}>
            {t('Book appointment')}
          </Link>
          <Link className="button subtle" to={user ? '/dashboard' : '/login'}>
            {user ? t('My workspace') : t('Patient portal')}
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
    </>
  );
}
export function PublicFooter({ hospital }) {
  const { user } = useAuth();
  return (
    <>
      <footer className="public-site-footer">
        <div className="public-footer">
          <div>
            <Brand />
            <p>{hospital?.name || t('Care, connected.')}</p>
            <p className="footer-description">
              {t('Find your doctor, plan your visit and manage your care.')}
            </p>
            {hospital?.phone && (
              <a className="footer-contact" href={`tel:${hospital.phone}`}>
                {t('Reception')}: {hospital.phone}
              </a>
            )}
            {hospital?.email && (
              <a className="footer-contact" href={`mailto:${hospital.email}`}>
                {hospital.email}
              </a>
            )}
          </div>
          <nav className="hospital-footer-nav" aria-label={t('Useful links')}>
            <Link to="/about">{t('About us')}</Link>
            <Link to="/doctors">{t('Doctors & services')}</Link>
            <Link to="/departments">{t('Departments')}</Link>
            <Link to="/contact">{t('Contact us')}</Link>
            <a href="/#visitor-guide">{t('Patient guide')}</a>
          </nav>
          <div className="public-footer-actions">
            <DisplayPreference />
            <Link to={user ? '/dashboard' : '/login'}>
              {t('Staff & patient sign in')}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        <div className="public-footer-bottom">
          <span>{t('Care, connected.')}</span>
          <span>{t('English, Sinhala & Tamil')}</span>
        </div>
      </footer>
    </>
  );
}
export function PublicPage({ title, description, children, visual }) {
  const motionRef = usePublicMotion();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  const resource = useResource('/public/hospital');
  const hospital = resource.data?.hospital;
  return (
    <div ref={motionRef} className="public-home hospital-landing public-redesign">
      <a className="skip-link" href="#public-main">
        {t('Skip to content')}
      </a>
      <div className="public-container">
        <PublicHeader hospital={hospital} />
        <main id="public-main" className="hospital-inner-page">
          <Link className="text-link" to="/">
            {t('← Hospital website')}
          </Link>
          <div className={visual ? 'hospital-page-intro' : undefined}>
            <div className="hospital-page-heading">
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
            {visual && <PublicPagePhoto kind={visual} />}
          </div>
          {typeof children === 'function'
            ? children({ hospital, pending: resource.pending, error: resource.error })
            : children}
        </main>
        <PublicFooter hospital={hospital} />
      </div>
      <HospitalAssistant key={pathname} />
    </div>
  );
}
export function PatientShortcuts() {
  const { user } = useAuth();
  const links = [
    ['Book an appointment', '/book', CalendarDays],
    ['My appointments', '/appointments', CalendarDays],
    ['Medical records', '/records', FileHeart],
    ['Bills & payments', '/billing', ReceiptText],
  ];
  return (
    <section className="hospital-patient-shortcuts" aria-label={t('Patient services')}>
      {links.map(([label, path, Icon]) => (
        <Link key={path} to={user && user.role !== 'patient' ? '/dashboard' : path}>
          <Icon size={24} aria-hidden="true" />
          <span>{t(label)}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      ))}
    </section>
  );
}
