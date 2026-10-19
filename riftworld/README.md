# RiftWorld

A futuristic portal exploration game for phones. Portals have torn open across the world of Aetheris. Join a faction, travel through portals on the map, and stabilise them in fast tap missions to earn XP, items and achievements.

This is the first small prototype, built with **React** and **Vite**. It's free, with no accounts and no paid services, and progress is saved on your phone.

## Playing

1. Tap **Play**, pick a faction and type a codename.
2. Tap a glowing portal on the map to see its missions.
3. Tap **Start mission**. After a 3, 2, 1 countdown, targets appear in the portal:

| Target | What to do |
| --- | --- |
| Glowing circle (your portal's colour) | **Node.** Tap it. |
| Gold diamond | **Aether shard.** Catch it. Shards go into your inventory even if you fail. |
| Shaking red circle | **Anomaly.** Don't touch it. It costs 2 seconds, and some missions fail if you touch too many. |

Each target has a shrinking ring that shows how long it has left. Meet every objective before the clock runs out to win.

### Factions

| Faction | Colour | Home portal |
| --- | --- | --- |
| Vanguard | Blue | Azure Bastion |
| Riftborn | Purple | Violet Maw |
| Nexus | Green | Verdant Core |

Missions at your faction's portal give **+25% XP**. You can switch faction in **Profile**.

### Progress

- **Levels:** XP raises your level (100 XP for level 2, 300 for level 3, 600 for level 4…). Higher levels unlock Echo Spire (level 2) and The Singularity (level 3).
- **First clear** of a mission gives full XP plus its item reward. **Replays** give half XP and keep the shards you catch.
- **Chrono Cell:** tick the box in a portal briefing to spend one for +5 seconds.
- **Achievements:** 7 to unlock, listed in **Profile**.
- **Saving:** automatic, in the browser's `localStorage`. **Profile → Reset progress** wipes it.

## Previewing

The ready-to-play build is in `dist/`. If GitHub Pages is turned on for this repository (**Settings → Pages → Deploy from a branch**), open:

`https://<your-user>.github.io/<repo>/riftworld/dist/`

## Working on it

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
cd riftworld
npm install
npm run dev      # live preview at http://localhost:5173 (also on your Wi-Fi)
npm run build    # rebuild dist/ after changing anything
```

Commit the rebuilt `dist/` folder so the GitHub Pages copy updates.

## How it's built

| File | What it does |
| --- | --- |
| `index.html` | The page the app starts in |
| `src/main.jsx` | Starts React |
| `src/App.jsx` | Switches screens, handles the Android back button, saves progress, shows achievement pop-ups |
| `src/game/data.js` | All content: factions, portals, missions, items, achievements, ranks. **Edit this to tune the game.** |
| `src/game/progress.js` | Saving and loading, levels, XP and rewards after a mission |
| `src/screens/Home.jsx` | Home screen with the glowing portal and Play button |
| `src/screens/FactionSelect.jsx` | Choosing a faction and codename |
| `src/screens/WorldMap.jsx` | The world map with clickable portals |
| `src/screens/PortalScreen.jsx` | A portal's lore and mission briefings |
| `src/screens/MissionRun.jsx` | The tap mini-game and the results screen |
| `src/screens/Inventory.jsx` | Collected items |
| `src/screens/Profile.jsx` | Name, level, stats, achievements, faction switch, reset |
| `src/components/` | Bottom navigation bar and shared pieces (portal effect, XP bar, item icons) |
| `src/styles.css` | The dark sci-fi look and all animations |
| `public/` | App icon and `manifest.webmanifest` for "Add to Home screen" |
| `dist/` | The built game, ready to host |

## Installing on Android

- **Now:** open the hosted game in Chrome, then ⋮ menu → **Add to Home screen**. It opens full screen in portrait like an app.
- **Later, as a real APK:** wrap `dist/` with [Capacitor](https://capacitorjs.com) (free), the same way `pocket-mochi-android/` wraps Pocket Mochi.
