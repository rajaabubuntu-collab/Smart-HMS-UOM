import { t } from '../i18n/locale';
import { useState } from 'react';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, Pager, Submit, useResource } from '../components/ui';
import Modal from '../components/Modal';
export default function PatientAccounts() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [revision, refresh] = useState(0),
    [editing, setEditing] = useState(null);
  const { data, error, pending } = useResource(
    `/admin/patients?${new URLSearchParams({ page, search, status })}`,
    revision,
  );
  return (
    <>
      <PageHeading
        eyebrow={t('ACCOUNT ADMINISTRATION')}
        title={t('Patient accounts')}
        description={t(
          'Manage access while preserving visit history. Open appointments must be resolved before deactivation.',
        )}
      />
      <form
        className="card padded form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(new FormData(e.currentTarget).get('search'));
          setPage(1);
        }}
      >
        <Field label={t('Search name, email or phone')} name="search" maxLength={100} />
        <Field
          label={t('Account status')}
          name="status"
          as="select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">{t('All accounts')}</option>
          <option value="active">{t('Active')}</option>
          <option value="inactive">{t('Inactive')}</option>
        </Field>
        <button className="button primary">{t('Search patients')}</button>
      </form>
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <section className="card padded">
          <div className="staff-list">
            {data.items.map((person) => (
              <div key={person.id} className="staff-row">
                <div className="staff-person">
                  <h2>{person.name}</h2>
                  <p>{person.email}</p>
                  <small>{person.phone}</small>
                </div>
                <span className="role-badge">{person.isActive ? t('Active') : t('Inactive')}</span>
                <button className="button subtle" onClick={() => setEditing(person)}>
                  {person.isActive ? t('Deactivate') : t('Reactivate')}
                </button>
              </div>
            ))}
          </div>
          {!data.items.length && <p>{t('No patient accounts match.')}</p>}
          <Pager {...data} onChange={setPage} />
        </section>
      )}
      {editing && (
        <StatusEditor
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
function StatusEditor({ person, onClose, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  return (
    <Modal
      title={`${person.isActive ? 'Deactivate' : 'Reactivate'} ${person.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Notice>{error?.message}</Notice>
      <p>
        {t(
          'Deactivation signs out all devices. Medical records and payments remain available to authorised staff.',
        )}{' '}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const reason = new FormData(e.currentTarget).get('reason');
          setBusy(true);
          setError(null);
          try {
            await api(`/admin/patients/${person.id}/status`, {
              method: 'PATCH',
              body: { isActive: !person.isActive, expectedActive: person.isActive, reason },
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
          label={t('Reason for account status change')}
          name="reason"
          as="textarea"
          required
          minLength={3}
          maxLength={300}
          hint={t('Enter an administrative reason, without clinical details.')}
        />
        <Submit busy={busy}>{t('Confirm status change')}</Submit>
      </form>
    </Modal>
  );
}
