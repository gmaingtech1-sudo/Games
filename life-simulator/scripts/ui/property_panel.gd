class_name PropertyPanel
extends RefCounted
## Property listings (rent / buy) and management of your homes: set home,
## upgrade, sell, end tenancy, place furniture and redecorate.


static func open(parent: Node, focus: String = "") -> void:
	var m := Modal.open(parent, "Property", 900, 650)
	build(m.body, focus)


static func build(parent: Control, focus: String = "") -> void:
	var sc := UI.scroll()
	var v := UI.vbox(10)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	parent.add_child(sc)
	UI.live(v, func(): _fill(v, focus))


static func _fill(v: VBoxContainer, focus: String) -> void:
	UI.clear(v)
	var s := GameManager.state
	if not s["properties"].is_empty():
		v.add_child(UI.header("Your homes"))
		for rec in s["properties"]:
			_my_property(v, rec)
	else:
		v.add_child(UI.label("You don't have a home yet. Until then you can sleep on park benches or at the Backpackers Hostel.", 18, UI.WARN))
	v.add_child(UI.header("On the market"))
	for pid in DataDB.property_order:
		if not PropertyRules.find(s, pid).is_empty():
			continue
		if focus != "" and pid != focus:
			continue
		build_listing(v, pid)
	if focus != "":
		v.add_child(UI.small_button("Show all properties", func(): _fill(v, "")))


static func build_listing(v: VBoxContainer, pid: String) -> void:
	var d := PropertyRules.def(pid)
	var s := GameManager.state
	var rent := PropertyRules.rent_p(pid)
	var weeks := int(DataDB.property_meta.get("rent_deposit_weeks", 1))
	var sub := "%s • %s\n%s\nRent %s/week (move-in %s) • Buy %s • %d furniture spaces" % [
		d["type_name"], CityLayout.location_name(pid), d["desc"], Money.fmt(rent), Money.fmt(rent * (1 + weeks)), Money.fmt(DataDB.to_pence(d["price"])), int(d["slots"])]
	var b_rent := UI.small_button("Rent", func(): GameManager.act("rent_property", {"id": pid}), UI.ACCENT.darkened(0.3))
	var b_buy := UI.small_button("Buy", func(): UI.confirm(UI.host(v), "Buy %s for %s?" % [d["name"], Money.fmt(DataDB.to_pence(d["price"]))], func(): GameManager.act("buy_property", {"id": pid}), "Buy"))
	b_buy.disabled = int(s["bank"]) < DataDB.to_pence(d["price"])
	v.add_child(UI.row(str(d["name"]), sub, [b_rent, b_buy]))


static func _my_property(v: VBoxContainer, rec: Dictionary) -> void:
	var s := GameManager.state
	var pid: String = rec["id"]
	var d := PropertyRules.def(pid)
	var is_home: bool = s["home"] == pid
	var sub := "%s • %s%s\nComfort %d • Furniture %d/%d • Upgrade level %d" % [d["type_name"], "Owned (worth %s)" % Money.fmt(PropertyRules.property_value(rec)) if rec["mode"] == "own" else "Rented, %s/week" % Money.fmt(PropertyRules.rent_p(pid)),
		" • HOME" if is_home else "", int(PropertyRules.comfort(rec)), rec["furniture"].size(), PropertyRules.slots(rec), int(rec["upgrade"])]
	if int(rec.get("arrears", 0)) > 0:
		sub += "\nRent arrears warnings: %d of 2" % int(rec["arrears"])
	var btns := []
	if not is_home:
		btns.append(UI.small_button("Make home", func(): GameManager.act("set_home", {"id": pid})))
	btns.append(UI.small_button("Furniture", func(): open_furniture(UI.host(v), pid)))
	if rec["mode"] == "own":
		var uc := PropertyRules.upgrade_cost(rec)
		if uc > 0:
			var u := PropertyRules.upgrade_def(int(rec["upgrade"]) + 1)
			btns.append(UI.small_button("%s (%s)" % [u["name"], Money.fmt(uc)], func(): GameManager.act("upgrade_property", {"id": pid})))
		btns.append(UI.small_button("Sell", func(): UI.confirm(UI.host(v), "Sell %s for about %s?" % [d["name"], Money.fmt(int(PropertyRules.property_value(rec) * float(DataDB.property_meta.get("sell_ratio", 0.92))))], func(): GameManager.act("sell_property", {"id": pid}), "Sell"), Color(0.45, 0.2, 0.22)))
	else:
		btns.append(UI.small_button("Buy it (%s)" % Money.fmt(DataDB.to_pence(d["price"]) - int(rec.get("deposit", 0))), func(): GameManager.act("buy_property", {"id": pid})))
		btns.append(UI.small_button("End tenancy", func(): UI.confirm(UI.host(v), "Move out of %s?" % d["name"], func(): GameManager.act("end_rent", {"id": pid}), "Move out"), Color(0.45, 0.2, 0.22)))
	v.add_child(UI.row(str(d["name"]), sub, btns, null, Color(0.14, 0.28, 0.26) if is_home else UI.CARD))


static func open_furniture(parent: Node, pid: String) -> void:
	var m := Modal.open(parent, "Furniture", 820, 620)
	var sc := UI.scroll()
	var v := UI.vbox(8)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	m.body.add_child(sc)
	UI.live(v, func(): _fill_furniture(v, pid))


static func _fill_furniture(v: VBoxContainer, pid: String) -> void:
	UI.clear(v)
	var s := GameManager.state
	var rec := PropertyRules.find(s, pid)
	if rec.is_empty():
		return
	v.add_child(UI.label("Spaces used: %d/%d. Furniture adds comfort, which improves sleep and happiness at home." % [rec["furniture"].size(), PropertyRules.slots(rec)], 17, UI.MUTED))
	v.add_child(UI.header("Placed"))
	for i in rec["furniture"].size():
		var fid: String = rec["furniture"][i]
		v.add_child(UI.row(DataDB.item_name(fid), "Comfort +%d" % int(DataDB.item(fid).get("comfort", 0)), [UI.small_button("Remove", func(): GameManager.act("remove_furniture", {"id": pid, "index": i}); _refresh_world())], UI.item_icon(fid, 48)))
	v.add_child(UI.header("In your inventory"))
	var any := false
	var seen := {}
	for e in s["inventory"]:
		var id: String = e["id"]
		if seen.has(id) or not DataDB.item(id).get("placeable", false):
			continue
		seen[id] = true
		any = true
		var b := UI.small_button("Place", func(): GameManager.act("place_furniture", {"id": pid, "item": id}); _refresh_world(), UI.ACCENT.darkened(0.3))
		b.disabled = rec["furniture"].size() >= PropertyRules.slots(rec)
		v.add_child(UI.row("%s x%d" % [DataDB.item_name(id), InventoryRules.count(s, id)], str(DataDB.item(id).get("desc", "")), [b], UI.item_icon(id, 48)))
	if not any:
		v.add_child(UI.label("No furniture in your inventory. Buy some at HomeStyle Furniture or on the phone's Shop app.", 17, UI.MUTED))


static func _refresh_world() -> void:
	var tree := Engine.get_main_loop() as SceneTree
	var w := tree.current_scene
	if w and w.has_method("refresh_interior"):
		w.call_deferred("refresh_interior")


static func open_decorate(parent: Node, pid: String) -> void:
	var m := Modal.open(parent, "Decorate", 760, 520)
	var v := m.scroll_list(10)
	UI.live(v, func(): _fill_decorate(v, pid))


static func _fill_decorate(v: VBoxContainer, pid: String) -> void:
	UI.clear(v)
	var rec := PropertyRules.find(GameManager.state, pid)
	if rec.is_empty():
		return
	for part in [["Wall colour", "wall_colors", "wall"], ["Floor", "floor_colors", "floor"]]:
		v.add_child(UI.header(part[0]))
		var g := GridContainer.new()
		g.columns = 8
		g.add_theme_constant_override("h_separation", 10)
		g.add_theme_constant_override("v_separation", 10)
		var cols: Array = DataDB.property_meta.get(part[1], [])
		for i in cols.size():
			var b := Button.new()
			b.custom_minimum_size = Vector2(64, 64)
			var sel: bool = int(rec.get(part[2], 0)) == i
			b.add_theme_stylebox_override("normal", UI.box(Color(cols[i]), 12, Color.WHITE if sel else Color(0, 0, 0, 0.3), 4 if sel else 2))
			b.add_theme_stylebox_override("hover", UI.box(Color(cols[i]).lightened(0.1), 12, Color.WHITE, 2))
			var key: String = part[2]
			var on_pick := func():
				var w := int(rec.get("wall", 0))
				var f := int(rec.get("floor", 0))
				if key == "wall":
					w = i
				else:
					f = i
				GameManager.act("decorate", {"id": pid, "wall": w, "floor": f})
				_refresh_world()
			b.pressed.connect(on_pick)
			g.add_child(b)
		v.add_child(g)
	v.add_child(UI.label("Decorating is free. Upgrades (bigger rooms, more space) are in the Property app.", 16, UI.MUTED))
