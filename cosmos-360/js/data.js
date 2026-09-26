// Everything the game knows about the universe.
//
// Sizes are real (radius in km). Distances are real too: one scene unit is
// 1061.8 km (Earth's radius is 6 units), so the Solar System is to scale.
// Colours in 'tex' are sRGB 0..1 and drive the procedural surface painter.

export const KM_PER_UNIT = 6371 / 6;
export const AU_KM = 149597870.7;
export const LY_KM = 9460730472580.8;
export const C_KMS = 299792.458;
export const AU = AU_KM / KM_PER_UNIT;

export const SYSTEMS = [
  {
    id: 'sol', name: 'Solar System', short: 'Sol', ra: 0, dec: 0, ly: 0, absMag: 4.83,
    star: 'G2V yellow dwarf',
    blurb: 'Home. One star, eight planets, five dwarf planets and hundreds of moons, spread across billions of kilometres of mostly empty space.',
    sky: 'milkyway', start: { near: 'earth', dist: 5.2, angle: 50, lift: 0.9, target: 'earth' },
  },
  {
    id: 'alphacen', name: 'Alpha Centauri', short: 'α Cen', ra: 219.902, dec: -60.834, ly: 4.344, absMag: 4.10,
    star: 'G2V + K1V binary',
    blurb: 'The nearest Sun-like stars. Alpha Centauri A and B circle each other every 80 years, and JWST may have spotted a giant planet around A.',
    sky: 'milkyway', start: { near: 'alphacenA', dist: 70, angle: 150, lift: 12, target: 'alphacenB' },
  },
  {
    id: 'proxima', name: 'Proxima Centauri', short: 'Proxima', ra: 217.429, dec: -62.679, ly: 4.2465, absMag: 15.53,
    star: 'M5.5V red dwarf',
    blurb: 'The closest star to the Sun, a small red flare star with a rocky planet in its habitable zone. Alpha Centauri blazes in its sky.',
    sky: 'milkyway', start: { near: 'proximab', dist: 4.5, angle: 55, lift: 0.8, target: 'proximab' },
  },
  {
    id: 'trappist', name: 'TRAPPIST-1', short: 'TRAPPIST-1', ra: 346.622, dec: -5.041, ly: 40.66, absMag: 18.4,
    star: 'M8V ultracool dwarf',
    blurb: 'Seven Earth-sized worlds packed around a dim red star, all closer to it than Mercury is to the Sun.',
    sky: 'milkyway', start: { near: 'trappiste', dist: 4.5, angle: 60, lift: 0.7, target: 'trappiste' },
  },
  {
    id: 'sgra', name: 'Sagittarius A*', short: 'Sgr A*', ra: 266.417, dec: -29.008, ly: 26670, absMag: 99,
    star: 'Supermassive black hole',
    blurb: 'The black hole at the heart of the Milky Way, four million times the mass of the Sun. Light itself bends around it.',
    sky: 'core', start: { near: 'sgra', dist: 30, angle: 0, lift: 5.5, target: 'sgra' },
  },
];

const S = (ra, dec, W0, Wd) => ({ ra, dec, W0, Wd });

// Orbital elements (J2000, JPL "approximate positions of the planets").
// [a AU, e, i, L, long. perihelion, long. node, dL per century]
const EL = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 149472.67411175],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 58517.81538729],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 35999.37244981],
  mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 19140.30268499],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, 3034.74612775],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, 1222.49362201],
  uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, 428.48202785],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 218.45945325],
  pluto: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684, 145.20780515],
  ceres: [2.7663, 0.0789, 10.587, 159.63, 153.56, 80.41, 7820.3],
};
const planetOrbit = (k) => ({ el: EL[k] });
// Moon on a near-circular orbit in its planet's equator plane.
const moonOrbit = (aKm, P, i = 0, M0 = 0, node = 0) => ({ a: aKm, unit: 'km', e: 0, i, node, peri: 0, M0, P, frame: 'equator' });

export const BODIES = [
  // ───────────────────────────── Solar System ─────────────────────────────
  {
    id: 'sun', sys: 'sol', name: 'Sun', kind: 'star', radius: 695700, color: '#FFE3A3',
    star: { temp: 5772, lum: 1 },
    rot: S(286.13, 63.87, 84.176, 14.1844),
    info: {
      type: 'G2V yellow dwarf star',
      stats: [['Radius', '695,700 km (109 Earths)'], ['Mass', '333,000 Earths'], ['Surface', '5,500 °C'], ['Core', '15 million °C'], ['Spin', '25 days at the equator'], ['Age', '4.6 billion years']],
      facts: [
        'The Sun holds 99.86% of all the mass in the Solar System.',
        'Its light takes 8 minutes 20 seconds to reach Earth, and about 5.5 hours to reach Pluto.',
        'Every second it turns about 600 million tonnes of hydrogen into helium.',
        'The dark blotches are sunspots: cooler patches where magnetic fields block the heat rising from below.',
      ],
    },
  },
  {
    id: 'mercury', sys: 'sol', name: 'Mercury', kind: 'planet', parent: 'sun', radius: 2439.7, color: '#A8A29A',
    orbit: planetOrbit('mercury'), rot: S(281.0103, 61.4155, 329.5988, 6.1385108),
    tex: { style: 'rocky', feature: 'MERCURY', size: 1024, normal: 1024, seed: 2, c1: [0.56, 0.54, 0.51], c2: [0.40, 0.38, 0.36], c3: [0.78, 0.76, 0.72], prm: [1.0, 0.7, 0.6, 0], bump: 1.2 },
    airless: true,
    info: {
      type: 'Rocky planet',
      stats: [['Radius', '2,440 km'], ['Mass', '0.055 Earths'], ['Gravity', '3.7 m/s²'], ['Day', '176 Earth days'], ['Year', '88 days'], ['Temperature', '−173 to 427 °C'], ['Moons', 'None']],
      facts: [
        'One day on Mercury, from sunrise to sunrise, lasts two of its years.',
        'It is the closest planet to the Sun, but not the hottest: that is Venus.',
        'Craters near its poles never see sunlight and hide water ice.',
        'The huge Caloris Basin was blasted out by an impact 1,550 km across.',
      ],
    },
  },
  {
    id: 'venus', sys: 'sol', name: 'Venus', kind: 'planet', parent: 'sun', radius: 6051.8, color: '#EBD9A8',
    orbit: planetOrbit('venus'), rot: S(272.76, 67.16, 160.20, -1.4813688),
    tex: { style: 'venus', size: 1024, seed: 3, c1: [0.86, 0.78, 0.58], c2: [0.66, 0.54, 0.36], c3: [0.93, 0.88, 0.74], prm: [1, 0, 0, 0] },
    atmo: { color: [1.0, 0.84, 0.52], sunset: [1.0, 0.55, 0.25], height: 0.035, density: 0.55, haze: 0.25 },
    clouds: 'venus',
    info: {
      type: 'Rocky planet',
      stats: [['Radius', '6,052 km'], ['Mass', '0.82 Earths'], ['Gravity', '8.9 m/s²'], ['Day', '243 Earth days (backwards)'], ['Year', '225 days'], ['Temperature', '464 °C'], ['Moons', 'None']],
      facts: [
        'Its carbon dioxide air presses down 92 times harder than Earth\'s.',
        'It spins backwards, so the Sun rises in the west and sets in the east.',
        'Clouds of sulfuric acid hide the surface completely.',
        'A runaway greenhouse effect makes it hot enough to melt lead.',
      ],
    },
  },
  {
    id: 'earth', sys: 'sol', name: 'Earth', kind: 'planet', parent: 'sun', radius: 6371, color: '#6FA8FF',
    orbit: planetOrbit('earth'), rot: S(0, 90, 190.147, 360.9856235),
    tex: { style: 'earth', size: 2048, aux: 2048, seed: 1 },
    atmo: { color: [0.30, 0.55, 1.0], sunset: [1.0, 0.45, 0.2], height: 0.022, density: 1.0, haze: 0.28 },
    clouds: 'earth', night: true, ocean: true,
    info: {
      type: 'Rocky planet',
      stats: [['Radius', '6,371 km'], ['Gravity', '9.8 m/s²'], ['Day', '23 h 56 min'], ['Year', '365.25 days'], ['Temperature', '15 °C average'], ['Moons', '1']],
      facts: [
        'The only place in the universe where we know life exists.',
        'Oceans cover about 71% of the surface.',
        'On the night side, city lights show where people live.',
        'The continents on this globe are real coastlines, and it spins with the real time of day.',
      ],
    },
  },
  {
    id: 'moon', sys: 'sol', name: 'Moon', kind: 'moon', parent: 'earth', radius: 1737.4, color: '#CFCBC4',
    orbit: { model: 'moon' }, rot: { locked: true, ra: 269.9949, dec: 66.5392 },
    tex: { style: 'rocky', feature: 'MOON', size: 2048, normal: 1024, seed: 5, c1: [0.62, 0.60, 0.57], c2: [0.50, 0.49, 0.47], c3: [0.86, 0.85, 0.82], c4: [0.29, 0.29, 0.30], prm: [1.0, 0.5, 0.7, 0], bump: 1.2 },
    airless: true,
    info: {
      type: 'Moon of Earth',
      stats: [['Radius', '1,737 km'], ['Gravity', '1.6 m/s²'], ['Orbit', '27.3 days'], ['Distance', '384,400 km'], ['Temperature', '−173 to 127 °C']],
      facts: [
        'The same side always faces Earth, because its spin is locked to its orbit.',
        'The dark patches are maria: old seas of hardened lava.',
        'Twelve people walked on it between 1969 and 1972.',
        'It drifts about 3.8 cm farther from Earth every year.',
      ],
    },
  },
  {
    id: 'mars', sys: 'sol', name: 'Mars', kind: 'planet', parent: 'sun', radius: 3389.5, color: '#E0784A',
    orbit: planetOrbit('mars'), rot: S(317.269, 54.432, 176.049863, 350.891982443),
    tex: { style: 'mars', size: 2048, normal: 1024, seed: 4, bump: 1.0 },
    atmo: { color: [0.95, 0.62, 0.42], sunset: [0.35, 0.55, 0.9], height: 0.012, density: 0.35, haze: 0.14 },
    info: {
      type: 'Rocky planet',
      stats: [['Radius', '3,390 km'], ['Mass', '0.11 Earths'], ['Gravity', '3.7 m/s²'], ['Day', '24 h 37 min'], ['Year', '687 days'], ['Temperature', '−63 °C average'], ['Moons', '2']],
      facts: [
        'Olympus Mons is about 22 km high, almost three times the height of Everest.',
        'Valles Marineris, the long scar near the equator, would stretch across the United States.',
        'Its red colour comes from iron oxide, which is rust, in the dust.',
        'Sunsets on Mars are blue.',
      ],
    },
  },
  {
    id: 'phobos', sys: 'sol', name: 'Phobos', kind: 'moon', parent: 'mars', radius: 11.1, shape: [13.0, 11.4, 9.1], color: '#8C8078',
    orbit: moonOrbit(9376, 0.31891, 1.09, 40), rot: { locked: true },
    tex: { style: 'rocky', feature: 'PHOBOS', size: 512, normal: 512, seed: 7, c1: [0.34, 0.31, 0.29], c2: [0.26, 0.24, 0.22], c3: [0.45, 0.42, 0.39], prm: [1.0, 0.5, 0.3, 0], bump: 1.4 },
    airless: true,
    info: {
      type: 'Moon of Mars',
      stats: [['Size', '27 × 22 × 18 km'], ['Orbit', '7 h 39 min'], ['Altitude', '6,000 km']],
      facts: [
        'It orbits faster than Mars spins, so from the surface it rises in the west.',
        'It is spiralling inward and will crash or break into a ring in about 50 million years.',
        'Stickney, its biggest crater, is 9 km wide: nearly half the moon.',
      ],
    },
  },
  {
    id: 'deimos', sys: 'sol', name: 'Deimos', kind: 'moon', parent: 'mars', radius: 6.2, shape: [7.8, 6.0, 5.1], color: '#9A8E84',
    orbit: moonOrbit(23463, 1.26244, 0.93, 200), rot: { locked: true },
    tex: { style: 'rocky', feature: 'DEIMOS', size: 512, normal: 512, seed: 8, c1: [0.40, 0.37, 0.34], c2: [0.33, 0.30, 0.28], c3: [0.50, 0.47, 0.43], prm: [0.45, 0.4, 0.2, 0], bump: 0.8 },
    airless: true,
    info: {
      type: 'Moon of Mars',
      stats: [['Size', '15 × 12 × 10 km'], ['Orbit', '30.3 hours'], ['Altitude', '20,000 km']],
      facts: [
        'From Mars it looks like a bright star, not a moon.',
        'A thick layer of dust smooths over most of its craters.',
        'Phobos and Deimos may be captured asteroids, or rubble from a giant impact on Mars.',
      ],
    },
  },
  {
    id: 'ceres', sys: 'sol', name: 'Ceres', kind: 'dwarf', parent: 'sun', radius: 469.7, color: '#9C9790',
    orbit: planetOrbit('ceres'), rot: S(291.418, 66.764, 170.65, 952.1532),
    tex: { style: 'rocky', feature: 'CERES', size: 1024, normal: 512, seed: 9, c1: [0.36, 0.35, 0.34], c2: [0.29, 0.28, 0.27], c3: [0.55, 0.54, 0.52], prm: [0.9, 0.4, 0.4, 0], bump: 1.0 },
    airless: true,
    info: {
      type: 'Dwarf planet (asteroid belt)',
      stats: [['Radius', '470 km'], ['Gravity', '0.28 m/s²'], ['Day', '9 h 4 min'], ['Year', '4.6 years']],
      facts: [
        'The largest object in the asteroid belt, holding about a third of its mass.',
        'The bright spots in Occator crater are salts left behind by briny water.',
        'NASA\'s Dawn spacecraft orbited it from 2015 to 2018.',
      ],
    },
  },
  {
    id: 'jupiter', sys: 'sol', name: 'Jupiter', kind: 'planet', parent: 'sun', radius: 71492, oblate: 0.9351, color: '#E3C8A0',
    orbit: planetOrbit('jupiter'), rot: S(268.056595, 64.495303, 284.95, 870.536),
    tex: { style: 'gas', feature: 'JUPITER', size: 2048, seed: 11, bands: 'jupiter', prm: [4.0, 4.0, 1.6, 2.2] },
    atmo: { color: [0.75, 0.7, 0.6], sunset: [0.8, 0.5, 0.3], height: 0.012, density: 0.22, haze: 0.1 },
    rings: { inner: 1.72, outer: 1.81, profile: 'jupiter' },
    gas: true,
    info: {
      type: 'Gas giant',
      stats: [['Radius', '71,492 km (11 Earths)'], ['Mass', '318 Earths'], ['Gravity', '24.8 m/s²'], ['Day', '9 h 56 min'], ['Year', '11.9 years'], ['Temperature', '−108 °C (cloud tops)'], ['Moons', '95+']],
      facts: [
        'It is more than twice as massive as all the other planets put together.',
        'The Great Red Spot is a storm wider than Earth that has raged for centuries.',
        'It spins so fast that it bulges at the equator.',
        'It has faint rings of dust that are hard to see.',
      ],
    },
  },
  {
    id: 'io', sys: 'sol', name: 'Io', kind: 'moon', parent: 'jupiter', radius: 1821.6, color: '#E8D46A',
    orbit: moonOrbit(421700, 1.769138, 0.05, 106), rot: { locked: true },
    tex: { style: 'io', size: 1024, normal: 512, seed: 12, bump: 0.5 },
    airless: true,
    info: {
      type: 'Moon of Jupiter',
      stats: [['Radius', '1,822 km'], ['Gravity', '1.8 m/s²'], ['Orbit', '1.8 days']],
      facts: [
        'The most volcanic world known, with more than 400 active volcanoes.',
        'Jupiter\'s tides squeeze and heat its insides.',
        'Its yellows, oranges and whites are sulfur and frozen sulfur dioxide.',
      ],
    },
  },
  {
    id: 'europa', sys: 'sol', name: 'Europa', kind: 'moon', parent: 'jupiter', radius: 1560.8, color: '#E6DCC6',
    orbit: moonOrbit(671034, 3.551181, 0.47, 176), rot: { locked: true },
    tex: { style: 'europa', size: 1024, normal: 512, seed: 13, bump: 0.6 },
    airless: true,
    info: {
      type: 'Moon of Jupiter',
      stats: [['Radius', '1,561 km'], ['Gravity', '1.3 m/s²'], ['Orbit', '3.6 days']],
      facts: [
        'Under its ice lies a salty ocean with about twice as much water as all of Earth\'s oceans.',
        'One of the best places to look for life beyond Earth.',
        'The reddish cracks may be salts pushed up from the ocean below.',
        'NASA\'s Europa Clipper spacecraft arrives in 2030.',
      ],
    },
  },
  {
    id: 'ganymede', sys: 'sol', name: 'Ganymede', kind: 'moon', parent: 'jupiter', radius: 2634.1, color: '#A89E90',
    orbit: moonOrbit(1070412, 7.154553, 0.2, 121), rot: { locked: true },
    tex: { style: 'rocky', feature: 'GANYMEDE', size: 1024, normal: 512, seed: 14, c1: [0.62, 0.59, 0.55], c2: [0.38, 0.34, 0.30], c3: [0.85, 0.84, 0.82], prm: [0.8, 0.9, 0.6, 0], bump: 0.9 },
    airless: true,
    info: {
      type: 'Moon of Jupiter',
      stats: [['Radius', '2,634 km'], ['Gravity', '1.4 m/s²'], ['Orbit', '7.2 days']],
      facts: [
        'The largest moon in the Solar System, bigger than the planet Mercury.',
        'The only moon with its own magnetic field.',
        'A saltwater ocean may lie about 150 km beneath its surface.',
      ],
    },
  },
  {
    id: 'callisto', sys: 'sol', name: 'Callisto', kind: 'moon', parent: 'jupiter', radius: 2410.3, color: '#7E7266',
    orbit: moonOrbit(1882709, 16.689018, 0.19, 84), rot: { locked: true },
    tex: { style: 'rocky', feature: 'CALLISTO', size: 1024, normal: 512, seed: 15, c1: [0.36, 0.32, 0.28], c2: [0.27, 0.24, 0.21], c3: [0.82, 0.8, 0.76], prm: [1.0, 0.5, 1.0, 0], bump: 1.0 },
    airless: true,
    info: {
      type: 'Moon of Jupiter',
      stats: [['Radius', '2,410 km'], ['Gravity', '1.2 m/s²'], ['Orbit', '16.7 days']],
      facts: [
        'The most heavily cratered object in the Solar System.',
        'Its surface is about 4 billion years old and has barely changed since.',
        'The bright ringed scar is Valhalla, an impact basin 3,800 km across.',
      ],
    },
  },
  {
    id: 'saturn', sys: 'sol', name: 'Saturn', kind: 'planet', parent: 'sun', radius: 60268, oblate: 0.9020, color: '#EAD9A6',
    orbit: planetOrbit('saturn'), rot: S(40.589, 83.537, 38.90, 810.7939024),
    tex: { style: 'gas', feature: 'SATURN', size: 2048, seed: 16, bands: 'saturn', prm: [7.0, 1.2, 0.5, 0.6] },
    atmo: { color: [0.85, 0.78, 0.6], sunset: [0.8, 0.5, 0.3], height: 0.012, density: 0.2, haze: 0.1 },
    rings: { inner: 1.11, outer: 2.33, profile: 'saturn' },
    gas: true,
    info: {
      type: 'Gas giant',
      stats: [['Radius', '60,268 km (9.5 Earths)'], ['Mass', '95 Earths'], ['Gravity', '10.4 m/s²'], ['Day', '10 h 34 min'], ['Year', '29.5 years'], ['Temperature', '−139 °C'], ['Moons', '274']],
      facts: [
        'It is less dense than water: it would float in a big enough bath.',
        'The rings span 270,000 km but are mostly only about 10 metres thick.',
        'A six-sided jet stream, the hexagon, circles its north pole.',
        'Look for the planet\'s shadow falling across the rings.',
      ],
    },
  },
  {
    id: 'mimas', sys: 'sol', name: 'Mimas', kind: 'moon', parent: 'saturn', radius: 198.2, color: '#C9C6C0',
    orbit: moonOrbit(185539, 0.942422, 1.57, 10), rot: { locked: true },
    tex: { style: 'rocky', feature: 'MIMAS', size: 1024, normal: 512, seed: 17, c1: [0.78, 0.77, 0.75], c2: [0.66, 0.65, 0.63], c3: [0.9, 0.9, 0.88], prm: [1.0, 0.3, 0.3, 0], bump: 1.2 },
    airless: true,
    info: {
      type: 'Moon of Saturn',
      stats: [['Radius', '198 km'], ['Orbit', '22.6 hours']],
      facts: [
        'Its giant crater Herschel makes it look like the Death Star.',
        'Herschel is 139 km wide, about a third of the moon\'s width.',
        'In 2024 scientists found signs of a young ocean under its ice.',
      ],
    },
  },
  {
    id: 'enceladus', sys: 'sol', name: 'Enceladus', kind: 'moon', parent: 'saturn', radius: 252.1, color: '#F2F6FA',
    orbit: moonOrbit(237948, 1.370218, 0.01, 200), rot: { locked: true },
    tex: { style: 'rocky', feature: 'ENCELADUS', size: 1024, normal: 512, seed: 18, c1: [0.95, 0.96, 0.97], c2: [0.86, 0.9, 0.93], c3: [1.0, 1.0, 1.0], c4: [0.48, 0.66, 0.78], prm: [0.55, 0.3, 0.0, 0], bump: 0.8 },
    airless: true,
    info: {
      type: 'Moon of Saturn',
      stats: [['Radius', '252 km'], ['Orbit', '1.4 days'], ['Brightness', 'Reflects about 99% of sunlight']],
      facts: [
        'The whitest, most reflective body in the Solar System.',
        'Geysers at its south pole spray water from an ocean beneath the ice.',
        'That spray feeds Saturn\'s faint E ring.',
      ],
    },
  },
  {
    id: 'titan', sys: 'sol', name: 'Titan', kind: 'moon', parent: 'saturn', radius: 2574.7, color: '#E0A85A',
    orbit: moonOrbit(1221870, 15.945, 0.35, 120), rot: { locked: true },
    tex: { style: 'titan', size: 1024, seed: 19 },
    atmo: { color: [0.95, 0.55, 0.18], sunset: [0.6, 0.3, 0.08], height: 0.08, density: 0.7, haze: 0.35 },
    info: {
      type: 'Moon of Saturn',
      stats: [['Radius', '2,575 km'], ['Gravity', '1.35 m/s²'], ['Orbit', '15.9 days'], ['Temperature', '−179 °C']],
      facts: [
        'The only moon with a thick atmosphere, denser than Earth\'s.',
        'It has rivers, lakes and seas, but they are liquid methane and ethane.',
        'ESA\'s Huygens probe landed there in 2005: the most distant landing ever.',
        'NASA\'s Dragonfly drone is due to arrive in 2034.',
      ],
    },
  },
  {
    id: 'iapetus', sys: 'sol', name: 'Iapetus', kind: 'moon', parent: 'saturn', radius: 734.5, color: '#B0A48E',
    orbit: moonOrbit(3560820, 79.3215, 15.47, 60), rot: { locked: true },
    tex: { style: 'rocky', feature: 'IAPETUS', size: 1024, normal: 512, seed: 20, c1: [0.84, 0.8, 0.72], c2: [0.72, 0.68, 0.6], c3: [0.9, 0.88, 0.82], c4: [0.13, 0.09, 0.06], prm: [0.9, 0.3, 0.3, 0], bump: 1.0 },
    airless: true,
    info: {
      type: 'Moon of Saturn',
      stats: [['Radius', '735 km'], ['Orbit', '79.3 days']],
      facts: [
        'One side is as dark as coal, the other as bright as snow.',
        'A ridge up to 20 km high runs along part of its equator.',
        'Its tilted orbit gives the best view of Saturn\'s rings.',
      ],
    },
  },
  {
    id: 'uranus', sys: 'sol', name: 'Uranus', kind: 'planet', parent: 'sun', radius: 25559, oblate: 0.9771, color: '#A9E3E8',
    orbit: planetOrbit('uranus'), rot: S(257.311, -15.175, 203.81, -501.1600928),
    tex: { style: 'gas', feature: 'URANUS', size: 1024, seed: 21, bands: 'uranus', prm: [6.0, 0.6, 0.2, 0.25] },
    atmo: { color: [0.5, 0.8, 0.95], sunset: [0.4, 0.7, 0.8], height: 0.015, density: 0.28, haze: 0.14 },
    rings: { inner: 1.6, outer: 2.02, profile: 'uranus' },
    gas: true,
    info: {
      type: 'Ice giant',
      stats: [['Radius', '25,559 km (4 Earths)'], ['Mass', '14.5 Earths'], ['Gravity', '8.9 m/s²'], ['Day', '17 h 14 min'], ['Year', '84 years'], ['Temperature', '−197 °C'], ['Moons', '29']],
      facts: [
        'It rolls around the Sun on its side, tipped over by 98°.',
        'Each pole gets 42 years of daylight, then 42 years of night.',
        'Methane in its air soaks up red light, so it looks blue-green.',
        'Its thin dark rings stand almost upright.',
      ],
    },
  },
  {
    id: 'miranda', sys: 'sol', name: 'Miranda', kind: 'moon', parent: 'uranus', radius: 235.8, color: '#B8B8BA',
    orbit: moonOrbit(129390, 1.413479, 4.23, 30), rot: { locked: true },
    tex: { style: 'rocky', feature: 'MIRANDA', size: 1024, normal: 512, seed: 22, c1: [0.72, 0.72, 0.73], c2: [0.55, 0.55, 0.56], c3: [0.88, 0.88, 0.88], prm: [0.5, 0.5, 0.2, 0], bump: 1.1 },
    airless: true,
    info: {
      type: 'Moon of Uranus',
      stats: [['Radius', '236 km'], ['Orbit', '1.4 days']],
      facts: [
        'Its cliff Verona Rupes may be the tallest in the Solar System, about 20 km.',
        'Its patchwork surface looks as if it was smashed apart and stuck back together.',
      ],
    },
  },
  {
    id: 'titania', sys: 'sol', name: 'Titania', kind: 'moon', parent: 'uranus', radius: 788.4, color: '#A09790',
    orbit: moonOrbit(435910, 8.705872, 0.08, 250), rot: { locked: true },
    tex: { style: 'rocky', feature: 'TITANIA', size: 1024, normal: 512, seed: 23, c1: [0.56, 0.53, 0.51], c2: [0.44, 0.41, 0.4], c3: [0.75, 0.73, 0.7], prm: [0.9, 0.4, 0.4, 0], bump: 1.0 },
    airless: true,
    info: {
      type: 'Moon of Uranus',
      stats: [['Radius', '788 km'], ['Orbit', '8.7 days']],
      facts: [
        'The largest of Uranus\' 29 known moons.',
        'Huge canyons, some over 1,500 km long, scar its icy surface.',
      ],
    },
  },
  {
    id: 'neptune', sys: 'sol', name: 'Neptune', kind: 'planet', parent: 'sun', radius: 24764, oblate: 0.9829, color: '#5B7CFF',
    orbit: planetOrbit('neptune'), rot: S(299.36, 43.46, 249.978, 541.1397757),
    tex: { style: 'gas', feature: 'NEPTUNE', size: 1024, seed: 24, bands: 'neptune', prm: [6.0, 1.5, 0.6, 0.5] },
    atmo: { color: [0.3, 0.5, 1.0], sunset: [0.3, 0.4, 0.8], height: 0.015, density: 0.35, haze: 0.16 },
    rings: { inner: 1.65, outer: 2.56, profile: 'neptune' },
    gas: true,
    info: {
      type: 'Ice giant',
      stats: [['Radius', '24,764 km (3.9 Earths)'], ['Mass', '17 Earths'], ['Gravity', '11.2 m/s²'], ['Day', '16 h 6 min'], ['Year', '165 years'], ['Temperature', '−201 °C'], ['Moons', '16']],
      facts: [
        'Its winds reach 2,100 km/h, the fastest in the Solar System.',
        'It was found with maths before anyone saw it, in 1846.',
        'It finished its first orbit since being discovered in 2011.',
      ],
    },
  },
  {
    id: 'triton', sys: 'sol', name: 'Triton', kind: 'moon', parent: 'neptune', radius: 1353.4, color: '#D9C4BA',
    orbit: moonOrbit(354759, 5.876854, 156.885, 0), rot: { locked: true },
    tex: { style: 'triton', size: 1024, normal: 512, seed: 25, bump: 0.6 },
    airless: true,
    info: {
      type: 'Moon of Neptune',
      stats: [['Radius', '1,353 km'], ['Orbit', '5.9 days, backwards'], ['Temperature', '−235 °C']],
      facts: [
        'It orbits backwards, so it was probably a Kuiper Belt object that Neptune captured.',
        'Geysers of nitrogen shoot dark plumes 8 km high.',
        'One of the coldest surfaces ever measured.',
      ],
    },
  },
  {
    id: 'pluto', sys: 'sol', name: 'Pluto', kind: 'dwarf', parent: 'sun', radius: 1188.3, color: '#D8BC9A',
    orbit: planetOrbit('pluto'), rot: S(132.993, -6.163, 302.695, -56.3625225),
    tex: { style: 'pluto', size: 1024, normal: 512, seed: 26, bump: 0.8 },
    atmo: { color: [0.45, 0.6, 0.95], sunset: [0.4, 0.5, 0.8], height: 0.02, density: 0.15, haze: 0.05 },
    info: {
      type: 'Dwarf planet (Kuiper Belt)',
      stats: [['Radius', '1,188 km'], ['Mass', '0.002 Earths'], ['Gravity', '0.62 m/s²'], ['Day', '6.4 days'], ['Year', '248 years'], ['Temperature', '−232 °C'], ['Moons', '5']],
      facts: [
        'The pale heart, Tombaugh Regio, is a vast plain of frozen nitrogen.',
        'NASA\'s New Horizons flew past in July 2015.',
        'It was reclassified as a dwarf planet in 2006.',
        'Its thin air freezes and falls as snow when it drifts far from the Sun.',
      ],
    },
  },
  {
    id: 'charon', sys: 'sol', name: 'Charon', kind: 'moon', parent: 'pluto', radius: 606, color: '#A8A29C',
    orbit: moonOrbit(19591, 6.3872, 0.08, 0), rot: { locked: true },
    tex: { style: 'rocky', feature: 'CHARON', size: 1024, normal: 512, seed: 27, c1: [0.62, 0.6, 0.58], c2: [0.5, 0.48, 0.46], c3: [0.75, 0.74, 0.72], c4: [0.42, 0.24, 0.16], prm: [0.7, 0.4, 0.3, 0], bump: 1.0 },
    airless: true,
    info: {
      type: 'Moon of Pluto',
      stats: [['Radius', '606 km'], ['Orbit', '6.4 days']],
      facts: [
        'It is half Pluto\'s size, so the two circle a point in space between them.',
        'Pluto and Charon always show each other the same face.',
        'Its red north pole, Mordor Macula, is stained by gas escaping from Pluto.',
      ],
    },
  },
  {
    id: 'halley', sys: 'sol', name: 'Halley\'s Comet', kind: 'comet', parent: 'sun', radius: 5.5, shape: [7.5, 4.0, 4.0], color: '#BFE4FF',
    orbit: { a: 17.834, unit: 'au', e: 0.96714, i: 162.26, node: 58.42, peri: 111.33, tp: -5074.5, P: 27510, frame: 'ecliptic' },
    rot: S(0, 90, 0, 164),
    tex: { style: 'rocky', feature: 'COMET', size: 512, normal: 256, seed: 28, c1: [0.34, 0.32, 0.3], c2: [0.24, 0.23, 0.22], c3: [0.45, 0.44, 0.42], prm: [0.4, 0.8, 0.1, 0], bump: 1.4 },
    airless: true, comet: true,
    info: {
      type: 'Comet',
      stats: [['Nucleus', '15 × 8 km'], ['Orbit', '76 years'], ['Last visit', '1986'], ['Next visit', '28 July 2061']],
      facts: [
        'It is out near the orbit of Neptune now, turning around for the trip back.',
        'Speed up time to watch it fall toward the Sun and grow a tail.',
        'Its dust makes two meteor showers: the Eta Aquariids and the Orionids.',
        'Its nucleus is one of the darkest objects in the Solar System, as black as charcoal.',
      ],
    },
  },

  // ───────────────────────────── Alpha Centauri ─────────────────────────────
  {
    id: 'alphacenA', sys: 'alphacen', name: 'Alpha Centauri A', kind: 'star', radius: 851130, color: '#FFE6B0',
    star: { temp: 5790, lum: 1.519 },
    orbit: { binary: true, a: 23.4, e: 0.5179, i: 0, node: 0, peri: 231.65, M0: 199.8, P: 29187, frac: -0.457 },
    rot: S(0, 90, 0, 16),
    info: {
      type: 'G2V yellow dwarf star',
      stats: [['Radius', '1.22 Suns'], ['Mass', '1.08 Suns'], ['Surface', '5,520 °C'], ['Brightness', '1.5 Suns'], ['Distance from Sun', '4.37 light-years']],
      facts: [
        'Almost a twin of the Sun, a little bigger and a bit older.',
        'Together with B it is the third-brightest star in Earth\'s night sky.',
        'Its habitable zone sits about 1.2 AU out, a little farther than Earth is from the Sun.',
      ],
    },
  },
  {
    id: 'alphacenB', sys: 'alphacen', name: 'Alpha Centauri B', kind: 'star', radius: 600530, color: '#FFC27A',
    star: { temp: 5260, lum: 0.5 },
    orbit: { binary: true, a: 23.4, e: 0.5179, i: 0, node: 0, peri: 231.65, M0: 199.8, P: 29187, frac: 0.543 },
    rot: S(0, 90, 0, 9),
    info: {
      type: 'K1V orange dwarf star',
      stats: [['Radius', '0.86 Suns'], ['Mass', '0.91 Suns'], ['Surface', '5,000 °C'], ['Brightness', '0.5 Suns'], ['Orbit around A', '79.9 years']],
      facts: [
        'A and B swing between 11 and 36 AU apart as they orbit each other.',
        'They are next closest to each other in 2035.',
        'From a planet here, you would see two suns in the sky.',
      ],
    },
  },
  {
    id: 'alphacenAb', sys: 'alphacen', name: 'Alpha Centauri Ab', kind: 'exoplanet', parent: 'alphacenA', radius: 64000, oblate: 0.96, color: '#DCD6C0',
    candidate: true,
    orbit: { a: 1.6, unit: 'au', e: 0.3, i: 4, node: 30, peri: 60, M0: 120, P: 712, frame: 'system' },
    rot: S(0, 88, 0, 700),
    tex: { style: 'gas', feature: 'EXOGAS', size: 1024, seed: 31, bands: 'alphacenAb', prm: [5.0, 1.8, 0.5, 0.6] },
    atmo: { color: [0.8, 0.85, 1.0], sunset: [0.8, 0.5, 0.3], height: 0.014, density: 0.45, haze: 0.14 },
    gas: true,
    info: {
      type: 'Candidate gas giant (unconfirmed)',
      stats: [['Mass', '~90–150 Earths (estimate)'], ['Orbit', '~1–2 AU'], ['Found', 'JWST, 2025']],
      facts: [
        'A possible giant planet spotted by the James Webb Space Telescope in 2025. It is not confirmed yet.',
        'If it is real, it orbits in A\'s habitable zone, but a gas giant has no surface to stand on.',
        'Nobody knows what it looks like; this cool, Saturn-like world is a guess.',
      ],
    },
  },

  // ───────────────────────────── Proxima Centauri ─────────────────────────────
  {
    id: 'proxima', sys: 'proxima', name: 'Proxima Centauri', kind: 'star', radius: 107280, color: '#FF8A5C',
    star: { temp: 3042, lum: 0.00155 }, flare: true,
    rot: S(0, 90, 0, 4.2),
    info: {
      type: 'M5.5V red dwarf star',
      stats: [['Radius', '0.15 Suns'], ['Mass', '0.12 Suns'], ['Surface', '2,770 °C'], ['Brightness', '0.0016 Suns'], ['Distance from Sun', '4.25 light-years']],
      facts: [
        'The closest star to the Sun.',
        'A flare star: it can suddenly brighten many times over in minutes.',
        'It orbits Alpha Centauri A and B about once every 550,000 years.',
        'Red dwarfs like this can shine for trillions of years.',
      ],
    },
  },
  {
    id: 'proximab', sys: 'proxima', name: 'Proxima b', kind: 'exoplanet', parent: 'proxima', radius: 7000, color: '#8FB6D8',
    orbit: { a: 0.04856, unit: 'au', e: 0.02, i: 0, node: 0, peri: 0, M0: 40, P: 11.1868, frame: 'system' },
    rot: { locked: true },
    tex: { style: 'eyeball', size: 1024, aux: 1024, seed: 32, c1: [0.03, 0.1, 0.22], c2: [0.42, 0.33, 0.24], c3: [0.86, 0.9, 0.95], c4: [0.55, 0.6, 0.68], prm: [38, 1, 0, 0] },
    atmo: { color: [0.45, 0.6, 1.0], sunset: [1.0, 0.45, 0.2], height: 0.02, density: 0.8, haze: 0.22 },
    clouds: 'eyeball', ocean: true,
    info: {
      type: 'Rocky exoplanet',
      stats: [['Mass', 'At least 1.07 Earths'], ['Orbit', '11.2 days'], ['Distance from star', '7.3 million km'], ['Temperature', '~ −39 °C (if airless)']],
      facts: [
        'It orbits in the habitable zone, where liquid water could exist.',
        'It is probably tidally locked, with one side in endless day.',
        'Flares from its star could strip away an atmosphere. Nobody knows yet if it has one.',
        'This "eyeball" look, an ocean facing the star inside a shell of ice, is one educated guess.',
      ],
    },
  },
  {
    id: 'proximad', sys: 'proxima', name: 'Proxima d', kind: 'exoplanet', parent: 'proxima', radius: 5100, color: '#A08A7A',
    orbit: { a: 0.02885, unit: 'au', e: 0.04, i: 0, node: 0, peri: 0, M0: 200, P: 5.122, frame: 'system' },
    rot: { locked: true },
    tex: { style: 'rocky', feature: 'EXOROCK', size: 1024, normal: 512, seed: 33, c1: [0.42, 0.35, 0.3], c2: [0.3, 0.25, 0.22], c3: [0.55, 0.48, 0.42], prm: [0.8, 0.8, 0.3, 0], bump: 1.0 },
    airless: true,
    info: {
      type: 'Rocky exoplanet',
      stats: [['Mass', 'At least 0.26 Earths'], ['Orbit', '5.1 days'], ['Found', '2022']],
      facts: [
        'One of the lightest planets ever found by watching a star wobble.',
        'Too close to its star for liquid water.',
      ],
    },
  },

  // ───────────────────────────── TRAPPIST-1 ─────────────────────────────
  {
    id: 'trappist1', sys: 'trappist', name: 'TRAPPIST-1', kind: 'star', radius: 82930, color: '#FF6A3D',
    star: { temp: 2566, lum: 0.000553 },
    rot: S(0, 90, 0, 110),
    info: {
      type: 'M8V ultracool red dwarf',
      stats: [['Radius', '0.12 Suns (a bit bigger than Jupiter)'], ['Mass', '0.09 Suns'], ['Surface', '2,300 °C'], ['Brightness', '0.0006 Suns'], ['Distance from Sun', '40.7 light-years']],
      facts: [
        'It has seven Earth-sized planets, all closer to it than Mercury is to the Sun.',
        'It is barely bigger than Jupiter and only just massive enough to be a star.',
        'It will keep shining for about 12 trillion years.',
      ],
    },
  },
  ...[
    ['b', 1.116, 0.01154, 1.51088, 'rocky', 'EXOROCK', [0.23, 0.21, 0.2], [0.14, 0.13, 0.13], 'Bare rock, as dark as basalt', ['JWST found no thick atmosphere; its dayside is about 230 °C.']],
    ['c', 1.097, 0.01580, 2.42180, 'rocky', 'EXOROCK', [0.46, 0.4, 0.34], [0.33, 0.28, 0.24], 'Rocky, probably airless', ['JWST rules out a thick Venus-like carbon dioxide atmosphere.']],
    ['d', 0.788, 0.02227, 4.04980, 'eyeball', null, null, null, 'Rocky, maybe with water', ['It sits at the inner edge of the habitable zone.', 'Its low density hints at water, as ice or as a deep ocean.']],
    ['e', 0.920, 0.02925, 6.09960, 'eyeball', null, null, null, 'Rocky, in the habitable zone', ['The best bet in the system for liquid water.', 'Its density matches a rocky, Earth-like world.']],
    ['f', 1.045, 0.03849, 9.20750, 'iceworld', null, [0.84, 0.88, 0.92], [0.55, 0.62, 0.72], 'Probably an ice world', ['It may be covered in ice with an ocean underneath.']],
    ['g', 1.129, 0.04683, 12.35290, 'iceworld', null, [0.86, 0.88, 0.9], [0.62, 0.66, 0.72], 'Probably an ice world', ['The largest of the seven planets.']],
    ['h', 0.755, 0.06189, 18.7729, 'iceworld', null, [0.8, 0.82, 0.86], [0.5, 0.52, 0.58], 'Frozen world', ['The outermost and coldest, likely frozen solid.']],
  ].map(([k, r, a, P, style, feature, c1, c2, look, facts], idx) => {
    const eye = style === 'eyeball';
    const body = {
      id: 'trappist' + k, sys: 'trappist', name: 'TRAPPIST-1' + k, kind: 'exoplanet', parent: 'trappist1', radius: r * 6371,
      color: eye ? '#8FB6D8' : style === 'iceworld' ? '#DDE7F2' : '#9A8C80',
      orbit: { a, unit: 'au', e: 0.005, i: 0.2, node: 0, peri: 0, M0: idx * 97 + 20, P, frame: 'system' },
      rot: { locked: true },
      info: {
        type: look,
        stats: [['Radius', `${r.toFixed(2)} Earths`], ['Year', `${P.toFixed(2)} days`], ['Distance from star', `${(a * AU_KM / 1e6).toFixed(1)} million km`]],
        facts: [...facts, 'From here the other planets can look bigger than the Moon does from Earth.'],
      },
    };
    if (style === 'rocky') {
      body.tex = { style, feature, size: 1024, normal: 512, seed: 40 + idx, c1, c2, c3: [0.55, 0.52, 0.5], prm: [0.8, 0.8, 0.2, 0], bump: 1.0 };
      body.airless = true;
    } else if (eye) {
      body.tex = { style: 'eyeball', size: 1024, aux: 1024, seed: 40 + idx, c1: [0.03, 0.1, 0.22], c2: [0.45, 0.36, 0.27], c3: [0.88, 0.9, 0.94], c4: [0.52, 0.56, 0.62], prm: [k === 'e' ? 48 : 26, 1, 0, 0] };
      body.atmo = { color: [0.45, 0.6, 1.0], sunset: [1.0, 0.45, 0.2], height: 0.02, density: k === 'e' ? 0.9 : 0.5, haze: 0.2 };
      body.clouds = 'eyeball'; body.ocean = true;
    } else {
      body.tex = { style, size: 1024, normal: 512, seed: 40 + idx, c1, c2, c3: [0.4, 0.46, 0.55], prm: [k === 'f' ? 14 : 0, 0, 0, 0], bump: 0.6 };
      body.airless = true;
    }
    return body;
  }),

  // ───────────────────────────── Sagittarius A* ─────────────────────────────
  {
    id: 'sgra', sys: 'sgra', name: 'Sagittarius A*', kind: 'blackhole', radius: 1.27e7, color: '#FFB35A',
    info: {
      type: 'Supermassive black hole',
      stats: [['Mass', '4.3 million Suns'], ['Event horizon', '25 million km across'], ['Distance from Sun', '26,670 light-years'], ['Spin', 'Not shown (drawn non-spinning)']],
      facts: [
        'The Event Horizon Telescope took the first picture of its shadow in 2022.',
        'Light bends around it, so you can see the far side of the glowing disc above and below the hole.',
        'The side of the disc turning toward you looks brighter, because its light is beamed ahead of it.',
        'Near the horizon time runs slow: watch the time dilation readout as you get close.',
        'The real disc is dim and hard to see. It is brightened here so you can see it.',
      ],
    },
  },
];

export const BODY = Object.fromEntries(BODIES.map((b) => [b.id, b]));

// Gas giant cloud bands: [latitude°, sRGB colour] stops.
export const BANDS = {
  jupiter: [
    [-90, [0.5, 0.47, 0.44]], [-60, [0.58, 0.54, 0.48]], [-48, [0.66, 0.6, 0.52]], [-41, [0.8, 0.75, 0.66]],
    [-36, [0.62, 0.52, 0.42]], [-31, [0.84, 0.8, 0.72]], [-27, [0.7, 0.56, 0.44]], [-21, [0.9, 0.85, 0.76]],
    [-18, [0.66, 0.47, 0.33]], [-9, [0.72, 0.52, 0.37]], [-6, [0.92, 0.86, 0.74]], [0, [0.88, 0.8, 0.66]],
    [6, [0.93, 0.88, 0.78]], [8, [0.6, 0.43, 0.3]], [17, [0.64, 0.46, 0.33]], [19, [0.9, 0.86, 0.78]],
    [24, [0.86, 0.82, 0.74]], [26, [0.64, 0.5, 0.38]], [30, [0.7, 0.58, 0.46]], [33, [0.86, 0.81, 0.72]],
    [37, [0.7, 0.6, 0.5]], [41, [0.8, 0.76, 0.68]], [48, [0.66, 0.6, 0.52]], [60, [0.58, 0.54, 0.49]], [90, [0.5, 0.47, 0.45]],
  ],
  saturn: [
    [-90, [0.62, 0.6, 0.52]], [-70, [0.72, 0.66, 0.52]], [-55, [0.8, 0.72, 0.54]], [-45, [0.86, 0.78, 0.58]],
    [-38, [0.78, 0.68, 0.5]], [-30, [0.88, 0.8, 0.6]], [-20, [0.84, 0.74, 0.54]], [-10, [0.93, 0.86, 0.66]],
    [0, [0.95, 0.89, 0.7]], [10, [0.93, 0.85, 0.64]], [20, [0.84, 0.74, 0.54]], [30, [0.88, 0.8, 0.6]],
    [40, [0.78, 0.7, 0.54]], [50, [0.74, 0.7, 0.6]], [62, [0.62, 0.64, 0.62]], [75, [0.52, 0.58, 0.62]], [90, [0.45, 0.5, 0.56]],
  ],
  uranus: [
    [-90, [0.6, 0.8, 0.84]], [-60, [0.56, 0.78, 0.83]], [-30, [0.52, 0.75, 0.81]], [-10, [0.5, 0.73, 0.8]],
    [0, [0.51, 0.74, 0.8]], [15, [0.49, 0.72, 0.79]], [35, [0.52, 0.75, 0.81]], [55, [0.58, 0.8, 0.84]], [90, [0.66, 0.85, 0.88]],
  ],
  neptune: [
    [-90, [0.3, 0.42, 0.8]], [-70, [0.26, 0.4, 0.84]], [-50, [0.3, 0.46, 0.88]], [-35, [0.22, 0.36, 0.8]],
    [-22, [0.27, 0.42, 0.86]], [-8, [0.2, 0.34, 0.78]], [5, [0.25, 0.4, 0.84]], [20, [0.22, 0.36, 0.8]],
    [35, [0.28, 0.44, 0.86]], [55, [0.24, 0.38, 0.8]], [90, [0.3, 0.42, 0.78]],
  ],
  alphacenAb: [
    [-90, [0.62, 0.66, 0.72]], [-55, [0.72, 0.74, 0.76]], [-35, [0.84, 0.82, 0.76]], [-20, [0.76, 0.72, 0.64]],
    [-8, [0.9, 0.87, 0.8]], [0, [0.86, 0.82, 0.74]], [8, [0.92, 0.88, 0.8]], [20, [0.74, 0.7, 0.62]],
    [35, [0.84, 0.82, 0.76]], [55, [0.7, 0.72, 0.74]], [90, [0.6, 0.64, 0.7]],
  ],
};

// The brightest stars: [name, RA hours, Dec°, V magnitude, B−V colour].
export const STARS = [
  ['Sirius', 6.752, -16.716, -1.46, 0.0], ['Canopus', 6.399, -52.696, -0.74, 0.15], ['Arcturus', 14.261, 19.182, -0.05, 1.23],
  ['Vega', 18.616, 38.784, 0.03, 0.0], ['Capella', 5.278, 45.998, 0.08, 0.8], ['Rigel', 5.242, -8.202, 0.13, -0.03],
  ['Procyon', 7.655, 5.225, 0.34, 0.42], ['Achernar', 1.629, -57.237, 0.46, -0.16], ['Betelgeuse', 5.919, 7.407, 0.5, 1.85],
  ['Hadar', 14.064, -60.373, 0.61, -0.23], ['Altair', 19.846, 8.868, 0.76, 0.22], ['Acrux', 12.443, -63.099, 0.76, -0.24],
  ['Aldebaran', 4.599, 16.509, 0.86, 1.54], ['Antares', 16.49, -26.432, 0.96, 1.83], ['Spica', 13.42, -11.161, 0.97, -0.23],
  ['Pollux', 7.755, 28.026, 1.14, 1.0], ['Fomalhaut', 22.961, -29.622, 1.16, 0.09], ['Deneb', 20.69, 45.28, 1.25, 0.09],
  ['Mimosa', 12.795, -59.689, 1.25, -0.23], ['Regulus', 10.14, 11.967, 1.35, -0.11], ['Adhara', 6.977, -28.972, 1.5, -0.21],
  ['Castor', 7.577, 31.888, 1.58, 0.03], ['Gacrux', 12.519, -57.113, 1.63, 1.59], ['Shaula', 17.56, -37.104, 1.63, -0.22],
  ['Bellatrix', 5.419, 6.35, 1.64, -0.22], ['Elnath', 5.438, 28.608, 1.65, -0.13], ['Miaplacidus', 9.22, -69.717, 1.67, 0.07],
  ['Alnilam', 5.604, -1.202, 1.69, -0.18], ['Alnair', 22.137, -46.961, 1.74, -0.13], ['Alnitak', 5.679, -1.943, 1.77, -0.21],
  ['Alioth', 12.9, 55.96, 1.77, -0.02], ['Mirfak', 3.405, 49.861, 1.79, 0.48], ['Dubhe', 11.062, 61.751, 1.79, 1.07],
  ['Wezen', 7.14, -26.393, 1.83, 0.68], ['Kaus Australis', 18.403, -34.385, 1.85, -0.03], ['Alkaid', 13.792, 49.313, 1.86, -0.1],
  ['Sargas', 17.622, -42.998, 1.86, 0.4], ['Avior', 8.375, -59.51, 1.86, 1.28], ['Menkalinan', 5.992, 44.947, 1.9, 0.03],
  ['Atria', 16.811, -69.028, 1.91, 1.44], ['Alhena', 6.629, 16.399, 1.93, 0.0], ['Peacock', 20.427, -56.735, 1.94, -0.2],
  ['Polaris', 2.53, 89.264, 1.98, 0.6], ['Mirzam', 6.378, -17.956, 1.98, -0.23], ['Alphard', 9.46, -8.659, 1.99, 1.44],
  ['Hamal', 2.12, 23.462, 2.0, 1.15], ['Diphda', 0.726, -17.987, 2.04, 1.02], ['Nunki', 18.921, -26.297, 2.05, -0.13],
  ['Menkent', 14.111, -36.37, 2.06, 1.01], ['Alpheratz', 0.14, 29.091, 2.06, -0.11], ['Mirach', 1.162, 35.621, 2.05, 1.58],
  ['Beta Gruis', 22.711, -46.885, 2.07, 1.6], ['Kochab', 14.845, 74.156, 2.08, 1.47], ['Rasalhague', 17.582, 12.56, 2.08, 0.15],
  ['Algieba', 10.333, 19.842, 2.08, 1.13], ['Saiph', 5.796, -9.67, 2.09, -0.17], ['Algol', 3.136, 40.956, 2.1, -0.05],
  ['Almach', 2.065, 42.33, 2.1, 1.37], ['Denebola', 11.818, 14.572, 2.14, 0.09], ['Suhail', 9.133, -43.433, 2.21, 1.66],
  ['Aspidiske', 9.285, -59.275, 2.21, 0.18], ['Mintaka', 5.533, -0.299, 2.23, -0.22], ['Mizar', 13.399, 54.925, 2.23, 0.02],
  ['Sadr', 20.37, 40.257, 2.23, 0.67], ['Eltanin', 17.943, 51.489, 2.23, 1.52], ['Alphecca', 15.578, 26.715, 2.23, -0.02],
  ['Schedar', 0.675, 56.537, 2.24, 1.17], ['Naos', 8.06, -40.003, 2.25, -0.26], ['Caph', 0.153, 59.15, 2.28, 0.34],
  ['Dschubba', 16.006, -22.622, 2.29, -0.12], ['Larawag', 16.836, -34.293, 2.29, 1.15], ['Merak', 11.031, 56.382, 2.37, -0.02],
  ['Izar', 14.75, 27.074, 2.37, 0.97], ['Enif', 21.736, 9.875, 2.39, 1.52], ['Kappa Scorpii', 17.708, -39.03, 2.39, -0.22],
  ['Ankaa', 0.438, -42.306, 2.4, 1.09], ['Phecda', 11.897, 53.695, 2.44, 0.04], ['Sabik', 17.173, -15.725, 2.43, 0.06],
  ['Scheat', 23.063, 28.083, 2.42, 1.67], ['Alderamin', 21.31, 62.586, 2.45, 0.26], ['Aludra', 7.402, -29.303, 2.45, -0.08],
  ['Gamma Cassiopeiae', 0.945, 60.717, 2.47, -0.15], ['Markab', 23.079, 15.205, 2.49, -0.04], ['Gienah Cygni', 20.77, 33.97, 2.48, 1.03],
  ['Menkar', 3.038, 4.09, 2.54, 1.64], ['Zosma', 11.235, 20.524, 2.56, 0.12], ['Gienah', 12.263, -17.542, 2.59, -0.11],
  ['Ascella', 19.043, -29.88, 2.6, 0.08], ['Unukalhai', 15.738, 6.426, 2.63, 1.17], ['Kraz', 12.573, -23.397, 2.65, 0.89],
  ['Ruchbah', 1.43, 60.235, 2.68, 0.13], ['Muphrid', 13.911, 18.398, 2.68, 0.58], ['Lesath', 17.513, -37.296, 2.7, -0.22],
  ['Kaus Media', 18.35, -29.828, 2.72, 1.38], ['Tarazed', 19.771, 10.613, 2.72, 1.52], ['Porrima', 12.694, -1.449, 2.74, 0.36],
  ['Zubenelgenubi', 14.848, -16.042, 2.75, 0.15], ['Delta Crucis', 12.252, -58.749, 2.79, -0.23], ['Kaus Borealis', 18.466, -25.421, 2.81, 1.02],
  ['Tau Scorpii', 16.598, -28.216, 2.82, -0.25], ['Algenib', 0.22, 15.184, 2.83, -0.23], ['Vindemiatrix', 13.036, 10.959, 2.83, 0.94],
  ['Alcyone', 3.791, 24.105, 2.87, -0.09], ['Sigma Scorpii', 16.353, -25.593, 2.89, 0.13], ['Cor Caroli', 12.934, 38.318, 2.89, -0.12],
  ['Algorab', 12.498, -16.515, 2.94, -0.01], ['Ras Elased', 9.764, 23.774, 2.98, 0.81], ['Alnasl', 18.097, -30.424, 2.99, 1.0],
  ['Albireo', 19.512, 27.96, 3.05, 1.13], ['Rasalgethi', 17.244, 14.39, 3.1, 1.45], ['Segin', 1.907, 63.67, 3.37, -0.15],
  ['Megrez', 12.257, 57.033, 3.31, 0.08], ['Chertan', 11.237, 15.43, 3.33, 0.0], ['Meissa', 5.585, 9.934, 3.33, -0.16],
  ['Adhafera', 10.278, 23.417, 3.43, 0.31], ['Ain', 4.477, 19.18, 3.53, 1.01], ['Atlas', 3.819, 24.053, 3.62, -0.07],
  ['Electra', 3.748, 24.113, 3.7, -0.11], ['Maia', 3.764, 24.368, 3.87, -0.07], ['Merope', 3.772, 23.948, 4.18, -0.06],
  ['Taygeta', 3.753, 24.467, 4.3, -0.11],
];

export const CONSTELLATIONS = [
  ['Orion', [['Betelgeuse', 'Bellatrix'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Betelgeuse'], ['Alnitak', 'Saiph'], ['Saiph', 'Rigel'], ['Rigel', 'Mintaka'], ['Betelgeuse', 'Meissa'], ['Bellatrix', 'Meissa']]],
  ['Big Dipper', [['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid']]],
  ['Cassiopeia', [['Caph', 'Schedar'], ['Schedar', 'Gamma Cassiopeiae'], ['Gamma Cassiopeiae', 'Ruchbah'], ['Ruchbah', 'Segin']]],
  ['Southern Cross', [['Acrux', 'Gacrux'], ['Mimosa', 'Delta Crucis']]],
  ['Scorpius', [['Dschubba', 'Sigma Scorpii'], ['Sigma Scorpii', 'Antares'], ['Antares', 'Tau Scorpii'], ['Tau Scorpii', 'Larawag'], ['Larawag', 'Sargas'], ['Sargas', 'Kappa Scorpii'], ['Kappa Scorpii', 'Shaula'], ['Shaula', 'Lesath']]],
  ['Cygnus', [['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Sadr', 'Gienah Cygni']]],
  ['Leo', [['Regulus', 'Algieba'], ['Algieba', 'Adhafera'], ['Adhafera', 'Ras Elased'], ['Algieba', 'Zosma'], ['Zosma', 'Denebola'], ['Denebola', 'Chertan'], ['Chertan', 'Regulus']]],
  ['Canis Major', [['Sirius', 'Mirzam'], ['Sirius', 'Wezen'], ['Wezen', 'Adhara'], ['Wezen', 'Aludra']]],
  ['Gemini', [['Castor', 'Pollux'], ['Pollux', 'Alhena']]],
  ['Taurus', [['Aldebaran', 'Ain'], ['Ain', 'Elnath']]],
  ['Pegasus', [['Markab', 'Scheat'], ['Scheat', 'Alpheratz'], ['Alpheratz', 'Algenib'], ['Algenib', 'Markab'], ['Markab', 'Enif']]],
  ['Andromeda', [['Alpheratz', 'Mirach'], ['Mirach', 'Almach']]],
  ['Sagittarius', [['Kaus Australis', 'Kaus Media'], ['Kaus Media', 'Kaus Borealis'], ['Kaus Borealis', 'Nunki'], ['Nunki', 'Ascella'], ['Ascella', 'Kaus Australis'], ['Kaus Media', 'Alnasl'], ['Alnasl', 'Kaus Australis']]],
  ['Boötes', [['Arcturus', 'Izar'], ['Arcturus', 'Muphrid']]],
  ['Aquila', [['Altair', 'Tarazed']]],
];

export const KIND_LABEL = {
  star: 'Star', planet: 'Planet', dwarf: 'Dwarf planet', moon: 'Moon', comet: 'Comet', exoplanet: 'Exoplanet', blackhole: 'Black hole',
};
