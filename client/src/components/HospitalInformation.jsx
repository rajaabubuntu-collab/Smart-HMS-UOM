import { t } from '../i18n/locale';
export default function HospitalInformation({ hospital }) {
  if (!hospital) return null;
  return (
    <div className="hospital-details">
      <h3>{hospital.name || t('Hospital name')}</h3>
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
      <h4>{t('Reception opening hours')}</h4>
      <p className="muted small-text">
        {t(
          'Sri Lanka time (UTC+05:30). Doctor appointments follow their published schedules.',
        )}{' '}
      </p>
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
      {hospital.visitNotes && <p className="hospital-multiline">{hospital.visitNotes}</p>}
    </div>
  );
}
