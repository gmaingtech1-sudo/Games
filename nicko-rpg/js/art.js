// Procedurally drawn SVG art: monsters, item icons and class emblems.
// Everything is original vector shapes generated from a few colour settings.

import { RARITIES } from './items.js';

const esc = (c) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#888888');

function shade(hex, amt) {
  hex = esc(hex).slice(1);
  if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
  const n = parseInt(hex.slice(0, 6), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

const eyes = (x1, x2, y, r, accent) =>
  `<circle cx="${x1}" cy="${y}" r="${r}" fill="${accent}" class="glow"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${accent}" class="glow"/>`;

const CROWN = (accent) => `<path d="M38 22 L44 8 L52 18 L60 4 L68 18 L76 8 L82 22 Z" fill="#ffd700" stroke="#8a6d00" stroke-width="2"/><circle cx="60" cy="14" r="3" fill="${accent}"/>`;

const SHAPES = {
  blob: (c, a, d, l) => `
    <ellipse cx="60" cy="108" rx="40" ry="6" fill="#000" opacity=".35"/>
    <path d="M18 100 C14 70 30 34 60 34 C90 34 106 70 102 100 C90 108 30 108 18 100Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <ellipse cx="44" cy="54" rx="10" ry="6" fill="${l}" opacity=".55"/>
    ${eyes(48, 72, 70, 6, '#111')}<circle cx="50" cy="68" r="2" fill="#fff"/><circle cx="74" cy="68" r="2" fill="#fff"/>
    <path d="M50 86 Q60 92 70 86" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  humanoid: (c, a, d) => `
    <ellipse cx="60" cy="110" rx="30" ry="5" fill="#000" opacity=".35"/>
    <path d="M36 112 L42 74 Q60 64 78 74 L84 112Z" fill="${d}"/>
    <path d="M24 40 L42 50 L40 58Z M96 40 L78 50 L80 58Z" fill="${c}" stroke="${d}" stroke-width="2"/>
    <circle cx="60" cy="52" r="22" fill="${c}" stroke="${d}" stroke-width="3"/>
    ${eyes(51, 69, 50, 4.5, a)}
    <path d="M50 64 L54 60 L58 64 L62 60 L66 64 L70 60" stroke="${d}" stroke-width="2.5" fill="none"/>
    <path d="M84 80 L100 58" stroke="#aaa" stroke-width="5" stroke-linecap="round"/>`,
  skull: (c, a, d) => `
    <ellipse cx="60" cy="112" rx="30" ry="5" fill="#000" opacity=".35"/>
    <path d="M40 112 L46 86 L74 86 L80 112Z" fill="${d}" opacity=".9"/>
    <path d="M52 92 h16 M50 100 h20 M48 108 h24" stroke="${c}" stroke-width="3"/>
    <path d="M30 50 C30 26 90 26 90 50 C90 66 82 70 78 74 L78 84 L42 84 L42 74 C38 70 30 66 30 50Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <ellipse cx="47" cy="54" rx="9" ry="10" fill="#140f1a"/><ellipse cx="73" cy="54" rx="9" ry="10" fill="#140f1a"/>
    ${eyes(47, 73, 55, 3.5, a)}
    <path d="M60 62 L55 72 L65 72Z" fill="#140f1a"/>
    <path d="M48 78 v6 M54 78 v6 M60 78 v6 M66 78 v6 M72 78 v6" stroke="#140f1a" stroke-width="2"/>`,
  beast: (c, a, d, l) => `
    <ellipse cx="60" cy="110" rx="38" ry="6" fill="#000" opacity=".35"/>
    <path d="M22 108 C20 84 36 70 60 70 C84 70 100 84 98 108Z" fill="${d}"/>
    <path d="M30 40 L40 12 L52 36Z M90 40 L80 12 L68 36Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M28 44 C28 28 92 28 92 44 C92 62 80 70 74 86 L60 96 L46 86 C40 70 28 62 28 44Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M46 72 C50 92 70 92 74 72 Z" fill="${l}"/>
    <ellipse cx="60" cy="80" rx="6" ry="4" fill="#111"/>
    ${eyes(46, 74, 52, 4.5, a)}
    <path d="M52 90 L54 96 M68 90 L66 96" stroke="#fff" stroke-width="2.5"/>`,
  spider: (c, a, d) => `
    <ellipse cx="60" cy="110" rx="44" ry="6" fill="#000" opacity=".35"/>
    <g stroke="${d}" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M44 66 L20 44 L8 70"/><path d="M44 72 L16 66 L8 96"/><path d="M46 78 L22 88 L18 110"/><path d="M50 82 L34 100 L34 114"/>
      <path d="M76 66 L100 44 L112 70"/><path d="M76 72 L104 66 L112 96"/><path d="M74 78 L98 88 L102 110"/><path d="M70 82 L86 100 L86 114"/>
    </g>
    <ellipse cx="60" cy="86" rx="22" ry="18" fill="${d}"/>
    <path d="M60 76 l6 8 l-6 8 l-6 -8z" fill="${a}" opacity=".8"/>
    <circle cx="60" cy="60" r="18" fill="${c}" stroke="${d}" stroke-width="3"/>
    ${eyes(52, 68, 56, 3.5, a)}${eyes(55, 65, 64, 2.5, a)}${eyes(46, 74, 62, 2, a)}
    <path d="M54 74 L52 82 M66 74 L68 82" stroke="#ddd" stroke-width="3" stroke-linecap="round"/>`,
  brute: (c, a, d, l) => `
    <ellipse cx="60" cy="112" rx="44" ry="6" fill="#000" opacity=".35"/>
    <path d="M14 112 C14 82 30 70 60 70 C90 70 106 82 106 112Z" fill="${d}"/>
    <circle cx="20" cy="88" r="12" fill="${c}" stroke="${d}" stroke-width="3"/><circle cx="100" cy="88" r="12" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M30 44 C30 22 90 22 90 44 L92 66 C86 82 34 82 28 66Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M38 44 L54 48 M82 44 L66 48" stroke="${d}" stroke-width="4" stroke-linecap="round"/>
    ${eyes(46, 74, 52, 4, a)}
    <path d="M44 68 Q60 76 76 68" stroke="${d}" stroke-width="3" fill="none"/>
    <path d="M46 70 L42 56 L50 66Z M74 70 L78 56 L70 66Z" fill="${l}" stroke="${d}" stroke-width="1.5"/>`,
  caster: (c, a, d) => `
    <ellipse cx="60" cy="112" rx="34" ry="6" fill="#000" opacity=".35"/>
    <path d="M60 14 C34 30 30 60 26 112 L94 112 C90 60 86 30 60 14Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M60 30 C46 38 42 52 44 64 C52 72 68 72 76 64 C78 52 74 38 60 30Z" fill="#0b0712"/>
    ${eyes(53, 67, 54, 3.5, a)}
    <path d="M60 70 L60 112" stroke="${d}" stroke-width="2" opacity=".6"/>
    <path d="M98 40 L92 112" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/>
    <circle cx="99" cy="36" r="8" fill="${a}" class="glow orb"/>`,
  ghost: (c, a, d) => `
    <path d="M28 112 C24 70 28 22 60 20 C92 22 96 70 92 112 L84 100 L76 112 L68 100 L60 112 L52 100 L44 112 L36 100Z" fill="${c}" opacity=".85" stroke="${d}" stroke-width="2"/>
    <ellipse cx="48" cy="54" rx="8" ry="11" fill="#0b0712"/><ellipse cx="72" cy="54" rx="8" ry="11" fill="#0b0712"/>
    ${eyes(48, 72, 56, 3, a)}
    <ellipse cx="60" cy="80" rx="7" ry="10" fill="#0b0712"/>
    <path d="M20 60 C10 70 14 84 26 86 M100 60 C110 70 106 84 94 86" stroke="${c}" stroke-width="6" fill="none" opacity=".7" stroke-linecap="round"/>`,
  dragon: (c, a, d, l) => `
    <ellipse cx="60" cy="112" rx="46" ry="6" fill="#000" opacity=".35"/>
    <path d="M40 60 L4 24 L14 60 L2 70 L34 82Z M80 60 L116 24 L106 60 L118 70 L86 82Z" fill="${d}" stroke="${shade(d, -0.3)}" stroke-width="2"/>
    <path d="M30 112 C28 88 42 76 60 76 C78 76 92 88 90 112Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M50 80 L60 112 L70 80" fill="${l}" opacity=".5"/>
    <path d="M36 36 L30 10 L46 30Z M84 36 L90 10 L74 30Z" fill="${l}" stroke="${d}" stroke-width="2"/>
    <path d="M34 44 C34 26 86 26 86 44 L84 62 C80 78 40 78 36 62Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M42 46 L56 52 M78 46 L64 52" stroke="${d}" stroke-width="3"/>
    ${eyes(48, 72, 54, 4, a)}
    <circle cx="54" cy="68" r="2" fill="#111"/><circle cx="66" cy="68" r="2" fill="#111"/>
    <path d="M44 72 L48 78 L52 72 M76 72 L72 78 L68 72" stroke="#fff" stroke-width="2" fill="none"/>`,
  golem: (c, a, d, l) => `
    <ellipse cx="60" cy="112" rx="42" ry="6" fill="#000" opacity=".35"/>
    <path d="M24 70 L40 64 L44 100 L26 104Z M96 70 L80 64 L76 100 L94 104Z" fill="${d}" stroke="${shade(d, -0.3)}" stroke-width="2"/>
    <path d="M38 62 L82 62 L88 110 L32 110Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M46 72 L58 80 L52 96 M74 70 L66 86" stroke="${l}" stroke-width="2" fill="none"/>
    <path d="M42 26 L78 26 L82 58 L38 58Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M48 42 h8 M64 42 h8" stroke="${a}" stroke-width="5" class="glow"/>
    <path d="M52 52 h16" stroke="${d}" stroke-width="3"/>`,
  fiend: (c, a, d, l) => `
    <ellipse cx="60" cy="112" rx="40" ry="6" fill="#000" opacity=".35"/>
    <path d="M22 112 C22 84 38 72 60 72 C82 72 98 84 98 112Z" fill="${c}" stroke="${d}" stroke-width="2"/>
    <path d="M38 34 C26 22 22 8 30 2 C32 16 40 22 46 28Z M82 34 C94 22 98 8 90 2 C88 16 80 22 74 28Z" fill="${l}" stroke="${d}" stroke-width="2"/>
    <path d="M34 44 C34 24 86 24 86 44 C86 64 74 80 60 82 C46 80 34 64 34 44Z" fill="${c}" stroke="${d}" stroke-width="3"/>
    <path d="M42 46 L56 54 L42 56Z M78 46 L64 54 L78 56Z" fill="${a}" class="glow"/>
    <path d="M46 68 L50 74 L54 68 L58 74 L62 68 L66 74 L70 68 L74 74" stroke="${a}" stroke-width="2" fill="none"/>
    <path d="M24 96 L12 86 M24 100 L10 98 M96 96 L108 86 M96 100 L110 98" stroke="${l}" stroke-width="3" stroke-linecap="round"/>`,
  eye: (c, a, d) => `
    <g stroke="${d}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9">
      <path d="M36 88 C26 100 34 112 20 116"/><path d="M50 94 C48 106 56 112 50 118"/><path d="M70 94 C72 106 64 112 70 118"/><path d="M84 88 C94 100 86 112 100 116"/>
    </g>
    <circle cx="60" cy="58" r="40" fill="${c}" stroke="${d}" stroke-width="3"/>
    <circle cx="60" cy="58" r="24" fill="#f4efe6"/>
    <circle cx="60" cy="58" r="14" fill="${a}" class="glow"/>
    <ellipse cx="60" cy="58" rx="4" ry="12" fill="#0b0712"/>
    <circle cx="52" cy="50" r="3" fill="#fff"/>`,
};

/** SVG markup for a monster. look: { shape, color, accent, crown, scale, aura } */
export function enemySvg(look = {}, opts = {}) {
  const shape = SHAPES[look.shape] ? look.shape : 'blob';
  const c = esc(look.color || '#7a4fd1'), a = esc(look.accent || '#ffd166');
  const d = shade(c, -0.45), l = shade(c, 0.45);
  const scale = Math.max(0.6, Math.min(1.4, Number(look.scale) || 1));
  const aura = look.aura || opts.boss ? `<circle cx="60" cy="64" r="56" fill="url(#aura-${opts.id || 'x'})"/>` : '';
  const id = String(opts.id || 'x').replace(/[^a-z0-9]/gi, '');
  return `<svg viewBox="0 0 120 120" class="enemy-svg" role="img" aria-label="${opts.label || 'monster'}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="aura-${id}"><stop offset="0" stop-color="${a}" stop-opacity=".45"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient></defs>
    ${aura.replace(`aura-${opts.id || 'x'}`, `aura-${id}`)}
    <g transform="translate(60 64) scale(${scale}) translate(-60 -64)">${SHAPES[shape](c, a, d, l)}${look.crown ? CROWN(a) : ''}</g>
  </svg>`;
}

const ICONS = {
  sword: '<path d="M30 6 L34 10 L16 28 L12 24Z" fill="currentColor"/><path d="M10 22 L18 30 M8 32 L14 26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  staff: '<path d="M10 34 L28 12" stroke="#a87b4f" stroke-width="3.5" stroke-linecap="round"/><circle cx="30" cy="10" r="6" fill="currentColor"/>',
  dagger: '<path d="M30 8 L32 10 L18 24 L16 22Z" fill="currentColor"/><path d="M14 20 L20 26 M10 30 L16 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  bow: '<path d="M10 6 C34 8 34 32 10 34" stroke="currentColor" stroke-width="3" fill="none"/><path d="M10 6 L10 34 M8 20 L32 20 M28 16 L33 20 L28 24" stroke="#ddd" stroke-width="1.5" fill="none"/>',
  armor: '<path d="M10 8 L16 6 Q20 10 24 6 L30 8 L34 16 L28 18 L28 34 L12 34 L12 18 L6 16Z" fill="currentColor"/>',
  helmet: '<path d="M8 26 C8 10 32 10 32 26 L32 30 L24 30 L24 22 L16 22 L16 30 L8 30Z" fill="currentColor"/>',
  boots: '<path d="M10 6 L20 6 L20 24 L32 28 L32 34 L10 34Z" fill="currentColor"/>',
  ring: '<circle cx="20" cy="24" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path d="M15 10 L20 4 L25 10 L20 14Z" fill="currentColor"/>',
  amulet: '<path d="M8 6 Q20 22 32 6" stroke="#cfc6a6" stroke-width="2" fill="none"/><path d="M20 16 L28 26 L20 36 L12 26Z" fill="currentColor"/>',
  potion: '<path d="M16 4 h8 v8 l8 12 a10 10 0 0 1 -8 12 h-8 a10 10 0 0 1 -8 -12 l8 -12z" fill="#1e1a26" stroke="#ccc" stroke-width="1.5"/><path d="M10 24 a10 10 0 0 0 7 10 h6 a10 10 0 0 0 7 -10z" fill="currentColor"/>',
  material: '<path d="M20 4 L32 14 L26 34 L14 34 L8 14Z" fill="currentColor"/><path d="M20 4 L20 34 M8 14 L32 14" stroke="#000" stroke-opacity=".3"/>',
  quest: '<path d="M8 8 h22 a4 4 0 0 1 0 8 h-2 v18 h-18 a4 4 0 0 1 0 -8 h2 v-18" fill="#d9c9a3" stroke="#7a6640" stroke-width="1.5"/><path d="M14 16 h10 M14 21 h10 M14 26 h8" stroke="#7a6640" stroke-width="1.5"/>',
  gold: '<circle cx="20" cy="20" r="13" fill="#ffd166" stroke="#a37a1f" stroke-width="2"/><text x="20" y="25" text-anchor="middle" font-size="14" font-weight="700" fill="#a37a1f">G</text>',
};

const POTION_COLORS = { heal: '#ff4f5e', mana: '#4aa3ff', cure: '#7bd448', atkUp: '#ff9d3b', defUp: '#9fb6d6', regen: '#4fe08a', all: '#e07bff', flee: '#aaaaaa' };

export function itemIconSvg(def) {
  if (!def) return '';
  let key = def.type;
  let color = RARITIES[def.rarity]?.color || '#ccc';
  if (def.type === 'weapon') key = { sword: 'sword', staff: 'staff', dagger: 'dagger', bow: 'bow', any: 'sword' }[def.wtype] || 'sword';
  if (def.type === 'potion') {
    const fx = def.effect || {};
    color = fx.healPct && fx.manaPct ? POTION_COLORS.all : fx.healPct ? POTION_COLORS.heal : fx.manaPct ? POTION_COLORS.mana
      : fx.cure ? POTION_COLORS.cure : fx.flee ? POTION_COLORS.flee : POTION_COLORS[fx.status?.id] || '#ccc';
  }
  return `<svg viewBox="0 0 40 40" class="item-svg" style="color:${color}" aria-hidden="true">${ICONS[key] || ICONS.material}</svg>`;
}

export function iconSvg(key, color = 'currentColor') {
  return `<svg viewBox="0 0 40 40" class="item-svg" style="color:${color}" aria-hidden="true">${ICONS[key] || ''}</svg>`;
}

export function classEmblem(classId) {
  const key = { warrior: 'sword', mage: 'staff', rogue: 'dagger', ranger: 'bow' }[classId] || 'sword';
  const color = { warrior: '#ff5d6c', mage: '#c38bff', rogue: '#8fe35a', ranger: '#ffd166' }[classId];
  return `<svg viewBox="0 0 40 40" class="emblem-svg" style="color:${color}" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#120d18" stroke="${color}" stroke-width="1.5" opacity=".9"/><g transform="translate(6 6) scale(.7)">${ICONS[key]}</g></svg>`;
}

/** Hero portrait: a simple hooded silhouette coloured by class. */
export function heroSvg(classId) {
  const c = { warrior: '#8a2a33', mage: '#4b2a7a', rogue: '#2f4a25', ranger: '#6b5520' }[classId] || '#555';
  const a = { warrior: '#ff5d6c', mage: '#c38bff', rogue: '#8fe35a', ranger: '#ffd166' }[classId] || '#fff';
  return `<svg viewBox="0 0 120 120" class="hero-svg" aria-hidden="true">
    <ellipse cx="60" cy="112" rx="32" ry="5" fill="#000" opacity=".35"/>
    <path d="M28 112 C28 84 40 70 60 70 C80 70 92 84 92 112Z" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="3"/>
    <path d="M36 52 C36 24 84 24 84 52 C84 70 74 80 60 80 C46 80 36 70 36 52Z" fill="${shade(c, -0.2)}" stroke="${shade(c, -0.5)}" stroke-width="3"/>
    <path d="M44 50 C44 40 76 40 76 50 C76 64 70 70 60 70 C50 70 44 64 44 50Z" fill="#e8c9a8"/>
    <circle cx="53" cy="54" r="2.5" fill="#222"/><circle cx="67" cy="54" r="2.5" fill="#222"/>
    <path d="M55 63 Q60 66 65 63" stroke="#7a4a3a" stroke-width="2" fill="none"/>
    <path d="M60 80 L60 112" stroke="${a}" stroke-width="2" opacity=".6"/>
    <g transform="translate(78 58) scale(1.1)" style="color:${a}">${ICONS[{ warrior: 'sword', mage: 'staff', rogue: 'dagger', ranger: 'bow' }[classId] || 'sword']}</g>
  </svg>`;
}
