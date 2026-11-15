class_name BusinessPanel
extends RefCounted
## Business marketplace and management: hire/fire staff, buy stock, set
## prices, upgrade premises, collect profits and see daily trading reports.


static func open(parent: Node) -> void:
	var m := Modal.open(parent, "Business", 920, 660)
	var v := m.scroll_list(10)
	UI.live(v, func(): _fill(v, parent))


static func _fill(v: VBoxContainer, parent: Node) -> void:
	UI.clear(v)
	var s := GameManager.state
	if not s["businesses"].is_empty():
		v.add_child(UI.header("Your businesses"))
		for b in s["businesses"]:
			_manage(v, b)
	v.add_child(UI.header("For sale"))
	v.add_child(UI.label("Businesses trade every day (even while you sleep). Keep them stocked and staffed, then collect the profit to your bank.", 16, UI.MUTED))
	for bid in DataDB.business_order:
		if not BusinessRules.find(s, bid).is_empty():
			continue
		var d: Dictionary = DataDB.businesses[bid]
		var price := DataDB.to_pence(d["price"])
		var est := _estimate_profit(bid)
		var sub := "%s • %s\n%s\nEstimated profit with half staff: about %s/day" % [d["type_name"], CityLayout.location_name(d["location"]), d["desc"], Money.fmt(est)]
		var buy := UI.small_button("Buy " + Money.fmt(price), func(): UI.confirm(UI.host(v), "Buy %s for %s?" % [d["name"], Money.fmt(price)], func(): GameManager.act("buy_business", {"id": bid}), "Buy"), UI.ACCENT.darkened(0.3))
		buy.disabled = int(s["bank"]) < price
		v.add_child(UI.row(str(d["name"]), sub, [buy]))


static func _estimate_profit(bid: String) -> int:
	var d: Dictionary = DataDB.businesses[bid]
	var rec := BusinessRules.new_business_record(bid)
	rec["staff"] = int(ceil(float(d["max_staff"]) * 0.5))
	var cust := BusinessRules.expected_customers(rec)
	var margin := DataDB.to_pence(d["unit_price"]) - DataDB.to_pence(d["unit_cost"])
	return int(cust * margin) - int(rec["staff"]) * DataDB.to_pence(d["staff_wage"]) - int(DataDB.to_pence(d["price"]) * float(DataDB.business_meta.get("overhead_ratio", 0.0008)))


static func build_one(v: VBoxContainer, bid: String, parent: Node) -> void:
	var s := GameManager.state
	var b := BusinessRules.find(s, bid)
	if b.is_empty():
		var d: Dictionary = DataDB.businesses[bid]
		var price := DataDB.to_pence(d["price"])
		v.add_child(UI.label("FOR SALE: %s - %s" % [d["type_name"], Money.fmt(price)], 20, UI.ACCENT2))
		v.add_child(UI.label(str(d["desc"]) + "\nEstimated profit: about %s/day." % Money.fmt(_estimate_profit(bid)), 17, UI.MUTED))
		var buy := UI.button("Buy this business", func(): UI.confirm(UI.host(v), "Buy %s for %s?" % [d["name"], Money.fmt(price)], func(): GameManager.act("buy_business", {"id": bid}), "Buy"), 64, UI.ACCENT.darkened(0.3))
		buy.disabled = int(s["bank"]) < price
		v.add_child(buy)
	else:
		_manage(v, b)


static func _manage(v: VBoxContainer, b: Dictionary) -> void:
	var bid: String = b["id"]
	var d: Dictionary = DataDB.businesses[bid]
	var c := UI.card(Color(0.13, 0.22, 0.3), 16)
	var col := UI.vbox(8)
	c.add_child(col)
	col.add_child(UI.label("%s (%s)" % [d["name"], d["type_name"]], 23))
	var last: Dictionary = b.get("last_day", {})
	var info := "Staff %d/%d • Stock %d units • Prices: %s • Premises level %d • Reputation %d%%\nUncollected profit: %s • Total profit: %s" % [
		int(b["staff"]), int(d["max_staff"]), int(b["stock"]), BusinessRules.price_level(int(b["price_level"]))["name"], int(b["upgrade"]), int(b["reputation"]),
		Money.fmt(int(b["unpaid_profit"])), Money.fmt(int(b["total_profit"]))]
	if not last.is_empty():
		info += "\nYesterday: %d customers, %d sales, revenue %s, wages %s, overheads %s → profit %s" % [int(last["customers"]), int(last["sales"]), Money.fmt(int(last["revenue"])), Money.fmt(int(last["wages"])), Money.fmt(int(last["overhead"])), Money.fmt(int(last["profit"]))]
	info += "\nExpected customers/day: about %d" % int(BusinessRules.expected_customers(b))
	col.add_child(UI.label(info, 16, UI.MUTED))
	var r1 := UI.hbox(6)
	r1.add_child(UI.expand(UI.small_button("Collect %s" % Money.fmt(maxi(0, int(b["unpaid_profit"]))), func(): GameManager.act("collect_profit", {"id": bid}), Color(0.15, 0.55, 0.35))))
	r1.add_child(UI.expand(UI.small_button("Hire (+%s/day)" % Money.fmt(DataDB.to_pence(d["staff_wage"])), func(): GameManager.act("hire_staff", {"id": bid}))))
	r1.add_child(UI.expand(UI.small_button("Let go", func(): GameManager.act("fire_staff", {"id": bid}))))
	col.add_child(r1)
	var r2 := UI.hbox(6)
	var unit := DataDB.to_pence(d["stock_unit_cost"])
	var day_need := int(ceil(BusinessRules.expected_customers(b)))
	for mult in [1, 3, 7]:
		var units := maxi(1, day_need * mult)
		r2.add_child(UI.expand(UI.small_button("Stock %d days (%s)" % [mult, Money.fmt(units * unit)], func(): GameManager.act("buy_stock", {"id": bid, "units": units}))))
	col.add_child(r2)
	var r3 := UI.hbox(6)
	for i in DataDB.business_meta["price_levels"].size():
		var pl: Dictionary = DataDB.business_meta["price_levels"][i]
		var pb := UI.small_button(str(pl["name"]) + " prices", func(): GameManager.act("set_price", {"id": bid, "level": i}))
		if int(b["price_level"]) == i:
			pb.add_theme_stylebox_override("normal", UI.box(UI.ACCENT.darkened(0.25), 14))
		r3.add_child(UI.expand(pb))
	col.add_child(r3)
	var uc := BusinessRules.upgrade_cost(b)
	var r4 := UI.hbox(6)
	if uc > 0:
		var u := BusinessRules.upgrade_def(int(b["upgrade"]) + 1)
		r4.add_child(UI.expand(UI.small_button("Upgrade: %s (%s)" % [u["name"], Money.fmt(uc)], func(): GameManager.act("upgrade_business", {"id": bid}))))
	r4.add_child(UI.expand(UI.small_button("Sell business (%s)" % Money.fmt(BusinessRules.business_value(b) + int(b["unpaid_profit"])), func(): UI.confirm(UI.host(v), "Sell %s?" % d["name"], func(): GameManager.act("sell_business", {"id": bid}), "Sell"), Color(0.45, 0.2, 0.22))))
	col.add_child(r4)
	var hist: Array = b.get("history", [])
	if hist.size() > 1:
		col.add_child(_Sparkline.new(hist))
	v.add_child(c)


## Tiny profit history chart for the last two weeks.
class _Sparkline extends Control:
	var data: Array

	func _init(d: Array) -> void:
		data = d
		custom_minimum_size = Vector2(0, 70)

	func _draw() -> void:
		var mx := 1.0
		for x in data:
			mx = maxf(mx, absf(float(x)))
		var w := size.x / maxf(1.0, data.size())
		var mid := size.y * 0.5
		draw_line(Vector2(0, mid), Vector2(size.x, mid), Color(1, 1, 1, 0.2), 1.0)
		for i in data.size():
			var v := float(data[i]) / mx * (mid - 4)
			var col := UI.GOOD if v >= 0 else UI.BAD
			draw_rect(Rect2(i * w + 2, mid - maxf(v, 0), w - 4, absf(v)), col)
		draw_string(get_theme_default_font(), Vector2(4, 14), "Daily profit (last %d days)" % data.size(), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, UI.MUTED)
