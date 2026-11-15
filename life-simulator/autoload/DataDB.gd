extends Node
## Loads every static game-data table (items, jobs, vehicles, properties,
## businesses, NPCs, missions, challenges, achievements) from JSON in res://resources.
## All prices in the JSON are in pounds; the rest of the game works in pence (int)
## to avoid floating point rounding problems, so use DataDB.price_p() for money.

var items: Dictionary = {}          # id -> item dict
var categories: Dictionary = {}
var services: Dictionary = {}
var starting_inventory: Array = []
var jobs: Dictionary = {}
var job_order: Array = []
var courses: Dictionary = {}
var vehicles: Dictionary = {}
var vehicle_order: Array = []
var vehicle_meta: Dictionary = {}
var properties: Dictionary = {}
var property_order: Array = []
var property_meta: Dictionary = {}
var businesses: Dictionary = {}
var business_order: Array = []
var business_meta: Dictionary = {}
var npcs: Dictionary = {}
var npc_order: Array = []
var friendship_levels: Array = []
var missions: Dictionary = {}
var mission_order: Array = []
var daily_pool: Dictionary = {}
var challenges: Dictionary = {}
var achievements: Dictionary = {}
var achievement_order: Array = []
var load_errors: Array = []


func _init() -> void:
	reload()


func reload() -> void:
	load_errors.clear()
	var d := _load("res://resources/items/items.json")
	categories = d.get("categories", {})
	items = _index(d.get("items", []))
	services = _index(d.get("services", []))
	starting_inventory = d.get("starting_inventory", [])

	d = _load("res://resources/jobs/jobs.json")
	jobs = _index(d.get("jobs", []))
	job_order = _ids(d.get("jobs", []))
	courses = _index(d.get("courses", []))

	d = _load("res://resources/vehicles/vehicles.json")
	vehicles = _index(d.get("vehicles", []))
	vehicle_order = _ids(d.get("vehicles", []))
	vehicle_meta = d
	vehicle_meta.erase("vehicles")

	d = _load("res://resources/properties/properties.json")
	properties = _index(d.get("properties", []))
	property_order = _ids(d.get("properties", []))
	property_meta = d
	property_meta.erase("properties")

	d = _load("res://resources/businesses/businesses.json")
	businesses = _index(d.get("businesses", []))
	business_order = _ids(d.get("businesses", []))
	business_meta = d
	business_meta.erase("businesses")

	d = _load("res://resources/npcs/npcs.json")
	npcs = _index(d.get("npcs", []))
	npc_order = _ids(d.get("npcs", []))
	friendship_levels = d.get("levels", [])

	d = _load("res://resources/missions/missions.json")
	missions = _index(d.get("missions", []))
	mission_order = _ids(d.get("missions", []))
	daily_pool = _index(d.get("daily_pool", []))
	for id in daily_pool:
		daily_pool[id]["category"] = "daily"

	d = _load("res://resources/missions/challenges.json")
	challenges = _index(d.get("challenges", []))

	d = _load("res://resources/achievements/achievements.json")
	achievements = _index(d.get("achievements", []))
	achievement_order = _ids(d.get("achievements", []))


func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		load_errors.append("Missing data file: " + path)
		push_error("Missing data file: " + path)
		return {}
	var txt := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(txt)
	if typeof(parsed) != TYPE_DICTIONARY:
		load_errors.append("Invalid JSON: " + path)
		push_error("Invalid JSON: " + path)
		return {}
	return parsed


func _index(arr: Array) -> Dictionary:
	var out := {}
	for e in arr:
		if typeof(e) == TYPE_DICTIONARY and e.has("id"):
			out[e["id"]] = e
	return out


func _ids(arr: Array) -> Array:
	var out := []
	for e in arr:
		if typeof(e) == TYPE_DICTIONARY and e.has("id"):
			out.append(e["id"])
	return out


# ---------------------------------------------------------------- helpers

## Converts a price in pounds (float from JSON) to integer pence.
static func to_pence(pounds) -> int:
	return int(round(float(pounds) * 100.0))


func item(id: String) -> Dictionary:
	return items.get(id, {})


func item_price_p(id: String) -> int:
	return to_pence(items.get(id, {}).get("price", 0))


func item_name(id: String) -> String:
	return str(items.get(id, {}).get("name", id))


func category_color(cat: String) -> Color:
	return Color(str(categories.get(cat, {}).get("color", "#888888")))


func items_for_shop(shop: String) -> Array:
	var out := []
	for id in items:
		var shops: Array = items[id].get("shops", [])
		if shop in shops:
			out.append(id)
	return out


func services_for_shop(shop: String) -> Array:
	var out := []
	for id in services:
		if services[id].get("shop", "") == shop:
			out.append(id)
	return out


func friendship_level_name(value: float) -> String:
	var name := "Stranger"
	for lv in friendship_levels:
		if value >= float(lv["min"]):
			name = lv["name"]
	return name


func all_missions_and_daily() -> Dictionary:
	var out := missions.duplicate()
	out.merge(daily_pool)
	return out
