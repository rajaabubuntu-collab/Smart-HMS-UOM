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
import { Brand } from '../components/ui';
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
  const portal = user ? '/dashboard' : '/login';
  return (
    <div className="public-home">
      <a className="skip-link" href="#public-main">
        Skip to content
      </a>
      <div className="public-container">
        <header className="public-header glass-surface">
          <Link to="/" aria-label="Smart HMS home">
            <Brand />
          </Link>
          <nav aria-label="Hospital navigation">
            <a href="#services">Patient services</a>
            <a href="#your-visit">Your visit</a>
            <a href="#hospital-info">Hospital information</a>
          </nav>
          <Link className="button primary" to={portal}>
            {user ? 'My workspace' : 'Patient portal'} <ArrowUpRight size={16} />
          </Link>
        </header>

        <main id="public-main">
          <section className="public-hero" aria-labelledby="home-title">
            <div className="public-hero-copy">
              <p className="public-kicker">
                <span /> CARE, CONNECTED. IN SRI LANKA.
              </p>
              <h1 id="home-title">
                A little simpler.
                <br />A lot more <em>care.</em>
              </h1>
              <p className="public-lead">
                From your first appointment to your next step. One thoughtful space to manage your
                hospital visits.
              </p>
              <div className="public-actions">
                <Link className="button primary" to={user ? '/dashboard' : '/register'}>
                  {user ? 'Go to my workspace' : 'Create patient account'} <ArrowRight size={18} />
                </Link>
                <a className="button subtle" href="#your-visit">
                  See how it works
                </a>
              </div>
              <p className="public-assurance">
                <ShieldCheck size={16} /> Personal records. Account-protected access.
              </p>
              <span className="demo-label">University project · Demonstration website</span>
            </div>
            <div
              className="care-composition"
              aria-label="Illustration of a connected patient journey"
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
                  <small>ONE CONNECTED JOURNEY</small>
                  <strong>Your next visit</strong>
                  <span>Plan. Arrive. Follow up.</span>
                </div>
                <span className="journey-check">
                  <Check size={17} />
                </span>
              </div>
              <div className="care-float glass-surface">
                <Stethoscope size={20} />
                <span>
                  Patients & care teams
                  <br />
                  <strong>Better connected.</strong>
                </span>
              </div>
              <span className="composition-caption">Designed around the patient journey</span>
            </div>
          </section>

          <div className="local-strip" aria-label="Local information">
            <span>
              <MapPin size={18} /> Built for Sri Lanka
            </span>
            <span>
              <Clock3 size={18} /> Appointments in Sri Lanka time
            </span>
            <span>
              <ReceiptText size={18} /> Billing in LKR
            </span>
          </div>

          <section id="services" className="public-section" aria-labelledby="services-title">
            <div className="public-section-heading">
              <div>
                <p className="public-kicker">YOUR PATIENT PORTAL</p>
                <h2 id="services-title">
                  Less to organise.
                  <br />
                  More peace of mind.
                </h2>
              </div>
              <p>
                Simple tools for the details around your care.
                <br />
                Sign in to access your personal information.
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
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <Link to={!user ? '/login' : user.role === 'patient' ? link : '/dashboard'}>
                    {action}
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
              <p className="public-kicker">A CLEARER PATH</p>
              <h2 id="visit-title">
                Your visit.
                <br />
                One step at a time.
              </h2>
              <p>New to the portal? Start with an account, then choose an available appointment.</p>
              <Link className="text-link" to={portal}>
                Open your portal <ArrowRight size={17} />
              </Link>
            </div>
            <ol className="visit-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Choose your appointment</h3>
                  <p>Sign in, browse available doctors and select a suitable time slot.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Check in at reception</h3>
                  <p>
                    Bring your appointment reference. Reception will help you check in for your
                    visit.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Keep everything together</h3>
                  <p>
                    After your consultation, view your records, prescription and bill through your
                    account.
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
              <p className="public-kicker">BEFORE YOU VISIT</p>
              <h2 id="hospital-title">Hospital information</h2>
              <p>
                This is the Smart HMS university project demonstration. A real hospital’s address,
                reception number, opening hours and service directory have not yet been published.
              </p>
              <p className="public-small">
                Please use synthetic information when trying the demo. This website does not provide
                an emergency contact service.
              </p>
            </div>
            <div className="public-info-card glass-surface">
              <MapPin size={24} />
              <h3>Local by design.</h3>
              <dl>
                <div>
                  <dt>Appointment timezone</dt>
                  <dd>Asia/Colombo · UTC+05:30</dd>
                </div>
                <div>
                  <dt>Billing currency</dt>
                  <dd>Sri Lankan rupee (LKR)</dd>
                </div>
                <div>
                  <dt>Portal language</dt>
                  <dd>English</dd>
                </div>
              </dl>
            </div>
          </section>
          <section className="public-cta">
            <HeartPulse size={34} strokeWidth={1.4} />
            <div>
              <h2>Ready for a more connected visit?</h2>
              <p>Your patient portal is a good place to start.</p>
            </div>
            <Link className="button primary" to={portal}>
              {user ? 'My workspace' : 'Sign in to the portal'}
              <ArrowRight size={18} />
            </Link>
          </section>
        </main>
        <footer className="public-footer">
          <div>
            <Brand />
            <p>University of Moratuwa · BIT final-year project</p>
          </div>
          <div className="public-footer-actions">
            <DisplayPreference />
            <Link to={portal}>
              Staff & patient sign in <ArrowUpRight size={14} />
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
