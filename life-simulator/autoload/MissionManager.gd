extends Node
## Tracks mission objectives from game events and state, unlocks the main story
## chain, rolls daily missions, and claims rewards through GameManager.act()
## (so the reward amount is validated by the rules / server).

signal missions_changed
signal mission_completed(id: String)

# Objectives that are checked against the current state instead of counted from events.
const STATE_TYPES := ["net_worth", "friends", "smart_outfit", "stat_above", "staff_total", "jobs_held",
	"visit", "acquire_property", "get_job", "buy_vehicle", "buy_business", "course_complete", "promotion"]
# Objectives whose event carries an amount in pence, counted in pounds.
const AMOUNT_TYPES := ["collect_profit", "deposit", "earn"]

var _check_timer := 0.0
var _claiming := {}


func _ready() -> void:
	GameManager.game_event.connect(_on_event)
	GameManager.state_changed.connect(func(): _check_timer = minf(_check_timer, 0.3))
	GameManager.action_completed.connect(_on_action_completed)


func _on_action_completed(r: Dictionary) -> void:
	if r.get("action", "") != "claim_mission" or r.get("ok", false):
		return
	var id := str(r.get("params", {}).get("id", ""))
	if "already" in str(r.get("msg", "")):
		_on_claimed(id)
	_claiming.erase(id)


func _process(delta: float) -> void:
	if not GameManager.in_game:
		return
	_check_timer -= delta
	if _check_timer <= 0.0:
		_check_timer = 1.5
		_check_state_objectives()


func m() -> Dictionary:
	return GameManager.state["missions"]


func on_new_game() -> void:
	refresh_available()
	refresh_daily()
	m()["tracked"] = "main_01"


func on_loaded() -> void:
	refresh_available()
	refresh_daily()


func definition(id: String) -> Dictionary:
	return MissionRules.def(id)


func is_completed(id: String) -> bool:
	return id in m()["completed"]


## Activates every mission whose prerequisites are met (NPC missions need accepting).
func refresh_available() -> void:
	if GameManager.state.is_empty():
		return
	var active: Dictionary = m()["active"]
	for id in DataDB.mission_order:
		var d: Dictionary = DataDB.missions[id]
		if active.has(id) or is_completed(id):
			continue
		if d.get("category") == "npc":
			continue
		var ok := true
		for req in d.get("requires", []):
			if not is_completed(req):
				ok = false
		if ok:
			_activate(id)
	if str(m()["tracked"]) == "" or not active.has(str(m()["tracked"])):
		m()["tracked"] = _default_tracked()
	missions_changed.emit()


func _default_tracked() -> String:
	for id in m()["active"]:
		if DataDB.missions.get(id, {}).get("category") == "main":
			return id
	for id in m()["active"]:
		return id
	return ""


func _activate(id: String, day: int = -1) -> void:
	var d := definition(id)
	var prog := []
	for _o in d.get("objectives", []):
		prog.append(0.0)
	m()["active"][id] = {"progress": prog, "done": false, "day": day}


func refresh_daily() -> void:
	if GameManager.state.is_empty():
		return
	var day := int(GameManager.state["world"]["day"])
	if int(m()["daily_day"]) == day:
		return
	# Drop yesterday's dailies.
	for id in m()["active"].keys():
		if DataDB.daily_pool.has(id):
			m()["active"].erase(id)
	m()["daily_day"] = day
	m()["daily"] = MissionRules.daily_for_day(day)
	for id in m()["daily"]:
		_activate(id, day)
	missions_changed.emit()


func npc_mission_for(npc_id: String) -> String:
	for id in DataDB.mission_order:
		var d: Dictionary = DataDB.missions[id]
		if d.get("giver", "") == npc_id and not is_completed(id):
			return id
	return ""


func npc_mission_available(npc_id: String) -> bool:
	var id := npc_mission_for(npc_id)
	if id == "" or m()["active"].has(id):
		return false
	var need := float(DataDB.missions[id].get("min_friendship", 0))
	return RelationshipRules.friendship(GameManager.state, npc_id) >= need


func accept_npc_mission(npc_id: String) -> String:
	var id := npc_mission_for(npc_id)
	if id == "" or m()["active"].has(id):
		return ""
	_activate(id)
	m()["tracked"] = id
	missions_changed.emit()
	GameManager.toast("New mission: " + str(DataDB.missions[id]["title"]), "info")
	AudioManager.play_sfx("notify")
	return id


func track(id: String) -> void:
	if m()["active"].has(id):
		m()["tracked"] = id
		missions_changed.emit()


func active_list() -> Array:
	var out := []
	for id in m()["active"]:
		out.append(id)
	return out


func objective_progress(id: String, i: int) -> float:
	var a: Dictionary = m()["active"].get(id, {})
	if a.is_empty():
		return 0.0
	return float(a["progress"][i])


# ------------------------------------------------------------------ matching

func _target_matches(target: String, ev: Dictionary) -> bool:
	if target == "*" or target == "":
		return true
	if target.begins_with("category:"):
		return ev.get("category", "") == target.substr(9)
	return str(ev.get("id", "")) == target or str(ev.get("mode", "")) == target or str(ev.get("place", "")) == target


func _on_event(ev: Dictionary) -> void:
	if GameManager.state.is_empty():
		return
	var name: String = ev.get("name", "")
	if name == "mission_claimed":
		_on_claimed(str(ev["id"]))
		return
	var any_changed := false
	for id in m()["active"].keys():
		var changed := false
		var a: Dictionary = m()["active"][id]
		if a["done"]:
			continue
		var d := definition(id)
		var objs: Array = d.get("objectives", [])
		for i in objs.size():
			var o: Dictionary = objs[i]
			var t: String = o["type"]
			if t in STATE_TYPES:
				continue
			var add := 0.0
			if t == "work_perf":
				if name == "work_shift" and float(ev.get("perf", 0)) * 100.0 >= float(o["target"]):
					add = 1.0
			elif t == "time_trial":
				if name == "time_trial" and ev.get("id", "") == o["target"] and float(ev.get("seconds", 9999)) <= float(o["count"]):
					add = float(o["count"])
			elif t == "give_item":
				if name == "give_item" and ev.get("id", "") == o["target"] and ev.get("npc", "") == d.get("giver", ""):
					add = float(ev.get("count", 1))
			elif t == "sleep":
				if name == "sleep" and _target_matches(o["target"], ev):
					add = 1.0
			elif t == name and _target_matches(o["target"], ev):
				if t in AMOUNT_TYPES:
					add = float(ev.get("amount", 0)) / 100.0
				else:
					add = float(ev.get("count", 1))
			if add > 0.0:
				a["progress"][i] = minf(float(o["count"]), float(a["progress"][i]) + add)
				changed = true
		if changed:
			any_changed = true
			_check_done(id)
	if any_changed:
		missions_changed.emit()


func _state_value(o: Dictionary) -> float:
	var s := GameManager.state
	var t: String = o["type"]
	var target: String = str(o.get("target", "*"))
	match t:
		"net_worth":
			return PlayerState.net_worth(s) / 100.0
		"friends":
			return float(RelationshipRules.count_at_least(s, float(target)))
		"smart_outfit":
			return 1.0 if InventoryRules.wearing_smart_outfit(s) else 0.0
		"stat_above":
			return float(o["count"]) if float(s["needs"].get(target, 0)) >= float(o["count"]) else 0.0
		"staff_total":
			var n := 0
			for b in s["businesses"]:
				n += int(b["staff"])
			return float(n)
		"jobs_held":
			return float(s["jobs_held"].size())
		"visit":
			var lst: Array = s["stats"]["districts"] if target.begins_with("district:") else s["stats"]["visited"]
			return 1.0 if target in lst else 0.0
		"acquire_property":
			for p in s["properties"]:
				if target == "*" or p["mode"] == target:
					return 1.0
			return 0.0
		"get_job":
			return 1.0 if s["job"]["id"] != "" and (target == "*" or s["job"]["id"] == target) else 0.0
		"buy_vehicle":
			return float(s["vehicles"].size())
		"buy_business":
			return float(s["businesses"].size())
		"course_complete":
			if target == "*":
				return float(s["qualifications"].size())
			return 1.0 if target in s["qualifications"] else 0.0
		"promotion":
			return float(s["stats"].get("promotions", 0))
	return 0.0


func _check_state_objectives() -> void:
	if GameManager.state.is_empty():
		return
	var changed := false
	for id in m()["active"].keys():
		var a: Dictionary = m()["active"][id]
		if a["done"]:
			if not _claiming.has(id):
				_claim(id)
			continue
		var objs: Array = definition(id).get("objectives", [])
		for i in objs.size():
			var o: Dictionary = objs[i]
			if o["type"] in STATE_TYPES:
				var v := minf(float(o["count"]), _state_value(o))
				if v > float(a["progress"][i]):
					a["progress"][i] = v
					changed = true
		if changed:
			_check_done(id)
	if changed:
		missions_changed.emit()


func _check_done(id: String) -> void:
	var a: Dictionary = m()["active"][id]
	var objs: Array = definition(id).get("objectives", [])
	for i in objs.size():
		if float(a["progress"][i]) < float(objs[i]["count"]):
			return
	a["done"] = true
	_claim(id)


func _claim(id: String) -> void:
	_claiming[id] = true
	# Failures (e.g. already claimed after a reload) are handled in _on_action_completed.
	GameManager.act("claim_mission", {"id": id})


func _on_claimed(id: String) -> void:
	_claiming.erase(id)
	if not m()["active"].has(id):
		return
	m()["active"].erase(id)
	if not DataDB.daily_pool.has(id):
		m()["completed"].append(id)
	GameManager.state["stats"]["missions_completed"] = int(GameManager.state["stats"]["missions_completed"]) + 1
	if m()["tracked"] == id:
		m()["tracked"] = ""
	AudioManager.play_sfx("mission")
	mission_completed.emit(id)
	refresh_available()


# ------------------------------------------------------------------ waypoints

## Rough location to guide the player for a mission's next objective (for the map).
func objective_location(id: String) -> String:
	var d := definition(id)
	var a: Dictionary = m()["active"].get(id, {})
	if a.is_empty():
		return ""
	var objs: Array = d.get("objectives", [])
	for i in objs.size():
		if float(a["progress"][i]) >= float(objs[i]["count"]):
			continue
		var o: Dictionary = objs[i]
		var target := str(o.get("target", ""))
		match o["type"]:
			"buy_item", "use_item":
				if "food" in target or "drink" in target:
					return "supermarket"
				if target == "games_console":
					return "tech"
				return "supermarket"
			"get_job":
				return "city_hall"
			"work_shift", "work_perf", "promotion":
				var job := JobRules.job_def(GameManager.state["job"]["id"])
				return job.get("workplace", "city_hall")
			"acquire_property":
				return "estate_agent"
			"place_furniture":
				return "furniture"
			"sleep":
				return "home"
			"course_complete":
				return "college"
			"buy_vehicle":
				return "dealership"
			"buy_business", "collect_profit":
				return "business_centre"
			"visit":
				return target.replace("district:", "district_")
			"service":
				return "gym" if target == "gym_session" else "restaurant"
			"customise_vehicle":
				return "garage"
			"give_item", "time_trial":
				return "npc:" + str(d.get("giver", "")) if o["type"] == "give_item" else "events"
			"smart_outfit":
				return "clothing"
			"deposit":
				return "bank"
	return ""
