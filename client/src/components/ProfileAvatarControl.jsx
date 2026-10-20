import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { t } from '../i18n/locale';
import { UserAvatar } from './UserAvatar';

const maxAvatarBytes = 5 * 1024 * 1024;

export default function ProfileAvatarControl({ user }) {
  const inputRef = useRef(null);
  const { setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setError('');
    if (file.size > maxAvatarBytes) {
      setError(t('Choose an image smaller than 5 MB.'));
      return;
    }
    setBusy(true);
    try {
      const result = await api('/profile/avatar', { method: 'PUT', body: file });
      setUser(result.user);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="avatar-control">
      <button
        type="button"
        className="avatar-upload"
        aria-label={t('Change profile picture')}
        title={t('Change profile picture')}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <UserAvatar user={user} />
        <span className="avatar-camera" aria-hidden="true">
          <Camera size={12} />
        </span>
      </button>
      <input
        ref={inputRef}
        className="avatar-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t('Choose profile picture')}
        onChange={upload}
      />
      {error && (
        <span className="avatar-upload-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
