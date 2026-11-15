class_name DialoguePanel
extends RefCounted
## Talking to an NPC: chat, joke, compliment, give a gift, ask about favours
## (NPC missions) and, with a close friend, ask them out.


static func open(world: Node, npc: Node) -> void:
	var d: Dictionary = npc.data
	npc.start_talk(world.player)
	var m := Modal.open(world.hud, str(d.get("name", "")), 760, 600)
	m.closed.connect(func(): if is_instance_valid(npc): npc.end_talk())
	var line_label := UI.label("", 22, Color(1, 0.95, 0.85))
	var v := m.scroll_list(8)
	var state := {"line": "", "gift": false}
	var first_line: String = d.get("lines", ["Hello."])[0]
	var rel: Dictionary = GameManager.state["relationships"].get(npc.npc_id, {})
	if not rel.get("met", false):
		state["line"] = "Hi, I'm %s. I'm a %s. %s" % [str(d["name"]).split(" ")[0], str(d["occupation"]).to_lower(), first_line]
	else:
		state["line"] = first_line
	var on_result := func(r: Dictionary):
		if r.get("action", "") in ["npc_talk", "npc_gift"] and r.has("line"):
			state["line"] = r["line"]
	GameManager.action_completed.connect(on_result)
	m.closed.connect(func(): GameManager.action_completed.disconnect(on_result))
	UI.live(v, func(): _fill(v, npc, state, m))


static func _fill(v: VBoxContainer, npc: Node, state: Dictionary, m: Modal) -> void:
	UI.clear(v)
	var id: String = npc.npc_id
	var d: Dictionary = npc.data
	var s := GameManager.state
	var f := RelationshipRules.friendship(s, id)
	var rel: Dictionary = s["relationships"].get(id, {})
	v.add_child(UI.label("%s • %s (%d/100)%s" % [d["occupation"], DataDB.friendship_level_name(f), int(f), "  ♥ Dating" if rel.get("status", "") == "dating" else ""], 18, UI.MUTED))
	v.add_child(UI.bar(f, Color(0.95, 0.5, 0.65), 10))
	var bubble := UI.card(Color(0.2, 0.22, 0.3), 16)
	bubble.add_child(UI.label("\"" + str(state["line"]) + "\"", 22, Color(1, 0.95, 0.85)))
	v.add_child(bubble)
	if state["gift"]:
		v.add_child(UI.header("Give a gift (they like %s)" % DataDB.categories.get(d["likes"], {}).get("name", d["likes"])))
		var seen := {}
		for e in s["inventory"]:
			var iid: String = e["id"]
			if seen.has(iid) or iid == "phone_basic":
				continue
			seen[iid] = true
			if InventoryRules.is_equipped(s, iid) and InventoryRules.count(s, iid) <= 1:
				continue
			var liked: bool = DataDB.item(iid).get("category", "") == d["likes"]
			v.add_child(UI.row(DataDB.item_name(iid) + ("  ♥" if liked else ""), "", [UI.small_button("Give", func(): state["gift"] = false; GameManager.act("npc_gift", {"id": id, "item": iid}))], UI.item_icon(iid, 44)))
		v.add_child(UI.small_button("Back", func(): state["gift"] = false; _fill(v, npc, state, m)))
		return
	var g := GridContainer.new()
	g.columns = 2
	g.add_theme_constant_override("h_separation", 10)
	g.add_theme_constant_override("v_separation", 10)
	g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for opt in [["Chat", "chat"], ["Tell a joke", "joke"], ["Compliment", "compliment"]]:
		g.add_child(UI.expand(UI.button(opt[0], func(): GameManager.act("npc_talk", {"id": id, "kind": opt[1]}), 64)))
	g.add_child(UI.expand(UI.button("Give a gift", func(): state["gift"] = true; _fill(v, npc, state, m), 64)))
	v.add_child(g)
	# Favours (NPC missions)
	var mid := MissionManager.npc_mission_for(id)
	if mid != "":
		var md: Dictionary = DataDB.missions[mid]
		if s["missions"]["active"].has(mid):
			v.add_child(UI.label("Favour in progress: %s - %s" % [md["title"], md["desc"]], 17, UI.ACCENT2))
		elif MissionManager.npc_mission_available(id):
			v.add_child(UI.label("%s has a favour to ask: %s" % [str(d["name"]).split(" ")[0], md["desc"]], 18, UI.ACCENT2))
			v.add_child(UI.button("Accept favour: " + str(md["title"]), func(): MissionManager.accept_npc_mission(id); state["line"] = "Thank you so much!"; _fill(v, npc, state, m), 64, Color(0.5, 0.4, 0.1)))
		else:
			v.add_child(UI.label("Become better friends and they might ask you for a favour.", 16, UI.MUTED))
	if f >= 60.0 and rel.get("status", "") != "dating":
		v.add_child(UI.button("Ask them out ♥", func(): GameManager.act("npc_talk", {"id": id, "kind": "ask_out"}), 60, Color(0.6, 0.25, 0.4)))
	v.add_child(UI.button("Goodbye", func(): m.close(), 56))
	v.add_child(UI.label("You can chat 3 times a day for friendship. Gifts they like count double. Being clean and well-dressed helps!", 15, UI.MUTED))
