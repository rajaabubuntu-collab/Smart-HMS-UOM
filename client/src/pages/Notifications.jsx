import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../api';
import { Loading, Notice, PageHeading, Pager, useResource } from '../components/ui';
import { dateLabel, timeLabel } from '../scheduling';
function useNotificationRefresh() {
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((v) => v + 1);
    const timer = setInterval(() => {
      if (!document.hidden) update();
    }, 30000);
    const visible = () => {
      if (!document.hidden) update();
    };
    window.addEventListener('hms:notifications-changed', update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('hms:notifications-changed', update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return [revision, () => refresh((v) => v + 1)];
}
export function NotificationBell() {
  const [revision] = useNotificationRefresh();
  const { data, error } = useResource('/notifications/unread-count', revision);
  const count = data?.unreadCount || 0;
  return (
    <Link
      className="notification-bell icon-button"
      to="/notifications"
      aria-label={
        error
          ? 'Notifications (count unavailable)'
          : `Notifications${count ? ` (${count} unread)` : ''}`
      }
      title={
        error ? 'Notification count unavailable. Open notifications to retry.' : 'Notifications'
      }
    >
      <Bell size={20} />
      {error ? (
        <span className="notification-count">!</span>
      ) : (
        count > 0 && <span className="notification-count">{count > 99 ? '99+' : count}</span>
      )}
    </Link>
  );
}
export default function Notifications() {
  const [revision, refresh] = useNotificationRefresh();
  const [filter, setFilter] = useState('all'),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  const {
    data,
    error: loadError,
    pending,
  } = useResource(`/notifications?page=${page}&filter=${filter}`, revision);
  async function change(notification, read, open = false) {
    setBusy(true);
    setError('');
    try {
      await api(`/notifications/${notification._id}`, { method: 'PATCH', body: { read } });
      if (filter === 'unread') setPage(1);
      window.dispatchEvent(new Event('hms:notifications-changed'));
      if (open) navigate(notification.path);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function readAll() {
    setBusy(true);
    setError('');
    try {
      await api('/notifications/read-all', { method: 'POST', body: { through: data.asOf } });
      setPage(1);
      window.dispatchEvent(new Event('hms:notifications-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR UPDATES"
        title="Notifications"
        description="Appointment reminders, care updates and billing activity. In-app updates refresh every 30 seconds while this page is visible."
      >
        <button className="button subtle" disabled={busy} onClick={refresh}>
          Refresh notifications
        </button>
      </PageHeading>
      <Notice>{error || loadError}</Notice>
      <div className="notification-toolbar">
        <div className="clinical-actions">
          {['all', 'unread'].map((value) => (
            <button
              className={`button ${filter === value ? 'primary' : 'subtle'}`}
              key={value}
              aria-pressed={filter === value}
              disabled={busy}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
            >
              {value === 'all' ? 'All notifications' : 'Unread only'}
            </button>
          ))}
        </div>
        <button className="button subtle" disabled={busy || !data?.unreadCount} onClick={readAll}>
          Mark all as read
        </button>
      </div>
      {pending && <Loading />}
      {data && (
        <>
          <p className="muted">
            {data.unreadCount} unread {data.unreadCount === 1 ? 'notification' : 'notifications'}
          </p>
          {!data.records.length && (
            <section className="card padded">
              <h2>{filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</h2>
              <p>Updates will appear here as your appointments and bills change.</p>
            </section>
          )}
          {data.records.map((n) => (
            <article
              className={`card padded notification-row ${n.readAt ? '' : 'notification-unread'}`}
              key={n._id}
            >
              <div>
                <span className="eyebrow">
                  {n.type} · {n.readAt ? 'Read' : 'Unread'}
                </span>
                <h2>{n.title}</h2>
                <p>{n.message}</p>
                <time className="muted" dateTime={n.createdAt}>
                  {dateLabel(n.createdAt)} · {timeLabel(n.createdAt)}
                </time>
              </div>
              <div className="clinical-actions">
                <button
                  className="button primary small"
                  disabled={busy}
                  onClick={() => change(n, true, true)}
                >
                  View details
                </button>
                <button
                  className="button subtle small"
                  disabled={busy}
                  onClick={() => change(n, !n.readAt)}
                >
                  {n.readAt ? 'Mark unread' : 'Mark read'}
                </button>
              </div>
            </article>
          ))}
          <Pager {...data} onChange={setPage} />
        </>
      )}
      <p className="muted notification-footnote">
        Notifications are a history of updates. Open the linked record for its current status.
        Reminders are delivered here while the server is running; email and SMS delivery are not
        enabled.
      </p>
    </>
  );
}
