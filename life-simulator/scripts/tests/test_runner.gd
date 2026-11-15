extends Node
## Automated tests. Run headless:
##   godot --headless --path . res://scenes/tests/test_runner.tscn
## Exit code 0 = all passed. Uses separate save/achievement files.

var passed := 0
var failed := 0
var _section := ""


func _ready() -> void:
	# Keep the runner alive across scene changes: hand "current scene" to a dummy.
	await get_tree().process_frame
	var dummy := Node.new()
	dummy.name = "Dummy"
	get_tree().root.add_child(dummy)
	get_tree().current_scene = dummy
	SaveManager.save_dir = "user://test_saves"
	AchievementManager.path = "user://test_achievements.json"
	AchievementManager.reload_store()
	for i in range(1, 4):
		SaveManager.delete_slot(i)
	await get_tree().process_frame
	test_data()
	test_money()
	test_economy()
	test_inventory()
	test_needs()
	test_jobs()
	test_property()
	test_vehicles()
	test_business()
	test_missions()
	test_challenges()
	test_relationships()
	test_router()
	test_validation()
	test_save_load()
	test_achievements()
	await test_scenes()
	print("\n==== RESULTS: %d passed, %d failed ====" % [passed, failed])
	for i in range(1, 4):
		SaveManager.delete_slot(i)
	get_tree().quit(0 if failed == 0 else 1)


func section(n: String) -> void:
	_section = n
	print("\n-- ", n)


func check(cond: bool, what: String) -> void:
	if cond:
		passed += 1
	else:
		failed += 1
		print("  FAIL [%s] %s" % [_section, what])


func fresh() -> Dictionary:
	return PlayerState.new_state("Tester")


func at(s: Dictionary, day: int, hour: int) -> void:
	s["world"]["day"] = day
	s["world"]["minute"] = hour * 60


# ------------------------------------------------------------------ unit tests

func test_data() -> void:
	section("Data")
	check(DataDB.load_errors.is_empty(), "no data load errors: %s" % str(DataDB.load_errors))
	check(DataDB.items.size() >= 50, "items loaded (%d)" % DataDB.items.size())
	check(DataDB.jobs.size() == 9, "9 jobs")
	check(DataDB.vehicles.size() >= 8, "vehicles loaded")
	check(DataDB.properties.size() >= 7, "properties loaded")
	check(DataDB.businesses.size() == 6, "6 business types")
	check(DataDB.npcs.size() == 16, "16 NPCs")
	check(DataDB.missions.size() >= 30, "missions loaded (%d)" % DataDB.missions.size())
	check(DataDB.challenges.size() == 4, "4 boss challenges")
	check(DataDB.achievements.size() >= 20, "achievements loaded")
	for cat in ["food", "drink", "clothing", "electronics", "furniture", "tools", "vehicle_parts", "collectibles"]:
		var n := 0
		for id in DataDB.items:
			if DataDB.items[id]["category"] == cat:
				n += 1
		check(n > 0, "category %s has items" % cat)
	# Every NPC location and job workplace exists in the city layout.
	for id in DataDB.npcs:
		for k in ["home", "work", "leisure"]:
			check(CityLayout.LOCATIONS.has(DataDB.npcs[id][k]), "npc %s %s location exists" % [id, k])
	for jid in DataDB.jobs:
		check(CityLayout.LOCATIONS.has(DataDB.jobs[jid]["workplace"]), "job %s workplace exists" % jid)
	for bid in DataDB.businesses:
		check(CityLayout.LOCATIONS.has(DataDB.businesses[bid]["location"]), "business %s location exists" % bid)
	for pid in DataDB.properties:
		check(CityLayout.LOCATIONS.has(pid), "property %s location exists" % pid)
	for r in CityLayout.ROUTES:
		for p in CityLayout.ROUTES[r]:
			var on_road := false
			for i in CityLayout.N + 1:
				if is_equal_approx(p.x, CityLayout.road_line(i)) or is_equal_approx(p.z, CityLayout.road_line(i)):
					on_road = true
			check(on_road, "route %s point %s on a road" % [r, str(p)])
	for spot in ActionRouter.COLLECTIBLE_SPOTS:
		check(CityLayout.COLLECTIBLES.has(spot), "collectible %s placed" % spot)


func test_money() -> void:
	section("Money")
	check(Money.fmt(100000) == "£1,000", "fmt 1000 -> " + Money.fmt(100000))
	check(Money.fmt(350) == "£3.50", "fmt 3.50 -> " + Money.fmt(350))
	check(Money.fmt(-1250) == "-£12.50", "fmt negative -> " + Money.fmt(-1250))
	check(Money.fmt(123456789) == "£1,234,567", "fmt big -> " + Money.fmt(123456789))
	check(DataDB.to_pence(3.5) == 350, "to_pence")


func test_economy() -> void:
	section("Economy")
	var s := fresh()
	check(int(s["cash"]) == 100000 and int(s["bank"]) == 0, "start with £1,000 cash")
	check(not EconomyRules.pay(s, -5, "neg"), "negative payment rejected")
	check(not EconomyRules.pay(s, 200000, "too much"), "unaffordable rejected")
	check(int(s["cash"]) == 100000, "rejected payment leaves money unchanged")
	var r := EconomyRules.deposit(s, 60000)
	check(r["ok"] and int(s["cash"]) == 40000 and int(s["bank"]) == 60000, "deposit")
	check(not EconomyRules.deposit(s, 999999)["ok"], "cannot deposit more than cash")
	check(not EconomyRules.withdraw(s, 999999)["ok"], "cannot withdraw more than bank")
	check(not EconomyRules.deposit(s, 0)["ok"], "zero deposit rejected")
	check(EconomyRules.pay(s, 50000, "split", "auto"), "auto pay uses cash then bank")
	check(int(s["cash"]) == 0 and int(s["bank"]) == 50000, "split payment correct")
	check(not EconomyRules.pay(s, 1, "cash only", "cash"), "cash-only payment fails with no cash")
	EconomyRules.earn(s, 1234, "test")
	check(int(s["bank"]) == 51234, "earn to bank")
	check(s["transactions"].size() == 3, "transactions logged (%d)" % s["transactions"].size())
	var sm := EconomyRules.summary(s)
	check(sm["income"] == 1234 and sm["expense"] == 50000, "income/expense summary")


func test_inventory() -> void:
	section("Inventory")
	var s := fresh()
	var start_slots := InventoryRules.used_slots(s)
	check(InventoryRules.count(s, "water") == 2, "starter water")
	InventoryRules.add_item(s, "water", 25)
	check(InventoryRules.count(s, "water") == 27, "stacking count")
	check(InventoryRules.used_slots(s) == start_slots + 1, "water stack 20 -> 27 uses 2 slots")
	check(not InventoryRules.add_item(s, "nonexistent", 1), "unknown item rejected")
	var r := InventoryRules.buy(s, "sandwich", 2, "supermarket")
	check(r["ok"] and int(s["cash"]) == 100000 - 700, "buy sandwich x2")
	check(not InventoryRules.buy(s, "sofa", 1, "supermarket")["ok"], "can't buy sofa at supermarket")
	check(not InventoryRules.buy(s, "sandwich", 0, "supermarket")["ok"], "zero qty rejected")
	check(not InventoryRules.buy(s, "piano", 1, "furniture")["ok"], "can't afford piano")
	check(not InventoryRules.sell(s, "tshirt_white", 1)["ok"], "can't sell equipped clothes")
	var before := float(s["needs"]["hunger"])
	s["needs"]["hunger"] = 20.0
	r = InventoryRules.use(s, "sandwich")
	check(r["ok"] and float(s["needs"]["hunger"]) == 50.0, "eating raises hunger")
	# Fill inventory
	var s2 := fresh()
	var ok := true
	var i := 0
	while InventoryRules.used_slots(s2) < InventoryRules.capacity(s2):
		ok = InventoryRules.add_item(s2, "sofa", 1) and ok
		i += 1
		if i > 100:
			break
	check(not InventoryRules.add_item(s2, "piano", 1), "full inventory rejects new stack")
	check(not InventoryRules.buy(s2, "piano", 1, "furniture")["ok"], "full inventory blocks purchase")
	check(InventoryRules.remove_item(s2, "sofa", 1), "remove item")
	InventoryRules.add_item(s2, "backpack", 1)
	check(InventoryRules.capacity(s2) == PlayerState.BASE_CAPACITY + 10, "backpack adds capacity")
	r = InventoryRules.equip(s, "tshirt_white")
	check(r["ok"], "equip owned clothing")
	check(not InventoryRules.equip(s, "suit_jacket")["ok"], "can't equip unowned clothing")
	check(not InventoryRules.wearing_smart_outfit(s), "starter outfit isn't smart")


func test_needs() -> void:
	section("Needs")
	var s := fresh()
	NeedsRules.tick(s, 600.0, "idle")
	check(float(s["needs"]["hunger"]) < 80.0, "hunger decays")
	check(float(s["needs"]["energy"]) < 90.0, "energy decays")
	s["needs"]["hunger"] = 0.0
	s["needs"]["thirst"] = 0.0
	var h := float(s["needs"]["health"])
	NeedsRules.tick(s, 120.0, "idle")
	check(float(s["needs"]["health"]) < h, "starving drains health")
	for n in PlayerState.NEEDS:
		check(float(s["needs"][n]) >= 0.0 and float(s["needs"][n]) <= 100.0, "need %s clamped" % n)
	s["needs"]["energy"] = 10.0
	NeedsRules.sleep(s, 8.0, 1.0)
	check(float(s["needs"]["energy"]) > 80.0, "sleep restores energy")
	check(not NeedsRules.warnings(s).is_empty(), "warnings when starving")


func test_jobs() -> void:
	section("Jobs")
	var s := fresh()
	check(not JobRules.apply(s, "police_officer")["ok"], "police needs training")
	check(not JobRules.apply(s, "office_worker")["ok"], "office needs smart outfit")
	check(JobRules.apply(s, "shop_assistant")["ok"], "apply shop assistant")
	check(s["job"]["id"] == "shop_assistant", "job set")
	at(s, 1, 7)
	check(not JobRules.work_shift(s, 1.0)["ok"], "can't work before shift")
	at(s, 1, 9)
	var bank_before := int(s["bank"])
	var r := JobRules.work_shift(s, 1.0)
	check(r["ok"], "shift at 09:00 succeeds: " + str(r.get("msg")))
	check(int(s["bank"]) > bank_before, "wages paid to bank")
	check(not JobRules.work_shift(s, 1.0)["ok"], "only one shift per day")
	# XP and promotion
	for d in range(2, 12):
		at(s, d, 9)
		s["needs"]["energy"] = 100.0
		s["needs"]["hunger"] = 100.0
		s["needs"]["thirst"] = 100.0
		JobRules.work_shift(s, 1.0)
	check(int(s["job"]["level"]) >= 1, "promoted after shifts (level %d)" % int(s["job"]["level"]))
	check(int(s["stats"]["promotions"]) >= 1, "promotion counted")
	# Server rate limit
	var s3 := fresh()
	JobRules.apply(s3, "shop_assistant")
	at(s3, 1, 10)
	check(JobRules.work_shift(s3, 0.5, {"now_msec": 100000})["ok"], "server shift ok")
	at(s3, 2, 10)
	check(not JobRules.work_shift(s3, 0.5, {"now_msec": 101000})["ok"], "server rejects shifts too close together")
	# Courses
	var s2 := fresh()
	s2["bank"] = 1000000
	for k in 2:
		s2["needs"]["energy"] = 100.0
		JobRules.take_course(s2, "driving_licence")
	check("driving_licence" in s2["qualifications"], "driving licence earned after 2 sessions")
	check(not JobRules.take_course(s2, "driving_licence")["ok"], "can't retake")
	check(JobRules.apply(s2, "delivery_driver")["ok"], "delivery driver with licence")
	check(JobRules.quit(s2)["ok"] and s2["job"]["id"] == "", "quit job")


func test_property() -> void:
	section("Property")
	var s := fresh()
	s["cash"] = 1000
	check(not PropertyRules.rent(s, "studio_1")["ok"], "rent rejected without money")
	s["cash"] = 100000
	var r := PropertyRules.rent(s, "studio_1")
	check(r["ok"], "rent studio")
	check(s["home"] == "studio_1", "home set")
	check(int(s["cash"]) == 100000 - 28000, "paid rent + deposit")
	s["bank"] = 50000
	at(s, 7, 8)
	PropertyRules.daily(s)
	check(int(s["bank"]) == 50000 - 14000, "weekly rent charged on day 7")
	s["bank"] = 0
	s["cash"] = 0
	for d in [14, 21, 28]:
		at(s, d, 8)
		PropertyRules.daily(s)
	check(PropertyRules.find(s, "studio_1").is_empty(), "evicted after 3 missed rents")
	var s2 := fresh()
	s2["bank"] = 20000000
	check(PropertyRules.buy(s2, "small_house_1")["ok"], "buy house")
	InventoryRules.add_item(s2, "sofa", 1)
	check(PropertyRules.place_furniture(s2, "small_house_1", "sofa")["ok"], "place furniture")
	check(InventoryRules.count(s2, "sofa") == 0, "furniture left inventory")
	var c0 := PropertyRules.comfort(PropertyRules.find(s2, "small_house_1"))
	check(PropertyRules.upgrade(s2, "small_house_1")["ok"], "upgrade property")
	check(PropertyRules.comfort(PropertyRules.find(s2, "small_house_1")) > c0, "upgrade adds comfort")
	check(PropertyRules.decorate(s2, "small_house_1", 2, 3)["ok"], "decorate")
	var bank := int(s2["bank"])
	check(PropertyRules.sell(s2, "small_house_1")["ok"], "sell property")
	check(int(s2["bank"]) > bank, "sale proceeds paid")
	check(InventoryRules.count(s2, "sofa") == 1, "furniture returned on sale")


func test_vehicles() -> void:
	section("Vehicles")
	var s := fresh()
	check(not VehicleRules.buy(s, "hatchback", "#c0392b")["ok"], "vehicle needs bank funds")
	s["bank"] = 1000000
	var r := VehicleRules.buy(s, "hatchback", "#c0392b")
	check(r["ok"], "buy hatchback")
	var uid: String = r["uid"]
	VehicleRules.report(s, uid, 999.0, 0.0, 10.0, [1, 0, 2], 0.0)
	check(float(VehicleRules.find(s, uid)["fuel"]) <= 40.0, "report can't raise fuel")
	VehicleRules.report(s, uid, 10.0, 40.0, 500.0, [1, 0, 2], 0.0)
	VehicleRules.report(s, uid, 10.0, 5.0, 500.0, [1, 0, 2], 0.0)
	check(float(VehicleRules.find(s, uid)["damage"]) == 40.0, "report can't lower damage")
	var cost := VehicleRules.refuel_cost(VehicleRules.find(s, uid))
	check(cost == 4500, "refuel 30L costs £45 (got %d)" % cost)
	check(VehicleRules.refuel(s, uid)["ok"], "refuel")
	check(VehicleRules.repair(s, uid)["ok"] and float(VehicleRules.find(s, uid)["damage"]) == 0.0, "repair")
	check(VehicleRules.paint(s, uid, "#2e6fd1")["ok"], "paint")
	check(not VehicleRules.paint(s, uid, "#123456")["ok"], "invalid colour rejected")
	var ts := VehicleRules.top_speed(VehicleRules.find(s, uid))
	check(VehicleRules.upgrade_engine(s, uid)["ok"], "engine upgrade")
	check(VehicleRules.top_speed(VehicleRules.find(s, uid)) > ts, "engine upgrade adds speed")
	var bank := int(s["bank"])
	check(VehicleRules.sell(s, uid)["ok"] and int(s["bank"]) > bank, "sell vehicle")
	check(s["vehicles"].is_empty(), "vehicle removed")


func test_business() -> void:
	section("Business")
	var s := fresh()
	check(not BusinessRules.buy(s, "restaurant")["ok"], "business needs funds")
	s["bank"] = 50000000
	check(BusinessRules.buy(s, "restaurant")["ok"], "buy restaurant")
	check(BusinessRules.hire(s, "restaurant")["ok"], "hire")
	BusinessRules.hire(s, "restaurant")
	BusinessRules.hire(s, "restaurant")
	check(BusinessRules.buy_stock(s, "restaurant", 1000)["ok"], "buy stock")
	check(not BusinessRules.buy_stock(s, "restaurant", -5)["ok"], "negative stock rejected")
	at(s, 2, 0)
	var ev := BusinessRules.daily(s, 42)
	var b := BusinessRules.find(s, "restaurant")
	check(ev.size() == 1 and int(b["last_day"]["profit"]) > 0, "staffed & stocked business profits (%s)" % str(b["last_day"]))
	var bank := int(s["bank"])
	check(BusinessRules.collect(s, "restaurant")["ok"] and int(s["bank"]) > bank, "collect profit")
	check(not BusinessRules.collect(s, "restaurant")["ok"], "nothing left to collect")
	b["stock"] = 0
	var rep := float(b["reputation"])
	BusinessRules.daily(s, 7)
	check(float(b["reputation"]) < rep, "stock-out hurts reputation")
	check(BusinessRules.set_price(s, "restaurant", 2)["ok"], "set price")
	check(BusinessRules.upgrade(s, "restaurant")["ok"], "upgrade business")
	check(BusinessRules.sell(s, "restaurant")["ok"], "sell business")


func test_missions() -> void:
	section("Missions")
	var d1 := MissionRules.daily_for_day(5)
	check(d1.size() == 3, "3 daily missions")
	check(d1 == MissionRules.daily_for_day(5), "daily picks deterministic")
	var uniq := {}
	for x in d1:
		uniq[x] = true
	check(uniq.size() == 3, "daily picks unique")
	var s := fresh()
	var r := MissionRules.claim(s, "main_01")
	check(r["ok"] and int(s["bank"]) == 5000, "claim main_01 pays £50")
	check(not MissionRules.claim(s, "main_01")["ok"], "can't claim twice")
	check(not MissionRules.claim(s, "main_03")["ok"], "can't claim locked mission")
	at(s, 5, 9)
	check(MissionRules.claim(s, d1[0])["ok"], "claim today's daily")
	check(not MissionRules.claim(s, d1[0])["ok"], "daily once per day")
	var other := ""
	for id in DataDB.daily_pool:
		if not (id in d1):
			other = id
	check(not MissionRules.claim(s, other)["ok"], "can't claim another day's daily")


func test_challenges() -> void:
	section("Challenges")
	var s := fresh()
	check(not ChallengeRules.start(s, "business_tycoon", "easy")["ok"], "tycoon needs a business")
	check(ChallengeRules.start(s, "property_mogul", "easy")["ok"], "start mogul")
	s["bank"] = 100000000
	PropertyRules.buy(s, "small_house_1")
	PropertyRules.buy(s, "small_house_2")
	var ev := ChallengeRules.evaluate(s)
	check(s["challenges"]["property_mogul"]["status"] == "won", "mogul won with 2 houses")
	check(InventoryRules.has(s, "golden_key"), "golden key reward")
	check(ChallengeRules.start(s, "street_racing", "hard")["ok"], "start race")
	check(not ChallengeRules.race_result(s, 1, 3.0)["ok"], "impossible race time rejected")
	ChallengeRules.start(s, "street_racing", "hard")
	var bank := int(s["bank"])
	check(ChallengeRules.race_result(s, 1, 45.0)["ok"] and int(s["bank"]) > bank, "race win pays")
	ChallengeRules.start(s, "street_racing", "hard")
	bank = int(s["bank"])
	ChallengeRules.race_result(s, 1, 45.0)
	check(int(s["bank"]) == bank, "prize only once per difficulty")
	# Career challenge
	var s2 := fresh()
	JobRules.apply(s2, "shop_assistant")
	check(ChallengeRules.start(s2, "career_challenge", "easy")["ok"], "start career challenge")
	for dd in range(1, 4):
		at(s2, dd, 10)
		s2["needs"]["energy"] = 100.0
		var r := ActionRouter.apply(s2, "work_shift", {"perf": 1.0})
		check(r["ok"], "career shift %d" % dd)
	check(s2["challenges"]["career_challenge"]["status"] == "won", "career challenge won")


func test_relationships() -> void:
	section("Relationships")
	var s := fresh()
	var r := RelationshipRules.talk(s, "priya", "chat")
	check(r["ok"] and RelationshipRules.friendship(s, "priya") == 5.0, "chat +5")
	RelationshipRules.talk(s, "priya", "joke")
	RelationshipRules.talk(s, "priya", "compliment")
	var f := RelationshipRules.friendship(s, "priya")
	RelationshipRules.talk(s, "priya", "chat")
	check(RelationshipRules.friendship(s, "priya") == f, "daily talk cap")
	check(not RelationshipRules.talk(s, "priya", "ask_out")["ok"], "too early to ask out")
	InventoryRules.add_item(s, "coffee", 1)
	r = RelationshipRules.gift(s, "priya", "coffee")
	check(r["ok"] and RelationshipRules.friendship(s, "priya") >= f + 12.0, "liked gift +12")
	check(not RelationshipRules.gift(s, "priya", "coffee")["ok"], "can't gift what you don't have")
	s["needs"]["hygiene"] = 5.0
	at(s, 2, 9)
	var f2 := RelationshipRules.friendship(s, "tom")
	RelationshipRules.talk(s, "tom", "chat")
	check(RelationshipRules.friendship(s, "tom") - f2 == 2.5, "smelly halves friendship gain")


func test_router() -> void:
	section("ActionRouter")
	var s := fresh()
	check(not ActionRouter.apply(s, "give_me_money", {})["ok"], "unknown action rejected")
	check(not ActionRouter.apply(s, "deposit", {"amount": "lots"})["ok"], "bad param type handled")
	check(not ActionRouter.apply(s, "buy_item", {"id": "sandwich", "qty": 1, "shop": "tech"})["ok"], "shop validation through router")
	var r := ActionRouter.apply(s, "buy_service", {"id": "meal_burger"})
	check(r["ok"], "buy service")
	check(not ActionRouter.apply(s, "sleep", {"place": "home"})["ok"], "can't sleep at home without one")
	check(ActionRouter.apply(s, "sleep", {"place": "bench", "hours": 4})["ok"], "bench sleep")
	check(ActionRouter.apply(s, "find_collectible", {"spot": "c_alley"})["ok"], "collectible found")
	check(not ActionRouter.apply(s, "find_collectible", {"spot": "c_alley"})["ok"], "collectible only once")
	check(not ActionRouter.apply(s, "hospital_revive", {})["ok"], "revive only when collapsed")
	s["needs"]["health"] = 0.0
	check(ActionRouter.apply(s, "hospital_revive", {})["ok"] and float(s["needs"]["health"]) > 50.0, "hospital revive")


func test_validation() -> void:
	section("Validation")
	var v := PlayerState.validate("garbage")
	check(not v["ok"], "non-dict rejected")
	var bad := {"name": "Hacker", "cash": -500, "needs": {"hunger": 999, "energy": "x"}, "inventory": [{"id": "fake_item", "qty": 5}, {"id": "water", "qty": 3}], "job": {"id": "astronaut"}, "vehicles": [{"id": "ufo"}], "world": {"day": -3, "minute": 99999}}
	v = PlayerState.validate(bad)
	var st: Dictionary = v["state"]
	check(v["ok"], "damaged state sanitised")
	check(int(st["cash"]) == 0, "negative cash clamped")
	check(float(st["needs"]["hunger"]) == 100.0, "need clamped")
	check(InventoryRules.count(st, "water") == 3 and st["inventory"].size() == 1, "unknown items dropped")
	check(st["job"]["id"] == "", "unknown job dropped")
	check(st["vehicles"].is_empty(), "unknown vehicle dropped")
	check(int(st["world"]["day"]) == 1 and int(st["world"]["minute"]) == 1439, "world time clamped")
	check(st.has("missions") and st.has("relationships"), "missing keys filled")


func test_save_load() -> void:
	section("Save/Load")
	GameManager.state = fresh()
	GameManager.state["cash"] = 4242
	GameManager.current_slot = 2
	check(SaveManager.save_game(2, true), "save slot 2")
	var r := SaveManager.load_slot(2)
	check(r["ok"] and int(r["state"]["cash"]) == 4242, "load slot 2 round trip")
	check(not r["recovered"], "not recovered from backup")
	GameManager.state["cash"] = 9999
	SaveManager.save_game(2, true)   # previous becomes .bak
	# Corrupt the main file: backup should load.
	var f := FileAccess.open(SaveManager.slot_path(2), FileAccess.WRITE)
	f.store_string("{ this is not json")
	f.close()
	r = SaveManager.load_slot(2)
	check(r["ok"] and r["recovered"] and int(r["state"]["cash"]) == 4242, "corrupt save falls back to backup")
	# Tamper with money: checksum mismatch.
	GameManager.state["cash"] = 1000
	SaveManager.save_game(2, true)
	var txt := FileAccess.get_file_as_string(SaveManager.slot_path(2))
	txt = txt.replace("\"cash\":1000", "\"cash\":99999999")
	f = FileAccess.open(SaveManager.slot_path(2), FileAccess.WRITE)
	f.store_string(txt)
	f.close()
	var doc := SaveManager.read_doc(SaveManager.slot_path(2))
	check(not doc["ok"], "edited save detected (%s)" % str(doc.get("error", "")))
	# Both files bad -> reported as corrupt, no crash.
	f = FileAccess.open(SaveManager.slot_path(2) + ".bak", FileAccess.WRITE)
	f.store_string("")
	f.close()
	r = SaveManager.load_slot(2)
	check(not r["ok"], "both corrupt -> load fails safely")
	var slots := SaveManager.list_slots()
	check(slots[1]["corrupt"], "slot list marks corrupt slot")
	check(slots[0]["exists"] == false, "empty slot listed")
	SaveManager.delete_slot(2)
	check(not SaveManager.list_slots()[1]["exists"], "delete slot")
	# Latest slot
	GameManager.state = fresh()
	SaveManager.save_game(3, true)
	check(SaveManager.latest_slot() == 3, "latest slot for Continue")


func test_achievements() -> void:
	section("Achievements")
	var s := fresh()
	check(AchievementManager.value_for(s, "shifts") == 0.0, "no shifts")
	s["stats"]["shifts"] = 1
	check(AchievementManager.value_for(s, "shifts") >= 1.0, "first paycheck value")
	s["bank"] = 200000000
	check(AchievementManager.value_for(s, "net_worth") >= 1000000.0, "millionaire value")
	check(AchievementManager.value_for(s, "challenge:street_racing") == 0.0, "challenge not won")


# ------------------------------------------------------------------ scene smoke tests

func wait_frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func test_scenes() -> void:
	section("Scenes")
	get_tree().change_scene_to_file(GameManager.MAIN_MENU)
	await wait_frames(5)
	check(get_tree().current_scene != null and get_tree().current_scene.name == "MainMenu", "main menu loads")
	get_tree().change_scene_to_file(GameManager.CREATOR)
	await wait_frames(5)
	check(get_tree().current_scene.name == "CharacterCreator", "character creator loads")
	GameManager.start_new_game("Smoke", {"body": "fem", "hair": 3, "hair_color": "#a33a1a", "skin": 2}, 1, {"top": "hoodie_grey", "bottom": "skirt_navy", "shoes": "trainers_white", "accessory": "glasses"})
	await wait_frames(20)
	var w := get_tree().current_scene
	check(w != null and w.name == "GameWorld", "game world loads")
	if w == null or w.name != "GameWorld":
		return
	check(GameManager.state["equipped"]["top"] == "hoodie_grey", "creator outfit applied")
	check(InventoryRules.has(GameManager.state, "hoodie_grey"), "creator outfit in inventory")
	check(w.player != null and w.city != null and w.hud != null, "player, city, hud exist")
	check(w.npcs.size() > 0, "NPCs spawned (%d)" % w.npcs.size())
	check(w.traffic.cars.size() > 0, "traffic spawned")
	check(w.city.interactables.size() > 30, "interactables placed (%d)" % w.city.interactables.size())
	await wait_frames(30)
	check(w.player.global_position.y > -1.0 and w.player.global_position.y < 3.0, "player stands on ground (y=%.2f)" % w.player.global_position.y)
	# Walk forward a bit with simulated input.
	var p0: Vector3 = w.player.global_position
	w.hud.joystick.value = Vector2(0, -1)
	await wait_frames(40)
	w.hud.joystick.value = Vector2.ZERO
	check(w.player.global_position.distance_to(p0) > 0.5, "player moves with joystick")
	# Open every location menu.
	for id in CityLayout.LOCATIONS:
		if CityLayout.LOCATIONS[id]["features"].is_empty():
			continue
		LocationMenu.open(w, id)
		await wait_frames(2)
		Modal.close_all(get_tree())
		await wait_frames(1)
	check(GameManager.ui_blocking == 0, "ui blocking released after menus (%d)" % GameManager.ui_blocking)
	# Every phone app.
	for a in Phone.APPS:
		Phone.open(w.hud, a[0])
		await wait_frames(2)
		Modal.close_all(get_tree())
		await wait_frames(1)
	check(GameManager.ui_blocking == 0, "ui blocking released after phone apps")
	for f in [func(): ShopPanel.open(w.hud, "supermarket"), func(): BankPanel.open(w.hud, true), func(): JobsPanel.open(w.hud), func(): JobsPanel.open_college(w.hud),
			func(): PropertyPanel.open(w.hud), func(): VehiclePanel.open_dealer(w.hud), func(): VehiclePanel.open_garage(w.hud), func(): BusinessPanel.open(w.hud),
			func(): MissionsPanel.open(w.hud), func(): MissionsPanel.open_challenges(w.hud), func(): InventoryPanel.open(w.hud), func(): CharacterPanel.open(w.hud), func(): PauseMenu.open(w.hud)]:
		f.call()
		await wait_frames(2)
		Modal.close_all(get_tree())
		await wait_frames(1)
	check(not get_tree().paused, "pause released")
	# Gameplay flow through actions.
	var s := GameManager.state
	GameManager.act("buy_item", {"id": "sandwich", "qty": 1, "shop": "supermarket"})
	GameManager.act("use_item", {"id": "sandwich"})
	await wait_frames(120)
	check("main_01" in s["missions"]["completed"], "main mission 1 completes from events")
	GameManager.act("apply_job", {"id": "shop_assistant"})
	await wait_frames(100)
	check("main_02" in s["missions"]["completed"], "main mission 2 completes")
	s["cash"] = 5000000
	GameManager.act("rent_property", {"id": "studio_1"})
	GameManager.act("buy_item", {"id": "sofa", "qty": 1, "shop": "furniture"})
	GameManager.act("buy_item", {"id": "tv", "qty": 1, "shop": "tech"})
	GameManager.act("place_furniture", {"id": "studio_1", "item": "sofa"})
	GameManager.act("place_furniture", {"id": "studio_1", "item": "tv"})
	await w.enter_home("studio_1")
	await wait_frames(10)
	check(w.is_in_interior(), "entered home interior")
	check(w.interior.interactables.size() >= 6, "interior has fixtures (%d)" % w.interior.interactables.size())
	await w.leave_interior()
	check(not w.is_in_interior(), "left interior")
	# Vehicle
	GameManager.act("deposit", {"amount": 3000000})
	GameManager.act("buy_vehicle", {"id": "hatchback", "color": "#2e6fd1"})
	await wait_frames(5)
	check(w.vehicles.size() == 1, "bought vehicle spawned in world")
	var v = w.vehicles.values()[0]
	w.enter_vehicle(v)
	check(w.player.state == "drive", "entered vehicle")
	w.hud.btn_gas.is_down = true
	await wait_frames(90)
	w.hud.btn_gas.is_down = false
	check(v.speed > 3.0 or v.odo > 5.0, "vehicle accelerates (speed %.1f, odo %.1f)" % [v.speed, v.odo])
	check(v.fuel < 40.0, "fuel used")
	v.speed = 0.0
	await wait_frames(5)
	w.toggle_vehicle()
	check(w.player.state == "normal", "exited vehicle")
	# Work minigame + shift
	WorldClock.set_time(WorldClock.day, 10 * 60)
	GameManager._sync_world_to_state()
	print("  shift check: ", JobRules.can_start_shift(s), " needs=", s["needs"])
	w.start_shift()
	await wait_frames(5)
	var mods := get_tree().get_nodes_in_group("modal")
	check(mods.size() == 1, "work minigame opened")
	Modal.close_all(get_tree())
	var bank_before := int(s["bank"])
	await w.finish_shift(0.9)
	check(int(s["bank"]) > bank_before, "finishing a shift pays wages")
	# Day rollover: rent/business tick and daily missions refresh.
	var day := WorldClock.day
	WorldClock.advance(24 * 60)
	await wait_frames(5)
	check(WorldClock.day == day + 1, "day advanced")
	check(int(s["missions"]["daily_day"]) == WorldClock.day, "daily missions refreshed")
	# Time trial and race start/cancel without errors.
	w.enter_vehicle(v)
	w.race.start_time_trial("tt_centre", 75)
	await wait_frames(10)
	check(w.race.is_running(), "time trial running")
	w.race.cancel()
	check(not w.race.is_running(), "time trial cancelled")
	w.toggle_vehicle()
	GameManager.act("start_challenge", {"id": "street_racing", "difficulty": "easy"})
	w.race.start_street_race()
	await wait_frames(30)
	check(w.race.is_running() and w.race.ai.size() == 3, "street race with 3 rivals")
	w.race.cancel()
	await wait_frames(5)
	# Talk to an NPC
	var npc = w.npcs.values()[0]
	DialoguePanel.open(w, npc)
	await wait_frames(3)
	GameManager.act("npc_talk", {"id": npc.npc_id, "kind": "chat"})
	await wait_frames(3)
	Modal.close_all(get_tree())
	check(RelationshipRules.friendship(s, npc.npc_id) > 0.0, "talking builds friendship")
	# Save from the world and reload it.
	check(SaveManager.save_game(1, true), "save from world: " + SaveManager.last_error)
	var r := SaveManager.load_slot(1)
	check(r["ok"] and r["state"]["vehicles"].size() == 1 and r["state"]["properties"].size() == 1, "world save contains progress")
	# Rendering-heavy frames to catch runtime errors.
	await wait_frames(60)
	GameManager.quit_to_menu(false)
	await wait_frames(10)
	check(get_tree().current_scene.name == "MainMenu", "quit to menu")
