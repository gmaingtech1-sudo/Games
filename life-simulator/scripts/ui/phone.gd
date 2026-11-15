class_name Phone
extends RefCounted
## The in-game smartphone: a home screen of apps (Bank, Jobs, Messages, Map,
## Shop, Missions, Property, Vehicles, Business, Character, Inventory,
## Friends, Challenges, Achievements, Settings, Save).

const APPS := [
	["bank", "Bank", Color(0.15, 0.6, 0.4)], ["jobs", "Jobs", Color(0.25, 0.45, 0.85)], ["messages", "Messages", Color(0.2, 0.7, 0.3)],
	["map", "Map", Color(0.3, 0.65, 0.35)], ["shop", "Shop", Color(0.9, 0.5, 0.2)], ["missions", "Missions", Color(0.85, 0.65, 0.15)],
	["property", "Homes", Color(0.75, 0.35, 0.6)], ["vehicles", "Vehicles", Color(0.8, 0.25, 0.25)], ["business", "Business", Color(0.35, 0.4, 0.8)],
	["character", "Me", Color(0.5, 0.4, 0.75)], ["inventory", "Bag", Color(0.6, 0.45, 0.3)], ["friends", "Friends", Color(0.9, 0.4, 0.55)],
	["challenges", "Challenges", Color(0.7, 0.2, 0.25)], ["achievements", "Awards", Color(0.85, 0.7, 0.2)], ["settings", "Settings", Color(0.4, 0.45, 0.5)],
	["save", "Save", Color(0.25, 0.55, 0.6)],
]


static func open(parent: Node, app: String = "") -> void:
	for m in parent.get_tree().get_nodes_in_group("phone"):
		m.close()
	var vp: Vector2 = parent.get_viewport().get_visible_rect().size
	var w := minf(500.0, vp.x - 20)
	var h := minf(700.0, vp.y - 16)
	var m := Modal.open(parent, "", w, h)
	m.add_to_group("phone")
	m.panel.add_theme_stylebox_override("panel", UI.box(Color(0.03, 0.04, 0.07), 34, Color(0.25, 0.27, 0.32), 6))
	# Move the phone to the right-hand side like it's held up.
	m.panel.anchor_left = 1.0
	m.panel.anchor_right = 1.0
	# Modal._ready has already run (it centred the panel), so re-place it now.
	m.panel.offset_left = -w - 24
	m.panel.offset_right = -24
	AudioManager.play_sfx("phone", 1.0, -6.0)
	_show(m, app)


static func _show(m: Modal, app: String) -> void:
	UI.clear(m.body)
	var s := GameManager.state
	m.title_label.text = "%s   %s" % [WorldClock.time_string(), _app_name(app) if app != "" else "Day %d" % WorldClock.day]
	m.title_label.add_theme_font_size_override("font_size", 22)
	var content := UI.vbox(8)
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	m.body.add_child(content)
	match app:
		"":
			_home(m, content)
		"bank":
			BankPanel.build(content, false)
		"jobs":
			JobsPanel.build(content)
		"messages":
			SocialPanel.build_messages(content)
		"map":
			var mm := Minimap.new()
			mm.full_map = true
			mm.world = m.get_tree().current_scene
			mm.size_flags_vertical = Control.SIZE_EXPAND_FILL
			mm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			content.add_child(mm)
			content.add_child(UI.label("Circles are key places. Your homes are green, your vehicles yellow. Yellow dot = waypoint.", 14, UI.MUTED))
		"shop":
			ShopPanel.build(content, "online")
		"missions":
			MissionsPanel.build(content)
		"property":
			PropertyPanel.build(content)
		"vehicles":
			var v := UI.vbox(8)
			var sc := UI.scroll()
			v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			sc.add_child(v)
			content.add_child(sc)
			UI.live(v, func(): VehiclePanel.build_mine(v, false))
		"business":
			var bv := UI.vbox(8)
			var bsc := UI.scroll()
			bv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			bsc.add_child(bv)
			content.add_child(bsc)
			UI.live(bv, func(): _business_app(bv))
		"character":
			CharacterPanel.build(content)
		"inventory":
			InventoryPanel.build(content)
		"friends":
			var fv := UI.vbox(8)
			var fsc := UI.scroll()
			fv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			fsc.add_child(fv)
			content.add_child(fsc)
			UI.live(fv, func(): UI.clear(fv); SocialPanel.build_contacts(fv))
		"challenges":
			var cv := UI.vbox(8)
			var csc := UI.scroll()
			cv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			csc.add_child(cv)
			content.add_child(csc)
			UI.live(cv, func(): MissionsPanel._fill_challenges(cv))
		"achievements":
			var av := UI.vbox(8)
			var asc := UI.scroll()
			av.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			asc.add_child(av)
			content.add_child(asc)
			AchievementsPanel.build(av)
		"settings":
			var sv := UI.vbox(10)
			var ssc := UI.scroll()
			sv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			ssc.add_child(sv)
			content.add_child(ssc)
			SettingsPanel.build(sv)
		"save":
			_save_app(content)
	if app != "":
		var home := UI.button("◀  Home", func(): _show(m, ""), 56, Color(0.15, 0.17, 0.22))
		m.body.add_child(home)


static func _app_name(app: String) -> String:
	for a in APPS:
		if a[0] == app:
			return a[1]
	return app


static func _home(m: Modal, content: VBoxContainer) -> void:
	var s := GameManager.state
	var info := UI.card(Color(0.1, 0.13, 0.2), 18)
	info.add_child(UI.label("%s\nCash %s • Bank %s\n%s" % [s["name"], Money.fmt(int(s["cash"])), Money.fmt(int(s["bank"])), JobRules.current_title(s)], 18))
	content.add_child(info)
	var sc := UI.scroll()
	var g := GridContainer.new()
	g.columns = 4
	g.add_theme_constant_override("h_separation", 10)
	g.add_theme_constant_override("v_separation", 12)
	g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(g)
	content.add_child(sc)
	var unread := SocialPanel.unread_count()
	for a in APPS:
		var id: String = a[0]
		if id == "save" and MultiplayerManager.is_online():
			continue
		var b := Button.new()
		b.text = a[1] + (" (%d)" % unread if id == "messages" and unread > 0 else "")
		b.custom_minimum_size = Vector2(96, 96)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_size_override("font_size", 15)
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.add_theme_stylebox_override("normal", UI.box(a[2], 22))
		b.add_theme_stylebox_override("hover", UI.box(a[2].lightened(0.15), 22))
		b.add_theme_stylebox_override("pressed", UI.box(a[2].darkened(0.2), 22))
		b.pressed.connect(func(): AudioManager.play_sfx("ui_click"); _show(m, id))
		g.add_child(b)


static func _business_app(v: VBoxContainer) -> void:
	UI.clear(v)
	var s := GameManager.state
	if s["businesses"].is_empty():
		v.add_child(UI.label("You don't own a business yet. Visit the Apex Business Centre in the Business District, or a shop with a FOR SALE listing.", 17, UI.MUTED))
		v.add_child(UI.small_button("Browse businesses for sale", func(): BusinessPanel.open(UI.host(v))))
		return
	for b in s["businesses"]:
		BusinessPanel._manage(v, b)


static func _save_app(content: VBoxContainer) -> void:
	content.add_child(UI.label("Your game autosaves every few minutes, when you sleep, and when you leave the app.", 17, UI.MUTED))
	content.add_child(UI.button("Save now (slot %d)" % GameManager.current_slot, func(): SaveManager.save_game(GameManager.current_slot), 64, UI.ACCENT.darkened(0.3)))
	content.add_child(UI.label("Save to another slot:", 18))
	for info in SaveManager.list_slots():
		var slot: int = info["slot"]
		if slot == GameManager.current_slot:
			continue
		var txt := "Slot %d - %s" % [slot, "Empty" if not info["exists"] else ("Damaged" if info["corrupt"] else "%s, Day %d (overwrite)" % [info["meta"].get("name", "?"), int(info["meta"].get("day", 1))])]
		var save_to := func():
			GameManager.current_slot = slot
			SaveManager.save_game(slot)
		content.add_child(UI.button(txt, save_to, 60))
