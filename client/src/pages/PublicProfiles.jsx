import DoctorPortrait from '../components/DoctorPortrait';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Stethoscope } from 'lucide-react';
import { PublicPage } from '../components/PublicSite';
import { Loading, Notice, Pager, useResource } from '../components/ui';
import { PublicDoctorCard } from './PublicDirectory';
import { useAuth } from '../auth';
import { money } from '../scheduling';
import { t } from '../i18n/locale';

export function PublicDepartments() {
  const [page, setPage] = useState(1);
  const { data, error, pending } = useResource(`/public/departments?page=${page}`);
  return (
    <PublicPage
      title={t('Our departments')}
      description={t('Explore our services and find the right contact for your visit.')}
    >
      <Notice>{error}</Notice>
      {pending && <Loading text="Loading doctors and departments…" />}
      {data && (
        <>
          <div className="hospital-profile-grid">
            {data.items.map((item) => (
              <article className="hospital-profile-card" key={item._id}>
                <Stethoscope size={28} aria-hidden="true" />
                <h2>{item.name}</h2>
                <p className="hospital-multiline">{item.description}</p>
                <Link className="text-link" to={`/departments/${item._id}`}>
                  {t('Explore this department')}
                  <ArrowRight size={17} />
                </Link>
              </article>
            ))}
          </div>
          {!data.items.length && (
            <p>
              {t('Department information is awaiting publication. Contact reception for details.')}
            </p>
          )}
          <Pager {...data} onChange={setPage} />
        </>
      )}
    </PublicPage>
  );
}
export function PublicDepartment() {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const details = useResource(`/public/departments/${encodeURIComponent(id)}`);
  const doctors = useResource(
    details.data ? `/public/doctors?department=${encodeURIComponent(id)}&page=${page}` : null,
  );
  const department = details.data?.department;
  return (
    <PublicPage title={department?.name || t('Department')}>
      <Notice>{details.error || doctors.error}</Notice>
      {details.pending && <Loading text="Loading doctors and departments…" />}
      {department && (
        <>
          <div className="hospital-page-callout">
            <p className="hospital-multiline">
              {department.description ||
                t('Please contact reception for more information about this department.')}
            </p>
            <Link className="button primary" to={`/doctors?department=${department._id}`}>
              {t('Find a doctor')}
              <ArrowRight size={17} />
            </Link>
            <Link className="button subtle" to="/contact">
              {t('Contact reception')}
            </Link>
          </div>
          <h2>{t('Doctors in this department')}</h2>
          {doctors.pending && <Loading text="Loading doctors and departments…" />}
          <div className="hospital-profile-grid">
            {doctors.data?.items.map((doctor) => (
              <PublicDoctorCard key={doctor._id} doctor={doctor} />
            ))}
          </div>
          {doctors.data && (
            <>
              {!doctors.data.items.length && (
                <p>
                  {t(
                    'No published doctor profiles in this selection. Contact reception for available services.',
                  )}
                </p>
              )}
              <Pager {...doctors.data} onChange={setPage} />
            </>
          )}
        </>
      )}
      {details.error && (
        <Link className="button subtle" to="/departments">
          {t('View departments')}
        </Link>
      )}
    </PublicPage>
  );
}
export function PublicDoctorProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, pending } = useResource(`/public/doctors/${encodeURIComponent(id)}`);
  const doctor = data?.doctor;
  return (
    <PublicPage title={doctor?.name || t('Doctor profile')}>
      <Notice>{error}</Notice>
      {pending && <Loading text="Loading doctors and departments…" />}
      {doctor && (
        <div className="hospital-doctor-detail">
          <div className="hospital-profile-card">
            <DoctorPortrait doctor={doctor} />
            <h2>{t('Professional information')}</h2>
            <dl className="detail-list">
              <div>
                <dt>{t('Department')}</dt>
                <dd>
                  <Link to={`/departments/${doctor.departmentId}`}>{doctor.department}</Link>
                </dd>
              </div>
              <div>
                <dt>{t('Speciality')}</dt>
                <dd>{doctor.specialization || t('Not provided')}</dd>
              </div>
              <div>
                <dt>{t('Qualifications')}</dt>
                <dd>{doctor.qualification || t('Not provided')}</dd>
              </div>
            </dl>
          </div>
          <div className="hospital-page-callout">
            <h2>{t('Arrange your appointment')}</h2>
            <p>
              {t('Consultation fee:')} <strong>{money(doctor.consultationFeeMinor)}</strong>
            </p>
            <p>{t('Choose an available session with this doctor in your patient account.')}</p>
            <Link
              className="button primary"
              to={user?.role === 'doctor' ? '/dashboard' : `/book?doctor=${doctor._id}`}
            >
              {t('Check availability')}
              <ArrowRight size={17} />
            </Link>
            <p className="small-text">
              {t(
                'A time slot is reserved only after confirmation. Fees shown are for consultation; billing comes later.',
              )}
            </p>
          </div>
        </div>
      )}
      {error && (
        <Link className="button subtle" to="/doctors">
          {t('Browse doctors')}
        </Link>
      )}
    </PublicPage>
  );
}
