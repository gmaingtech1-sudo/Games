/* Portal Hackers: Nexus — the world standings: who's leading the cycle, a
   line chart of every team's Control Points at each checkpoint, the top
   agents, and a table view. Shared by the game's World panel and the Intel
   map. Rendering returns HTML; hover is handled by one delegated listener,
   so it survives the panel re-rendering every second. */
window.PH = window.PH || {};
(function (PH) {
  'use strict';

  const SC = PH.score;
  const D = PH.data;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function timeLeft(ms) {
    const m = Math.max(0, Math.round(ms / 60e3));
    const h = Math.floor(m / 60);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
    return 10 * p;
  }

  // The line chart. One y axis (CP), x = the cycle's 35 checkpoints.
  function chart(st) {
    const Wd = 340, Ht = 190, L = 44, R = 64, T = 12, B = 24;
    const pw = Wd - L - R, ph = Ht - T - B;
    let max = 0;
    for (const t of SC.TEAMS) for (const v of st.series[t]) max = Math.max(max, v);
    const ymax = niceMax(max * 1.08 || 1);
    const x = (k) => L + (k / (SC.CHECKPOINTS - 1)) * pw;
    const y = (v) => T + ph - (v / ymax) * ph;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (ymax / 4) * i, yy = y(v);
      g += `<line x1="${L}" x2="${L + pw}" y1="${yy}" y2="${yy}" class="wc-grid"/><text x="${L - 6}" y="${yy + 3}" class="wc-ax" text-anchor="end">${v >= 1000 ? `${Math.round(v / 1000)}k` : v}</text>`;
    }
    for (const k of [0, 7, 14, 21, 28, 34]) g += `<text x="${x(k)}" y="${Ht - 6}" class="wc-ax" text-anchor="middle">${k + 1}</text>`;
    // Direct labels at the line ends, nudged apart so they never overlap.
    const ends = SC.TEAMS.map((t) => ({ t, v: st.series[t][st.series[t].length - 1], k: st.series[t].length - 1 }))
      .map((e) => Object.assign(e, { yy: y(e.v) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 12) ends[i].yy = ends[i - 1].yy + 12;
    let lines = '';
    for (const t of SC.TEAMS) {
      const s = st.series[t];
      const d = s.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
      lines += `<path d="${d}" fill="none" stroke="${SC.CHART[t]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const k = s.length - 1;
      lines += `<circle cx="${x(k)}" cy="${y(s[k])}" r="4" fill="${SC.CHART[t]}" stroke="var(--wc-surface)" stroke-width="2"/>`;
    }
    for (const e of ends) {
      const lx = x(e.k) + 8;
      lines += `<circle cx="${lx + 3}" cy="${e.yy}" r="3" fill="${SC.CHART[e.t]}"/><text x="${lx + 10}" y="${e.yy + 3.5}" class="wc-lab">${D.TEAMS[e.t].name}</text>`;
    }
    const data = esc(JSON.stringify({ s: st.series, n: SC.CHECKPOINTS, L, pw, T, ph, ymax, W: Wd }));
    return `<svg class="wc-svg" viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Control Points per team at each checkpoint" data-wc="${data}">
      ${g}${lines}<line class="wc-cross" x1="0" x2="0" y1="${T}" y2="${T + ph}" visibility="hidden"/>
      <rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent" class="wc-hit"/></svg>
      <div class="wc-tip" hidden></div>`;
  }

  // The whole standings block.
  function render(st, opts) {
    opts = opts || {};
    const now = Date.now();
    const lead = st.leader;
    const second = st.order[1];
    const gap = st.avg[lead] - st.avg[second];
    let out = `<div class="wc">
      <div class="wc-head"><span>Cycle ${st.cycle.index + 1} · checkpoint ${Math.max(1, st.cycle.checkpoint)}/${SC.CHECKPOINTS}</span><span>next in ${timeLeft(st.cycle.nextCheckpoint - now)} · ends in ${timeLeft(st.cycle.end - now)}</span></div>
      <div class="wc-hero"><span class="wc-dot" style="background:${SC.CHART[lead]}"></span><b>${D.TEAMS[lead].name} leads</b><small>by ${fmt(gap)} CP average</small></div>
      <div class="wc-legend">${st.order.map((t, i) => `<span><i style="background:${SC.CHART[t]}"></i>${i + 1}. ${D.TEAMS[t].name}<b>${fmt(st.avg[t])}</b>${opts.myTeam === t ? ' <em>you</em>' : ''}</span>`).join('')}</div>
      ${chart(st)}
      <p class="wc-note">Average Control Points per checkpoint. A team's CP is the area of every control field it holds: 1 CP per 1,000 m².</p>`;
    if (opts.agents) {
      out += `<h4>Top agents this cycle</h4><ol class="wc-agents">${opts.agents.slice(0, 10).map((a) => `<li class="${a.you ? 'you' : ''}"><i style="background:${SC.CHART[a.team]}"></i><span>${esc(a.name)}${a.you ? ' (you)' : ''}</span><small>${D.TEAMS[a.team].name}</small><b>${fmt(a.cp)} CP</b></li>`).join('')}</ol>`;
    }
    const n = st.series.N.length;
    const from = Math.max(0, n - 8);
    out += `<details class="wc-table"><summary>Show as a table</summary><table><thead><tr><th>Checkpoint</th>${SC.TEAMS.map((t) => `<th>${D.TEAMS[t].name}</th>`).join('')}</tr></thead><tbody>`;
    for (let k = n - 1; k >= from; k--) out += `<tr><td>${k + 1}</td>${SC.TEAMS.map((t) => `<td>${fmt(st.series[t][k])}</td>`).join('')}</tr>`;
    out += `<tr class="avg"><td>Average</td>${SC.TEAMS.map((t) => `<td>${fmt(st.avg[t])}</td>`).join('')}</tr></tbody></table></details></div>`;
    return out;
  }

  // Crosshair + tooltip, for every chart on the page.
  function onMove(e) {
    const hit = e.target.closest && e.target.closest('.wc-hit');
    document.querySelectorAll('.wc-svg').forEach((svg) => {
      if (hit && svg.contains(hit)) return;
      const c = svg.querySelector('.wc-cross'); if (c) c.setAttribute('visibility', 'hidden');
      const tip = svg.parentNode.querySelector('.wc-tip'); if (tip) tip.hidden = true;
    });
    if (!hit) return;
    const svg = hit.ownerSVGElement;
    const d = JSON.parse(svg.getAttribute('data-wc'));
    const box = svg.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * d.W;
    const n = d.s.N.length;
    const k = Math.max(0, Math.min(n - 1, Math.round(((sx - d.L) / d.pw) * (d.n - 1))));
    const xx = d.L + (k / (d.n - 1)) * d.pw;
    const cross = svg.querySelector('.wc-cross');
    cross.setAttribute('x1', xx); cross.setAttribute('x2', xx); cross.setAttribute('visibility', 'visible');
    const tip = svg.parentNode.querySelector('.wc-tip');
    const rows = SC.TEAMS.map((t) => [t, d.s[t][k]]).sort((a, b) => b[1] - a[1]);
    tip.innerHTML = `<b>Checkpoint ${k + 1}</b>${rows.map(([t, v]) => `<span><i style="background:${SC.CHART[t]}"></i>${D.TEAMS[t].name}<em>${fmt(v)}</em></span>`).join('')}`;
    tip.hidden = false;
    const px = (xx / d.W) * box.width;
    const host = svg.parentNode.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(4, box.left - host.left + px - tip.offsetWidth / 2), host.width - tip.offsetWidth - 4)}px`;
    tip.style.top = `${box.top - host.top + 4}px`;
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerdown', onMove);

  PH.worldchart = { render };
})(window.PH);
