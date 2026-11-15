class_name PlayerState
extends RefCounted
## Creates, validates and sanitises the player-state Dictionary.
## The state is a plain Dictionary so it can be saved as JSON and sent over the
## network unchanged. Every system reads and writes this one structure.

const VERSION := 1
const NEEDS := ["hunger", "thirst", "energy", "health", "hygiene", "happiness", "social"]
const START_CASH_P := 100000          # £1,000
const BASE_CAPACITY := 24
const MAX_TRANSACTIONS := 150
const MAX_MESSAGES := 60

## Keys the multiplayer server owns. When online, these are always replaced by
## the server's copy; the client is never trusted with them.
const SERVER_KEYS := ["cash", "bank", "transactions", "inventory", "equipped", "job", "jobs_held",
	"qualifications", "courses", "properties", "home", "vehicles", "businesses", "challenges",
	"claimed", "stats_server", "next_uid"]


static func default_appearance() -> Dictionary:
	return {"body": "masc", "hair": 1, "hair_color": "#3b2a20", "skin": 1, "eyes": "#3a2a1a"}


static func new_state(player_name: String = "Alex", appearance: Dictionary = {}) -> Dictionary:
	var app := default_appearance()
	app.merge(appearance, true)
	var s := {
		"version": VERSION,
		"name": player_name,
		"appearance": app,
		"cash": START_CASH_P,
		"bank": 0,
		"transactions": [],
		"needs": {"hunger": 80.0, "thirst": 80.0, "energy": 90.0, "health": 100.0, "hygiene": 85.0, "happiness": 70.0, "social": 60.0},
		"inventory": [],
		"equipped": {"top": "tshirt_white", "bottom": "joggers_grey", "shoes": "trainers_basic", "accessory": ""},
		"job": {"id": "", "level": 0, "xp": 0, "last_shift_day": -1, "shifts": 0},
		"jobs_held": {},
		"qualifications": [],
		"courses": {},
		"properties": [],
		"home": "",
		"vehicles": [],
		"active_vehicle": "",
		"businesses": [],
		"relationships": {},
		"missions": {"active": {}, "completed": [], "daily_day": -1, "daily": [], "tracked": ""},
		"claimed": [],
		"achievements": [],
		"challenges": {},
		"stats": {"missions_completed": 0, "distance_walked": 0.0, "distance_driven": 0.0, "districts": [],
			"visited": [], "items_bought": 0, "npc_talks": 0, "total_earned": 0, "profit_collected": 0,
			"shifts": 0, "promotions": 0, "deposited": 0, "services": 0},
		"stats_server": {"last_shift_msec": 0},
		"messages": [],
		"world": {"day": 1, "minute": 8 * 60, "weather": "sunny"},
		"position": [0.0, 1.0, 0.0],
		"rotation_y": 0.0,
		"next_uid": 1,
		"item_cooldowns": {},
	}
	for e in DataDB.starting_inventory:
		InventoryRules.add_item(s, e["id"], int(e["qty"]))
	return s


## Validates a loaded state. Returns {"ok": bool, "errors": [], "state": sanitised}.
## Missing keys are filled from defaults, wrong types are reset, values are clamped,
## and references to unknown items/jobs/etc. are dropped, so a damaged or edited
## save cannot crash the game.
static func validate(raw) -> Dictionary:
	var errors := []
	if typeof(raw) != TYPE_DICTIONARY:
		return {"ok": false, "errors": ["State is not a dictionary"], "state": {}}
	var base := new_state(str(raw.get("name", "Player")))
	var s: Dictionary = raw.duplicate(true)
	# Fill missing / mistyped top-level keys from the default state.
	for k in base:
		if not s.has(k):
			s[k] = base[k]
			errors.append("missing:" + k)
		elif typeof(s[k]) != typeof(base[k]) and not (_is_num(s[k]) and _is_num(base[k])):
			s[k] = base[k]
			errors.append("type:" + k)
	s["name"] = str(s["name"]).strip_edges().substr(0, 20)
	if s["name"] == "":
		s["name"] = "Player"
	s["cash"] = max(0, int(s["cash"]))
	s["bank"] = int(s["bank"])
	s["next_uid"] = max(1, int(s["next_uid"]))
	var app: Dictionary = default_appearance()
	if typeof(s["appearance"]) == TYPE_DICTIONARY:
		app.merge(s["appearance"], true)
	s["appearance"] = app
	# Needs
	var needs: Dictionary = base["needs"].duplicate()
	if typeof(s["needs"]) == TYPE_DICTIONARY:
		for n in NEEDS:
			if s["needs"].has(n) and _is_num(s["needs"][n]):
				needs[n] = clampf(float(s["needs"][n]), 0.0, 100.0)
	s["needs"] = needs
	# Inventory: only known items, positive quantities.
	var inv := []
	for e in s["inventory"]:
		if typeof(e) == TYPE_DICTIONARY and DataDB.items.has(str(e.get("id", ""))):
			var q := int(e.get("qty", 0))
			if q > 0:
				inv.append({"id": str(e["id"]), "qty": min(q, 999)})
		else:
			errors.append("bad_item")
	s["inventory"] = inv
	for slot in ["top", "bottom", "shoes", "accessory"]:
		if not s["equipped"].has(slot) or (str(s["equipped"][slot]) != "" and not DataDB.items.has(str(s["equipped"][slot]))):
			s["equipped"][slot] = base["equipped"][slot]
	# Job
	var job: Dictionary = base["job"].duplicate()
	job.merge(s["job"], true)
	if job["id"] != "" and not DataDB.jobs.has(job["id"]):
		job = base["job"].duplicate()
		errors.append("bad_job")
	job["level"] = clampi(int(job["level"]), 0, 3)
	s["job"] = job
	# Properties / vehicles / businesses: drop unknown ids.
	var props := []
	for p in s["properties"]:
		if typeof(p) == TYPE_DICTIONARY and DataDB.properties.has(str(p.get("id", ""))):
			var d := {"id": "", "mode": "rent", "upgrade": 0, "furniture": [], "arrears": 0, "wall": 0, "floor": 0}
			d.merge(p, true)
			d["upgrade"] = clampi(int(d["upgrade"]), 0, 3)
			props.append(d)
	s["properties"] = props
	var vehs := []
	for v in s["vehicles"]:
		if typeof(v) == TYPE_DICTIONARY and DataDB.vehicles.has(str(v.get("id", ""))):
			var d := {"uid": "", "id": "", "color": "#c0392b", "engine": 0, "damage": 0.0, "fuel": 20.0, "odo": 0.0, "pos": [], "rot": 0.0}
			d.merge(v, true)
			d["damage"] = clampf(float(d["damage"]), 0.0, 100.0)
			d["engine"] = clampi(int(d["engine"]), 0, 3)
			vehs.append(d)
	s["vehicles"] = vehs
	var bizs := []
	for b in s["businesses"]:
		if typeof(b) == TYPE_DICTIONARY and DataDB.businesses.has(str(b.get("id", ""))):
			var d := BusinessRules.new_business_record(str(b["id"]))
			d.merge(b, true)
			bizs.append(d)
	s["businesses"] = bizs
	# Missions
	var m: Dictionary = base["missions"].duplicate(true)
	if typeof(s["missions"]) == TYPE_DICTIONARY:
		m.merge(s["missions"], true)
	for k in ["active"]:
		if typeof(m[k]) != TYPE_DICTIONARY:
			m[k] = {}
	for k in ["completed", "daily"]:
		if typeof(m[k]) != TYPE_ARRAY:
			m[k] = []
	s["missions"] = m
	var st: Dictionary = base["stats"].duplicate(true)
	st.merge(s["stats"], true)
	s["stats"] = st
	var w: Dictionary = base["world"].duplicate()
	w.merge(s["world"], true)
	w["day"] = max(1, int(w["day"]))
	w["minute"] = clampi(int(w["minute"]), 0, 1439)
	s["world"] = w
	if typeof(s["position"]) != TYPE_ARRAY or s["position"].size() != 3:
		s["position"] = base["position"]
	if s["transactions"].size() > MAX_TRANSACTIONS:
		s["transactions"] = s["transactions"].slice(s["transactions"].size() - MAX_TRANSACTIONS)
	s["version"] = VERSION
	return {"ok": true, "errors": errors, "state": s}


static func _is_num(v) -> bool:
	return typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT


static func now_abs(s: Dictionary) -> int:
	return int(s["world"]["day"]) * 1440 + int(s["world"]["minute"])


static func add_message(s: Dictionary, from: String, text: String) -> void:
	s["messages"].append({"from": from, "text": text, "day": s["world"]["day"], "minute": s["world"]["minute"], "read": false})
	if s["messages"].size() > MAX_MESSAGES:
		s["messages"].pop_front()


static func new_uid(s: Dictionary, prefix: String) -> String:
	var n := int(s["next_uid"])
	s["next_uid"] = n + 1
	return "%s%d" % [prefix, n]


## Sum of cash, bank, property values, vehicle values and business values (pence).
static func net_worth(s: Dictionary) -> int:
	var total: int = int(s["cash"]) + int(s["bank"])
	for p in s["properties"]:
		if p["mode"] == "own":
			total += PropertyRules.property_value(p)
	for v in s["vehicles"]:
		total += VehicleRules.sell_value(v)
	for b in s["businesses"]:
		total += BusinessRules.business_value(b) + int(b.get("unpaid_profit", 0))
	return total
