/* ParanormalADHDhunters — everything the game knows about ghosts, gear,
   places, the story and progression. Pure data, no logic. */

export const BRAND = 'ParanormalADHDhunters';
export const TAGLINE = 'Hyperfocused on the unexplained.';
export const MOTTO = 'We notice what others miss.';

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export const EVIDENCE = {
  emf: {
    name: 'EMF Level 5', short: 'EMF 5', tool: 'emf',
    how: 'Hold the EMF meter near where the ghost has just done something. All five lights means EMF 5.',
  },
  freeze: {
    name: 'Freezing Temperatures', short: 'Freezing', tool: 'thermo',
    how: 'Use the thermometer in the ghost room. A reading below 0 °C is freezing. You may see your breath.',
  },
  voice: {
    name: 'Spirit Box Voice', short: 'Voice', tool: 'spirit',
    how: 'Ask the spirit box questions in the ghost room with the lights off. Some spirits answer.',
  },
  photo: {
    name: 'Ghost Photograph', short: 'Photo', tool: 'camera',
    how: 'Some spirits show up on camera even when your eyes see nothing. Photograph the ghost room.',
  },
  moving: {
    name: 'Objects Thrown', short: 'Thrown', tool: null,
    how: 'Watch for objects flying off shelves and tables. You have to see it happen.',
  },
};
export const EVIDENCE_ORDER = ['emf', 'freeze', 'voice', 'photo', 'moving'];

/** Evidence types that later equipment will unlock (shown greyed out in the journal). */
export const FUTURE_EVIDENCE = [
  { name: 'Footprints', tool: 'UV Light' },
  { name: 'Strange Symbols', tool: 'UV Light' },
  { name: 'Paranormal Sounds', tool: 'Audio Recorder' },
  { name: 'Motion', tool: 'Motion Sensor' },
];

/* ------------------------------------------------------------------ */
/* Ghosts                                                              */
/* ------------------------------------------------------------------ */

export const GHOSTS = {
  shadow: {
    name: 'Shadow Ghost',
    playable: true,
    color: '#7b6cff',
    evidence: ['emf', 'freeze', 'photo'],
    blurb: 'A tall shape that lives at the edge of your light.',
    tells: [
      'Flickers lights and makes your flashlight stutter.',
      'Shows itself for a moment in doorways, then melts away.',
      'Quietly follows investigators who wander alone in the dark.',
      'Never throws things.',
    ],
    // How often it does each kind of thing (relative weights).
    acts: { manifest: 3, flicker: 4, torch: 3, follow: 3, steps: 2, creak: 1.5, whisper: 1.5, lightsOff: 1.5 },
    pace: 0.75, surgeSpeed: 1.65, height: 2.05,
    words: [],
  },
  poltergeist: {
    name: 'Poltergeist',
    playable: true,
    color: '#ff7a59',
    evidence: ['emf', 'voice', 'moving'],
    blurb: 'A noisy, messy spirit that loves an audience.',
    tells: [
      'Throws books, cups and plates, sometimes several at once.',
      'Slams doors and plays with light switches.',
      'Knocks loudly on walls.',
      'Almost never lets itself be seen.',
    ],
    acts: { throw: 5, multiThrow: 1.6, slam: 3, lightsToggle: 2.5, knock: 2.5, creak: 1 },
    pace: 1.0, surgeSpeed: 1.85, height: 1.8,
    words: ['MINE', 'LEAVE', 'GO AWAY', 'HERE', 'LOUD', 'BREAK', 'NOT YOURS', 'MY HOUSE'],
  },
  child: {
    name: 'Child Spirit',
    playable: true,
    color: '#7fe3ff',
    evidence: ['voice', 'freeze', 'photo'],
    blurb: 'A lonely young spirit who just wants someone to play with.',
    tells: [
      'Giggles, hums and runs about upstairs and down.',
      'Plays the music box and squeaks toys.',
      'Turns lights ON. It does not like the dark.',
      'Sometimes seen as a small, glowing figure.',
    ],
    acts: { giggle: 3, run: 3, music: 2, toy: 2, lightsOn: 2.2, manifest: 2, knock: 1, hum: 1.5 },
    pace: 1.15, surgeSpeed: 1.4, height: 1.15,
    words: ['PLAY', 'HIDE', 'SEEK', 'MUMMY?', 'EIGHT', 'FRIEND', 'COUNT TO TEN', 'HERE', 'LANTERN LADY'],
  },
  // Not yet encountered. They arrive with new locations.
  phantom: { name: 'Phantom', playable: false, color: '#c7d0ff', blurb: 'Seen in mirrors and photographs. Coming with the Haunted Hotel.' },
  possessed: { name: 'Possessed Spirit', playable: false, color: '#b388ff', blurb: 'Takes hold of objects and won’t let go.' },
  screamer: { name: 'Screaming Ghost', playable: false, color: '#ff9bd2', blurb: 'Its voice carries through every wall.' },
  demon: { name: 'Demon', playable: false, color: '#ff5d7a', blurb: 'Rarely seen. Never welcome.' },
  ancient: { name: 'Ancient Spirit', playable: false, color: '#ffd479', blurb: 'Older than the buildings it haunts.' },
};
export const PLAYABLE_GHOSTS = ['shadow', 'poltergeist', 'child'];
export const ALL_GHOSTS = ['shadow', 'poltergeist', 'child', 'phantom', 'possessed', 'screamer', 'demon', 'ancient'];

/* ------------------------------------------------------------------ */
/* Equipment                                                           */
/* ------------------------------------------------------------------ */

export const EQUIPMENT = {
  flashlight: {
    name: 'Flashlight', active: true, key: 'F',
    desc: 'Chest-mounted torch. Tap to switch it on or off. Some ghosts make it flicker.',
    tiers: [
      { label: 'Old Torch', desc: 'A weak, warm beam.', cost: 0, range: 13, power: 26, angle: 0.42 },
      { label: 'LED Torch', desc: 'Brighter and wider.', cost: 350, range: 17, power: 40, angle: 0.5 },
      { label: 'Spectre Beam', desc: 'A wide, strong beam that cuts through fog.', cost: 1000, range: 22, power: 58, angle: 0.56 },
    ],
  },
  emf: {
    name: 'EMF Meter', active: true, key: '1',
    desc: 'Lights up near ghostly energy. Ghost activity leaves a trace for a short time. Five lights is evidence.',
    tiers: [
      { label: 'Basic', desc: 'Detects energy up to 1.8 m away.', cost: 0, range: 1.8 },
      { label: 'Sensitive', desc: 'Detects energy up to 2.6 m away.', cost: 300, range: 2.6 },
      { label: 'Spectral', desc: 'Detects energy up to 3.5 m away.', cost: 900, range: 3.5 },
    ],
  },
  thermo: {
    name: 'Thermometer', active: true, key: '2',
    desc: 'Shows the temperature where you stand. The ghost room is always the coldest. Below 0 °C is evidence.',
    tiers: [
      { label: 'Analog', desc: 'Slow and a bit jumpy.', cost: 0, rate: 1.1, noise: 0.9 },
      { label: 'Digital', desc: 'Faster, steadier readings.', cost: 250, rate: 0.6, noise: 0.45 },
      { label: 'Thermal', desc: 'Near-instant, precise readings.', cost: 800, rate: 0.3, noise: 0.15 },
    ],
  },
  spirit: {
    name: 'Spirit Box', active: true, key: '3',
    desc: 'Sweeps radio frequencies so spirits can speak. Ask questions in the dark, near the ghost.',
    tiers: [
      { label: 'Scanner', desc: 'Answers are rare.', cost: 0, chance: 0.38, cooldown: 6 },
      { label: 'Sweeper', desc: 'Better odds of an answer.', cost: 400, chance: 0.5, cooldown: 5 },
      { label: 'Echo Box', desc: 'Spirits answer more often and sooner.', cost: 1100, chance: 0.64, cooldown: 3.5 },
    ],
  },
  camera: {
    name: 'Digital Camera', active: true, key: '4',
    desc: 'Photos earn coins and can capture spirits that are invisible to the eye.',
    tiers: [
      { label: 'Point & Shoot', desc: '6 photos, flash reaches 7 m.', cost: 0, shots: 6, range: 7 },
      { label: 'Night Lens', desc: '9 photos, flash reaches 8.5 m.', cost: 300, shots: 9, range: 8.5 },
      { label: 'Spirit Lens', desc: '12 photos, flash reaches 10 m.', cost: 950, shots: 12, range: 10 },
    ],
  },
  // Arriving with later locations.
  video: { name: 'Video Camera', active: false, desc: 'Night-vision video. Arrives with the Haunted Hotel.' },
  recorder: { name: 'Audio Recorder', active: false, desc: 'Captures sounds you can’t hear live.' },
  motion: { name: 'Motion Sensor', active: false, desc: 'Lights up when something passes by.' },
  uv: { name: 'UV Light', active: false, desc: 'Reveals footprints and hidden symbols.' },
};
export const TOOLS = ['emf', 'thermo', 'spirit', 'camera'];
export const EQUIP_ORDER = ['flashlight', 'emf', 'thermo', 'spirit', 'camera', 'video', 'recorder', 'motion', 'uv'];

export const SPIRIT_QUESTIONS = [
  'Is anyone here?',
  'Where are you?',
  'What do you want?',
  'How old are you?',
  'Give us a sign.',
];

/* ------------------------------------------------------------------ */
/* Locations                                                           */
/* ------------------------------------------------------------------ */

// mx/my are positions on the county map (0..100), which together trace the
// Lantern symbol once the story reveals it.
export const LOCATIONS = [
  { id: 'house', name: 'Abandoned House', place: '13 Wren Lane', chapter: 1, playable: true, mx: 50, my: 14,
    blurb: 'Empty since the Halloway family fled one night in 1987. Lights are still seen upstairs.' },
  { id: 'hotel', name: 'Haunted Hotel', place: 'The Marlowe Grand', chapter: 2, mx: 80, my: 28,
    blurb: 'Closed since 1994. The switchboard still lights up at 3:13 every morning.' },
  { id: 'graveyard', name: 'Old Graveyard', place: 'St Agnes Churchyard', chapter: 3, mx: 88, my: 58,
    blurb: 'Eight graves have no names. Just a lantern carved on each.' },
  { id: 'hospital', name: 'Abandoned Hospital', place: 'Greywater Hospital', chapter: 4, mx: 70, my: 84,
    blurb: 'Ward 8 was sealed in 1961. Nobody remembers why.' },
  { id: 'castle', name: 'Old Castle', place: 'Castle Dunmere', chapter: 5, mx: 30, my: 84,
    blurb: 'The oldest of the eight. The Order of the Lantern met here first.' },
  { id: 'school', name: 'Haunted School', place: 'Hollowbrook School', chapter: 6, mx: 12, my: 58,
    blurb: 'A bell rings in the empty tower every Halloween.' },
  { id: 'cabin', name: 'Forest Cabin', place: 'Blackpine Cabin', chapter: 7, mx: 20, my: 28,
    blurb: 'The trail to it changes every time someone walks it.' },
  { id: 'prison', name: 'Old Prison', place: 'Ironmoor Gaol', chapter: 8, mx: 50, my: 50,
    blurb: 'At the centre of everything. The last light.' },
];

/* ------------------------------------------------------------------ */
/* The team and the story                                              */
/* ------------------------------------------------------------------ */

export const CREW = {
  mags: { name: 'Mags Okafor', role: 'Team Lead', color: '#b388ff' },
  juno: { name: 'Juno Reyes', role: 'Tech & Gear', color: '#7fe3ff' },
  theo: { name: 'Theo Lindqvist', role: 'Researcher', color: '#ffd479' },
};

export const PROLOGUE = [
  ['mags', 'Welcome to ParanormalADHDhunters. I’m Mags, I run this team.'],
  ['mags', 'We’re a small crew with big curiosity. Our brains are wired to notice things: the flicker in a window, a cold spot that shouldn’t be there, a voice under the static. Most investigators miss the little things. We don’t.'],
  ['juno', 'I’m Juno! I built, fixed, or at least taped together every bit of gear you’ll carry. Please don’t drop the spirit box.'],
  ['theo', 'Theo. I dig through archives so we know whose house we’re walking into. Hello.'],
  ['mags', 'Your first case is tonight. 13 Wren Lane. Grab your kit, you’re riding with us.'],
];

export const CLUES = {
  drawing: {
    title: 'Ellie’s Drawing',
    text: 'A crayon drawing signed “Ellie, age 8”. It shows the house, the family holding hands, and under the floor a tall lady holding a lantern. Above her Ellie has drawn a strange symbol: a circle with an eye in it and eight little rays around it.\n\nAt the bottom, in careful letters: “THE LANTERN LADY HUMS WHEN THE LIGHTS GO OUT.”',
  },
  letter: {
    title: 'Arthur’s Letter',
    text: 'June,\n\nThe surveyor came back today. He says the house sits on a “line”, and there are seven more places like it: the Marlowe Grand, the old school, the prison on the hill. Every one of them has the lantern mark somewhere.\n\nHe says the Order of the Lantern kept something shut under our cellar. I’ve locked the cellar door and chalked the mark on it, the way he showed me. Whatever you hear down there, don’t open it.\n\nWe leave on the 31st.\n— A.',
  },
  map: {
    title: 'The Lantern Map',
    text: 'A hand-inked map of the county with eight places circled: Wren Lane, the Marlowe Grand Hotel, St Agnes Churchyard, Greywater Hospital, Castle Dunmere, Hollowbrook School, Blackpine Cabin and Ironmoor Gaol.\n\nLines join them into the lantern symbol. Wren Lane is the top of the lantern.\n\nIn the margin, in faded brown ink: “When all eight lights are lit, the Veil will open. — The Order, 1887”',
  },
  sam1: { title: 'Sam’s Notebook, page 1', notebook: true,
    text: 'Ellie says the lady in the cellar hums the same tune as her music box. I told her that’s impossible because the music box only plays when you wind it. Then it played. Nobody wound it.' },
  sam2: { title: 'Sam’s Notebook, page 2', notebook: true,
    text: 'Dad chalked the lantern on the cellar door upside down. He says upside down means SHUT. He checks it every night before bed. Last night it was the right way up again.' },
  sam3: { title: 'Sam’s Notebook, page 3', notebook: true,
    text: 'There are eight candles in a circle down there. Seven are old and melted flat. One is brand new. Somebody lit it, and it wasn’t any of us.' },
  sam4: { title: 'Sam’s Notebook, page 4', notebook: true,
    text: 'We’re leaving tonight. Dad says we’re going to stay at the Marlowe until he “sorts it out”. Mum cried. Ellie won’t stop humming. I’m leaving this notebook in case someone else comes. If you’re reading this: don’t go in the cellar after 3.' },
};
export const NOTEBOOK = ['sam1', 'sam2', 'sam3', 'sam4'];

/** Story cases. Chapter 1 happens entirely at 13 Wren Lane. */
export const CHAPTERS = [
  {
    id: 1, title: 'Whispers on Wren Lane', location: 'house',
    cases: [
      {
        id: 'c1', title: 'First Night', clue: 'drawing', tutorial: true,
        brief: [
          ['mags', 'Okay, rookie. 13 Wren Lane has been empty since 1987, when the Halloway family left in the middle of the night and never came back.'],
          ['theo', 'Neighbours still report lights upstairs and a child singing. The family had two kids, Sam and Ellie.'],
          ['mags', 'Find the room where the activity is strongest, collect evidence, and tell us what’s in there. Juno’s packed your kit. Stay calm, stay curious.'],
        ],
        debrief: [
          ['theo', 'Ellie Halloway, eight years old in 1987. The family moved out on the 31st of October and nobody saw them again.'],
          ['mags', 'That symbol in her drawing. The eye with eight rays. I’ve seen it before.'],
          ['juno', 'Uh, Mags? I just ran the photos from tonight through the computer. That same symbol is carved into the front door frame. Somebody marked this house on purpose.'],
        ],
        hook: 'Who carved the lantern mark into the door of 13 Wren Lane?',
      },
      {
        id: 'c2', title: 'The Halloway Letters', clue: 'letter',
        brief: [
          ['theo', 'I found the deed. Arthur Halloway bought the house in 1979 from a group called the Order of the Lantern. That’s the symbol.'],
          ['mags', 'Arthur kept a study downstairs. If he left anything behind, it’ll be there.'],
          ['juno', 'Heads up: tonight’s readings look different. It might not be the same spirit as last time. Something keeps drawing them to this house.'],
        ],
        debrief: [
          ['mags', 'Seven more places like it. Theo, get me a map.'],
          ['theo', 'Already on it. The Marlowe Grand. Hollowbrook School. Ironmoor Gaol. Every one of them is on our list of reported hauntings.'],
          ['juno', 'Guys? My door sensor on the cellar just went off. 3:13 AM. The cellar door is open, and nobody was near it.'],
        ],
        hook: 'The cellar Arthur locked is open.',
      },
      {
        id: 'c3', title: 'Beneath Wren Lane', clue: 'map', finale: true,
        brief: [
          ['mags', 'The cellar door is open now. Whatever Arthur locked away has been waiting nearly forty years.'],
          ['mags', 'Investigate the house like always. Then get down to the basement and find out what the Order was hiding.'],
          ['juno', 'If things go bad, you RUN to the van. No heroics. Promise me.'],
        ],
        debrief: [
          ['mags', 'Everyone accounted for? Good. Lock the van doors.'],
          ['juno', 'Mags, the spirit box in the back just switched itself on.'],
          ['ghost', '…one light is lit… seven remain…'],
          ['juno', 'That signal is coming from across town. It’s on the Marlowe Grand’s old frequency. That hotel has been shut since 1994.'],
          ['mags', 'Then that’s where we’re going next.'],
        ],
        hook: 'One light is lit. Seven remain. Chapter 2, The Marlowe Grand, is coming in a future update.',
      },
    ],
  },
];

/** Radio tips for the first case. Each fires once, when its trigger happens. */
export const TUTORIAL = {
  start: ['juno', 'Use the stick on the left to walk, and swipe on the right to look around. The house is straight ahead.'],
  dark: ['juno', 'It’s dark. Tap the flashlight button to switch your torch on.'],
  inside: ['mags', 'You’re in. Switch to the EMF meter or the thermometer and walk from room to room. The ghost room is the coldest one.'],
  cold: ['mags', 'Cold in here. Keep the thermometer out: if it drops below zero, that’s evidence.'],
  emf: ['juno', 'The EMF meter is reacting! Ghosts leave energy behind when they do things. Five lights means EMF 5 evidence.'],
  ghostroom: ['mags', 'This is it, the ghost room. Try the spirit box with the lights off, and take a few photos.'],
  evidence: ['mags', 'Evidence logged. Open your journal (the book button) to see which ghosts it rules out.'],
  three: ['mags', 'Three pieces of evidence! Open the journal, choose the ghost, then come back to the van to finish up.'],
  nerve: ['juno', 'Your nerve is dropping. Darkness and spooky stuff wear you down. Light rooms help, and resting by the van restores it.'],
  surge: ['mags', 'Energy spike! It’s surging! Get away from it or hide in a wardrobe until it calms down!'],
  verdict: ['mags', 'Good call. Head back to the van whenever you’re ready to end the investigation.'],
};

/* ------------------------------------------------------------------ */
/* Difficulty                                                          */
/* ------------------------------------------------------------------ */

export const DIFFICULTY = {
  amateur: { name: 'Amateur', level: 1, mult: 1, drain: 0.6, surgeAfter: 240, surgeNerve: 40, surgeLen: 18, activity: 1.15,
    desc: 'Gentle. Few surges and a slow nerve drain.' },
  intermediate: { name: 'Intermediate', level: 3, mult: 1.5, drain: 1, surgeAfter: 170, surgeNerve: 55, surgeLen: 24, activity: 1,
    desc: 'The real thing. ×1.5 rewards.' },
  professional: { name: 'Professional', level: 6, mult: 2, drain: 1.45, surgeAfter: 110, surgeNerve: 65, surgeLen: 30, activity: 0.9,
    desc: 'Nerves of steel needed. ×2 rewards.' },
};

/* ------------------------------------------------------------------ */
/* Objectives                                                          */
/* ------------------------------------------------------------------ */

export const SIDE_OBJECTIVES = {
  event: { text: 'Witness a paranormal event', reward: 40 },
  emf2: { text: 'Detect EMF level 2 or higher', reward: 30 },
  cold: { text: 'Find a temperature below 6 °C', reward: 30 },
  photo: { text: 'Photograph paranormal activity', reward: 50 },
  nerve: { text: 'Finish with your nerve above 40%', reward: 40 },
  nospook: { text: 'Don’t get spooked', reward: 50 },
  spirit: { text: 'Use the spirit box in the ghost room', reward: 30 },
};

/* ------------------------------------------------------------------ */
/* Progression                                                         */
/* ------------------------------------------------------------------ */

export const RANKS = [
  { level: 1, name: 'Rookie', color: '#9aa6d8', stars: 0 },
  { level: 3, name: 'Trainee Investigator', color: '#7fe3ff', stars: 1 },
  { level: 5, name: 'Field Investigator', color: '#8fe3a0', stars: 2 },
  { level: 8, name: 'Senior Investigator', color: '#ffd479', stars: 3 },
  { level: 12, name: 'Lead Investigator', color: '#ff9b6b', stars: 4 },
  { level: 16, name: 'Paranormal Specialist', color: '#ff7ac8', stars: 5 },
  { level: 20, name: 'Spectral Expert', color: '#b388ff', stars: 6 },
  { level: 25, name: 'Keeper of the Lantern', color: '#ffffff', stars: 7 },
];

export const xpToNext = (level) => 220 + (level - 1) * 110;

export const UNIFORMS = [
  { id: 'midnight', name: 'Midnight', jacket: '#1b2350', trim: '#8a5cf6', level: 1, cost: 0 },
  { id: 'violet', name: 'Violet Veil', jacket: '#3b1f6e', trim: '#d6c6ff', level: 1, cost: 0 },
  { id: 'spectral', name: 'Spectral White', jacket: '#d9e2f5', trim: '#5b2a86', level: 3, cost: 250 },
  { id: 'eclipse', name: 'Eclipse', jacket: '#0b0b12', trim: '#7fe3ff', level: 5, cost: 400 },
  { id: 'ember', name: 'Lantern Ember', jacket: '#4a1e2a', trim: '#ffb35c', level: 8, cost: 700 },
  { id: 'aurora', name: 'Aurora', jacket: '#123c46', trim: '#9dffcb', level: 12, cost: 1200 },
];

export const ACHIEVEMENTS = [
  { id: 'first_case', name: 'First Night', desc: 'Complete your first investigation.', icon: 'moon', xp: 50 },
  { id: 'correct', name: 'Called It', desc: 'Correctly identify a ghost.', icon: 'check', xp: 50 },
  { id: 'shadow', name: 'Into the Dark', desc: 'Correctly identify a Shadow Ghost.', icon: 'shadow', xp: 75 },
  { id: 'poltergeist', name: 'Things That Go Bump', desc: 'Correctly identify a Poltergeist.', icon: 'cup', xp: 75 },
  { id: 'child', name: 'Playmate', desc: 'Correctly identify a Child Spirit.', icon: 'bear', xp: 75 },
  { id: 'photo', name: 'Say Cheese', desc: 'Capture a ghost on camera.', icon: 'camera', xp: 50 },
  { id: 'all_evidence', name: 'Full House', desc: 'Find all three pieces of evidence in one investigation.', icon: 'three', xp: 75 },
  { id: 'calm', name: 'Cool Head', desc: 'Finish an investigation with your nerve above 75%.', icon: 'heart', xp: 50 },
  { id: 'hider', name: 'Hide and Seek', desc: 'Hide from a surge in a wardrobe.', icon: 'door', xp: 50 },
  { id: 'spooked', name: 'Boo!', desc: 'Get spooked by a ghost, and live to tell the tale.', icon: 'boo', xp: 25 },
  { id: 'speed', name: 'Hyperfocus', desc: 'Correctly identify a ghost in under 5 minutes.', icon: 'bolt', xp: 100 },
  { id: 'clues', name: 'Archivist', desc: 'Find every case clue in Chapter 1.', icon: 'page', xp: 100 },
  { id: 'chapter1', name: 'One Light Lit', desc: 'Complete Chapter 1: Whispers on Wren Lane.', icon: 'lantern', xp: 200 },
  { id: 'notebook', name: 'Sam’s Notebook', desc: 'Find all four pages of Sam’s notebook.', icon: 'book', xp: 150 },
  { id: 'team', name: 'Team Spirit', desc: 'Complete an investigation with a team.', icon: 'team', xp: 100 },
  { id: 'upgrade', name: 'Fully Charged', desc: 'Upgrade a piece of equipment to its top tier.', icon: 'gear', xp: 75 },
  { id: 'rank', name: 'Field Ready', desc: 'Reach the rank of Field Investigator.', icon: 'badge', xp: 100 },
  { id: 'veteran', name: 'Night Shift', desc: 'Complete 10 investigations.', icon: 'clock', xp: 150 },
  { id: 'daily', name: 'Daily Ritual', desc: 'Complete all three daily challenges in one day.', icon: 'sun', xp: 100 },
  { id: 'pro', name: 'Professional', desc: 'Correctly identify a ghost on Professional.', icon: 'star', xp: 200 },
];

/** Daily challenge templates. Three are picked each day from the date. */
export const DAILY = [
  { id: 'photos', text: 'Take {n} photos of paranormal activity', n: [2, 3], stat: 'activityPhotos', coins: 120, xp: 80 },
  { id: 'evidence', text: 'Find {n} pieces of evidence', n: [3, 4, 5], stat: 'evidence', coins: 120, xp: 80 },
  { id: 'identify', text: 'Correctly identify {n} ghost(s)', n: [1, 2], stat: 'correct', coins: 150, xp: 100 },
  { id: 'answers', text: 'Get {n} spirit box answers', n: [2, 3], stat: 'answers', coins: 120, xp: 80 },
  { id: 'calm', text: 'Finish an investigation with nerve above 50%', n: [1], stat: 'calmFinish', coins: 100, xp: 70 },
  { id: 'nospook', text: 'Finish {n} investigation(s) without being spooked', n: [1, 2], stat: 'cleanFinish', coins: 110, xp: 70 },
  { id: 'lights', text: 'Switch on {n} lights', n: [8, 12], stat: 'lights', coins: 80, xp: 50 },
  { id: 'hide', text: 'Hide from a surge', n: [1], stat: 'hides', coins: 130, xp: 90 },
  { id: 'events', text: 'Witness {n} paranormal events', n: [4, 6], stat: 'events', coins: 100, xp: 70 },
];

export const LOADING_TIPS = [
  'The ghost room is always the coldest room in the house.',
  'Ghost activity leaves EMF traces behind for a little while. Be quick!',
  'Spirits prefer to talk in the dark. Turn the lights off before using the spirit box.',
  'Shadow Ghosts hate light. If your flashlight flickers, something is near.',
  'Child Spirits switch lights ON. Poltergeists switch them on and off.',
  'Hiding in a wardrobe keeps you safe during a surge.',
  'Resting by the van slowly restores your nerve.',
  'Photos of thrown objects earn coins too.',
  'Two pieces of evidence can be enough. Check the journal to see which ghosts are left.',
  'In a team, split up to search rooms faster, but stick together when it surges.',
];
