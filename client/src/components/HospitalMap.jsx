import { t } from '../i18n/locale';
import './HospitalMap.css';

// Coordinates are the centre of the map shared by the project owner on 20 October 2026.
// The shared URL contains no named place or verified hospital entrance.
export default function HospitalMap() {
  return (
    <div className="hospital-map">
      <iframe
        title={t('Location map')}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps?ll=6.9275337,79.8827629&z=17&output=embed"
      />
      <a href="https://maps.app.goo.gl/Yj4JNrHrM6kEjLWM9" target="_blank" rel="noopener noreferrer">
        {t('Open location in Google Maps')}
      </a>
    </div>
  );
}
