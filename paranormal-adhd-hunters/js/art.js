/* ParanormalADHDhunters — the brand and the icons, drawn as SVG in code:
   the logo, the team emblem, rank and achievement badges, equipment and
   evidence icons, uniforms and the county case map. */
import { RANKS, LOCATIONS, UNIFORMS } from './data.js';

let uid = 0;
const id = (p) => `${p}${++uid}`;

/** The team emblem: a little ghost inside a magnifying glass, with EMF waves. */
export function emblem(size = 120, opts = {}) {
  const g = id('eg'), f = id('ef');
  const glow = opts.glow !== false;
  return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <radialGradient id="${g}" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#2a1c5e"/><stop offset="1" stop-color="#0b1030"/></radialGradient>
    <filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g ${glow ? `filter="url(#${f})"` : ''}>
    <path d="M86 86 L108 108" stroke="#9b6bff" stroke-width="11" stroke-linecap="round"/>
    <path d="M86 86 L108 108" stroke="#d6c6ff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <circle cx="54" cy="54" r="40" fill="url(#${g})" stroke="#9b6bff" stroke-width="6"/>
    <circle cx="54" cy="54" r="33" fill="none" stroke="#7fe3ff" stroke-width="1.5" opacity=".5"/>
    <path d="M38 76 V50 a16 16 0 0 1 32 0 V76 l-5.3 -5 -5.3 5 -5.4 -5 -5.3 5 -5.4 -5 z" fill="#e9f0ff"/>
    <ellipse cx="48" cy="50" rx="3.4" ry="5" fill="#141a3a"/><ellipse cx="60" cy="50" rx="3.4" ry="5" fill="#141a3a"/>
    <path d="M16 30 a44 44 0 0 1 14 -14 M10 24 a52 52 0 0 1 16 -16" stroke="#7fe3ff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
  </g></svg>`;
}

/** Full logo: emblem plus the ParanormalADHDhunters wordmark. */
export function logo(opts = {}) {
  const f = id('lf');
  const w = opts.width || 320;
  return `<svg class="logo" viewBox="0 0 320 210" width="${w}" role="img" aria-label="ParanormalADHDhunters">
  <defs><filter id="${f}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g transform="translate(115 0)">${emblem(90).replace('<svg class="emblem" width="90" height="90"', '<svg class="emblem" width="90" height="90" x="0" y="0"')}</g>
  <text x="160" y="128" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="33" letter-spacing="3" fill="#e9f0ff">Paranormal</text>
  <text x="160" y="172" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="38" letter-spacing="1">
    <tspan font-weight="900" fill="#b388ff" filter="url(#${f})">ADHD</tspan><tspan font-weight="700" fill="#e9f0ff">hunters</tspan>
  </text>
  <text x="160" y="198" text-anchor="middle" font-family="Nunito, sans-serif" font-style="italic" font-size="13" fill="#aab4e8" letter-spacing="1">Hyperfocused on the unexplained</text>
  </svg>`;
}

/** A shield badge for a rank. */
export function rankBadge(rankOrLevel, size = 64) {
  const r = typeof rankOrLevel === 'number' ? RANKS.slice().reverse().find((x) => rankOrLevel >= x.level) : rankOrLevel;
  const g = id('rb');
  let stars = '';
  for (let i = 0; i < r.stars; i++) {
    const a = (-0.5 + (i + 0.5) / Math.max(1, r.stars)) * 1.6;
    const x = 50 + Math.sin(a) * 26, y = 86 - Math.cos(a) * 6;
    stars += `<path transform="translate(${x - 5} ${y - 5}) scale(.5)" d="M10 0l3 7 7 .6-5.4 4.6 1.7 7.3L10 15.6 3.7 19.5 5.4 12.2 0 7.6 7 7z" fill="${r.color}"/>`;
  }
  return `<svg class="rank-badge" width="${size}" height="${size * 1.1}" viewBox="0 0 100 110" aria-label="${r.name}">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2160"/><stop offset="1" stop-color="#0b1030"/></linearGradient></defs>
  <path d="M50 4 L92 18 V54 C92 80 72 98 50 106 C28 98 8 80 8 54 V18 Z" fill="url(#${g})" stroke="${r.color}" stroke-width="5"/>
  <path d="M50 14 L82 25 V54 C82 74 67 88 50 95 C33 88 18 74 18 54 V25 Z" fill="none" stroke="${r.color}" stroke-width="1.5" opacity=".5"/>
  <path d="M38 66 V44 a12 12 0 0 1 24 0 V66 l-4 -4 -4 4 -4 -4 -4 4 -4 -4 z" fill="#e9f0ff"/>
  <ellipse cx="45.5" cy="45" rx="2.5" ry="3.6" fill="#141a3a"/><ellipse cx="54.5" cy="45" rx="2.5" ry="3.6" fill="#141a3a"/>
  ${stars}
  </svg>`;
}

const ICON_PATHS = {
  // equipment
  flashlight: '<path d="M7 3h10l-2 6H9z"/><rect x="9" y="9" width="6" height="12" rx="1.5"/><path d="M12 13v3"/>',
  emf: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M8.5 9h1M11 9h1M13.5 9h1"/><path d="M9 14h6M9 17h4"/><path d="M14 5V2"/>',
  thermo: '<path d="M10 4a2 2 0 014 0v10a4 4 0 11-4 0z"/><path d="M12 9v7"/><circle cx="12" cy="17" r="1.6"/>',
  spirit: '<rect x="5" y="7" width="14" height="13" rx="2"/><rect x="8" y="9.5" width="8" height="3" rx=".6"/><path d="M9 15.5h.01M12 15.5h.01M15 15.5h.01M9 17.8h.01M12 17.8h.01M15 17.8h.01"/><path d="M8 7L5 2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  video: '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3v8l-6-3z"/>',
  recorder: '<rect x="7" y="3" width="10" height="18" rx="3"/><circle cx="12" cy="9" r="2.5"/><path d="M10 15h4M10 17.5h4"/>',
  motion: '<path d="M12 21V11"/><circle cx="12" cy="8" r="3"/><path d="M6 5a8 8 0 000 6M18 5a8 8 0 010 6M3.5 3a11 11 0 000 10M20.5 3a11 11 0 010 10"/>',
  uv: '<path d="M7 3h10l-2 6H9z"/><rect x="9" y="9" width="6" height="12" rx="1.5"/><path d="M3 4l2 1M21 4l-2 1M12 1v1"/>',
  // evidence
  freeze: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  voice: '<path d="M4 12h2l2-5 3 10 3-14 3 11 2-2h1"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 17v-5a4 4 0 018 0v5l-1.3-1-1.4 1-1.3-1-1.3 1-1.4-1z"/>',
  moving: '<rect x="4" y="12" width="7" height="8" rx="1"/><path d="M13 6l5-3M14 10l6-1M12 3l1-2"/><path d="M15 15c2-1 4 0 5 2"/>',
  // ui
  journal: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/><path d="M9 8h6"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7s-5-2-6.5-5l-1.6-3a1.4 1.4 0 012.4-1.5L8 13"/>',
  door: '<path d="M6 21V3h10v18"/><path d="M16 5l3 1v15h-3"/><circle cx="13" cy="12" r=".8"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  hide: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M10 12h.01M14 12h.01"/>',
  page: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h4"/>',
  van: '<path d="M2 16V8h13l4 4h3v4z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  snap: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  ask: '<path d="M9 9a3 3 0 115 2.2c-1 .7-2 1.3-2 2.8"/><path d="M12 18h.01"/><circle cx="12" cy="12" r="9.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.5 9.5c0-1 1-1.6 2.5-1.6s2.5.7 2.5 1.7-1 1.4-2.5 1.6-2.5.7-2.5 1.7 1 1.6 2.5 1.6 2.5-.6 2.5-1.6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  team: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="8" r="3"/><path d="M2.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6M11.5 15c1.2-.7 3-1 5-1 3 0 5 2.5 5 6"/>',
  ghost: '<path d="M6 21V10a6 6 0 0112 0v11l-2-2-2 2-2-2-2 2-2-2z"/><path d="M10 10h.01M14 10h.01"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4"/><path d="M12 13v4M9 21h6M10 17h4v4h-4z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8a5 5 0 010 8M19 5a9 9 0 010 14"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  // achievement art
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  shadow: '<path d="M8 21V9a4 4 0 018 0v12"/><path d="M6 21h12"/><path d="M10.5 9h.01M13.5 9h.01"/>',
  cup: '<path d="M5 8h11v6a5 5 0 01-5 5h-1a5 5 0 01-5-5z"/><path d="M16 10h2a2 2 0 010 4h-2"/><path d="M8 3l1 2M12 2l-1 3"/>',
  bear: '<circle cx="12" cy="13" r="6"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="7" r="2.3"/><path d="M10 12h.01M14 12h.01M11 15.5h2"/>',
  three: '<circle cx="6" cy="12" r="3"/><circle cx="12" cy="12" r="3"/><circle cx="18" cy="12" r="3"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
  boo: '<path d="M6 20V10a6 6 0 0112 0v10l-2-1.5L14 20l-2-1.5L10 20l-2-1.5z"/><circle cx="10" cy="10" r="1.2"/><circle cx="14" cy="10" r="1.2"/><ellipse cx="12" cy="14" rx="1.5" ry="2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  lantern: '<circle cx="12" cy="12" r="5.5"/><path d="M8.6 12c1.9-2.4 4.9-2.4 6.8 0-1.9 2.4-4.9 2.4-6.8 0z"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/>',
  badge: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export function icon(name, cls = '') {
  const p = ICON_PATHS[name] || ICON_PATHS.ghost;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}

const TIERS = ['#7fe3ff', '#b388ff', '#ffd479'];

/** A hexagonal achievement badge. */
export function achievementBadge(a, unlocked, size = 64) {
  const g = id('ab');
  const col = unlocked ? TIERS[(a.xp >= 150 ? 2 : a.xp >= 75 ? 1 : 0)] : '#3a4060';
  return `<svg class="ach-badge ${unlocked ? '' : 'locked'}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
  <defs><radialGradient id="${g}" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${unlocked ? '#3a2a7a' : '#1a1d30'}"/><stop offset="1" stop-color="#0b1030"/></radialGradient></defs>
  <path d="M50 4 L90 27 V73 L50 96 L10 73 V27 Z" fill="url(#${g})" stroke="${col}" stroke-width="5"/>
  <path d="M50 14 L81 32 V68 L50 86 L19 68 V32 Z" fill="none" stroke="${col}" stroke-width="1.2" opacity=".5"/>
  <g transform="translate(26 26) scale(2)" fill="none" stroke="${unlocked ? '#e9f0ff' : '#5a6080'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[a.icon] || ICON_PATHS.star}</g>
  </svg>`;
}

/** A little investigator in uniform. */
export function avatar(uniformId, size = 90, name = '') {
  const u = UNIFORMS.find((x) => x.id === uniformId) || UNIFORMS[0];
  return `<svg class="avatar" width="${size}" height="${size * 1.25}" viewBox="0 0 80 100" aria-label="${name || u.name}">
  <ellipse cx="40" cy="96" rx="24" ry="3" fill="#000" opacity=".4"/>
  <path d="M16 96 V62 c0-10 10-16 24-16 s24 6 24 16 V96 z" fill="${u.jacket}"/>
  <path d="M16 70 h48 M16 76 h48" stroke="${u.trim}" stroke-width="3"/>
  <path d="M40 46 v50" stroke="${u.trim}" stroke-width="2" opacity=".6"/>
  <circle cx="53" cy="58" r="6" fill="#0b1030" stroke="${u.trim}" stroke-width="1.5"/>
  <path d="M50.5 61 v-4 a2.5 2.5 0 015 0 v4 l-.8-.8-.9.8-.8-.8-.9.8z" fill="#e9f0ff"/>
  <circle cx="40" cy="30" r="15" fill="#c89a7c"/>
  <path d="M24 28 a16 16 0 0132 0 v-2 c0-4-4-12-16-12 s-16 8-16 12z" fill="${u.trim === '#ffffff' ? '#222' : '#2a1a14'}"/>
  <rect x="26" y="22" width="28" height="5" rx="2.5" fill="${u.jacket}"/>
  <circle cx="40" cy="24.5" r="3" fill="#fff8d8"/>
  <circle cx="34.5" cy="32" r="1.7" fill="#1a1020"/><circle cx="45.5" cy="32" r="1.7" fill="#1a1020"/>
  <path d="M36 38 q4 3 8 0" stroke="#7a4a3a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

/** Ghost silhouettes for the field guide. */
export function ghostArt(type, known = true, size = 72) {
  const col = known ? { shadow: '#7b6cff', poltergeist: '#ff7a59', child: '#7fe3ff' }[type] || '#aab4e8' : '#3a4060';
  const body = {
    shadow: '<path d="M30 92 V40 a20 22 0 0 1 40 0 V92 l-6-5-7 5-7-5-7 5-7-5z" fill="#05060c" stroke="COL" stroke-width="2.5"/><ellipse cx="43" cy="42" rx="3" ry="2" fill="#c8d4ff"/><ellipse cx="57" cy="42" rx="3" ry="2" fill="#c8d4ff"/>',
    poltergeist: '<g fill="none" stroke="COL" stroke-width="3" stroke-linecap="round"><path d="M50 20 c20 5 25 30 5 40 c-20 10 -15 30 5 32"/><path d="M38 30 c-10 15 0 30 15 30"/></g><rect x="22" y="28" width="10" height="13" rx="1.5" fill="COL" transform="rotate(-20 27 34)"/><circle cx="76" cy="70" r="6" fill="COL"/><path d="M70 30 l10 4 -4 9z" fill="COL"/>',
    child: '<path d="M38 92 L44 62 a8 8 0 0 1 12 0 L62 92 z" fill="COL" opacity=".55"/><circle cx="50" cy="48" r="10" fill="COL" opacity=".7"/><path d="M40 46 a10 10 0 0 1 20 0" fill="COL"/><circle cx="46.5" cy="49" r="1.5" fill="#0b1030"/><circle cx="53.5" cy="49" r="1.5" fill="#0b1030"/>',
  }[type] || '<path d="M32 92 V45 a18 18 0 0 1 36 0 V92 l-6-5-6 5-6-5-6 5-6-5z" fill="COL" opacity=".5"/><text x="50" y="60" text-anchor="middle" font-size="22" font-weight="700" fill="#0b1030">?</text>';
  return `<svg class="ghost-art" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="56" r="44" fill="${known ? 'rgba(155,107,255,.12)' : 'rgba(40,46,80,.4)'}"/>${body.replace(/COL/g, col)}</svg>`;
}

/** The county map: eight sites, and the Lantern shape once the story reveals it. */
export function countyMap(opts = {}) {
  const lit = opts.lit || 0;
  const reveal = !!opts.reveal;
  const P = LOCATIONS.map((l) => [l.mx * 3, l.my * 2.4]);
  let lines = '';
  if (reveal) {
    const ring = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 0; i < ring.length; i++) {
      const a = P[ring[i]], b = P[ring[(i + 1) % ring.length]];
      lines += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="ley"/>`;
      lines += `<line x1="${a[0]}" y1="${a[1]}" x2="${P[7][0]}" y2="${P[7][1]}" class="ley thin"/>`;
    }
  }
  const pins = LOCATIONS.map((l, i) => {
    const [x, y] = P[i];
    const on = i < lit;
    return `<g class="pin ${l.playable ? 'open' : 'sealed'} ${on ? 'lit' : ''}" data-loc="${l.id}" transform="translate(${x} ${y})">
      <circle r="${l.playable ? 11 : 8}" class="pin-dot"/>${on ? '<circle r="18" class="pin-glow"/>' : ''}
      <text y="${l.my > 70 ? 26 : -16}" text-anchor="middle">${l.name}</text></g>`;
  }).join('');
  return `<svg class="county" viewBox="-20 -10 340 260" role="img" aria-label="Map of the county">
  <defs><radialGradient id="cmg" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#1a1650"/><stop offset="1" stop-color="#070a1c"/></radialGradient></defs>
  <rect x="-20" y="-10" width="340" height="260" rx="14" fill="url(#cmg)"/>
  <path d="M-10 180 C60 150 90 210 160 190 S260 150 320 175" class="river"/>
  <path d="M40 -10 C70 60 30 120 80 250" class="road"/><path d="M-20 90 C80 100 200 70 320 110" class="road"/>
  ${lines}${pins}
  </svg>`;
}

/** The lantern mark itself, as found in the house. */
export function sigil(size = 80, color = '#b388ff') {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    rays += `<line x1="${50 + Math.cos(a) * 36}" y1="${50 + Math.sin(a) * 36}" x2="${50 + Math.cos(a) * 46}" y2="${50 + Math.sin(a) * 46}"/>`;
  }
  return `<svg class="sigil" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"><circle cx="50" cy="50" r="30"/><path d="M31 50 q19 -17 38 0 q-19 17 -38 0z"/>${rays}</g><circle cx="50" cy="50" r="5" fill="${color}"/></svg>`;
}
