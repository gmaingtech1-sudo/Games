# Audio slots

Every sound in BODY.OS has a named slot. Drop a clip with **exactly** the slot name
(any format Unity imports: `.wav`, `.ogg`, `.mp3`) into this folder and it replaces the
procedural fallback automatically. Missing clips are never an error: the game synthesises
a sci-fi sound for every slot at runtime (`Scripts/Audio/SfxSynth.cs`).

| Slot | Used for |
| --- | --- |
| `UiClick`, `UiBack` | Button taps |
| `OsOpen`, `OsClose` | Opening and closing BODY.OS / pause |
| `Confirm`, `Denied` | Successful / refused actions |
| `Upgrade`, `LevelUp` | Installing technology, levelling up |
| `Scan`, `ScanComplete`, `Vision`, `Interference` | Scanner and vision modes |
| `LowEnergy`, `Hazard`, `Threat`, `Damage` | Warnings |
| `Objective`, `MissionComplete`, `Discovery`, `Memory` | Progression and story |
| `Reality` | Reality ability activation, portals |
| `Jump`, `Land`, `Footstep` | Movement |
| `Pickup`, `DoorOpen`, `Recharge`, `Calibrate`, `Success`, `Transmission` | World interactions |
| `MusicMenu`, `MusicShip` | Looping music (main menu, ship) |
