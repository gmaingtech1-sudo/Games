import { FACTIONS, NEUTRAL_COLOR, PORTALS } from '../game/data.js';
import { levelInfo, missionsAt } from '../game/progress.js';
import { FactionBadge, XpBar } from '../components/Bits.jsx';

// Lines between portals, drawn as glowing rift paths.
const LINKS = [
  ['halo', 'azure'], ['halo', 'violet'], ['halo', 'verdant'],
  ['azure', 'echo'], ['verdant', 'echo'], ['verdant', 'singularity'], ['violet', 'singularity'],
];

const portalColor = (p) => (p.faction ? FACTIONS[p.faction].color : NEUTRAL_COLOR);

export default function WorldMap({ player, actions }) {
  const level = levelInfo(player.xp).level;
  const byId = Object.fromEntries(PORTALS.map((p) => [p.id, p]));

  return (
    <div className="map-screen">
      <header className="map-header">
        <div className="map-header-row">
          <strong>{player.name}</strong>
          <FactionBadge faction={player.faction} />
        </div>
        <XpBar xp={player.xp} />
      </header>

      <div className="map">
        <svg className="map-bg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Fictional landmasses of Aetheris */}
          <path className="land" d="M8 60 C4 45 14 30 30 32 C40 18 60 14 70 24 C88 20 96 36 90 50 C98 62 90 80 74 82 C64 94 40 96 30 86 C14 88 4 76 8 60 Z" />
          <path className="land" d="M14 14 C20 6 36 8 38 16 C40 24 26 28 18 24 C12 22 10 18 14 14 Z" />
          <path className="land" d="M64 6 C72 2 88 4 90 12 C92 20 80 22 70 20 C62 18 60 10 64 6 Z" />
          {[20, 40, 60, 80].map((v) => (
            <g key={v} className="grid">
              <line x1={v} y1="0" x2={v} y2="100" />
              <line x1="0" y1={v} x2="100" y2={v} />
            </g>
          ))}
          {LINKS.map(([a, b]) => (
            <line
              key={a + b}
              className={`link ${level >= byId[b].level ? '' : 'locked'}`}
              x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y}
            />
          ))}
        </svg>

        {PORTALS.map((p) => {
          const locked = level < p.level;
          const missions = missionsAt(p.id);
          const done = missions.filter((m) => player.completed[m.id]).length;
          return (
            <button
              key={p.id}
              className={`map-portal ${locked ? 'locked' : ''} ${p.faction === player.faction ? 'own' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, '--c': portalColor(p) }}
              onClick={() => actions.openPortal(p.id)}
              aria-label={p.name}
            >
              <span className="map-portal-glow" />
              <span className="map-portal-label">
                {p.name}
                <small>{locked ? `🔒 Level ${p.level}` : `${done}/${missions.length} missions`}</small>
              </span>
            </button>
          );
        })}
      </div>
      <p className="map-hint">Tap a portal to see its missions.</p>
    </div>
  );
}
