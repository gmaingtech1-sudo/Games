extends CharacterBody3D
## Drivable vehicle with arcade physics tuned for touch controls:
## acceleration, braking, reverse, speed-sensitive steering, handbrake,
## collisions that cause damage, fuel use, engine sound and headlights.
## The authoritative fuel/damage values live in the player state; this node
## reports wear with the "vehicle_report" action (the server only accepts
## fuel going down and damage going up).

signal crashed(impact: float)

const GRAVITY := 20.0

var uid := ""                 # owned vehicle uid ("" for loaners)
var def: Dictionary = {}
var record: Dictionary = {}
var model: VehicleModel
var driver: Node = null
var speed := 0.0
var steer := 0.0
var fuel := 40.0
var damage := 0.0
var odo := 0.0
var throttle_input := 0.0
var steer_input := 0.0
var handbrake := false
var touch_throttle := 0.0
var touch_steer := 0.0
var is_loaner := false
var interact_area: Interactable
var _engine: AudioStreamPlayer3D
var _report_timer := 0.0
var _drive_acc := 0.0
var _crash_cool := 0.0
var _no_fuel_warned := false
var _known_fuel := 0.0       # record values last seen/sent, to detect refuels & repairs
var _known_damage := 0.0


func setup(p_record: Dictionary, loaner: bool = false) -> void:
	record = p_record
	uid = str(record.get("uid", ""))
	is_loaner = loaner
	def = DataDB.vehicles.get(record["id"], {})
	fuel = float(record.get("fuel", def.get("fuel_capacity", 40)))
	damage = float(record.get("damage", 0))
	odo = float(record.get("odo", 0))
	_known_fuel = fuel
	_known_damage = damage


func _ready() -> void:
	collision_layer = 4
	collision_mask = 1 | 2 | 4 | 8
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	var t: String = def.get("type", "car")
	match t:
		"motorcycle":
			box.size = Vector3(0.7, 1.1, 2.0)
		"van":
			box.size = Vector3(2.0, 1.9, 5.0)
		_:
			box.size = Vector3(1.85, 1.3, 4.3)
	cs.shape = box
	cs.position.y = box.size.y * 0.5 + 0.12
	add_child(cs)
	model = VehicleModel.new()
	add_child(model)
	model.build(t, Color(str(record.get("color", "#c0392b"))), str(record.get("id", "")))
	interact_area = Interactable.make("vehicle", uid, "Drive " + str(def.get("name", "vehicle")), maxf(box.size.z * 0.6, 1.8), 2.0)
	interact_area.data = {"vehicle": self}
	add_child(interact_area)
	_engine = AudioStreamPlayer3D.new()
	_engine.stream = AudioManager.loop_stream("engine")
	_engine.bus = "SFX"
	_engine.unit_size = 6.0
	_engine.volume_db = -6.0
	add_child(_engine)
	floor_snap_length = 0.5
	floor_max_angle = deg_to_rad(40)
	GameManager.data_changed.connect(_on_state_changed)


func _on_state_changed() -> void:
	if uid == "" or is_loaner:
		return
	var rec := VehicleRules.find(GameManager.state, uid)
	if rec.is_empty():
		queue_free()   # sold
		return
	# Pick up refuels/repairs/paint done through the rules.
	if float(rec["fuel"]) > _known_fuel + 0.5:
		fuel = float(rec["fuel"])
		_no_fuel_warned = false
	if float(rec["damage"]) < _known_damage - 0.5:
		damage = float(rec["damage"])
	_known_fuel = float(rec["fuel"])
	_known_damage = float(rec["damage"])
	if str(rec["color"]) != str(record.get("color", "")) or int(rec["engine"]) != int(record.get("engine", 0)):
		record = rec.duplicate()
		model.build(def.get("type", "car"), Color(str(rec["color"])), str(rec["id"]))
	record["engine"] = rec["engine"]


func top_speed() -> float:
	var r := record.duplicate()
	r["damage"] = damage
	return VehicleRules.top_speed(r)


func start_driving(p: Node) -> void:
	driver = p
	if _engine.stream:
		_engine.play()
	model.set_lights(WorldClock.is_night())


func stop_driving() -> void:
	driver = null
	throttle_input = 0.0
	steer_input = 0.0
	_engine.stop()
	report(true)


func can_exit() -> bool:
	return absf(speed) < 4.0


func _physics_process(delta: float) -> void:
	var accel := float(def.get("accel", 8))
	var top := top_speed()
	var handling := float(def.get("handling", 2.0))
	var throttle := 0.0
	var st := 0.0
	if driver and GameManager.ui_blocking == 0:
		throttle = Input.get_axis("move_back", "move_forward")
		st = Input.get_axis("move_right", "move_left")
		if absf(touch_throttle) > 0.05:
			throttle = touch_throttle
		if absf(touch_steer) > 0.05:
			st = -touch_steer
		handbrake = Input.is_action_pressed("handbrake") or handbrake
	if damage >= 100.0:
		throttle = 0.0
	if fuel <= 0.0 and throttle != 0.0:
		throttle = 0.0
		if not _no_fuel_warned and driver:
			_no_fuel_warned = true
			GameManager.toast("Out of fuel! Use a fuel can or call delivery from the Vehicles app.", "bad")
	# Longitudinal
	if throttle > 0.0:
		if speed < 0.0:
			speed = move_toward(speed, 0.0, accel * 2.2 * delta)
		else:
			speed = move_toward(speed, top * throttle, accel * delta * (1.0 - speed / maxf(top, 1.0) * 0.5))
	elif throttle < 0.0:
		if speed > 0.5:
			speed = move_toward(speed, 0.0, accel * 2.4 * delta)
		else:
			speed = move_toward(speed, -6.0, accel * 0.6 * delta)
	else:
		speed = move_toward(speed, 0.0, (2.0 + absf(speed) * 0.05) * delta)
	if handbrake:
		speed = move_toward(speed, 0.0, 14.0 * delta)
	# Steering: stronger at low speed, gentler at high speed.
	steer = lerpf(steer, st, minf(1.0, delta * 6.0))
	var speed_factor := clampf(absf(speed) / 6.0, 0.0, 1.0) / (1.0 + absf(speed) * 0.025)
	var turn := steer * handling * speed_factor * signf(speed) * (1.6 if handbrake else 1.0)
	rotate_y(turn * delta)
	var fwd := -global_transform.basis.z
	var vy := velocity.y
	if is_on_floor():
		vy = -0.5
	else:
		vy -= GRAVITY * delta
	velocity = fwd * speed + Vector3(0, vy, 0)
	var before := global_position
	move_and_slide()
	# Collisions
	_crash_cool -= delta
	if get_slide_collision_count() > 0 and absf(speed) > 3.0:
		for i in get_slide_collision_count():
			var col := get_slide_collision(i)
			var n := col.get_normal()
			if absf(n.y) > 0.6:
				continue
			var impact := absf(fwd.dot(n)) * absf(speed)
			if impact > 3.0 and _crash_cool <= 0.0:
				_crash_cool = 0.6
				var dmg := impact * 0.9
				damage = minf(100.0, damage + dmg)
				speed *= 0.35
				AudioManager.play_sfx("crash", randf_range(0.9, 1.1), clampf(-14.0 + impact, -14.0, 0.0))
				Settings.vibrate(int(clampf(impact * 8.0, 20.0, 150.0)))
				crashed.emit(impact)
				if driver and damage >= 100.0:
					GameManager.toast("Your vehicle is wrecked! Get it repaired at Gearhead Garage.", "bad")
				break
	var moved := Vector2(global_position.x - before.x, global_position.z - before.z).length()
	if moved > 0.0 and moved < 5.0:
		odo += moved
		fuel = maxf(0.0, fuel - moved * float(def.get("economy", 0.06)) / 10.0)
		if driver and not is_loaner:
			_drive_acc += moved
			if _drive_acc >= 20.0:
				GameManager.record_event("drive_distance", {"count": _drive_acc})
				_drive_acc = 0.0
		elif driver and is_loaner:
			_drive_acc += moved
			if _drive_acc >= 20.0:
				GameManager.record_event("drive_distance", {"count": _drive_acc})
				_drive_acc = 0.0
	model.spin_wheels(speed * delta, steer)
	if model.kind == "motorcycle":
		model.rotation.z = lerpf(model.rotation.z, -steer * clampf(absf(speed) / 20.0, 0.0, 1.0) * 0.4, delta * 5.0)
	if global_position.y < -10.0:
		global_position = Vector3(global_position.x, 2.0, global_position.z)
		velocity = Vector3.ZERO
	if _engine.playing:
		_engine.pitch_scale = 0.6 + absf(speed) / maxf(top, 1.0) * 1.4
	handbrake = false
	if driver:
		MultiplayerManager.local_transform = {"pos": global_position, "rot": rotation.y, "anim": "drive", "vehicle": str(record.get("id", ""))}
		_report_timer += delta
		if _report_timer > 4.0:
			report(false)


## Sends fuel/damage/odometer/position to the rules (and server when online).
func report(_force: bool) -> void:
	_report_timer = 0.0
	if uid == "" or is_loaner:
		return
	var p := global_position
	_known_fuel = fuel
	_known_damage = damage
	GameManager.act("vehicle_report", {"uid": uid, "fuel": fuel, "damage": damage, "odo": odo, "pos": [p.x, p.y, p.z], "rot": rotation.y})


func honk() -> void:
	AudioManager.play_sfx("horn")
