import {
  HospitalCareGallery,
  HospitalOverview,
  HospitalVisitDetails,
} from './HospitalCareSections';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, FileHeart, MessageCircle } from 'lucide-react';
import { PublicPage, PatientShortcuts } from '../components/PublicSite';
import HospitalInformation from '../components/HospitalInformation';
import { Field, Notice, Submit } from '../components/ui';
import { PhotoCredit, EmergencyInformation } from './PublicHospitalSections';
import { api } from '../api';
import { t } from '../i18n/locale';

export function PublicAbout() {
  return (
    <PublicPage
      title={t('About us')}
      description={t('Information and support for every step of your hospital visit.')}
    >
      {({ hospital, pending, error }) => (
        <>
          <Notice>{error}</Notice>
          <section className="hospital-about hospital-about-page">
            <figure className="hospital-reception-visual">
              <img
                src="/images/waiting-stock.webp"
                width="1600"
                height="1200"
                alt={t('Stock photograph of a hospital corridor and waiting seats')}
              />
              <PhotoCredit index={1}>{t('Healthcare stock photograph')}</PhotoCredit>
            </figure>
            <div>
              <p className="public-kicker">{hospital?.name || 'Smart HMS'}</p>
              <h2>{t('Care starts with a simpler visit.')}</h2>
              {hospital?.description ? (
                <p className="hospital-multiline">{hospital.description}</p>
              ) : (
                <p>
                  {pending
                    ? t('Loading hospital information…')
                    : t(
                        'Plan your hospital visit with confidence. Explore doctor information, arrange an appointment and stay connected to your care in Sri Lanka.',
                      )}
                </p>
              )}
              <Link className="button primary" to="/doctors">
                {t('Explore doctors & services')}
                <ArrowRight size={17} />
              </Link>
            </div>
          </section>
          <HospitalOverview hospital={hospital} />
          <HospitalCareGallery />
          <HospitalVisitDetails />
          <section className="hospital-about-support">
            <h2>{t('Support throughout your visit')}</h2>
            <div className="hospital-profile-grid">
              {[
                [
                  CalendarDays,
                  'Before your appointment',
                  'Find doctor and department information, choose an available session and keep your booking details ready.',
                ],
                [
                  MessageCircle,
                  'When you arrive',
                  'Bring your appointment reference to reception. Ask the team for help with directions or your next step.',
                ],
                [
                  FileHeart,
                  'After your visit',
                  'Use your patient account to review completed consultations, prescriptions and bills.',
                ],
              ].map(([Icon, title, description]) => (
                <article className="hospital-profile-card" key={title}>
                  <Icon size={28} aria-hidden="true" />
                  <h3>{t(title)}</h3>
                  <p>{t(description)}</p>
                </article>
              ))}
            </div>
          </section>
          {hospital?.visitNotes && (
            <section className="hospital-page-callout">
              <h2>{t('Before you arrive')}</h2>
              <p className="hospital-multiline">{hospital.visitNotes}</p>
            </section>
          )}
          <PatientShortcuts />
          <div className="hospital-page-callout">
            <h2>{t('Talk to reception')}</h2>
            <p>
              {t(
                'For service information, directions or questions about your visit, our contact page is a good place to start.',
              )}
            </p>
            <Link className="button subtle" to="/contact">
              {t('Contact us')}
              <ArrowRight size={17} />
            </Link>
          </div>
        </>
      )}
    </PublicPage>
  );
}
export function PublicContact() {
  return (
    <PublicPage
      title={t('Contact us')}
      description={t('Get in touch with reception or send a general enquiry.')}
    >
      {({ hospital, pending, error }) => (
        <>
          <div className="hospital-contact-layout">
            <section className="hospital-contact-details">
              {hospital ? (
                <HospitalInformation hospital={hospital} headingLevel={2} />
              ) : (
                <p>
                  {pending
                    ? t('Loading hospital information…')
                    : error
                      ? t(
                          'Hospital information is temporarily unavailable. Please try again later.',
                        )
                      : t('Reception contact details have not yet been published.')}
                </p>
              )}
              {hospital?.address && (
                <a
                  className="text-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital.address + ', Sri Lanka')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('Explore the area on Google Maps')}
                  <ArrowRight size={17} />
                </a>
              )}
              {hospital?.address && (
                <p className="small-text muted">
                  {t(
                    'The map searches the published address. Confirm the exact hospital entrance with reception.',
                  )}
                </p>
              )}
            </section>
            <ContactForm />
          </div>
          <EmergencyInformation />
        </>
      )}
    </PublicPage>
  );
}
function ContactForm() {
  const [requestId, newRequest] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fields, setFields] = useState({}),
    [reference, setReference] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    setFields({});
    try {
      const result = await api('/public/enquiries', {
        method: 'POST',
        body: { ...values, requestId, consent: values.consent === 'on' },
      });
      setReference(result.reference);
    } catch (error) {
      setError(error.message);
      setFields(error.fields || {});
    } finally {
      setBusy(false);
    }
  }
  if (reference)
    return (
      <section className="hospital-enquiry-form">
        <Notice success>{t('Your enquiry has been received.')}</Notice>
        <h2>{t('Keep your enquiry reference')}</h2>
        <p className="hospital-enquiry-reference">{reference}</p>
        <p>
          {t(
            'Reception will use the contact details you provided to follow up. This form does not confirm an appointment.',
          )}
        </p>
        <button
          className="button subtle"
          onClick={() => {
            newRequest(crypto.randomUUID());
            setReference('');
          }}
        >
          {t('Send another enquiry')}
        </button>
      </section>
    );
  return (
    <form key={requestId} className="hospital-enquiry-form" onSubmit={submit}>
      <h2>{t('Send an enquiry')}</h2>
      <p>
        {t(
          'For general questions only. Please do not include medical reports, payment-card details or urgent requests.',
        )}
      </p>
      <Notice>{error}</Notice>
      <fieldset disabled={busy}>
        <legend className="sr-only">{t('Your enquiry')}</legend>
        <Field
          label={t('Your name')}
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
          error={fields.name}
        />
        <Field
          label={t('Email address')}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          error={fields.email}
        />
        <Field
          label={t('Phone number (optional)')}
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={30}
          error={fields.phone}
        />
        <Field
          label={t('Enquiry topic')}
          name="subject"
          as="select"
          required
          defaultValue=""
          error={fields.subject}
        >
          <option value="" disabled>
            {t('Select a topic')}
          </option>
          {[
            ['appointments', 'Appointments'],
            ['services', 'Services'],
            ['visiting', 'Visiting information'],
            ['billing', 'Billing'],
            ['other', 'Other'],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </Field>
        <Field
          label={t('Message')}
          name="message"
          as="textarea"
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          error={fields.message}
        />
        <div hidden aria-hidden="true">
          <label htmlFor="enquiry-website">Website</label>
          <input id="enquiry-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <label className="hospital-enquiry-consent">
          <input type="checkbox" name="consent" required />
          {t(
            'I agree that reception and hospital administrators may read this enquiry and use my contact details to respond.',
          )}
        </label>
        <Submit busy={busy}>{t('Send enquiry')}</Submit>
      </fieldset>
    </form>
  );
}
