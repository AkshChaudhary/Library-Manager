import { useEffect, useState } from 'react';

export default function ReservationTimer({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return <span className="timer expired">Expired</span>;

  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);

  return (
    <span className="timer">
      ⏳ {days}d {hours}h {mins}m {secs}s
    </span>
  );
}