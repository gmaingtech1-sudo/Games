// Small pieces shared by several screens.
import { FACTIONS, ITEMS } from '../game/data.js';
import { levelInfo } from '../game/progress.js';

export function Portal({ color = '#7ff7ff', size = 200, className = '' }) {
  return (
    <div className={`portal ${className}`} style={{ '--c': color, width: size, height: size }}>
      <div className="portal-ring r1" />
      <div className="portal-ring r2" />
      <div className="portal-ring r3" />
      <div className="portal-core" />
    </div>
  );
}

export function XpBar({ xp }) {
  const info = levelInfo(xp);
  return (
    <div className="xpbar">
      <div className="xpbar-top">
        <span>Lv {info.level} · {info.rank}</span>
        <span>{info.into} / {info.needed} XP</span>
      </div>
      <div className="xpbar-track"><div className="xpbar-fill" style={{ width: `${info.progress * 100}%` }} /></div>
    </div>
  );
}

export function FactionBadge({ faction }) {
  const f = FACTIONS[faction];
  if (!f) return null;
  return <span className="badge" style={{ '--c': f.color }}>{f.name}</span>;
}

const SHAPES = {
  diamond: 'M50 6 L90 50 L50 94 L10 50 Z',
  hex: 'M50 6 L88 28 L88 72 L50 94 L12 72 L12 28 Z',
  circle: 'M50 10 A40 40 0 1 1 49.9 10 Z',
  shield: 'M50 6 L88 20 L84 60 L50 94 L16 60 L12 20 Z',
  ring: 'M50 8 A42 42 0 1 1 49.9 8 Z M50 30 A20 20 0 1 0 50.1 30 Z',
};

export function ItemIcon({ id, size = 44 }) {
  const item = ITEMS[id];
  return (
    <svg className="item-icon" viewBox="0 0 100 100" width={size} height={size} style={{ '--c': item.color }}>
      <path d={SHAPES[item.shape]} fillRule="evenodd" />
    </svg>
  );
}
