class_name CharacterModel
extends Node3D
## A stylised humanoid built from primitive meshes, with procedural animation
## (walk, run, jump, sit, sleep, drive, wave). Used for the player, NPCs,
## remote players and the character-creator preview. Original art, no assets.

const SKIN_TONES := ["#f6d7c3", "#e8b896", "#c99470", "#a5714d", "#7a4f33", "#4f3221"]
const HAIR_STYLES := ["Buzz cut", "Short", "Long", "Ponytail", "Curly", "Bun", "Spiky"]
const HAIR_COLORS := ["#14110f", "#3b2a20", "#6b4a2a", "#a33a1a", "#c7752e", "#e3c27a", "#f0e6d0", "#7a7f87", "#5e3a8c", "#2e6fd1", "#d94f8a"]

static var _mats := {}

var appearance: Dictionary = {}
var equipped: Dictionary = {}
var anim := "idle"
var _phase := 0.0
var _speed := 0.0
var _wave_t := 0.0

var body_root: Node3D
var hips: Node3D
var torso: Node3D
var head: Node3D
var leg_l: Node3D
var leg_r: Node3D
var arm_l: Node3D
var arm_r: Node3D


static func mat(color: Color, rough: float = 0.8, metal: float = 0.0) -> StandardMaterial3D:
	var key := "%s_%.2f_%.2f" % [color.to_html(), rough, metal]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = metal
	_mats[key] = m
	return m


func setup(app: Dictionary, eq: Dictionary) -> void:
	appearance = app.duplicate()
	equipped = eq.duplicate()
	rebuild()


func rebuild() -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
	var body: String = appearance.get("body", "masc")
	var skin := Color(SKIN_TONES[clampi(int(appearance.get("skin", 1)), 0, SKIN_TONES.size() - 1)])
	var hair_col := Color(str(appearance.get("hair_color", "#3b2a20")))
	var top := _cloth("top", "#f2f2f2", "tshirt")
	var bottom := _cloth("bottom", "#6d7078", "trousers")
	var shoes := _cloth("shoes", "#444a55", "trainers")
	var acc := _cloth("accessory", "", "")

	var shoulder := 0.21 if body == "masc" else (0.175 if body == "fem" else 0.19)
	var hip_w := 0.1 if body == "masc" else 0.11
	var torso_w := 1.12 if body == "masc" else (0.95 if body == "fem" else 1.03)

	body_root = Node3D.new()
	add_child(body_root)
	hips = Node3D.new()
	hips.position = Vector3(0, 0.93, 0)
	body_root.add_child(hips)

	# Legs (pivot at hip joint)
	leg_l = _limb(hips, Vector3(-hip_w, 0, 0), 0.82, 0.072, bottom["color"], skin, bottom["style"] == "shorts" or bottom["style"] == "skirt", shoes)
	leg_r = _limb(hips, Vector3(hip_w, 0, 0), 0.82, 0.072, bottom["color"], skin, bottom["style"] == "shorts" or bottom["style"] == "skirt", shoes)
	# Pelvis
	var pelvis := _mesh(hips, _capsule(0.15, 0.36), Vector3(0, -0.02, 0), bottom["color"])
	pelvis.rotation_degrees = Vector3(0, 0, 90)
	pelvis.scale = Vector3(1, 1.0 if body == "masc" else 1.1, 0.85)
	if bottom["style"] == "skirt":
		var sk := CylinderMesh.new()
		sk.top_radius = 0.17
		sk.bottom_radius = 0.27
		sk.height = 0.42
		_mesh(hips, sk, Vector3(0, -0.2, 0), bottom["color"])

	# Torso
	torso = Node3D.new()
	torso.position = Vector3(0, 0.02, 0)
	hips.add_child(torso)
	var chest := _mesh(torso, _capsule(0.17, 0.62), Vector3(0, 0.3, 0), top["color"])
	chest.scale = Vector3(torso_w, 1.0, 0.72)
	if body == "fem":
		var bust := _mesh(torso, SphereMesh.new(), Vector3(0, 0.38, 0.07), top["color"])
		bust.scale = Vector3(0.28, 0.13, 0.14)
	if top["style"] == "dress":
		var dr := CylinderMesh.new()
		dr.top_radius = 0.18
		dr.bottom_radius = 0.3
		dr.height = 0.55
		_mesh(torso, dr, Vector3(0, -0.15, 0), top["color"])
	if top["style"] == "hoodie":
		var hood := _mesh(torso, SphereMesh.new(), Vector3(0, 0.6, -0.1), top["color"].darkened(0.1))
		hood.scale = Vector3(0.3, 0.16, 0.18)
	if top["style"] == "jacket" or top["style"] == "shirt":
		var collar := _mesh(torso, BoxMesh.new(), Vector3(0, 0.56, 0.06), Color(0.95, 0.95, 0.95) if top["style"] == "jacket" else top["color"].lightened(0.15))
		collar.scale = Vector3(0.12, 0.08, 0.06)
	# Arms (pivot at shoulder)
	var long_sleeve: bool = top["style"] in ["hoodie", "jacket", "shirt"]
	arm_l = _arm(torso, Vector3(-shoulder - 0.03, 0.55, 0), top["color"], skin, long_sleeve)
	arm_r = _arm(torso, Vector3(shoulder + 0.03, 0.55, 0), top["color"], skin, long_sleeve)
	# Neck + head
	var neck := CylinderMesh.new()
	neck.top_radius = 0.045
	neck.bottom_radius = 0.055
	neck.height = 0.1
	_mesh(torso, neck, Vector3(0, 0.66, 0), skin)
	head = Node3D.new()
	head.position = Vector3(0, 0.8, 0)
	torso.add_child(head)
	var skull := _mesh(head, SphereMesh.new(), Vector3.ZERO, skin)
	skull.scale = Vector3(0.22, 0.25, 0.23)
	var eye_col := Color(str(appearance.get("eyes", "#3a2a1a")))
	for sx in [-0.045, 0.045]:
		var white := _mesh(head, SphereMesh.new(), Vector3(sx, 0.015, 0.098), Color(0.97, 0.97, 0.97))
		white.scale = Vector3(0.042, 0.036, 0.02)
		var eye := _mesh(head, SphereMesh.new(), Vector3(sx, 0.015, 0.108), eye_col)
		eye.scale = Vector3(0.022, 0.024, 0.01)
	var nose := _mesh(head, SphereMesh.new(), Vector3(0, -0.02, 0.11), skin.darkened(0.06))
	nose.scale = Vector3(0.03, 0.04, 0.03)
	var mouth := _mesh(head, BoxMesh.new(), Vector3(0, -0.065, 0.1), Color(0.55, 0.25, 0.25))
	mouth.scale = Vector3(0.05, 0.01, 0.01)
	_hair(int(appearance.get("hair", 1)), hair_col)
	_accessory(acc)
	_set_shadows(self)


func _cloth(slot: String, def_color: String, def_style: String) -> Dictionary:
	var id: String = equipped.get(slot, "")
	var it := DataDB.item(id) if id != "" else {}
	if it.is_empty():
		return {"color": Color(def_color) if def_color != "" else Color.WHITE, "style": def_style, "id": ""}
	return {"color": Color(str(it.get("color", def_color))), "style": str(it.get("style", def_style)), "id": id}


func _capsule(r: float, h: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = r
	c.height = h
	c.radial_segments = 12
	c.rings = 4
	return c


func _mesh(parent: Node3D, mesh: Mesh, pos: Vector3, color: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	mi.material_override = mat(color)
	parent.add_child(mi)
	return mi


func _limb(parent: Node3D, pos: Vector3, length: float, radius: float, color: Color, skin: Color, bare_lower: bool, shoes: Dictionary) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = pos
	parent.add_child(pivot)
	var upper := _mesh(pivot, _capsule(radius + 0.01, length * 0.55), Vector3(0, -length * 0.25, 0), color)
	upper.name = "Upper"
	var lower := _mesh(pivot, _capsule(radius, length * 0.55), Vector3(0, -length * 0.68, 0), skin if bare_lower else color)
	lower.name = "Lower"
	var shoe := _mesh(pivot, BoxMesh.new(), Vector3(0, -length + 0.0, 0.04), shoes["color"])
	shoe.scale = Vector3(0.11, 0.08 if shoes["style"] != "boots" else 0.14, 0.24)
	if shoes["style"] == "trainers":
		var sole := _mesh(pivot, BoxMesh.new(), Vector3(0, -length - 0.04, 0.04), Color(0.95, 0.95, 0.95))
		sole.scale = Vector3(0.115, 0.02, 0.25)
	return pivot


func _arm(parent: Node3D, pos: Vector3, color: Color, skin: Color, long_sleeve: bool) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = pos
	parent.add_child(pivot)
	_mesh(pivot, _capsule(0.058, 0.36), Vector3(0, -0.15, 0), color)
	_mesh(pivot, _capsule(0.05, 0.34), Vector3(0, -0.43, 0), color if long_sleeve else skin)
	var hand := _mesh(pivot, SphereMesh.new(), Vector3(0, -0.62, 0), skin)
	hand.scale = Vector3(0.07, 0.09, 0.06)
	return pivot


func _hair(style: int, col: Color) -> void:
	match style:
		0:
			var cap := _mesh(head, SphereMesh.new(), Vector3(0, 0.03, -0.005), col)
			cap.scale = Vector3(0.232, 0.24, 0.235)
			cap.material_override = mat(col.lerp(Color(CharacterModel.SKIN_TONES[0]), 0.35))
		1:
			var cap := _mesh(head, SphereMesh.new(), Vector3(0, 0.05, -0.01), col)
			cap.scale = Vector3(0.24, 0.23, 0.245)
			var fringe := _mesh(head, BoxMesh.new(), Vector3(0, 0.1, 0.08), col)
			fringe.scale = Vector3(0.2, 0.05, 0.06)
		2:
			var cap := _mesh(head, SphereMesh.new(), Vector3(0, 0.05, -0.01), col)
			cap.scale = Vector3(0.245, 0.24, 0.25)
			var back := _mesh(head, BoxMesh.new(), Vector3(0, -0.12, -0.08), col)
			back.scale = Vector3(0.24, 0.32, 0.1)
			for sx in [-0.11, 0.11]:
				var side := _mesh(head, BoxMesh.new(), Vector3(sx, -0.08, 0.0), col)
				side.scale = Vector3(0.04, 0.26, 0.14)
		3:
			var cap := _mesh(head, SphereMesh.new(), Vector3(0, 0.05, -0.01), col)
			cap.scale = Vector3(0.24, 0.23, 0.245)
			var tail := _mesh(head, _capsule(0.04, 0.26), Vector3(0, -0.06, -0.15), col)
			tail.rotation_degrees = Vector3(-25, 0, 0)
		4:
			var puff := _mesh(head, SphereMesh.new(), Vector3(0, 0.08, -0.02), col)
			puff.scale = Vector3(0.34, 0.3, 0.32)
		5:
			var cap := _mesh(head, SphereMesh.new(), Vector3(0, 0.05, -0.01), col)
			cap.scale = Vector3(0.24, 0.23, 0.245)
			var bun := _mesh(head, SphereMesh.new(), Vector3(0, 0.16, -0.1), col)
			bun.scale = Vector3(0.11, 0.11, 0.11)
		6:
			var cap := _mesh(head, SphereMesh.new(), Vector3(0, 0.04, -0.01), col)
			cap.scale = Vector3(0.235, 0.22, 0.24)
			for i in 5:
				var spike := CylinderMesh.new()
				spike.top_radius = 0.0
				spike.bottom_radius = 0.035
				spike.height = 0.1
				var sp := _mesh(head, spike, Vector3(0, 0.14, 0.06 - i * 0.04), col)
				sp.rotation_degrees = Vector3(-20 - i * 12, 0, 0)


func _accessory(acc: Dictionary) -> void:
	if acc["id"] == "":
		return
	var c: Color = acc["color"]
	match acc["style"]:
		"cap":
			var crown := _mesh(head, SphereMesh.new(), Vector3(0, 0.08, 0), c)
			crown.scale = Vector3(0.25, 0.17, 0.25)
			var brim := _mesh(head, BoxMesh.new(), Vector3(0, 0.07, 0.15), c)
			brim.scale = Vector3(0.2, 0.015, 0.12)
		"beanie":
			var b := _mesh(head, SphereMesh.new(), Vector3(0, 0.09, 0), c)
			b.scale = Vector3(0.25, 0.2, 0.25)
		"glasses", "sunglasses":
			for sx in [-0.045, 0.045]:
				var lens := _mesh(head, BoxMesh.new(), Vector3(sx, 0.015, 0.118), c if acc["style"] == "sunglasses" else Color(0.8, 0.9, 1.0))
				lens.scale = Vector3(0.06, 0.04, 0.008)
				if acc["style"] == "glasses":
					lens.material_override = mat(Color(0.75, 0.85, 0.95, 1.0), 0.1)
			var bridge := _mesh(head, BoxMesh.new(), Vector3(0, 0.03, 0.118), Color(0.1, 0.1, 0.1))
			bridge.scale = Vector3(0.14, 0.008, 0.008)
		"chain":
			var t := TorusMesh.new()
			t.inner_radius = 0.09
			t.outer_radius = 0.105
			var ch := _mesh(torso, t, Vector3(0, 0.6, 0.04), c)
			ch.material_override = mat(c, 0.25, 0.9)
			ch.rotation_degrees = Vector3(70, 0, 0)
		"backpack":
			var bp := _mesh(torso, BoxMesh.new(), Vector3(0, 0.32, -0.17), c)
			bp.scale = Vector3(0.3, 0.38, 0.14)


func _set_shadows(n: Node) -> void:
	for c in n.get_children():
		if c is MeshInstance3D:
			(c as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		_set_shadows(c)


## Advances the procedural animation. speed is horizontal speed in m/s.
func animate(delta: float, speed: float, state: String) -> void:
	anim = state
	_speed = lerpf(_speed, speed, minf(1.0, delta * 10.0))
	if hips == null:
		return
	var swing := 0.0
	var arm_swing := 0.0
	body_root.position = Vector3.ZERO
	body_root.rotation = Vector3.ZERO
	hips.position.y = 0.93
	torso.rotation = Vector3.ZERO
	arm_l.rotation = Vector3.ZERO
	arm_r.rotation = Vector3.ZERO
	leg_l.rotation = Vector3.ZERO
	leg_r.rotation = Vector3.ZERO
	head.rotation = Vector3.ZERO
	match state:
		"walk", "run":
			var rate := 7.5 if state == "walk" else 11.0
			_phase += delta * rate * clampf(_speed / (2.5 if state == "walk" else 6.0), 0.4, 1.4)
			swing = sin(_phase) * (0.55 if state == "walk" else 0.9)
			arm_swing = swing * 0.8
			hips.position.y = 0.93 + absf(sin(_phase)) * (0.03 if state == "walk" else 0.06)
			torso.rotation.x = 0.0 if state == "walk" else 0.18
			leg_l.rotation.x = swing
			leg_r.rotation.x = -swing
			arm_l.rotation.x = -arm_swing
			arm_r.rotation.x = arm_swing
			arm_l.rotation.z = -0.08
			arm_r.rotation.z = 0.08
		"jump":
			leg_l.rotation.x = 0.5
			leg_r.rotation.x = -0.2
			arm_l.rotation.z = -1.2
			arm_r.rotation.z = 1.2
		"sit", "drive":
			hips.position.y = 0.5
			leg_l.rotation.x = -1.45
			leg_r.rotation.x = -1.45
			if state == "drive":
				arm_l.rotation.x = -1.1
				arm_r.rotation.x = -1.1
			else:
				arm_l.rotation.x = -0.35
				arm_r.rotation.x = -0.35
		"ride":
			hips.position.y = 0.72
			leg_l.rotation.x = -1.0
			leg_r.rotation.x = -1.0
			leg_l.rotation.z = -0.25
			leg_r.rotation.z = 0.25
			torso.rotation.x = 0.35
			arm_l.rotation.x = -1.2
			arm_r.rotation.x = -1.2
		"sleep":
			body_root.rotation.x = -PI / 2
			body_root.position = Vector3(0, 0.25, 0.9)
		"work":
			_phase += delta * 6.0
			arm_l.rotation.x = -0.9 + sin(_phase) * 0.3
			arm_r.rotation.x = -0.9 - sin(_phase) * 0.3
		_:
			# idle breathing
			_phase += delta * 1.6
			torso.rotation.x = sin(_phase) * 0.015
			arm_l.rotation.z = -0.06 - sin(_phase) * 0.02
			arm_r.rotation.z = 0.06 + sin(_phase) * 0.02
	if _wave_t > 0.0:
		_wave_t -= delta
		arm_r.rotation.z = 2.6
		arm_r.rotation.x = sin(_wave_t * 14.0) * 0.3


func wave() -> void:
	_wave_t = 1.4
