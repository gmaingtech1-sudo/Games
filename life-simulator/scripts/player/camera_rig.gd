extends Node3D
## Third-person orbit camera. Drag the right side of the screen (or the mouse)
## to look around. A SpringArm keeps it from clipping through buildings.
## When driving it swings in behind the vehicle automatically.

var target: Node3D
var yaw := 0.0
var pitch := -0.3
var distance := 5.0
var target_distance := 5.0
var height := 1.5
var auto_follow := false
var camera: Camera3D
var arm: SpringArm3D
var _pitch_node: Node3D
var _idle_time := 0.0


func _ready() -> void:
	_pitch_node = Node3D.new()
	add_child(_pitch_node)
	arm = SpringArm3D.new()
	arm.spring_length = distance
	arm.margin = 0.3
	arm.collision_mask = 1
	var sh := SphereShape3D.new()
	sh.radius = 0.25
	arm.shape = sh
	_pitch_node.add_child(arm)
	camera = Camera3D.new()
	camera.fov = 62
	camera.near = 0.15
	camera.far = float(Settings.preset()["view_distance"]) + 40.0
	camera.current = true
	arm.add_child(camera)


func set_far(view: float) -> void:
	if camera:
		camera.far = view + 40.0


func rotate_input(rel: Vector2) -> void:
	var sens := 0.006 * float(Settings.get_value("camera_sensitivity", 1.0))
	yaw -= rel.x * sens
	var inv := -1.0 if Settings.get_value("invert_y", false) else 1.0
	pitch = clampf(pitch - rel.y * sens * inv, -1.2, 0.35)
	_idle_time = 0.0


func zoom(delta: float) -> void:
	target_distance = clampf(target_distance + delta, 2.5, 14.0)


func _physics_process(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	var tp := target.global_position + Vector3(0, height, 0)
	global_position = global_position.lerp(tp, minf(1.0, delta * 12.0)) if global_position.distance_to(tp) < 20.0 else tp
	_idle_time += delta
	if auto_follow and _idle_time > 1.2:
		# Swing behind the vehicle's facing direction.
		var fwd := -target.global_transform.basis.z
		var want := atan2(-fwd.x, -fwd.z)
		yaw = lerp_angle(yaw, want, minf(1.0, delta * 2.5))
		pitch = lerpf(pitch, -0.22, delta * 2.0)
	distance = lerpf(distance, target_distance, minf(1.0, delta * 4.0))
	arm.spring_length = distance
	rotation = Vector3(0, yaw, 0)
	_pitch_node.rotation = Vector3(pitch, 0, 0)


## Flat forward/right vectors for camera-relative movement.
func flat_basis() -> Basis:
	return Basis(Vector3.UP, yaw)
