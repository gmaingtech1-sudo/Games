extends Node3D
## Another player in an online session. Positions arrive ~10 times a second
## and are interpolated smoothly. Shows their name and their vehicle.

var peer_id := 0
var model: CharacterModel
var vehicle_model: VehicleModel
var label: Label3D
var _target_pos := Vector3.ZERO
var _target_rot := 0.0
var _anim := "idle"
var _vehicle_id := ""
var _speed := 0.0
var _last_pos := Vector3.ZERO


func setup(pid: int, info: Dictionary) -> void:
	peer_id = pid
	model = CharacterModel.new()
	add_child(model)
	label = Label3D.new()
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position.y = 2.2
	label.font_size = 44
	label.pixel_size = 0.008
	label.outline_size = 10
	label.modulate = Color(0.6, 1.0, 0.9)
	add_child(label)
	update_info(info)


func update_info(info: Dictionary) -> void:
	label.text = str(info.get("name", "Player"))
	model.setup(info.get("appearance", PlayerState.default_appearance()), info.get("equipped", {}))


func push_state(pos: Vector3, rot: float, anim: String, vehicle_id: String) -> void:
	if _target_pos == Vector3.ZERO:
		global_position = pos
	_target_pos = pos
	_target_rot = rot
	_anim = anim
	if vehicle_id != _vehicle_id:
		_vehicle_id = vehicle_id
		if vehicle_model:
			vehicle_model.queue_free()
			vehicle_model = null
		if vehicle_id != "":
			var d: Dictionary = DataDB.vehicles.get(vehicle_id, {})
			vehicle_model = VehicleModel.new()
			add_child(vehicle_model)
			vehicle_model.build(d.get("type", "car"), Color(0.7, 0.7, 0.75), vehicle_id)
		model.visible = vehicle_id == ""


func _process(delta: float) -> void:
	var prev := global_position
	global_position = global_position.lerp(_target_pos, minf(1.0, delta * 10.0))
	if global_position.distance_to(_target_pos) > 25.0:
		global_position = _target_pos
	_speed = lerpf(_speed, prev.distance_to(global_position) / maxf(delta, 0.001), 0.2)
	if _vehicle_id != "":
		rotation.y = lerp_angle(rotation.y, _target_rot, minf(1.0, delta * 10.0))
		model.rotation.y = 0.0
		if vehicle_model:
			vehicle_model.spin_wheels(_speed * delta, 0.0)
	else:
		rotation.y = 0.0
		model.rotation.y = lerp_angle(model.rotation.y, _target_rot, minf(1.0, delta * 10.0))
		model.animate(delta, _speed, _anim)
