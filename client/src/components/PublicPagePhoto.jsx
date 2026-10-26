import { t } from '../i18n/locale';

const photos = {
  doctors: ['care-stock.webp', 'Stock photograph of a clinician holding a stethoscope'],
  departments: [
    'consultation-stock.webp',
    'Stock photograph of a stethoscope on an examination bed',
  ],
  contact: [
    'lounge-stock.webp',
    'Stock photograph of a bright medical waiting area beside large windows',
  ],
};

export default function PublicPagePhoto({ kind }) {
  const photo = photos[kind];
  if (!photo) return null;
  return (
    <figure className="hospital-page-photo">
      <img
        src={`/images/${photo[0]}`}
        alt={t(photo[1])}
        width="640"
        height="360"
        decoding="async"
      />
      <figcaption>{t('Healthcare stock photograph')}</figcaption>
    </figure>
  );
}
