import { t } from '../i18n/locale';
export default function HospitalInformation({ hospital, headingLevel = 3 }) {
  if (!hospital) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const HoursHeading = headingLevel === 2 ? 'h3' : 'h4';
  const openEveryDay =
    hospital.hours.length === 7 && hospital.hours.every((day) => day.allDay && !day.closed);
  return (
    <div className="hospital-details">
      <Heading>{hospital.name || t('Hospital name')}</Heading>
      {hospital.isDemo && <span className="demo-label">{t('Demonstration information')}</span>}
      {hospital.description && <p className="hospital-multiline">{hospital.description}</p>}
      <dl className="hospital-contacts">
        <div>
          <dt>{t('Address')}</dt>
          <dd className="hospital-multiline">{hospital.address || t('Not provided')}</dd>
        </div>
        <div>
          <dt>{t('Reception')}</dt>
          <dd>
            {hospital.phone ? (
              <a href={`tel:${hospital.phone}`}>{hospital.phone}</a>
            ) : (
              t('Not provided')
            )}
          </dd>
        </div>
        {hospital.email && (
          <div>
            <dt>{t('Email')}</dt>
            <dd>
              <a href={`mailto:${hospital.email}`}>{hospital.email}</a>
            </dd>
          </div>
        )}
      </dl>
      <HoursHeading>{t('Reception opening hours')}</HoursHeading>
      {openEveryDay ? (
        <p className="hospital-hours-summary">{t('Reception open 24/7')}</p>
      ) : (
        <dl className="hospital-hours">
          {hospital.hours.map((h) => (
            <div key={h.day}>
              <dt>{t(h.day)}</dt>
              <dd>
                {h.closed
                  ? t('Closed')
                  : h.allDay
                    ? t('Open 24 hours')
                    : `${h.opens || '—'}–${h.closes || '—'}`}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="muted small-text">
        {t('Doctor appointments follow their published schedules.')}
      </p>
      {hospital.visitNotes && <p className="hospital-multiline">{hospital.visitNotes}</p>}
    </div>
  );
}
