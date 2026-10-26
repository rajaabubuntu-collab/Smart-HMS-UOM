import { Link } from 'react-router-dom';
import {
  ArrowRight,
  MapPin,
  Phone,
  Mail,
  Accessibility,
  ReceiptText,
  ClipboardList,
  MessageCircle,
  CalendarDays,
  FileHeart,
} from 'lucide-react';
import { PhotoCaption } from './PublicHospitalSections';
import { t } from '../i18n/locale';
import './HospitalCareSections.css';

export function HospitalCareGallery() {
  const cards = [
    {
      image: 'doctor-female-south-asia.webp',
      icon: CalendarDays,
      width: 1200,
      height: 800,
      credit: 9,
      alt: 'Stock photograph of a clinician in a medical laboratory in India',
      title: 'Plan your consultation',
      text: 'Explore doctor profiles, qualifications and consultation fees. Choose an available session and keep your appointment reference ready for reception.',
      to: '/doctors',
      action: 'Find a doctor',
    },
    {
      image: 'lounge-stock.webp',
      icon: MapPin,
      width: 1200,
      height: 800,
      credit: null,
      alt: 'Stock photograph of a bright medical waiting area beside large windows',
      title: 'A little preparation, a simpler arrival',
      text: 'Check the hospital address before travelling. Contact reception for directions, appointment questions or help planning a visit with a family member.',
      to: '/contact',
      action: 'Contact reception',
    },
    {
      image: 'consultation-stock.webp',
      icon: FileHeart,
      width: 1200,
      height: 800,
      credit: null,
      alt: 'Stock photograph of a stethoscope on an examination bed',
      title: 'Stay informed about your care',
      text: 'Keep your consultation history, prescriptions and itemised bills together in your patient account. For questions about hospital services, send reception an enquiry.',
      to: '/about',
      action: 'More about your visit',
    },
  ];
  return (
    <section className="public-section hospital-care-gallery" aria-labelledby="care-gallery-title">
      <div className="public-section-heading">
        <div>
          <p className="public-kicker">{t('YOUR VISIT, WELL PREPARED')}</p>
          <h2 id="care-gallery-title">{t('Care begins before you arrive.')}</h2>
        </div>
        <p>{t('Helpful information for appointments, arrival and the next steps in your care.')}</p>
      </div>
      <div className="hospital-care-grid">
        {cards.map(({ icon: Icon, ...card }) => (
          <article className="hospital-care-card" key={card.image}>
            <figure>
              <div className="hospital-care-image">
                <img
                  src={`/images/${card.image}`}
                  width={card.width}
                  height={card.height}
                  loading="lazy"
                  decoding="async"
                  alt={t(card.alt)}
                />
              </div>
              <PhotoCaption index={card.credit}>{t('Healthcare stock photograph')}</PhotoCaption>
            </figure>
            <div className="hospital-care-copy">
              <span className="hospital-care-icon">
                <Icon size={25} aria-hidden="true" />
              </span>
              <h3>{t(card.title)}</h3>
              <p>{t(card.text)}</p>
              <Link className="text-link" to={card.to}>
                {t(card.action)}
                <ArrowRight size={17} />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HospitalOverview({ hospital }) {
  return (
    <section className="hospital-overview" aria-labelledby="hospital-overview-title">
      <div className="hospital-overview-intro">
        <p className="public-kicker">{t('GET TO KNOW US')}</p>
        <h2 id="hospital-overview-title">
          {hospital?.name
            ? t('Your visit to {name}', { name: hospital.name })
            : t('Your hospital visit')}
        </h2>
        <p>
          {hospital?.address
            ? t(
                'Located in {address}, {name} brings appointment information and your patient account together in one place.',
                { address: hospital.address, name: hospital.name },
              )
            : t('Find appointment information and access your patient account in one place.')}
        </p>
        <p>
          {t(
            'Browse the doctors and departments listed on this website, arrange your appointment and return to your account to review your visit. Reception is your contact for practical questions before you travel.',
          )}
        </p>
        <Link className="text-link" to="/departments">
          {t('Explore our departments')}
          <ArrowRight size={17} />
        </Link>
      </div>
      <aside className="hospital-overview-contact" aria-label={t('Reception contact details')}>
        <h3>{t('Reception contact details')}</h3>
        <dl>
          {hospital?.address && (
            <div>
              <dt>
                <MapPin size={18} />
                {t('Address')}
              </dt>
              <dd>{hospital.address}</dd>
            </div>
          )}
          {hospital?.phone && (
            <div>
              <dt>
                <Phone size={18} />
                {t('Reception')}
              </dt>
              <dd>
                <a href={`tel:${hospital.phone}`}>{hospital.phone}</a>
              </dd>
            </div>
          )}
          {hospital?.email && (
            <div>
              <dt>
                <Mail size={18} />
                {t('Email')}
              </dt>
              <dd>
                <a href={`mailto:${hospital.email}`}>{hospital.email}</a>
              </dd>
            </div>
          )}
        </dl>
        <Link className="button subtle" to="/contact">
          {t('Contact us')}
          <ArrowRight size={17} />
        </Link>
      </aside>
    </section>
  );
}

export function HospitalVisitDetails() {
  const items = [
    [
      ClipboardList,
      'Appointment information',
      'Your booking confirmation includes your appointment reference, doctor and session details. Check these before setting out and bring the reference with you.',
    ],
    [
      Accessibility,
      'Access & assistance',
      'If you need help with mobility, an accompanying family member or language support, contact reception before travelling to discuss the arrangements available.',
    ],
    [
      ReceiptText,
      'Fees & paperwork',
      'Consultation fees are shown on doctor profiles. Your patient account shows itemised bills and recorded payments. Ask reception about any additional charges or documents needed for your visit.',
    ],
    [
      MessageCircle,
      'Questions & follow-up',
      'Use the contact form for general enquiries and keep the reference you receive. For questions about your treatment or prescriptions, contact your care team through the hospital.',
    ],
  ];
  return (
    <section className="hospital-visit-details" aria-labelledby="visit-details-title">
      <h2 id="visit-details-title">{t('Information for patients & families')}</h2>
      <div className="hospital-visit-detail-grid">
        {items.map(([Icon, title, text]) => (
          <article key={title}>
            <span>
              <Icon size={25} aria-hidden="true" />
            </span>
            <div>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
