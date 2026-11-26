// Interview content: the interviewers, the weapons and the questions.

export const CHARS = [
  {
    name: 'Gary Pemberton', title: 'Regional Manager', hp: 80, plate: 'G. PEMBERTON',
    skin: '#f2c29b', hair: 'combover', hairColor: '#5a3b22', shirt: '#cfe0f5', jacket: null, tie: '#c0392b',
    glasses: 'square', o: 'him', p: 'his',
    intro: "Hi! Gary Pemberton, Regional Manager. Take a seat. Let's see if you're Synergex material.",
    hits: [
      "OW! Okay. I'll put that down as 'strong communication skills'.",
      "That's... that's going in my notes.",
      "HR is going to hear about this!",
      "Moving on. Moving ON.",
      "I have a wife! Well, I had a wife. Ow!",
      "Is this how they do interviews now?!",
    ],
    impressed: [
      "Honestly? That's the go-getter attitude we need round here.",
      "Ow. But wow. You really take initiative.",
    ],
    ko: "...you're... overqualified...",
  },
  {
    name: 'Karen Whitlock', title: 'Head of HR', hp: 100, plate: 'K. WHITLOCK',
    skin: '#e8b48f', hair: 'bun', hairColor: '#d9b44a', shirt: '#ffffff', jacket: '#7d3c98', tie: null,
    glasses: 'cat', lipstick: '#c2185b', pearls: true, o: 'her', p: 'her',
    intro: "I heard screaming. I'm Karen, Head of HR. I'll be continuing this interview. Calmly.",
    hits: [
      "This is a formal written warning!",
      "I'm writing you up and you don't even WORK here!",
      "That is a violation of at least four policies.",
      "I need to speak to... myself. I'm the manager.",
      "My lanyard! You bent my lanyard!",
      "We have a zero-tolerance policy! ZERO!",
    ],
    impressed: [
      "Assertive. Very assertive. I'm putting 'leadership potential'.",
      "Fine. That shows... conflict resolution skills.",
    ],
    ko: "I'm... filing... a complaint...",
  },
  {
    name: 'Sterling Vance III', title: 'CEO', hp: 120, plate: 'S. VANCE III',
    skin: '#f0c8a8', hair: 'bald', hairColor: '#d5d5d5', shirt: '#ffffff', jacket: '#232323', tie: '#d4ac0d',
    mustache: true, monocle: true, o: 'him', p: 'his',
    intro: "Nobody beats up my staff except ME. I'm the CEO. Sit down and impress me.",
    hits: [
      "Do you have ANY idea what this suit cost?",
      "I've fired people for less. I've fired people for nothing!",
      "My lawyers will hear about this. All forty of them.",
      "You'll never work in this town again! Probably!",
      "My monocle! That was my grandfather's!",
      "Unacceptable! ...Mildly impressive. But unacceptable!",
    ],
    impressed: [
      "Ruthless. I like that. Reminds me of me.",
      "That's the killer instinct this company was built on!",
    ],
    ko: "Tell... the board... no... raises...",
  },
];

export const ACTIONS = {
  gun:     { label: '🔫 Get my gun out and shoot {o}.', dmg: 40, word: 'BANG!' },
  punch:   { label: '👊 Punch {o} in the face.', dmg: 25, word: 'POW!' },
  slap:    { label: '✋ Slap {o} across the desk.', dmg: 15, word: 'SLAP!' },
  coffee:  { label: '☕ Throw my hot coffee at {o}.', dmg: 20, word: 'SPLASH!' },
  stapler: { label: '📎 Lob the stapler at {p} head.', dmg: 20, word: 'BONK!' },
  desk:    { label: '(╯°□°)╯ Flip the desk on {o}.', dmg: 35, word: 'CRASH!' },
  chair:   { label: '🪑 Smash a chair over {p} head.', dmg: 30, word: 'WHAM!' },
};

export const WEAPON_LINES = {
  gun: ["Did you just SHOOT me?!", "That's a bullet. In me. In an INTERVIEW.", "You brought a GUN to a job interview?!"],
  punch: ["My face! I need that for Zoom calls!", "Ow! My nose! My beautiful nose!"],
  slap: ["Did you just... slap me?", "That stings. Emotionally too."],
  coffee: ["AAAH! HOT! HOT! HOT!", "Is this... decaf? MONSTER!"],
  stapler: ["Ow! That stapler is company property!", "BONK? Did you just say bonk?"],
  desk: ["My desk! I had my lunch in there!", "Nobody flips the desk at Synergex!"],
  chair: ["That chair was ergonomic!", "Ow! That's coming out of your first paycheck!"],
};

// Talk answers: [text, hire change, reply]. Some questions offer their own violent answers: v: [[weapon, text]].
export const QUESTIONS = [
  { q: "So, tell me a bit about yourself.", a: [
    ["I'm a hard worker and a real team player.", 8, "Wow. Never heard that one before. Great."],
    ["I once ate forty chicken nuggets in one sitting.", 2, "...That's genuinely impressive, actually."],
    ["I'd rather not, to be honest.", -10, "Okay. Mysterious. Not in a good way."]] },
  { q: "Where do you see yourself in five years?", a: [
    ["Growing with this company.", 10, "Love it. Very corporate. Very good."],
    ["In your chair.", -4, "Ha. Ha ha. That's not funny."],
    ["Honestly? Asleep.", -8, "Relatable. Still a no."]],
    v: [['gun', "🔫 Somewhere you aren't. *gets gun out*"]] },
  { q: "What would you say is your biggest weakness?", a: [
    ["I work too hard.", 5, "Ah, the classic. Noted."],
    ["Kryptonite.", 0, "...Are you Superman? Is that on your CV?"],
    ["Job interviews, clearly.", 2, "At least you're honest."]] },
  { q: "A customer is screaming at you. What do you do in this situation?", a: [
    ["Stay calm, listen and help them.", 14, "Textbook! That's what we like to hear."],
    ["Scream back, but louder.", -10, "That's... not in the handbook."]],
    v: [['gun', "🔫 Get my gun out and shoot {o}. Problem solved."]] },
  { q: "Your coworker keeps stealing your lunch from the fridge. What do you do?", a: [
    ["Label my food clearly and have a chat.", 8, "Mature. Sensible. Boring, but good."],
    ["Fill my sandwiches with ghost peppers.", -2, "...I'll be eating out for a while."]],
    v: [['punch', "👊 Show you exactly what I'd do. *punches {o}*"]] },
  { q: "Why do you want to work here?", a: [
    ["I'm passionate about synergy.", 10, "Synergy! Finally, someone who gets it."],
    ["My mum said I have to.", -6, "Tell your mum we said hi."],
    ["The free biscuits.", 0, "The biscuits ARE good. Fair."]] },
  { q: "How do you handle stress at work?", a: [
    ["Deep breaths and a good to-do list.", 10, "Very healthy. Very employable."],
    ["I don't. I just sort of vibrate.", -3, "I can see that, yeah."]],
    v: [['desk', "(╯°□°)╯ Like this. *flips the desk*"]] },
  { q: "The printer jams the night before a huge deadline. What do you do?", a: [
    ["Fix it, or find another printer fast.", 10, "Problem-solver. Love it."],
    ["Take it out to a field. Old school.", 0, "Ah, I've seen that film."]] },
  { q: "What would your last boss say about you?", a: [
    ["That I'm reliable and always on time.", 8, "We'll call them. Maybe."],
    ["Nothing. Legally he's not allowed to.", -10, "...Why not?"]] },
  { q: "How many tennis balls would fit in this room?", a: [
    ["About four thousand.", 6, "Confident. I like it."],
    ["Depends how hard I throw them.", -4, "Please don't throw anything."]],
    v: [['stapler', "📎 I don't know, but here's a stapler. *throws it*"]] },
  { q: "Would you be willing to work weekends for no extra pay?", a: [
    ["Of course! Happy to help!", 14, "Excellent. You'll fit right in. Sucker."],
    ["Absolutely not.", -10, "Hmm. Not a team player then."]],
    v: [['punch', "👊 Ask me that again. Go on. *punches {o}*"]] },
  { q: "We like to think of ourselves as one big family here.", a: [
    ["That's lovely to hear.", 6, "It is lovely. Mandatory, but lovely."],
    ["So... dysfunctional, then?", -4, "We don't use that word here."]] },
  { q: "What kind of salary are you expecting?", a: [
    ["Whatever is fair for the role.", 6, "Great, minimum wage it is!"],
    ["One billion. Cash. In a briefcase.", -6, "I'll have to run that by finance."]],
    v: [['gun', "🔫 Let my gun do the negotiating."]] },
  { q: "Do you have any questions for me?", a: [
    ["What does a typical day look like?", 10, "Great question! Meetings. Then meetings about meetings."],
    ["Is that your real hair?", -10, "I... how DARE you."]] },
  { q: "Describe yourself in three words.", a: [
    ["Driven. Focused. Loyal.", 10, "Three words! Perfect counting too."],
    ["Bad at counting.", 0, "That's three. Wait. Is it?"]] },
  { q: "Your manager makes a terrible decision. What do you do?", a: [
    ["Raise it with them respectfully.", 10, "Exactly. Then we ignore you. Respectfully."],
    ["Start a rumour about them.", -6, "That's how I got THIS job, but still, no."]],
    v: [['chair', "🪑 This. *picks up a chair*"]] },
  { q: "Sell me this pen.", a: [
    ["This pen will change your life.", 6, "Ooh. Tell me more, pen person."],
    ["No.", -6, "...Fair, honestly. It's a rubbish pen."]],
    v: [['stapler', "📎 Here, have a stapler instead. *throws it*"]] },
  { q: "We've had a complaint that you've been rude in this interview. How do you respond?", a: [
    ["I sincerely apologise.", 10, "Apology accepted. Gold star."],
    ["Who complained? Name names.", -6, "I can't tell you that. It was me."]],
    v: [['coffee', "☕ Respond with my coffee. *throws it*"]] },
  { q: "How do you feel about working in an open-plan office?", a: [
    ["Love it! Great for collaboration.", 8, "Collaboration! Buzzword bingo, you win."],
    ["I'll need noise-cancelling headphones and a moat.", -2, "The moat is not in the budget."]] },
  { q: "Your team misses a target. Whose fault is it?", a: [
    ["We win together and lose together.", 10, "Beautiful. I'm going to put that on a mug."],
    ["Whoever's standing closest to me.", -6, "That's... me. I'm closest."]],
    v: [['slap', "✋ Yours. *slaps {o}*"]] },
];

export const HIT_ORDER = ['gun', 'punch', 'coffee', 'desk', 'chair', 'stapler', 'slap'];
export const MAX_Q = 12;
