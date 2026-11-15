class_name VehiclePanel
extends RefCounted
## Dealership (buy with a colour choice), your vehicles (fuel, condition,
## delivery, parts, selling), Gearhead Garage services and the fuel station.


static func open_dealer(parent: Node) -> void:
	var m := Modal.open(parent, "Motor City Dealership", 900, 650)
	var v := m.scroll_list(10)
	var chosen := [DataDB.vehicle_meta["colors"][0]]
	UI.live(v, func(): _fill_dealer(v, chosen))


static func _fill_dealer(v: VBoxContainer, chosen: Array) -> void:
	UI.clear(v)
	var s := GameManager.state
	if not ("driving_licence" in s["qualifications"]):
		v.add_child(UI.label("Tip: you can buy and drive without a licence here, but delivery jobs need a Driving Licence from City College.", 16, UI.MUTED))
	v.add_child(UI.label("Paint colour for your new vehicle:", 18))
	var g := HBoxContainer.new()
	g.add_theme_constant_override("separation", 8)
	for c in DataDB.vehicle_meta["colors"]:
		var b := Button.new()
		b.custom_minimum_size = Vector2(54, 54)
		var sel: bool = chosen[0] == c
		b.add_theme_stylebox_override("normal", UI.box(Color(c), 27, Color.WHITE if sel else Color(0, 0, 0, 0.4), 4 if sel else 2))
		b.add_theme_stylebox_override("hover", UI.box(Color(c), 27, Color.WHITE, 2))
		b.pressed.connect(func(): chosen[0] = c; _fill_dealer(v, chosen))
		g.add_child(b)
	v.add_child(g)
	v.add_child(UI.label("Bank balance: " + Money.fmt(int(s["bank"])), 18, UI.GOOD))
	for vid in DataDB.vehicle_order:
		var d: Dictionary = DataDB.vehicles[vid]
		var price := DataDB.to_pence(d["price"])
		var sub := "%s • %s\nTop speed %d mph • Acceleration %d • Tank %dL" % [str(d["type"]).capitalize(), d["desc"], int(float(d["top_speed"]) * 2.237), int(d["accel"]), int(d["fuel_capacity"])]
		var b2 := UI.small_button("Buy " + Money.fmt(price), func(): UI.confirm(UI.host(v), "Buy the %s for %s?" % [d["name"], Money.fmt(price)], func(): GameManager.act("buy_vehicle", {"id": vid, "color": chosen[0]}), "Buy"), UI.ACCENT.darkened(0.3))
		b2.disabled = int(s["bank"]) < price
		v.add_child(UI.row(str(d["name"]), sub, [b2]))


static func open_mine(parent: Node, at_dealer: bool = false) -> void:
	var m := Modal.open(parent, "My Vehicles", 880, 640)
	var v := m.scroll_list(10)
	UI.live(v, func(): build_mine(v, at_dealer))


static func build_mine(v: VBoxContainer, at_dealer: bool) -> void:
	UI.clear(v)
	var s := GameManager.state
	if s["vehicles"].is_empty():
		v.add_child(UI.label("You don't own any vehicles. Visit Motor City Dealership in the Industrial Area.", 18, UI.MUTED))
		return
	var world: Node = (Engine.get_main_loop() as SceneTree).current_scene
	for rec in s["vehicles"]:
		var d: Dictionary = DataDB.vehicles[rec["id"]]
		var uid: String = rec["uid"]
		var node = world.vehicles.get(uid) if world and "vehicles" in world else null
		var fuel := float(rec["fuel"])
		var dmg := float(rec["damage"])
		if node and is_instance_valid(node):
			fuel = node.fuel
			dmg = node.damage
		var near := false
		if node and is_instance_valid(node) and world.player:
			near = world.player.global_position.distance_to(node.global_position) < 8.0 or world.player.vehicle == node
		var sub := "Fuel %d/%dL • Damage %d%% • Engine stage %d • %d km\nValue %s" % [int(fuel), int(d["fuel_capacity"]), int(dmg), int(rec["engine"]), int(float(rec["odo"]) / 1000.0), Money.fmt(VehicleRules.sell_value(rec))]
		var btns := []
		btns.append(UI.small_button("Deliver to me (%s)" % Money.fmt(DataDB.to_pence(DataDB.vehicle_meta.get("delivery_cost", 40))), func(): GameManager.act("tow_vehicle", {"uid": uid})))
		if near:
			if InventoryRules.has(s, "fuel_can"):
				btns.append(UI.small_button("Use fuel can", func(): GameManager.act("use_vehicle_part", {"uid": uid, "item": "fuel_can"})))
			if InventoryRules.has(s, "repair_kit"):
				btns.append(UI.small_button("Use repair kit", func(): GameManager.act("use_vehicle_part", {"uid": uid, "item": "repair_kit"})))
		if at_dealer:
			btns.append(UI.small_button("Sell", func(): UI.confirm(UI.host(v), "Sell your %s for %s?" % [d["name"], Money.fmt(VehicleRules.sell_value(rec))], func(): GameManager.act("sell_vehicle", {"uid": uid}), "Sell"), Color(0.45, 0.2, 0.22)))
		var col := PanelContainer.new()
		col.add_theme_stylebox_override("panel", UI.box(Color(str(rec["color"])), 10, Color(1, 1, 1, 0.4), 2))
		col.custom_minimum_size = Vector2(44, 44)
		v.add_child(UI.row(str(d["name"]) + (" (active)" if s["active_vehicle"] == uid else ""), sub, btns, col))
	v.add_child(UI.label("Your vehicles stay where you park them. Wrecked or out of fuel? Use delivery, a fuel can or a repair kit.", 16, UI.MUTED))


static func open_garage(parent: Node) -> void:
	var m := Modal.open(parent, "Gearhead Garage", 900, 650)
	var v := m.scroll_list(10)
	UI.live(v, func(): _fill_garage(v))


static func _fill_garage(v: VBoxContainer) -> void:
	UI.clear(v)
	var s := GameManager.state
	if s["vehicles"].is_empty():
		v.add_child(UI.label("Bring a vehicle round and we'll sort it out. (You don't own one yet.)", 18, UI.MUTED))
		return
	for rec in s["vehicles"]:
		var d: Dictionary = DataDB.vehicles[rec["id"]]
		var uid: String = rec["uid"]
		v.add_child(UI.header(str(d["name"])))
		var btns := []
		var rc := VehicleRules.repair_cost(rec)
		var rb := UI.small_button("Repair (%s)" % Money.fmt(rc), func(): GameManager.act("repair_vehicle", {"uid": uid}))
		rb.disabled = float(rec["damage"]) <= 0.0
		btns.append(rb)
		var ec := VehicleRules.engine_cost(rec)
		if ec > 0:
			var label_txt := "Engine stage %d (%s)" % [int(rec["engine"]) + 1, "Turbo Kit" if InventoryRules.has(s, "turbo_part") else Money.fmt(ec)]
			btns.append(UI.small_button(label_txt, func(): GameManager.act("upgrade_engine", {"uid": uid})))
		v.add_child(UI.row("Condition: %d%% damage • Engine stage %d" % [int(rec["damage"]), int(rec["engine"])], "Top speed %d mph" % int(VehicleRules.top_speed(rec) * 2.237), btns))
		var g := HBoxContainer.new()
		g.add_theme_constant_override("separation", 8)
		g.add_child(UI.label("Respray (%s):" % Money.fmt(DataDB.to_pence(DataDB.vehicle_meta["paint_cost"])), 17))
		for c in DataDB.vehicle_meta["colors"]:
			var b := Button.new()
			b.custom_minimum_size = Vector2(48, 48)
			var sel: bool = rec["color"] == c
			b.add_theme_stylebox_override("normal", UI.box(Color(c), 24, Color.WHITE if sel else Color(0, 0, 0, 0.4), 4 if sel else 2))
			b.add_theme_stylebox_override("hover", UI.box(Color(c), 24, Color.WHITE, 2))
			b.pressed.connect(func(): GameManager.act("paint_vehicle", {"uid": uid, "color": c}))
			g.add_child(b)
		v.add_child(g)


static func build_fuel(v: VBoxContainer) -> void:
	var s := GameManager.state
	var price := DataDB.to_pence(DataDB.vehicle_meta.get("fuel_price_per_litre", 1.5))
	v.add_child(UI.label("Fuel: %s per litre. Park nearby and fill up." % Money.fmt(price, true), 18, UI.MUTED))
	for rec in s["vehicles"]:
		var uid: String = rec["uid"]
		var d: Dictionary = DataDB.vehicles[rec["id"]]
		var cost := VehicleRules.refuel_cost(rec)
		var b := UI.small_button("Fill up (%s)" % Money.fmt(cost), func(): GameManager.act("refuel_vehicle", {"uid": uid}), UI.ACCENT.darkened(0.3))
		b.disabled = cost <= 0
		v.add_child(UI.row(str(d["name"]), "Fuel %d / %d L" % [int(rec["fuel"]), int(d["fuel_capacity"])], [b]))
	if s["vehicles"].is_empty():
		v.add_child(UI.label("You don't have a vehicle to fill up.", 17, UI.MUTED))
