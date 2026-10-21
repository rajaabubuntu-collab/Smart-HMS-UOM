import { useState } from 'react';
import { t } from '../i18n/locale';
import './DoctorPortrait.css';

const portraits = [
  'doctor-usman.webp',
  'doctor-female-south-asia.webp',
  'doctor-female-clinic.webp',
];

export default function DoctorPortrait({ doctor, compact = false }) {
  const key = String(doctor._id || doctor.id || doctor.name || '');
  const index =
    Array.from(key).reduce((sum, letter) => sum + letter.codePointAt(0), 0) % portraits.length;
  return (
    <Portrait
      key={`${key}:${doctor.avatarUrl || ''}`}
      doctor={doctor}
      compact={compact}
      sample={portraits[index]}
    />
  );
}

function Portrait({ doctor, compact, sample }) {
  const [uploadedFailed, setUploadedFailed] = useState(false);
  const [sampleFailed, setSampleFailed] = useState(false);
  const uploaded = Boolean(doctor.avatarUrl) && !uploadedFailed;
  return (
    <span className={`doctor-portrait ${compact ? 'doctor-portrait-compact' : ''}`}>
      {(uploaded || !sampleFailed) && (
        <img
          src={uploaded ? doctor.avatarUrl : `/images/${sample}`}
          width="300"
          height="300"
          loading="lazy"
          alt={
            uploaded
              ? t('Profile photo of {name}', { name: doctor.name })
              : t('Illustrative clinician portrait, not the named doctor')
          }
          onError={() => (uploaded ? setUploadedFailed(true) : setSampleFailed(true))}
        />
      )}
      {!uploaded && (
        <span className="doctor-portrait-label">
          {t(sampleFailed ? 'Photo unavailable' : 'Sample photo')}
        </span>
      )}
    </span>
  );
}
