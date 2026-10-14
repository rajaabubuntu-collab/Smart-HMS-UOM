import { t } from '../i18n/locale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, CalendarPlus, FilePenLine } from 'lucide-react';
import { api } from '../api';
import { Field, Loading, Notice, PageHeading, Submit, useResource } from '../components/ui';
import { PatientPicker } from '../components/BookingControls';
import Modal from '../components/Modal';
import { today } from '../scheduling';

export default function ReceptionPatients() {
  const [patient, setPatient] = useState(null),
    [modal, setModal] = useState(null),
    [success, setSuccess] = useState('');
  function saved(data) {
    setPatient({ id: data.profile._id, dateOfBirth: data.profile.dateOfBirth, user: data.user });
    setModal(null);
    setSuccess('Patient record saved. You can now book an appointment.');
  }
  return (
    <>
      <PageHeading
        eyebrow={t('FRONT DESK')}
        title={t('Patients & walk-ins')}
        description={t('Find an existing patient or create an account for a new arrival.')}
      >
        <button className="button primary" onClick={() => setModal({})}>
          <UserPlus size={17} /> {t('Register walk-in')}{' '}
        </button>
      </PageHeading>
      <Notice success>{success}</Notice>
      <section className="card padded">
        <h2>{t('Find the right patient')}</h2>
        <p className="muted">
          {t(
            'Check their date of birth and contact details before booking to avoid duplicate records.',
          )}{' '}
        </p>
        <PatientPicker selected={patient} onSelect={setPatient} />
        {patient && (
          <div className="form-actions">
            <Link className="button primary" to={`/book?patient=${patient.id}`}>
              <CalendarPlus size={17} /> {t('Book for')} {patient.user.name}
            </Link>
            <button className="button subtle" onClick={() => setModal({ id: patient.id })}>
              <FilePenLine size={17} /> {t('Review patient record')}{' '}
            </button>
          </div>
        )}
      </section>
      {modal && <IntakeModal patientId={modal.id} onClose={() => setModal(null)} onSaved={saved} />}
    </>
  );
}
function IntakeModal({ patientId, onClose, onSaved }) {
  const resource = useResource(patientId ? `/reception/patients/${patientId}` : null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={patientId ? t('Review patient record') : t('Register a walk-in patient')}
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {resource.pending ? (
        <Loading />
      ) : resource.error ? (
        <Notice>{resource.error}</Notice>
      ) : (
        <IntakeForm initial={resource.data} onSaved={onSaved} busy={busy} setBusy={setBusy} />
      )}
    </Modal>
  );
}
function IntakeForm({ initial, onSaved, busy, setBusy }) {
  const [error, setError] = useState(null);
  const profile = initial?.profile,
    user = initial?.user;
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const { emergencyName, emergencyPhone, relationship, allergies, ...rest } = values;
    const body = {
      ...rest,
      allergies: [
        ...new Set(
          allergies
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
      emergencyContact: { name: emergencyName, phone: emergencyPhone, relationship },
    };
    try {
      const data = await api(
        profile ? `/reception/patients/${profile._id}` : '/reception/patients',
        { method: profile ? 'PATCH' : 'POST', body },
      );
      onSaved(data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const e = (name) => error?.fields?.[name];
  return (
    <form onSubmit={submit}>
      <p className="muted small-text">
        {t(
          'Record details provided by the patient. Allergy and blood-group entries are patient-reported and require clinical confirmation.',
        )}{' '}
      </p>
      <Notice>{error?.message}</Notice>
      <div className="form-grid">
        <Field
          label={t('Patient full name')}
          name="name"
          defaultValue={user?.name || ''}
          required
          maxLength={100}
          error={e('name')}
        />
        <Field
          label={t('Patient email')}
          name="email"
          type="email"
          defaultValue={user?.email || ''}
          disabled={Boolean(user)}
          required={!user}
          maxLength={254}
          error={e('email')}
          hint={
            user
              ? t('Account email is protected.')
              : t('A unique email is required for the patient portal.')
          }
        />
        <Field
          label={t('Date of birth')}
          name="dateOfBirth"
          type="date"
          min="1900-01-01"
          max={today()}
          defaultValue={profile?.dateOfBirth || ''}
          required
          error={e('dateOfBirth')}
        />
        <Field
          label={t('Gender')}
          name="gender"
          as="select"
          defaultValue={profile?.gender || ''}
          required
        >
          <option value="" disabled>
            {t('Select an option')}{' '}
          </option>
          <option value="female">{t('Female')}</option>
          <option value="male">{t('Male')}</option>
          <option value="other">{t('Other')}</option>
          <option value="prefer-not-to-say">{t('Prefer not to say')}</option>
        </Field>
        <Field
          label={t('Patient phone')}
          name="phone"
          type="tel"
          maxLength={25}
          defaultValue={user?.phone || ''}
          error={e('phone')}
        />
        {!user && (
          <Field
            label={t('Initial password')}
            name="password"
            type="password"
            minLength={10}
            required
            autoComplete="new-password"
            hint={t('Share privately with the patient.')}
            error={e('password')}
          />
        )}
      </div>
      <Field
        label={t('Address')}
        name="address"
        as="textarea"
        rows={2}
        maxLength={300}
        defaultValue={profile?.address || ''}
      />
      <div className="form-divider" />
      <h3>{t('Patient-reported health details')}</h3>
      <div className="form-grid">
        <Field
          label={t('Reported blood group')}
          name="bloodType"
          as="select"
          defaultValue={profile?.bloodType || ''}
        >
          <option value="">{t('Not recorded')}</option>
          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </Field>
        <Field
          label={t('Reported allergies')}
          name="allergies"
          as="textarea"
          rows={3}
          defaultValue={profile?.allergies?.join('\n') || ''}
          hint={t('One per line, up to 20. An empty record does not confirm no allergies.')}
          maxLength={2000}
          error={e('allergies')}
        />
      </div>
      <div className="form-divider" />
      <h3>{t('Emergency contact')}</h3>
      <div className="form-grid">
        <Field
          label={t('Emergency contact name')}
          name="emergencyName"
          maxLength={100}
          defaultValue={profile?.emergencyContact?.name || ''}
        />
        <Field
          label={t('Emergency contact phone')}
          name="emergencyPhone"
          type="tel"
          maxLength={25}
          defaultValue={profile?.emergencyContact?.phone || ''}
          error={e('emergencyContact.phone')}
        />
        <Field
          label={t('Relationship')}
          name="relationship"
          maxLength={80}
          defaultValue={profile?.emergencyContact?.relationship || ''}
        />
      </div>
      <Submit busy={busy}>
        {profile ? t('Save patient record') : t('Create patient account')}
      </Submit>
    </form>
  );
}
