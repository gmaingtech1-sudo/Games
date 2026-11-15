class_name JobsPanel
extends RefCounted
## Job listings, your current career and promotion progress, and City College courses.


static func open(parent: Node) -> void:
	var m := Modal.open(parent, "Jobs", 900, 650)
	build(m.body)


static func build(parent: Control) -> void:
	var sc := UI.scroll()
	var v := UI.vbox(10)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	parent.add_child(sc)
	UI.live(v, func(): _fill(v))


static func _fill(v: VBoxContainer) -> void:
	UI.clear(v)
	var s := GameManager.state
	var j := JobRules.job_def(s["job"]["id"])
	if j.is_empty():
		v.add_child(UI.label("You're unemployed. Apply for a job below, then go to the workplace during working hours.", 18, UI.WARN))
	else:
		var lvl := int(s["job"]["level"])
		var next_xp := -1
		if lvl < j["levels"].size() - 1:
			next_xp = int(j["levels"][lvl + 1]["xp"])
		var sub := "%s at %s\nShifts %02d:00-%02d:00 at %s • %s per shift" % [JobRules.current_title(s), j["employer"], int(j["start"]), int(j["end"]) % 24, CityLayout.location_name(j["workplace"]), Money.fmt(JobRules.shift_pay(s))]
		if next_xp > 0:
			sub += "\nPromotion to %s at %d XP (you have %d)" % [j["levels"][lvl + 1]["title"], next_xp, int(s["job"]["xp"])]
		else:
			sub += "\nTop of the career ladder!"
		var reason := JobRules.can_start_shift(s)
		sub += "\n" + ("Ready to work now - head to " + CityLayout.location_name(j["workplace"]) if reason == "" else reason)
		var quit := UI.small_button("Quit", func(): UI.confirm(UI.host(v), "Quit your job as %s?" % j["name"], func(): GameManager.act("quit_job"), "Quit"), Color(0.45, 0.2, 0.22))
		v.add_child(UI.row("Current job: " + str(j["name"]), sub, [quit], null, Color(0.14, 0.28, 0.26)))
		if next_xp > 0:
			var prev_xp := int(j["levels"][lvl]["xp"])
			v.add_child(UI.bar(clampf(float(int(s["job"]["xp"]) - prev_xp) / float(next_xp - prev_xp) * 100.0, 0, 100), UI.ACCENT2, 12))
	v.add_child(UI.header("Vacancies"))
	for jid in DataDB.job_order:
		var jd: Dictionary = DataDB.jobs[jid]
		if jid == s["job"]["id"]:
			continue
		var unmet := JobRules.unmet_requirements(s, jid)
		var levels: Array = jd["levels"]
		var sub2 := "%s • %02d:00-%02d:00 • %s to %s per shift\n%s" % [jd["employer"], int(jd["start"]), int(jd["end"]) % 24, Money.fmt(DataDB.to_pence(levels[0]["pay"])), Money.fmt(DataDB.to_pence(levels[-1]["pay"])), jd["desc"]]
		var held: Dictionary = s["jobs_held"].get(jid, {})
		if not held.is_empty():
			sub2 += "\nPreviously: %s (%d XP)" % [levels[int(held.get("level", 0))]["title"], int(held.get("xp", 0))]
		if not unmet.is_empty():
			sub2 += "\nRequires: " + ", ".join(unmet)
		var apply := UI.small_button("Apply", func(): GameManager.act("apply_job", {"id": jid}), UI.ACCENT.darkened(0.3))
		apply.disabled = not unmet.is_empty()
		v.add_child(UI.row(str(jd["name"]), sub2, [apply]))
	v.add_child(UI.label("Qualifications come from City College in Midtown. A smart outfit can be bought at Urban Wardrobe.", 16, UI.MUTED))


static func open_college(parent: Node) -> void:
	var m := Modal.open(parent, "City College", 860, 620)
	var sc := UI.scroll()
	var v := UI.vbox(10)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	m.body.add_child(sc)
	UI.live(v, func(): _fill_college(v))


static func _fill_college(v: VBoxContainer) -> void:
	UI.clear(v)
	var s := GameManager.state
	v.add_child(UI.label("Each session takes a few hours and costs part of the course fee.", 17, UI.MUTED))
	for cid in DataDB.courses:
		var c: Dictionary = DataDB.courses[cid]
		var done := int(s["courses"].get(cid, 0))
		var sessions := int(c["sessions"])
		var have: bool = cid in s["qualifications"]
		var fee := DataDB.to_pence(c["fee"]) / sessions
		var sub := "%s\n%d sessions × %d h • %s per session (total %s)" % [c["desc"], sessions, int(c["hours"]), Money.fmt(fee), Money.fmt(DataDB.to_pence(c["fee"]))]
		if done > 0 and not have:
			sub += "\nProgress: %d/%d" % [done, sessions]
		var b := UI.small_button("Qualified" if have else "Study", func(): GameManager.act("take_course", {"id": cid}), UI.ACCENT.darkened(0.3))
		b.disabled = have
		v.add_child(UI.row(str(c["name"]), sub, [b], null, Color(0.14, 0.28, 0.2) if have else UI.CARD))
