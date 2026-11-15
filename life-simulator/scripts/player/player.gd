extends CharacterBody3D
## The player character: walking, running, jumping, interacting, sitting,
## sleeping and getting in/out of vehicles. Works with keyboard/mouse for
## desktop testing and with the on-screen joystick/buttons on Android.

signal interactable_changed(it)

const WALK_SPEED := 3.2
const RUN_SPEED := 6.8
const JUMP_VELOCITY := 5.2
const GRAVITY := 16.0

var world: Node
var cam: Node3D
var model: CharacterModel
var sensor: Area3D
var state := "normal"         # normal, sit, sleep, drive, work, busy
var touch_move := Vector2.ZERO
var touch_sprint := false
var sprint_toggle := false
var vehicle: Node = null
var current_interactable: Interactable = null
var _nearby: Array = []
var _walk_acc := 0.0
var _step_phase := 0.0
var _district_timer := 0.0
var _last_district := ""
var _jump_queued := false
var _seat_pos := Vector3.ZERO
var _anim_state := "idle"
var frozen := false


func _ready() -> void:
	add_to_group("saveable")
	add_to_group("player")
	collision_layer = 2
	collision_mask = 1 | 4 | 8
	floor_snap_length = 0.4
	floor_max_angle = deg_to_rad(50)
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32
	cap.height = 1.75
	cs.shape = cap
	cs.position.y = 0.875
	add_child(cs)
	model = CharacterModel.new()
	add_child(model)
	refresh_appearance()
	sensor = Area3D.new()
	sensor.collision_layer = 0
	sensor.collision_mask = 16
	sensor.monitorable = false
	var scs := CollisionShape3D.new()
	var ssh := SphereShape3D.new()
	ssh.radius = 0.6
	scs.shape = ssh
	scs.position.y = 0.9
	sensor.add_child(scs)
	add_child(sensor)
	sensor.area_entered.connect(_on_area_entered)
	sensor.area_exited.connect(_on_area_exited)
	GameManager.appearance_changed.connect(refresh_appearance)


func refresh_appearance() -> void:
	var s := GameManager.state
	if s.is_empty():
		return
	model.setup(s["appearance"], s["equipped"])


func write_to_state() -> void:
	if GameManager.state.is_empty():
		return
	var p := global_position
	if state == "drive" and vehicle:
		p = vehicle.global_position + Vector3(2.5, 0.5, 0)
	if world and world.has_method("is_in_interior") and world.is_in_interior():
		p = world.interior_return_pos()
	GameManager.state["position"] = [p.x, maxf(p.y, 0.2), p.z]
	GameManager.state["rotation_y"] = model.rotation.y


# ------------------------------------------------------------------ input

func _unhandled_input(event: InputEvent) -> void:
	if GameManager.ui_blocking > 0:
		return
	if event.is_action_pressed("jump"):
		_jump_queued = true
	elif event.is_action_pressed("interact"):
		interact()
	elif event.is_action_pressed("vehicle"):
		if world:
			world.toggle_vehicle()


func move_input() -> Vector2:
	var v := Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_forward", "move_back"))
	if touch_move.length() > 0.05:
		v = touch_move
	return v.limit_length(1.0)


func is_sprinting() -> bool:
	return Input.is_action_pressed("sprint") or touch_sprint or sprint_toggle


func request_jump() -> void:
	_jump_queued = true


# ------------------------------------------------------------------ physics

func _physics_process(delta: float) -> void:
	if state == "drive":
		if vehicle:
			global_position = vehicle.global_position
		return
	var blocked := GameManager.ui_blocking > 0 or frozen
	if state in ["sit", "sleep", "work", "busy"]:
		velocity = Vector3.ZERO
		if state == "sit" and not blocked and (move_input().length() > 0.3 or _jump_queued):
			stand_up()
		_jump_queued = false
		_animate(delta, 0.0)
		return
	var input := Vector2.ZERO if blocked else move_input()
	var dir := Vector3.ZERO
	if cam:
		var b: Basis = cam.flat_basis()
		dir = (b.x * input.x + b.z * input.y)
		dir.y = 0
	var sprint := is_sprinting() and input.length() > 0.4
	var speed := RUN_SPEED if sprint else WALK_SPEED
	# Exhausted or hurt characters move slower.
	var n: Dictionary = GameManager.state.get("needs", {})
	if not n.is_empty():
		if float(n["energy"]) < 12.0:
			speed *= 0.65
			sprint = false
		if float(n["health"]) < 20.0:
			speed *= 0.75
	var target_vel := dir * speed * input.length()
	var accel := 14.0 if is_on_floor() else 4.0
	velocity.x = move_toward(velocity.x, target_vel.x, accel * speed * delta)
	velocity.z = move_toward(velocity.z, target_vel.z, accel * speed * delta)
	if is_on_floor():
		if _jump_queued and not blocked:
			velocity.y = JUMP_VELOCITY
			AudioManager.play_sfx("jump", randf_range(0.95, 1.05), -6.0)
	else:
		velocity.y -= GRAVITY * delta
	_jump_queued = false
	move_and_slide()
	if global_position.y < -20.0:
		global_position = CityLayout.SPAWN
		velocity = Vector3.ZERO
	var hspeed := Vector2(velocity.x, velocity.z).length()
	if hspeed > 0.2:
		var face := atan2(velocity.x, velocity.z)
		model.rotation.y = lerp_angle(model.rotation.y, face, minf(1.0, delta * 12.0))
	GameManager.activity = "run" if (sprint and hspeed > 4.0) else ("walk" if hspeed > 0.5 else "idle")
	_track_distance(hspeed * delta, delta)
	_footsteps(hspeed, delta)
	_animate(delta, hspeed)


func _animate(delta: float, hspeed: float) -> void:
	var a := "idle"
	match state:
		"sit":
			a = "sit"
		"sleep":
			a = "sleep"
		"work":
			a = "work"
		_:
			if not is_on_floor():
				a = "jump"
			elif hspeed > 4.2:
				a = "run"
			elif hspeed > 0.4:
				a = "walk"
	_anim_state = a
	model.animate(delta, hspeed, a)
	MultiplayerManager.local_transform = {"pos": global_position, "rot": model.rotation.y, "anim": a, "vehicle": ""}


func _footsteps(hspeed: float, delta: float) -> void:
	if not is_on_floor() or hspeed < 0.5:
		return
	_step_phase += delta * (hspeed / 1.4)
	if _step_phase >= 1.0:
		_step_phase = 0.0
		AudioManager.play_sfx("step_run" if hspeed > 4.2 else "step_walk", randf_range(0.9, 1.1), -10.0)


func _track_distance(d: float, delta: float) -> void:
	_walk_acc += d
	if _walk_acc >= 10.0:
		GameManager.record_event("walk_distance", {"count": _walk_acc})
		_walk_acc = 0.0
	_district_timer += delta
	if _district_timer >= 1.0:
		_district_timer = 0.0
		var dist := CityLayout.district_at(global_position)
		if dist != "" and dist != _last_district:
			_last_district = dist
			GameManager.record_event("visit", {"id": "district:" + dist})
			if world and world.hud:
				world.hud.show_district(CityLayout.DISTRICTS[dist]["name"])
		for lid in ["fountain", "plaza", "park"]:
			if global_position.distance_to(CityLayout.location_pos(lid)) < 9.0:
				GameManager.record_event("visit", {"id": lid})


# ------------------------------------------------------------------ interaction

func _on_area_entered(a: Area3D) -> void:
	if a is Interactable and not (a in _nearby):
		_nearby.append(a)
		_update_current()


func _on_area_exited(a: Area3D) -> void:
	_nearby.erase(a)
	_update_current()


func _update_current() -> void:
	var best: Interactable = null
	var best_d := 1e9
	for a in _nearby:
		if not is_instance_valid(a) or not a.monitorable:
			continue
		var d: float = a.global_position.distance_to(global_position)
		if d < best_d:
			best_d = d
			best = a
	if best != current_interactable:
		current_interactable = best
		interactable_changed.emit(best)


func _process(_delta: float) -> void:
	# Interactables can move (NPCs, vehicles), so re-pick a few times a second.
	if Engine.get_process_frames() % 10 == 0:
		_nearby = _nearby.filter(func(a): return is_instance_valid(a))
		_update_current()


func interact() -> void:
	if GameManager.ui_blocking > 0 or world == null:
		return
	if state == "sit":
		stand_up()
		return
	if current_interactable and is_instance_valid(current_interactable):
		world.handle_interaction(current_interactable)


func sit_at(seat: Vector3, rot: float) -> void:
	state = "sit"
	_seat_pos = global_position
	global_position = Vector3(seat.x, seat.y, seat.z)
	model.rotation.y = rot + PI
	velocity = Vector3.ZERO


func stand_up() -> void:
	if state == "sit" or state == "sleep":
		state = "normal"
		global_position = _seat_pos if _seat_pos != Vector3.ZERO else global_position + Vector3(0, 0.2, 1)


func lie_down(bed_pos: Vector3, rot: float) -> void:
	state = "sleep"
	_seat_pos = global_position
	global_position = bed_pos
	model.rotation.y = rot


func enter_vehicle(v: Node) -> void:
	vehicle = v
	state = "drive"
	visible = false
	collision_layer = 0
	collision_mask = 0
	GameManager.activity = "drive"


func exit_vehicle(exit_pos: Vector3) -> void:
	vehicle = null
	state = "normal"
	visible = true
	collision_layer = 2
	collision_mask = 1 | 4 | 8
	global_position = exit_pos
	velocity = Vector3.ZERO


func teleport(p: Vector3) -> void:
	global_position = p
	velocity = Vector3.ZERO
	_nearby.clear()
	_update_current()
