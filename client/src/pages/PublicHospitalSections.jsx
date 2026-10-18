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

const photoCredits = [
  {
    name: 'Sasun Bughdaryan',
    url: 'https://unsplash.com/photos/doctor-in-white-coat-with-stethoscope-RlIppR1I3E8',
    file: 'care-stock.webp',
  },
  {
    name: 'Tasha Kostyuk',
    url: 'https://unsplash.com/photos/empty-hospital-corridor-with-benches-and-doors-Pk-KuizxQv8',
    file: 'waiting-stock.webp',
  },
  {
    name: 'Zoshua Colah',
    url: 'https://unsplash.com/photos/cityscape-view-with-buildings-and-overcast-sky-TRQ04e-B-yI',
    file: 'colombo-stock.webp',
  },
  {
    name: 'Hush Naidoo Jade Photography',
    url: 'https://unsplash.com/photos/black-and-gray-stethoscope-yo01Z-9HQAw',
    file: 'consultation-stock.webp',
  },
  {
    name: 'Sixteen Miles Out',
    url: 'https://unsplash.com/photos/a-room-with-a-lot-of-windows-and-chairs-7BxQRsH3f0c',
    file: 'lounge-stock.webp',
  },
  {
    name: 'Annie Spratt',
    url: 'https://unsplash.com/photos/a-hospital-room-with-a-bed-and-medical-equipment-RfanFy_lHp8',
    file: 'room-stock.webp',
  },
];
export function PhotoCredit({ index, children }) {
  const photo = photoCredits[index];
  return (
    <figcaption>
      {children} ·{' '}
      <a href={photo.url} target="_blank" rel="noopener noreferrer">
        {photo.name} / Unsplash <ArrowUpRight size={11} aria-hidden="true" />
      </a>
    </figcaption>
  );
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
              <span className="hospital-doctor-symbol">
                <Stethoscope size={26} aria-hidden="true" />
              </span>
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
export function SriLankaVisitorGuide() {
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
        <p>{t('Useful details for patients and families in Sri Lanka.')}</p>
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
  const mapUrl = hospital?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital.address + ', Sri Lanka')}`
    : null;
  return (
    <section
      id="getting-here"
      className="public-section hospital-location"
      aria-labelledby="location-title"
    >
      <figure>
        <img
          src="/images/colombo-stock.webp"
          width="1600"
          height="1000"
          loading="lazy"
          alt={t('Street scene and skyline in Colombo, Sri Lanka')}
        />
        <PhotoCredit index={2}>
          {t('Colombo city photograph · Not the hospital location')}
        </PhotoCredit>
      </figure>
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
          {mapUrl && (
            <a className="button subtle" href={mapUrl} target="_blank" rel="noopener noreferrer">
              {t('Explore the area on Google Maps')}
              <ArrowUpRight size={17} />
            </a>
          )}
        </div>
        {mapUrl && (
          <p className="hospital-map-note">
            {t(
              'The map searches the published address. Confirm the exact hospital entrance with reception.',
            )}
          </p>
        )}
      </div>
    </section>
  );
}

export function EmergencyInformation() {
  return (
    <aside className="hospital-emergency" aria-labelledby="emergency-title">
      <HeartPulse size={32} aria-hidden="true" />
      <div>
        <p className="public-kicker">{t('EMERGENCY SUPPORT IN SRI LANKA')}</p>
        <h2 id="emergency-title">{t('1990 Suwa Seriya')}</h2>
        <p>
          {t(
            'For an emergency ambulance in Sri Lanka, call 1990 toll-free. Suwa Seriya is a free national pre-hospital emergency service, separate from this hospital.',
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

export function PhotoCredits() {
  return (
    <details className="hospital-photo-credits">
      <summary>{t('Photography & credits')}</summary>
      <p>
        {t(
          'Healthcare photographs are stock images for illustration; they do not show this hospital’s staff or facilities. The Colombo photograph shows the city, not our premises.',
        )}
      </p>
      <ul>
        {photoCredits.map((photo) => (
          <li key={photo.file}>
            <a href={photo.url} target="_blank" rel="noopener noreferrer">
              {photo.name} / Unsplash
            </a>
          </li>
        ))}
      </ul>
      <a href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer">
        {t('Free to use under the Unsplash License')}
      </a>
    </details>
  );
}
