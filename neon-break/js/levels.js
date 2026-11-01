// Neon Break: Trick Shot challenges.
// Each level: balls [n, x, y], targets to pot, optional blockers that must stay
// up, the cue ball spot (or ball in hand), shots allowed and par for 3 stars.
// require: 'bank' (the target must touch a cushion before it drops),
// 'combo' (the target must be knocked in by another object ball) or
// 'kick' (the cue ball must hit a cushion before any ball).
// retry: a miss puts the balls back (your aim stays) and costs an attempt.
'use strict';
var NB = window.NB || (window.NB = {});

NB.levels = [
  { name: 'Warm Up', tip: 'Line it up and stroke it in.',
    cue: [290, 290], balls: [[1, 120, 120]], targets: [1], shots: 2, par: 1 },
  { name: 'The Cut', tip: 'Hit the edge of the ball to send it sideways.',
    cue: [300, 700], balls: [[3, 60, 300]], targets: [3], shots: 2, par: 1 },
  { name: 'Side Door', tip: 'Side pockets want a square-on angle.',
    cue: [400, 330], balls: [[2, 120, 470]], targets: [2], shots: 2, par: 1 },
  { name: 'Two Step', tip: 'Pot one and leave yourself the other.',
    cue: [250, 520], balls: [[1, 90, 150], [5, 410, 860]], targets: [1, 5], shots: 3, par: 2 },
  { name: 'Screw Back', tip: 'Tap the spin ball low to draw the white back.',
    cue: [250, 330], balls: [[4, 250, 160], [6, 70, 640]], targets: [4, 6], shots: 3, par: 2 },
  { name: 'Bank Job', tip: 'Must bounce off a cushion before it drops.', require: 'bank',
    cue: [250, 760], balls: [[7, 400, 420]], targets: [7], shots: 5, par: 1, retry: true },
  { name: 'Combo Kid', tip: 'Hit the red into the 9.', require: 'combo',
    cue: [330, 560], balls: [[9, 120, 130], [3, 170, 210]], targets: [9], shots: 5, par: 1, retry: true },
  { name: 'Kick Shot', tip: 'No straight line? Go off a cushion.', require: 'kick',
    cue: [250, 760], balls: [[8, 110, 160], [10, 150, 420], [11, 190, 430], [12, 230, 436], [13, 270, 436], [14, 310, 430], [15, 350, 420]],
    targets: [8], blockers: [10, 11, 12, 13, 14, 15], shots: 5, par: 1, retry: true },
  { name: 'Three Corners', tip: 'Ball in hand: place the white anywhere.', hand: 'anywhere',
    balls: [[2, 70, 90], [5, 440, 920], [7, 60, 900]], targets: [2, 5, 7], shots: 4, par: 3 },
  { name: 'Rail Runner', tip: 'Balls on the cushion roll straight down the rail.',
    cue: [250, 600], balls: [[1, 488, 260], [3, 12 + 0.5, 760], [6, 488, 840]], targets: [1, 3, 6], shots: 5, par: 3 },
  { name: 'Snookered', tip: 'Find a way round the wall.',
    cue: [250, 860], balls: [[9, 250, 140], [1, 190, 470], [2, 225, 480], [4, 260, 484], [5, 295, 480], [7, 330, 470]],
    targets: [9], blockers: [1, 2, 4, 5, 7], shots: 5, par: 1, retry: true },
  { name: 'The Clearance', tip: 'Six balls. Think one shot ahead.', hand: 'anywhere',
    balls: [[1, 110, 210], [2, 380, 160], [3, 250, 420], [4, 90, 640], [5, 400, 700], [6, 300, 880]],
    targets: [1, 2, 3, 4, 5, 6], shots: 9, par: 6 }
];
