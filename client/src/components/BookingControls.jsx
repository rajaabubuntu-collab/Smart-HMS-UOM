import DoctorPortrait from './DoctorPortrait';
import { t } from '../i18n/locale';
import { useEffect, useRef, useState } from 'react';
import { Search, Stethoscope, CalendarDays, Check } from 'lucide-react';
import { api } from '../api';
import { Field, Loading, Notice, Pager, useResource } from './ui';
import { today, dateAfter, timeLabel, money } from '../scheduling';

// Shared selectors keep patient booking and receptionist rescheduling consistent.
export function DoctorPicker({ onSelect, selected, initialDepartment = '' }) {
  const [department, setDepartment] = useState(initialDepartment),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  const [departments, setDepartments] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      let items = [],
        page = 1,
        total;
      do {
        const data = await api(`/directory/departments?page=${page++}&limit=50`, {
          signal: controller.signal,
        });
        items.push(...data.items);
        total = data.total;
      } while (items.length < total);
      if (!controller.signal.aborted) setDepartments(items);
    }
    load().catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, []);
  const params = new URLSearchParams({
    page,
    limit: 6,
    search: query,
    ...(department ? { department } : {}),
  });
  const resource = useResource(`/directory/doctors?${params}`);
  return (
    <div className="doctor-picker">
      <div className="booking-filters">
        <Field
          label={t('Department')}
          name="browseDepartment"
          as="select"
          value={department}
          onChange={(event) => {
            setDepartment(event.target.value);
            setPage(1);
            onSelect(null);
          }}
        >
          <option value="">{t('All departments')}</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </Field>
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search);
            setPage(1);
            onSelect(null);
          }}
        >
          <Field
            label={t('Find a doctor')}
            name="doctorSearch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Name or specialisation')}
            maxLength={80}
          />
          <button className="button subtle" aria-label={t('Search doctors')}>
            <Search size={18} />
          </button>
        </form>
      </div>
      <Notice>{error || resource.error}</Notice>
      {resource.pending ? (
        <Loading text={t('Finding your care team…')} />
      ) : (
        resource.data && (
          <>
            <div className="doctor-options">
              {resource.data.items.map((doctor) => (
                <button
                  type="button"
                  key={doctor.id}
                  className={`doctor-option ${selected?.id === doctor.id ? 'selected' : ''}`}
                  aria-pressed={selected?.id === doctor.id}
                  onClick={() => onSelect(doctor)}
                >
                  <DoctorPortrait doctor={doctor} compact />
                  <span>
                    <strong>{doctor.name}</strong>
                    <small>
                      {doctor.specialization} · {doctor.department.name}
                    </small>
                    <span className="doctor-price">
                      {money(doctor.consultationFeeMinor)} <span>{t('consultation')}</span>
                    </span>
                  </span>
                  {selected?.id === doctor.id && <Check size={18} />}
                </button>
              ))}
            </div>
            {!resource.data.items.length && (
              <div className="empty-state">
                <Stethoscope size={28} />
                <h3>{t('No matching doctors')}</h3>
                <p>{t('Try another department or search term.')}</p>
              </div>
            )}
            <Pager
              {...resource.data}
              onChange={(page) => {
                setPage(page);
                onSelect(null);
              }}
            />
          </>
        )
      )}
    </div>
  );
}

export function SlotPicker({
  doctor,
  date,
  onDate,
  selected,
  onSelect,
  revision = 0,
  initialSlotId = '',
}) {
  const resource = useResource(
    `/directory/doctors/${doctor.id}/availability?date=${date}`,
    revision,
  );
  const applied = useRef(false);
  useEffect(() => {
    if (!initialSlotId || applied.current || resource.pending || !resource.data) return;
    applied.current = true;
    const available = resource.data.slots.find((slot) => slot.id === initialSlotId);
    if (available) onSelect(available);
  }, [initialSlotId, resource.pending, resource.data, onSelect]);
  const missingPreferred =
    initialSlotId &&
    !resource.pending &&
    resource.data &&
    !resource.data.slots.some((slot) => slot.id === initialSlotId);
  return (
    <div className="slot-picker">
      <div className="slot-heading">
        <div>
          <h3>{t('Choose an available time')}</h3>
          <p className="small-text muted">{t('All times are Sri Lanka time (UTC+05:30).')}</p>
        </div>
        <Field
          label={t('Appointment date')}
          name="appointmentDate"
          type="date"
          min={today()}
          max={dateAfter(180)}
          value={date}
          required
          onChange={(event) => {
            if (event.target.value) {
              onDate(event.target.value);
              onSelect(null);
            }
          }}
        />
      </div>
      <Notice>{resource.error}</Notice>
      {missingPreferred && (
        <Notice>
          {t('The time you chose is no longer available. Please select another time.')}
        </Notice>
      )}
      {resource.pending ? (
        <Loading text={t('Checking availability…')} />
      ) : (
        resource.data && (
          <>
            {resource.data.slots.length ? (
              <div className="slot-options">
                {resource.data.slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.id}
                    className={`slot-option ${selected?.id === slot.id ? 'selected' : ''}`}
                    aria-pressed={selected?.id === slot.id}
                    onClick={() => onSelect(slot)}
                  >
                    {timeLabel(slot.startsAt)}
                    <small>
                      {t('to')} {timeLabel(slot.endsAt)}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <CalendarDays size={27} />
                <h3>{t('No available slots on this date')}</h3>
                <p>
                  {t(
                    'Choose another date or doctor. Reception can help you find a suitable appointment.',
                  )}{' '}
                </p>
              </div>
            )}
            <p className="small-text muted">
              {t('Times remain available until someone confirms a booking.')}{' '}
            </p>
          </>
        )
      )}
    </div>
  );
}

export function PatientPicker({ selected, onSelect }) {
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  const resource = useResource(
    query ? `/reception/patients?${new URLSearchParams({ search: query, page, limit: 5 })}` : null,
  );
  return (
    <div className="patient-picker">
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
      >
        <Field
          label={t('Find a patient')}
          name="patientSearch"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          minLength={2}
          maxLength={100}
          required
          placeholder={t('Name, email or phone')}
        />
        <button className="button subtle" aria-label={t('Search patients')}>
          <Search size={18} />
        </button>
      </form>
      {selected && (
        <div className="selected-patient">
          <Check size={18} />
          <div>
            <strong>{selected.user.name}</strong>
            <small>
              {selected.user.email} {t('· Born')} {selected.dateOfBirth}
            </small>
          </div>
          <button type="button" className="button subtle small" onClick={() => onSelect(null)}>
            {t('Change')}{' '}
          </button>
        </div>
      )}
      <Notice>{resource.error}</Notice>
      {resource.pending ? (
        <Loading />
      ) : (
        resource.data && (
          <>
            <div className="patient-results">
              {resource.data.items.map((patient) => (
                <button
                  type="button"
                  className="patient-option"
                  key={patient.id}
                  onClick={() => onSelect(patient)}
                >
                  <span>
                    <strong>{patient.user.name}</strong>
                    <small>
                      {patient.user.email} · {patient.user.phone || t('No phone')} {t('· Born')}{' '}
                      {patient.dateOfBirth}
                    </small>
                  </span>
                  <span className="text-link">{t('Select')}</span>
                </button>
              ))}
            </div>
            {!resource.data.items.length && (
              <p className="muted small-text">
                {t('No matching patients. Register a walk-in patient first if they are new.')}{' '}
              </p>
            )}
            <Pager {...resource.data} onChange={setPage} />
          </>
        )
      )}
    </div>
  );
}
