extends Node3D
## The playable world. Builds the city, environment, player, camera, traffic,
## NPCs, owned vehicles and HUD, and routes every interaction to the right UI
## or action. Also runs home interiors, work shifts, races and remote players.

const EnvController := preload("res://scripts/city/environment_controller.gd")
const CityBuilder := preload("res://scripts/city/city_builder.gd")
const PlayerScene := preload("res://scenes/player/player.tscn")
const VehicleScene := preload("res://scenes/vehicles/vehicle.tscn")
const NPCScene := preload("res://scenes/npc/npc.tscn")
const RemoteScene := preload("res://scenes/multiplayer/remote_player.tscn")
const HUDScene := preload("res://scenes/menus/hud.tscn")
const InteriorScript := preload("res://scripts/property/interior.gd")
const TrafficScript := preload("res://scripts/npc/traffic.gd")
const RaceScript := preload("res://scripts/vehicles/race_manager.gd")
const WorkRouteScript := preload("res://scripts/jobs/work_route.gd")

var city: Node3D
var env_ctl: Node3D
var player: CharacterBody3D
var cam: Node3D
var hud: CanvasLayer
var traffic: Node3D
var interior: Node3D
var race: Node
var work_route: Node
var npcs := {}
var vehicles := {}          # uid -> vehicle node
var loaner: Node = null
var remote_players := {}
var _interior_return := Vector3.ZERO
var _in_interior := false
var _music_timer := 0.0
var _vehicle_sync_pending := false


func _ready() -> void:
	var preset := Settings.preset()
	city = CityBuilder.new()
	city.name = "City"
	add_child(city)
	city.build()
	env_ctl = EnvController.new()
	env_ctl.name = "Environment"
	add_child(env_ctl)
	env_ctl.setup(city, preset)

	interior = InteriorScript.new()
	interior.name = "Interior"
	add_child(interior)

	player = PlayerScene.instantiate()
	player.world = self
	add_child(player)
	var p: Array = GameManager.state.get("position", [])
	var start := CityLayout.SPAWN
	if p.size() == 3 and not (float(p[0]) == 0.0 and float(p[2]) == 0.0):
		start = Vector3(float(p[0]), maxf(float(p[1]), 0.3), float(p[2]))
	if absf(start.x) > 170 or absf(start.z) > 170:
		start = CityLayout.SPAWN
	player.global_position = start

	cam = preload("res://scripts/player/camera_rig.gd").new()
	cam.name = "CameraRig"
	add_child(cam)
	cam.target = player
	cam.global_position = start + Vector3(0, 1.5, 0)
	cam.yaw = float(GameManager.state.get("rotation_y", 0.0)) + PI
	player.cam = cam
	env_ctl.follow(cam)

	traffic = TrafficScript.new()
	traffic.name = "Traffic"
	add_child(traffic)
	traffic.player = player
	traffic.spawn(int(preset["traffic"]))

	_spawn_npcs(int(preset["npc_count"]))
	_sync_vehicles()

	race = RaceScript.new()
	race.name = "Race"
	race.world = self
	add_child(race)
	work_route = WorkRouteScript.new()
	work_route.name = "WorkRoute"
	work_route.world = self
	add_child(work_route)

	hud = HUDScene.instantiate()
	hud.world = self
	add_child(hud)
	player.interactable_changed.connect(hud.set_prompt)

	city.hide_collected(GameManager.state.get("claimed", []))
	GameManager.data_changed.connect(_on_data_changed)
	GameManager.hospitalised.connect(_on_hospitalised)
	GameManager.game_event.connect(_on_game_event)
	MultiplayerManager.remote_transform.connect(_on_remote_transform)
	MultiplayerManager.players_changed.connect(_on_players_changed)
	_on_players_changed()
	_update_music(true)
	get_tree().paused = false


func _spawn_npcs(count: int) -> void:
	var ids: Array = DataDB.npc_order.duplicate()
	for i in mini(count, ids.size()):
		var id: String = ids[i]
		var n: Node = NPCScene.instantiate()
		n.setup(id)
		n.player = player
		add_child(n)
		n.place_at_schedule()
		npcs[id] = n


# ------------------------------------------------------------------ vehicles

## Spawns/removes vehicle nodes so they match the vehicles the player owns.
func _sync_vehicles() -> void:
	var s := GameManager.state
	var owned := {}
	var slot := 0
	for rec in s["vehicles"]:
		var uid: String = rec["uid"]
		owned[uid] = true
		if vehicles.has(uid) and is_instance_valid(vehicles[uid]):
			continue
		var v: Node = VehicleScene.instantiate()
		v.setup(rec)
		add_child(v)
		var pos: Array = rec.get("pos", [])
		if pos.size() == 3:
			v.global_position = Vector3(float(pos[0]), float(pos[1]) + 0.3, float(pos[2]))
			v.rotation.y = float(rec.get("rot", 0.0))
		else:
			v.global_position = _vehicle_spawn_point(slot)
			v.rotation.y = 0.0
		slot += 1
		vehicles[uid] = v
	for uid in vehicles.keys():
		if not owned.has(uid):
			if is_instance_valid(vehicles[uid]):
				if player.vehicle == vehicles[uid]:
					_exit_vehicle_now()
				vehicles[uid].queue_free()
			vehicles.erase(uid)


func _vehicle_spawn_point(slot: int) -> Vector3:
	# Dealership forecourt bays.
	var bc := CityLayout.block_center(Vector2i(4, 3))
	return bc + Vector3(-2 + (slot % 6) * 4.0, 0.3, 12.0)


func _on_data_changed() -> void:
	if not _vehicle_sync_pending:
		_vehicle_sync_pending = true
		call_deferred("_deferred_sync")


func _deferred_sync() -> void:
	_vehicle_sync_pending = false
	_sync_vehicles()
	city.hide_collected(GameManager.state.get("claimed", []))


func _on_game_event(ev: Dictionary) -> void:
	match ev.get("name", ""):
		"vehicle_delivered":
			var v = vehicles.get(ev["uid"])
			if v and is_instance_valid(v) and v != player.vehicle:
				v.global_position = _nearest_road_point(player.global_position) + Vector3(0, 0.4, 0)
				v.fuel = maxf(v.fuel, 3.0)
		"advance_time":
			env_ctl.update_now()
			for n in npcs.values():
				n.place_at_schedule()
			if hud:
				hud.fade_flash()


func _nearest_road_point(p: Vector3) -> Vector3:
	var best := Vector3.ZERO
	var best_d := 1e9
	for i in CityLayout.N + 1:
		var line := CityLayout.road_line(i)
		var a := Vector3(clampf(p.x, -150, 150), 0, line)
		var b := Vector3(line, 0, clampf(p.z, -150, 150))
		for q in [a, b]:
			var d: float = q.distance_to(p)
			if d < best_d:
				best_d = d
				best = q
	return best


func toggle_vehicle() -> void:
	if player.state == "drive":
		if player.vehicle and player.vehicle.can_exit():
			_exit_vehicle_now()
		else:
			GameManager.toast("Slow down to get out.", "warn")
		return
	if _in_interior:
		return
	var it = player.current_interactable
	if it and it.kind == "vehicle":
		enter_vehicle(it.data["vehicle"])


func enter_vehicle(v: Node) -> void:
	if v.uid != "" and not v.is_loaner:
		if VehicleRules.find(GameManager.state, v.uid).is_empty():
			return
		GameManager.act("set_active_vehicle", {"uid": v.uid})
	if v.damage >= 100.0:
		GameManager.toast("This vehicle is wrecked. Repair it at Gearhead Garage (or use a Repair Kit).", "bad")
	player.enter_vehicle(v)
	v.start_driving(player)
	cam.target = v
	cam.auto_follow = true
	cam.target_distance = 7.5 if v.def.get("type") != "van" else 9.0
	hud.set_driving(true, v)
	AudioManager.play_sfx("door")


func _exit_vehicle_now() -> void:
	var v = player.vehicle
	if v == null:
		return
	v.stop_driving()
	var side: Vector3 = v.global_transform.basis.x * 2.0
	player.exit_vehicle(v.global_position + side + Vector3(0, 0.3, 0))
	cam.target = player
	cam.auto_follow = false
	cam.target_distance = 5.0
	hud.set_driving(false, null)
	AudioManager.play_sfx("door")


## A temporary vehicle (used for the street race when you don't own one).
func spawn_loaner(id: String, pos: Vector3, rot: float) -> Node:
	if loaner and is_instance_valid(loaner):
		if player.vehicle == loaner:
			_exit_vehicle_now()
		loaner.queue_free()
	var v: Node = VehicleScene.instantiate()
	v.setup({"uid": "", "id": id, "color": "#f1c40f", "engine": 1, "damage": 0.0, "fuel": 60.0, "odo": 0.0}, true)
	add_child(v)
	v.global_position = pos
	v.rotation.y = rot
	loaner = v
	return v


func remove_loaner() -> void:
	if loaner and is_instance_valid(loaner):
		if player.vehicle == loaner:
			_exit_vehicle_now()
		loaner.queue_free()
	loaner = null


# ------------------------------------------------------------------ interactions

func handle_interaction(it: Interactable) -> void:
	AudioManager.play_sfx("ui_click")
	match it.kind:
		"location":
			LocationMenu.open(self, it.target_id)
		"atm":
			BankPanel.open(hud, true)
		"bench":
			var m := Modal.open(hud, "Bench", 560, 330)
			m.body.add_child(UI.label("Take a load off. Sleeping here is free but you won't rest well.", 20, UI.MUTED))
			var seat: Vector3 = it.data["seat"]
			var rot: float = it.data["rot"]
			m.body.add_child(UI.button("Sit down", func(): m.close(); player.sit_at(seat + Vector3(0, 0, 0), rot)))
			m.body.add_child(UI.button("Sleep on the bench (4 hours)", func(): m.close(); sleep_sequence("bench", 4, seat, rot)))
		"vehicle":
			enter_vehicle(it.data["vehicle"])
		"npc":
			var n = npcs.get(it.target_id)
			if n:
				DialoguePanel.open(self, n)
		"collectible":
			GameManager.act("find_collectible", {"spot": it.target_id})
		"bed":
			var m2 := Modal.open(hud, "Bed", 560, 420)
			m2.body.add_child(UI.label("How long do you want to sleep?", 20, UI.MUTED))
			var bpos: Vector3 = it.data["pos"]
			for hrs in [2, 4, 8]:
				m2.body.add_child(UI.button("Sleep %d hours" % hrs, func(): m2.close(); sleep_sequence("home", hrs, bpos, 0.0)))
			var until := int(ceil(fposmod(7.0 * 60.0 - WorldClock.minute, 1440.0) / 60.0))
			if until >= 1 and until <= 12:
				m2.body.add_child(UI.button("Sleep until 07:00 (%d h)" % until, func(): m2.close(); sleep_sequence("home", until, bpos, 0.0)))
		"shower":
			GameManager.act("shower")
		"fridge":
			InventoryPanel.open(hud, ["food", "drink"])
		"sofa":
			player.sit_at(it.data["pos"], float(it.data.get("rot", 0.0)))
		"exit":
			leave_interior()
		"tv", "console", "piano", "hottub":
			_home_activity(it.kind)
		"decorate":
			PropertyPanel.open_decorate(hud, interior.property_id)


## Fun things to do at home. Pure needs changes (no money), so they run locally.
func _home_activity(kind: String) -> void:
	var fx := {"tv": {"happiness": 12, "social": 2, "energy": -2}, "console": {"happiness": 15, "energy": -4},
		"piano": {"happiness": 14, "social": 2}, "hottub": {"happiness": 16, "hygiene": 25, "energy": 8}}
	var names := {"tv": "You watched an episode of a gripping drama.", "console": "You played video games for an hour.",
		"piano": "You played a beautiful tune on the piano.", "hottub": "You relaxed in the bubbling hot tub."}
	NeedsRules.apply_effects(GameManager.state, fx[kind])
	if not MultiplayerManager.is_online():
		WorldClock.advance(60)
	GameManager.toast(names[kind], "good")
	GameManager.state_changed.emit()
	hud.fade_flash()


func sleep_sequence(place: String, hours: int, bed_pos: Vector3, rot: float) -> void:
	player.lie_down(bed_pos, rot)
	await hud.fade_out(0.6)
	var r := GameManager.act("sleep", {"place": place, "hours": hours})
	await get_tree().create_timer(0.6).timeout
	player.stand_up()
	await hud.fade_in(0.6)
	if not r.get("ok", false) and not r.get("pending", false):
		return


# ------------------------------------------------------------------ interiors

func enter_home(property_id: String) -> void:
	if PropertyRules.find(GameManager.state, property_id).is_empty():
		GameManager.toast("You don't live here.", "bad")
		return
	await hud.fade_out(0.3)
	_interior_return = CityLayout.location_pos(property_id) + Vector3(0, 0.2, 0)
	interior.build(property_id)
	player.teleport(interior.spawn_point)
	cam.global_position = interior.spawn_point + Vector3(0, 1.5, 0)
	cam.target_distance = 3.2
	_in_interior = true
	GameManager.at_home = (property_id == GameManager.state["home"]) or true
	AudioManager.play_sfx("door")
	city.visible = false
	traffic.visible = false
	await hud.fade_in(0.3)


func leave_interior() -> void:
	await hud.fade_out(0.3)
	player.teleport(_interior_return)
	cam.global_position = _interior_return + Vector3(0, 1.5, 0)
	cam.target_distance = 5.0
	_in_interior = false
	GameManager.at_home = false
	city.visible = true
	traffic.visible = true
	for c in interior.get_children():
		c.queue_free()
	AudioManager.play_sfx("door")
	await hud.fade_in(0.3)


func refresh_interior() -> void:
	if _in_interior:
		interior.build(interior.property_id)


func is_in_interior() -> bool:
	return _in_interior


func interior_return_pos() -> Vector3:
	return _interior_return


func teleport_player(p: Vector3) -> void:
	if player.state == "drive":
		_exit_vehicle_now()
	if _in_interior:
		_in_interior = false
		GameManager.at_home = false
		city.visible = true
		traffic.visible = true
	player.teleport(p)
	cam.global_position = p + Vector3(0, 1.5, 0)


func _on_hospitalised() -> void:
	teleport_player(CityLayout.location_pos("hospital") + Vector3(0, 0.3, -1.5))
	hud.fade_flash()


# ------------------------------------------------------------------ work

func start_shift() -> void:
	var reason := JobRules.can_start_shift(GameManager.state)
	if reason != "":
		GameManager.toast(reason, "bad")
		return
	var job := JobRules.job_def(GameManager.state["job"]["id"])
	if job["activity"] == "route":
		work_route.start(job)
	else:
		WorkMinigame.open(hud, job, func(perf: float): finish_shift(perf))


func finish_shift(perf: float) -> void:
	await hud.fade_out(0.5)
	GameManager.act("work_shift", {"perf": perf})
	await get_tree().create_timer(0.4).timeout
	await hud.fade_in(0.5)


# ------------------------------------------------------------------ multiplayer

func _on_players_changed() -> void:
	if not MultiplayerManager.is_online():
		return
	var my_id := multiplayer.get_unique_id()
	for pid in MultiplayerManager.players:
		if pid == my_id:
			continue
		var info: Dictionary = MultiplayerManager.players[pid]
		if not remote_players.has(pid):
			var r: Node = RemoteScene.instantiate()
			add_child(r)
			r.setup(pid, info)
			remote_players[pid] = r
		else:
			remote_players[pid].update_info(info)
	for pid in remote_players.keys():
		if not MultiplayerManager.players.has(pid):
			remote_players[pid].queue_free()
			remote_players.erase(pid)


func _on_remote_transform(pid: int, pos: Vector3, rot: float, anim: String, vehicle_id: String) -> void:
	if remote_players.has(pid):
		remote_players[pid].push_state(pos, rot, anim, vehicle_id)


# ------------------------------------------------------------------ misc

func _process(delta: float) -> void:
	_music_timer += delta
	if _music_timer > 5.0:
		_music_timer = 0.0
		_update_music(false)
	GameManager.at_home = _in_interior


func _update_music(_force: bool) -> void:
	if race and race.is_running():
		AudioManager.play_music("race")
	elif WorldClock.is_night():
		AudioManager.play_music("night")
	else:
		AudioManager.play_music("city")


func _exit_tree() -> void:
	if player and player.vehicle:
		player.vehicle.report(true)
