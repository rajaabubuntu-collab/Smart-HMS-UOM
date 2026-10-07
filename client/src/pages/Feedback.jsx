import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { api } from '../api';
import Modal from '../components/Modal';
import { Field, Loading, Notice, PageHeading, Pager, Submit, useResource } from '../components/ui';
import { dateLabel, timeLabel } from '../scheduling';

function Rating({ value }) {
  return (
    <span className="feedback-rating">
      <span aria-hidden="true">
        {'★'.repeat(value)}
        {'☆'.repeat(5 - value)}
      </span>
      <strong>{value} / 5</strong>
    </span>
  );
}
function VisitInfo({ visit }) {
  return (
    <>
      <span className="eyebrow">{visit.reference || visit.appointmentReference}</span>
      <h2>{visit.doctorName}</h2>
      <p className="muted">
        {visit.departmentName} · {dateLabel(visit.startsAt || visit.visitAt)} ·{' '}
        {timeLabel(visit.startsAt || visit.visitAt)}
      </p>
    </>
  );
}
export function PatientFeedback() {
  const [params] = useSearchParams();
  const appointment = params.get('appointment');
  const [page, setPage] = useState(1),
    [revision, refresh] = useState(0);
  const [selected, select] = useState(null),
    [success, setSuccess] = useState('');
  const query = new URLSearchParams({ page, ...(appointment ? { appointment } : {}) });
  const { data, error, pending } = useResource(`/feedback/visits?${query}`, revision);
  return (
    <>
      <PageHeading
        eyebrow="YOUR EXPERIENCE"
        title="My feedback"
        description="Tell us about your completed visits. Your feedback is visible to you and hospital administrators."
      >
        <button className="button subtle" onClick={() => refresh((v) => v + 1)}>
          Refresh feedback
        </button>
      </PageHeading>
      <section className="card padded feedback-intro">
        <Star size={24} aria-hidden="true" />
        <div>
          <h2>Help improve the next visit</h2>
          <p>
            Choose a rating from 1 to 5 stars and add an optional comment. One submission per
            completed visit; submitted feedback cannot be edited. Avoid sharing medical details. For
            care or urgent help, contact the hospital directly.
          </p>
        </div>
      </section>
      {appointment && (
        <Link className="text-link" to="/feedback" onClick={() => setPage(1)}>
          Show all completed visits
        </Link>
      )}
      <Notice success>{success}</Notice>
      <Notice>{error}</Notice>
      {pending && <Loading text="Loading completed visits…" />}
      {data && (
        <>
          {!data.records.length && (
            <section className="card padded">
              <h2>No completed visits found</h2>
              <p>Feedback becomes available when your doctor completes the consultation.</p>
              <Link className="button subtle" to="/appointments">
                View appointments
              </Link>
            </section>
          )}
          <div className="feedback-list">
            {data.records.map((visit) => (
              <article className="card padded feedback-card" key={visit.id}>
                <VisitInfo visit={visit} />
                {visit.feedback ? (
                  <>
                    <Rating value={visit.feedback.rating} />
                    <p className="feedback-comment">
                      {visit.feedback.comment || 'No comment added.'}
                    </p>
                    <p className="muted small-text">
                      Submitted {dateLabel(visit.feedback.createdAt)} ·{' '}
                      {timeLabel(visit.feedback.createdAt)}
                    </p>
                  </>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => {
                      select(visit);
                      setSuccess('');
                    }}
                  >
                    Leave feedback
                  </button>
                )}
              </article>
            ))}
          </div>
          <Pager {...data} onChange={setPage} />
        </>
      )}
      {selected && (
        <FeedbackForm
          visit={selected}
          onClose={() => select(null)}
          onSaved={() => {
            select(null);
            setSuccess('Thank you. Your feedback has been submitted.');
            refresh((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
function FeedbackForm({ visit, onClose, onSaved }) {
  const [rating, setRating] = useState(''),
    [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fields, setFields] = useState({});
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      await api('/feedback', {
        method: 'POST',
        body: { appointment: visit.id, rating: Number(rating), comment },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Rate your visit"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        <strong>{visit.doctorName}</strong> · {visit.reference}
      </p>
      <form onSubmit={submit}>
        <Notice>{error}</Notice>
        <fieldset disabled={busy} className="feedback-stars" aria-describedby="rating-help">
          <legend>Overall experience (required)</legend>
          <div>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className={Number(rating) === value ? 'selected' : ''}>
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={Number(rating) === value}
                  onChange={() => setRating(String(value))}
                  required
                  aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                />
                <span aria-hidden="true">{value} ★</span>
              </label>
            ))}
          </div>
          <small id="rating-help">1 = Very poor · 5 = Excellent</small>
          {fields.rating && <small className="field-error">{fields.rating}</small>}
        </fieldset>
        <Field
          label="Comment (optional)"
          name="comment"
          as="textarea"
          rows={4}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={busy}
          error={fields.comment}
          hint={`${comment.length}/2000 characters. Please avoid medical or contact details.`}
        />
        <p className="muted small-text">
          Your rating and comment will be shared with hospital administrators. Please review before
          submitting; feedback cannot be edited.
        </p>
        <div className="clinical-actions">
          <Submit busy={busy}>Submit feedback</Submit>
          <button className="button subtle" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function AdminFeedback() {
  const [draft, setDraft] = useState(''),
    [q, setQuery] = useState(''),
    [rating, setRating] = useState('');
  const [page, setPage] = useState(1),
    [revision, refresh] = useState(0);
  const query = new URLSearchParams({ page, q, ...(rating ? { rating } : {}) });
  const { data, error, pending } = useResource(`/admin/feedback?${query}`, revision);
  return (
    <>
      <PageHeading
        eyebrow="SERVICE QUALITY"
        title="Patient feedback"
        description="Ratings and comments from completed visits. This inbox is read-only; it is not an urgent care channel."
      >
        <button className="button subtle" onClick={() => refresh((v) => v + 1)}>
          Refresh feedback
        </button>
      </PageHeading>
      <form
        className="card padded feedback-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
          setPage(1);
        }}
      >
        <Field
          label="Search feedback"
          name="q"
          type="search"
          maxLength={100}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          hint="Patient, doctor, department, appointment reference or comment"
        />
        <Field
          label="Star rating"
          name="ratingFilter"
          as="select"
          value={rating}
          onChange={(e) => {
            setRating(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'star' : 'stars'}
            </option>
          ))}
        </Field>
        <button className="button primary" type="submit">
          Search
        </button>
        <button
          className="button subtle"
          type="button"
          onClick={() => {
            setDraft('');
            setQuery('');
            setRating('');
            setPage(1);
          }}
        >
          Clear filters
        </button>
      </form>
      <Notice>{error}</Notice>
      {pending && <Loading text="Loading patient feedback…" />}
      {data && (
        <>
          <p className="muted">
            {data.total} {data.total === 1 ? 'submission' : 'submissions'}
            {q ? ` matching “${q}”` : ''}
            {rating ? ` · ${rating} stars` : ''}
          </p>
          {!data.records.length && (
            <section className="card padded">
              <h2>No feedback found</h2>
              <p>Submitted feedback appears here. Try clearing the filters if none match.</p>
            </section>
          )}
          <div className="feedback-list">
            {data.records.map((record) => (
              <article className="card padded feedback-card" key={record._id}>
                <VisitInfo visit={record} />
                <p>
                  <strong>Patient:</strong> {record.patientName}
                </p>
                <Rating value={record.rating} />
                <p className="feedback-comment">{record.comment || 'No comment added.'}</p>
                <p className="muted small-text">
                  Submitted {dateLabel(record.createdAt)} · {timeLabel(record.createdAt)}
                </p>
              </article>
            ))}
          </div>
          <Pager {...data} onChange={setPage} />
        </>
      )}
    </>
  );
}
