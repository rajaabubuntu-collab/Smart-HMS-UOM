import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { t } from '../i18n/locale';
import { PhotoCaption } from './PublicHospitalSections';

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
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
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
  const playing = !hidden && !reduced && !paused && !hovered && !focused;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setSelected((value) => (value + 1) % photos.length), 6000);
    return () => clearInterval(timer);
  }, [playing]);
  const photo = photos[selected];
  function move(step) {
    setPaused(true);
    setSelected((value) => (value + step + photos.length) % photos.length);
  }
  return (
    <div
      className="hospital-hero-gallery"
      role="region"
      aria-label={t('Photo gallery')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="hospital-gallery-controls">
        <button type="button" onClick={() => move(-1)} aria-label={t('Previous photo')}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span>
          {selected + 1} / {photos.length}
        </span>
        <button type="button" onClick={() => move(1)} aria-label={t('Next photo')}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        {!reduced && (
          <button
            type="button"
            className="hospital-gallery-play"
            onClick={() => setPaused((value) => !value)}
            aria-label={t(paused ? 'Play slideshow' : 'Pause slideshow')}
          >
            {paused ? (
              <Play size={16} aria-hidden="true" />
            ) : (
              <Pause size={16} aria-hidden="true" />
            )}
            {t(paused ? 'Play' : 'Pause')}
          </button>
        )}
      </div>
      <figure className="hospital-gallery-photo" aria-live={playing ? 'off' : 'polite'}>
        <img
          key={photo.file}
          src={`/images/${photo.file}`}
          width="1200"
          height="900"
          fetchPriority="high"
          alt={t(photo.alt)}
        />
        <PhotoCaption index={photo.credit} />
      </figure>
    </div>
  );
}
