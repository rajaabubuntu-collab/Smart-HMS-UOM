import { useState } from 'react';

export function UserAvatar({ user, className = '' }) {
  const initials =
    user.name
      ?.split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  return (
    <span className={`avatar ${className}`.trim()} aria-hidden="true">
      {user.avatarUrl && <AvatarImage key={user.avatarUrl} src={user.avatarUrl} />}
      {initials}
    </span>
  );
}

function AvatarImage({ src }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (imageFailed) return null;
  return <img className="avatar-picture" src={src} alt="" onError={() => setImageFailed(true)} />;
}
