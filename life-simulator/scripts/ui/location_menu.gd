class_name LocationMenu
extends RefCounted
## The menu shown when you walk up to a building's door. Offers everything
## that location supports (shopping, jobs, shifts, banking, homes, etc.).


static func open(world: Node, loc_id: String) -> void:
	var l: Dictionary = CityLayout.LOCATIONS.get(loc_id, {})
	if l.is_empty():
		return
	var hud: Node = world.hud
	var m := Modal.open(hud, str(l["name"]), 720, 600)
	var list := m.scroll_list(10)
	UI.live(list, func(): _build(world, m, list, loc_id, l))


static func _build(world: Node, m: Modal, list: VBoxContainer, loc_id: String, l: Dictionary) -> void:
	UI.clear(list)
	var hud: Node = world.hud
	var s := GameManager.state
	var district := CityLayout.location_district(loc_id)
	list.add_child(UI.label(CityLayout.DISTRICTS.get(district, {}).get("name", ""), 17, UI.MUTED))
	for f in l["features"]:
		var parts: PackedStringArray = str(f).split(":")
		var kind := parts[0]
		var arg := parts[1] if parts.size() > 1 else ""
		match kind:
			"shop":
				list.add_child(UI.button("Browse the shop", func(): ShopPanel.open(hud, arg), 68, UI.ACCENT.darkened(0.3)))
			"services":
				ShopPanel.build_services(list, arg)
			"work":
				_work_options(world, m, list, loc_id)
			"jobs":
				list.add_child(UI.button("Job listings", func(): JobsPanel.open(hud), 64))
			"challenges":
				list.add_child(UI.button("Challenge Board (boss challenges)", func(): MissionsPanel.open_challenges(hud), 64))
			"atm":
				list.add_child(UI.button("Use the ATM", func(): BankPanel.open(hud, true), 60))
			"bank":
				list.add_child(UI.button("Banking (deposit, withdraw, statements)", func(): BankPanel.open(hud, false), 64, UI.ACCENT.darkened(0.3)))
			"estate":
				list.add_child(UI.label("Aisha Khan Lettings: homes to rent and buy.", 18, UI.MUTED))
				list.add_child(UI.button("View properties", func(): PropertyPanel.open(hud), 64, UI.ACCENT.darkened(0.3)))
			"college":
				list.add_child(UI.label("Study for qualifications that unlock better careers.", 18, UI.MUTED))
				list.add_child(UI.button("Courses", func(): JobsPanel.open_college(hud), 64, UI.ACCENT.darkened(0.3)))
			"dealership":
				list.add_child(UI.button("Browse vehicles", func(): VehiclePanel.open_dealer(hud), 64, UI.ACCENT.darkened(0.3)))
				list.add_child(UI.button("Sell a vehicle", func(): VehiclePanel.open_mine(hud, true), 60))
			"garage":
				list.add_child(UI.button("Repairs, paint & engine upgrades", func(): VehiclePanel.open_garage(hud), 64, UI.ACCENT.darkened(0.3)))
			"fuel":
				VehiclePanel.build_fuel(list)
			"business":
				list.add_child(UI.button("Businesses for sale & management", func(): BusinessPanel.open(hud), 64, UI.ACCENT.darkened(0.3)))
			"biz":
				BusinessPanel.build_one(list, arg, hud)
			"home":
				_home_options(world, m, list, arg)
			"race":
				if ChallengeRules.is_active(s, "street_racing"):
					list.add_child(UI.button("START THE STREET RACE", func(): m.close(); world.race.start_street_race(), 72, Color(0.75, 0.2, 0.2)))
				else:
					list.add_child(UI.label("Enter the Street Racing challenge at the Challenge Board to race here.", 18, UI.MUTED))
			"police_info":
				list.add_child(UI.label("The police station is always looking for new recruits. Complete Police Training at City College to apply.", 18, UI.MUTED))


static func _work_options(world: Node, m: Modal, list: VBoxContainer, loc_id: String) -> void:
	var s := GameManager.state
	var my_job := JobRules.job_def(s["job"]["id"])
	if not my_job.is_empty() and my_job["workplace"] == loc_id:
		var reason := JobRules.can_start_shift(s)
		var txt := "Start shift as %s (%s/shift)" % [JobRules.current_title(s), Money.fmt(JobRules.shift_pay(s))]
		var b := UI.button(txt, func(): m.close(); world.start_shift(), 72, Color(0.15, 0.55, 0.35))
		list.add_child(b)
		if reason != "":
			b.disabled = true
			list.add_child(UI.label(reason, 17, UI.WARN))
	for jid in DataDB.job_order:
		var j: Dictionary = DataDB.jobs[jid]
		if j["workplace"] != loc_id or jid == s["job"]["id"]:
			continue
		var unmet := JobRules.unmet_requirements(s, jid)
		var sub := "%s • %02d:00-%02d:00 • from %s/shift" % [j["employer"], int(j["start"]), int(j["end"]) % 24, Money.fmt(DataDB.to_pence(j["levels"][0]["pay"]))]
		if not unmet.is_empty():
			sub += "\nNeeds: " + ", ".join(unmet)
		var apply := UI.small_button("Apply", func(): GameManager.act("apply_job", {"id": jid}))
		apply.disabled = not unmet.is_empty()
		list.add_child(UI.row("Vacancy: " + str(j["name"]), sub, [apply]))


static func _home_options(world: Node, m: Modal, list: VBoxContainer, pid: String) -> void:
	var s := GameManager.state
	var rec := PropertyRules.find(s, pid)
	var d := PropertyRules.def(pid)
	if not rec.is_empty():
		list.add_child(UI.label("Your %s (%s)" % [d["type_name"], "owned" if rec["mode"] == "own" else "rented"], 20, UI.GOOD))
		list.add_child(UI.button("Enter home", func(): m.close(); world.enter_home(pid), 72, UI.ACCENT.darkened(0.2)))
		list.add_child(UI.button("Manage property", func(): PropertyPanel.open(world.hud, pid), 60))
	else:
		PropertyPanel.build_listing(list, pid)
