/* Riftborn — the creatures: species data, elements, stats and fusion
   recipes. Their 3D models are built in beasts.js from the body plan,
   colours (dorsal, belly, accent) and features listed here. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';


  const ELEMENTS = {
    ember: { name: 'Ember', color: '#FF6A3D', icon: '🔥', move: 'Magma Burst' },
    tide: { name: 'Tide', color: '#3DB8FF', icon: '💧', move: 'Riptide' },
    gale: { name: 'Gale', color: '#7CF0C8', icon: '🌪️', move: 'Cyclone Rend' },
    stone: { name: 'Stone', color: '#E0AE68', icon: '🪨', move: 'Quake Slam' },
    volt: { name: 'Volt', color: '#FFE14D', icon: '⚡', move: 'Arc Lightning' },
    void: { name: 'Void', color: '#B45CFF', icon: '🌀', move: 'Rift Collapse' },
  };
  // Each element beats the next one around the circle. Void is wild: it hits
  // everything a bit harder and takes a bit more from everything.
  const BEATS = { ember: 'gale', gale: 'stone', stone: 'volt', volt: 'tide', tide: 'ember' };

  function advantage(atk, def) {
    if (atk === 'void' && def === 'void') return 1;
    if (atk === 'void' || def === 'void') return 1.25;
    if (BEATS[atk] === def) return 1.5;
    if (BEATS[def] === atk) return 0.67;
    return 1;
  }

  const RARITY = [
    { name: 'Common', color: '#B8C4D6', weight: 62, catch: 0.5, flee: 0.08, dna: 12, xp: 100 },
    { name: 'Rare', color: '#4DA3FF', weight: 27, catch: 0.32, flee: 0.15, dna: 10, xp: 250 },
    { name: 'Epic', color: '#C86BFF', weight: 9, catch: 0.18, flee: 0.22, dna: 8, xp: 600 },
    { name: 'Legendary', color: '#FFB020', weight: 2, catch: 0.08, flee: 0.3, dna: 6, xp: 1500 },
  ];

  // [id, name, element, rarity, plan, height m, [body, belly, accent], eye,
  //  features, [hp, atk, spd], blurb]
  const RAW = [
    ['cindertail', 'Cindertail', 'ember', 0, 'raptor', 1.4, ['#6B2E1E', '#D9B48E', '#E0572C'], '#FFC23A', 'stripes feathers', [100, 24, 16], 'A quick little raptor. Its tail smoulders when it gets excited.'],
    ['mossback', 'Mossback', 'stone', 0, 'plated', 2.2, ['#4F5B33', '#BDB287', '#8BA63F'], '#E8D070', 'plates spots', [140, 18, 8], 'Moss grows on its plates. It naps in parks and nobody notices.'],
    ['zephyrix', 'Zephyrix', 'gale', 0, 'flyer', 1.6, ['#3D6A62', '#E3E6D8', '#2FA487'], '#F2E6B0', 'crest', [90, 22, 20], 'Rides the wind over rooftops, squawking at pigeons.'],
    ['sparkjaw', 'Sparkjaw', 'volt', 0, 'raptor', 1.4, ['#2C3050', '#CFC6A2', '#F2C230'], '#FFE14D', 'stripes feathers', [95, 25, 17], 'Hangs around streetlights. Its bite tingles.'],
    ['ripplehorn', 'Ripplehorn', 'tide', 0, 'horned', 2.0, ['#3E5667', '#CBD0C8', '#5FA8D8'], '#F4E9C8', 'horns3 frill', [135, 20, 10], 'Its frill ripples like water when it is curious.'],
    ['pebblestomp', 'Pebblestomp', 'stone', 0, 'horned', 1.7, ['#6E6154', '#D2C6B0', '#A08E78'], '#FFD23F', 'horns1 frill spots', [130, 21, 11], 'Stubborn and sturdy. Headbutts lampposts to say hello.'],
    ['emberjaw', 'Emberjaw', 'ember', 1, 'rex', 4.0, ['#4A2017', '#C99A74', '#E8602A'], '#FFD23F', 'stripes spikes', [170, 34, 12], 'Its roar leaves the air shimmering with heat.'],
    ['tidecrest', 'Tidecrest', 'tide', 1, 'longneck', 5.5, ['#35566E', '#D6DEDC', '#6FB6D8'], '#F2F2E0', 'crest spots', [190, 26, 9], 'Gentle giant. Sings low songs that sound like waves.'],
    ['galeclaw', 'Galeclaw', 'gale', 1, 'raptor', 1.7, ['#2F5A50', '#E0E6DA', '#8FD2BA'], '#F6F0C8', 'feathers crest stripes', [120, 30, 22], 'Hunts in gusts. You hear the wind before you see it.'],
    ['stonehorn', 'Stonehorn', 'stone', 1, 'horned', 2.5, ['#6A5038', '#D8C09A', '#EDE0C6'], '#FFB020', 'horns3 frill spikes', [180, 28, 9], 'Its horns are harder than granite. Very proud of them.'],
    ['voltwing', 'Voltwing', 'volt', 1, 'flyer', 2.0, ['#26294A', '#E8DCA2', '#F2D040'], '#FFE14D', 'crest stripes', [115, 32, 21], 'Leaves little lightning trails across storm clouds.'],
    ['duskmaw', 'Duskmaw', 'void', 2, 'rex', 4.4, ['#1F1629', '#6E5C80', '#A04CE8'], '#E05CFF', 'spikes glow', [210, 40, 13], 'Only hunts at dusk. Its shadow moves before it does.'],
    ['frostspire', 'Frostspire', 'tide', 2, 'plated', 3.0, ['#9CB6C6', '#E9EFF2', '#78C4EE'], '#3DB8FF', 'plates glow spikes', [230, 32, 10], 'Its plates are made of ice that never melts.'],
    ['thunderneck', 'Thunderneck', 'volt', 2, 'longneck', 6.5, ['#2F2E4F', '#D8D0A2', '#F2D040'], '#FFE14D', 'stripes glow', [250, 34, 8], 'When it stomps, phones nearby lose a bar of signal.'],
    ['pyrewing', 'Pyrewing', 'ember', 2, 'flyer', 2.4, ['#6E1B13', '#E2AA72', '#FF8A20'], '#FFE14D', 'crest glow', [150, 42, 24], 'Dives out of sunsets trailing sparks.'],
    ['riftking', 'Riftking', 'void', 3, 'rex', 5.8, ['#140C1E', '#4A3666', '#D850F0'], '#FF5CF0', 'spikes glow crown', [300, 52, 16], 'The first thing to come through the Rifts. It rules the other side.'],
    ['aetherwyrm', 'Aetherwyrm', 'gale', 3, 'longneck', 7.5, ['#C3D8D2', '#F2F6F2', '#3FD6B6'], '#2EE6C5', 'crest glow spots', [320, 46, 14], 'Said to hold the sky together. Seen only where many Rifts meet.'],
    ['magmaron', 'Magmaron', 'ember', 3, 'horned', 3.4, ['#2B100B', '#8A3A1A', '#FF8A20'], '#FFD23F', 'horns3 frill glow spikes', [290, 50, 12], 'Walks on lava like it is a warm carpet.'],
    ['mudstomper', 'Mudstomper', 'stone', 0, 'plated', 1.9, ['#5E4A34', '#C4AE8A', '#8C7250'], '#E8C060', 'armor club spots', [150, 17, 7], 'Covered in bony studs. Swings its tail club at anything that sneaks up.'],
    ['brookrunner', 'Brookrunner', 'tide', 0, 'raptor', 1.5, ['#3E5A58', '#D2D8C8', '#6FA89A'], '#F2E6B0', 'tubecrest stripes', [105, 21, 17], 'Hoots through its tube crest to call the herd to the river.'],
    ['thistlehorn', 'Thistlehorn', 'gale', 0, 'horned', 1.5, ['#4E5E3C', '#D0CCA8', '#9CB86A'], '#FFD23F', 'horns1 frill stripes', [125, 21, 12], 'Its frill rattles in the wind like dry leaves.'],
    ['zapling', 'Zapling', 'volt', 0, 'flyer', 1.2, ['#36384E', '#E2DAB0', '#E8C83A'], '#FFE14D', 'crest', [85, 23, 21], 'Perches on power lines and hums along with them.'],
    ['kindlepup', 'Kindlepup', 'ember', 0, 'raptor', 1.2, ['#6A3A22', '#DCBC94', '#C8642E'], '#FFC23A', 'dome spots', [110, 22, 15], 'Headbutts everything. Its dome is always warm.'],
    ['boulderback', 'Boulderback', 'stone', 1, 'plated', 2.7, ['#56504A', '#C8BCA8', '#A8967A'], '#FFB020', 'armor club spikes', [200, 27, 7], 'A walking fortress. One swing of its club can split a boulder.'],
    ['sailfin', 'Sailfin', 'tide', 1, 'rex', 3.8, ['#3A4E5A', '#D8D6C8', '#C86A3A'], '#F4E9C8', 'sail stripes', [175, 32, 13], 'Hunts along riverbanks, its great sail flushing red when it is angry.'],
    ['hornblower', 'Hornblower', 'gale', 1, 'raptor', 2.4, ['#4A5A3E', '#DAD6BC', '#B8C86A'], '#F6F0C8', 'tubecrest spots', [150, 27, 18], 'Its call carries for miles. Other creatures scatter when they hear it.'],
    ['skullcrack', 'Skullcrack', 'stone', 1, 'raptor', 1.9, ['#5A4A3E', '#D4C4A8', '#8A6A4E'], '#FFD23F', 'dome spikes', [150, 30, 16], 'Settles every argument by ramming. It has never lost one.'],
    ['tidereaver', 'Tidereaver', 'tide', 2, 'rex', 5.0, ['#23384A', '#C8D4D8', '#3DB8FF'], '#9FE8FF', 'sail stripes glow', [240, 42, 14], 'Its sail glows like deep water. Storm drains flood when it passes.'],
    ['ironhide', 'Ironhide', 'volt', 2, 'plated', 3.2, ['#3A3A48', '#C8C4B0', '#F2D040'], '#FFE14D', 'armor club glow', [260, 36, 8], 'Lightning jumps between its armour studs. Nothing bites it twice.'],
    ['nightglider', 'Nightglider', 'void', 2, 'flyer', 2.6, ['#1C1428', '#6A5A7E', '#A04CE8'], '#E05CFF', 'crest glow', [150, 44, 25], 'Blots out the stars as it glides over rooftops at midnight.'],
    ['solarch', 'Solarch', 'ember', 3, 'rex', 6.0, ['#4A1E10', '#D8A070', '#FF9A30'], '#FFE14D', 'sail crown glow spikes', [310, 54, 14], 'Its blazing sail soaks up the sun. Streetlights flicker on when it sleeps.'],
    ['stormcrown', 'Stormcrown', 'volt', 3, 'horned', 3.6, ['#262A48', '#D0CCB0', '#F2D040'], '#FFE14D', 'horns3 frill glow spikes', [300, 50, 13], 'Thunder rolls every time it lowers its horns.'],
    // Hybrids: never found in the wild, made in the Lab by fusing DNA.
    ['scorchglider', 'Scorchglider', 'ember', 1, 'flyer', 2.0, ['#7A3218', '#E8C29A', '#2FA487'], '#FFD23F', 'crest stripes', [140, 34, 23], 'Cindertail × Zephyrix. Glides on its own heat.', ['cindertail', 'zephyrix']],
    ['reefwarden', 'Reefwarden', 'tide', 1, 'plated', 2.6, ['#2F6B66', '#D8E6CC', '#8FD8EE'], '#F4F0D0', 'plates spots spikes', [200, 26, 10], 'Mossback × Ripplehorn. A walking coral reef.', ['mossback', 'ripplehorn']],
    ['stormfang', 'Stormfang', 'volt', 2, 'rex', 4.4, ['#2A2750', '#D4B284', '#F2D040'], '#FFE14D', 'stripes spikes glow', [230, 44, 15], 'Emberjaw × Sparkjaw. Thunder follows it around.', ['emberjaw', 'sparkjaw']],
    ['skyrender', 'Skyrender', 'gale', 2, 'raptor', 2.0, ['#23505C', '#E8F0E8', '#F2D040'], '#FFE14D', 'feathers crest stripes glow', [160, 42, 26], 'Galeclaw × Sparkjaw. Faster than you can blink.', ['galeclaw', 'sparkjaw']],
    ['tempestral', 'Tempestral', 'volt', 2, 'longneck', 6.5, ['#2E4A78', '#E2ECF2', '#F2D040'], '#FFE14D', 'crest glow stripes', [270, 38, 11], 'Tidecrest × Voltwing. Carries a storm on its back.', ['tidecrest', 'voltwing']],
    ['gravemaw', 'Gravemaw', 'void', 3, 'horned', 3.2, ['#35283F', '#BFB0D2', '#A04CE8'], '#E05CFF', 'horns3 frill glow spikes', [310, 50, 12], 'Stonehorn × Duskmaw. Its frill opens onto another world.', ['stonehorn', 'duskmaw']],
    ['sailcrusher', 'Sailcrusher', 'ember', 2, 'rex', 4.6, ['#5A2A1A', '#D8B090', '#E8602A'], '#FFD23F', 'sail stripes spikes', [230, 44, 13], 'Sailfin × Emberjaw. Its sail steams in the rain.', ['sailfin', 'emberjaw']],
    ['bastionhorn', 'Bastionhorn', 'stone', 1, 'horned', 2.8, ['#5A5048', '#D0C4AE', '#A8967A'], '#FFB020', 'horns3 frill armor', [220, 28, 9], 'Boulderback × Pebblestomp. Armoured from nose to tail.', ['boulderback', 'pebblestomp']],
    ['thunderdome', 'Thunderdome', 'volt', 2, 'raptor', 2.1, ['#2E3050', '#D8CCA0', '#F2D040'], '#FFE14D', 'dome stripes glow', [180, 42, 19], 'Skullcrack × Sparkjaw. Its headbutts land like lightning strikes.', ['skullcrack', 'sparkjaw']],
    ['mistcaller', 'Mistcaller', 'tide', 2, 'raptor', 2.6, ['#34505A', '#DCE4E0', '#78C4EE'], '#9FE8FF', 'tubecrest spots glow', [200, 36, 18], 'Hornblower × Tidecrest. Fog rolls in wherever it sings.', ['hornblower', 'tidecrest']],
  ];

  const SPECIES = RAW.map((r) => ({
    id: r[0], name: r[1], el: r[2], rar: r[3], plan: r[4], size: r[5],
    col: r[6], eye: r[7],
    feat: new Set(r[8].split(' ')),
    hp: r[9][0], atk: r[9][1], spd: r[9][2],
    blurb: r[10],
    parents: r[11] || null,
    hybrid: !!r[11],
  }));
  const BY_ID = {};
  SPECIES.forEach((s) => { BY_ID[s.id] = s; });
  const WILD = SPECIES.filter((s) => !s.hybrid);
  const HYBRIDS = SPECIES.filter((s) => s.hybrid);

  /* ------------------ Stats ------------------ */

  const MAX_LEVEL = 30;

  function stats(c) {
    const sp = BY_ID[c.sp];
    const L = c.lvl;
    const iv = c.iv || [5, 5, 5];
    return {
      hp: Math.round((sp.hp + iv[0] * 2) * (1 + (L - 1) * 0.08)),
      atk: Math.round((sp.atk + iv[1] * 0.6) * (1 + (L - 1) * 0.07)),
      spd: Math.round(sp.spd + iv[2] * 0.3 + L / 4),
    };
  }

  function power(c) {
    const s = stats(c);
    return Math.round(s.hp * 0.8 + s.atk * 10 + s.spd * 5);
  }

  // DNA needed to go from level L to L + 1.
  function levelCost(c) {
    const sp = BY_ID[c.sp];
    return Math.round((20 + c.lvl * 12) * [1, 1.4, 1.9, 2.6][sp.rar]);
  }

  // DNA of each parent used per fusion.
  function fuseCost(parentId) {
    return [60, 100, 160, 240][BY_ID[parentId].rar];
  }

  RB.creatures = {
    ELEMENTS, RARITY, SPECIES, WILD, HYBRIDS, MAX_LEVEL,
    byId: (id) => BY_ID[id],
    advantage, stats, power, levelCost, fuseCost,
  };
})(window.RB);
