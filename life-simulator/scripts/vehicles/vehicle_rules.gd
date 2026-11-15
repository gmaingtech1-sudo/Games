class_name VehicleRules
extends RefCounted
## Buying, selling, customising, repairing and refuelling vehicles.

const SELL_RATIO := 0.6


static func def(id: String) -> Dictionary:
	return DataDB.vehicles.get(id, {})


static func find(s: Dictionary, uid: String) -> Dictionary:
	for v in s["vehicles"]:
		if v["uid"] == uid:
			return v
	return {}


static func sell_value(v: Dictionary) -> int:
	var base := DataDB.to_pence(def(v["id"]).get("price", 0))
	var eng := 0
	for u in DataDB.vehicle_meta.get("engine_upgrades", []):
		if int(u["level"]) <= int(v.get("engine", 0)):
			eng += DataDB.to_pence(u["cost"])
	var cond := 1.0 - float(v.get("damage", 0)) / 200.0
	return int((base + eng * 0.5) * SELL_RATIO * cond)


static func top_speed(v: Dictionary) -> float:
	var d := def(v["id"])
	var bonus := 0.0
	for u in DataDB.vehicle_meta.get("engine_upgrades", []):
		if int(u["level"]) == int(v.get("engine", 0)):
			bonus = float(u["bonus"])
	var dmg := float(v.get("damage", 0))
	var dmg_mult := 1.0 if dmg < 50.0 else 1.0 - (dmg - 50.0) / 100.0
	return float(d.get("top_speed", 25)) * (1.0 + bonus) * dmg_mult


static func buy(s: Dictionary, id: String, color: String) -> Dictionary:
	var d := def(id)
	if d.is_empty():
		return {"ok": false, "msg": "Unknown vehicle."}
	if s["vehicles"].size() >= 6:
		return {"ok": false, "msg": "Your garage is full (6 vehicles). Sell one first."}
	if not (color in DataDB.vehicle_meta.get("colors", [])):
		color = DataDB.vehicle_meta["colors"][0]
	var price := DataDB.to_pence(d["price"])
	if not EconomyRules.pay(s, price, "Bought " + str(d["name"]), "bank", "vehicle"):
		return {"ok": false, "msg": "You need %s in the bank." % Money.fmt(price)}
	var uid := PlayerState.new_uid(s, "veh")
	s["vehicles"].append({"uid": uid, "id": id, "color": color, "engine": 0, "damage": 0.0,
		"fuel": float(d["fuel_capacity"]), "odo": 0.0, "pos": [], "rot": 0.0})
	if s["active_vehicle"] == "":
		s["active_vehicle"] = uid
	return {"ok": true, "msg": "You bought a " + str(d["name"]) + "! It's waiting on the dealership forecourt.", "uid": uid,
		"events": [{"name": "buy_vehicle", "id": id, "uid": uid}]}


static func sell(s: Dictionary, uid: String) -> Dictionary:
	var v := find(s, uid)
	if v.is_empty():
		return {"ok": false, "msg": "You don't own that vehicle."}
	var value := sell_value(v)
	s["vehicles"].erase(v)
	if s["active_vehicle"] == uid:
		s["active_vehicle"] = s["vehicles"][0]["uid"] if s["vehicles"].size() > 0 else ""
	EconomyRules.earn(s, value, "Sold " + str(def(v["id"])["name"]), "bank", "vehicle_sale")
	return {"ok": true, "msg": "Sold for " + Money.fmt(value), "events": [{"name": "sell_vehicle", "uid": uid}]}


static func paint(s: Dictionary, uid: String, color: String) -> Dictionary:
	var v := find(s, uid)
	if v.is_empty():
		return {"ok": false, "msg": "You don't own that vehicle."}
	if not (color in DataDB.vehicle_meta.get("colors", [])):
		return {"ok": false, "msg": "Unknown colour."}
	if v["color"] == color:
		return {"ok": false, "msg": "It's already that colour."}
	var cost := DataDB.to_pence(DataDB.vehicle_meta.get("paint_cost", 150))
	if not EconomyRules.pay(s, cost, "Respray", "auto", "vehicle"):
		return {"ok": false, "msg": "A respray costs " + Money.fmt(cost) + "."}
	v["color"] = color
	return {"ok": true, "msg": "Fresh paint job!", "events": [{"name": "customise_vehicle", "uid": uid}]}


static func engine_cost(v: Dictionary) -> int:
	for u in DataDB.vehicle_meta.get("engine_upgrades", []):
		if int(u["level"]) == int(v["engine"]) + 1:
			return DataDB.to_pence(u["cost"])
	return -1


static func upgrade_engine(s: Dictionary, uid: String) -> Dictionary:
	var v := find(s, uid)
	if v.is_empty():
		return {"ok": false, "msg": "You don't own that vehicle."}
	var cost := engine_cost(v)
	if cost < 0:
		return {"ok": false, "msg": "Engine is fully upgraded."}
	var used_part := false
	if InventoryRules.has(s, "turbo_part"):
		InventoryRules.remove_item(s, "turbo_part", 1)
		used_part = true
	elif not EconomyRules.pay(s, cost, "Engine upgrade", "auto", "vehicle"):
		return {"ok": false, "msg": "Engine upgrade costs " + Money.fmt(cost) + "."}
	v["engine"] = int(v["engine"]) + 1
	return {"ok": true, "msg": "Engine upgraded to stage %d%s!" % [int(v["engine"]), " (Turbo Kit fitted)" if used_part else ""],
		"events": [{"name": "customise_vehicle", "uid": uid}]}


static func repair_cost(v: Dictionary) -> int:
	return int(ceil(float(v["damage"]))) * DataDB.to_pence(DataDB.vehicle_meta.get("repair_cost_per_percent", 12))


static func repair(s: Dictionary, uid: String) -> Dictionary:
	var v := find(s, uid)
	if v.is_empty():
		return {"ok": false, "msg": "You don't own that vehicle."}
	if float(v["damage"]) <= 0.0:
		return {"ok": false, "msg": "No damage to repair."}
	var cost := repair_cost(v)
	if not EconomyRules.pay(s, cost, "Vehicle repair", "auto", "vehicle"):
		return {"ok": false, "msg": "Repairs cost " + Money.fmt(cost) + "."}
	v["damage"] = 0.0
	return {"ok": true, "msg": "Good as new!", "events": [{"name": "repair_vehicle", "uid": uid}]}


static func refuel_cost(v: Dictionary) -> int:
	var cap := float(def(v["id"])["fuel_capacity"])
	var litres := maxf(0.0, cap - float(v["fuel"]))
	return int(ceil(litres * float(DataDB.vehicle_meta.get("fuel_price_per_litre", 1.5)) * 100.0))


static func refuel(s: Dictionary, uid: String) -> Dictionary:
	var v := find(s, uid)
	if v.is_empty():
		return {"ok": false, "msg": "You don't own that vehicle."}
	var cost := refuel_cost(v)
	if cost <= 0:
		return {"ok": false, "msg": "The tank is already full."}
	if not EconomyRules.pay(s, cost, "Fuel", "auto", "fuel"):
		return {"ok": false, "msg": "A full tank costs " + Money.fmt(cost) + "."}
	v["fuel"] = float(def(v["id"])["fuel_capacity"])
	return {"ok": true, "msg": "Filled up for " + Money.fmt(cost), "events": [{"name": "refuel", "uid": uid}]}


## Use a vehicle-part item (fuel can / repair kit) on a vehicle.
static func use_part(s: Dictionary, uid: String, item_id: String) -> Dictionary:
	var v := find(s, uid)
	var it := DataDB.item(item_id)
	if v.is_empty() or not InventoryRules.has(s, item_id):
		return {"ok": false, "msg": "Can't do that."}
	match it.get("vehicle_use", ""):
		"fuel":
			var cap := float(def(v["id"])["fuel_capacity"])
			if float(v["fuel"]) >= cap:
				return {"ok": false, "msg": "Tank already full."}
			v["fuel"] = minf(cap, float(v["fuel"]) + 10.0)
		"repair":
			if float(v["damage"]) <= 0.0:
				return {"ok": false, "msg": "No damage to repair."}
			v["damage"] = maxf(0.0, float(v["damage"]) - 30.0)
		_:
			return {"ok": false, "msg": "Fit that at the garage."}
	InventoryRules.remove_item(s, item_id, 1)
	return {"ok": true, "msg": "Used " + str(it["name"]), "events": []}


## Client reports wear from driving. The server only accepts fuel going DOWN,
## damage going UP and a plausible distance, so it can't be used to cheat.
static func report(s: Dictionary, uid: String, fuel: float, damage: float, odo: float, pos: Array, rot: float) -> Dictionary:
	var v := find(s, uid)
	if v.is_empty():
		return {"ok": false, "msg": ""}
	v["fuel"] = clampf(minf(fuel, float(v["fuel"])), 0.0, float(def(v["id"])["fuel_capacity"]))
	v["damage"] = clampf(maxf(damage, float(v["damage"])), 0.0, 100.0)
	v["odo"] = maxf(float(v["odo"]), minf(odo, float(v["odo"]) + 5000.0))
	if pos.size() == 3:
		v["pos"] = [float(pos[0]), float(pos[1]), float(pos[2])]
		v["rot"] = rot
	return {"ok": true, "msg": "", "quiet": true}


static func tow(s: Dictionary, uid: String) -> Dictionary:
	var v := find(s, uid)
	if v.is_empty():
		return {"ok": false, "msg": "You don't own that vehicle."}
	var cost := DataDB.to_pence(DataDB.vehicle_meta.get("delivery_cost", 40))
	if not EconomyRules.pay(s, cost, "Vehicle delivery", "auto", "vehicle"):
		return {"ok": false, "msg": "Delivery costs " + Money.fmt(cost) + "."}
	v["pos"] = []
	if float(v["fuel"]) < 3.0:
		v["fuel"] = 3.0
	return {"ok": true, "msg": "Your vehicle is on its way to you.", "events": [{"name": "vehicle_delivered", "uid": uid}]}
