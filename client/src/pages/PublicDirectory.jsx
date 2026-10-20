import DoctorPortrait from '../components/DoctorPortrait';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Field, Loading, Notice, Pager, useResource } from '../components/ui';
import { PublicPage } from '../components/PublicSite';
import { useAuth } from '../auth';
import { money } from '../scheduling';
import { t } from '../i18n/locale';

export function PublicDoctorCard({ doctor }) {
  const { user } = useAuth();
  return (
    <article className="hospital-profile-card">
      <DoctorPortrait doctor={doctor} />
      <p className="public-kicker">{doctor.department}</p>
      <h3>{doctor.name}</h3>
      <p>{doctor.specialization}</p>
      {doctor.qualification && <p>{doctor.qualification}</p>}
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
          {t('Check availability')}
        </Link>
      </div>
    </article>
  );
}
export default function PublicDirectory() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const department = params.get('department') || '';
  const q = params.get('q') || '';
  const doctors = useResource(
    `/public/doctors?${new URLSearchParams({ page, q, ...(department ? { department } : {}) })}`,
  );
  const services = usePublicDepartments();
  function change(values) {
    setParams({ ...Object.fromEntries(params), ...values, page: '1' });
  }
  return (
    <PublicPage
      title={t('Doctors & services')}
      description={t(
        'Search by doctor name or speciality, then choose a profile to check appointment availability.',
      )}
    >
      <form
        key={q}
        className="hospital-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          change({ q: new FormData(e.currentTarget).get('doctor-search').trim() });
        }}
      >
        <Field
          label={t('Doctor name or speciality')}
          name="doctor-search"
          type="search"
          maxLength={100}
          defaultValue={q}
        />
        <Field
          label={t('Department')}
          name="public-department"
          as="select"
          value={department}
          onChange={(e) => change({ department: e.target.value })}
        >
          <option value="">{t('All departments')}</option>
          {services.data?.items.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
          {department && !services.data?.items.some((item) => item._id === department) && (
            <option value={department}>{t('Selected department')}</option>
          )}
        </Field>
        <button className="button primary" type="submit">
          {t('Search')}
        </button>
        <button
          className="button subtle"
          type="button"
          onClick={() => {
            setParams({});
          }}
        >
          {t('Clear filters')}
        </button>
      </form>
      <Notice>{doctors.error || services.error}</Notice>
      {doctors.pending && <Loading text="Loading doctors and departments…" />}
      {doctors.data && (
        <>
          <h2>{t('Our doctors')}</h2>
          <p role="status" className="muted">
            {t('{count} doctors found', { count: doctors.data.total })}
          </p>
          <div className="hospital-profile-grid">
            {doctors.data.items.map((doctor) => (
              <PublicDoctorCard key={doctor._id} doctor={doctor} />
            ))}
          </div>
          {!doctors.data.items.length && (
            <div className="hospital-empty-card">
              <h2>{t('No matching doctors')}</h2>
              <p>
                {t(
                  'Try another name or speciality, clear the filters, or contact reception for assistance.',
                )}
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

// Keep every published department selectable, including those beyond the first API page.
function usePublicDepartments() {
  const [resource, setResource] = useState({ data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const items = [];
      let page = 1;
      while (true) {
        const result = await api(`/public/departments?limit=50&page=${page++}`, {
          signal: controller.signal,
        });
        items.push(...result.items);
        if (!result.items.length || items.length >= result.total) break;
      }
      if (!controller.signal.aborted) setResource({ data: { items }, error: '' });
    }
    load().catch((error) => {
      if (error.name !== 'AbortError') setResource({ data: null, error: error.message });
    });
    return () => controller.abort();
  }, []);
  return resource;
}
