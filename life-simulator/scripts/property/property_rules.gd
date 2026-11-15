class_name PropertyRules
extends RefCounted
## Renting, buying, selling, upgrading and decorating homes, plus weekly rent/bills.


static func def(id: String) -> Dictionary:
	return DataDB.properties.get(id, {})


static func find(s: Dictionary, id: String) -> Dictionary:
	for p in s["properties"]:
		if p["id"] == id:
			return p
	return {}


static func upgrade_def(level: int) -> Dictionary:
	for u in DataDB.property_meta.get("upgrades", []):
		if int(u["level"]) == level:
			return u
	return {}


static func property_value(rec: Dictionary) -> int:
	var d := def(rec["id"])
	var base := DataDB.to_pence(d.get("price", 0))
	var bonus := 0.0
	for lv in range(1, int(rec.get("upgrade", 0)) + 1):
		bonus += float(upgrade_def(lv).get("cost_ratio", 0)) * 0.8
	return int(base * (1.0 + bonus))


static func slots(rec: Dictionary) -> int:
	var n := int(def(rec["id"]).get("slots", 4))
	for lv in range(1, int(rec.get("upgrade", 0)) + 1):
		n += int(upgrade_def(lv).get("slots", 0))
	return n


## Comfort affects sleep quality and happiness while at home.
static func comfort(rec: Dictionary) -> float:
	var c := float(def(rec["id"]).get("comfort", 5))
	for lv in range(1, int(rec.get("upgrade", 0)) + 1):
		c += float(upgrade_def(lv).get("comfort", 0))
	for f in rec.get("furniture", []):
		c += float(DataDB.item(f).get("comfort", 0))
	return c


static func sleep_quality(rec: Dictionary) -> float:
	var q := 0.85 + comfort(rec) / 120.0
	for f in rec.get("furniture", []):
		q += float(DataDB.item(f).get("sleep_bonus", 0)) / 100.0
	return clampf(q, 0.85, 1.4)


static func rent_p(id: String) -> int:
	return DataDB.to_pence(def(id).get("rent", 0))


static func rent(s: Dictionary, id: String) -> Dictionary:
	var d := def(id)
	if d.is_empty():
		return {"ok": false, "msg": "Unknown property."}
	if not find(s, id).is_empty():
		return {"ok": false, "msg": "You already have this property."}
	var weeks := int(DataDB.property_meta.get("rent_deposit_weeks", 1))
	var cost := rent_p(id) * (1 + weeks)
	if not EconomyRules.pay(s, cost, "Rent & deposit: " + str(d["name"]), "auto", "rent"):
		return {"ok": false, "msg": "You need %s for the first week's rent plus deposit." % Money.fmt(cost)}
	s["properties"].append({"id": id, "mode": "rent", "upgrade": 0, "furniture": [], "arrears": 0, "wall": 0, "floor": 0, "deposit": rent_p(id) * weeks})
	if s["home"] == "":
		s["home"] = id
	PlayerState.add_message(s, "Aisha Khan Lettings", "Keys to %s are ready! Rent of %s is taken from your bank every 7 days." % [d["name"], Money.fmt(rent_p(id))])
	return {"ok": true, "msg": "You're now renting " + str(d["name"]) + "!", "events": [{"name": "acquire_property", "id": id, "mode": "rent"}]}


static func buy(s: Dictionary, id: String) -> Dictionary:
	var d := def(id)
	if d.is_empty():
		return {"ok": false, "msg": "Unknown property."}
	var existing := find(s, id)
	if not existing.is_empty() and existing["mode"] == "own":
		return {"ok": false, "msg": "You already own this."}
	var price := DataDB.to_pence(d["price"])
	var refund := 0
	if not existing.is_empty():
		refund = int(existing.get("deposit", 0))   # renting tenants get their deposit back
	if not EconomyRules.can_pay(s, max(0, price - refund), "bank"):
		return {"ok": false, "msg": "You need %s in the bank to buy this." % Money.fmt(price - refund)}
	EconomyRules.pay(s, max(0, price - refund), "Purchased " + str(d["name"]), "bank", "property")
	if existing.is_empty():
		s["properties"].append({"id": id, "mode": "own", "upgrade": 0, "furniture": [], "arrears": 0, "wall": 0, "floor": 0, "deposit": 0})
	else:
		existing["mode"] = "own"
		existing["arrears"] = 0
		existing["deposit"] = 0
	if s["home"] == "":
		s["home"] = id
	return {"ok": true, "msg": "Congratulations! You own " + str(d["name"]) + ".", "events": [{"name": "acquire_property", "id": id, "mode": "own"}]}


static func sell(s: Dictionary, id: String) -> Dictionary:
	var rec := find(s, id)
	if rec.is_empty() or rec["mode"] != "own":
		return {"ok": false, "msg": "You don't own this property."}
	var value := int(property_value(rec) * float(DataDB.property_meta.get("sell_ratio", 0.92)))
	_return_furniture(s, rec)
	s["properties"].erase(rec)
	if s["home"] == id:
		s["home"] = s["properties"][0]["id"] if s["properties"].size() > 0 else ""
	EconomyRules.earn(s, value, "Sold " + str(def(id)["name"]), "bank", "property_sale")
	return {"ok": true, "msg": "Sold for " + Money.fmt(value) + ". Furniture moved to your inventory where it fits.", "events": [{"name": "sell_property", "id": id}]}


static func end_rent(s: Dictionary, id: String) -> Dictionary:
	var rec := find(s, id)
	if rec.is_empty() or rec["mode"] != "rent":
		return {"ok": false, "msg": "You're not renting this property."}
	_return_furniture(s, rec)
	var dep := int(rec.get("deposit", 0)) if int(rec.get("arrears", 0)) == 0 else 0
	s["properties"].erase(rec)
	if s["home"] == id:
		s["home"] = s["properties"][0]["id"] if s["properties"].size() > 0 else ""
	if dep > 0:
		EconomyRules.earn(s, dep, "Deposit returned", "bank", "refund")
	return {"ok": true, "msg": "Tenancy ended." + (" Deposit of %s returned." % Money.fmt(dep) if dep > 0 else ""), "events": []}


static func _return_furniture(s: Dictionary, rec: Dictionary) -> void:
	for f in rec.get("furniture", []):
		InventoryRules.add_item(s, f, 1)   # if the inventory is full the item is lost
	rec["furniture"] = []


static func set_home(s: Dictionary, id: String) -> Dictionary:
	if find(s, id).is_empty():
		return {"ok": false, "msg": "You don't live there."}
	s["home"] = id
	return {"ok": true, "msg": str(def(id)["name"]) + " is now your home."}


static func upgrade(s: Dictionary, id: String) -> Dictionary:
	var rec := find(s, id)
	if rec.is_empty() or rec["mode"] != "own":
		return {"ok": false, "msg": "You can only upgrade a property you own."}
	var next := int(rec["upgrade"]) + 1
	var u := upgrade_def(next)
	if u.is_empty():
		return {"ok": false, "msg": "Fully upgraded already."}
	var cost := int(DataDB.to_pence(def(id)["price"]) * float(u["cost_ratio"]))
	if not EconomyRules.pay(s, cost, "Upgrade: " + str(u["name"]), "bank", "property"):
		return {"ok": false, "msg": "This upgrade costs " + Money.fmt(cost) + " from your bank."}
	rec["upgrade"] = next
	return {"ok": true, "msg": str(u["name"]) + " finished!", "events": [{"name": "upgrade_property", "id": id}]}


static func upgrade_cost(rec: Dictionary) -> int:
	var u := upgrade_def(int(rec["upgrade"]) + 1)
	if u.is_empty():
		return -1
	return int(DataDB.to_pence(def(rec["id"])["price"]) * float(u["cost_ratio"]))


static func place_furniture(s: Dictionary, id: String, item_id: String) -> Dictionary:
	var rec := find(s, id)
	if rec.is_empty():
		return {"ok": false, "msg": "You don't live there."}
	if not DataDB.item(item_id).get("placeable", false):
		return {"ok": false, "msg": "That can't be placed."}
	if rec["furniture"].size() >= slots(rec):
		return {"ok": false, "msg": "No free space. Upgrade or remove something."}
	if not InventoryRules.remove_item(s, item_id, 1):
		return {"ok": false, "msg": "You don't have that item."}
	rec["furniture"].append(item_id)
	return {"ok": true, "msg": "Placed " + DataDB.item_name(item_id), "events": [{"name": "place_furniture", "id": item_id, "count": rec["furniture"].size()}]}


static func remove_furniture(s: Dictionary, id: String, index: int) -> Dictionary:
	var rec := find(s, id)
	if rec.is_empty() or index < 0 or index >= rec["furniture"].size():
		return {"ok": false, "msg": "Nothing there."}
	var item_id: String = rec["furniture"][index]
	if not InventoryRules.add_item(s, item_id, 1):
		return {"ok": false, "msg": "Your inventory is full."}
	rec["furniture"].remove_at(index)
	return {"ok": true, "msg": "Moved %s to your inventory." % DataDB.item_name(item_id)}


static func decorate(s: Dictionary, id: String, wall: int, floor_i: int) -> Dictionary:
	var rec := find(s, id)
	if rec.is_empty():
		return {"ok": false, "msg": "You don't live there."}
	var walls: Array = DataDB.property_meta.get("wall_colors", [])
	var floors: Array = DataDB.property_meta.get("floor_colors", [])
	rec["wall"] = clampi(wall, 0, max(0, walls.size() - 1))
	rec["floor"] = clampi(floor_i, 0, max(0, floors.size() - 1))
	return {"ok": true, "msg": "Redecorated!", "events": [{"name": "decorate"}]}


## Weekly rent and bills. Called once per in-game day.
static func daily(s: Dictionary) -> Array:
	var events := []
	var day := int(s["world"]["day"])
	if day % 7 != 0:
		return events
	var evicted := []
	for rec in s["properties"]:
		var d := def(rec["id"])
		if rec["mode"] == "rent":
			var r := rent_p(rec["id"])
			if EconomyRules.can_pay(s, r, "bank"):
				EconomyRules.pay(s, r, "Weekly rent: " + str(d["name"]), "bank", "rent")
				rec["arrears"] = 0
			else:
				rec["arrears"] = int(rec["arrears"]) + 1
				if int(rec["arrears"]) >= 3:
					evicted.append(rec)
				else:
					PlayerState.add_message(s, "Aisha Khan Lettings", "Your rent of %s for %s couldn't be paid. Please top up your bank (warning %d of 2)." % [Money.fmt(r), d["name"], int(rec["arrears"])])
		else:
			var bill := int(DataDB.to_pence(d["price"]) * float(DataDB.property_meta.get("bills_ratio", 0.0006)))
			EconomyRules.charge_bill(s, bill, "Council tax & utilities: " + str(d["name"]))
	for rec in evicted:
		_return_furniture(s, rec)
		s["properties"].erase(rec)
		if s["home"] == rec["id"]:
			s["home"] = s["properties"][0]["id"] if s["properties"].size() > 0 else ""
		PlayerState.add_message(s, "Aisha Khan Lettings", "After three missed payments your tenancy at %s has ended. Your furniture has been returned to you." % def(rec["id"])["name"])
		events.append({"name": "evicted", "id": rec["id"]})
	return events
