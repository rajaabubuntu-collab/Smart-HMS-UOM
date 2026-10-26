import { BadgeCheck, CalendarDays } from 'lucide-react';
import DoctorPortrait from '../components/DoctorPortrait';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Loading, Notice, Pager, useResource } from '../components/ui';
import { PublicPage } from '../components/PublicSite';
import { useAuth } from '../auth';
import { money } from '../scheduling';
import { t } from '../i18n/locale';

export function PublicDoctorCard({ doctor }) {
  const { user } = useAuth();
  return (
    <article className="hospital-profile-card hospital-doctor-card">
      <DoctorPortrait doctor={doctor} />
      {doctor.isDemo && <span className="hospital-demo-label">{t('Demonstration profile')}</span>}
      <p className="public-kicker">{doctor.department}</p>
      <h3>{doctor.name}</h3>
      {doctor.specialization !== doctor.department && <p>{doctor.specialization}</p>}
      {doctor.qualification && (
        <p className="hospital-doctor-qualification">
          <BadgeCheck size={17} aria-hidden="true" />
          {doctor.qualification}
        </p>
      )}
      <p>
        {t('Consultation fee:')} <strong>{money(doctor.consultationFeeMinor)}</strong>
      </p>
      <div className="hospital-card-actions">
        <Link to={`/doctors/${doctor._id}`} className="text-link">
          {t('View doctor profile')}
          <ArrowRight size={16} />
        </Link>
        <Link
          className="button primary"
          to={user?.role === 'doctor' ? '/dashboard' : `/book?doctor=${doctor._id}`}
        >
          <CalendarDays size={17} aria-hidden="true" /> {t('Check availability')}
        </Link>
      </div>
    </article>
  );
}
export default function PublicDirectory() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const department = params.get('department') || '';

  const doctors = useResource(
    `/public/doctors?${new URLSearchParams({ page, limit: 12, ...(department ? { department } : {}) })}`,
  );
  return (
    <PublicPage
      title={t('Doctors & services')}
      visual="doctors"
      description={t(
        'Meet our care team. Explore their specialties, qualifications and consultation details before planning your visit.',
      )}
    >
      {department && (
        <div className="hospital-browse-context">
          <span>{t('Doctors in this department')}</span>
          <Link className="text-link" to="/doctors">
            {t('View all doctors')}
          </Link>
        </div>
      )}
      <Notice>{doctors.error}</Notice>
      {doctors.pending && <Loading text="Loading doctors and departments…" />}
      {doctors.data && (
        <>
          <div className="hospital-browse-heading">
            <div>
              <h2>{t('Our doctors')}</h2>
              <p role="status" className="muted">
                {t('{count} doctors found', { count: doctors.data.total })}
              </p>
            </div>
            <Link className="button subtle" to="/departments">
              {t('Explore our departments')} <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hospital-profile-grid">
            {doctors.data.items.map((doctor) => (
              <PublicDoctorCard key={doctor._id} doctor={doctor} />
            ))}
          </div>
          {!doctors.data.items.length && (
            <div className="hospital-empty-card">
              <h2>{t('Doctor profiles are being prepared')}</h2>
              <p>
                {t('Contact reception for help with doctors, clinic sessions and appointments.')}
              </p>
              <Link className="text-link" to="/contact">
                {t('Contact reception')}
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
          <Pager
            {...doctors.data}
            onChange={(value) => setParams({ ...Object.fromEntries(params), page: String(value) })}
          />
        </>
      )}
      <div className="hospital-page-callout">
        <h2>{t('Explore our departments')}</h2>
        <p>{t('Read department information and find the doctors associated with each service.')}</p>
        <Link className="button subtle" to="/departments">
          {t('View departments')}
          <ArrowRight size={17} />
        </Link>
      </div>
    </PublicPage>
  );
}
