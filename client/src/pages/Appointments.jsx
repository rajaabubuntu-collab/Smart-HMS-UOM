import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, RefreshCw, Clock, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import { DoctorPicker, SlotPicker } from '../components/BookingControls';
import { Field, Loading, Notice, PageHeading, Pager, Submit, useResource } from '../components/ui';
import { today, dateLabel, timeLabel, localDate, statusClass, money } from '../scheduling';

export default function Appointments() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(user.role === 'patient' ? '' : today()),
    [view, setView] = useState(user.role === 'patient' ? 'upcoming' : 'all'),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0),
    [action, setAction] = useState(null),
    [success, setSuccess] = useState('');
  const query = new URLSearchParams({
    page,
    limit: 10,
    view,
    ...(date ? { date } : {}),
    ...(status ? { status } : {}),
  });
  const resource = useResource(`/appointments?${query}`, revision);
  const detailId = params.get('selected');
  const details = useResource(detailId ? `/appointments/${detailId}` : null, revision);
  // The appointment list refreshes quietly, with an explicit refresh button too.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !action && !detailId) setRevision((r) => r + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [action, detailId]);
  const staff = ['admin', 'receptionist'].includes(user.role);
  function done(message) {
    setAction(null);
    setSuccess(message);
    setRevision((r) => r + 1);
  }
  function changeView(next) {
    setView(next);
    setDate('');
    setStatus('');
    setPage(1);
  }
  return (
    <>
      <PageHeading
        eyebrow={user.role === 'patient' ? 'PATIENT WORKSPACE' : 'CARE WORKSPACE'}
        title={user.role === 'patient' ? 'My appointments' : 'Appointments'}
        description="From booking to arrival. All dates and times are shown in Sri Lanka time."
      >
        {user.role !== 'doctor' && (
          <Link className="button primary" to="/book">
            <CalendarPlus size={17} /> Book an appointment
          </Link>
        )}
      </PageHeading>
      <Notice success>{success}</Notice>
      <section className="card">
        <div className="appointments-toolbar">
          <div className="tab-list" aria-label="Appointment view">
            {[
              ['upcoming', 'Upcoming'],
              ['history', 'History'],
              ['all', 'All appointments'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={view === value ? 'active' : ''}
                aria-pressed={view === value}
                onClick={() => changeView(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="button subtle small"
            aria-label="Refresh appointments"
            onClick={() => setRevision((r) => r + 1)}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="appointment-filters">
          <Field
            label="Appointment date"
            name="filterDate"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setPage(1);
            }}
          />
          <Field
            label="Status"
            name="filterStatus"
            as="select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {['Scheduled', 'Waiting', 'In Consultation', 'Completed', 'Cancelled'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Field>
          <button
            className="button subtle"
            onClick={() => {
              setDate(today());
              setView('all');
              setStatus('');
              setPage(1);
            }}
          >
            Today
          </button>
          {date && (
            <button
              className="button subtle"
              onClick={() => {
                setDate('');
                setPage(1);
              }}
            >
              Clear date
            </button>
          )}
        </div>
        {resource.pending ? (
          <Loading text="Loading appointments…" />
        ) : resource.error ? (
          <div className="padded">
            <Notice>{resource.error}</Notice>
          </div>
        ) : (
          <>
            <div className="appointments-list">
              {resource.data.items.map((item) => (
                <article className="appointment-row" key={item.id}>
                  <div className="appointment-date">
                    <CalendarDays size={20} />
                    <strong>{dateLabel(item.startsAt)}</strong>
                    <span>{timeLabel(item.startsAt)}</span>
                  </div>
                  <div className="appointment-person">
                    <span className="appointment-reference">{item.reference}</span>
                    <h3>
                      {user.role === 'patient' ? item.doctorName : item.patient?.name || 'Patient'}
                    </h3>
                    <p>
                      {user.role === 'patient'
                        ? item.departmentName
                        : `${item.doctorName} · ${item.departmentName}`}
                    </p>
                    {item.checkedInAt && (
                      <small>
                        <Clock size={12} /> Arrived {timeLabel(item.checkedInAt)}
                      </small>
                    )}
                  </div>
                  <div className="appointment-actions">
                    {user.role !== 'doctor' && item.status === 'Completed' && (
                      <Link
                        className="button subtle small"
                        to={`/billing?appointment=${item.id}&reference=${encodeURIComponent(item.reference)}`}
                      >
                        Billing
                      </Link>
                    )}
                    {user.role === 'doctor' && item.status !== 'Cancelled' && (
                      <Link className="button primary small" to={`/clinical/${item.id}`}>
                        Open clinical record
                      </Link>
                    )}
                    {user.role === 'patient' && item.status === 'Completed' && (
                      <Link className="button subtle small" to="/records">
                        Medical record
                      </Link>
                    )}
                    <span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span>
                    <div>
                      <button
                        className="button subtle small"
                        onClick={() => setParams({ selected: item.id })}
                      >
                        Details
                      </button>
                      {staff &&
                        item.status === 'Scheduled' &&
                        localDate(item.startsAt) === today() && (
                          <button
                            className="button primary small"
                            onClick={() => setAction({ type: 'check-in', item })}
                          >
                            Check in
                          </button>
                        )}
                      {staff && item.status === 'Scheduled' && (
                        <button
                          className="button subtle small"
                          onClick={() => setAction({ type: 'reschedule', item })}
                        >
                          Reschedule
                        </button>
                      )}
                      {((staff && ['Scheduled', 'Waiting'].includes(item.status)) ||
                        (user.role === 'patient' &&
                          item.status === 'Scheduled' &&
                          new Date(item.startsAt) > new Date())) && (
                        <button
                          className="button danger-text small"
                          onClick={() => setAction({ type: 'cancel', item })}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!resource.data.items.length && (
              <div className="empty-state">
                <CalendarDays size={32} />
                <h3>No appointments in this view</h3>
                <p>
                  Try a different date or status.
                  {user.role === 'patient' ? ' Your bookings will appear here.' : ''}
                </p>
              </div>
            )}
            <Pager {...resource.data} onChange={setPage} />
          </>
        )}
      </section>
      {detailId && (
        <Modal title="Appointment details" onClose={() => setParams({})}>
          {details.pending ? (
            <Loading />
          ) : details.error ? (
            <Notice>{details.error}</Notice>
          ) : (
            details.data && <AppointmentDetail item={details.data.appointment} />
          )}
        </Modal>
      )}
      {action?.type === 'reschedule' && (
        <RescheduleModal
          item={action.item}
          onClose={() => setAction(null)}
          onDone={() => done('Appointment rescheduled. The previous slot is available again.')}
        />
      )}
      {action && action.type !== 'reschedule' && (
        <AppointmentAction
          key={`${action.type}:${action.item.id}`}
          action={action}
          onClose={() => setAction(null)}
          onDone={() =>
            done(
              action.type === 'cancel'
                ? 'Appointment cancelled. Its slot is available again if it is still in the future.'
                : 'Patient checked in. The appointment is now Waiting.',
            )
          }
        />
      )}
    </>
  );
}
function AppointmentDetail({ item }) {
  return (
    <>
      <span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span>
      <p className="eyebrow detail-reference">{item.reference}</p>
      <h3>{item.doctorName}</h3>
      <p className="muted">{item.departmentName}</p>
      <dl className="detail-list">
        <div>
          <dt>Patient</dt>
          <dd>{item.patient?.name}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{dateLabel(item.startsAt)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>
            {timeLabel(item.startsAt)} – {timeLabel(item.endsAt)}
          </dd>
        </div>
        <div>
          <dt>Consultation fee</dt>
          <dd>{money(item.consultationFeeMinor)}</dd>
        </div>
      </dl>
      {item.reason && (
        <div className="detail-note">
          <strong>Reason for visit</strong>
          <p>{item.reason}</p>
        </div>
      )}
      {item.cancellationReason && (
        <div className="detail-note">
          <strong>Cancellation reason</strong>
          <p>{item.cancellationReason}</p>
        </div>
      )}
      {item.patient?.allergies && (
        <div className="allergy-note">
          <div>
            <strong>Patient-reported allergies</strong>
            <p>
              {item.patient.allergies.length
                ? item.patient.allergies.join(', ')
                : 'No allergy information recorded. Confirm with the patient.'}
            </p>
          </div>
        </div>
      )}
      <h3>Appointment history</h3>
      <ol className="appointment-history">
        {item.history.map((event, index) => (
          <li key={index}>
            <strong>{event.action}</strong>
            <small>
              {dateLabel(event.at)} · {timeLabel(event.at)}
            </small>
            {event.fromStartsAt && (
              <p>
                {dateLabel(event.fromStartsAt)} {timeLabel(event.fromStartsAt)}{' '}
                <ArrowRight size={12} /> {dateLabel(event.toStartsAt)} {timeLabel(event.toStartsAt)}
              </p>
            )}
            {event.reason && <p>{event.reason}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}
function AppointmentAction({ action, onClose, onDone }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const cancelling = action.type === 'cancel';
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/appointments/${action.item.id}/${action.type}`, {
        method: 'POST',
        body: cancelling ? { reason: new FormData(event.currentTarget).get('reason') } : {},
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={cancelling ? 'Cancel this appointment?' : 'Confirm patient arrival'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted">
        {action.item.patient?.name} · {action.item.doctorName}
        <br />
        {dateLabel(action.item.startsAt)} at {timeLabel(action.item.startsAt)}
      </p>
      <p className="small-text muted">
        {cancelling
          ? 'The appointment will remain in history and its slot will be released.'
          : 'Mark this patient as present at the hospital. Their appointment will change to Waiting.'}
      </p>
      <Notice>{error}</Notice>
      <form onSubmit={submit}>
        {cancelling && (
          <Field label="Cancellation reason" name="reason" as="textarea" required maxLength={300} />
        )}
        <Submit busy={busy}>{cancelling ? 'Confirm cancellation' : 'Confirm check-in'}</Submit>
      </form>
    </Modal>
  );
}
function RescheduleModal({ item, onClose, onDone }) {
  const [doctor, setDoctor] = useState(null),
    [date, setDate] = useState(today()),
    [slot, setSlot] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  async function submit(event) {
    event.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError('');
    try {
      await api(`/appointments/${item.id}/reschedule`, {
        method: 'POST',
        body: { slot: slot.id, reason: new FormData(event.currentTarget).get('reason') },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setSlot(null);
      setRevision((r) => r + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Move appointment to a new time"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted">
        {item.patient?.name} · Currently {dateLabel(item.startsAt)} at {timeLabel(item.startsAt)}{' '}
        with {item.doctorName}.
      </p>
      <DoctorPicker
        selected={doctor}
        onSelect={(value) => {
          setDoctor(value);
          setSlot(null);
        }}
      />
      {doctor && (
        <SlotPicker
          doctor={doctor}
          date={date}
          onDate={setDate}
          selected={slot}
          onSelect={setSlot}
          revision={revision}
        />
      )}
      <Notice>{error}</Notice>
      <form onSubmit={submit}>
        <Field
          label="Reason for rescheduling"
          name="reason"
          as="textarea"
          required
          maxLength={300}
        />
        <p className="small-text muted">
          The original booking stays in place until the new time is successfully reserved. The
          selected doctor’s current fee will apply.
        </p>
        <Submit busy={busy} disabled={!slot}>
          Confirm new appointment time
        </Submit>
      </form>
    </Modal>
  );
}
