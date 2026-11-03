# BODY.OS: BEYOND EXISTENCE

A sci-fi RPG for Android phones (landscape), built in Unity with C#. You wake up on an
abandoned research ship, THE DERELICT, with no memories. Your body runs BODY.OS, an operating
system that lets you reconfigure your body, brain, senses and eventually reality itself.
Every setting has a real gameplay effect.

> **Status: source project, not a built APK.** The Unity Editor isn't available in the
> environment this was written in, so no scene, APK or play session has been produced or tested
> in Unity yet. All scripts compile against the Unity engine and uGUI reference assemblies, and the
> logic tests pass. See [Building the APK](#building-the-apk) and [What still needs testing](#what-still-needs-testing).

## What's in the first playable version

- **Third-person movement** with a CharacterController, a floating virtual joystick, drag-to-look
  camera (it pulls in front of walls instead of clipping), and JUMP / INTERACT / VISION / ability buttons.
  Keyboard and mouse also work in the editor (WASD, Space, E, Q, Tab, Esc).
- **BODY.OS** with 10 sections: Dashboard, Body, Brain, Senses, Environment, Technology,
  Reality, Configurations, Character Status, System Diagnostics.
- **Body**: Strength (push heavier crates), Movement Speed, Jump Height, Endurance (less drain
  from sustained activity), Recovery (regen), Energy Consumption (a performance/consumption throttle).
  Attributes share an allocation budget, are capped until upgrades raise the cap, and values
  above the balanced 5 add "overclock" energy drain, so the character can't become infinitely powerful.
- **Brain** (fictional mechanics): Reaction (timed calibration window), Concentration (resists scan
  interference), Memory (recovers memory fragments about discovered rooms), Threat Detection
  (detection radius; 7+ shows direction), Analysis (cheaper, faster scans).
- **Vision modes**: Normal, Night (light amplification), Scanner (highlights and analyses objects),
  Thermal (heat signatures, unlocked by an upgrade), Dimensional (reveals hidden objects, unlocked by
  the Reality Kernel). These work through ambient light, cached material swaps and a full-screen UI tint,
  with no post-processing stack, so they behave the same on every Android GPU.
- **Energy**: regeneration against passive, overclock, movement, vision and environmental drains, all
  itemised in Diagnostics. Recharge stations and consumables refill it. Low energy turns off expensive
  modes and abilities; critical energy slows movement.
- **Environment**: temperature, atmosphere, radiation, gravity and suit reserve. The ship has a coolant
  leak (cold), a reactor alcove (radiation), a ruptured vent (toxic) and damaged gravity plating
  (0.4 g). Protection that falls short drains the suit reserve, then health.
- **Technology**: 12 data-driven upgrades (movement, senses, energy, protection, recovery, scanner,
  neural, reality modules), each with tiers, costs, requirements, effects and a locked/unlocked state.
  Some need schematics from the upgrade fabricator. System Restore refunds everything.
- **Reality manipulation** (after the first mission): Reduced Gravity, Time Distortion, Spatial
  Anomaly, Dimensional Perception, Matter Interaction. Each has an unlock, a cost, a duration, a cooldown,
  an activation effect and a HUD quick slot. They only affect objects built for them.
- **Presets**: Explorer, Survivor, Combat, Engineer, Reality Breaker. They can be customised and reset,
  and loading one is checked against your current caps, budgets and unlocks.
- **Progression**: XP from exploring, objectives, puzzles, technology, analysis and missions. Levels
  give upgrade points.
- **Story**: mission **WAKE PROTOCOL** (move, interact, open BODY.OS, adjust an attribute, scan
  the bulkhead, find a power cell, restore power, hear the transmission), followed by **FRACTURED
  SIGNAL**, which teaches the five reality abilities in the containment lab.
- **Puzzles**: scan the bulkhead to learn what it needs; get the power cell off a 1.9 m catwalk
  in a dark bay (raise Jump to 7, or push a mass-class-7 crate with Strength 7); seat it and pass a
  Reaction-based calibration. Further optional puzzles use low gravity, toxic and radiation zones and a
  hostile drone. The lab has a hidden glyph, a 3.8 m ledge, a pulse barrier, a phase-locked core and a portal.
- **Saving**: offline, versioned JSON with atomic writes, a backup, validation, and fallback for
  corrupted files. Fields added in later versions keep their defaults instead of erasing progress. New
  Game asks for confirmation. Settings are saved separately.
- **Settings**: master/music/SFX volume, camera sensitivity, joystick response, graphics quality,
  UI scale, vibration, invert camera, show FPS.
- **Locations**: THE DERELICT is fully playable. VEYRA, THE FROZEN MOON and THE FRACTURED WORLD
  are listed in Navigation as **locked expansion destinations** and are not playable.

## Project layout

```
body-os/
  Assets/
    Scripts/
      Core/          Game manager, events, content database, art, vitals, quality
      Player/        CharacterController, third-person camera, procedural avatar
      Input/         Touch joystick, look area, buttons, input aggregation
      BodyOS/        Attribute rules, body system, presets
      Brain/         Threat detection
      Senses/        Vision modes and vision targets
      Environment/   Hazard zones and evaluation
      Technology/    Upgrade definitions and system
      Reality/       Abilities, portals, barriers, phase-locked objects
      Progression/   XP, levels, locations, memory fragments
      Inventory/     Items
      Missions/      Mission definitions and runner
      Interaction/   Interactables (doors, terminals, stations, pickups, sockets...)
      Enemies/       Hostile drone
      UI/            Design system, HUD, BODY.OS menu and panels, menus, dialogs
      Saving/        Save data, validation, persistence
      Audio/         Audio manager and procedural synth
      World/         Level kit and the Derelict builder
      Editor/        Project setup and Android build automation
    Resources/Audio/ Optional audio clips (see README there)
    Tests/EditMode/  Unit tests (balancing, puzzles, content, saves)
  Packages/manifest.json
  ProjectSettings/ProjectVersion.txt
```

Everything (level geometry, avatar, UI, sprites, materials, sounds, music) is generated from code,
so no essential gameplay depends on missing art. Scenes stay empty: `GameBootstrap` starts the game
in any scene and `WorldBuilders` builds each location.

### Extending

- **Upgrades / abilities / missions / items / locations**: use *BODY.OS > Export Default Content to
  ScriptableObjects*, then edit or add assets under `Assets/ScriptableObjects/Resources/ScriptableObjects/`.
  An asset with the same `id` overrides the built-in definition. New ids add content with no code changes.
- **Vision modes**: add an enum value plus a `VisionModeInfo` in `VisionSystem`, and handle it in
  `VisionTarget.MaterialFor` and `ScreenFX.SetVision`.
- **Reality abilities**: add a `RealityAbilityType`, implement `IRealityEffect`, and register it in
  `RealitySystem`.
- **New planet**: write a builder like `DerelictBuilder`, add a case in `WorldBuilders.Build`,
  and give its `LocationDefinition` a `playableKey`.

## Building the APK

Requirements: **Unity 2022.3 LTS** (the project targets 2022.3.62f1; any 2022.3 release should work)
with the **Android Build Support** module, including OpenJDK and Android SDK & NDK Tools, all from Unity Hub.

1. In Unity Hub choose *Add > Add project from disk* and pick the `body-os` folder.
2. On first open the project configures itself (*BODY.OS > Setup Project* re-runs it). This:
   - creates `Assets/Scenes/{Bootstrap,MainMenu,Derelict,Veyra}.unity` and adds Bootstrap, MainMenu
     and Derelict to Build Settings;
   - sets product name *BODY.OS: BEYOND EXISTENCE*, id `com.bodyos.beyondexistence`, version 0.1.0;
   - sets landscape-only orientation, minimum API 24 (Android 7.0), target API = highest installed,
     IL2CPP with ARM64 + ARMv7, Gamma colour space, built-in render pipeline;
   - switches Active Input Handling to *Both* if the project was set to *Input System only*
     (restart the editor if it tells you to);
   - adds the runtime shaders to *Always Included Shaders* and creates template materials in
     `Assets/Resources/BodyOS/Materials`;
   - generates a placeholder app icon at `Assets/Textures/AppIcon.png`;
   - switches the build target to Android (if the module is installed).
3. Press **Play** with `Bootstrap` open to test in the editor (mouse and keyboard work there).
4. Run **BODY.OS > Build Android APK (Development)**. The APK goes to `body-os/Builds/Android/BodyOS-BeyondExistence-dev.apk`.
   It's signed with Unity's debug key, so you can install it with `adb install -r <apk>`.

Command-line build:

```
Unity -batchmode -nographics -quit -projectPath body-os \
  -executeMethod BodyOS.EditorTools.AndroidBuilder.BuildDevelopmentApk -logFile build.log
```

To release on Google Play, set up your own keystore in *Player Settings > Publishing Settings*
and turn on *Build App Bundle*.

## Tests

*Window > General > Test Runner > EditMode > Run All.* The tests cover attribute rules and
budgets, preset validity, content integrity, save round trips and repair of invalid saves, and
**puzzle solvability**. For example, they check that default jump can't reach the catwalk but Jump 7
can, that the lab ledge needs Reduced Gravity, and that the pulse barrier needs Time Distortion.

## What still needs testing

The environment this was written in had no Unity Editor, so these haven't been run yet:

- Opening the project in Unity 2022.3, running the automatic setup, and confirming the generated
  scenes and settings.
- Play-mode testing of the full mission on a real device: touch joystick and look feel, UI sizes on
  different aspect ratios, camera collision, CharacterController behaviour on the 1.9 m catwalk
  edge, drone difficulty, and how energy balance feels.
- The visual quality of the procedural lighting, vision modes and materials on Android GPUs, and
  frame rate on low-end devices (try *Graphics quality: LOW*).
- An actual APK build and install.

What *was* checked here: every runtime script compiles against the UnityEngine 2021.3 module and
uGUI reference assemblies. The editor scripts compile against a stub of the UnityEditor API they use.
The pure-logic checks (attribute sanitising, budgets, presets, save validation, puzzle numbers) pass
under Mono.

## Controls

| Touch | Desktop (editor) | Action |
| --- | --- | --- |
| Left side drag | WASD / arrows | Move |
| Right side drag | Mouse drag on right side | Camera |
| JUMP | Space | Jump |
| USE / SCAN | E | Interact, or analyse in Scanner vision |
| VISION | Q | Cycle vision modes |
| Ability buttons | - | Reality abilities in quick slots |
| BODY.OS | Tab | Open BODY.OS |
| II | Esc / Android Back | Pause / close the top menu |
