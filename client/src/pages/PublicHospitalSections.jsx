import HospitalMap from '../components/HospitalMap';
import DoctorPortrait from '../components/DoctorPortrait';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Languages,
  MapPin,
  Phone,
  ReceiptText,
  ShieldCheck,
  Stethoscope,
  Users,
  HeartPulse,
} from 'lucide-react';
import { useResource } from '../components/ui';
import { money } from '../scheduling';
import { t } from '../i18n/locale';

const photoCaptions = {
  6: 'Mulleriyawa Hospital, Colombo · Illustrative location',
  7: 'Colombo city view · Illustrative location',
  8: 'Clinician stock photograph · Not hospital staff',
  9: 'Clinician stock photograph · Not hospital staff',
  10: 'Clinician stock photograph · Not hospital staff',
};
export function PhotoCaption({ index, children }) {
  return <figcaption>{photoCaptions[index] ? t(photoCaptions[index]) : children}</figcaption>;
}

export function HospitalDirectoryPreview() {
  const departments = useResource('/public/departments?limit=3');
  const doctors = useResource('/public/doctors?limit=3');
  return (
    <section
      id="clinical-directory"
      className="public-section hospital-directory-preview"
      aria-labelledby="clinical-title"
    >
      <div className="public-section-heading">
        <div>
          <p className="public-kicker">{t('FIND YOUR CARE')}</p>
          <h2 id="clinical-title">{t('Doctors & departments')}</h2>
        </div>
        <Link className="text-link" to="/doctors">
          {t('View the full directory')} <ArrowRight size={18} />
        </Link>
      </div>
      <p className="hospital-section-intro">
        {t(
          'Explore hospital-approved departments and doctor profiles. Check available sessions before making your appointment.',
        )}
      </p>
      {departments.pending || doctors.pending ? (
        <p role="status">{t('Loading doctors and departments…')}</p>
      ) : null}
      {departments.error || doctors.error ? (
        <p className="hospital-directory-status" role="status">
          {t(
            'The directory is temporarily unavailable. Please contact reception for doctor and service information.',
          )}
        </p>
      ) : null}
      {departments.data?.items.length > 0 && (
        <div className="hospital-department-grid">
          {departments.data.items.map((item) => (
            <article key={item._id}>
              <Stethoscope size={25} aria-hidden="true" />
              <h3>{item.name}</h3>
              {item.description && <p>{item.description}</p>}
              <Link to={`/departments/${item._id}`}>
                {t('Explore this department')} <ArrowUpRight size={17} />
              </Link>
            </article>
          ))}
        </div>
      )}
      {doctors.data?.items.length > 0 && (
        <div className="hospital-doctor-grid">
          {doctors.data.items.map((doctor) => (
            <article key={doctor._id}>
              <DoctorPortrait doctor={doctor} compact />
              <div>
                <p className="hospital-doctor-department">{doctor.department}</p>
                <h3>
                  <Link to={`/doctors/${doctor._id}`}>{doctor.name}</Link>
                </h3>
                {doctor.specialization && <p>{doctor.specialization}</p>}
                {doctor.qualification && <p>{doctor.qualification}</p>}
                <p className="hospital-doctor-fee">
                  {t('Consultation fee:')} {money(doctor.consultationFeeMinor)}
                </p>
                <Link className="text-link" to={`/book?doctor=${doctor._id}`}>
                  {t('Check availability')} <ArrowRight size={17} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {!departments.pending &&
        !doctors.pending &&
        !departments.error &&
        !doctors.error &&
        !departments.data?.items.length &&
        !doctors.data?.items.length && (
          <div className="hospital-directory-empty">
            <span className="hospital-doctor-symbol">
              <Stethoscope size={34} aria-hidden="true" />
            </span>
            <div>
              <h3>{t('Let reception help you plan your appointment.')}</h3>
              <p>
                {t(
                  'Doctor and department profiles have not yet been published. Contact reception to confirm the service you need, clinic times and consultation fees.',
                )}
              </p>
            </div>
            <a className="button subtle" href="#hospital-info">
              {t('Contact reception')} <ArrowUpRight size={17} />
            </a>
          </div>
        )}
    </section>
  );
}

const guideItems = [
  {
    icon: CalendarDays,
    title: 'Clinic days & public holidays',
    description:
      'Confirm your clinic session before travelling, especially on Poya days and public holidays. Reception opening hours do not guarantee doctor availability.',
  },
  {
    icon: ReceiptText,
    title: 'Payments & insurance',
    description:
      'Fees and bills are shown in Sri Lankan rupees (LKR). Ask reception about accepted payment methods, insurance arrangements and any pre-authorisation needed before your visit.',
  },
  {
    icon: Languages,
    title: 'Choose your website language',
    description:
      'Browse in English, Sinhala or Tamil using the language selector. If you need language assistance during a consultation, ask reception in advance.',
  },
  {
    icon: Users,
    title: 'Family & visitor information',
    description:
      'Ask reception about accompanying a patient, visiting hours and any ward-specific guidance. Reception hours and patient visiting hours may differ.',
  },
  {
    icon: MapPin,
    title: 'Travel & accessibility',
    description:
      'Confirm the entrance and nearest landmark before setting off. Ask about parking, drop-off points, wheelchair access and other assistance you may need.',
  },
  {
    icon: ShieldCheck,
    title: 'Your records & privacy',
    description:
      'Use your own patient account to view visit records and prescriptions. Sign out on shared devices and avoid sending medical reports to the general reception email.',
  },
];
export function VisitorGuide() {
  return (
    <section
      id="visitor-guide"
      className="public-section hospital-local-guide"
      aria-labelledby="local-guide-title"
    >
      <div className="public-section-heading">
        <div>
          <p className="public-kicker">{t('PATIENTS & FAMILIES')}</p>
          <h2 id="local-guide-title">{t('A practical guide to your visit.')}</h2>
        </div>
      </div>
      <div className="hospital-guide-grid">
        {guideItems.map(({ icon: Icon, title, description }) => (
          <article key={title}>
            <Icon size={25} aria-hidden="true" />
            <h3>{t(title)}</h3>
            <p>{t(description)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HospitalLocation({ hospital }) {
  return (
    <section
      id="getting-here"
      className="public-section hospital-location"
      aria-labelledby="location-title"
    >
      <HospitalMap collapsible address={hospital?.address} />
      <div>
        <p className="public-kicker">{t('GETTING HERE')}</p>
        <h2 id="location-title">{t('Plan your journey. We’ll help with the details.')}</h2>
        {hospital?.address && (
          <p className="hospital-location-address">
            <MapPin size={21} aria-hidden="true" />
            {hospital.address}
          </p>
        )}
        <p>
          {t(
            'Allow time for your journey and check your booking before leaving. Contact reception for the exact entrance, nearby landmarks and arrival instructions.',
          )}
        </p>
        <p>
          {t(
            'Travelling from outside Colombo? Confirm the appointment and any preparation with the hospital before arranging transport or accommodation.',
          )}
        </p>
        <div className="public-actions">
          {hospital?.phone ? (
            <a className="button primary" href={`tel:${hospital.phone}`}>
              <Phone size={17} />
              {t('Call for directions')}
            </a>
          ) : (
            <a className="button primary" href="#hospital-info">
              {t('Contact reception')}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export function EmergencyInformation() {
  return (
    <aside className="hospital-emergency" aria-labelledby="emergency-title">
      <HeartPulse size={32} aria-hidden="true" />
      <div>
        <p className="public-kicker">{t('EMERGENCY SUPPORT')}</p>
        <h2 id="emergency-title">{t('1990 Suwa Seriya')}</h2>
        <p>
          {t(
            'Call 1990 toll-free for a Suwa Seriya emergency ambulance. This national service operates independently of the hospital.',
          )}
        </p>
        <a href="https://www.1990.lk/faq/" target="_blank" rel="noopener noreferrer">
          {t('Official service information')} <ArrowUpRight size={15} />
        </a>
      </div>
      <a className="button" href="tel:1990">
        <Phone size={18} />
        {t('Call 1990')}
      </a>
    </aside>
  );
}

export function HospitalContactStrip({ hospital }) {
  return (
    <div className="hospital-contact-strip" role="region" aria-label={t('Contact reception')}>
      <span>
        <MapPin size={14} aria-hidden="true" />
        {hospital?.address || t('Sri Lanka')}
      </span>
      {hospital?.phone && (
        <a href={`tel:${hospital.phone}`}>
          <Phone size={14} aria-hidden="true" />
          {t('Reception')}: {hospital.phone}
        </a>
      )}
      <a href="/#getting-here">
        {t('Getting here')} <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </div>
  );
}
