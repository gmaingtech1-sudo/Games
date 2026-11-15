# Rift Coach (Unreal Engine 5, AR)

A handheld AR game for iPhone and Android, built in Unreal Engine 5. Portal rifts tear open on the real floors and tables in your room. You hack them, claim them, and link them into a network. Sage, a young Parasaurolophus, steps out of a rift and coaches you on your real life. Everything you follow through on earns **Resolve**, and Resolve is what keeps your rifts alive.

It's the indoor, Unreal take on [Riftborn](../riftborn): real AR surface tracking instead of motion sensors, and a dinosaur that helps with your goals instead of fighting you.

## What's in it

| Feature | How it works |
| --- | --- |
| **Real AR** | ARKit / ARCore world tracking. Rifts and Sage sit on floors and tables the phone detects and stay put as you walk around them. The camera's light estimate drives the brightness and colour temperature of the virtual lights, so the scene matches your room. |
| **Portal rifts** | Point at the floor and tap **Open Rift**. An oval ring of light tears open with a shimmering event horizon and a glow that lights Sage when they stand nearby. Teal = yours (Wardens), magenta = rival Breachers, grey = neutral. |
| **Hacking** | Walk up to a rift (within 2 m, for real) and tap **Hack**. The rift flashes a glyph on a 3×3 grid; tap it back from memory before time runs out. Higher-level and enemy rifts have longer glyphs. A perfect hack wins shards and a **key**. Hacking an enemy rift drains it; drain it to zero and it collapses to neutral, ready to claim. 60 s cooldown per rift. |
| **Linking** | Pick one of your rifts → **Link** → tap another of yours you hold a key to. Links need to be within range (4 m, +1.5 m per level) and can't cross any other link. |
| **Control fields** | Close a triangle of three links and a field of energy covers the floor between them. Fields earn **Aether**: 2 per square metre per minute. Bigger triangles earn more. |
| **Rival AI** | Once you open your first rift, the Breachers wake up. Every 35–70 s they open rifts on real surfaces around you, link them, or drain yours. A drained rift collapses to neutral and loses its links. |
| **Sage, your coach** | **Summon Sage** at the floor ring. Sage breathes, sways their tail, blinks, turns to face you, follows your phone with their head, nods and talks. Tap Sage or **Talk to Sage** to open a session. |

### Sage's coaching

| Session | What happens | Resolve |
| --- | --- | --- |
| Daily check-in | Rate your mood 1–5, then name one small thing for today. Tracks a check-in streak. If your last three check-ins were low, Sage suggests talking to a friend, doctor or counsellor. A "rough" day always comes with a reminder to reach out to someone you trust or a crisis line if you feel unsafe. | +2 once a day |
| Plan a goal | The GROW model: Goal → Reality → Options → Will (one tiny next step) → When. If the step is vague, Sage nudges you once to add a number or time. | +3 |
| Review goals | Mark a next step done (+2), then either set the next step or finish the goal (+5) and reflect on what you learned. | +2 / +5 |
| Habits | Up to five tiny habits stacked on routines you already have ("After I make coffee, I'll stretch for 2 minutes"). Tick them off daily for streaks, with milestones at 3, 7, 14, 21 and 30 days, and "never miss twice" when a streak breaks. | +1 each per day |
| Reflect | One of twelve reflection questions, with the option to turn your answer into a goal. | +1 once a day |
| Breathe | One minute of guided box breathing (4-4-4-4). Sage's chest rises and falls with you. | +1 once a day |

Spend Resolve to **Recharge** rifts (1 Resolve = +50%) and **Upgrade** them (level × 3 shards + level × Resolve). Upgraded rifts link further, yield more when hacked and resist draining.

Your name, goals, habits, moods, streaks, shards, Resolve and Aether are saved on the phone. Rifts aren't saved, because AR coordinates reset each time the app starts. Every session you fight the rift war again in whatever room you're in.

Sage is a coach, not a therapist. Nothing leaves the phone.

## Opening it

You need **Unreal Engine 5.4 or newer** (from the Epic Games Launcher) and a C++ toolchain: Visual Studio 2022 on Windows, or Xcode on a Mac.

1. Right-click `RiftCoach.uproject` → **Generate Visual Studio project files** (Windows) or **Services → Generate Xcode Project** (Mac), or just double-click the `.uproject` and let Unreal build the module.
2. If Unreal says a plugin can't be found (Epic has renamed AR plugins between versions), let it disable that one. You only need ARKit for iPhone and ARCore for Android.
3. Press **Play**. There's no AR on a PC, so you get a practice room: drag to look around, click to tap. Everything else works the same, apart from the 2 m hacking range.

There are no maps or `.uasset` files to open. The game starts on the engine's empty map and builds everything (rifts, links, fields, Sage, lights and the whole UI) from C++.

## Putting it on your phone

**iPhone (ARKit):** you need a Mac with Xcode and an Apple developer account. In **Project Settings → Platforms → iOS**, set your team and signing, then **Platforms → iOS → Package Project**, or use **Quick Launch** with the phone plugged in. The camera permission text is already in `Config/DefaultEngine.ini`.

**Android (ARCore):** install Android Studio and run Unreal's `SetupAndroid` script for your engine version (see Epic's "Setting up Android SDK and NDK" page). Then **Platforms → Android → Package Project** (choose ASTC) and install the APK on an [ARCore-supported phone](https://developers.google.com/ar/devices). The project targets OpenGL ES with portrait orientation.

## Making it photoreal

Out of the box Sage and the rifts are built from Unreal's basic shapes, so the project needs no downloads. For a realistic look, add your own assets and point **Project Settings → Game → Rift Coach** at them:

| Setting | What to use |
| --- | --- |
| **Dino Mesh** + **Dino Anim Class** | Any rigged dinosaur skeletal mesh, for example from [Fab](https://www.fab.com/) (search "Parasaurolophus" or "hadrosaur"). Give its Animation Blueprint a float variable called `Speed` and blend idle → walk on it; the game sets it every frame. Use **Dino Mesh Rotation** (often Yaw −90) and **Dino Mesh Scale** to make it face forward and stand about 1.5 m tall. |
| **Portal Material** | An unlit, additive or translucent emissive material with a vector parameter called `Color`. Add a panning noise texture and refraction for a real "tear in space" look. |
| **Link Material** / **Field Material** | The same idea. Fields look best translucent at about 30% opacity. |
| **Session Config** | Create a **Data Asset → AR Session Config** and turn on its occlusion options (scene depth on ARCore and LiDAR iPhones, people occlusion on iPhone), so real furniture and people can pass in front of Sage. Keep plane detection and light estimation on. |

For contact shadows on the real floor, add a shadow-catcher material to a large plane that follows the detected floor.

## Files

| File | What it does |
| --- | --- |
| `RiftCoach.uproject` | The project, with the ARKit, ARCore and Procedural Mesh plugins |
| `Config/` | Start-up map and game mode, mobile rendering, input, Android and iOS packaging |
| `Source/RiftCoach/Public/RiftSettings.h` | The Project Settings page: asset slots and game rules |
| `RiftPlayerController` | AR session, floor tracing, touch input, all the rift rules, and running Sage's sessions |
| `RiftNetworkSubsystem` | Every rift, link and field. Link range and crossing rules, triangles into fields, Aether, and the rival Breacher AI that spawns rifts on detected planes |
| `RiftPortal`, `RiftLink`, `RiftField` | The rift, the link beam with travelling pulses, and the procedural-mesh control field |
| `RiftHack` | The glyph-memory hacking minigame |
| `CoachBrain` | Sage's conversations: check-ins, GROW goals, habits and streaks, reflection, breathing |
| `DinoCoach` | Sage's body: the stand-in built from shapes with procedural animation, or your skeletal mesh |
| `RiftLightRig` | Key light and ambient light driven by the AR light estimate |
| `RiftReticle`, `RiftPawn`, `RiftGameMode`, `RiftSaveGame` | The floor ring, the phone camera, wiring, and what's saved |
| `Private/UI/SRiftHud` | The whole HUD in Slate: stats, toasts, rift panel, hacking grid and Sage's chat panel |

## Play safe

Look around before you walk to a rift. Keep clear of stairs, pets and other people, and don't play while walking down the street.
