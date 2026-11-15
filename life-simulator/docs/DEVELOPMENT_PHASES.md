# Development phases

The game was built in the seven phases from the brief. At the end of each phase the scripts were compiled (`tools/check_scripts.gd`) and the tests were extended and run.

## Phase 1: Foundations

**Done:** project setup (Godot 4.4, Compatibility renderer, landscape, autoloads, input map), main menu, character creator with a live 3D preview, third-person movement (walk, run, jump), the orbit camera with spring arm, the modular 3D city (`CityLayout` data and the batched city builder), and multi-touch mobile controls.

**Files:** `project.godot`, `scenes/main/boot.tscn`, `scenes/menus/*.tscn`, `scripts/ui/{boot,main_menu,character_creator,ui,modal,touch_controls}.gd`, `scripts/player/{player,camera_rig,character_model}.gd`, `scripts/city/{city_layout,city_builder,interactable}.gd`, `autoload/{DataDB,Settings,WorldClock,GameManager}.gd`

## Phase 2: Life systems

**Done:** player needs, money (cash, bank, history), inventory with stacking and capacity, shops and services, nine jobs with shifts, mini-games and delivery/patrol routes, College courses, and missions (main, side, daily, job, driving, business, exploration, favours) with a tracker.

**Files:** `scripts/core/{player_state,money,needs_rules,action_router}.gd`, `scripts/economy/economy_rules.gd`, `scripts/inventory/inventory_rules.gd`, `scripts/jobs/{job_rules,work_route}.gd`, `scripts/missions/mission_rules.gd`, `autoload/{EconomyManager,MissionManager}.gd`, `scripts/ui/{shop_panel,bank_panel,jobs_panel,inventory_panel,missions_panel,work_minigame}.gd`, `resources/{items,jobs,missions}/*.json`

## Phase 3: Property, vehicles and people

**Done:** renting, buying, selling, upgrading, decorating and furnishing homes, enterable interiors, eight vehicles with arcade driving, fuel, damage, paint, engine upgrades and delivery, 16 named residents with routines, dialogue, reactions and friendships, and traffic.

**Files:** `scripts/property/{property_rules,interior}.gd`, `scripts/vehicles/{vehicle,vehicle_model,vehicle_rules}.gd`, `scripts/npc/{npc,traffic,relationship_rules}.gd`, `scripts/ui/{property_panel,vehicle_panel,dialogue_panel,social_panel}.gd`, `resources/{properties,vehicles,npcs}/*.json`

## Phase 4: Progression

**Done:** business management with a daily trading simulation, four boss challenges with three difficulties, 24 achievements stored permanently, and street races and time trials.

**Files:** `scripts/business/business_rules.gd`, `scripts/missions/challenge_rules.gd`, `scripts/vehicles/race_manager.gd`, `autoload/AchievementManager.gd`, `scripts/ui/{business_panel,achievements_panel}.gd`, `resources/{businesses,achievements}/*.json`, `resources/missions/challenges.json`

## Phase 5: Save, sound, settings and polish

**Done:** three save slots, autosave, manual save, Continue, checksums, atomic writes with backups and corruption recovery, original synthesised music and sound effects, settings (volumes, graphics presets, controls), the HUD, minimap, smartphone (16 apps), pause menu, location menus and notifications.

**Files:** `autoload/{SaveManager,AudioManager}.gd`, `tools/make_audio.py`, `assets/{sounds,music}/*`, `scripts/ui/{hud,minimap,phone,pause_menu,settings_panel,location_menu,character_panel}.gd`, `scripts/city/{environment_controller,game_world}.gd`, `assets/buildings/facade.gdshader`

## Phase 6: Online multiplayer

**Done:** ENet host, join and dedicated server, a server-authoritative action pipeline, online profiles with tokens, movement relay with interpolation, names, chat, world time sync and server-side daily updates. Tested on localhost with a dedicated server, two clients and host mode.

**Files:** `autoload/MultiplayerManager.gd`, `scripts/multiplayer/{multiplayer_menu,remote_player,dedicated_server}.gd`, `scenes/multiplayer/*.tscn`, `scripts/tests/net_client_test.gd`, `tools/run_net_test.sh`, `docs/MULTIPLAYER.md`

## Phase 7: Android and final testing

**Done:** the Android export preset (prebuilt template, no Gradle needed), signing key, icons, back button, saving when the app is paused, battery-friendly frame caps, the APK build script and a signed APK, the Linux server export, the full test suite, a soak test, screenshot review, and bug fixes found through rendering:
* Root UI controls sized to the screen.
* The spawn point moved to Central Plaza.
* Window glow switched to a one-texture shader, because emission textures were ignored on GLES3.
* HUD text clipping fixed.
* Residents stay visible outside their workplaces.

**Files:** `export_presets.cfg`, `android/release.keystore`, `tools/{build_apk.sh,make_icon.py,check_scripts.gd}`, `assets/ui/icon*.png`, `scripts/tests/{test_runner,soak_test,screenshot_tour}.gd`, `docs/{ANDROID_EXPORT,TESTING}.md`, `dist/life-simulator.apk`
