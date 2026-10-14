import { t, getLanguage } from '../i18n/locale';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  FileHeart,
  HeartPulse,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { Brand, useResource } from '../components/ui';
import HospitalInformation from '../components/HospitalInformation';
import { DisplayPreference } from '../components/DisplayPreference';
import { useAuth } from '../auth';

const services = [
  {
    icon: CalendarDays,
    title: 'Appointments, made simple.',
    description:
      'Find available doctors and time slots. Keep track of upcoming visits in your patient portal.',
    link: '/book',
    action: 'Explore appointments',
  },
  {
    icon: FileHeart,
    title: 'Your care, in one place.',
    description:
      'Revisit completed consultations and prescriptions, with access to your own medical records.',
    link: '/records',
    action: 'Open medical records',
  },
  {
    icon: ReceiptText,
    title: 'A clearer view of your bills.',
    description:
      'See itemised charges in Sri Lankan rupees, payment records and your remaining balance.',
    link: '/billing',
    action: 'View bills and payments',
  },
];

export default function PublicHome() {
  const { user } = useAuth();
  const {
    data: information,
    error: informationError,
    pending: informationPending,
  } = useResource('/public/hospital');
  const hospital = information?.hospital;
  const portal = user ? '/dashboard' : '/login';
  return (
    <div className="public-home">
      <a className="skip-link" href="#public-main">
        {t('Skip to content')}{' '}
      </a>
      <div className="public-container">
        <header className="public-header glass-surface">
          <Link to="/" aria-label={t('Smart HMS home')}>
            <Brand />
          </Link>
          <nav aria-label={t('Hospital navigation')}>
            <Link to="/doctors">{t('Doctors & services')}</Link>
            <a href="#services">{t('Patient services')}</a>
            <a href="#your-visit">{t('Your visit')}</a>
            <a href="#hospital-info">{t('Hospital information')}</a>
          </nav>
          <Link className="button primary" to={portal}>
            {user ? t('My workspace') : t('Patient portal')} <ArrowUpRight size={16} />
          </Link>
        </header>

        <main id="public-main">
          <section className="public-hero" aria-labelledby="home-title">
            <div className="public-hero-copy">
              <p className="public-kicker">
                <span /> {hospital?.name || t('CARE, CONNECTED. IN SRI LANKA.')}
              </p>
              <h1 id="home-title">
                {t('A little simpler.')} <br />
                {t('A lot more')} <em>{t('care.')}</em>
              </h1>
              <p className="public-lead">
                {t(
                  'From your first appointment to your next step. One thoughtful space to manage your hospital visits.',
                )}{' '}
              </p>
              <div className="public-actions">
                <Link className="button primary" to={user ? '/dashboard' : '/register'}>
                  {user ? t('Go to my workspace') : t('Create patient account')}{' '}
                  <ArrowRight size={18} />
                </Link>
                <a className="button subtle" href="#your-visit">
                  {t('See how it works')}{' '}
                </a>
              </div>
              <p className="public-assurance">
                <ShieldCheck size={16} /> {t('Personal records. Account-protected access.')}{' '}
              </p>
              {(!hospital || hospital.isDemo) && (
                <span className="demo-label">
                  {t('University project · Demonstration website')}
                </span>
              )}
            </div>
            <div
              className="care-composition"
              aria-label={t('Illustration of a connected patient journey')}
              role="img"
            >
              <div className="care-halo halo-outer" />
              <div className="care-halo halo-inner" />
              <div className="glass-heart">
                <HeartPulse size={112} strokeWidth={1.1} />
              </div>
              <div className="journey-card glass-surface">
                <div className="journey-card-icon">
                  <CalendarDays size={23} />
                </div>
                <div>
                  <small>{t('ONE CONNECTED JOURNEY')}</small>
                  <strong>{t('Your next visit')}</strong>
                  <span>{t('Plan. Arrive. Follow up.')}</span>
                </div>
                <span className="journey-check">
                  <Check size={17} />
                </span>
              </div>
              <div className="care-float glass-surface">
                <Stethoscope size={20} />
                <span>
                  {t('Patients & care teams')} <br />
                  <strong>{t('Better connected.')}</strong>
                </span>
              </div>
              <span className="composition-caption">
                {t('Designed around the patient journey')}
              </span>
            </div>
          </section>

          <div className="local-strip" aria-label={t('Local information')}>
            <span>
              <MapPin size={18} /> {t('Built for Sri Lanka')}{' '}
            </span>
            <span>
              <Clock3 size={18} /> {t('Appointments in Sri Lanka time')}{' '}
            </span>
            <span>
              <ReceiptText size={18} /> {t('Billing in LKR')}{' '}
            </span>
          </div>

          <section id="services" className="public-section" aria-labelledby="services-title">
            <div className="public-section-heading">
              <div>
                <p className="public-kicker">{t('YOUR PATIENT PORTAL')}</p>
                <h2 id="services-title">
                  {t('Less to organise.')} <br />
                  {t('More peace of mind.')}{' '}
                </h2>
              </div>
              <p>
                {t('Simple tools for the details around your care.')} <br />
                {t('Sign in to access your personal information.')}{' '}
              </p>
            </div>
            <div className="public-service-grid">
              {services.map(({ icon: Icon, title, description, link, action }, index) => (
                <article className="public-service-card" key={title}>
                  <div className="service-top">
                    <span className="service-icon">
                      <Icon size={26} strokeWidth={1.5} />
                    </span>
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{t(title)}</h3>
                  <p>{t(description)}</p>
                  <Link to={!user ? '/login' : user.role === 'patient' ? link : '/dashboard'}>
                    {t(action)}
                    <ArrowUpRight size={17} />
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section
            id="your-visit"
            className="public-section visit-section"
            aria-labelledby="visit-title"
          >
            <div>
              <p className="public-kicker">{t('A CLEARER PATH')}</p>
              <h2 id="visit-title">
                {t('Your visit.')} <br />
                {t('One step at a time.')}{' '}
              </h2>
              <p>
                {t(
                  'New to the portal? Start with an account, then choose an available appointment.',
                )}
              </p>
              <Link className="text-link" to={portal}>
                {t('Open your portal')} <ArrowRight size={17} />
              </Link>
            </div>
            <ol className="visit-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>{t('Choose your appointment')}</h3>
                  <p>{t('Sign in, browse available doctors and select a suitable time slot.')}</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>{t('Check in at reception')}</h3>
                  <p>
                    {t(
                      'Bring your appointment reference. Reception will help you check in for your visit.',
                    )}{' '}
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>{t('Keep everything together')}</h3>
                  <p>
                    {t(
                      'After your consultation, view your records, prescription and bill through your account.',
                    )}{' '}
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section
            id="hospital-info"
            className="public-section hospital-information"
            aria-labelledby="hospital-title"
          >
            <div>
              <p className="public-kicker">{t('BEFORE YOU VISIT')}</p>
              <h2 id="hospital-title">{t('Hospital information')}</h2>
              {hospital ? (
                <HospitalInformation hospital={hospital} />
              ) : (
                <>
                  <p>
                    {informationPending
                      ? t('Loading hospital information…')
                      : informationError
                        ? t(
                            'Hospital information is temporarily unavailable. Please try again later.',
                          )
                        : t(
                            'This is the Smart HMS university project demonstration. A real hospital’s address, reception number, opening hours and service directory have not yet been published.',
                          )}
                  </p>
                  <p className="public-small">
                    {t(
                      'Please use synthetic information when trying the demo. This website does not provide an emergency contact service.',
                    )}{' '}
                  </p>
                </>
              )}
            </div>
            <div className="public-info-card glass-surface">
              <MapPin size={24} />
              <h3>{t('Local by design.')}</h3>
              <dl>
                <div>
                  <dt>{t('Appointment timezone')}</dt>
                  <dd>{t('Asia/Colombo · UTC+05:30')}</dd>
                </div>
                <div>
                  <dt>{t('Billing currency')}</dt>
                  <dd>{t('Sri Lankan rupee (LKR)')}</dd>
                </div>
                <div>
                  <dt>{t('Portal language')}</dt>
                  <dd>{{ en: 'English', si: 'සිංහල', ta: 'தமிழ்' }[getLanguage()]}</dd>
                </div>
              </dl>
            </div>
          </section>
          <section className="public-cta">
            <HeartPulse size={34} strokeWidth={1.4} />
            <div>
              <h2>{t('Ready for a more connected visit?')}</h2>
              <p>{t('Your patient portal is a good place to start.')}</p>
            </div>
            <Link className="button primary" to={portal}>
              {user ? t('My workspace') : t('Sign in to the portal')}
              <ArrowRight size={18} />
            </Link>
          </section>
        </main>
        <footer className="public-footer">
          <div>
            <Brand />
            <p>{t('University of Moratuwa · BIT final-year project')}</p>
          </div>
          <div className="public-footer-actions">
            <DisplayPreference />
            <Link to={portal}>
              {t('Staff & patient sign in')} <ArrowUpRight size={14} />
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
