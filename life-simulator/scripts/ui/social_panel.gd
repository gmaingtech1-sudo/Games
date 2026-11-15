class_name SocialPanel
extends RefCounted
## Contacts (friendship levels) and the Messages app.


static func build_contacts(v: VBoxContainer) -> void:
	var s := GameManager.state
	var any := false
	for id in DataDB.npc_order:
		var rel: Dictionary = s["relationships"].get(id, {})
		if not rel.get("met", false):
			continue
		any = true
		var d: Dictionary = DataDB.npcs[id]
		var f := float(rel.get("friendship", 0))
		var sub := "%s • %s (%d/100)%s\nLikes: %s gifts" % [d["occupation"], DataDB.friendship_level_name(f), int(f), " • Dating ♥" if rel.get("status", "") == "dating" else "", DataDB.categories.get(d["likes"], {}).get("name", d["likes"])]
		if MissionManager.npc_mission_available(id):
			sub += "\nHas a favour to ask you!"
		var c := UI.row(str(d["name"]), sub)
		v.add_child(c)
		v.add_child(UI.bar(f, Color(0.95, 0.5, 0.65), 8))
	if not any:
		v.add_child(UI.label("You haven't met anyone yet. Walk up to people around the city and talk to them.", 17, UI.MUTED))


static func build_messages(parent: Control) -> void:
	var sc := UI.scroll()
	var v := UI.vbox(8)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	parent.add_child(sc)
	UI.live(v, func(): _fill_messages(v))


static func _fill_messages(v: VBoxContainer) -> void:
	UI.clear(v)
	var msgs: Array = GameManager.state["messages"].duplicate()
	msgs.reverse()
	if msgs.is_empty():
		v.add_child(UI.label("No messages.", 18, UI.MUTED))
	for m in msgs:
		var c := UI.card(UI.CARD if m.get("read", false) else Color(0.16, 0.26, 0.36), 14)
		var col := UI.vbox(2)
		col.add_child(UI.label("%s  •  %s" % [m["from"], UI.fmt_time(int(m["day"]), int(m["minute"]))], 16, UI.ACCENT))
		col.add_child(UI.label(str(m["text"]), 18))
		c.add_child(col)
		v.add_child(c)
	for m in GameManager.state["messages"]:
		m["read"] = true


static func unread_count() -> int:
	var n := 0
	for m in GameManager.state.get("messages", []):
		if not m.get("read", false):
			n += 1
	return n
