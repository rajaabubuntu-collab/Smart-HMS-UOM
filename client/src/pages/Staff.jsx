import { useEffect, useState } from 'react';
import { UsersRound, Plus } from 'lucide-react';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, Pager, Submit, useResource } from '../components/ui';
import Modal from '../components/Modal';

export default function Staff() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const {
    data,
    pending,
    error: loadError,
  } = useResource(`/admin/staff?page=${page}&limit=10`, revision);
  const [departments, setDepartments] = useState([]);
  const [departmentError, setDepartmentError] = useState('');
  const [role, setRole] = useState('doctor');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      let items = [],
        current = 1,
        total;
      do {
        const data = await api(`/admin/departments?page=${current++}&limit=50`, {
          signal: controller.signal,
        });
        items = items.concat(data.items);
        total = data.total;
      } while (items.length < total);
      setDepartments(items);
    }
    load().catch((err) => {
      if (err.name !== 'AbortError') setDepartmentError(err.message);
    });
    return () => controller.abort();
  }, []);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setSuccess('');
    const values = Object.fromEntries(new FormData(form));
    if (role === 'doctor') {
      values.consultationFeeMinor = Math.round(Number(values.fee) * 100);
      delete values.fee;
    }
    setBusy(true);
    try {
      const result = await api('/admin/staff', { method: 'POST', body: values });
      setSuccess(`${result.user.name} can now sign in using the account details you provided.`);
      form.reset();
      setRole('doctor');
      setPage(1);
      setRevision((v) => v + 1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const e = (name) => error?.fields?.[name];
  return (
    <>
      <PageHeading
        eyebrow="HOSPITAL ADMINISTRATION"
        title="Your care team"
        description="Give your doctors and receptionists a connected workspace."
      />
      <div className="staff-grid">
        <section className="card">
          <div className="card-header">
            <h2>Staff directory</h2>
            <span className="count-badge">{data?.total ?? '—'}</span>
          </div>
          {pending ? (
            <Loading />
          ) : loadError ? (
            <div className="padded">
              <Notice>{loadError}</Notice>
            </div>
          ) : (
            <>
              <div className="staff-list">
                {data.items.length ? (
                  data.items.map((person) => (
                    <div className="staff-row" key={person.id}>
                      <div className="avatar">{person.name.charAt(0)}</div>
                      <div className="staff-person">
                        <h3>{person.name}</h3>
                        <p>{person.email}</p>
                        <small>{person.doctor?.department?.name || 'Front desk'}</small>
                      </div>
                      <div className="staff-controls">
                        <span className={`role-badge ${person.isActive ? '' : 'neutral'}`}>
                          {person.isActive ? person.role : 'Inactive'}
                        </span>
                        <button
                          type="button"
                          className="button subtle small"
                          onClick={() => setEditing(person)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <UsersRound size={32} />
                    <h3>Bring your team together</h3>
                    <p>Create the first staff account to get started.</p>
                  </div>
                )}
              </div>
              <Pager {...data} onChange={setPage} />
            </>
          )}
        </section>
        <form className="card padded staff-form" onSubmit={submit}>
          <div className="section-heading">
            <h2>Add a team member</h2>
            <Plus size={21} />
          </div>
          <p className="muted small-text">Staff accounts are created here by an administrator.</p>
          <Notice>{error?.message || departmentError}</Notice>
          <Notice success>{success}</Notice>
          <Field
            label="Role"
            name="role"
            as="select"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="doctor">Doctor</option>
            <option value="receptionist">Receptionist</option>
          </Field>
          <Field
            label="Full name"
            name="name"
            required
            maxLength={100}
            placeholder="Full name"
            error={e('name')}
          />
          <Field
            label="Email address"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            placeholder="name@hospital.lk"
            error={e('email')}
          />
          <div className="form-grid">
            <Field label="Phone number" name="phone" type="tel" maxLength={25} error={e('phone')} />
            <Field
              label="Initial password"
              name="password"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
              hint="At least 10 characters"
              error={e('password')}
            />
          </div>
          {role === 'doctor' && (
            <>
              <div className="form-divider" />
              <Field
                label="Department"
                name="department"
                as="select"
                defaultValue=""
                required
                error={e('department')}
              >
                <option value="" disabled>
                  {departments.length ? 'Select a department' : 'Create a department first'}
                </option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </Field>
              <Field
                label="Specialisation"
                name="specialization"
                required
                maxLength={100}
                placeholder="e.g. General Medicine"
                error={e('specialization')}
              />
              <div className="form-grid">
                <Field
                  label="Qualifications"
                  name="qualification"
                  maxLength={200}
                  placeholder="e.g. MBBS"
                  error={e('qualification')}
                />
                <Field
                  label="Consultation fee (LKR)"
                  name="fee"
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  defaultValue="0"
                  required
                  error={e('consultationFeeMinor')}
                />
              </div>
            </>
          )}
          <p className="small-text muted">
            Share credentials privately with the intended staff member. Use sample accounts for this
            prototype.
          </p>
          <Submit busy={busy}>
            Create staff account <Plus size={16} />
          </Submit>
        </form>
      </div>
      {editing && (
        <StaffEditor
          person={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRevision((v) => v + 1);
            setSuccess('Staff account updated.');
          }}
        />
      )}
    </>
  );
}

function StaffEditor({ person, departments, onClose, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.isActive = values.isActive === 'true';
    if (person.role === 'doctor') {
      values.consultationFeeMinor = Math.round(Number(values.fee) * 100);
      delete values.fee;
    }
    try {
      await api(`/admin/staff/${person.id}`, { method: 'PATCH', body: values });
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Edit ${person.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted small-text">
        {person.email} · {person.role}. Role and email cannot be changed here.
      </p>
      <Notice>{error?.message}</Notice>
      <form onSubmit={submit}>
        <Field
          label="Staff full name"
          name="name"
          defaultValue={person.name}
          required
          maxLength={100}
        />
        <Field label="Staff phone" name="phone" defaultValue={person.phone} maxLength={25} />
        <Field
          label="Account status"
          name="isActive"
          as="select"
          defaultValue={String(person.isActive)}
        >
          <option value="true">Active</option>
          <option value="false">Inactive — revoke all sessions</option>
        </Field>
        {person.role === 'doctor' && (
          <>
            <Field
              label="Staff department"
              name="department"
              as="select"
              defaultValue={person.doctor.department._id}
              required
            >
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </Field>
            <Field
              label="Staff specialisation"
              name="specialization"
              defaultValue={person.doctor.specialization}
              required
              maxLength={100}
            />
            <Field
              label="Staff qualifications"
              name="qualification"
              defaultValue={person.doctor.qualification}
              maxLength={200}
            />
            <Field
              label="Staff consultation fee (LKR)"
              name="fee"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              required
              defaultValue={person.doctor.consultationFeeMinor / 100}
            />
          </>
        )}
        <p className="small-text muted">
          Before deactivating a doctor, move or cancel their open appointments. Past booking details
          stay unchanged.
        </p>
        <Submit busy={busy}>Save staff changes</Submit>
      </form>
    </Modal>
  );
}
