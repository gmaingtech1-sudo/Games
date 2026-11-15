class_name BusinessRules
extends RefCounted
## Business ownership and a daily trading simulation.
## Each in-game day: customers arrive (based on staff, premises, price and
## reputation), sales are limited by stock, wages and overheads are paid, and
## profit accumulates until the owner collects it.


static func def(id: String) -> Dictionary:
	return DataDB.businesses.get(id, {})


static func new_business_record(id: String) -> Dictionary:
	return {"id": id, "staff": 1, "stock": 0, "price_level": 1, "upgrade": 0, "unpaid_profit": 0,
		"reputation": 50.0, "total_profit": 0, "last_day": {}, "history": []}


static func find(s: Dictionary, id: String) -> Dictionary:
	for b in s["businesses"]:
		if b["id"] == id:
			return b
	return {}


static func upgrade_def(level: int) -> Dictionary:
	for u in DataDB.business_meta.get("upgrades", []):
		if int(u["level"]) == level:
			return u
	return {}


static func price_level(i: int) -> Dictionary:
	var pl: Array = DataDB.business_meta.get("price_levels", [])
	return pl[clampi(i, 0, pl.size() - 1)]


static func business_value(b: Dictionary) -> int:
	var d := def(b["id"])
	var base := DataDB.to_pence(d.get("price", 0))
	var bonus := 0.0
	for lv in range(1, int(b.get("upgrade", 0)) + 1):
		bonus += float(upgrade_def(lv).get("cost_ratio", 0)) * 0.7
	return int(base * (1.0 + bonus) * float(DataDB.business_meta.get("sell_ratio", 0.8)))


static func buy(s: Dictionary, id: String) -> Dictionary:
	var d := def(id)
	if d.is_empty():
		return {"ok": false, "msg": "Unknown business."}
	if not find(s, id).is_empty():
		return {"ok": false, "msg": "You already own this business."}
	var price := DataDB.to_pence(d["price"])
	if not EconomyRules.pay(s, price, "Bought business: " + str(d["name"]), "bank", "business"):
		return {"ok": false, "msg": "You need %s in the bank." % Money.fmt(price)}
	var rec := new_business_record(id)
	rec["stock"] = int(d["base_customers"]) * 2   # starter stock included
	s["businesses"].append(rec)
	PlayerState.add_message(s, str(d["name"]), "Welcome, boss! We have starter stock for about two days. Hire staff and keep us stocked up.")
	return {"ok": true, "msg": "You now own " + str(d["name"]) + "!", "events": [{"name": "buy_business", "id": id}]}


static func sell(s: Dictionary, id: String) -> Dictionary:
	var b := find(s, id)
	if b.is_empty():
		return {"ok": false, "msg": "You don't own that business."}
	var value := business_value(b) + int(b["unpaid_profit"])
	s["businesses"].erase(b)
	EconomyRules.earn(s, value, "Sold business: " + str(def(id)["name"]), "bank", "business_sale")
	return {"ok": true, "msg": "Business sold for " + Money.fmt(value), "events": [{"name": "sell_business", "id": id}]}


static func hire(s: Dictionary, id: String) -> Dictionary:
	var b := find(s, id)
	if b.is_empty():
		return {"ok": false, "msg": "You don't own that business."}
	if int(b["staff"]) >= int(def(id)["max_staff"]):
		return {"ok": false, "msg": "No room for more staff."}
	b["staff"] = int(b["staff"]) + 1
	return {"ok": true, "msg": "Hired a new employee (%d staff)." % int(b["staff"]), "events": [{"name": "hire_staff", "id": id}]}


static func fire(s: Dictionary, id: String) -> Dictionary:
	var b := find(s, id)
	if b.is_empty() or int(b["staff"]) <= 0:
		return {"ok": false, "msg": "No staff to let go."}
	b["staff"] = int(b["staff"]) - 1
	return {"ok": true, "msg": "Let an employee go (%d staff)." % int(b["staff"])}


static func buy_stock(s: Dictionary, id: String, units: int) -> Dictionary:
	var b := find(s, id)
	if b.is_empty():
		return {"ok": false, "msg": "You don't own that business."}
	if units <= 0 or units > 100000:
		return {"ok": false, "msg": "Invalid amount."}
	var cost := units * DataDB.to_pence(def(id)["stock_unit_cost"])
	if not EconomyRules.pay(s, cost, "Stock for " + str(def(id)["name"]), "bank", "business"):
		return {"ok": false, "msg": "That stock costs %s from your bank." % Money.fmt(cost)}
	b["stock"] = int(b["stock"]) + units
	return {"ok": true, "msg": "Bought %d units of stock for %s." % [units, Money.fmt(cost)]}


static func set_price(s: Dictionary, id: String, level: int) -> Dictionary:
	var b := find(s, id)
	if b.is_empty():
		return {"ok": false, "msg": "You don't own that business."}
	b["price_level"] = clampi(level, 0, DataDB.business_meta["price_levels"].size() - 1)
	return {"ok": true, "msg": "Prices set to " + str(price_level(int(b["price_level"]))["name"]) + "."}


static func upgrade_cost(b: Dictionary) -> int:
	var u := upgrade_def(int(b["upgrade"]) + 1)
	if u.is_empty():
		return -1
	return int(DataDB.to_pence(def(b["id"])["price"]) * float(u["cost_ratio"]))


static func upgrade(s: Dictionary, id: String) -> Dictionary:
	var b := find(s, id)
	if b.is_empty():
		return {"ok": false, "msg": "You don't own that business."}
	var cost := upgrade_cost(b)
	if cost < 0:
		return {"ok": false, "msg": "Premises fully upgraded."}
	var u := upgrade_def(int(b["upgrade"]) + 1)
	if not EconomyRules.pay(s, cost, "Premises: " + str(u["name"]), "bank", "business"):
		return {"ok": false, "msg": "Upgrade costs %s from your bank." % Money.fmt(cost)}
	b["upgrade"] = int(b["upgrade"]) + 1
	return {"ok": true, "msg": str(u["name"]) + " complete!", "events": [{"name": "upgrade_business", "id": id}]}


static func collect(s: Dictionary, id: String) -> Dictionary:
	var b := find(s, id)
	if b.is_empty():
		return {"ok": false, "msg": "You don't own that business."}
	var amt := int(b["unpaid_profit"])
	if amt <= 0:
		return {"ok": false, "msg": "No profit to collect yet."}
	b["unpaid_profit"] = 0
	EconomyRules.earn(s, amt, "Profit: " + str(def(id)["name"]), "bank", "business_profit")
	s["stats"]["profit_collected"] = int(s["stats"].get("profit_collected", 0)) + amt
	return {"ok": true, "msg": "Collected " + Money.fmt(amt), "events": [{"name": "collect_profit", "id": id, "amount": amt}]}


## Expected customers today (before random variation).
static func expected_customers(b: Dictionary) -> float:
	var d := def(b["id"])
	var staff_needed := maxf(1.0, float(d["max_staff"]) * 0.5)
	var staff_factor := 0.3 + 0.7 * minf(1.0, float(b["staff"]) / staff_needed)
	var up_mult := float(upgrade_def(int(b["upgrade"])).get("customers_mult", 1.0)) if int(b["upgrade"]) > 0 else 1.0
	var demand := float(price_level(int(b["price_level"]))["demand_mult"])
	var rep := 0.6 + float(b["reputation"]) / 125.0
	return float(d["base_customers"]) * staff_factor * up_mult * demand * rep


## Runs one trading day for every business. rng_seed keeps it deterministic in tests.
static func daily(s: Dictionary, rng_seed: int = -1) -> Array:
	var events := []
	var rng := RandomNumberGenerator.new()
	if rng_seed >= 0:
		rng.seed = rng_seed
	else:
		rng.randomize()
	for b in s["businesses"]:
		var d := def(b["id"])
		var customers := int(round(expected_customers(b) * rng.randf_range(0.85, 1.15)))
		var sales: int = min(customers, int(b["stock"]))
		var unit := DataDB.to_pence(d["unit_price"]) * float(price_level(int(b["price_level"]))["price_mult"])
		var revenue := int(sales * unit)
		var wages := int(b["staff"]) * DataDB.to_pence(d["staff_wage"])
		var overhead := int(DataDB.to_pence(d["price"]) * float(DataDB.business_meta.get("overhead_ratio", 0.0008)))
		var profit := revenue - wages - overhead
		b["stock"] = int(b["stock"]) - sales
		# Reputation: stock-outs and understaffing hurt, good service helps.
		var rep := float(b["reputation"])
		if sales < customers:
			rep -= 4.0
		else:
			rep += 1.5
		if int(b["staff"]) == 0:
			rep -= 2.0
		if int(b["price_level"]) == 2:
			rep -= 0.5
		elif int(b["price_level"]) == 0:
			rep += 0.5
		b["reputation"] = clampf(rep, 0.0, 100.0)
		b["unpaid_profit"] = int(b["unpaid_profit"]) + profit
		b["total_profit"] = int(b["total_profit"]) + profit
		b["last_day"] = {"day": int(s["world"]["day"]), "customers": customers, "sales": sales, "revenue": revenue, "wages": wages, "overhead": overhead, "profit": profit}
		b["history"].append(profit)
		if b["history"].size() > 14:
			b["history"].pop_front()
		if int(b["stock"]) < customers:
			PlayerState.add_message(s, str(d["name"]), "We're running low on stock (%d units left). Please order more!" % int(b["stock"]))
		events.append({"name": "business_day", "id": b["id"], "profit": profit})
	return events
