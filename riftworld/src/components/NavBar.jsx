const TABS = [
  { id: 'map', label: 'Map', icon: '◎' },
  { id: 'inventory', label: 'Inventory', icon: '◇' },
  { id: 'profile', label: 'Profile', icon: '◉' },
];

export default function NavBar({ current, go }) {
  return (
    <nav className="navbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-btn ${current === t.id ? 'active' : ''}`}
          onClick={() => current !== t.id && go({ name: t.id })}
        >
          <span className="nav-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
