import { t } from '../i18n/locale';
import Modal from '../components/Modal';
import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, Pager, Submit, useResource } from '../components/ui';

export default function Departments() {
  const [editing, setEditing] = useState(null);
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
        eyebrow={t('HOSPITAL ADMINISTRATION')}
        title={t('Departments')}
        description={t('Organise your hospital around the care you provide.')}
      />
      {editing && (
        <DepartmentEditor
          department={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRevision((v) => v + 1);
          }}
        />
      )}
      <div className="management-grid">
        <section className="card">
          <div className="card-header">
            <h2>{t('Hospital departments')}</h2>
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
                        <p>{item.description || t('No description added.')}</p>
                      </div>
                      <span className="role-badge">
                        {item.isActive ? t('Active') : t('Inactive')} ·{' '}
                        {item.isPublic ? t('Public') : t('Private')}
                      </span>
                      <button className="button subtle small" onClick={() => setEditing(item)}>
                        {t('Edit')}{' '}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Building2 size={32} />
                    <h3>{t('Your departments start here')}</h3>
                    <p>{t('Add your first department using the form.')}</p>
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
          <h2>{t('Add a department')}</h2>
          <p className="muted small-text">
            {t('Create a department before assigning doctors to it.')}
          </p>
          <Notice>{error?.message}</Notice>
          <Notice success>{success}</Notice>
          <Field
            label={t('Department name')}
            name="name"
            placeholder={t('e.g. General Medicine')}
            maxLength={80}
            required
            error={error?.fields?.name}
          />
          <Field
            label={t('Description')}
            name="description"
            as="textarea"
            rows={4}
            placeholder={t('A short description of the care provided')}
            maxLength={500}
            error={error?.fields?.description}
          />
          <Submit busy={busy}>
            {t('Create department')} <Plus size={16} />
          </Submit>
        </form>
      </div>
    </>
  );
}

function DepartmentEditor({ department, onClose, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  return (
    <Modal
      title={`Edit ${department.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Notice>{error?.message}</Notice>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          setBusy(true);
          setError(null);
          try {
            await api(`/admin/departments/${department._id}`, {
              method: 'PATCH',
              body: {
                ...values,
                revision: department.revision ?? 0,
                isActive: values.isActive === 'true',
                isPublic: values.isPublic === 'true',
              },
            });
            onSaved();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label={t('Department name')}
          name="name"
          defaultValue={department.name}
          required
          maxLength={80}
        />
        <Field
          label={t('Description')}
          name="description"
          as="textarea"
          defaultValue={department.description}
          maxLength={500}
        />
        <Field
          label={t('Department status')}
          name="isActive"
          as="select"
          defaultValue={String(department.isActive)}
        >
          <option value="true">{t('Active')}</option>
          <option value="false">{t('Inactive')}</option>
        </Field>
        <Field
          label={t('Public website visibility')}
          name="isPublic"
          as="select"
          defaultValue={String(Boolean(department.isPublic))}
        >
          <option value="false">{t('Private')}</option>
          <option value="true">{t('Publish approved name and description')}</option>
        </Field>
        <Field
          label={t('Reason for department change')}
          name="reason"
          required
          minLength={3}
          maxLength={300}
        />
        <p>
          {t('Reassign doctors before deactivation. Publish only hospital-approved information.')}
        </p>
        <Submit busy={busy}>{t('Save department')}</Submit>
      </form>
    </Modal>
  );
}
