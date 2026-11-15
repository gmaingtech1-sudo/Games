class_name VehicleModel
extends Node3D
## Builds an original low-poly car, van or motorcycle from primitive meshes.
## The front of the vehicle faces -Z.

var wheels: Array[Node3D] = []
var body_mats: Array = []
var kind := "car"
var lights_mat: StandardMaterial3D


func build(type: String, color: Color, style: String = "") -> void:
	kind = type
	for c in get_children():
		c.queue_free()
	wheels.clear()
	var paint := CharacterModel.mat(color, 0.35, 0.4)
	var glass := CharacterModel.mat(Color(0.15, 0.2, 0.28), 0.1, 0.2)
	var dark := CharacterModel.mat(Color(0.08, 0.08, 0.09), 0.8)
	var chrome := CharacterModel.mat(Color(0.8, 0.8, 0.82), 0.2, 0.9)
	lights_mat = StandardMaterial3D.new()
	lights_mat.albedo_color = Color(1, 1, 0.9)
	lights_mat.emission_enabled = true
	lights_mat.emission = Color(1, 0.95, 0.8)
	lights_mat.emission_energy_multiplier = 0.5
	var tail := CharacterModel.mat(Color(0.8, 0.1, 0.1), 0.4)
	match type:
		"motorcycle":
			_box(Vector3(0, 0.62, 0), Vector3(0.3, 0.35, 1.3), paint)
			_box(Vector3(0, 0.85, 0.15), Vector3(0.32, 0.12, 0.6), dark)       # seat
			_box(Vector3(0, 0.95, -0.55), Vector3(0.7, 0.06, 0.06), chrome)    # handlebar
			_box(Vector3(0, 0.75, -0.62), Vector3(0.18, 0.3, 0.12), paint)
			_box(Vector3(0, 0.82, -0.7), Vector3(0.12, 0.1, 0.05), lights_mat)
			_wheel(Vector3(0, 0.33, -0.7), 0.33, 0.12)
			_wheel(Vector3(0, 0.33, 0.7), 0.33, 0.14)
		"van":
			_box(Vector3(0, 0.95, 0.35), Vector3(2.0, 1.6, 3.6), paint)
			_box(Vector3(0, 0.75, -1.85), Vector3(1.95, 1.1, 1.0), paint)
			_box(Vector3(0, 1.35, -1.4), Vector3(1.85, 0.6, 0.12), glass)
			_box(Vector3(0, 0.3, 0), Vector3(2.05, 0.25, 5.0), dark)
			_box(Vector3(-0.7, 0.8, -2.36), Vector3(0.3, 0.15, 0.05), lights_mat)
			_box(Vector3(0.7, 0.8, -2.36), Vector3(0.3, 0.15, 0.05), lights_mat)
			_box(Vector3(-0.8, 0.8, 2.16), Vector3(0.25, 0.2, 0.05), tail)
			_box(Vector3(0.8, 0.8, 2.16), Vector3(0.25, 0.2, 0.05), tail)
			for p in [Vector3(-0.9, 0.38, -1.6), Vector3(0.9, 0.38, -1.6), Vector3(-0.9, 0.38, 1.6), Vector3(0.9, 0.38, 1.6)]:
				_wheel(p, 0.38, 0.28)
		_:
			var low := style in ["sports_car", "supercar"]
			var tall := style == "suv"
			var h := 0.5 if low else (0.85 if tall else 0.62)
			var length := 4.3 if not tall else 4.6
			_box(Vector3(0, 0.25 + h * 0.5, 0), Vector3(1.85, h, length), paint)
			var cab_h := 0.45 if low else (0.65 if tall else 0.55)
			var cab_len := 1.9 if not low else 1.6
			_box(Vector3(0, 0.25 + h + cab_h * 0.5, 0.25), Vector3(1.6, cab_h, cab_len), paint)
			_box(Vector3(0, 0.25 + h + cab_h * 0.5, 0.25 - cab_len * 0.5 - 0.01), Vector3(1.5, cab_h * 0.85, 0.06), glass)
			_box(Vector3(0, 0.25 + h + cab_h * 0.5, 0.25 + cab_len * 0.5 + 0.01), Vector3(1.5, cab_h * 0.85, 0.06), glass)
			_box(Vector3(-0.81, 0.25 + h + cab_h * 0.5, 0.25), Vector3(0.02, cab_h * 0.75, cab_len * 0.85), glass)
			_box(Vector3(0.81, 0.25 + h + cab_h * 0.5, 0.25), Vector3(0.02, cab_h * 0.75, cab_len * 0.85), glass)
			_box(Vector3(0, 0.25, 0), Vector3(1.9, 0.18, length + 0.1), dark)
			_box(Vector3(-0.6, 0.25 + h * 0.6, -length * 0.5 - 0.01), Vector3(0.35, 0.14, 0.04), lights_mat)
			_box(Vector3(0.6, 0.25 + h * 0.6, -length * 0.5 - 0.01), Vector3(0.35, 0.14, 0.04), lights_mat)
			_box(Vector3(-0.65, 0.25 + h * 0.6, length * 0.5 + 0.01), Vector3(0.3, 0.14, 0.04), tail)
			_box(Vector3(0.65, 0.25 + h * 0.6, length * 0.5 + 0.01), Vector3(0.3, 0.14, 0.04), tail)
			if low:
				_box(Vector3(0, 0.25 + h + 0.1, length * 0.5 - 0.2), Vector3(1.7, 0.06, 0.35), dark)   # spoiler
			var r := 0.36 if not tall else 0.42
			for p in [Vector3(-0.85, r, -length * 0.32), Vector3(0.85, r, -length * 0.32), Vector3(-0.85, r, length * 0.32), Vector3(0.85, r, length * 0.32)]:
				_wheel(p, r, 0.26)
	for c in get_children():
		if c is MeshInstance3D:
			c.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON


func _box(pos: Vector3, size: Vector3, m: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.position = pos
	mi.material_override = m
	add_child(mi)
	return mi


func _wheel(pos: Vector3, r: float, w: float) -> void:
	var pivot := Node3D.new()
	pivot.position = pos
	add_child(pivot)
	var spinner := Node3D.new()
	spinner.name = "Spin"
	pivot.add_child(spinner)
	var mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = r
	cyl.bottom_radius = r
	cyl.height = w
	cyl.radial_segments = 12
	mi.mesh = cyl
	mi.rotation_degrees = Vector3(0, 0, 90)
	mi.material_override = CharacterModel.mat(Color(0.08, 0.08, 0.08), 0.9)
	spinner.add_child(mi)
	var hub := MeshInstance3D.new()
	var hc := CylinderMesh.new()
	hc.top_radius = r * 0.55
	hc.bottom_radius = r * 0.55
	hc.height = w + 0.02
	hc.radial_segments = 8
	hub.mesh = hc
	hub.rotation_degrees = Vector3(0, 0, 90)
	hub.material_override = CharacterModel.mat(Color(0.75, 0.75, 0.78), 0.3, 0.8)
	spinner.add_child(hub)
	wheels.append(pivot)


func spin_wheels(dist: float, steer: float) -> void:
	for i in wheels.size():
		var w := wheels[i]
		var sp := w.get_child(0) as Node3D
		sp.rotate_x(-dist / 0.36)
		if i < 2 or (kind == "motorcycle" and i == 0):
			w.rotation.y = -steer * 0.45


func set_lights(on: bool) -> void:
	if lights_mat:
		lights_mat.emission_energy_multiplier = 3.0 if on else 0.4
