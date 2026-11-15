extends Node
## Achievements. Checked from the player state every couple of seconds.
## Unlocks are stored permanently in user://achievements.json (shared by all
## save slots, so they survive starting a new game) and in the save itself.

signal unlocked(id: String)

const PATH := "user://achievements.json"

var path := PATH             # tests point this somewhere else
var global_unlocked := {}   # id -> unix time
var _timer := 0.0


func _ready() -> void:
	_load()


func reload_store() -> void:
	_load()


func _load() -> void:
	global_unlocked.clear()
	if not FileAccess.file_exists(path):
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) == TYPE_DICTIONARY and typeof(parsed.get("unlocked")) == TYPE_DICTIONARY:
		for id in parsed["unlocked"]:
			if DataDB.achievements.has(id):
				global_unlocked[id] = parsed["unlocked"][id]


func _save() -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({"unlocked": global_unlocked}))


func is_unlocked(id: String) -> bool:
	return global_unlocked.has(id)


func sync_from_state() -> void:
	for id in GameManager.state.get("achievements", []):
		if DataDB.achievements.has(id) and not global_unlocked.has(id):
			global_unlocked[id] = Time.get_unix_time_from_system()
	_save()


func _process(delta: float) -> void:
	if not GameManager.in_game or GameManager.state.is_empty():
		return
	_timer += delta
	if _timer < 2.0:
		return
	_timer = 0.0
	check_all()


func check_all() -> void:
	var s := GameManager.state
	for id in DataDB.achievement_order:
		if id in s["achievements"]:
			continue
		var a: Dictionary = DataDB.achievements[id]
		if value_for(s, str(a["check"])) >= float(a["value"]):
			_unlock(id)


func _unlock(id: String) -> void:
	GameManager.state["achievements"].append(id)
	var first_time := not global_unlocked.has(id)
	if first_time:
		global_unlocked[id] = Time.get_unix_time_from_system()
		_save()
	GameManager.toast("Achievement unlocked: " + str(DataDB.achievements[id]["name"]), "achievement")
	AudioManager.play_sfx("achievement")
	Settings.vibrate(80)
	unlocked.emit(id)


## Current progress value for an achievement check.
static func value_for(s: Dictionary, check: String) -> float:
	if check.begins_with("challenge:"):
		var cid := check.substr(10)
		return 1.0 if not s["challenges"].get(cid, {}).get("wins", []).is_empty() else 0.0
	match check:
		"shifts":
			return float(s["stats"].get("shifts", 0))
		"vehicles":
			return float(s["vehicles"].size())
		"properties":
			return float(s["properties"].size())
		"owned_properties":
			var n := 0
			for p in s["properties"]:
				if p["mode"] == "own":
					n += 1
			return float(n)
		"net_worth":
			return PlayerState.net_worth(s) / 100.0
		"businesses":
			return float(s["businesses"].size())
		"missions_completed":
			return float(s["stats"].get("missions_completed", 0))
		"districts":
			return float(s["stats"]["districts"].size())
		"luxury":
			var home_ok := false
			for p in s["properties"]:
				if PropertyRules.def(p["id"]).get("type", "") in ["luxury_house", "mansion"]:
					home_ok = true
			var car_ok := false
			for v in s["vehicles"]:
				if DataDB.vehicles.get(v["id"], {}).get("luxury", false):
					car_ok = true
			var item_ok := false
			for e in s["inventory"]:
				if DataDB.item(e["id"]).get("luxury", false):
					item_ok = true
			return 1.0 if home_ok and car_ok and item_ok else 0.0
		"max_job_level":
			var best := int(s["job"]["level"]) if s["job"]["id"] != "" else 0
			for j in s["jobs_held"]:
				best = max(best, int(s["jobs_held"][j].get("level", 0)))
			return float(best)
		"best_friends":
			return float(RelationshipRules.count_at_least(s, 85.0))
		"friends":
			return float(RelationshipRules.count_at_least(s, 35.0))
		"distance_driven":
			return float(s["stats"].get("distance_driven", 0))
		"distance_walked":
			return float(s["stats"].get("distance_walked", 0))
		"degree":
			return 1.0 if ("business_degree" in s["qualifications"] or "medical_degree" in s["qualifications"]) else 0.0
		"clothing_owned":
			var ids := {}
			for e in s["inventory"]:
				if DataDB.item(e["id"]).get("category") == "clothing":
					ids[e["id"]] = true
			return float(ids.size())
		"max_furniture":
			var best := 0
			for p in s["properties"]:
				best = max(best, p["furniture"].size())
			return float(best)
		"collectibles":
			var ids := {}
			for e in s["inventory"]:
				if DataDB.item(e["id"]).get("category") == "collectibles":
					ids[e["id"]] = true
			return float(ids.size())
		"bank":
			return float(s["bank"]) / 100.0
	return 0.0
