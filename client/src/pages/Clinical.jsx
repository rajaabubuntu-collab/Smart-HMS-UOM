import { t } from '../i18n/locale';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, Pager, useResource } from '../components/ui';
import { dateLabel, timeLabel, today } from '../scheduling';

export function DoctorQueue() {
  const [revision, refresh] = useState(0);
  const [page, setPage] = useState(1);
  const { data, error, pending } = useResource(`/clinical/queue?page=${page}`, revision, true);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) refresh((v) => v + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <PageHeading
        eyebrow={t('DOCTOR WORKSPACE')}
        title={t('Consultation queue')}
        description={t(
          'Waiting order follows check-in time. Unfinished visits remain here across days.',
        )}
      >
        <button className="button subtle" onClick={() => refresh((v) => v + 1)}>
          {t('Refresh queue')}{' '}
        </button>
      </PageHeading>
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <>
          <div className="clinical-stats">
            {Object.entries(data.counts).map(([label, value]) => (
              <div className="card padded" key={label}>
                <span>
                  {t('Today ·')} {t(label)}
                </span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="card padded">
            <h2>{t('Ready for care')}</h2>
            <p className="muted">
              {t('Refreshes every 15 seconds.')}{' '}
              <Link to="/appointments">{t('View scheduled appointments')}</Link>
            </p>
            {!data.queue.length && <p>{t('No patients are waiting.')}</p>}
            {data.queue.map((a, i) => (
              <div className="clinical-queue-row" key={a.id}>
                <span className="avatar">{(data.page - 1) * data.limit + i + 1}</span>
                <div>
                  <strong>{a.name}</strong>
                  <p>
                    {a.reference} · {dateLabel(a.startsAt)} · {timeLabel(a.startsAt)}
                  </p>
                  <span>{t(a.status)}</span>
                </div>
                <Link className="button primary" to={`/clinical/${a.id}`}>
                  {a.status === 'In Consultation' ? t('Resume consultation') : t('Open patient')}
                </Link>
              </div>
            ))}
            <Pager {...data} onChange={setPage} />
          </section>
        </>
      )}
      <DoctorTimeline />
    </>
  );
}
function MedicationList({ medications, noMedicationReason }) {
  return (
    <>
      {medications.length ? (
        <ul>
          {medications.map((m, i) => (
            <li key={i}>
              <strong>{m.name}</strong> — {m.dosage}; {m.frequency}; {m.duration}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {t('No medication prescribed:')} {noMedicationReason}
        </p>
      )}
    </>
  );
}
export function MedicalHistory({ appointment }) {
  const [page, setPage] = useState(1);
  const { data, error, pending } = useResource(
    `/clinical/history?page=${page}${appointment ? `&appointment=${appointment}` : ''}`,
  );
  return (
    <section>
      <PageHeading
        eyebrow={t('HEALTH RECORDS')}
        title={appointment ? t('Previous consultations') : t('My medical records')}
        description={t(
          'Completed visits and prescription history. Reported medication lists describe what was recorded at that visit; they are not a live medication list.',
        )}
      />
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <>
          {!data.records.length && (
            <div className="card padded">{t('No completed consultations yet.')}</div>
          )}
          {data.records.map((r) => (
            <article className="card padded clinical-record" key={r._id}>
              <h2>{r.appointment.reference}</h2>
              <p className="muted">
                {r.appointment.doctorName} · {dateLabel(r.completedAt)}
              </p>
              <h3>{t('Diagnosis')}</h3>
              <p className="clinical-text">{r.diagnosis}</p>
              <h3>{t('Consultation notes')}</h3>
              <p className="clinical-text">{r.notes}</p>
              <h3>{t('Treatment plan')}</h3>
              <p className="clinical-text">{r.treatment || t('None recorded')}</p>
              <h3>{t('Reported medications at this visit')}</h3>
              <p className="clinical-text">{r.currentMedications || t('None recorded')}</p>
              <h3>{t('Latest prescription')}</h3>
              <MedicationList {...r} />
              <details>
                <summary>
                  {t('Prescription versions (')}
                  {r.prescriptions.length})
                </summary>
                {r.prescriptions.map((p, i) => (
                  <div className="prescription-version" key={i}>
                    <h4>
                      {t('Version')} {i + 1} · {dateLabel(p.at)} · {timeLabel(p.at)}
                    </h4>
                    <p>{p.reason}</p>
                    <MedicationList {...p} />
                  </div>
                ))}
              </details>
            </article>
          ))}
          <Pager {...data} onChange={setPage} />
        </>
      )}
    </section>
  );
}
const blankMedication = () => ({ name: '', dosage: '', frequency: '', duration: '' });
function ConsultationEditor({ data, reload }) {
  const { appointment, patient, consultation: record } = data;
  const completed = record?.status === 'Completed';
  const [form, setForm] = useState(() => ({
    revision: record?.revision || 0,
    notes: record?.notes || '',
    diagnosis: record?.diagnosis || '',
    treatment: record?.treatment || '',
    currentMedications: record?.currentMedications || '',
    medications:
      record?.medications.map(({ name, dosage, frequency, duration }) => ({
        name,
        dosage,
        frequency,
        duration,
      })) || [],
    noMedicationReason: record?.noMedicationReason || '',
  }));
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setMessage('');
    setConfirmComplete(false);
  }
  async function mutate(action) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body =
        action === 'start'
          ? {}
          : {
              ...(action === 'prescription'
                ? {
                    revision: form.revision,
                    medications: form.medications,
                    noMedicationReason: form.noMedicationReason,
                    reason,
                  }
                : form),
              allergiesReviewed: reviewed,
              reviewedAllergies: patient.allergies,
            };
      const result = await api(`/clinical/appointments/${appointment._id}/${action}`, {
        method: 'POST',
        body,
      });
      setDirty(false);
      setMessage(result.message);
      if (action === 'save') setForm((f) => ({ ...f, revision: result.revision }));
      else reload();
    } catch (err) {
      setError(err.message + (err.fields ? ' ' + Object.values(err.fields).join(' ') : ''));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card padded clinical-record">
        <h2>{patient.user.name}</h2>
        <p>
          {appointment.reference} · {appointment.status}
        </p>
        <div className="detail-list">
          <p>
            {t('Birth date:')} {patient.dateOfBirth} {t('· Gender:')} {patient.gender}
          </p>
          <p>
            {t('Blood group:')} {patient.bloodType || t('Not recorded')}
          </p>
          <p>
            {t('Contact:')} {patient.user.phone || t('Not recorded')} · {patient.user.email}
          </p>
          <p>
            {t('Address:')} {patient.address || t('Not recorded')}
          </p>
          <p>
            {t('Emergency contact:')} {patient.emergencyContact?.name || t('Not recorded')}{' '}
            {patient.emergencyContact?.phone}
          </p>
          <p>
            {t('Reason for visit:')} {appointment.reason || t('Not recorded')}
          </p>
        </div>
        <div className="allergy-note">
          <strong>{t('Reported allergies')}</strong>
          <p>
            {patient.allergies.length
              ? patient.allergies.join(', ')
              : t('No allergies recorded. This does not confirm there are no allergies.')}
          </p>
        </div>
        <Notice>{error}</Notice>
        <Notice success>{message}</Notice>
        {!record ? (
          <>
            <p>{t('Review the patient’s history below before starting.')}</p>
            <button
              className="button primary"
              disabled={busy || appointment.status !== 'Waiting'}
              onClick={() => mutate('start')}
            >
              {t('Start consultation')}{' '}
            </button>
            {appointment.status === 'Scheduled' && (
              <p>{t('Reception must check this patient in first.')}</p>
            )}
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutate(completed ? 'prescription' : 'save');
            }}
          >
            <fieldset disabled={busy} className="clinical-fieldset">
              <h3>{completed ? t('Completed consultation') : t('Consultation draft')}</h3>
              {['notes', 'diagnosis', 'treatment', 'currentMedications'].map((key, i) => (
                <Field
                  key={key}
                  name={key}
                  label={
                    [
                      'Consultation notes',
                      'Diagnosis',
                      'Treatment plan',
                      'Reported current medications',
                    ][i]
                  }
                  as="textarea"
                  rows={3}
                  maxLength={[5000, 1000, 2000, 2000][i]}
                  value={form[key]}
                  readOnly={completed}
                  onChange={(e) => change(key, e.target.value)}
                />
              ))}
              <h3>{completed ? t('Revise prescription') : t('Prescription')}</h3>
              <p className="muted">
                {t(
                  'Enter clinician-selected medication instructions. No automated allergy or interaction checking is provided.',
                )}{' '}
              </p>
              {form.medications.map((m, i) => (
                <fieldset className="medication-row" key={i}>
                  <legend>
                    {t('Medication')} {i + 1}
                  </legend>
                  {['name', 'dosage', 'frequency', 'duration'].map((key) => (
                    <Field
                      key={key}
                      name={`med-${i}-${key}`}
                      label={
                        key === 'name' ? t('Medication name') : key[0].toUpperCase() + key.slice(1)
                      }
                      required
                      maxLength={key === 'name' ? 120 : 100}
                      value={m[key]}
                      onChange={(e) =>
                        change(
                          'medications',
                          form.medications.map((v, n) =>
                            n === i ? { ...v, [key]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  ))}
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() =>
                      change(
                        'medications',
                        form.medications.filter((_, n) => n !== i),
                      )
                    }
                  >
                    {t('Remove medication')} {i + 1}
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className="button subtle"
                disabled={form.medications.length >= 20}
                onClick={() => change('medications', [...form.medications, blankMedication()])}
              >
                {t('Add medication')}{' '}
              </button>
              {!form.medications.length && (
                <Field
                  name="noMedicationReason"
                  label={t('Reason for no medication')}
                  maxLength={500}
                  value={form.noMedicationReason}
                  onChange={(e) => change('noMedicationReason', e.target.value)}
                />
              )}
              {form.medications.length > 0 && form.noMedicationReason && (
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => change('noMedicationReason', '')}
                >
                  {t('Clear previous no-medication reason')}{' '}
                </button>
              )}
              {completed && (
                <Field
                  name="revisionReason"
                  label={t('Reason for prescription change')}
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setDirty(true);
                  }}
                />
              )}
              <label className="clinical-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{' '}
                {t('I have reviewed the reported allergies with the patient.')}{' '}
              </label>
              <p className="muted">
                {dirty
                  ? t('Unsaved changes. Save before leaving this page.')
                  : t('No unsaved changes.')}
              </p>
              <div className="clinical-actions">
                <button className="button primary" disabled={!reviewed}>
                  {completed ? t('Save prescription revision') : t('Save draft')}
                </button>
                {!completed && (
                  <button
                    type="button"
                    className="button subtle"
                    disabled={!reviewed}
                    onClick={() => setConfirmComplete(true)}
                  >
                    {t('Complete visit')}{' '}
                  </button>
                )}
              </div>
              {confirmComplete && (
                <div className="allergy-note">
                  <p>
                    {t(
                      'Completing publishes this record to the patient and locks the consultation notes. Prescription changes remain possible with a reason.',
                    )}{' '}
                  </p>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => mutate('complete')}
                  >
                    {t('Confirm completion')}{' '}
                  </button>
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => setConfirmComplete(false)}
                  >
                    {t('Keep editing')}{' '}
                  </button>
                </div>
              )}
            </fieldset>
          </form>
        )}
      </section>
      <MedicalHistory key={record?.revision || 0} appointment={appointment._id} />
    </>
  );
}
export function ConsultationPage() {
  const { id } = useParams();
  const [revision, setRevision] = useState(0);
  const { data, error, pending } = useResource(`/clinical/appointments/${id}`, revision);
  return (
    <>
      <PageHeading
        eyebrow={t('CLINICAL WORKSPACE')}
        title={t('Patient consultation')}
        description={t('Review the patient, record the visit, and manage prescriptions.')}
      >
        <Link className="button subtle" to="/queue">
          {t('Back to queue')}{' '}
        </Link>
      </PageHeading>
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <ConsultationEditor
          key={`${id}:${revision}`}
          data={data}
          reload={() => setRevision((v) => v + 1)}
        />
      )}
    </>
  );
}

function DoctorTimeline() {
  const [date, setDate] = useState(today),
    [page, setPage] = useState(1);
  const { data, error, pending } = useResource(
    `/clinical/timeline?${new URLSearchParams({ date, page })}`,
    0,
    true,
  );
  return (
    <section className="card padded doctor-timeline">
      <h2>{t('Daily timeline')}</h2>
      <Field
        label={t('Timeline date')}
        name="timelineDate"
        type="date"
        value={date}
        required
        onChange={(e) => {
          if (e.target.value) {
            setDate(e.target.value);
            setPage(1);
          }
        }}
      />
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <>
          {!data.items.length && <p>{t('No appointments on this date.')}</p>}
          <ol className="timeline-list">
            {data.items.map((item) => (
              <li key={item.id}>
                <time dateTime={item.startsAt}>
                  {timeLabel(item.startsAt)}–{timeLabel(item.endsAt)}
                </time>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.reference} · {t(item.status)}
                  </p>
                </div>
                {item.status !== 'Cancelled' && (
                  <Link className="button subtle small" to={`/clinical/${item.id}`}>
                    {t('Open patient')}{' '}
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <Pager {...data} onChange={setPage} />
        </>
      )}
    </section>
  );
}
