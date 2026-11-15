class_name MissionsPanel
extends RefCounted
## Mission log (main story, side, daily, job, driving, business, exploration
## and favours for friends) plus the boss Challenge Board.

const CAT_NAMES := {"main": "Main Story", "daily": "Daily", "side": "Side", "job": "Career", "driving": "Driving",
	"business": "Business", "exploration": "Exploration", "npc": "Favours"}
const CAT_COLORS := {"main": Color(0.95, 0.65, 0.2), "daily": Color(0.3, 0.75, 0.95), "side": Color(0.6, 0.8, 0.4), "job": Color(0.85, 0.5, 0.9),
	"driving": Color(0.95, 0.4, 0.35), "business": Color(0.4, 0.55, 0.95), "exploration": Color(0.3, 0.85, 0.7), "npc": Color(0.95, 0.85, 0.35)}


static func open(parent: Node) -> void:
	var m := Modal.open(parent, "Missions", 900, 650)
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
	var mm: Dictionary = s["missions"]
	v.add_child(UI.label("Completed: %d missions. Tap Track to show a mission on your HUD and minimap." % int(s["stats"]["missions_completed"]), 17, UI.MUTED))
	var order := ["main", "daily", "npc", "side", "job", "driving", "business", "exploration"]
	for cat in order:
		var ids := []
		for id in mm["active"]:
			if str(MissionManager.definition(id).get("category", "")) == cat:
				ids.append(id)
		if ids.is_empty():
			continue
		v.add_child(UI.label(CAT_NAMES[cat], 22, CAT_COLORS[cat]))
		for id in ids:
			_mission_card(v, id)
	v.add_child(UI.small_button("Boss challenges →", func(): open_challenges(UI.host(v))))


static func _mission_card(v: VBoxContainer, id: String) -> void:
	var d := MissionManager.definition(id)
	var tracked: bool = GameManager.state["missions"]["tracked"] == id
	var c := UI.card(Color(0.16, 0.24, 0.3) if tracked else UI.CARD, 14)
	var col := UI.vbox(4)
	c.add_child(col)
	var top := UI.hbox(8)
	var t := UI.label(str(d.get("title", id)), 21)
	UI.expand(t)
	top.add_child(t)
	if not tracked:
		top.add_child(UI.small_button("Track", func(): MissionManager.track(id)))
	else:
		top.add_child(UI.label("TRACKED", 15, UI.ACCENT))
	col.add_child(top)
	col.add_child(UI.label(str(d.get("desc", "")), 16, UI.MUTED))
	var objs: Array = d.get("objectives", [])
	for i in objs.size():
		var o: Dictionary = objs[i]
		var have := MissionManager.objective_progress(id, i)
		var need := float(o["count"])
		var done := have >= need
		var txt := ("✓ " if done else "• ") + str(o["text"])
		if need > 1 and not (o["type"] in ["time_trial", "stat_above"]):
			txt += "  (%s/%s)" % [_num(have), _num(need)]
		col.add_child(UI.label(txt, 17, UI.GOOD if done else UI.TEXT))
		if o["type"] == "time_trial" and not done:
			var rid: String = o["target"]
			var limit: float = need
			var tree := v.get_tree()
			var start_tt := func():
				Modal.close_all(tree)
				var w := tree.current_scene
				if w and "race" in w:
					w.race.start_time_trial(rid, limit)
			col.add_child(UI.small_button("Start time trial (be in a vehicle)", start_tt))
	var rw: Dictionary = d.get("rewards", {})
	var parts := []
	if rw.has("money"):
		parts.append(Money.fmt(DataDB.to_pence(rw["money"])))
	for e in rw.get("items", []):
		parts.append("%dx %s" % [int(e["qty"]), DataDB.item_name(e["id"])])
	if rw.has("friendship"):
		parts.append("+%d friendship" % int(rw["friendship"]))
	col.add_child(UI.label("Reward: " + ", ".join(parts), 16, UI.ACCENT2))
	v.add_child(c)


static func _num(x: float) -> String:
	if x >= 1000:
		return "%s" % Money.fmt(int(x) * 100).substr(1)
	return str(int(x))


# ------------------------------------------------------------------ challenges

static func open_challenges(parent: Node) -> void:
	var m := Modal.open(parent, "Challenge Board", 900, 650)
	var v := m.scroll_list(10)
	UI.live(v, func(): _fill_challenges(v))


static func _fill_challenges(v: VBoxContainer) -> void:
	UI.clear(v)
	var s := GameManager.state
	v.add_child(UI.label("Special boss challenges with big prizes. Pick a difficulty - harder means bigger rewards. Prizes pay once per difficulty.", 17, UI.MUTED))
	for cid in DataDB.challenges:
		var d: Dictionary = DataDB.challenges[cid]
		var r := ChallengeRules.rec(s, cid)
		var c := UI.card(Color(0.22, 0.14, 0.18), 16)
		var col := UI.vbox(6)
		c.add_child(col)
		col.add_child(UI.label(str(d["name"]), 24, UI.ACCENT2))
		col.add_child(UI.label("Rival: " + str(d["rival"]), 17, UI.WARN))
		col.add_child(UI.label(str(d["desc"]), 17, UI.MUTED))
		var wins: Array = r.get("wins", [])
		if not wins.is_empty():
			col.add_child(UI.label("Won on: " + ", ".join(wins.map(func(x): return str(x).capitalize())), 16, UI.GOOD))
		if ChallengeRules.is_active(s, cid):
			col.add_child(UI.label("IN PROGRESS (%s): %s" % [str(r["difficulty"]).capitalize(), ChallengeRules.progress_text(s, cid)], 18, UI.TEXT))
			var row := UI.hbox(8)
			if cid == "street_racing":
				row.add_child(UI.expand(UI.small_button("Set waypoint to race start", func(): _waypoint_events(v))))
			row.add_child(UI.expand(UI.small_button("Give up", func(): GameManager.act("abandon_challenge", {"id": cid}), Color(0.45, 0.2, 0.22))))
			col.add_child(row)
		else:
			var row2 := UI.hbox(8)
			for diff in ChallengeRules.DIFFS:
				var cfg: Dictionary = d["difficulties"][diff]
				var txt := "%s\n%s" % [diff.capitalize(), Money.fmt(DataDB.to_pence(cfg["reward"]))]
				row2.add_child(UI.expand(UI.button(txt, func(): GameManager.act("start_challenge", {"id": cid, "difficulty": diff}), 72, [Color(0.2, 0.45, 0.3), Color(0.45, 0.4, 0.15), Color(0.5, 0.18, 0.18)][ChallengeRules.DIFFS.find(diff)])))
			col.add_child(row2)
			col.add_child(UI.label(_requirements_text(cid, d), 15, UI.MUTED))
		v.add_child(c)


static func _requirements_text(cid: String, d: Dictionary) -> String:
	match cid:
		"business_tycoon":
			return "Requires a business. Easy: beat ~£1.2k/day, Normal ~£2.6k/day, Hard ~£5.2k/day over 7 days."
		"street_racing":
			return "Race 3 rivals around the east side. Start at the Events Plaza (Business District)."
		"property_mogul":
			var parts := []
			for diff in ChallengeRules.DIFFS:
				var cfg: Dictionary = d["difficulties"][diff]
				parts.append("%s: own %d worth %s in %d days" % [diff.capitalize(), int(cfg["count"]), Money.fmt(DataDB.to_pence(cfg["value"])), int(cfg["days"])])
			return "; ".join(parts)
		"career_challenge":
			var parts2 := []
			for diff in ChallengeRules.DIFFS:
				var cfg2: Dictionary = d["difficulties"][diff]
				parts2.append("%s: %d shifts averaging %d%%" % [diff.capitalize(), int(cfg2["shifts"]), int(cfg2["avg_perf"])])
			return "Requires a job. " + "; ".join(parts2) + " within 5 days."
	return ""


static func _waypoint_events(v: Control) -> void:
	var w := v.get_tree().current_scene
	if w and "hud" in w and w.hud:
		w.hud.set_waypoint(CityLayout.location_pos("events"))
		GameManager.toast("Waypoint set: Events Plaza", "info")
