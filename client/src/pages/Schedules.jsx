import { t } from '../i18n/locale';
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
        eyebrow={user.role === 'admin' ? t('HOSPITAL ADMINISTRATION') : t('DOCTOR WORKSPACE')}
        title={t('Doctor schedules')}
        description={t('Plan available sessions. All times are Sri Lanka time (UTC+05:30).')}
      >
        {user.role === 'admin' && (
          <button className="button primary" onClick={() => setCreating(true)}>
            <CalendarPlus size={18} /> {t('Add a session')}{' '}
          </button>
        )}
      </PageHeading>
      <Notice success>{success}</Notice>
      <section className="card">
        <div className="card-header">
          <h2>{date ? t('Sessions on selected date') : t('Upcoming sessions')}</h2>
          <div className="inline-filter">
            <Field
              label={t('Filter by date')}
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
                {t('Clear')}{' '}
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
                      {session.slotMinutes}
                      {t('-minute slots ·')} {session.capacity} {t('total slots ·')}{' '}
                      {session.booked} {t('open appointments')}{' '}
                    </small>
                    {!session.isActive && (
                      <p className="small-text muted">
                        {t('Closed:')} {session.closedReason}
                      </p>
                    )}
                  </div>
                  <span className={`status-pill ${session.isActive ? 'scheduled' : 'cancelled'}`}>
                    {session.isActive ? t('Open') : t('Closed')}
                  </span>
                  {user.role === 'admin' && session.isActive && (
                    <button
                      className="button subtle small"
                      onClick={() => {
                        setClosing(session);
                        setError('');
                      }}
                    >
                      {t('Close session')}{' '}
                    </button>
                  )}
                </article>
              ))}
            </div>
            {!resource.data.items.length && (
              <div className="empty-state">
                <CalendarDays size={30} />
                <h3>{t('No sessions yet')}</h3>
                <p>
                  {user.role === 'admin'
                    ? t('Add a dated session to make appointment slots available.')
                    : t('Your administrator will publish sessions here.')}
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
          title={t('Close this session?')}
          onClose={() => {
            if (!busy) setClosing(null);
          }}
        >
          <p className="muted">
            {closing.doctorName} · {dateLabel(closing.startsAt)} {t('at')}{' '}
            {timeLabel(closing.startsAt)}
          </p>
          <p className="small-text muted">
            {t(
              'This makes the session unavailable. Move or cancel any open appointments first.',
            )}{' '}
          </p>
          <Notice>{error}</Notice>
          <form onSubmit={close}>
            <Field
              label={t('Reason for closure')}
              name="reason"
              as="textarea"
              required
              maxLength={300}
            />
            <Submit busy={busy}>{t('Confirm session closure')}</Submit>
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
      title={t('Publish a doctor session')}
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
            label={t('Session date')}
            name="date"
            type="date"
            min={today()}
            max={dateAfter(180)}
            defaultValue={dateAfter(1)}
            required
            error={error?.fields?.date}
          />
          <Field
            label={t('Slot duration (minutes)')}
            name="slotMinutes"
            as="select"
            defaultValue="15"
          >
            <option value="5">{t('5 minutes')}</option>
            <option value="10">{t('10 minutes')}</option>
            <option value="15">{t('15 minutes')}</option>
            <option value="20">{t('20 minutes')}</option>
            <option value="30">{t('30 minutes')}</option>
            <option value="60">{t('60 minutes')}</option>
          </Field>
          <Field
            label={t('Start time')}
            name="startTime"
            type="time"
            defaultValue="09:00"
            required
          />
          <Field label={t('End time')} name="endTime" type="time" defaultValue="12:00" required />
        </div>
        <p className="small-text muted">
          {t(
            'Sri Lanka time. Sessions must divide evenly into slots and cannot overlap. Dates can be up to 180 days ahead.',
          )}{' '}
        </p>
        <Submit busy={busy} disabled={!doctor}>
          {t('Publish session')}{' '}
        </Submit>
      </form>
    </Modal>
  );
}
