import NotificationBell from './NotificationBell';
import { TAB_LABELS } from '../config';

export default function Navbar({
  tabs,
  active,
  onChange,
  role,
  onRoleChange,
  theme,
  onToggleTheme,
  notifications,
}) {
  return (
    <header className="navbar glass">
      <div className="navbar-inner">
        <div className="brand">📚 LibraryHub</div>

        <nav className="nav-links" aria-label="Main">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`nav-link ${active === tab ? 'active' : ''}`}
              onClick={() => onChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>

        <div className="nav-tools">
          <select
            className="role-select"
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            aria-label="Switch role"
          >
            <option value="member">Member view</option>
            <option value="librarian">Librarian view</option>
          </select>

          <NotificationBell items={notifications} />

          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}