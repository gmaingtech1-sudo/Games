# Riftborn for Unity (AR)

This is Riftborn rebuilt as a Unity project. It's a real-world AR creature game:
you walk around, catch creatures in AR on your real floor, and fight for Rifts
with the Wardens, Breachers or Primals (and against the Hollow).

- **AR catching** uses AR Foundation, with ARCore on Android and ARKit on iPhone.
  The creature appears on your floor, lit to match the room, and casts a shadow.
  Dart it to collect DNA and calm it down, then swipe up to throw an orb while
  the ring is small.
- **Map:** the real streets around you from Esri tiles. Pick the dark "scanner"
  look or satellite photos in Settings. Rifts, supply caches and wandering
  creatures are placed there.
  - The map uses the same world generator as the web version, so you'll find
    the same Rifts in the same places.
  - Your reach is 100 m.
- **Teams:** the Wardens, Breachers and Primals. You can hack Rifts, claim them,
  recharge them, and beat the guardians of enemy Rifts in turn-based battles.
  The Hollow take over Rifts whose charge runs out.
- **42 creatures:** dinosaurs, flyers and hybrids, all built in code with
  animated skeletons.
  - Each has a level, a power rating, DNA and a signature move.
  - Your battle team holds up to three.
- **No AR?** On a PC, or on a phone that can't do AR, encounters happen on a 3D
  patch of wild ground instead. On a PC you walk with WASD.

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
5. **Try it on your PC:** press **Play** ▶.
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

- **Creatures:** go within 100 m and tap one, then choose **Encounter in AR**.
  1. Point the camera at the floor, then tap to open the Rift.
  2. **Darts:** line up the gold target and press **Fire**. Each hit gives DNA
     and makes the creature easier to catch.
  3. **Orbs:** swipe up to throw an orb. Throw it when the ring is small to get
     Nice, Great or Excellent bonuses.
- **Rifts:**
  - **Hack** a Rift for orbs, darts and shards.
  - **Claim** an unclaimed Rift for 6 shards.
  - **Recharge** your team's Rifts, because they lose charge every day.
  - **Battle** the guardians of an enemy Rift to make it unclaimed again.
- **Creatures menu:** level creatures up with their DNA and pick your battle
  team of three.
- **Teams menu:** see who holds the Rifts nearby. You can switch teams once
  every 30 days.

## What's inside

| Folder | What |
|---|---|
| `Assets/Riftborn/Scripts/Core` | Random numbers (matching the web game), input, sounds |
| `Assets/Riftborn/Scripts/Game` | World generator, save data, map, UI, AR encounter, battles, game loop |
| `Assets/Riftborn/Scripts/Gfx` | Creature models, their skeletons and animation, textures, props, menu previews |
| `Assets/Riftborn/Shaders` | Map tile, glow and AR shadow shaders |
| `Assets/Riftborn/Editor` | The automatic setup and build menu |

- The scene is empty on purpose, because the game builds everything when it
  starts.
- Saves are kept on the device with PlayerPrefs.
- This version doesn't have online play, eggs, Apex raids or weather. Those are
  only in the web version for now.

## If something goes wrong

- **"AR" isn't shown in an encounter on the phone:** the phone doesn't support
  ARCore, or Google Play Services for AR needs updating from the Play Store.
- **Nothing happens when building:** open **Edit → Preferences → External
  Tools** and check that the Android SDK, NDK and JDK boxes are ticked.
- **Pink objects:** run **Riftborn → Set up project** again.
- **Keys or mouse don't work in Play mode:** check **Edit → Project Settings →
  Player → Active Input Handling**. It should say **Both**.
