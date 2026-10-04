import { useState } from 'react';
import { CalendarDays, CalendarPlus } from 'lucide-react';
import { useAuth } from '../auth';
import { api } from '../api';
import { DoctorPicker } from '../components/BookingControls';
import Modal from '../components/Modal';
import { Field, Loading, Notice, PageHeading, Pager, Submit, useResource } from '../components/ui';
import { today, dateAfter, dateLabel, timeLabel } from '../scheduling';

export default function Schedules() {
  const { user } = useAuth();
  const [date, setDate] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false),
    [closing, setClosing] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const resource = useResource(
    `/schedules?${new URLSearchParams({ page, limit: 10, ...(date ? { date } : {}) })}`,
    revision,
  );
  async function close(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/schedules/${closing.id}/close`, {
        method: 'POST',
        body: { reason: new FormData(event.currentTarget).get('reason') },
      });
      setClosing(null);
      setSuccess('Session closed. Existing appointment history has been retained.');
      setRevision((r) => r + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={user.role === 'admin' ? 'HOSPITAL ADMINISTRATION' : 'DOCTOR WORKSPACE'}
        title="Doctor schedules"
        description="Plan available sessions. All times are Sri Lanka time (UTC+05:30)."
      >
        {user.role === 'admin' && (
          <button className="button primary" onClick={() => setCreating(true)}>
            <CalendarPlus size={18} /> Add a session
          </button>
        )}
      </PageHeading>
      <Notice success>{success}</Notice>
      <section className="card">
        <div className="card-header">
          <h2>{date ? 'Sessions on selected date' : 'Upcoming sessions'}</h2>
          <div className="inline-filter">
            <Field
              label="Filter by date"
              name="scheduleDate"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setPage(1);
              }}
            />
            {date && (
              <button
                className="button subtle small"
                onClick={() => {
                  setDate('');
                  setPage(1);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {resource.pending ? (
          <Loading />
        ) : resource.error ? (
          <div className="padded">
            <Notice>{resource.error}</Notice>
          </div>
        ) : (
          <>
            <div className="session-list">
              {resource.data.items.map((session) => (
                <article className="session-row" key={session.id}>
                  <span className="action-icon">
                    <CalendarDays size={23} />
                  </span>
                  <div>
                    <h3>{session.doctorName}</h3>
                    <p>
                      {dateLabel(session.startsAt)} · {timeLabel(session.startsAt)} –{' '}
                      {timeLabel(session.endsAt)}
                    </p>
                    <small>
                      {session.slotMinutes}-minute slots · {session.capacity} total slots ·{' '}
                      {session.booked} open appointments
                    </small>
                    {!session.isActive && (
                      <p className="small-text muted">Closed: {session.closedReason}</p>
                    )}
                  </div>
                  <span className={`status-pill ${session.isActive ? 'scheduled' : 'cancelled'}`}>
                    {session.isActive ? 'Open' : 'Closed'}
                  </span>
                  {user.role === 'admin' && session.isActive && (
                    <button
                      className="button subtle small"
                      onClick={() => {
                        setClosing(session);
                        setError('');
                      }}
                    >
                      Close session
                    </button>
                  )}
                </article>
              ))}
            </div>
            {!resource.data.items.length && (
              <div className="empty-state">
                <CalendarDays size={30} />
                <h3>No sessions yet</h3>
                <p>
                  {user.role === 'admin'
                    ? 'Add a dated session to make appointment slots available.'
                    : 'Your administrator will publish sessions here.'}
                </p>
              </div>
            )}
            <Pager {...resource.data} onChange={setPage} />
          </>
        )}
      </section>
      {creating && (
        <CreateSession
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setPage(1);
            setDate('');
            setRevision((r) => r + 1);
            setSuccess('Session published. Patients can now book its available slots.');
          }}
        />
      )}{' '}
      {closing && (
        <Modal
          title="Close this session?"
          onClose={() => {
            if (!busy) setClosing(null);
          }}
        >
          <p className="muted">
            {closing.doctorName} · {dateLabel(closing.startsAt)} at {timeLabel(closing.startsAt)}
          </p>
          <p className="small-text muted">
            This makes the session unavailable. Move or cancel any open appointments first.
          </p>
          <Notice>{error}</Notice>
          <form onSubmit={close}>
            <Field
              label="Reason for closure"
              name="reason"
              as="textarea"
              required
              maxLength={300}
            />
            <Submit busy={busy}>Confirm session closure</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
function CreateSession({ onClose, onCreated }) {
  const [doctor, setDoctor] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/schedules', {
        method: 'POST',
        body: { ...data, doctor: doctor.id, slotMinutes: Number(data.slotMinutes) },
      });
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Publish a doctor session"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <DoctorPicker selected={doctor} onSelect={setDoctor} />
      <div className="form-divider" />
      <Notice>{error?.message}</Notice>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label="Session date"
            name="date"
            type="date"
            min={today()}
            max={dateAfter(180)}
            defaultValue={dateAfter(1)}
            required
            error={error?.fields?.date}
          />
          <Field label="Slot duration (minutes)" name="slotMinutes" as="select" defaultValue="15">
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="20">20 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </Field>
          <Field label="Start time" name="startTime" type="time" defaultValue="09:00" required />
          <Field label="End time" name="endTime" type="time" defaultValue="12:00" required />
        </div>
        <p className="small-text muted">
          Sri Lanka time. Sessions must divide evenly into slots and cannot overlap. Dates can be up
          to 180 days ahead.
        </p>
        <Submit busy={busy} disabled={!doctor}>
          Publish session
        </Submit>
      </form>
    </Modal>
  );
}
