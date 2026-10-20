import { useEffect, useState } from 'react';
import { t } from '../i18n/locale';
import { PhotoCredit } from './PublicHospitalSections';

const photos = [
  {
    file: 'colombo-hospital.webp',
    alt: 'Mulleriyawa Hospital in Colombo, Sri Lanka',
    credit: 6,
  },
  {
    file: 'doctor-female-south-asia.webp',
    alt: 'Stock photograph of a clinician in a medical laboratory in India',
    credit: 9,
  },
  {
    file: 'colombo-view.webp',
    alt: 'Colombo skyline photographed from Durdans Hospital',
    credit: 7,
  },
];

export default function HospitalHeroGallery() {
  const [selected, setSelected] = useState(0);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(preference.matches);
    const onVisibility = () => setHidden(document.hidden);
    preference.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      preference.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  useEffect(() => {
    if (hidden || reduced) return;
    const timer = setInterval(() => setSelected((value) => (value + 1) % photos.length), 6000);
    return () => clearInterval(timer);
  }, [hidden, reduced]);
  const photo = photos[selected];
  return (
    <div className="hospital-hero-gallery" role="region" aria-label={t('Photo gallery')}>
      <figure className="hospital-gallery-photo" aria-live="off">
        <img
          key={photo.file}
          src={`/images/${photo.file}`}
          width="1200"
          height="900"
          fetchPriority="high"
          alt={t(photo.alt)}
        />
        <PhotoCredit index={photo.credit} />
      </figure>
    </div>
  );
}
