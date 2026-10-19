import { useCallback, useEffect, useState } from 'react';
import { ACHIEVEMENTS } from './game/data.js';
import {
  applyRun, clearSave, loadPlayer, newPlayer, savePlayer, unlockAchievements,
} from './game/progress.js';
import Home from './screens/Home.jsx';
import FactionSelect from './screens/FactionSelect.jsx';
import WorldMap from './screens/WorldMap.jsx';
import PortalScreen from './screens/PortalScreen.jsx';
import MissionRun from './screens/MissionRun.jsx';
import Profile from './screens/Profile.jsx';
import Inventory from './screens/Inventory.jsx';
import NavBar from './components/NavBar.jsx';

const TABS = ['map', 'inventory', 'profile'];

export default function App() {
  const [player, setPlayer] = useState(loadPlayer);
  const [screen, setScreen] = useState({ name: 'home' });
  const [toasts, setToasts] = useState([]);

  // Save every change.
  useEffect(() => savePlayer(player), [player]);

  // Android's back button walks back through screens instead of leaving the game.
  useEffect(() => {
    history.replaceState({ name: 'home' }, '');
    const onBack = (e) => setScreen(e.state || { name: 'home' });
    addEventListener('popstate', onBack);
    return () => removeEventListener('popstate', onBack);
  }, []);

  const go = useCallback((next) => {
    history.pushState(next, '');
    setScreen(next);
  }, []);

  const toast = useCallback((text) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const announce = useCallback((ids) => {
    for (const id of ids) {
      toast(`Achievement unlocked: ${ACHIEVEMENTS.find((a) => a.id === id).name}`);
    }
  }, [toast]);

  const update = (fn) => setPlayer((p) => {
    const next = structuredClone(p);
    fn(next);
    return next;
  });

  const actions = {
    play: () => go({ name: player.faction ? 'map' : 'faction' }),
    chooseFaction: (faction, name) => {
      update((p) => { p.faction = faction; p.name = name || p.name; });
      go({ name: 'map' });
    },
    openPortal: (portalId) => {
      if (!player.visited.includes(portalId)) {
        const next = structuredClone(player);
        next.visited.push(portalId);
        announce(unlockAchievements(next));
        setPlayer(next);
      }
      go({ name: 'portal', portalId });
    },
    startMission: (missionId, useChrono) => {
      if (useChrono) update((p) => { p.inventory.chrono_cell--; });
      go({ name: 'run', missionId, chrono: useChrono });
    },
    finishMission: (mission, run) => {
      const { player: next, summary } = applyRun(player, mission, run);
      setPlayer(next);
      announce(summary.achievements);
      return summary;
    },
    rename: (name) => update((p) => { p.name = name; }),
    switchFaction: (faction) => update((p) => { p.faction = faction; }),
    reset: () => {
      clearSave();
      setPlayer(newPlayer());
      go({ name: 'home' });
    },
    go,
  };

  let view;
  switch (screen.name) {
    case 'faction': view = <FactionSelect player={player} actions={actions} />; break;
    case 'map': view = <WorldMap player={player} actions={actions} />; break;
    case 'portal': view = <PortalScreen player={player} portalId={screen.portalId} actions={actions} />; break;
    case 'run':
      // key restarts the mission cleanly when you press "Try again".
      view = <MissionRun key={screen.runKey || 0} player={player} screen={screen} actions={actions} />;
      break;
    case 'inventory': view = <Inventory player={player} />; break;
    case 'profile': view = <Profile player={player} actions={actions} />; break;
    default: view = <Home player={player} actions={actions} />;
  }

  return (
    <div className="app">
      <main className="screen" key={screen.name}>{view}</main>
      {TABS.includes(screen.name) && <NavBar current={screen.name} go={go} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
    </div>
  );
}
