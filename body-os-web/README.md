# BODY.OS: Beyond Existence

A sci-fi RPG for phones (landscape). You wake up on an abandoned ship, THE DERELICT,
with no memories. Your body runs BODY.OS, an operating system that lets you reconfigure your
body, brain and senses, and later bend gravity, time and space. Every setting changes how you play.

Play it in a phone browser, or install the Android app: [`../body-os-android`](../body-os-android).

## How to play

- **Left side of the screen:** drag to move. **Right side:** drag to look around.
- **JUMP**, **USE** (it changes to SCAN, OPEN, COLLECT and so on), **VISION** (cycles vision modes), and quick-slot buttons for reality abilities.
- **BODY.OS** (top right) opens the operating system. The game pauses while it's open.
- Keyboard on a computer: WASD to move, mouse drag on the right side to look, Space to jump, E to use, Q to change vision, Tab for BODY.OS, Esc to pause.

## What's in it

- **BODY.OS sections:** Dashboard, Body, Brain, Senses, Environment, Technology, Reality,
  Configurations, Character Status and System Diagnostics.
- **Body:** Strength (push heavier crates), Movement Speed, Jump Height, Endurance, Recovery
  and Energy Consumption. They share an allocation budget and are capped until upgrades raise the cap.
  Overclocking above the balanced value costs energy.
- **Brain** (fictional mechanics):
  - Reaction: the timed calibration window.
  - Concentration: resists interference while scanning.
  - Memory: recovers memory fragments about places you've been.
  - Threat Detection: how far away you detect hostiles; at 7+ it shows their direction.
  - Analysis: cheaper, faster scans.
- **Vision:** Normal, Night, Scanner, Thermal and Dimensional. Each costs energy.
- **Hazards:** a coolant leak (cold), a radiation leak, a toxic vent and damaged gravity plating,
  measured against your protection ratings and suit reserve.
- **Technology:** 12 upgrades with tiers, costs, requirements and real effects. System Restore refunds them all.
- **Reality abilities:** Reduced Gravity, Time Distortion, Spatial Anomaly, Dimensional Perception and
  Matter Interaction, each with a cost, a duration and a cooldown.
- **Presets:** Explorer, Survivor, Combat, Engineer and Reality Breaker. You can customise them, and
  loading one is checked against what you've unlocked.
- **Missions:**
  - WAKE PROTOCOL: scan the bulkhead, find the power cell (raise Jump, or push a heavy crate),
    calibrate the coupling, then hear the transmission.
  - FRACTURED SIGNAL: teaches the five reality abilities in the containment lab.
- **Destinations:** Veyra, the Frozen Moon and the Fractured World are listed as locked. They're planned and not playable yet.
- Saves offline, with a backup copy, and recovers from a damaged save.

Everything is made in code (three.js geometry, canvas textures, Web Audio sound), so there are no art files to load.

## Files

| File | What it does |
| --- | --- |
| `js/data.js` | All content: attributes, vision modes, upgrades, abilities, items, missions, locations, presets |
| `js/rules.js` | Balancing rules for attributes |
| `js/core.js` | Event hub, game state, save validation and storage |
| `js/systems.js` | Progression, inventory, upgrades, body, vitals, vision, environment, reality, missions, presets, threats |
| `js/world.js` | Renderer, materials, level kit, collision, lights, vision-mode rendering |
| `js/derelict.js` | THE DERELICT level |
| `js/entities.js` | Doors, terminals, pickups, power socket, crate, drone, barrier, portals |
| `js/player.js` | Movement, collision, camera, avatar |
| `js/input.js` | Touch joystick, camera drag, buttons, keyboard |
| `js/ui.js` | HUD, BODY.OS, dialogs, settings, pause, main menu |
| `js/audio.js` | Synthesised sound effects and music |
| `js/host.js` | Bridge to the Android app (saves, vibration, Back button) |
