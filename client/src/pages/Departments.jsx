import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, Pager, Submit, useResource } from '../components/ui';

export default function Departments() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const {
    data,
    pending,
    error: loadError,
  } = useResource(`/admin/departments?page=${page}&limit=10`, revision);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      const result = await api('/admin/departments', {
        method: 'POST',
        body: Object.fromEntries(new FormData(form)),
      });
      setSuccess(`${result.department.name} has been added.`);
      form.reset();
      setPage(1);
      setRevision((v) => v + 1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="HOSPITAL ADMINISTRATION"
        title="Departments"
        description="Organise your hospital around the care you provide."
      />
      <div className="management-grid">
        <section className="card">
          <div className="card-header">
            <h2>Hospital departments</h2>
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
              <div className="department-list">
                {data.items.length ? (
                  data.items.map((item) => (
                    <div className="department-row" key={item._id}>
                      <span className="action-icon">
                        <Building2 size={22} />
                      </span>
                      <div>
                        <h3>{item.name}</h3>
                        <p>{item.description || 'No description added.'}</p>
                      </div>
                      <span className="role-badge">Active</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Building2 size={32} />
                    <h3>Your departments start here</h3>
                    <p>Add your first department using the form.</p>
                  </div>
                )}
              </div>
              <Pager {...data} onChange={setPage} />
            </>
          )}
        </section>
        <form className="card padded" onSubmit={submit}>
          <span className="large-icon">
            <Plus size={24} />
          </span>
          <h2>Add a department</h2>
          <p className="muted small-text">Create a department before assigning doctors to it.</p>
          <Notice>{error?.message}</Notice>
          <Notice success>{success}</Notice>
          <Field
            label="Department name"
            name="name"
            placeholder="e.g. General Medicine"
            maxLength={80}
            required
            error={error?.fields?.name}
          />
          <Field
            label="Description"
            name="description"
            as="textarea"
            rows={4}
            placeholder="A short description of the care provided"
            maxLength={500}
            error={error?.fields?.description}
          />
          <Submit busy={busy}>
            Create department <Plus size={16} />
          </Submit>
        </form>
      </div>
    </>
  );
}
