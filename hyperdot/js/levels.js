/* Hyperdot — the campaign: five worlds, one for each dimension. Each world
   brings in one new axis. Maps are written as described at the top of
   js/grid.js. `par` is the fewest moves the level can be won in. Run
   `node tools/check-levels.js` after changing a map: it proves every level
   can be won and prints the par to use. */
(function (HD) {
  'use strict';

  const WORLDS = [
    {
      n: 1,
      name: 'The Line',
      sub: 'Forward and back',
      intro: [
        'You are a point on a line.',
        'There is forward, and there is back. That is all there is.',
      ],
      levels: [
        {
          name: 'Forward',
          par: 6,
          tip: 'Swipe, or tap ◀ ▶, to move. Reach the exit.',
          map: '@.....X',
        },
        {
          name: 'Both Ways',
          par: 17,
          tip: 'Pick up every shard to open the exit. Par is the fewest moves it can be done in.',
          map: '*...X..@..*',
        },
        {
          name: 'Locked',
          par: 15,
          tip: 'A key opens the door of the same colour.',
          map: '*.a..@..A.X',
        },
        {
          name: 'Push',
          par: 11,
          tip: 'Walk into a crate to push it. A crate on the plate holds the gate open.',
          map: 'X=...@o.._',
        },
        {
          name: 'Too Far',
          par: 14,
          tip: 'Nothing gets past anything on a line. ↶ takes back a move.',
          map: 'X=A*..@a.o._..',
        },
      ],
    },
    {
      n: 2,
      name: 'The Plane',
      sub: 'Around',
      intro: [
        'A second direction opens up, at right angles to the first.',
        'Now you can go around things.',
      ],
      levels: [
        {
          name: 'Around',
          par: 8,
          tip: '▲ and ▼ move you along the new direction. Now you can go around things.',
          map: [
            '@..#..X',
            '.......',
          ],
        },
        {
          name: 'Pick-up',
          par: 20,
          tip: 'The order you collect shards in matters for par.',
          map: [
            '*.#..*',
            '..#.#.',
            '.@....',
            '.##.#.',
            '*...#X',
          ],
        },
        {
          name: 'Keyhole',
          par: 31,
          map: [
            '.a#....',
            '.##.##.',
            '...@.#A',
            '###.##.',
            '*...#.X',
          ],
        },
        {
          name: 'Corner',
          par: 15,
          tip: 'Crates only go where you push them. Get behind one to change its direction.',
          map: [
            '@....#',
            '.o...#',
            '.#.#.#',
            '.#_#.#',
            '####=#',
            '..X...',
          ],
        },
        {
          name: 'Two Keys',
          par: 21,
          map: [
            'a..#.....',
            '.#.#.####',
            '.#.@.#*B.',
            '.#####.#.',
            '...A.b.#X',
          ],
        },
        {
          name: 'Overshoot',
          par: 10,
          tip: 'A crate in a corner is stuck for good. Undo if you get it wrong.',
          map: [
            '###....',
            '#@.o..#',
            '#..#..#',
            '#.#._.#',
            '#...#=#',
            '#####X#',
          ],
        },
        {
          name: 'Pair of Plates',
          par: 35,
          tip: 'Every plate has to be held down at once.',
          map: [
            '.@.....',
            '.o###o.',
            '.......',
            '_#.#.#_',
            '##.=.##',
            '###X###',
          ],
        },
        {
          name: 'Flat Out',
          par: 37,
          map: [
            '*..#a..#*',
            '.o.#.#...',
            '...=@#.#.',
            '##_#...#.',
            '.......A.',
            '*#.###.#X',
          ],
        },
      ],
    },
    {
      n: 3,
      name: 'The Space',
      sub: 'Over and under',
      intro: [
        'Up and down.',
        'A wall on the floor is just something to step over. Drag the view to turn it.',
      ],
      levels: [
        {
          name: 'Over the Top',
          par: 7,
          tip: 'Drag to turn the view. ▲ and ▼ move you up and down.',
          map: [
            ['@..#.', '...#X', '...#.'], // bottom floor
            ['#....', '#####', '#####'],
          ],
        },
        {
          name: 'Three Floors',
          par: 14,
          tip: 'You can also tap a glowing neighbour to step there.',
          map: [
            ['@.#', '#.#', '*..'], // bottom floor
            ['#.#', '...', '#.*'],
            ['*.#', '#.#', '..X'],
          ],
        },
        {
          name: 'Shaft',
          par: 14,
          tip: 'The strip at the top shows each floor on its own.',
          map: [
            ['@.#', '###', '#AX'], // bottom floor
            ['#.#', '#.#', '#.#'],
            ['#.#', '*.#', '###'],
            ['#.a', '###', '###'],
          ],
        },
        {
          name: 'Lift',
          par: 7,
          tip: 'Crates can be pushed up and down too.',
          map: [
            ['@..', '...', '..='], // bottom floor
            ['###', '#o#', '##X'],
            ['...', '._.', '..#'],
          ],
        },
        {
          name: 'Lattice',
          par: 21,
          map: [
            ['.a##', '#..*', 'A##.', 'X#*.'], // bottom floor
            ['.#.#', '.#..', '..#.', '#.##'],
            ['....', '#.#.', '#...', '*@..'],
          ],
        },
        {
          name: 'Hoist',
          par: 25,
          map: [
            ['.###', '...#', '...=', '#*#X'], // bottom floor
            ['.#*#', '....', '####', '.###'],
            ['..##', '..#.', '#o..', '@_#.'],
          ],
        },
        {
          name: 'Cube Root',
          par: 27,
          map: [
            ['..#*', '#...', '@.#.', '#.*#'], // bottom floor
            ['#..#', '..##', '.#X.', '#.#.'],
            ['.#.#', '....', '####', '*#..'],
            ['..##', '....', '.###', '...#'],
          ],
        },
        {
          name: 'Full Space',
          par: 37,
          map: [
            ['..#.', '.#..', '....', '#A#*'], // bottom floor
            ['..#.', '#@##', '.###', '#.*#'],
            ['.##.', '#...', '.#..', '.##a'],
            ['.o_.', '#.#.', '..##', '.#X='],
          ],
        },
      ],
    },
    {
      n: 4,
      name: 'The Tesseract',
      sub: 'Ana and kata',
      intro: [
        'Ana and kata: a fourth direction, at right angles to all three you know.',
        'Every step along it takes you into the next 3D slice of space. The strip at the top shows every slice side by side.',
      ],
      levels: [
        {
          name: 'Sealed',
          par: 5,
          tip: 'The exit is sealed in a box. Step ana (+W) into the next slice, go round, and step kata (−W) back inside.',
          map: [
            // w=0
            [
              ['@..', '.#.', '...'], // bottom floor
              ['.#.', '#X#', '.#.'],
              ['...', '.#.', '...'],
            ],
            // w=1
            [
              ['..#', '#.#', '###'], // bottom floor
              ['###', '#.#', '###'],
              ['###', '###', '###'],
            ],
          ],
        },
        {
          name: 'Next Door',
          par: 18,
          tip: 'Tap a slice in the strip to look into it without moving.',
          map: [
            // w=0
            [
              ['..#', '.#.', '..#'], // bottom floor
              ['.##', '##*', '#.#'],
              ['...', '.##', '#..'],
            ],
            // w=1
            [
              ['#..', '...', '.#X'], // bottom floor
              ['.#.', '..#', '.##'],
              ['##.', '##.', '*#@'],
            ],
          ],
        },
        {
          name: 'Elsewhere',
          par: 21,
          map: [
            // w=0
            [
              ['.#*', '..#', '#.#'], // bottom floor
              ['.#a', '#.#', '.#X'],
              ['..#', '#.#', '*#.'],
            ],
            // w=1
            [
              ['#@#', '.##', '#..'], // bottom floor
              ['#..', '##A', '..#'],
              ['.##', '...', '#..'],
            ],
          ],
        },
        {
          name: 'Push Ana',
          par: 19,
          tip: 'Crates move along W as well. Push one into the next slice.',
          map: [
            // w=0
            [
              ['@..', '##.', '##.'], // bottom floor
              ['###', '.#.', '..#'],
            ],
            // w=1
            [
              ['o#.', '.=#', '.#.'], // bottom floor
              ['#.#', '#.#', '.#.'],
            ],
            // w=2
            [
              ['_..', '.#.', '#*#'], // bottom floor
              ['##X', '#.#', '#.#'],
            ],
          ],
        },
        {
          name: 'Hypermaze',
          par: 23,
          map: [
            // w=0
            [
              ['.##', '##.', '@..'], // bottom floor
              ['...', '###', '.##'],
              ['.#.', '#..', '..#'],
            ],
            // w=1
            [
              ['#..', '##.', '#.#'], // bottom floor
              ['#.#', 'X##', '#..'],
              ['..#', '.##', '##.'],
            ],
            // w=2
            [
              ['#.#', '...', '..#'], // bottom floor
              ['###', '#.#', '*#*'],
              ['#..', '#..', '#*#'],
            ],
          ],
        },
        {
          name: 'Kata Key',
          par: 27,
          map: [
            // w=0
            [
              ['..#', '.#.', '.#*'], // bottom floor
              ['.##', '##.', '..#'],
              ['#..', '*.#', '#A#'],
            ],
            // w=1
            [
              ['.#.', '#.#', '..#'], // bottom floor
              ['.#.', '.#.', '#..'],
              ['.##', '#X#', '*#.'],
            ],
            // w=2
            [
              ['...', '#.#', 'a#.'], // bottom floor
              ['###', '..#', '##.'],
              ['...', '.#.', '@..'],
            ],
          ],
        },
        {
          name: 'Hyper Crate',
          par: 29,
          map: [
            // w=0
            [
              ['##.', '##.', '..#'], // bottom floor
              ['#*#', '@#*', '.##'],
              ['#=#', '..#', '#..'],
            ],
            // w=1
            [
              ['#.#', '_o.', '.#.'], // bottom floor
              ['##.', '..#', '#*#'],
              ['.#.', '##.', '##.'],
            ],
            // w=2
            [
              ['...', '.##', '#..'], // bottom floor
              ['.##', '#..', '##.'],
              ['..#', '.##', '#X.'],
            ],
          ],
        },
        {
          name: 'Tesseract',
          par: 36,
          map: [
            // w=0
            [
              ['.#.', '#A.', '.##'], // bottom floor
              ['.##', '##.', '#..'],
              ['#.#', '*#.', '.#.'],
            ],
            // w=1
            [
              ['##.', '..#', '.#.'], // bottom floor
              ['.#.', '.##', '##.'],
              ['#@.', '#.#', '.=#'],
            ],
            // w=2
            [
              ['X.#', '#.#', '#*#'], // bottom floor
              ['##.', '##o', '.#_'],
              ['a##', '.##', '.#.'],
            ],
          ],
        },
      ],
    },
    {
      n: 5,
      name: 'The Penteract',
      sub: 'W and V',
      intro: [
        'Two directions you can\'t point to.',
        'The slices are laid out in a grid now. W moves you across it, V moves you down it.',
      ],
      levels: [
        {
          name: 'Four Worlds',
          par: 13,
          tip: 'Tap any slice in the grid to look into it. W moves you across the grid, V moves you down it.',
          map: [
            // v=0
            [
              // w=0
              [
                ['@.#', '#.#', '#.*'], // bottom floor
              ],
              // w=1
              [
                ['###', '#..', '##*'], // bottom floor
              ],
            ],
            // v=1
            [
              // w=0
              [
                ['##X', '##.', '###'], // bottom floor
              ],
              // w=1
              [
                ['*..', '##.', '###'], // bottom floor
              ],
            ],
          ],
        },
        {
          name: 'Grid of Worlds',
          par: 22,
          map: [
            // v=0
            [
              // w=0
              [
                ['..#', '###', '..#'], // bottom floor
                ['@..', '###', '.#*'],
              ],
              // w=1
              [
                ['.#*', '..#', '##*'], // bottom floor
                ['.#.', '#.#', '#..'],
              ],
            ],
            // v=1
            [
              // w=0
              [
                ['#..', '#.#', '#..'], // bottom floor
                ['.#.', '.#.', '#X#'],
              ],
              // w=1
              [
                ['.##', '#..', '..#'], // bottom floor
                ['###', '.#.', '.#.'],
              ],
            ],
          ],
        },
        {
          name: 'Fifth Key',
          par: 24,
          map: [
            // v=0
            [
              // w=0
              [
                ['#.#', '#.#', '##.'], // bottom floor
                ['..#', '..#', '#.#'],
                ['##.', '...', '##a'],
              ],
              // w=1
              [
                ['...', '.##', '#..'], // bottom floor
                ['.##', '##.', 'X#.'],
                ['#*#', '##.', 'A##'],
              ],
            ],
            // v=1
            [
              // w=0
              [
                ['...', '.#.', '###'], // bottom floor
                ['#.#', '##.', '..@'],
                ['.#.', '###', '.##'],
              ],
              // w=1
              [
                ['###', '##*', '..#'], // bottom floor
                ['#..', '..#', '#..'],
                ['...', '#.#', '...'],
              ],
            ],
          ],
        },
        {
          name: 'Deep Push',
          par: 27,
          map: [
            // v=0
            [
              // w=0
              [
                ['#..', '..#', '.#.'], // bottom floor
                ['.#.', '.##', '#.#'],
              ],
              // w=1
              [
                ['.##', '#..', '.##'], // bottom floor
                ['#*#', '..#', '###'],
              ],
              // w=2
              [
                ['#.=', '#.#', '.#.'], // bottom floor
                ['.#.', '###', '#..'],
              ],
            ],
            // v=1
            [
              // w=0
              [
                ['.#.', '_o.', '##.'], // bottom floor
                ['..#', '##.', '..#'],
              ],
              // w=1
              [
                ['@.#', '.##', '#.#'], // bottom floor
                ['##.', '.##', '.#.'],
              ],
              // w=2
              [
                ['###', '###', '.#.'], // bottom floor
                ['.#.', '#..', '#.#'],
              ],
            ],
            // v=2
            [
              // w=0
              [
                ['...', '###', '.#.'], // bottom floor
                ['###', '#X#', '.#.'],
              ],
              // w=1
              [
                ['###', '*#.', '#.#'], // bottom floor
                ['.#.', '#.#', '##.'],
              ],
              // w=2
              [
                ['...', '##.', '#..'], // bottom floor
                ['.##', '#.#', '###'],
              ],
            ],
          ],
        },
        {
          name: 'Far Shores',
          par: 34,
          map: [
            // v=0
            [
              // w=0
              [
                ['.#*', '.##', '#.#'], // bottom floor
                ['#.#', '..#', '##.'],
                ['###', '.##', '#..'],
              ],
              // w=1
              [
                ['.##', '#..', '.##'], // bottom floor
                ['.#.', '###', 'X#@'],
                ['##.', '.#.', '#.#'],
              ],
              // w=2
              [
                ['..#', '...', '#.#'], // bottom floor
                ['###', '#.#', '#.#'],
                ['..#', '.##', '.#.'],
              ],
            ],
            // v=1
            [
              // w=0
              [
                ['...', '#..', '#..'], // bottom floor
                ['###', '#.#', '*##'],
                ['...', '##.', '..#'],
              ],
              // w=1
              [
                ['##.', '..#', '.#A'], // bottom floor
                ['##.', '#.#', '##.'],
                ['.##', '##.', 'a##'],
              ],
              // w=2
              [
                ['.##', '##.', '.##'], // bottom floor
                ['#..', '*#.', '..#'],
                ['.#.', '#.#', '#..'],
              ],
            ],
          ],
        },
        {
          name: 'Penteract',
          par: 40,
          map: [
            // v=0
            [
              // w=0
              [
                ['...', '###', '...'], // bottom floor
                ['###', '...', '...'],
                ['*..', '###', '..#'],
              ],
              // w=1
              [
                ['.##', '##_', '#.#'], // bottom floor
                ['#..', '.##', '#.#'],
                ['###', '...', '##.'],
              ],
              // w=2
              [
                ['##.', '.#.', '.##'], // bottom floor
                ['##.', '#.#', '.##'],
                ['###', '###', '#.#'],
              ],
            ],
            // v=1
            [
              // w=0
              [
                ['##.', '###', '..#'], // bottom floor
                ['.#.', '.##', '##.'],
                ['#.#', '#.#', '.#.'],
              ],
              // w=1
              [
                ['.#.', '#*o', '###'], // bottom floor
                ['###', '##.', '#.#'],
                ['...', '.##', '##.'],
              ],
              // w=2
              [
                ['#*#', '###', '..@'], // bottom floor
                ['###', '...', '#.#'],
                ['##.', '.#.', '..#'],
              ],
            ],
            // v=2
            [
              // w=0
              [
                ['#..', '...', '.#.'], // bottom floor
                ['.##', '##.', '#.#'],
                ['.##', '##.', '..#'],
              ],
              // w=1
              [
                ['.##', '##.', '..#'], // bottom floor
                ['#a.', '###', '.#.'],
                ['##.', '...', '#.#'],
              ],
              // w=2
              [
                ['#.=', '##.', '##.'], // bottom floor
                ['X##', '###', '.#.'],
                ['A.#', '#.#', '##.'],
              ],
            ],
          ],
        },
      ],
    },
  ];

  // Give every level its id ("3-2") and a back-reference to its world.
  for (const w of WORLDS) {
    w.levels.forEach((lv, i) => {
      lv.id = w.n + '-' + (i + 1);
      lv.index = i;
      lv.world = w;
    });
  }

  function find(id) {
    for (const w of WORLDS) for (const lv of w.levels) if (lv.id === id) return lv;
    return null;
  }

  // The level after this one, crossing into the next world at the end.
  function next(lv) {
    const w = lv.world;
    if (lv.index + 1 < w.levels.length) return w.levels[lv.index + 1];
    const nw = WORLDS[w.n];
    return nw ? nw.levels[0] : null;
  }

  HD.levels = { WORLDS, find, next };
})(window.HD = window.HD || {});
