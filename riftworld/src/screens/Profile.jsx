import { useState } from 'react';
import { ACHIEVEMENTS, FACTIONS, MISSIONS } from '../game/data.js';
import { FactionBadge, XpBar } from '../components/Bits.jsx';

export default function Profile({ player, actions }) {
  const [name, setName] = useState(player.name);
  const [confirming, setConfirming] = useState(false);
  const s = player.stats;
  const cleared = MISSIONS.filter((m) => player.completed[m.id]).length;

  const saveName = () => {
    const clean = name.trim();
    if (clean && clean !== player.name) actions.rename(clean);
    else setName(player.name);
  };

  return (
    <div className="page">
      <h2 className="page-title">Profile</h2>

      <div className="card profile-card">
        <input
          className="name-input"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          aria-label="Codename"
        />
        <FactionBadge faction={player.faction} />
        <XpBar xp={player.xp} />
      </div>

      <div className="stats">
        <Stat label="Missions cleared" value={`${cleared}/${MISSIONS.length}`} />
        <Stat label="Wins" value={s.wins} />
        <Stat label="Runs" value={s.runs} />
        <Stat label="Nodes tapped" value={s.nodes} />
        <Stat label="Shards caught" value={s.shards} />
        <Stat label="Portals visited" value={player.visited.length} />
      </div>

      <h3 className="section-title">Achievements {player.achievements.length}/{ACHIEVEMENTS.length}</h3>
      <div className="achievements">
        {ACHIEVEMENTS.map((a) => {
          const got = player.achievements.includes(a.id);
          return (
            <div key={a.id} className={`card achievement ${got ? 'got' : ''}`}>
              <span className="ach-icon">{got ? '★' : '☆'}</span>
              <div>
                <strong>{a.name}</strong>
                <p>{a.about}</p>
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="section-title">Switch faction</h3>
      <div className="faction-switch">
        {Object.values(FACTIONS).map((f) => (
          <button
            key={f.id}
            className={`btn btn-ghost ${player.faction === f.id ? 'active' : ''}`}
            style={{ '--c': f.color }}
            onClick={() => actions.switchFaction(f.id)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <p className="muted small">Progress saves automatically on this phone.</p>
      {confirming ? (
        <div className="card confirm-card">
          <p>Delete all RiftWorld progress on this phone? This cannot be undone.</p>
          <div className="faction-switch">
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>Keep it</button>
            <button className="btn btn-danger" onClick={actions.reset}>Delete</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-danger" onClick={() => setConfirming(true)}>Reset progress</button>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
