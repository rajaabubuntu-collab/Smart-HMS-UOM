import { t } from '../i18n/locale';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarPlus, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../auth';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, Submit, useResource } from '../components/ui';
import { DoctorPicker, PatientPicker, SlotPicker } from '../components/BookingControls';
import { today, dateAfter, dateLabel, timeLabel, money } from '../scheduling';

export default function BookAppointment() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const preset = user.role !== 'patient' ? params.get('patient') : null;
  const loaded = useResource(preset ? `/reception/patients/${preset}` : null);
  const doctorId = params.get('doctor');
  const requestedDate = params.get('date') || '';
  const presetDate =
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    requestedDate >= today() &&
    requestedDate <= dateAfter(180)
      ? requestedDate
      : today();
  const selectedDoctor = useResource(
    doctorId ? `/directory/doctors/${encodeURIComponent(doctorId)}` : null,
  );
  if (selectedDoctor.pending) return <Loading />;
  if (selectedDoctor.error)
    return (
      <>
        <Notice>{selectedDoctor.error}</Notice>
        <Link className="button primary" to="/book">
          {t('Browse doctors')}{' '}
        </Link>
      </>
    );
  if (loaded.pending) return <Loading />;
  if (loaded.error) return <Notice>{loaded.error}</Notice>;
  return (
    <BookingForm
      key={`${preset || 'self'}:${doctorId || ''}:${params.get('department') || ''}:${presetDate}`}
      presetDate={presetDate}
      presetDoctor={selectedDoctor.data?.doctor || null}
      presetDepartment={
        params.get('department') || selectedDoctor.data?.doctor.department._id || ''
      }
      preset={
        loaded.data
          ? {
              id: loaded.data.profile._id,
              dateOfBirth: loaded.data.profile.dateOfBirth,
              user: loaded.data.user,
            }
          : null
      }
    />
  );
}
function BookingForm({ preset, presetDoctor, presetDepartment, presetDate }) {
  const { user } = useAuth();
  const [patient, setPatient] = useState(preset),
    [doctor, setDoctor] = useState(presetDoctor),
    [slot, setSlot] = useState(null),
    [date, setDate] = useState(presetDate);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [created, setCreated] = useState(null),
    [revision, setRevision] = useState(0);
  async function submit(event) {
    event.preventDefault();
    if (busy || !slot || (user.role !== 'patient' && !patient)) return;
    setBusy(true);
    setError('');
    const reason = new FormData(event.currentTarget).get('reason');
    try {
      const data = await api('/appointments', {
        method: 'POST',
        body: {
          slot: slot.id,
          reason,
          ...(user.role !== 'patient' ? { patient: patient.id } : {}),
        },
      });
      setCreated(data.appointment);
    } catch (err) {
      setError(err.message);
      setSlot(null);
      setRevision((r) => r + 1);
    } finally {
      setBusy(false);
    }
  }
  if (created)
    return (
      <>
        <PageHeading
          eyebrow={t('APPOINTMENT CONFIRMED')}
          title={t('You’re booked in.')}
          description={t('Your appointment is saved and visible to the care team.')}
        />
        <section className="card confirmation-card">
          <span className="confirmation-icon">
            <CheckCircle2 size={35} />
          </span>
          <p className="eyebrow">{created.reference}</p>
          <h2>{created.doctorName}</h2>
          <p className="muted">{created.departmentName}</p>
          <div className="confirmation-details">
            <strong>{dateLabel(created.startsAt)}</strong>
            <span>
              {timeLabel(created.startsAt)} – {timeLabel(created.endsAt)}{' '}
              {t('· Sri Lanka time')}{' '}
            </span>
            <span>{created.patient.name}</span>
            <span>
              {money(created.consultationFeeMinor)}{' '}
              {t('consultation fee · Payment is not collected here')}{' '}
            </span>
          </div>
          <Link className="button primary" to={`/appointments?selected=${created.id}`}>
            {t('View appointment')} <ArrowRight size={17} />
          </Link>
          <button
            type="button"
            className="button subtle"
            onClick={() => {
              setCreated(null);
              setSlot(null);
              setRevision((r) => r + 1);
            }}
          >
            {t('Book another')}{' '}
          </button>
        </section>
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow={user.role === 'patient' ? t('PATIENT WORKSPACE') : t('FRONT DESK')}
        title={t('Book an appointment')}
        description={t('Find the right doctor and a time that works for you.')}
      />
      <div className="booking-layout">
        <div>
          <section className="card padded">
            {user.role !== 'patient' && (
              <>
                <h2>{t('1. Choose the patient')}</h2>
                <PatientPicker selected={patient} onSelect={setPatient} />
                <p className="small-text muted">
                  {t('New patient?')}{' '}
                  <Link className="text-link" to="/reception/patients">
                    {t('Register a walk-in')}{' '}
                  </Link>
                </p>
                <div className="form-divider" />
              </>
            )}
            <h2>
              {user.role === 'patient' ? '1' : '2'}
              {t('. Choose your doctor')}
            </h2>
            <DoctorPicker
              initialDepartment={presetDepartment}
              selected={doctor}
              onSelect={(value) => {
                setDoctor(value);
                setSlot(null);
                setError('');
              }}
            />
          </section>
          {doctor && (
            <section className="card padded slot-card">
              <SlotPicker
                doctor={doctor}
                date={date}
                onDate={setDate}
                selected={slot}
                onSelect={setSlot}
                revision={revision}
              />
            </section>
          )}
        </div>
        <aside className="card padded booking-summary">
          <span className="large-icon">
            <CalendarPlus size={25} />
          </span>
          <h2>{t('Appointment summary')}</h2>
          <p className="muted small-text">{t('Review the details before confirming.')}</p>
          <dl className="detail-list">
            <div>
              <dt>{t('Patient')}</dt>
              <dd>
                {user.role === 'patient' ? user.name : patient?.user.name || t('Choose a patient')}
              </dd>
            </div>
            <div>
              <dt>{t('Doctor')}</dt>
              <dd>{doctor?.name || t('Choose a doctor')}</dd>
            </div>
            <div>
              <dt>{t('Department')}</dt>
              <dd>{doctor?.department.name || '—'}</dd>
            </div>
            <div>
              <dt>{t('Date')}</dt>
              <dd>{slot ? dateLabel(slot.startsAt) : t('Choose a time')}</dd>
            </div>
            <div>
              <dt>{t('Time')}</dt>
              <dd>{slot ? timeLabel(slot.startsAt) : '—'}</dd>
            </div>
            <div>
              <dt>{t('Consultation fee')}</dt>
              <dd>{doctor ? money(doctor.consultationFeeMinor) : '—'}</dd>
            </div>
          </dl>
          <Notice>{error}</Notice>
          <form onSubmit={submit}>
            <Field
              label={t('Reason for visit (optional)')}
              name="reason"
              as="textarea"
              rows={3}
              maxLength={500}
              placeholder={t('Briefly tell the care team why you’re visiting.')}
            />
            <Submit busy={busy} disabled={!slot || (user.role !== 'patient' && !patient)}>
              {busy ? t('Confirming…') : t('Confirm appointment')}
            </Submit>
          </form>
          <p className="small-text muted">
            {t(
              'A time slot is reserved only after confirmation. Fees shown are for consultation; billing comes later.',
            )}{' '}
          </p>
        </aside>
      </div>
    </>
  );
}
