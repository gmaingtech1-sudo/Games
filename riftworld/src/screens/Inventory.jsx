import { useState } from 'react';
import { ITEMS } from '../game/data.js';
import { ItemIcon } from '../components/Bits.jsx';

export default function Inventory({ player }) {
  const owned = Object.entries(player.inventory).filter(([, qty]) => qty > 0);
  const [selected, setSelected] = useState(owned[0]?.[0] || null);
  const item = selected && player.inventory[selected] > 0 ? ITEMS[selected] : null;

  return (
    <div className="page">
      <h2 className="page-title">Inventory</h2>
      {owned.length === 0 ? (
        <p className="muted">Nothing here yet. Complete missions to collect items.</p>
      ) : (
        <>
          <div className="inv-grid">
            {owned.map(([id, qty]) => (
              <button
                key={id}
                className={`card inv-slot ${selected === id ? 'selected' : ''}`}
                style={{ '--c': ITEMS[id].color }}
                onClick={() => setSelected(id)}
              >
                <ItemIcon id={id} size={40} />
                <span className="inv-qty">×{qty}</span>
              </button>
            ))}
          </div>
          {item && (
            <div className="card inv-detail" style={{ '--c': item.color }}>
              <ItemIcon id={selected} size={56} />
              <div>
                <strong>{item.name}</strong>
                <span className={`rarity ${item.rarity.toLowerCase()}`}>{item.rarity}</span>
                <p>{item.about}</p>
                <p className="muted small">You have {player.inventory[selected]}.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
