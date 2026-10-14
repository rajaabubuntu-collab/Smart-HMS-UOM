import { t } from '../i18n/locale';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../auth';

export function RealtimeConnection() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let timer;
    const status = (live) => window.dispatchEvent(new CustomEvent('hms:live', { detail: live }));
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.dispatchEvent(new Event('hms:data-updated')), 250);
    };
    const socket = io({
      transports: ['websocket'],
      withCredentials: true,
      reconnectionDelayMax: 5000,
    });
    socket.on('connect', refresh);
    socket.on('data:changed', refresh);
    socket.on('realtime:availability', ({ available }) => {
      status(available);
      if (available) refresh();
    });
    socket.on('disconnect', () => status(false));
    socket.on('connect_error', () => status(false));
    const wake = () => {
      if (!document.hidden) {
        if (!socket.connected) socket.connect();
        refresh();
      }
    };
    const poll = setInterval(wake, 30000);
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      socket.disconnect();
      status(false);
    };
  }, [userId]);
  return null;
}
export function RealtimeStatus() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const change = (event) => setLive(event.detail);
    window.addEventListener('hms:live', change);
    return () => window.removeEventListener('hms:live', change);
  }, []);
  return (
    <span
      className={`live-status ${live ? 'connected' : ''}`}
      title={
        live
          ? t('Socket.IO connected; saved changes refresh automatically.')
          : t('Reconnecting; saved data refreshes every 30 seconds.')
      }
    >
      {live ? t('Live updates') : t('Periodic updates')}
    </span>
  );
}
