import { t } from '../i18n/locale';
import './DoctorPortrait.css';

const portraits = [
  'doctor-usman.webp',
  'doctor-female-south-asia.webp',
  'doctor-female-clinic.webp',
];

// Stable sample imagery only; never presented as the named clinician's actual photograph.
export default function DoctorPortrait({ doctor, compact = false }) {
  const key = String(doctor._id || doctor.id || doctor.name || '');
  const index =
    Array.from(key).reduce((sum, letter) => sum + letter.codePointAt(0), 0) % portraits.length;
  return (
    <span className={`doctor-portrait ${compact ? 'doctor-portrait-compact' : ''}`}>
      <img
        src={`/images/${portraits[index]}`}
        width="300"
        height="300"
        loading="lazy"
        alt={t('Illustrative clinician portrait, not the named doctor')}
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <span className="doctor-portrait-label">{t('Sample photo')}</span>
    </span>
  );
}
