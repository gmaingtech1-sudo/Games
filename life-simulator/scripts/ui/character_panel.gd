class_name CharacterPanel
extends RefCounted
## Your character: needs, career, qualifications, outfit, stats and friends.


static func open(parent: Node) -> void:
	var m := Modal.open(parent, "Character", 900, 650)
	build(m.body)


static func build(parent: Control) -> void:
	var sc := UI.scroll()
	var v := UI.vbox(8)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	parent.add_child(sc)
	UI.live(v, func(): _fill(v))


static func _fill(v: VBoxContainer) -> void:
	UI.clear(v)
	var s := GameManager.state
	v.add_child(UI.label(str(s["name"]), 30))
	v.add_child(UI.label("%s • Net worth %s • Day %d" % [JobRules.current_title(s), Money.fmt(PlayerState.net_worth(s)), int(s["world"]["day"])], 18, UI.MUTED))
	v.add_child(UI.header("Needs"))
	var cols := {"health": UI.BAD, "hunger": Color(0.95, 0.6, 0.2), "thirst": Color(0.3, 0.65, 0.95), "energy": UI.WARN, "hygiene": Color(0.5, 0.85, 0.85), "happiness": Color(0.85, 0.5, 0.9), "social": UI.GOOD}
	for n in PlayerState.NEEDS:
		var row := UI.hbox(8)
		var l := UI.label("%s %d" % [str(n).capitalize(), int(s["needs"][n])], 18)
		l.custom_minimum_size = Vector2(160, 0)
		row.add_child(l)
		var b := UI.bar(float(s["needs"][n]), cols[n], 16)
		UI.expand(b)
		row.add_child(b)
		v.add_child(row)
	var warn := NeedsRules.warnings(s)
	if not warn.is_empty():
		v.add_child(UI.label("\n".join(warn), 17, UI.WARN))
	v.add_child(UI.label("Tips: eat & drink from your inventory, sleep in a bed, shower at home or the Leisure Centre, chat with people to stay social.", 16, UI.MUTED))
	v.add_child(UI.header("Outfit"))
	for slot in ["top", "bottom", "shoes", "accessory"]:
		var id: String = s["equipped"].get(slot, "")
		v.add_child(UI.label("%s: %s" % [slot.capitalize(), DataDB.item_name(id) if id != "" else "None"], 18))
	v.add_child(UI.label("Smart outfit: " + ("Yes" if InventoryRules.wearing_smart_outfit(s) else "No (needed for office, doctor and manager jobs)"), 17, UI.MUTED))
	v.add_child(UI.small_button("Change clothes (inventory)", func(): InventoryPanel.open(UI.host(v))))
	v.add_child(UI.header("Qualifications"))
	if s["qualifications"].is_empty():
		v.add_child(UI.label("None yet. Study at City College.", 17, UI.MUTED))
	for q in s["qualifications"]:
		v.add_child(UI.label("✓ " + str(DataDB.courses.get(q, {}).get("name", q)), 18, UI.GOOD))
	v.add_child(UI.header("Career history"))
	for jid in s["jobs_held"]:
		var j := JobRules.job_def(jid)
		var h: Dictionary = s["jobs_held"][jid]
		v.add_child(UI.label("%s - %s (%d XP)" % [j.get("name", jid), j["levels"][int(h.get("level", 0))]["title"], int(h.get("xp", 0))], 17))
	v.add_child(UI.header("Stats"))
	var st: Dictionary = s["stats"]
	v.add_child(UI.label("Walked %.1f km • Driven %.1f km • Shifts %d • Promotions %d • Missions %d • Items bought %d • Chats %d • Total earned %s" % [
		float(st["distance_walked"]) / 1000.0, float(st["distance_driven"]) / 1000.0, int(st["shifts"]), int(st.get("promotions", 0)), int(st["missions_completed"]), int(st["items_bought"]), int(st["npc_talks"]), Money.fmt(int(st["total_earned"]))], 17, UI.MUTED))
	v.add_child(UI.label("Districts visited: %d / %d" % [st["districts"].size(), CityLayout.DISTRICTS.size()], 17, UI.MUTED))
	v.add_child(UI.header("Friends"))
	SocialPanel.build_contacts(v)
