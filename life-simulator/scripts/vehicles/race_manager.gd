extends Node
## Driving time trials (missions) and the Street Racing Champion boss race.
## Checkpoints are glowing gates on the road; AI rivals follow the same route.

const AI_BASE_SPEED := 30.0
const CHECK_RADIUS := 7.5

var world: Node
var mode := ""             # "", "trial", "race"
var route: Array = []
var index := 0
var elapsed := 0.0
var limit := 0.0
var trial_id := ""
var countdown := 0.0
var gate: Node3D
var ai: Array = []          # [{node, idx, dist, speed, finished_at}]
var finished_ai := 0


func is_running() -> bool:
	return mode != ""


func _make_gate() -> void:
	if gate:
		gate.queue_free()
	gate = Node3D.new()
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(1, 0.8, 0.1, 0.55)
	m.emission_enabled = true
	m.emission = Color(1, 0.75, 0.1)
	m.emission_energy_multiplier = 2.0
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for x in [-5.0, 5.0]:
		var post := MeshInstance3D.new()
		var b := BoxMesh.new()
		b.size = Vector3(0.5, 5, 0.5)
		post.mesh = b
		post.position = Vector3(x, 2.5, 0)
		post.material_override = m
		gate.add_child(post)
	var top := MeshInstance3D.new()
	var tb := BoxMesh.new()
	tb.size = Vector3(10.5, 0.6, 0.5)
	top.mesh = tb
	top.position = Vector3(0, 5, 0)
	top.material_override = m
	gate.add_child(top)
	world.add_child(gate)


func _place_gate() -> void:
	if index >= route.size():
		return
	var p: Vector3 = route[index]
	gate.global_position = p
	var nxt: Vector3 = route[mini(index + 1, route.size() - 1)]
	var prev: Vector3 = route[maxi(index - 1, 0)]
	var d := (nxt - prev)
	if d.length() < 0.1:
		d = Vector3(0, 0, 1)
	gate.rotation.y = atan2(d.x, d.z)
	world.hud.set_waypoint(p)


# ------------------------------------------------------------------ time trial

func start_time_trial(route_id: String, time_limit: float) -> void:
	if is_running():
		return
	if world.player.state != "drive":
		GameManager.toast("Get in a vehicle first, then start the time trial.", "warn")
		return
	route = CityLayout.ROUTES.get(route_id, [])
	if route.is_empty():
		return
	mode = "trial"
	trial_id = route_id
	limit = time_limit
	index = 0
	elapsed = 0.0
	countdown = 0.0
	_make_gate()
	_place_gate()
	world.hud.show_race_info(true)
	GameManager.toast("Time trial! Drive through the gold gates. Target: %ds" % int(limit), "info")
	AudioManager.play_music("race")


# ------------------------------------------------------------------ street race

func start_street_race() -> void:
	if is_running():
		return
	var s := GameManager.state
	if not ChallengeRules.is_active(s, "street_racing"):
		GameManager.toast("Enter the Street Racing challenge at the Challenge Board first.", "warn")
		return
	var diff: String = s["challenges"]["street_racing"]["difficulty"]
	var factor := float(DataDB.challenges["street_racing"]["difficulties"][diff]["ai_speed"])
	route = CityLayout.ROUTES["race"]
	var start: Vector3 = route[0]
	var dir: Vector3 = (route[1] - route[0]).normalized()
	var rot := atan2(-dir.x, -dir.z)
	world.teleport_player(start - dir * 12.0)
	# Use your own active vehicle if it's fast enough, otherwise a loaned race car.
	var v = null
	var active: String = s.get("active_vehicle", "")
	if active != "" and world.vehicles.has(active):
		var cand = world.vehicles[active]
		if cand.top_speed() >= 40.0 and cand.damage < 60.0:
			v = cand
			v.global_position = start - dir * 12.0 + Vector3(0, 0.3, 0)
			v.rotation.y = rot
			v.speed = 0.0
	if v == null:
		v = world.spawn_loaner("sports_car", start - dir * 12.0 + Vector3(0, 0.3, 0), rot)
		GameManager.toast("You've been loaned a Vento GT for the race!", "info")
	await get_tree().process_frame
	world.enter_vehicle(v)
	# AI rivals on the grid beside you.
	for k in 3:
		var n := Node3D.new()
		var vm := VehicleModel.new()
		vm.build("car", [Color("#c0392b"), Color("#2e6fd1"), Color("#1d1f24")][k], "sports_car")
		n.add_child(vm)
		world.add_child(n)
		var side := Vector3(dir.z, 0, -dir.x) * (3.0 if k % 2 == 0 else -3.0)
		n.global_position = start - dir * (6.0 + k * 6.0) + side
		n.rotation.y = rot
		ai.append({"node": n, "model": vm, "idx": 1, "speed": 0.0, "max": AI_BASE_SPEED * factor * randf_range(0.95, 1.05), "done": false})
	mode = "race"
	index = 1
	elapsed = 0.0
	finished_ai = 0
	countdown = 3.5
	world.player.frozen = true
	_make_gate()
	_place_gate()
	world.hud.show_race_info(true)
	AudioManager.play_music("race")


# ------------------------------------------------------------------ update

func _physics_process(delta: float) -> void:
	if mode == "":
		return
	var veh = world.player.vehicle
	if countdown > 0.0:
		countdown -= delta
		if veh:
			veh.speed = 0.0
		var c := int(ceil(countdown))
		world.hud.set_race_text("%d" % c if c > 0 else "GO!")
		if countdown <= 0.0:
			world.player.frozen = false
			AudioManager.play_sfx("checkpoint", 1.5)
		return
	elapsed += delta
	if mode == "race":
		_update_ai(delta)
	if veh == null:
		_fail("You left your vehicle.")
		return
	var target: Vector3 = route[index]
	var pp: Vector3 = veh.global_position
	if Vector2(pp.x - target.x, pp.z - target.z).length() < CHECK_RADIUS:
		index += 1
		AudioManager.play_sfx("checkpoint")
		if index >= route.size():
			_finish()
			return
		_place_gate()
	var txt := "%.1fs  •  Gate %d/%d" % [elapsed, index, route.size() - 1 if mode == "race" else route.size()]
	if mode == "trial":
		txt += "  •  Target %ds" % int(limit)
		if elapsed > limit * 1.6:
			_fail("Time's up!")
			return
	else:
		txt += "  •  Position %d" % _player_position()
	world.hud.set_race_text(txt)


func _update_ai(delta: float) -> void:
	for a in ai:
		if a["done"]:
			continue
		var n: Node3D = a["node"]
		var tgt: Vector3 = route[a["idx"]]
		var to := tgt - n.global_position
		to.y = 0
		var d := to.length()
		var corner := clampf(d / 25.0, 0.45, 1.0)
		a["speed"] = move_toward(a["speed"], a["max"] * corner, 14.0 * delta)
		var step: float = minf(d, a["speed"] * delta)
		if d > 0.01:
			n.global_position += to.normalized() * step
			n.rotation.y = lerp_angle(n.rotation.y, atan2(-to.x, -to.z), minf(1.0, delta * 6.0))
		(a["model"] as VehicleModel).spin_wheels(step, 0.0)
		if d < 3.0:
			a["idx"] += 1
			if a["idx"] >= route.size():
				a["done"] = true
				finished_ai += 1


func _progress(idx: int, pos: Vector3) -> float:
	if idx >= route.size():
		return 1e6
	return idx * 1000.0 - pos.distance_to(route[idx])


func _player_position() -> int:
	var veh = world.player.vehicle
	if veh == null:
		return 4
	var mine := _progress(index, veh.global_position)
	var place := 1
	for a in ai:
		if a["done"] or _progress(a["idx"], a["node"].global_position) > mine:
			place += 1
	return place


func _finish() -> void:
	var secs := elapsed
	if mode == "trial":
		GameManager.record_event("time_trial", {"id": trial_id, "seconds": secs})
		if secs <= limit:
			GameManager.toast("Time trial complete in %.1fs! Target beaten!" % secs, "good")
		else:
			GameManager.toast("Finished in %.1fs, but the target was %ds. Try again!" % [secs, int(limit)], "warn")
	else:
		var pos := 1 + finished_ai
		GameManager.act("race_result", {"position": pos, "seconds": secs})
	_cleanup()


func _fail(msg: String) -> void:
	GameManager.toast(msg, "bad")
	if mode == "race":
		GameManager.act("race_result", {"position": 4, "seconds": maxf(elapsed, 60.0)})
	_cleanup()


func cancel() -> void:
	if mode != "":
		_fail("Race cancelled.")


func _cleanup() -> void:
	mode = ""
	world.player.frozen = false
	if gate:
		gate.queue_free()
		gate = null
	for a in ai:
		a["node"].queue_free()
	ai.clear()
	world.hud.show_race_info(false)
	world.hud.set_waypoint(Vector3.INF)
	if world.loaner:
		var w = world
		get_tree().create_timer(3.0).timeout.connect(func(): if is_instance_valid(w): w.remove_loaner())
	world._update_music(true)
