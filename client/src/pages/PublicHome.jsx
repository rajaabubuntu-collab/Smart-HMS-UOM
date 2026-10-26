import { usePublicMotion } from '../hooks/usePublicMotion';
import HospitalHeroGallery from './HospitalHeroGallery';
import HospitalAssistant from '../components/HospitalAssistant';
import { PublicHeader, PublicFooter, PatientShortcuts } from '../components/PublicSite';
import { t } from '../i18n/locale';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  Check,
  FileHeart,
  HeartPulse,
  MapPin,
  ReceiptText,
  Phone,
} from 'lucide-react';
import { useResource } from '../components/ui';
import HospitalInformation from '../components/HospitalInformation';
import { useAuth } from '../auth';
import './PublicHome.css';
import {
  HospitalDirectoryPreview,
  VisitorGuide,
  HospitalLocation,
  EmergencyInformation,
  PhotoCaption,
} from './PublicHospitalSections';

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
  const motionRef = usePublicMotion();
  const { user } = useAuth();
  const {
    data: information,
    error: informationError,
    pending: informationPending,
  } = useResource('/public/hospital');
  const { hash } = useLocation();
  useEffect(() => {
    if (!informationPending && hash)
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  }, [hash, informationPending]);
  const hospital = information?.hospital;
  const portal = user ? '/dashboard' : '/login';
  return (
    <div ref={motionRef} className="public-home hospital-landing homepage-design public-redesign">
      <a className="skip-link" href="#public-main">
        {t('Skip to content')}{' '}
      </a>
      <div className="public-container">
        <PublicHeader hospital={hospital} homepage />

        <main id="public-main">
          <section className="public-hero" aria-labelledby="home-title">
            <div className="public-hero-copy">
              <p className="public-kicker hero-hospital-name">
                <span />
                {hospital?.name || 'Smart HMS'}
              </p>
              <h1 id="home-title">
                {t('Your care.')}
                <br />
                <span>{t('A simpler journey.')}</span>
              </h1>
              <p className="public-lead">
                {t('Find your doctor, plan your visit and manage your care.')}
              </p>
              {hospital?.address && (
                <p className="hospital-hero-address">
                  <MapPin size={18} aria-hidden="true" /> {hospital.address}
                </p>
              )}
              <div className="public-actions">
                <Link
                  className="button primary"
                  to={user?.role === 'doctor' ? '/dashboard' : '/book'}
                >
                  {t('Book appointment')}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <a className="button subtle" href="#hospital-info">
                  {t('Hospital information')}
                </a>
              </div>
              <div className="hospital-hero-links">
                <Link className="hospital-hero-directory-link" to="/about">
                  {t('About our hospital')}
                </Link>
                {hospital?.phone && (
                  <a className="hospital-hero-directory-link" href={`tel:${hospital.phone}`}>
                    <Phone size={16} aria-hidden="true" /> {t('Reception')}: {hospital.phone}
                  </a>
                )}
                <Link
                  className="hospital-hero-directory-link"
                  to={user ? '/dashboard' : '/register'}
                >
                  {user ? t('Go to my workspace') : t('Create patient account')}
                  <ArrowUpRight size={17} />
                </Link>
              </div>
              {hospital?.isDemo && (
                <span className="demo-label">{t('Demonstration information')}</span>
              )}
            </div>
            <div className="public-hero-media">
              <HospitalHeroGallery />
              <Link className="hero-care-note" to="/doctors">
                <span className="hero-care-note-icon">
                  <HeartPulse size={26} aria-hidden="true" />
                </span>
                <span>
                  <strong>{t('Find a doctor')}</strong>
                  <small>{t('Explore doctors & services')}</small>
                </span>
                <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
            </div>
          </section>

          <PatientShortcuts />
          <HospitalDirectoryPreview />

          <section
            id="about-hospital"
            className="public-section hospital-about"
            aria-labelledby="about-title"
          >
            <figure className="hospital-reception-visual">
              <img
                src="/images/care-stock.webp"
                width="1600"
                height="1200"
                loading="lazy"
                alt={t('Stock photograph of a clinician holding a stethoscope')}
              />
              <PhotoCaption>{t('Healthcare stock photograph')}</PhotoCaption>
              <div className="hospital-photo-inset">
                <img
                  src="/images/lounge-stock.webp"
                  width="480"
                  height="320"
                  loading="lazy"
                  decoding="async"
                  alt={t('Stock photograph of a bright medical waiting area beside large windows')}
                />
                <span>{t('Healthcare stock photograph')}</span>
              </div>
            </figure>
            <div>
              <p className="public-kicker">{t('WELCOME TO SMART HMS')}</p>
              <h2 id="about-title">{t('Care starts with a simpler visit.')}</h2>
              <p>
                {t(
                  'Get to know your options before you arrive. Explore published doctor profiles, choose an available appointment and keep the details of your visit together.',
                )}
              </p>
              <p>
                {t(
                  'Our reception contact details and opening hours are below. For questions about a particular service or support during your visit, contact reception before travelling.',
                )}
              </p>
              <Link className="button primary" to="/doctors">
                {t('Explore doctors & services')}
                <ArrowRight size={18} />
              </Link>
            </div>
          </section>

          <section
            id="services"
            className="public-section portal-section"
            aria-labelledby="services-title"
          >
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
                <span>
                  <CalendarDays size={25} aria-hidden="true" />
                </span>
                <div>
                  <h3>{t('Choose your appointment')}</h3>
                  <p>{t('Sign in, browse available doctors and select a suitable time slot.')}</p>
                </div>
              </li>
              <li>
                <span>
                  <ClipboardCheck size={25} aria-hidden="true" />
                </span>
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
                <span>
                  <FileHeart size={25} aria-hidden="true" />
                </span>
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

          <VisitorGuide />

          <section className="public-section hospital-preparation" aria-labelledby="prepare-title">
            <div>
              <p className="public-kicker">{t('A LITTLE PREPARATION')}</p>
              <h2 id="prepare-title">{t('Arrive with confidence.')}</h2>
              <p>
                {t(
                  'Keep these essentials ready for a smoother check-in and conversation with your care team.',
                )}
              </p>
            </div>
            <ul className="hospital-checklist">
              <li>
                <Check size={20} aria-hidden="true" />
                <div>
                  <h3>{t('Your appointment details')}</h3>
                  <p>
                    {t(
                      'Bring your booking reference and check your appointment date and time in the portal.',
                    )}
                  </p>
                </div>
              </li>
              <li>
                <Check size={20} aria-hidden="true" />
                <div>
                  <h3>{t('Relevant records and medicines')}</h3>
                  <p>
                    {t(
                      'Bring any previous reports, prescriptions and a list of medicines you currently take to discuss with your doctor.',
                    )}
                  </p>
                </div>
              </li>
              <li>
                <Check size={20} aria-hidden="true" />
                <div>
                  <h3>{t('Any support you need')}</h3>
                  <p>
                    {t(
                      'Contact reception ahead of your visit to ask about access, directions or assistance for you and your companion.',
                    )}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <section
            id="patient-questions"
            className="public-section hospital-faq"
            aria-labelledby="questions-title"
          >
            <div className="public-section-heading">
              <div>
                <p className="public-kicker">{t('HERE TO HELP')}</p>
                <h2 id="questions-title">{t('Questions before your visit?')}</h2>
              </div>
              <a className="text-link" href="#hospital-info">
                {t('Contact reception')}
                <ArrowRight size={17} />
              </a>
            </div>
            {[
              [
                'How do I book an appointment?',
                'Create a patient account or sign in, choose a doctor and select an available time slot. Your booking details will appear in your patient portal.',
              ],
              [
                'Does reception being open mean every doctor is available?',
                'Reception hours and doctor schedules are different. Check the available appointment slots or contact reception to confirm a specific service.',
              ],
              [
                'Can I change or cancel my appointment?',
                'Open your appointments in the patient portal to see the reschedule or cancellation options available for your booking.',
              ],
              [
                'Where can I see my prescriptions and bills?',
                'Sign in to view your completed consultation records, prescriptions and itemised bills. Payment records show payments recorded by the hospital.',
              ],
              [
                'Will I receive email or SMS updates?',
                'You can manage email and SMS preferences in your notification settings. Delivery depends on your contact details, preferences and the hospital’s messaging service.',
              ],
            ].map(([question, answer]) => (
              <details key={question}>
                <summary>{t(question)}</summary>
                <p>{t(answer)}</p>
              </details>
            ))}
          </section>

          <HospitalLocation hospital={hospital} />
          <EmergencyInformation />

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
                        : t('Hospital information will be available soon.')}
                  </p>
                </>
              )}
            </div>
            <div className="public-info-card glass-surface">
              <p className="public-kicker">{t('PLAN YOUR VISIT')}</p>
              <MapPin size={24} />
              <h3>{t('Stay connected to your care.')}</h3>
              <p>
                {t(
                  'Find your next appointment, review your visit history and manage your notification preferences in your patient account.',
                )}
              </p>
              <Link className="button primary" to={portal}>
                {t('Open your portal')}
                <ArrowRight size={17} />
              </Link>
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
        <PublicFooter hospital={hospital} />
      </div>
      <HospitalAssistant />
    </div>
  );
}
