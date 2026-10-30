/* Filmstrip — the AI helper, powered by Claude. Two jobs:
   - the AI Director: you describe the video you want, Claude looks at your
     photos and clips and plans it (order, timing, trims, titles, words on
     screen, motion and transitions);
   - Suggest words: a caption for one scene.

   It calls the Claude API straight from the phone with your own API key,
   which is kept on this device only. Pictures are sent as small JPEGs. */
(function (FS) {
  'use strict';

  const MODEL = 'claude-opus-5-5';
  const KEY_STORE = 'filmstrip-ai-key';
  const MAX_IMAGES = 80;    // per request, across all scenes
  const IMG_EDGE = 512;     // longest side of each picture sent, in pixels

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------- the API key ---------- */

  function getKey() {
    try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }

  function setKey(k) {
    try {
      if (k) localStorage.setItem(KEY_STORE, k.trim());
      else localStorage.removeItem(KEY_STORE);
    } catch (e) { /* storage blocked: the key lasts until the page closes */ }
    memKey = k ? k.trim() : '';
  }

  let memKey = '';
  const key = () => getKey() || memKey;

  function client() {
    return new window.Anthropic({ apiKey: key(), dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  /* ---------- pictures to send ---------- */

  function toJpeg(src, sw, sh) {
    const s = Math.min(1, IMG_EDGE / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * s));
    c.height = Math.max(1, Math.round(sh * s));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  function photoImage(m) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(toJpeg(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => resolve(null);
      img.src = m.url;
    });
  }

  // A few frames from a clip, at the given times (seconds).
  function clipFrames(m, times) {
    return new Promise((resolve) => {
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      document.getElementById('media-pool').appendChild(el);
      const out = [];
      let i = 0;
      const done = () => {
        clearTimeout(giveUp);
        el.removeAttribute('src');
        el.load();
        el.remove();
        resolve(out);
      };
      const giveUp = setTimeout(done, 15000);
      const next = () => {
        if (i >= times.length) return done();
        el.currentTime = times[i];
      };
      el.onseeked = () => {
        if (el.videoWidth) out.push({ at: times[i], data: toJpeg(el, el.videoWidth, el.videoHeight) });
        i++;
        next();
      };
      el.onloadeddata = next;
      el.onerror = done;
      el.src = m.url;
    });
  }

  const imageBlock = (data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });

  // Describe each scene in words, followed by its pictures.
  async function describeScenes(scenes, onStep) {
    const blocks = [];
    const videos = scenes.filter((s) => s.type === 'video').length;
    const photos = scenes.filter((s) => s.type === 'photo').length;
    // Spread the picture allowance: one per photo, the rest across clips.
    const perClip = videos ? clamp(Math.floor((MAX_IMAGES - photos) / videos), 1, 4) : 0;
    let budget = MAX_IMAGES;

    for (let n = 0; n < scenes.length; n++) {
      const sc = scenes[n];
      const m = sc.mediaId ? FS.store.media.get(sc.mediaId) : null;
      if (onStep) onStep(n / scenes.length);
      if (sc.type === 'title') {
        blocks.push({ type: 'text', text: `Scene ${sc.id}: an existing title card that says "${sc.text || ''}" (${FS.sceneLen(sc).toFixed(1)} s).` });
        continue;
      }
      if (sc.type === 'photo') {
        blocks.push({ type: 'text', text: `Scene ${sc.id}: a photo${sc.text ? `, with the words "${sc.text}"` : ''}.` });
        if (m && budget > 0) {
          const data = await photoImage(m);
          if (data) {
            blocks.push(imageBlock(data));
            budget--;
          }
        }
        continue;
      }
      const full = m ? m.duration : sc.out;
      blocks.push({
        type: 'text',
        text: `Scene ${sc.id}: a video clip, ${full.toFixed(1)} s long in full (currently trimmed to ${sc.in.toFixed(1)}–${sc.out.toFixed(1)} s)`
          + `${sc.muted ? ', its sound is off' : ''}${sc.text ? `, with the words "${sc.text}"` : ''}. Frames from it:`,
      });
      if (m && budget > 0) {
        const k = Math.min(perClip, budget);
        const times = Array.from({ length: k }, (_, j) => full * (j + 0.5) / k);
        for (const f of await clipFrames(m, times)) {
          blocks.push({ type: 'text', text: `(at ${f.at.toFixed(1)} s)` }, imageBlock(f.data));
          budget--;
        }
      }
    }
    return blocks;
  }

  /* ---------- calling Claude ---------- */

  // Errors the app can explain in plain words.
  function friendly(e) {
    const A = window.Anthropic;
    if (e instanceof A.AuthenticationError) return "That API key didn't work. Check it in Settings.";
    if (e instanceof A.PermissionDeniedError) return "That API key isn't allowed to use this model.";
    if (e instanceof A.RateLimitError) return 'The AI is busy or your usage limit was reached. Try again in a minute.';
    if (e instanceof A.APIConnectionError) return "Couldn't reach the AI. Check your internet connection.";
    if (e instanceof A.BadRequestError) return 'The AI could not take this request. Try with fewer or smaller scenes.';
    if (e instanceof A.APIError) return 'The AI had a problem. Please try again.';
    return e && e.message ? e.message : 'Something went wrong.';
  }

  async function ask({ system, content, schema, effort }) {
    if (!key()) throw new Error('Add your API key in Settings to use AI.');
    if (!window.Anthropic) throw new Error("The AI helper didn't load.");
    let res;
    try {
      res = await client().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // If a safety check declines the request, let the API retry it on
        // its recommended fallback model instead of just stopping.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort, format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content }],
      });
    } catch (e) {
      throw new Error(friendly(e));
    }
    if (res.stop_reason === 'refusal') throw new Error('The AI declined this one. Try describing it differently.');
    if (res.stop_reason === 'max_tokens') throw new Error('The AI ran out of room. Try with fewer scenes.');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('The AI gave an answer the app could not read. Please try again.');
    }
  }

  /* ---------- the AI Director ---------- */

  const THEME_IDS = FS.draw.THEMES.map((t) => t.id);
  const LENGTHS = {
    auto: 'Choose a length that suits the footage and the request.',
    short: 'Aim for a short video, around 30 seconds. Leave out weaker shots and trim clips hard.',
    medium: 'Aim for about 1 to 2 minutes.',
    all: 'Use every photo and clip, keeping the best parts of each clip.',
    long: 'Make a long video that keeps most of the footage. It may run up to 20 minutes.',
  };

  const PLAN_SCHEMA = {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One or two friendly sentences telling the user what you made.' },
      scenes: {
        type: 'array',
        description: 'The finished video, in order.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['media', 'title'] },
            ref: { type: 'string', description: 'The id of an existing scene, or an empty string for a new title card.' },
            text: { type: 'string', description: 'Words shown on screen. Empty for none.' },
            seconds: { type: 'number', description: 'How long a photo or title stays on screen.' },
            clip_start: { type: 'number', description: 'For a clip: where it starts, in seconds into the clip. 0 otherwise.' },
            clip_end: { type: 'number', description: 'For a clip: where it ends, in seconds into the clip. 0 otherwise.' },
            text_place: { type: 'string', enum: ['top', 'middle', 'bottom'] },
            text_size: { type: 'string', enum: ['S', 'M', 'L'] },
            motion: { type: 'string', enum: ['none', 'zoom-in', 'zoom-out', 'pan'], description: 'Slow camera move, for photos.' },
            transition: { type: 'string', enum: ['cut', 'fade', 'slide', 'zoom', 'dip'], description: 'How this scene comes in.' },
            theme: { type: 'string', enum: THEME_IDS, description: 'Background colors, for title cards.' },
            clip_sound: { type: 'boolean', description: "For a clip: whether to keep the clip's own sound." },
          },
          required: ['kind', 'ref', 'text', 'seconds', 'clip_start', 'clip_end', 'text_place', 'text_size', 'motion', 'transition', 'theme', 'clip_sound'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'scenes'],
    additionalProperties: false,
  };

  const DIRECTOR_SYSTEM = `You are the AI Director inside Filmstrip, a phone app for making videos up to 20 minutes long out of photos, video clips and title cards. The user gives you their scenes (each with an id, plus pictures so you can see them) and says what kind of video they want. You plan the finished video.

How to plan:
- Put the scenes in an order that tells a story or builds well: a beginning, a middle and an end. Use the pictures to understand what each scene shows.
- Refer to existing scenes by their id, each at most once. Use every photo and clip unless the user's request or the length you were asked for means leaving weaker ones out.
- Add title cards where they help: usually an opening title, and sometimes a closing one or a few section cards. A title card has kind "title" and an empty ref. You may keep an existing title card by its id or drop it.
- Words on screen should be short (a few words, at most a short sentence), specific to what the picture shows, and in the voice the user asked for. Not every scene needs words. Write in the language the user wrote in.
- Photos: usually 2.5 to 5 seconds. Titles: 2 to 4 seconds. For clips, choose clip_start and clip_end within the clip's full length to keep the best part.
- Vary motion on photos and keep transitions consistent with the mood: fades for gentle videos, cuts and slides for energetic ones.
- The whole video must not be longer than 20 minutes.`;

  async function direct(project, brief, length, onStep) {
    const scenes = project.scenes;
    const intro = [
      `What the user wants: ${brief.trim() || 'A nice video made from these scenes. Choose a style that suits them.'}`,
      `Length: ${LENGTHS[length] || LENGTHS.auto}`,
      `Video shape: ${project.aspect === '16:9' ? 'wide (16:9)' : project.aspect === '1:1' ? 'square' : 'tall (9:16), for phones'}.`,
      `Music: ${project.music ? 'the user has added a song that plays underneath.' : 'none yet.'}`,
      `There are ${scenes.length} scenes:`,
    ].join('\n');
    const content = [{ type: 'text', text: intro }, ...(await describeScenes(scenes, onStep))];
    if (onStep) onStep(1);
    const plan = await ask({ system: DIRECTOR_SYSTEM, content, schema: PLAN_SCHEMA, effort: 'medium' });
    return { summary: String(plan.summary || ''), scenes: buildScenes(project, plan.scenes || []) };
  }

  // Turn Claude's plan into real scenes, keeping every value within what the
  // app can do and the whole video within 20 minutes.
  function buildScenes(project, items) {
    const byId = new Map(project.scenes.map((s) => [s.id, s]));
    const used = new Set();
    const out = [];
    for (const it of items) {
      const look = {
        text: String(it.text || '').slice(0, 300),
        textPos: ['top', 'middle', 'bottom'].includes(it.text_place) ? it.text_place : 'bottom',
        size: ['S', 'M', 'L'].includes(it.text_size) ? it.text_size : 'M',
        transition: ['cut', 'fade', 'slide', 'zoom', 'dip'].includes(it.transition) ? it.transition : 'fade',
      };
      const old = it.ref ? byId.get(it.ref) : null;
      if (old && used.has(old.id)) continue;
      if (it.kind === 'title' && (!old || old.type === 'title')) {
        if (old) used.add(old.id);
        out.push({
          ...(old || {}), ...look,
          id: old ? old.id : FS.uid(),
          type: 'title',
          dur: clamp(Number(it.seconds) || 3, 1, 15),
          theme: THEME_IDS.includes(it.theme) ? it.theme : (old ? old.theme : 'ink'),
          textPos: it.text_place || 'middle',
          size: look.size,
        });
        continue;
      }
      if (!old || old.type === 'title') continue;
      used.add(old.id);
      const sc = { ...old, ...look };
      if (old.type === 'photo') {
        sc.dur = clamp(Number(it.seconds) || 4, 0.5, 60);
        sc.effect = ['none', 'zoom-in', 'zoom-out', 'pan'].includes(it.motion) ? it.motion : old.effect;
      } else {
        const m = FS.store.media.get(old.mediaId);
        const full = m ? m.duration : old.out;
        let a = clamp(Number(it.clip_start) || 0, 0, Math.max(0, full - 0.5));
        let b = clamp(Number(it.clip_end) || full, a + 0.5, full);
        if (!(b > a)) {
          a = old.in;
          b = old.out;
        }
        sc.in = a;
        sc.out = b;
        sc.muted = it.clip_sound === false;
      }
      out.push(sc);
    }

    // Too long? Shrink everything evenly, then drop whatever still spills over.
    let total = out.reduce((t, s) => t + FS.sceneLen(s), 0);
    if (total > FS.MAX) {
      const f = FS.MAX / total;
      for (const s of out) {
        if (s.type === 'video') s.out = s.in + Math.max(0.5, (s.out - s.in) * f);
        else s.dur = Math.max(0.5, s.dur * f);
      }
      total = out.reduce((t, s) => t + FS.sceneLen(s), 0);
      while (total > FS.MAX && out.length) total -= FS.sceneLen(out.pop());
    }
    return out;
  }

  /* ---------- Suggest words ---------- */

  const WORDS_SCHEMA = {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  };

  async function suggestWords(project, sc) {
    const others = project.scenes.filter((s) => s !== sc && s.text).map((s) => `"${s.text}"`).slice(0, 12);
    const content = [
      ...(await describeScenes([sc])),
      {
        type: 'text',
        text: `Suggest the words to show on screen for scene ${sc.id}.${sc.text ? ` It currently says "${sc.text}"; offer something different.` : ''}`
          + `${others.length ? ` Other scenes in this video say: ${others.join(', ')}. Match their voice and language.` : ''}`,
      },
    ];
    const res = await ask({
      system: sc.type === 'title'
        ? 'You write title cards for short personal videos made in a phone app. Reply with one title: a few words, no quotation marks, no hashtags.'
        : 'You write the words shown on screen over a photo or clip in a short personal video made in a phone app. Reply with one caption: a few words or one short sentence about what the picture shows, no quotation marks, no hashtags.',
      content,
      schema: WORDS_SCHEMA,
      effort: 'low',
    });
    return String(res.text || '').trim().slice(0, 300);
  }

  FS.ai = {
    get ready() { return !!key(); },
    getKey: key,
    setKey,
    direct,
    suggestWords,
    LENGTHS,
  };
})(window.FS = window.FS || {});
