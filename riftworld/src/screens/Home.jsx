import { FACTIONS } from '../game/data.js';
import { levelInfo } from '../game/progress.js';
import { Portal } from '../components/Bits.jsx';

export default function Home({ player, actions }) {
  const returning = !!player.faction;
  const color = returning ? FACTIONS[player.faction].color : '#7ff7ff';

  return (
    <div className="home">
      <div className="stars" />
      <Portal color={color} size={240} className="home-portal" />
      <h1 className="logo">RIFT<span>WORLD</span></h1>
      <p className="tagline">The portals are open. Where will you go?</p>

      <button className="btn btn-primary btn-big" onClick={actions.play}>
        {returning ? 'Continue' : 'Play'}
      </button>

      {returning && (
        <p className="home-sub">
          {player.name} · Level {levelInfo(player.xp).level} · {FACTIONS[player.faction].name}
        </p>
      )}
      {returning && (
        <button className="btn btn-ghost" onClick={() => actions.go({ name: 'profile' })}>Profile</button>
      )}
      <p className="version">Prototype v0.1</p>
    </div>
  );
}
