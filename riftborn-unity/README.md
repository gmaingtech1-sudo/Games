# Riftborn for Unity (AR)

This is Riftborn rebuilt as a Unity project, with everything the web game has.
It's a real-world AR creature game: you walk around, catch creatures in AR on
your real floor, and fight for Rifts with the Wardens, Breachers or Primals (and
against the Hollow).

**Plays with the web game.** The Unity version uses the same world generator,
rules and save format as the web game. With online accounts on the same
Firebase project, one account plays in both and your progress follows you.

- **Accounts:** sign up and log in.
  - Without a Firebase project, accounts are kept on the phone and several
    agents can share it.
  - With a Firebase project, accounts work online (set it up in the game or in
    `Assets/Riftborn/Scripts/Config.cs`). Your save is kept in the cloud, and
    there's a shared leaderboard.
- **AR catching** uses AR Foundation, with ARCore on Android and ARKit on iPhone.
  - The creature appears on your floor, lit to match the room, and casts a
    shadow.
  - Dart it to collect DNA and calm it down, then swipe up to throw an orb while
    the ring is small.
  - AR can be turned off in the Menu.
- **Map:** the real streets around you.
  - Styles: scanner (like Ingress), satellite, day, night, day-and-night
    following your clock, or no street map.
  - Sources: free Esri or OpenStreetMap tiles, or Google Maps with your own key.
  - Links and control fields glow on the ground.
  - The real weather shows as rain, snow, fog and lightning.
- **Rifts:** hack them for supplies and keys, then claim, upgrade and recharge
  them.
  - Choose which creatures guard them.
  - Link your team's Rifts, and close triangles of links to raise control
    fields for Aether.
  - Assault enemy Rifts. The Hollow take over Rifts whose charge runs out.
- **Apex raids:** huge boss creatures take over some Rifts each day.
- **Eggs:** two incubators hatch eggs as you walk 2, 5 or 10 km.
- **Lab:** level creatures up, browse the Riftdex, fuse hybrids and release
  creatures.
- **Missions:** three field missions a day, the Rift Surge bonus, and a 7-day
  daily login bonus.
- **Walking rewards:** your buddy finds DNA every 250 m, and there's a supply
  stash every kilometre.
- **Arena:** battle rival agents' teams from anywhere.
  - Climb from Bronze to Legend for rank rewards.
  - Win three battles a day for the daily chest.
- **Weather:** the real weather where you are (from Open-Meteo) boosts one
  element's creatures.
- **Profile:** 12 medals with five tiers each, agent levels 1 to 40, and the
  leaderboard.
- **42 creatures:** dinosaurs, flyers and hybrids, all built in code with
  animated skeletons.
- **No AR?** On a PC, or on a phone that can't do AR, encounters happen on a 3D
  patch of wild ground instead.
  - On a PC you walk with WASD.
  - On a phone without GPS there's a joystick.

## Put it on your F: drive and open it

1. **Install Unity:** get [Unity Hub](https://unity.com/download).
   1. In Unity Hub, go to **Installs → Install Editor** and choose **Unity 6**
      (any `6000.0.x` version).
   2. Tick **Android Build Support**, including the **OpenJDK** and
      **Android SDK & NDK Tools** boxes under it.
   3. Add **iOS Build Support** too if you have a Mac and an iPhone.
2. **Unzip** `Riftborn-Unity.zip` to your F: drive, so you have `F:\Riftborn`.
   It should contain `Assets`, `Packages` and `ProjectSettings`.
3. **Open it:** in Unity Hub, click **Add → Add project from disk**, choose
   `F:\Riftborn` and open it.
   1. The first open takes a few minutes while Unity downloads AR Foundation.
   2. If Unity says the project was made with a different 6000.0 version,
      click **Continue**.
   3. If Unity asks to **restart for the new Input System**, click **Yes**.
4. **Automatic setup:** when it opens, Riftborn sets itself up. It:
   - makes the scene;
   - turns on ARCore and ARKit;
   - sets the Android and iPhone settings.

   You can run it again any time from **Riftborn → Set up project** in the menu
   bar.
5. **Try it on your PC:** press **Play** ▶, then **Sign up** to make an agent.
   - Walk with WASD or the arrow keys, and hold Shift to run.
   - Drag to turn the camera and scroll to zoom.
   - Click creatures, Rifts and caches to use them.

## Put it on your Android phone

1. On the phone, turn on **Developer options → USB debugging**, then plug it
   into the PC.
2. In Unity, choose **Riftborn → Build and run on Android phone (USB)**.
   - Or choose **Riftborn → Build Android APK**. The file is saved to
     `F:\Riftborn\Builds\Riftborn.apk`; copy it to the phone and open it.
3. When the game asks, allow **location** and **camera**. AR needs a phone that
   supports ARCore (Google Play Services for AR). Most phones from 2018 onwards
   do.

**iPhone:** choose **Riftborn → Build iPhone Xcode project**, then open
`Builds/iOS` in Xcode on a Mac and run it on the phone.

## How to play

The bottom bar has **Lab**, **Bag**, **Scan**, **Missions**, **Arena** and
**Menu**. Tap your agent card for your profile, and your supplies for the bag.
A gold dot means something is ready to claim.

- **Creatures:** go within 100 m and tap one (or its picture bottom left), then
  choose **Engage in AR**.
  1. Point the camera at the floor, then tap to open the Rift.
  2. **Darts:** line up the gold target and press **Fire**. Each hit gives DNA
     and makes the creature easier to catch.
  3. **Orbs:** swipe up to throw an orb. Throw it when the ring is small to get
     Nice, Great or Excellent bonuses.
- **Rifts:**
  - **Hack** a Rift for orbs, darts, shards and often its key.
  - **Claim** an unclaimed Rift for 6 shards.
  - **Upgrade** your Rifts for more guardians and a longer link range, and
    **Choose guardians** for them.
  - **Recharge** your team's Rifts, because they lose charge every day.
  - **Assault** enemy Rifts by beating their guardians.
- **Links and fields:** on one of your team's Rifts, choose **Link to another
  Rift** and spend a key.
  - Links can't cross.
  - Three linked Rifts raise a control field, and bigger fields give more
    Aether.
- **Apex raids:** a huge Apex creature on a red ring stands next to some Rifts
  each day.
  - Choose **Battle the Apex**. It has three times the health.
  - You can beat each Apex once a day.
- **Eggs:** find them in caches, hacks, the daily bonus, the arena and Apex
  raids.
  - Walk 2, 5 or 10 km with them in your two incubators to hatch them.
  - The **Bag** shows them.
- **Lab:** has three tabs.
  - **Creatures:** level up with DNA, set your team (★), or release a creature
    for DNA.
  - **Riftdex:** every species you've found.
  - **Fusion:** mix two species' DNA into hybrids.
- **Missions:** three new missions a day, plus the Rift Surge when all three
  are done, and the **Daily bonus** (day 7 is a 10 km egg).
- **Arena:** pick an Easy, Even or Hard rival and battle their team for
  trophies. Running away counts as a loss.
- **Weather:** the badge under your supplies shows the real weather and which
  element it boosts.
- **Profile:** your XP, stats, walking buddy and medals, the level table and
  the leaderboard.
- **Menu:**
  - Sound, map style, AR camera, map source and your Google Maps key.
  - GPS or joystick movement.
  - Teams, your account and online accounts.
  - How to play, and starting over.

### Online accounts (optional)

To play on any phone, and to share one account with the web game, you need a
free Firebase project. The game's title screen and Menu → Account → Online
accounts walk you through it:

1. Create the project at console.firebase.google.com.
2. Turn on Email/Password sign-in.
3. Create a Firestore database.
4. Paste the Riftborn rules. The game copies them for you.
5. Paste the Project ID and Web API key into the game, which checks everything.

If the web game uses the same project, the same account works in both.

## Using Asset Store art (dinosaurs, portals, effects)

Riftborn can use these free Asset Store packs instead of its own generated
art:

| Pack | Used for |
|---|---|
| **PBR Animated Dinosaurs** (Ferocious Industries) | The creatures, with their real animations, on the map, in AR, in battles and in menus |
| **The Portal Collection** (ReversedInt) | The Rifts on the map, the Rift a creature steps out of in AR, and the arena backdrop |
| **Magic Effects FREE** (Hovl Studio) | Dart hits, bullseyes, catches and break-outs, battle strikes and element blasts, guards, hacks, claims and level ups |

1. **Import the packs into this project.** In Unity, open **Window → Package
   Manager → My Assets** with the Riftborn project open. Choose each pack and
   click **Download**, then **Import** and **Import** again.
   - If they show "In Project" for another project, import them again here.
2. **Let Riftborn set them up.** Riftborn sets them up by itself the first time
   it finds them. You can also run it from **Riftborn → Use imported assets
   (dinosaurs, portals, effects)**. It does four things:
   - It finds each dinosaur and works out its animations (idle, walk, run,
     attack, roar, hit, death, fly), which way it faces and its skins. It then
     makes an Animator Controller for it in `Assets/Riftborn/Generated`.
   - It gives every species a dinosaur of the same body type: raptor, rex,
     horned, plated, long-neck or flyer. Where it can, it matches a feature,
     so dome heads get a Pachycephalosaurus and plated backs a Stegosaurus.
   - It uses the portals for the Rifts.
   - It picks effects by name, such as explosion, spark, slash, circle and
     shield. Effects named after an element, like fire or lightning, are used
     for that element's moves.
3. **Press Play.** Species without a matching dinosaur keep the game's own
   creature.

**Changing what it picked:** open **Riftborn → Show asset links** and change
anything in the Inspector. For each dinosaur you can set:
- its body type, and how much it turns (`yaw`) if it walks sideways or
  backwards;
- which animation plays for each move;
- how much it's tinted towards each species' colours.

Under **Species** you can choose which dinosaur and skin each species uses (−1
means the game's own model). Each effect slot takes any particle prefab.

**Turning them off:** in the game, **Menu → Imported dinosaurs, portals &
effects** switches between this art and the game's own.

## What's inside

| Folder | What |
|---|---|
| `Assets/Riftborn/Scripts/Core` | Random numbers (matching the web game), input, sounds |
| `Assets/Riftborn/Scripts/Game` | World generator, save data, map, UI, AR encounter, battles, game loop |
| `Assets/Riftborn/Scripts/Gfx` | Creature models, their skeletons and animation, textures, props, menu previews |
| `Assets/Riftborn/Shaders` | Map tile, glow and AR shadow shaders |
| `Assets/Riftborn/Editor` | The automatic setup, the Asset Store hook-up and the build menu |
| `Assets/Riftborn/Resources/RiftbornAssetLinks.asset` | Which imported dinosaurs, portals and effects are used (made by Riftborn → Use imported assets) |

- The scene is empty on purpose, because the game builds everything when it
  starts.
- Saves are kept on the device with PlayerPrefs.
- Saves are the web game's JSON format. A save from the first Unity version
  converts itself, and the first account you make on the phone takes it over.
- `Assets/Riftborn/Scripts/Config.cs` can hold a built-in Firebase project and
  Google Maps key. Leave them empty to let players set them up in the game.

## If something goes wrong

- **"AR" isn't shown in an encounter on the phone:** the phone doesn't support
  ARCore, or Google Play Services for AR needs updating from the Play Store.
- **Nothing happens when building:** open **Edit → Preferences → External
  Tools** and check that the Android SDK, NDK and JDK boxes are ticked.
- **Pink objects:** run **Riftborn → Set up project** again.
- **Keys or mouse don't work in Play mode:** check **Edit → Project Settings →
  Player → Active Input Handling**. It should say **Both**.
