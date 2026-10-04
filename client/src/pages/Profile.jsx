import { useState } from 'react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, Loading, Notice, PageHeading, Submit, useResource } from '../components/ui';

export default function Profile() {
  const { data, pending, error } = useResource('/patients/me');
  if (pending) return <Loading />;
  if (error) return <Notice>{error}</Notice>;
  return <ProfileForm initial={data} />;
}
function ProfileForm({ initial }) {
  const { setUser } = useAuth();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await api('/patients/me', {
        method: 'PATCH',
        body: {
          phone: values.phone,
          address: values.address,
          emergencyContact: {
            name: values.emergencyName,
            phone: values.emergencyPhone,
            relationship: values.relationship,
          },
        },
      });
      setUser(data.user);
      setSuccess('Your contact details have been saved.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const { profile, user } = initial;
  return (
    <>
      <PageHeading
        eyebrow="PATIENT WORKSPACE"
        title="My profile"
        description="A few details that help us take better care of you."
      />
      <div className="profile-layout">
        <form className="card padded" onSubmit={submit}>
          <div className="section-heading">
            <h2>Contact information</h2>
            <UserRound size={21} />
          </div>
          <p className="muted">Keep your phone, address and emergency contact current.</p>
          <Notice>{error?.message}</Notice>
          <Notice success>{success}</Notice>
          <div className="form-grid">
            <Field label="Full name" name="name" defaultValue={user.name} disabled />
            <Field label="Email address" name="email" defaultValue={user.email} disabled />
            <Field label="Date of birth" name="dob" defaultValue={profile.dateOfBirth} disabled />
            <Field
              label="Phone number"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={25}
              defaultValue={user.phone}
              error={error?.fields?.phone}
            />
          </div>
          <Field
            label="Address"
            name="address"
            as="textarea"
            rows={3}
            maxLength={300}
            autoComplete="street-address"
            defaultValue={profile.address}
            error={error?.fields?.address}
          />
          <div className="form-divider" />
          <h2 className="form-title">Emergency contact</h2>
          <p className="muted small-text">Someone your care team can contact if needed.</p>
          <div className="form-grid">
            <Field
              label="Contact name"
              name="emergencyName"
              maxLength={100}
              defaultValue={profile.emergencyContact?.name}
              error={error?.fields?.['emergencyContact.name']}
            />
            <Field
              label="Relationship"
              name="relationship"
              maxLength={80}
              defaultValue={profile.emergencyContact?.relationship}
              error={error?.fields?.['emergencyContact.relationship']}
            />
            <Field
              label="Contact phone"
              name="emergencyPhone"
              type="tel"
              maxLength={25}
              defaultValue={profile.emergencyContact?.phone}
              error={error?.fields?.['emergencyContact.phone']}
            />
          </div>
          <div className="form-actions">
            <Submit busy={busy}>Save changes</Submit>
            <span className="small-text muted">Updates are saved to your patient record.</span>
          </div>
        </form>
        <aside className="card padded profile-aside">
          <span className="large-icon">
            <ShieldCheck size={27} />
          </span>
          <h2>Your medical details</h2>
          <p className="muted">Clinical information is maintained by your care team.</p>
          <dl className="detail-list">
            <div>
              <dt>Blood group</dt>
              <dd>{profile.bloodType || 'Not recorded'}</dd>
            </div>
          </dl>
          <div className="allergy-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Allergy information</strong>
              <p>
                {profile.allergies.length
                  ? profile.allergies.join(', ')
                  : 'No allergy information recorded. This does not mean you have no allergies.'}
              </p>
            </div>
          </div>
          <p className="muted small-text">
            Tell your care team about allergies and any corrections to your identity details.
          </p>
        </aside>
      </div>
    </>
  );
}
