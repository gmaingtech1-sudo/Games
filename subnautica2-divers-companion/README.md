# Diver's Companion for Subnautica 2

A helper mod for Subnautica 2 that watches your back underwater. It warns you before you run out of air, food, water, health or vehicle power. It has an emergency oxygen tank for the times you cut it too fine, and a key that shows everything about your dive at once. You also get Turbo Fins, a recall-home key and an unstuck key. If you'd like a gentler game, you can make hunger, thirst and oxygen drain more slowly.

Messages pop up in the game's own notification boxes, so it looks like part of the game.

It's a [UE4SS](https://www.nexusmods.com/subnautica2/mods/36) Lua mod. That means it's plain text with nothing to compile. You can open the files and change anything you like.

**[Download DiversCompanion.zip](dist/DiversCompanion.zip)**

## What it does

### Survival alerts

You get one warning each time something crosses a danger line. You won't get another one until it's back to safe, so they don't keep repeating.

| Alert | When |
| --- | --- |
| Oxygen low / Oxygen critical | Oxygen falls below 30%, then 15%, while you're using it up. It tells you **roughly how many seconds of air you have left**, worked out from how fast you're using it. |
| Hungry / Thirsty | Food or water falls below 20% |
| Health low | Health falls below 35% |
| Overheating / Freezing | Your body temperature reaches the point where it starts to hurt you |
| Vehicle power low / critical | The vehicle you're in falls below 20%, then 5% power |
| Crush depth | You're within 10% of your vehicle's crush depth |
| Dusk / Dawn | Night is falling, or the sun is coming up |

Press **F7** to mute the alerts or turn them back on.

### Emergency O2

When your oxygen falls to 4%, a reserve tank opens and refills you to 40%, with a big warning to head for the surface. After that it needs 10 minutes to recharge. It's a safety net for a dive that went wrong. It doesn't give you endless air, so you still need to plan your dives.

### Status report: F5

One key shows your depth, health, oxygen (with time left), food, water, the day and time, and your vehicle's power and crush depth if you're in one. It also shows whether Turbo Fins are on and whether the emergency tank is ready.

### Turbo Fins: F6

Swim 50% faster and walk 25% faster. Press again to go back to normal speed. Your normal speed is put back exactly, and none of this goes into your save.

### Recall: F8 twice

Takes you home to your bed. If you don't have one yet, it takes you to your start point. You need to press it twice within 4 seconds so you can't use it by accident. It won't work while you're in a vehicle, so your sub doesn't get left behind.

### Unstuck: F9

Runs the game's own unstuck, for when you're wedged in rocks or clipped into your base.

### Relaxed survival

These are off by default. In `config.lua`, set `HungerRate`, `ThirstRate` or `SuffocationRate` below `1.0` and those bars drain more slowly. For example, `0.5` makes food last twice as long. This is safe for your save: the game stores its drain rates in your save file, so the mod leaves those alone. Instead it gives back part of each bit that drains. If you remove the mod, the normal rates come back straight away.

## Installing

1. Install **UE4SS for Subnautica 2** from [Nexus Mods](https://www.nexusmods.com/subnautica2/mods/36), following its instructions. UE4SS doesn't work on the game's experimental branch.
2. Download [DiversCompanion.zip](dist/DiversCompanion.zip).
3. Unzip it into `Subnautica2\Subnautica2\Binaries\Win64\ue4ss\Mods\`, so you end up with:

   ```
   ue4ss\Mods\DiversCompanion\
       enabled.txt
       Scripts\main.lua
       Scripts\config.lua
   ```

4. Start the game. The UE4SS console should say `[DiversCompanion] Loaded!`.

To remove it, delete the `DiversCompanion` folder.

## Settings

Everything is in `DiversCompanion\Scripts\config.lua`, and each setting has a comment saying what it does. You can:

- change the hotkeys, or add Ctrl / Shift / Alt to them (useful if F5–F9 clash with something else)
- move each alert's warning level
- turn off the emergency tank, or change when it opens, how much it fills and how long it takes to recharge
- change how fast Turbo Fins are, and whether they start on
- set how fast hunger, thirst and oxygen drain
- set how long messages stay on screen

After changing it, restart the game. Or press **Ctrl+R** with the game window focused to reload mods without restarting.

> If you reload with Ctrl+R while Turbo Fins are on, turn them off first. Otherwise the mod treats your boosted speed as your normal speed. You can also just reload your save.

## Co-op

This mod changes things on your own computer. Alerts, the status report, Turbo Fins, recall and unstuck all work for whoever has the mod installed. Turbo Fins and unstuck go through the game's own requests to the host. Emergency O2 and relaxed survival change your oxygen, food and water directly, so in co-op they only work properly if you're the host or playing alone.

## How it works

The mod finds your diver and reads the same survival, health, movement and vehicle stats that the game's HUD uses. It checks them twice a second. It only uses game functions and properties that exist in the game's own code (`SN2PlayerCharacter`, `UWESurvivalSetComponent`, `UWEMovementSetComponent`, `UWEMechanicalSetComponent`, `UWETimeOfDayStatics`, and the player's `UWENotificationComponent` for pop-ups). Every one of these names was checked against a reflection dump of game build CL-128456 (Unreal Engine 5.6) from the community [Subnautica 2 modkit](https://github.com/Subnautica2Modding/Subnautica2-Project).

Subnautica 2 is in Early Access, and the developers move things around between updates. If an update renames something, the mod writes the error to the UE4SS console instead of crashing. After that, the feature that broke stops working until the mod is updated.

## Tests

`tests/test_main.lua` runs the mod against a fake UE4SS and a fake diver. It checks the alerts, the oxygen countdown, the emergency tank and its cooldown, Turbo Fins, relaxed survival, recall, unstuck, day and night, vehicles, co-op character picking and the main menu. Run it from this folder with Lua 5.4:

```
lua tests/test_main.lua
```
