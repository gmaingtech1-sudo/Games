// Voice: speech-to-text, text-to-speech queue and wake-word listening,
// on top of whatever the platform provides (native Android / Windows speech,
// or the browser's Web Speech API).
//
// Wake word:
//  - Windows: native, offline keyword spotting (System.Speech), runs while the
//    JARVIS app is running.
//  - Android / browser: "listen for wake word while the app is open". It
//    restarts the speech recogniser in a loop, so it only runs while the app
//    is on screen and stops when you switch away or the screen turns off.

export function createVoice({ platform, prefs, on }) {
  let listening = false;
  let speakingIds = new Set();
  let nextUtterance = 1;
  let wakeActive = false;
  let wakeLoopRunning = false;
  let wakeTimer = 0;
  let mode = 'idle'; // idle | command | wake
  const nativeWake = platform.can('wakeWord');

  const emitState = () => on.state?.({ listening: listening && mode === 'command', speaking: speakingIds.size > 0 });

  platform.on('stt.ready', () => { if (mode === 'command') on.ready?.(); });
  platform.on('stt.partial', ({ text }) => {
    if (mode === 'command') on.partial?.(text);
    else if (mode === 'wake') checkWake(text, false);
  });
  platform.on('stt.final', ({ text }) => {
    if (mode === 'command') {
      listening = false;
      mode = 'idle';
      emitState();
      on.final?.(text);
    } else if (mode === 'wake') {
      checkWake(text, true);
    }
  });
  platform.on('stt.level', ({ level }) => on.level?.(level));
  platform.on('stt.error', (err) => {
    const wasCommand = mode === 'command';
    if (wasCommand) {
      listening = false;
      mode = 'idle';
      emitState();
      // "No speech heard" is not worth an error message.
      if (!['no_match', 'no-speech', 'speech_timeout', 'aborted', 'no_speech'].includes(err.code)) on.error?.(err);
      else on.nothingHeard?.();
    } else if (mode === 'wake' && err.code === 'permission_denied') {
      stopWake();
      on.error?.(err);
    }
  });
  platform.on('stt.end', () => {
    if (mode === 'command') {
      listening = false;
      mode = 'idle';
      emitState();
      on.ended?.();
    } else if (mode === 'wake') {
      mode = 'idle';
      scheduleWakeLoop(400);
    }
  });

  platform.on('tts.start', () => emitState());
  platform.on('tts.boundary', () => on.level?.(0.6 + Math.random() * 0.4));
  platform.on('tts.done', ({ id }) => {
    speakingIds.delete(id);
    emitState();
    if (!speakingIds.size) on.speechDone?.();
  });
  platform.on('wake.detected', ({ text }) => on.wake?.(text || ''));
  platform.on('emergency.stop', () => stopAll());

  function phraseRegex() {
    const p = (prefs().wakePhrase || 'Jarvis').trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\b)(hey |ok |okay )?${p}\\b[,.!?]?\\s*(.*)$`, 'i');
  }

  function checkWake(text, final) {
    const m = phraseRegex().exec(text.toLowerCase());
    if (!m) return;
    const rest = text.slice(text.length - m[3].length).trim();
    if (!final && rest.length < 2) return; // wait for the command after the name
    platform.call('stt.cancel').catch(() => {});
    mode = 'idle';
    on.wake?.(final ? rest : rest);
  }

  function scheduleWakeLoop(ms) {
    clearTimeout(wakeTimer);
    if (!wakeActive || nativeWake) return;
    wakeTimer = setTimeout(runWakeLoop, ms);
  }

  async function runWakeLoop() {
    if (!wakeActive || document.hidden || listening || speakingIds.size || mode !== 'idle' || on.isBusy?.()) {
      if (wakeActive) scheduleWakeLoop(1500);
      return;
    }
    mode = 'wake';
    try {
      await platform.call('stt.start', { lang: prefs().language, partial: true, quiet: true });
    } catch (err) {
      mode = 'idle';
      if (err.code === 'permission_denied' || err.code === 'unsupported') {
        stopWake();
        on.error?.(err);
      } else {
        scheduleWakeLoop(3000);
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!wakeActive || nativeWake) return;
    if (document.hidden) {
      clearTimeout(wakeTimer);
      if (mode === 'wake') platform.call('stt.cancel').catch(() => {});
      mode = 'idle';
    } else {
      scheduleWakeLoop(600);
    }
  });

  async function listen() {
    if (listening) return;
    await stopSpeaking();
    if (mode === 'wake') {
      await platform.call('stt.cancel').catch(() => {});
    }
    clearTimeout(wakeTimer);
    mode = 'command';
    listening = true;
    emitState();
    try {
      await platform.call('stt.start', { lang: prefs().language, partial: true });
    } catch (err) {
      listening = false;
      mode = 'idle';
      emitState();
      on.error?.(err);
    }
  }

  async function stopListening() {
    if (!listening) return;
    await platform.call('stt.stop').catch(() => {});
  }

  async function cancelListening() {
    if (!listening) return;
    listening = false;
    mode = 'idle';
    emitState();
    await platform.call('stt.cancel').catch(() => {});
  }

  function speak(text) {
    if (!text || !platform.can('tts')) return;
    const p = prefs();
    const id = `u${nextUtterance++}`;
    speakingIds.add(id);
    emitState();
    platform.call('tts.speak', { text, id, rate: p.rate, pitch: p.pitch, volume: p.volume, voice: p.voice || null, lang: p.language }).catch((err) => {
      speakingIds.delete(id);
      emitState();
      on.error?.(err);
    });
  }

  async function stopSpeaking() {
    if (!speakingIds.size) return;
    speakingIds = new Set();
    emitState();
    await platform.call('tts.stop').catch(() => {});
  }

  async function startWake() {
    wakeActive = true;
    if (nativeWake) {
      await platform.call('wake.start', { phrase: prefs().wakePhrase || 'Jarvis' });
    } else {
      scheduleWakeLoop(300);
    }
  }

  function stopWake() {
    wakeActive = false;
    clearTimeout(wakeTimer);
    if (nativeWake) platform.call('wake.stop').catch(() => {});
    else if (mode === 'wake') { platform.call('stt.cancel').catch(() => {}); mode = 'idle'; }
  }

  async function stopAll() {
    await cancelListening();
    await stopSpeaking();
  }

  return {
    listen,
    stopListening,
    cancelListening,
    speak,
    stopSpeaking,
    stopAll,
    startWake,
    stopWake,
    resumeWake: () => scheduleWakeLoop(500),
    get listening() { return listening && mode === 'command'; },
    get speaking() { return speakingIds.size > 0; },
    get wakeActive() { return wakeActive; },
    get nativeWake() { return nativeWake; },
  };
}
