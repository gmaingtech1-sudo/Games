# Testing

Every test runs headless, without a GPU, except the screenshot tour, which needs a display (Xvfb works).

| Command | What it checks | Last result |
| --- | --- | --- |
| `godot --headless --path . -s tools/check_scripts.gd` | Every `.gd` file compiles | 72 scripts, 0 failed |
| `godot --headless --path . res://scenes/tests/test_runner.tscn` | Unit tests for every rule system, plus a scripted play-through of the real game world | 332 passed, 0 failed |
| `godot --headless --path . res://scenes/tests/soak_test.tscn` | A full game day at 10x speed: wandering, NPC routines, traffic, business trading, day rollover, autosave | No script errors |
| `tools/run_net_test.sh` | A dedicated server with two clients (including cheat attempts), then host mode with one client | 29/29 and 13/13 checks passed |
| `xvfb-run -s "-screen 0 1280x720x24" godot --path . --rendering-driver opengl3 res://scenes/tests/screenshot_tour.tscn -- --out DIR` | Renders 16 screenshots: menu, creator, districts, rain, night, driving, interior, phone, shop, business, dialogue, map | Checked by eye |
| `tools/build_apk.sh` | Exports and signs the Android APK | Builds and verifies (`apksigner verify`) |

The tests use their own save folders (`user://test_saves`, `user://net_test_saves` and so on), so they never touch real saves.

## What `test_runner` covers

* **Data:** every JSON file loads, every category has items, every NPC, job, business and property location exists on the map, race routes lie on roads.
* **Economy:** paying with cash then card, refusing unaffordable or negative payments, deposits and withdrawals, transaction history, income and expense totals.
* **Inventory:** stacking, slot capacity, the backpack bonus, buying at the wrong shop, selling equipped clothes, eating changes needs.
* **Needs:** decay, starving drains health, clamping, sleep, warnings.
* **Jobs:** requirements (qualifications, smart outfit), shift hours, one shift per day, wages, promotion, the server's anti-spam limit, courses.
* **Property:** renting, weekly rent, eviction after three missed payments, buying, furniture, upgrades, decorating, selling (furniture is returned).
* **Vehicles:** buying, refusing fuel increases and damage decreases from reports, refuelling cost, repairs, paint validation, engine upgrades, selling.
* **Business:** buying, staff, stock, daily profit, collecting, stock-outs hurting reputation, prices, upgrades, selling.
* **Missions:** deterministic daily picks, no double claims, locked missions, other days' dailies refused.
* **Challenges:** requirements, the Property Mogul win, impossible race times rejected, prizes paid once per difficulty, the Career Challenge.
* **Relationships:** chat gain, the daily cap, liked gifts, low hygiene halving gains.
* **Router:** unknown actions, bad parameter types, services, sleeping, collectibles, hospital.
* **Validation:** a garbage state is sanitised (negative cash, unknown items, jobs and vehicles, out-of-range time).
* **Save/load:** round trip, a corrupt file falls back to its backup, an edited file fails the checksum, both files corrupt fails safely, slot listing, deleting, Continue picks the latest slot.
* **Scenes:** main menu, creator, new game with the chosen outfit, the world with player, city, NPCs, traffic and interactables, standing on the ground, joystick movement, opening every location menu, every phone app and every panel, the main missions completing from real events, renting, furnishing and entering a home, buying and driving a car (fuel goes down), working a shift and getting paid, day rollover and new daily missions, a time trial, the street race with three rivals, talking to an NPC, saving from the world, quitting to the menu.
