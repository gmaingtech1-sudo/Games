class_name ActionRouter
extends RefCounted
## Single entry point for every state-changing player action.
## In single-player GameManager calls apply() directly. In multiplayer the
## client sends the action name + params to the server, and the SERVER calls
## apply() on its own copy of that player's state, so clients can never edit
## their money or inventory directly.
##
## Returns {"ok": bool, "msg": String, "events": Array, ...}.

const ACTIONS := [
	"buy_item", "sell_item", "use_item", "equip", "unequip", "drop_item", "buy_service",
	"deposit", "withdraw",
	"apply_job", "quit_job", "work_shift", "take_course",
	"rent_property", "buy_property", "sell_property", "end_rent", "set_home", "upgrade_property",
	"place_furniture", "remove_furniture", "decorate", "sleep", "shower",
	"buy_vehicle", "sell_vehicle", "paint_vehicle", "upgrade_engine", "repair_vehicle",
	"refuel_vehicle", "use_vehicle_part", "vehicle_report", "tow_vehicle", "set_active_vehicle",
	"buy_business", "sell_business", "hire_staff", "fire_staff", "buy_stock", "set_price",
	"upgrade_business", "collect_profit",
	"npc_talk", "npc_gift",
	"claim_mission", "start_challenge", "abandon_challenge", "race_result",
	"hospital_revive", "find_collectible",
]


static func apply(s: Dictionary, action: String, p: Dictionary, ctx: Dictionary = {}) -> Dictionary:
	if not (action in ACTIONS):
		return {"ok": false, "msg": "Unknown action: " + action, "events": []}
	var r: Dictionary = _dispatch(s, action, p, ctx)
	if not r.has("events"):
		r["events"] = []
	if not r.has("msg"):
		r["msg"] = ""
	if r.get("ok", false):
		for ev in r["events"]:
			ChallengeRules.on_event(s, ev)
		r["events"].append_array(ChallengeRules.evaluate(s))
	r["action"] = action
	r["params"] = p
	return r


static func _s(p: Dictionary, k: String, def: String = "") -> String:
	return str(p.get(k, def))


static func _i(p: Dictionary, k: String, def: int = 0) -> int:
	var v = p.get(k, def)
	if typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT:
		return int(v)
	if typeof(v) == TYPE_STRING and str(v).is_valid_int():
		return int(v)
	return def


static func _f(p: Dictionary, k: String, def: float = 0.0) -> float:
	var v = p.get(k, def)
	if typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT:
		return float(v)
	return def


static func _dispatch(s: Dictionary, action: String, p: Dictionary, ctx: Dictionary) -> Dictionary:
	match action:
		"buy_item":
			return InventoryRules.buy(s, _s(p, "id"), _i(p, "qty", 1), _s(p, "shop"), _s(p, "method", "auto"))
		"sell_item":
			return InventoryRules.sell(s, _s(p, "id"), _i(p, "qty", 1))
		"use_item":
			return InventoryRules.use(s, _s(p, "id"))
		"equip":
			return InventoryRules.equip(s, _s(p, "id"))
		"unequip":
			return InventoryRules.unequip(s, _s(p, "slot"))
		"drop_item":
			return InventoryRules.drop(s, _s(p, "id"), _i(p, "qty", 1))
		"buy_service":
			return buy_service(s, _s(p, "id"), _s(p, "method", "auto"))
		"deposit":
			return EconomyRules.deposit(s, _i(p, "amount"))
		"withdraw":
			return EconomyRules.withdraw(s, _i(p, "amount"))
		"apply_job":
			return JobRules.apply(s, _s(p, "id"))
		"quit_job":
			return JobRules.quit(s)
		"work_shift":
			return JobRules.work_shift(s, _f(p, "perf"), ctx)
		"take_course":
			return JobRules.take_course(s, _s(p, "id"))
		"rent_property":
			return PropertyRules.rent(s, _s(p, "id"))
		"buy_property":
			return PropertyRules.buy(s, _s(p, "id"))
		"sell_property":
			return PropertyRules.sell(s, _s(p, "id"))
		"end_rent":
			return PropertyRules.end_rent(s, _s(p, "id"))
		"set_home":
			return PropertyRules.set_home(s, _s(p, "id"))
		"upgrade_property":
			return PropertyRules.upgrade(s, _s(p, "id"))
		"place_furniture":
			return PropertyRules.place_furniture(s, _s(p, "id"), _s(p, "item"))
		"remove_furniture":
			return PropertyRules.remove_furniture(s, _s(p, "id"), _i(p, "index", -1))
		"decorate":
			return PropertyRules.decorate(s, _s(p, "id"), _i(p, "wall"), _i(p, "floor"))
		"sleep":
			return sleep(s, _s(p, "place", "home"), clampf(_f(p, "hours", 8.0), 1.0, 12.0))
		"shower":
			if s["home"] == "":
				return {"ok": false, "msg": "You need a home with a shower."}
			s["needs"]["hygiene"] = 100.0
			NeedsRules.apply_effects(s, {"happiness": 3.0})
			return {"ok": true, "msg": "Squeaky clean!", "events": [{"name": "shower"}, {"name": "needs_delta", "set": {"hygiene": 100.0}, "delta": {"happiness": 3.0}}, {"name": "advance_time", "minutes": 15}]}
		"buy_vehicle":
			return VehicleRules.buy(s, _s(p, "id"), _s(p, "color"))
		"sell_vehicle":
			return VehicleRules.sell(s, _s(p, "uid"))
		"paint_vehicle":
			return VehicleRules.paint(s, _s(p, "uid"), _s(p, "color"))
		"upgrade_engine":
			return VehicleRules.upgrade_engine(s, _s(p, "uid"))
		"repair_vehicle":
			return VehicleRules.repair(s, _s(p, "uid"))
		"refuel_vehicle":
			return VehicleRules.refuel(s, _s(p, "uid"))
		"use_vehicle_part":
			return VehicleRules.use_part(s, _s(p, "uid"), _s(p, "item"))
		"vehicle_report":
			var pos = p.get("pos", [])
			return VehicleRules.report(s, _s(p, "uid"), _f(p, "fuel"), _f(p, "damage"), _f(p, "odo"), pos if typeof(pos) == TYPE_ARRAY else [], _f(p, "rot"))
		"tow_vehicle":
			return VehicleRules.tow(s, _s(p, "uid"))
		"set_active_vehicle":
			if VehicleRules.find(s, _s(p, "uid")).is_empty():
				return {"ok": false, "msg": "Unknown vehicle."}
			s["active_vehicle"] = _s(p, "uid")
			return {"ok": true, "msg": "", "quiet": true}
		"buy_business":
			return BusinessRules.buy(s, _s(p, "id"))
		"sell_business":
			return BusinessRules.sell(s, _s(p, "id"))
		"hire_staff":
			return BusinessRules.hire(s, _s(p, "id"))
		"fire_staff":
			return BusinessRules.fire(s, _s(p, "id"))
		"buy_stock":
			return BusinessRules.buy_stock(s, _s(p, "id"), _i(p, "units"))
		"set_price":
			return BusinessRules.set_price(s, _s(p, "id"), _i(p, "level", 1))
		"upgrade_business":
			return BusinessRules.upgrade(s, _s(p, "id"))
		"collect_profit":
			return BusinessRules.collect(s, _s(p, "id"))
		"npc_talk":
			return RelationshipRules.talk(s, _s(p, "id"), _s(p, "kind", "chat"))
		"npc_gift":
			return RelationshipRules.gift(s, _s(p, "id"), _s(p, "item"))
		"claim_mission":
			return MissionRules.claim(s, _s(p, "id"))
		"start_challenge":
			return ChallengeRules.start(s, _s(p, "id"), _s(p, "difficulty", "normal"))
		"abandon_challenge":
			return ChallengeRules.abandon(s, _s(p, "id"))
		"race_result":
			return ChallengeRules.race_result(s, _i(p, "position", 4), _f(p, "seconds"))
		"hospital_revive":
			return hospital_revive(s)
		"find_collectible":
			return find_collectible(s, _s(p, "spot"))
	return {"ok": false, "msg": "Unhandled action."}


static func buy_service(s: Dictionary, id: String, method: String) -> Dictionary:
	var sv: Dictionary = DataDB.services.get(id, {})
	if sv.is_empty():
		return {"ok": false, "msg": "Unknown service."}
	var price := DataDB.to_pence(sv["price"])
	if not EconomyRules.pay(s, price, str(sv["name"]), method, "services"):
		return {"ok": false, "msg": "You can't afford that (" + Money.fmt(price) + ")."}
	var effects: Dictionary = sv.get("effects", {})
	NeedsRules.apply_effects(s, effects)
	s["stats"]["services"] = int(s["stats"].get("services", 0)) + 1
	var events := [{"name": "service", "id": id, "shop": sv["shop"], "count": 1}, {"name": "needs_delta", "delta": effects}]
	var minutes := int(sv.get("minutes", 45))
	events.append({"name": "advance_time", "minutes": minutes})
	if sv["shop"] == "hostel":
		events.append({"name": "sleep", "quality": 0.85, "hours": minutes / 60.0, "place": "hostel"})
	return {"ok": true, "msg": "Enjoyed: " + str(sv["name"]) + " (" + Money.fmt(price) + ")", "events": events}


static func sleep(s: Dictionary, place: String, hours: float) -> Dictionary:
	var quality := 0.55
	if place == "home":
		var rec := PropertyRules.find(s, s["home"])
		if rec.is_empty():
			return {"ok": false, "msg": "You don't have a home. Try a park bench or the hostel."}
		quality = PropertyRules.sleep_quality(rec)
	elif place != "bench":
		return {"ok": false, "msg": "You can't sleep here."}
	var before: Dictionary = s["needs"].duplicate()
	var r := NeedsRules.sleep(s, hours, quality)
	var setv := {}
	for k in s["needs"]:
		setv[k] = s["needs"][k]
	r["events"].append({"name": "needs_delta", "set": setv, "before": before})
	r["events"][0]["place"] = place
	return r


static func hospital_revive(s: Dictionary) -> Dictionary:
	if float(s["needs"]["health"]) > 5.0:
		return {"ok": false, "msg": "You're fine."}
	var bill := 10000
	EconomyRules.charge_bill(s, bill, "St. Aurelia Hospital: emergency care")
	s["needs"]["health"] = 55.0
	s["needs"]["hunger"] = maxf(float(s["needs"]["hunger"]), 45.0)
	s["needs"]["thirst"] = maxf(float(s["needs"]["thirst"]), 45.0)
	s["needs"]["energy"] = maxf(float(s["needs"]["energy"]), 40.0)
	PlayerState.add_message(s, "St. Aurelia Hospital", "You were brought in after collapsing. Please look after yourself! A bill of %s was taken from your account." % Money.fmt(bill))
	return {"ok": true, "msg": "You woke up in hospital.", "events": [{"name": "needs_delta", "set": s["needs"].duplicate()}, {"name": "advance_time", "minutes": 240}, {"name": "hospitalised"}]}


## Hidden collectibles around the city. Each spot can be found once per save.
const COLLECTIBLE_SPOTS := {
	"c_park_bench": "old_coin", "c_fountain": "old_coin", "c_alley": "vinyl_record",
	"c_dock": "old_coin", "c_rooftop": "vinyl_record", "c_plaza": "postcard",
	"c_depot": "old_coin", "c_hill": "vinyl_record", "c_college": "postcard", "c_stadium": "old_coin",
}


static func find_collectible(s: Dictionary, spot: String) -> Dictionary:
	if not COLLECTIBLE_SPOTS.has(spot):
		return {"ok": false, "msg": ""}
	var key := "spot:" + spot
	if key in s["claimed"]:
		return {"ok": false, "msg": "", "quiet": true}
	var item: String = COLLECTIBLE_SPOTS[spot]
	if not InventoryRules.add_item(s, item, 1):
		return {"ok": false, "msg": "Inventory full! Make space to pick this up."}
	s["claimed"].append(key)
	return {"ok": true, "msg": "You found: " + DataDB.item_name(item) + "!", "events": [{"name": "collectible", "id": item}]}


## Once per in-game day: rent, bills, businesses, challenges, relationships.
static func daily_tick(s: Dictionary, rng_seed: int = -1) -> Array:
	var events := []
	events.append_array(PropertyRules.daily(s))
	events.append_array(BusinessRules.daily(s, rng_seed))
	events.append_array(ChallengeRules.daily(s, rng_seed))
	RelationshipRules.daily(s)
	return events
