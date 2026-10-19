import { useState } from 'react';
import { FACTIONS } from '../game/data.js';

export default function FactionSelect({ player, actions }) {
  const [choice, setChoice] = useState(null);
  const [name, setName] = useState(player.name === 'Traveller' ? '' : player.name);

  return (
    <div className="page">
      <h2 className="page-title">Choose your faction</h2>
      <p className="muted">Missions at your faction's portal give +25% XP.</p>

      <div className="faction-list">
        {Object.values(FACTIONS).map((f) => (
          <button
            key={f.id}
            className={`card faction-card ${choice === f.id ? 'selected' : ''}`}
            style={{ '--c': f.color }}
            onClick={() => setChoice(f.id)}
          >
            <span className="faction-orb" />
            <span className="faction-text">
              <strong>{f.name}</strong>
              <em>“{f.motto}”</em>
              <small>{f.about}</small>
            </span>
          </button>
        ))}
      </div>

      <label className="field">
        <span>Your codename</span>
        <input
          value={name}
          maxLength={16}
          placeholder="Traveller"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <button
        className="btn btn-primary btn-big"
        disabled={!choice}
        style={choice ? { '--c': FACTIONS[choice].color } : undefined}
        onClick={() => actions.chooseFaction(choice, name.trim())}
      >
        {choice ? `Join ${FACTIONS[choice].name}` : 'Pick a faction'}
      </button>
    </div>
  );
}
