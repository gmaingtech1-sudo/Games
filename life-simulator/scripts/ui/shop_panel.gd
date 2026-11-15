class_name ShopPanel
extends RefCounted
## Shops (buy & sell items) and service counters (meals, gym, hospital, hostel).

const SHOP_NAMES := {"supermarket": "FreshMart", "clothing": "Urban Wardrobe", "tech": "PixelPoint Electronics",
	"furniture": "HomeStyle Furniture", "garage": "Gearhead Parts Counter", "online": "QuickShop Online"}


static func open(parent: Node, shop: String) -> void:
	var m := Modal.open(parent, SHOP_NAMES.get(shop, "Shop"), 860, 640)
	build(m.body, shop)


static func build(parent: Control, shop: String) -> void:
	var tabs := UI.hbox(8)
	parent.add_child(tabs)
	var money := UI.label("", 18, UI.GOOD)
	parent.add_child(money)
	var sc := UI.scroll()
	var list := UI.vbox(8)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(list)
	parent.add_child(sc)
	var mode := ["buy"]
	var b_buy := UI.button("Buy", Callable(), 56)
	var b_sell := UI.button("Sell", Callable(), 56)
	UI.expand(b_buy)
	UI.expand(b_sell)
	tabs.add_child(b_buy)
	tabs.add_child(b_sell)
	var build_list := func():
		_fill(list, shop, mode[0])
		var s := GameManager.state
		money.text = "Cash %s  •  Bank %s  •  Bag %d/%d slots%s" % [Money.fmt(int(s["cash"])), Money.fmt(int(s["bank"])), InventoryRules.used_slots(s), InventoryRules.capacity(s),
			"  •  Paid by card, delivered instantly (+£2 delivery)" if shop == "online" else "  •  Pays with cash first, then card"]
		b_buy.add_theme_stylebox_override("normal", UI.box(UI.ACCENT.darkened(0.25) if mode[0] == "buy" else Color(0.2, 0.25, 0.36), 14))
		b_sell.add_theme_stylebox_override("normal", UI.box(UI.ACCENT.darkened(0.25) if mode[0] == "sell" else Color(0.2, 0.25, 0.36), 14))
	b_buy.pressed.connect(func(): mode[0] = "buy"; build_list.call())
	b_sell.pressed.connect(func(): mode[0] = "sell"; build_list.call())
	if shop == "online":
		b_sell.visible = false
	UI.live(list, build_list)


static func _fill(list: VBoxContainer, shop: String, mode: String) -> void:
	UI.clear(list)
	var s := GameManager.state
	if mode == "buy":
		var ids := DataDB.items_for_shop(shop)
		ids.sort_custom(func(a, b): return DataDB.item_price_p(a) < DataDB.item_price_p(b))
		for id in ids:
			var it := DataDB.item(id)
			var price := DataDB.item_price_p(id)
			var owned := InventoryRules.count(s, id)
			var sub := "%s  •  %s" % [Money.fmt(price), it.get("desc", "")]
			if it.has("effects"):
				sub += "\n" + _effects_text(it["effects"])
			if owned > 0:
				sub += "  •  You have %d" % owned
			var btns := [UI.small_button("Buy", func(): _buy(id, 1, shop), UI.ACCENT.darkened(0.3))]
			if int(it.get("stack", 1)) >= 5:
				btns.append(UI.small_button("Buy 5", func(): _buy(id, 5, shop)))
			list.add_child(UI.row(str(it["name"]), sub, btns, UI.item_icon(id)))
	else:
		var seen := {}
		for e in s["inventory"]:
			var id: String = e["id"]
			if seen.has(id):
				continue
			seen[id] = true
			var it := DataDB.item(id)
			var n := InventoryRules.count(s, id)
			var sp := InventoryRules.sell_price(id)
			var b := UI.small_button("Sell (%s)" % Money.fmt(sp), func(): GameManager.act("sell_item", {"id": id, "qty": 1}))
			if InventoryRules.is_equipped(s, id) and n <= 1:
				b.disabled = true
				b.text = "Wearing"
			list.add_child(UI.row("%s x%d" % [it["name"], n], str(it.get("desc", "")), [b], UI.item_icon(id)))
		if seen.is_empty():
			list.add_child(UI.label("Nothing to sell.", 20, UI.MUTED))


static func _buy(id: String, qty: int, shop: String) -> void:
	var r := GameManager.act("buy_item", {"id": id, "qty": qty, "shop": shop})
	if r.get("ok", false) or r.get("pending", false):
		AudioManager.play_sfx("cash")


static func _effects_text(fx: Dictionary) -> String:
	var parts := []
	for k in fx:
		var v := int(fx[k])
		parts.append("%s %s%d" % [str(k).capitalize(), "+" if v >= 0 else "", v])
	return ", ".join(parts)


static func build_services(list: VBoxContainer, shop: String) -> void:
	for id in DataDB.services_for_shop(shop):
		var sv: Dictionary = DataDB.services[id]
		var price := DataDB.to_pence(sv["price"])
		var on_buy := func():
			var r := GameManager.act("buy_service", {"id": id})
			if r.get("ok", false):
				AudioManager.play_sfx("cash")
		var b := UI.small_button(Money.fmt(price), on_buy, UI.ACCENT.darkened(0.3))
		list.add_child(UI.row(str(sv["name"]), str(sv.get("desc", "")) + "\n" + _effects_text(sv.get("effects", {})), [b]))
