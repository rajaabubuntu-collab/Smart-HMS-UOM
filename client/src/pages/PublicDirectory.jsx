import { t } from '../i18n/locale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Brand, Loading, Notice, Pager, useResource } from '../components/ui';
import { money } from '../scheduling';
export default function PublicDirectory() {
  const [page, setPage] = useState(1),
    [servicePage, setServicePage] = useState(1),
    [department, setDepartment] = useState('');
  const services = useResource(`/public/departments?page=${servicePage}`);
  const doctors = useResource(
    `/public/doctors?${new URLSearchParams({ page, ...(department ? { department } : {}) })}`,
  );
  return (
    <div className="public-home">
      <div className="public-container">
        <header className="public-header glass-surface">
          <Link to="/">
            <Brand />
          </Link>
          <Link className="button primary" to="/login">
            {t('Patient portal')}{' '}
          </Link>
        </header>
        <main className="directory-main">
          <Link to="/">{t('← Hospital website')}</Link>
          <h1>{t('Doctors & services')}</h1>
          <p>{t('Hospital-approved profiles. Sign in to check appointment availability.')}</p>
          <Notice>{services.error || doctors.error}</Notice>
          <section className="card padded">
            <h2>{t('Our departments')}</h2>
            <button
              className={`button ${!department ? 'primary' : 'subtle'}`}
              onClick={() => {
                setDepartment('');
                setPage(1);
              }}
            >
              {t('All departments')}{' '}
            </button>
            {services.pending && <Loading />}
            {services.data?.items.map((item) => (
              <article key={item._id} className="directory-service">
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <button
                  className={`button ${department === item._id ? 'primary' : 'subtle'}`}
                  onClick={() => {
                    setDepartment(item._id);
                    setPage(1);
                  }}
                >
                  {t('View doctors:')} {item.name}
                </button>
              </article>
            ))}
            {services.data && (
              <>
                <Pager {...services.data} onChange={setServicePage} />
                {!services.data.total && (
                  <p>
                    {t(
                      'Department information is awaiting publication. Contact reception for details.',
                    )}{' '}
                  </p>
                )}
              </>
            )}
          </section>
          <section>
            <h2>{t('Our doctors')}</h2>
            {doctors.pending && <Loading />}
            <div className="directory-grid">
              {doctors.data?.items.map((doctor) => (
                <article className="card padded" key={doctor._id}>
                  <h3>{doctor.name}</h3>
                  <p>
                    {doctor.department} · {doctor.specialization}
                  </p>
                  <p>{doctor.qualification}</p>
                  <p>
                    {t('Consultation fee:')} {money(doctor.consultationFeeMinor)}
                  </p>
                  <Link className="button primary" to="/book">
                    {t('Check availability')}{' '}
                  </Link>
                </article>
              ))}
            </div>
            {doctors.data && (
              <>
                {!doctors.data.total && (
                  <p>
                    {t(
                      'No published doctor profiles in this selection. Contact reception for available services.',
                    )}{' '}
                  </p>
                )}
                <Pager {...doctors.data} onChange={setPage} />
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
