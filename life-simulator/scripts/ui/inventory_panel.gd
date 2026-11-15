class_name InventoryPanel
extends RefCounted
## Inventory with category filters, stacking info and Use / Wear / Discard.

const FILTERS := ["all", "food", "drink", "clothing", "electronics", "furniture", "tools", "vehicle_parts", "collectibles"]


static func open(parent: Node, cats: Array = []) -> void:
	var m := Modal.open(parent, "Inventory" if cats.is_empty() else "Kitchen", 900, 650)
	build(m.body, cats)


static func build(parent: Control, cats: Array = []) -> void:
	var filter := ["all" if cats.is_empty() else "only"]
	var fbar := HFlowContainer.new()
	fbar.add_theme_constant_override("h_separation", 6)
	fbar.add_theme_constant_override("v_separation", 6)
	parent.add_child(fbar)
	var info := UI.label("", 17, UI.MUTED)
	parent.add_child(info)
	var sc := UI.scroll()
	var v := UI.vbox(8)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	parent.add_child(sc)
	var rebuild := func():
		_fill(v, filter[0], cats)
		var s := GameManager.state
		info.text = "Slots used %d / %d" % [InventoryRules.used_slots(s), InventoryRules.capacity(s)]
	if cats.is_empty():
		for f in FILTERS:
			var name: String = "All" if f == "all" else str(DataDB.categories.get(f, {}).get("name", f))
			var b := UI.small_button(name, func(): filter[0] = f; rebuild.call())
			fbar.add_child(b)
	UI.live(v, rebuild)


static func _fill(v: VBoxContainer, filter: String, cats: Array) -> void:
	UI.clear(v)
	var s := GameManager.state
	var shown := 0
	for i in s["inventory"].size():
		var e: Dictionary = s["inventory"][i]
		var id: String = e["id"]
		var it := DataDB.item(id)
		var cat: String = it.get("category", "")
		if filter == "only" and not (cat in cats):
			continue
		if filter != "all" and filter != "only" and cat != filter:
			continue
		shown += 1
		var stack := int(it.get("stack", 1))
		var sub := "%s  •  %s" % [DataDB.categories.get(cat, {}).get("name", cat), it.get("desc", "")]
		if stack > 1:
			sub += "  •  Stack %d/%d" % [int(e["qty"]), stack]
		if it.has("effects"):
			sub += "\n" + ShopPanel._effects_text(it["effects"])
		var btns := []
		if cat == "clothing":
			if InventoryRules.is_equipped(s, id):
				if it.get("slot") == "accessory":
					btns.append(UI.small_button("Take off", func(): GameManager.act("unequip", {"slot": "accessory"})))
				else:
					var w := UI.small_button("Wearing", Callable())
					w.disabled = true
					btns.append(w)
			else:
				btns.append(UI.small_button("Wear", func(): GameManager.act("equip", {"id": id}), UI.ACCENT.darkened(0.3)))
		elif it.has("effects"):
			btns.append(UI.small_button("Eat" if cat == "food" else ("Drink" if cat == "drink" else "Use"), func(): GameManager.act("use_item", {"id": id}), UI.ACCENT.darkened(0.3)))
		if id != "phone_basic" and filter != "only":
			btns.append(UI.small_button("Discard", func(): UI.confirm(UI.host(v), "Throw away 1 %s?" % it["name"], func(): GameManager.act("drop_item", {"id": id, "qty": 1}), "Discard"), Color(0.35, 0.2, 0.22)))
		v.add_child(UI.row("%s  x%d" % [it["name"], int(e["qty"])], sub, btns, UI.item_icon(id)))
	if shown == 0:
		v.add_child(UI.label("Nothing here. Buy food and drink at FreshMart or order with the phone's Shop app." if filter == "only" else "Nothing in this category.", 18, UI.MUTED))
