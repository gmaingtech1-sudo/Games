class_name NeedsRules
extends RefCounted
## Player needs (0-100). Decay over game time, effects from items/services,
## and the soft consequences of neglecting them.

# Decay per in-game hour while awake.
const DECAY := {"hunger": 3.4, "thirst": 4.4, "energy": 3.6, "hygiene": 2.4, "social": 2.0}


static func clamp_all(s: Dictionary) -> void:
	for n in PlayerState.NEEDS:
		s["needs"][n] = clampf(float(s["needs"][n]), 0.0, 100.0)


static func apply_effects(s: Dictionary, effects: Dictionary) -> void:
	for k in effects:
		if s["needs"].has(k):
			s["needs"][k] = clampf(float(s["needs"][k]) + float(effects[k]), 0.0, 100.0)


## Advances needs by the given number of in-game minutes.
## activity: "idle", "walk", "run", "drive", "sleep", "work".
static func tick(s: Dictionary, minutes: float, activity: String = "idle", comfort: float = 0.0) -> void:
	var h := minutes / 60.0
	var n: Dictionary = s["needs"]
	var energy_mult := 1.0
	match activity:
		"run":
			energy_mult = 2.2
		"walk":
			energy_mult = 1.15
		"work":
			energy_mult = 1.6
		"sleep":
			energy_mult = 0.0
	if activity == "sleep":
		n["hunger"] = float(n["hunger"]) - DECAY["hunger"] * 0.45 * h
		n["thirst"] = float(n["thirst"]) - DECAY["thirst"] * 0.45 * h
	else:
		n["hunger"] = float(n["hunger"]) - DECAY["hunger"] * h * (1.25 if activity == "run" else 1.0)
		n["thirst"] = float(n["thirst"]) - DECAY["thirst"] * h * (1.4 if activity == "run" else 1.0)
		n["energy"] = float(n["energy"]) - DECAY["energy"] * energy_mult * h
		n["hygiene"] = float(n["hygiene"]) - DECAY["hygiene"] * h * (1.6 if activity == "run" else 1.0)
		n["social"] = float(n["social"]) - DECAY["social"] * h
	# Health: drains when starving/dehydrated/exhausted, recovers slowly otherwise.
	var drain := 0.0
	if float(n["hunger"]) <= 5.0:
		drain += 3.0
	if float(n["thirst"]) <= 5.0:
		drain += 4.0
	if float(n["energy"]) <= 2.0:
		drain += 1.5
	if drain > 0.0:
		n["health"] = float(n["health"]) - drain * h
	elif float(n["hunger"]) > 40.0 and float(n["thirst"]) > 40.0 and float(n["energy"]) > 25.0:
		n["health"] = float(n["health"]) + 1.2 * h
	# Happiness drifts towards a mood target built from the other needs.
	var target := (float(n["hunger"]) + float(n["thirst"]) + float(n["energy"]) + float(n["hygiene"]) + float(n["social"]) * 1.5 + float(n["health"])) / 6.5
	target = clampf(target + comfort, 0.0, 100.0)
	var hap := float(n["happiness"])
	n["happiness"] = hap + clampf(target - hap, -3.0 * h, 3.0 * h)
	clamp_all(s)


## Sleep for `hours` with a quality multiplier (home bed ~1.0, bench ~0.55).
static func sleep(s: Dictionary, hours: float, quality: float) -> Dictionary:
	var gain := hours * 12.0 * quality
	tick(s, hours * 60.0, "sleep")
	var n: Dictionary = s["needs"]
	n["energy"] = float(n["energy"]) + gain
	n["health"] = float(n["health"]) + hours * 1.5 * quality
	if quality < 0.7:
		n["happiness"] = float(n["happiness"]) - 6.0
		n["hygiene"] = float(n["hygiene"]) - 10.0
	else:
		n["happiness"] = float(n["happiness"]) + 4.0 * quality
	clamp_all(s)
	return {"ok": true, "msg": "You slept for %d hours." % int(hours),
		"events": [{"name": "sleep", "quality": quality, "hours": hours}, {"name": "advance_time", "minutes": int(hours * 60.0)}]}


## Multiplier applied to work performance and friendship gain based on needs.
static func performance_mult(s: Dictionary) -> float:
	var m := 1.0
	var n: Dictionary = s["needs"]
	if float(n["happiness"]) < 25.0:
		m -= 0.12
	if float(n["energy"]) < 15.0:
		m -= 0.15
	if float(n["hunger"]) < 15.0 or float(n["thirst"]) < 15.0:
		m -= 0.1
	return clampf(m, 0.5, 1.0)


static func social_mult(s: Dictionary) -> float:
	return 0.5 if float(s["needs"]["hygiene"]) < 25.0 else 1.0


## Human-readable warnings for low needs (shown in the HUD).
static func warnings(s: Dictionary) -> Array:
	var out := []
	var n: Dictionary = s["needs"]
	if float(n["hunger"]) < 15.0:
		out.append("You're starving. Eat something!")
	if float(n["thirst"]) < 15.0:
		out.append("You're very thirsty. Have a drink!")
	if float(n["energy"]) < 12.0:
		out.append("You're exhausted. Get some sleep.")
	if float(n["hygiene"]) < 20.0:
		out.append("You smell. People are less friendly.")
	if float(n["health"]) < 25.0:
		out.append("Your health is low. Visit the hospital.")
	return out
