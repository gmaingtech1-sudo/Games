import { useEffect, useRef, useState } from 'react';
import { CHRONO_SECONDS, FACTIONS, ITEMS, NEUTRAL_COLOR } from '../game/data.js';
import { missionById, portalById } from '../game/progress.js';
import { ItemIcon } from '../components/Bits.jsx';
import { goalText } from './PortalScreen.jsx';

// How long each kind of target stays on screen, in milliseconds.
const LIFE = { node: 1700, shard: 1300, anomaly: 2400 };
const ANOMALY_PENALTY = 2; // seconds lost for touching an anomaly
const MAX_TARGETS = 6;

function pickKind(mission) {
  const r = Math.random();
  const anomalyChance = mission.maxAnomalies !== undefined ? 0.28 : 0.2;
  const shardChance = mission.goals.shards ? 0.24 : 0.1;
  if (r < anomalyChance) return 'anomaly';
  if (r < anomalyChance + shardChance) return 'shard';
  return 'node';
}

function spawn(game, mission, now) {
  if (game.targets.length >= MAX_TARGETS) return;
  // Find a spot that doesn't overlap another target.
  let x, y, tries = 0;
  do {
    x = 12 + Math.random() * 76;
    y = 10 + Math.random() * 80;
    tries++;
  } while (tries < 12 && game.targets.some((t) => Math.hypot(t.x - x, (t.y - y) * 1.6) < 18));
  const kind = pickKind(mission);
  game.targets.push({ id: game.nextId++, kind, x, y, born: now, life: LIFE[kind] });
}

export default function MissionRun({ screen, actions }) {
  const mission = missionById(screen.missionId);
  const portal = portalById(mission.portal);
  const color = portal.faction ? FACTIONS[portal.faction].color : NEUTRAL_COLOR;
  const totalTime = mission.time + (screen.chrono ? CHRONO_SECONDS : 0);

  const [phase, setPhase] = useState('countdown'); // countdown -> play -> result
  const [count, setCount] = useState(3);
  const [, redraw] = useState(0);
  const [summary, setSummary] = useState(null);
  const game = useRef({
    targets: [], pops: [], nextId: 1, nodes: 0, shards: 0, anomalies: 0,
    endAt: 0, nextSpawn: 0, timeLeft: totalTime, run: null,
  });

  // 3, 2, 1...
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      const now = performance.now();
      game.current.endAt = now + totalTime * 1000;
      game.current.nextSpawn = now;
      setPhase('play');
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count, totalTime]);

  // The game loop: spawn targets, expire old ones, run the clock, check for win or loss.
  useEffect(() => {
    if (phase !== 'play') return;
    const g = game.current;
    const timer = setInterval(() => {
      const now = performance.now();
      g.targets = g.targets.filter((t) => now - t.born < t.life);
      g.pops = g.pops.filter((p) => now - p.born < 700);
      if (now >= g.nextSpawn) {
        spawn(g, mission, now);
        g.nextSpawn = now + mission.pace * (0.7 + Math.random() * 0.6);
      }
      g.timeLeft = Math.max(0, (g.endAt - now) / 1000);

      const won = g.nodes >= mission.goals.nodes && g.shards >= (mission.goals.shards || 0);
      const failedAnomalies = mission.maxAnomalies !== undefined && g.anomalies > mission.maxAnomalies;
      if (won || failedAnomalies || g.timeLeft <= 0) {
        g.run = {
          won, nodes: g.nodes, shards: g.shards, anomalies: g.anomalies,
          reason: won ? null : failedAnomalies ? 'Too many anomalies. The portal collapsed.' : 'Out of time. The portal closed.',
        };
        setPhase('result');
      }
      redraw((n) => n + 1);
    }, 50);
    return () => clearInterval(timer);
  }, [phase, mission]);

  // Hand the result to the app once, so XP and items are saved.
  const reported = useRef(false);
  useEffect(() => {
    if (phase !== 'result' || reported.current) return;
    reported.current = true;
    setSummary(actions.finishMission(mission, game.current.run));
  }, [phase, actions, mission]);

  const hit = (target) => {
    const g = game.current;
    if (phase !== 'play' || !g.targets.includes(target)) return;
    g.targets = g.targets.filter((t) => t !== target);
    let label;
    if (target.kind === 'node') { g.nodes++; label = '+1'; }
    if (target.kind === 'shard') { g.shards++; label = '+1 shard'; }
    if (target.kind === 'anomaly') {
      g.anomalies++;
      g.endAt -= ANOMALY_PENALTY * 1000;
      label = `−${ANOMALY_PENALTY}s`;
      navigator.vibrate?.(120);
    }
    g.pops.push({ id: g.nextId++, x: target.x, y: target.y, label, kind: target.kind, born: performance.now() });
    redraw((n) => n + 1);
  };

  const g = game.current;
  const goals = mission.goals;

  return (
    <div className="run" style={{ '--c': color }}>
      <header className="run-hud">
        <button className="back" onClick={() => history.back()}>✕ Quit</button>
        <span className="run-title">{mission.title}</span>
        <span className={`run-time ${g.timeLeft < 5 ? 'low' : ''}`}>{g.timeLeft.toFixed(1)}s</span>
      </header>
      <div className="run-goals">
        <Goal label="Nodes" have={g.nodes} need={goals.nodes} />
        {goals.shards && <Goal label="Shards" have={g.shards} need={goals.shards} />}
        {mission.maxAnomalies !== undefined && (
          <Goal label="Anomalies" have={g.anomalies} need={mission.maxAnomalies} danger />
        )}
      </div>
      <div className="time-track"><div className="time-fill" style={{ width: `${(g.timeLeft / totalTime) * 100}%` }} /></div>

      <div className="arena">
        <div className="arena-vortex" />
        {g.targets.map((t) => (
          <button
            key={t.id}
            className={`target ${t.kind}`}
            style={{ left: `${t.x}%`, top: `${t.y}%`, '--life': `${t.life}ms` }}
            onPointerDown={() => hit(t)}
            aria-label={t.kind}
          />
        ))}
        {g.pops.map((p) => (
          <span key={p.id} className={`pop ${p.kind}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>{p.label}</span>
        ))}

        {phase === 'countdown' && (
          <div className="overlay">
            <ul className="goals big">{goalText(mission).map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="legend">
              <span><i className="dot node" /> Node: tap it</span>
              <span><i className="dot shard" /> Shard: catch it</span>
              <span><i className="dot anomaly" /> Anomaly: avoid</span>
            </div>
            <div className="countdown" key={count}>{count || 'GO'}</div>
          </div>
        )}
      </div>

      {phase === 'result' && summary && (
        <div className="overlay result">
          <h2 className={summary.won ? 'win' : 'lose'}>{summary.won ? 'Mission complete' : 'Mission failed'}</h2>
          {!summary.won && <p className="muted">{g.run.reason}</p>}
          {summary.won && (
            <p className="xp-gain">
              +{summary.xp} XP
              {summary.factionBonus && <small> (faction bonus)</small>}
              {!summary.firstClear && <small> (replay)</small>}
            </p>
          )}
          {summary.levelUp && <p className="level-up">Level up! You are now level {summary.levelUp}</p>}
          {Object.keys(summary.items).length > 0 && (
            <div className="result-items">
              {Object.entries(summary.items).map(([id, qty]) => (
                <span key={id} className="reward"><ItemIcon id={id} size={26} />{qty}× {ITEMS[id].name}</span>
              ))}
            </div>
          )}
          <div className="result-buttons">
            <button
              className="btn btn-primary"
              onClick={() => actions.go({ ...screen, chrono: false, runKey: Date.now() })}
            >
              {summary.won ? 'Play again' : 'Try again'}
            </button>
            <button className="btn btn-ghost" onClick={() => actions.go({ name: 'map' })}>Back to map</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Goal({ label, have, need, danger }) {
  const done = danger ? have <= need : have >= need;
  return (
    <span className={`goal ${danger ? 'danger' : ''} ${done && !danger ? 'done' : ''} ${danger && !done ? 'failed' : ''}`}>
      {label} <strong>{have}/{need}</strong>
    </span>
  );
}
