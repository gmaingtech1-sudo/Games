/* Portal Hackers: Nexus — the hacking puzzle. The portal flashes a code
   across a grid of nodes; repeat it before the timer runs out. Advanced and
   Expert hacks use bigger grids, longer codes and faster flashes. Hacking
   upgrades slow the code, add time and forgive mistakes. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const A = () => PH.audio;

  let run = null;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function sequence(n, len) {
    const out = [];
    while (out.length < len) {
      const k = Math.floor(Math.random() * n);
      if (k !== out[out.length - 1]) out.push(k);
    }
    return out;
  }

  function setStatus(text, kind) {
    const el = $('hk-status');
    el.textContent = text;
    el.className = `hk-status ${kind || ''}`;
  }

  function lives(left, total) {
    $('hk-lives').textContent = total ? `${'◆'.repeat(left)}${'◇'.repeat(total - left)} forgiven` : '';
  }

  // Resolves true on a successful hack, false otherwise.
  function start(o) {
    if (run) return Promise.resolve(false);
    const P = o.params;
    const n = P.grid * P.grid;
    const seq = sequence(n, P.len);
    const grid = $('hk-grid');
    grid.innerHTML = '';
    grid.style.setProperty('--n', P.grid);
    const nodes = [];
    for (let k = 0; k < n; k++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hk-node';
      b.setAttribute('aria-label', `Node ${k + 1}`);
      b.disabled = true;
      grid.appendChild(b);
      nodes.push(b);
    }
    $('hk-title').textContent = o.title;
    $('hk-sub').textContent = o.sub;
    $('hk-progress').textContent = `0 / ${P.len}`;
    $('hk-timer').style.width = '100%';
    lives(P.mistakes, P.mistakes);
    $('hack').hidden = false;

    return new Promise((resolve) => {
      run = { done: false };
      const me = run;
      let idx = 0, left = P.mistakes, deadline = 0, raf = 0;

      function end(ok, text) {
        if (me.done) return;
        me.done = true;
        cancelAnimationFrame(raf);
        nodes.forEach((b) => { b.disabled = true; });
        setStatus(text, ok ? 'good' : 'bad');
        if (ok) A().hackWin(); else A().hackFail();
        setTimeout(() => {
          $('hack').hidden = true;
          run = null;
          resolve(ok);
        }, ok ? 900 : 1300);
      }
      me.cancel = () => end(false, 'Hack aborted');

      function timer() {
        if (me.done) return;
        const leftMs = deadline - performance.now();
        $('hk-timer').style.width = `${Math.max(0, (leftMs / (P.time * 1000)) * 100)}%`;
        $('hk-timer').classList.toggle('low', leftMs < 3000);
        if (leftMs <= 0) { end(false, 'Firewall closed: out of time'); return; }
        raf = requestAnimationFrame(timer);
      }

      nodes.forEach((b, k) => b.addEventListener('click', () => {
        if (me.done || b.disabled) return;
        if (k === seq[idx]) {
          idx++;
          A().node(idx);
          b.classList.remove('ok');
          void b.offsetWidth;
          b.classList.add('ok');
          $('hk-progress').textContent = `${idx} / ${P.len}`;
          if (idx >= seq.length) end(true, 'ACCESS GRANTED');
        } else if (left > 0) {
          left--;
          lives(left, P.mistakes);
          A().miss();
          b.classList.remove('bad');
          void b.offsetWidth;
          b.classList.add('bad');
          setStatus('Wrong node: mistake forgiven', 'warn');
        } else {
          b.classList.add('bad');
          end(false, 'ACCESS DENIED');
        }
      }));

      (async () => {
        setStatus('Watch the code…');
        await sleep(600);
        for (let i = 0; i < seq.length; i++) {
          if (me.done) return;
          const b = nodes[seq[i]];
          b.classList.add('lit');
          A().node(i + 1);
          await sleep(P.flash);
          b.classList.remove('lit');
          await sleep(150);
        }
        if (me.done) return;
        setStatus('Repeat the code!');
        nodes.forEach((b) => { b.disabled = false; });
        deadline = performance.now() + P.time * 1000;
        timer();
      })();
    });
  }

  function cancel() { if (run && run.cancel) run.cancel(); }

  PH.hack = { start, cancel, get running() { return !!run; } };
})(window.PH);
