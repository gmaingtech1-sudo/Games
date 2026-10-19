import { useState } from 'react';
import { CHRONO_SECONDS, FACTION_BONUS, FACTIONS, ITEMS, NEUTRAL_COLOR, REPLAY_XP } from '../game/data.js';
import { levelInfo, missionsAt, portalById } from '../game/progress.js';
import { ItemIcon, Portal } from '../components/Bits.jsx';

export function goalText(mission) {
  const g = mission.goals;
  const parts = [`Tap ${g.nodes} rift nodes`];
  if (g.shards) parts.push(`Catch ${g.shards} aether shards`);
  if (mission.maxAnomalies !== undefined) {
    parts.push(`Touch no more than ${mission.maxAnomalies} anomal${mission.maxAnomalies === 1 ? 'y' : 'ies'}`);
  }
  parts.push(`Finish within ${mission.time} seconds`);
  return parts;
}

export default function PortalScreen({ player, portalId, actions }) {
  const portal = portalById(portalId);
  const color = portal.faction ? FACTIONS[portal.faction].color : NEUTRAL_COLOR;
  const locked = levelInfo(player.xp).level < portal.level;
  const chronos = player.inventory.chrono_cell || 0;
  const [useChrono, setUseChrono] = useState(false);
  const bonus = portal.faction && portal.faction === player.faction;

  return (
    <div className="page portal-page" style={{ '--c': color }}>
      <button className="back" onClick={() => history.back()}>‹ Map</button>
      <Portal color={color} size={150} className={locked ? 'dim' : ''} />
      <h2 className="page-title">{portal.name}</h2>
      <p className="muted">
        {portal.region} · {portal.faction ? `${FACTIONS[portal.faction].name} territory` : 'Neutral'}
      </p>
      <p className="lore">{portal.lore}</p>

      {locked ? (
        <div className="card locked-card">🔒 Reach level {portal.level} to open this portal.</div>
      ) : (
        <>
          {bonus && <div className="card bonus-card">Your faction's portal: +{FACTION_BONUS * 100}% XP here</div>}
          {chronos > 0 && (
            <label className="card chrono-toggle">
              <input type="checkbox" checked={useChrono} onChange={(e) => setUseChrono(e.target.checked)} />
              <ItemIcon id="chrono_cell" size={28} />
              <span>Use a Chrono Cell: +{CHRONO_SECONDS} s <small>({chronos} left)</small></span>
            </label>
          )}
          {missionsAt(portal.id).map((m) => {
            const cleared = player.completed[m.id];
            return (
              <div key={m.id} className="card mission">
                <div className="mission-head">
                  <strong>{m.title}</strong>
                  {cleared && <span className="cleared">✓ Cleared</span>}
                </div>
                <p>{m.brief}</p>
                <ul className="goals">
                  {goalText(m).map((g) => <li key={g}>{g}</li>)}
                </ul>
                <div className="mission-rewards">
                  <span className="xp-pill">+{cleared ? Math.round(m.xp * REPLAY_XP) : m.xp} XP</span>
                  {!cleared && Object.entries(m.rewards).map(([id, qty]) => (
                    <span key={id} className="reward"><ItemIcon id={id} size={20} />{qty}× {ITEMS[id].name}</span>
                  ))}
                  {cleared && <span className="muted small">Replay: half XP, keep shards</span>}
                </div>
                <button className="btn btn-primary" onClick={() => actions.startMission(m.id, useChrono)}>
                  {cleared ? 'Replay' : 'Start mission'}
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
