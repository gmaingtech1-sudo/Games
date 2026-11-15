class_name InventoryRules
extends RefCounted
## Inventory with stacking and slot capacity. Each stack uses one slot and can
## hold up to the item's "stack" size. All buying/selling is validated here.

const SELL_RATIO := 0.5
const ONLINE_DELIVERY_P := 200   # £2 delivery fee for phone shopping


static func capacity(s: Dictionary) -> int:
	var cap := PlayerState.BASE_CAPACITY
	for e in s["inventory"]:
		var it := DataDB.item(e["id"])
		cap += int(it.get("capacity_bonus", 0))
	return cap


static func used_slots(s: Dictionary) -> int:
	return s["inventory"].size()


static func count(s: Dictionary, id: String) -> int:
	var n := 0
	for e in s["inventory"]:
		if e["id"] == id:
			n += int(e["qty"])
	return n


static func has(s: Dictionary, id: String, qty: int = 1) -> bool:
	return count(s, id) >= qty


## How many new slots adding qty of id would need.
static func slots_needed(s: Dictionary, id: String, qty: int) -> int:
	var stack: int = max(1, int(DataDB.item(id).get("stack", 1)))
	var remaining := qty
	for e in s["inventory"]:
		if e["id"] == id and int(e["qty"]) < stack:
			remaining -= stack - int(e["qty"])
	if remaining <= 0:
		return 0
	return int(ceil(float(remaining) / float(stack)))


static func can_add(s: Dictionary, id: String, qty: int) -> bool:
	if not DataDB.items.has(id) or qty <= 0:
		return false
	return used_slots(s) + slots_needed(s, id, qty) <= capacity(s)


## Adds items (all or nothing). Returns false if unknown item or not enough space.
static func add_item(s: Dictionary, id: String, qty: int) -> bool:
	if not can_add(s, id, qty):
		return false
	var stack: int = max(1, int(DataDB.item(id).get("stack", 1)))
	var remaining := qty
	for e in s["inventory"]:
		if remaining <= 0:
			break
		if e["id"] == id and int(e["qty"]) < stack:
			var add: int = min(stack - int(e["qty"]), remaining)
			e["qty"] = int(e["qty"]) + add
			remaining -= add
	while remaining > 0:
		var add: int = min(stack, remaining)
		s["inventory"].append({"id": id, "qty": add})
		remaining -= add
	return true


static func remove_item(s: Dictionary, id: String, qty: int) -> bool:
	if qty <= 0 or count(s, id) < qty:
		return false
	var remaining := qty
	# Remove from the smallest stacks first, from the end.
	for i in range(s["inventory"].size() - 1, -1, -1):
		if remaining <= 0:
			break
		var e: Dictionary = s["inventory"][i]
		if e["id"] != id:
			continue
		var take: int = min(int(e["qty"]), remaining)
		e["qty"] = int(e["qty"]) - take
		remaining -= take
		if int(e["qty"]) <= 0:
			s["inventory"].remove_at(i)
	return true


static func is_equipped(s: Dictionary, id: String) -> bool:
	for slot in s["equipped"]:
		if s["equipped"][slot] == id:
			return true
	return false


static func buy(s: Dictionary, id: String, qty: int, shop: String, method: String = "auto") -> Dictionary:
	var it := DataDB.item(id)
	if it.is_empty():
		return {"ok": false, "msg": "That item doesn't exist."}
	if qty <= 0 or qty > 99:
		return {"ok": false, "msg": "Invalid quantity."}
	if not (shop in it.get("shops", [])):
		return {"ok": false, "msg": "This shop doesn't sell that."}
	var total := DataDB.item_price_p(id) * qty
	if shop == "online":
		if not has(s, "phone_smart"):
			total += ONLINE_DELIVERY_P
		method = "bank"
	if not can_add(s, id, qty):
		return {"ok": false, "msg": "Your inventory is full."}
	if not EconomyRules.pay(s, total, "Bought %dx %s" % [qty, it["name"]], method, "shopping"):
		return {"ok": false, "msg": "You can't afford that (" + Money.fmt(total) + ")."}
	add_item(s, id, qty)
	s["stats"]["items_bought"] = int(s["stats"].get("items_bought", 0)) + qty
	return {"ok": true, "msg": "Bought %dx %s for %s" % [qty, it["name"], Money.fmt(total)],
		"events": [{"name": "buy_item", "id": id, "category": it["category"], "count": qty, "amount": total}]}


static func sell_price(id: String) -> int:
	return int(DataDB.item_price_p(id) * SELL_RATIO)


static func sell(s: Dictionary, id: String, qty: int) -> Dictionary:
	var it := DataDB.item(id)
	if it.is_empty() or qty <= 0:
		return {"ok": false, "msg": "Invalid item."}
	if not has(s, id, qty):
		return {"ok": false, "msg": "You don't have enough of that."}
	if is_equipped(s, id) and count(s, id) <= qty:
		return {"ok": false, "msg": "Take it off before selling it."}
	if id == "phone_basic" and not has(s, "phone_smart"):
		return {"ok": false, "msg": "You need a phone!"}
	var total := sell_price(id) * qty
	remove_item(s, id, qty)
	if total > 0:
		EconomyRules.earn(s, total, "Sold %dx %s" % [qty, it["name"]], "cash", "sale")
	return {"ok": true, "msg": "Sold %dx %s for %s" % [qty, it["name"], Money.fmt(total)],
		"events": [{"name": "sell_item", "id": id, "count": qty, "amount": total}]}


static func use(s: Dictionary, id: String) -> Dictionary:
	var it := DataDB.item(id)
	if it.is_empty() or not has(s, id):
		return {"ok": false, "msg": "You don't have that."}
	if it.get("category") == "clothing":
		return equip(s, id)
	if it.get("placeable", false):
		return {"ok": false, "msg": "Place this in your home from the Property app."}
	if it.has("vehicle_use"):
		return {"ok": false, "msg": "Use this from the Vehicles app next to your vehicle."}
	var effects: Dictionary = it.get("effects", {})
	if effects.is_empty():
		return {"ok": false, "msg": "You can't use that."}
	var events := []
	if it.get("reusable", false):
		var now := PlayerState.now_abs(s)
		var ready_at := int(s["item_cooldowns"].get(id, 0))
		if now < ready_at:
			return {"ok": false, "msg": "%s: try again in %d min." % [it["name"], ready_at - now]}
		s["item_cooldowns"][id] = now + int(it.get("cooldown_minutes", 120))
	else:
		remove_item(s, id, 1)
	NeedsRules.apply_effects(s, effects)
	events.append({"name": "use_item", "id": id, "category": it["category"], "count": 1})
	events.append({"name": "needs_delta", "delta": effects})
	return {"ok": true, "msg": "Used " + str(it["name"]), "events": events}


static func equip(s: Dictionary, id: String) -> Dictionary:
	var it := DataDB.item(id)
	if it.get("category") != "clothing" or not has(s, id):
		return {"ok": false, "msg": "You can't wear that."}
	var slot: String = it.get("slot", "")
	if slot == "":
		return {"ok": false, "msg": "You can't wear that."}
	s["equipped"][slot] = id
	return {"ok": true, "msg": "Now wearing " + str(it["name"]), "events": [{"name": "equip", "id": id}, {"name": "appearance_changed"}]}


static func unequip(s: Dictionary, slot: String) -> Dictionary:
	if slot != "accessory":
		return {"ok": false, "msg": "You need to wear something there!"}
	s["equipped"]["accessory"] = ""
	return {"ok": true, "msg": "Removed accessory", "events": [{"name": "appearance_changed"}]}


static func drop(s: Dictionary, id: String, qty: int) -> Dictionary:
	if is_equipped(s, id) and count(s, id) <= qty:
		return {"ok": false, "msg": "Take it off first."}
	if id == "phone_basic":
		return {"ok": false, "msg": "You can't throw away your phone."}
	if not remove_item(s, id, qty):
		return {"ok": false, "msg": "You don't have that."}
	return {"ok": true, "msg": "Discarded %dx %s" % [qty, DataDB.item_name(id)]}


static func wearing_smart_outfit(s: Dictionary) -> bool:
	for slot in ["top", "bottom", "shoes"]:
		var id: String = s["equipped"].get(slot, "")
		if id == "" or not DataDB.item(id).get("smart", false):
			return false
	return true
