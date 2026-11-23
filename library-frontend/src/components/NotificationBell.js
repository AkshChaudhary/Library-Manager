import { useState } from 'react';

export default function NotificationBell({ items }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bell-wrap">
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        🔔
        {items.length > 0 && <span className="bell-badge">{items.length}</span>}
      </button>

      {open && (
        <div className="bell-panel glass">
          {items.length === 0 ? (
            <p className="muted">You're all caught up.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={`bell-item ${item.level}`}>
                {item.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}