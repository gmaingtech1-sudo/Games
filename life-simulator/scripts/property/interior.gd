extends Node3D
## Home interior, built from the property's size, decoration choices,
## upgrades and placed furniture. Lives far from the city (and on its own
## light layer) so it renders cheaply and the sun doesn't leak in.

const ORIGIN := Vector3(0, 0, 1200)
const LAYER := 2   # visual layer bit for interior meshes

var property_id := ""
var rec: Dictionary = {}
var def: Dictionary = {}
var interactables: Array = []
var spawn_point := Vector3.ZERO
var _body: StaticBody3D


func build(p_id: String) -> void:
	property_id = p_id
	rec = PropertyRules.find(GameManager.state, p_id)
	def = PropertyRules.def(p_id)
	for c in get_children():
		c.queue_free()
	interactables.clear()
	position = ORIGIN
	var room: Array = def.get("room", [8, 7])
	var w := float(room[0]) + int(rec.get("upgrade", 0)) * 1.5
	var d := float(room[1]) + int(rec.get("upgrade", 0)) * 1.0
	var h := 3.0 if def.get("type", "") != "mansion" else 4.5
	var walls: Array = DataDB.property_meta.get("wall_colors", ["#eeeeee"])
	var floors: Array = DataDB.property_meta.get("floor_colors", ["#9b7653"])
	var wall_c := Color(walls[clampi(int(rec.get("wall", 0)), 0, walls.size() - 1)])
	var floor_c := Color(floors[clampi(int(rec.get("floor", 0)), 0, floors.size() - 1)])
	_body = StaticBody3D.new()
	add_child(_body)
	# Floor, ceiling, walls
	_solid(Vector3(0, -0.1, 0), Vector3(w, 0.2, d), floor_c)
	_solid(Vector3(0, h + 0.1, 0), Vector3(w, 0.2, d), Color(0.95, 0.95, 0.95))
	_solid(Vector3(0, h * 0.5, -d * 0.5 - 0.1), Vector3(w, h, 0.2), wall_c)
	_solid(Vector3(0, h * 0.5, d * 0.5 + 0.1), Vector3(w, h, 0.2), wall_c)
	_solid(Vector3(-w * 0.5 - 0.1, h * 0.5, 0), Vector3(0.2, h, d), wall_c)
	_solid(Vector3(w * 0.5 + 0.1, h * 0.5, 0), Vector3(0.2, h, d), wall_c)
	# Skirting + window
	_deco(Vector3(0, 1.6, -d * 0.5 + 0.01), Vector3(2.4, 1.4, 0.04), Color(0.55, 0.75, 0.95), true)
	_deco(Vector3(-w * 0.25, 1.6, -d * 0.5 + 0.01), Vector3(1.6, 1.4, 0.04), Color(0.55, 0.75, 0.95), true)
	# Lights
	var lamp := OmniLight3D.new()
	lamp.position = Vector3(0, h - 0.4, 0)
	lamp.omni_range = maxf(w, d) * 0.9
	lamp.light_energy = 1.6
	lamp.light_color = Color(1.0, 0.92, 0.8)
	lamp.shadow_enabled = false
	add_child(lamp)
	var fill := OmniLight3D.new()
	fill.position = Vector3(w * 0.3, h - 0.5, d * 0.3)
	fill.omni_range = maxf(w, d) * 0.7
	fill.light_energy = 0.7
	add_child(fill)
	# Door (exit) on the south wall
	_deco(Vector3(0, 1.1, d * 0.5 - 0.02), Vector3(1.2, 2.2, 0.06), Color(0.45, 0.28, 0.16))
	_add_it("exit", "Leave home", Vector3(0, 0, d * 0.5 - 0.9))
	spawn_point = ORIGIN + Vector3(0, 0.1, d * 0.5 - 1.6)
	# Fixed fixtures: bed, shower, kitchen, seating
	var has_double: bool = "double_bed" in rec.get("furniture", [])
	var bed_pos := Vector3(-w * 0.5 + 1.3, 0, -d * 0.5 + 1.4)
	_deco(bed_pos + Vector3(0, 0.25, 0), Vector3(1.6 if has_double else 1.1, 0.5, 2.1), Color(0.45, 0.32, 0.22))
	_deco(bed_pos + Vector3(0, 0.55, 0.15), Vector3(1.5 if has_double else 1.0, 0.15, 1.7), Color(0.85, 0.88, 0.95))
	_deco(bed_pos + Vector3(0, 0.62, -0.75), Vector3(0.9 if has_double else 0.6, 0.15, 0.4), Color.WHITE)
	_add_it("bed", "Sleep", bed_pos + Vector3(1.1, 0, 0.3), {"pos": ORIGIN + bed_pos + Vector3(0, 0.55, 0)})
	var shower_pos := Vector3(w * 0.5 - 0.8, 0, -d * 0.5 + 0.8)
	_deco(shower_pos + Vector3(0, 1.1, 0), Vector3(1.2, 2.2, 1.2), Color(0.75, 0.9, 1.0), true)
	_deco(shower_pos + Vector3(0, 0.05, 0), Vector3(1.2, 0.1, 1.2), Color(0.95, 0.95, 0.95))
	_add_it("shower", "Take a shower", shower_pos + Vector3(-1.0, 0, 0.6))
	var kitchen := Vector3(w * 0.5 - 0.5, 0, 0.6)
	_deco(kitchen + Vector3(0, 0.45, 0), Vector3(0.8, 0.9, 2.4), Color(0.85, 0.85, 0.82))
	_deco(kitchen + Vector3(0, 0.92, 0), Vector3(0.85, 0.05, 2.45), Color(0.25, 0.25, 0.28))
	_deco(kitchen + Vector3(0, 0.95, 1.6), Vector3(0.8, 1.9, 0.8), Color(0.92, 0.92, 0.95))
	_add_it("fridge", "Eat / drink", kitchen + Vector3(-1.0, 0, 0.6))
	var seat := Vector3(-w * 0.5 + 0.7, 0, d * 0.5 - 2.4)
	_deco(seat + Vector3(0, 0.25, 0), Vector3(0.7, 0.5, 0.7), Color(0.4, 0.4, 0.5))
	_add_it("sofa", "Sit down", seat + Vector3(0.9, 0, 0), {"pos": ORIGIN + seat + Vector3(0, 0.0, 0), "rot": -PI / 2})
	_add_it("decorate", "Decorate", Vector3(0, 0, 0.0), {}, 1.2)
	# Placed furniture along the remaining wall space.
	var slots := _slot_positions(w, d)
	var furn: Array = rec.get("furniture", [])
	for i in furn.size():
		if i >= slots.size():
			break
		_furniture(str(furn[i]), slots[i])
	_set_layers(self)


func _slot_positions(w: float, d: float) -> Array:
	var out := []
	var x := -w * 0.5 + 3.0
	while x < w * 0.5 - 2.0:
		out.append(Vector3(x, 0, -d * 0.5 + 0.8))
		x += 2.0
	var z := -d * 0.5 + 3.2
	while z < d * 0.5 - 1.5:
		out.append(Vector3(-w * 0.5 + 0.8, 0, z))
		z += 2.0
	x = -w * 0.5 + 2.6
	while x < w * 0.5 - 2.4:
		if absf(x) > 1.2:
			out.append(Vector3(x, 0, d * 0.5 - 0.8))
		x += 2.2
	for k in 6:
		out.append(Vector3(-w * 0.2 + k * 1.6, 0, 0.0 - 0.5 + (k % 2)))
	return out


func _furniture(item_id: String, p: Vector3) -> void:
	var it := DataDB.item(item_id)
	var model: String = it.get("furniture_model", "box")
	match model:
		"sofa":
			_deco(p + Vector3(0, 0.25, 0), Vector3(2.0, 0.5, 0.9), Color(0.3, 0.45, 0.65))
			_deco(p + Vector3(0, 0.65, -0.35), Vector3(2.0, 0.6, 0.2), Color(0.3, 0.45, 0.65))
			_add_it("sofa", "Relax on the sofa", p + Vector3(0, 0, 1.0), {"pos": ORIGIN + p + Vector3(0, 0, 0.1), "rot": 0.0})
		"armchair":
			_deco(p + Vector3(0, 0.25, 0), Vector3(0.9, 0.5, 0.9), Color(0.6, 0.3, 0.25))
			_deco(p + Vector3(0, 0.65, -0.35), Vector3(0.9, 0.6, 0.2), Color(0.6, 0.3, 0.25))
		"table":
			_deco(p + Vector3(0, 0.75, 0), Vector3(1.6, 0.06, 0.9), Color(0.5, 0.35, 0.2))
			for o in [Vector3(-0.7, 0.37, -0.35), Vector3(0.7, 0.37, -0.35), Vector3(-0.7, 0.37, 0.35), Vector3(0.7, 0.37, 0.35)]:
				_deco(p + o, Vector3(0.06, 0.74, 0.06), Color(0.4, 0.28, 0.16))
		"bookshelf":
			_deco(p + Vector3(0, 0.9, -0.1), Vector3(1.2, 1.8, 0.35), Color(0.45, 0.3, 0.18))
			for k in 3:
				_deco(p + Vector3(0, 0.45 + k * 0.5, 0.05), Vector3(1.0, 0.3, 0.1), [Color(0.7, 0.2, 0.2), Color(0.2, 0.4, 0.7), Color(0.3, 0.6, 0.3)][k])
		"plant":
			_deco(p + Vector3(0, 0.2, 0), Vector3(0.4, 0.4, 0.4), Color(0.75, 0.45, 0.3))
			_deco(p + Vector3(0, 0.75, 0), Vector3(0.7, 0.8, 0.7), Color(0.2, 0.55, 0.25))
		"lamp":
			_deco(p + Vector3(0, 0.8, 0), Vector3(0.06, 1.6, 0.06), Color(0.2, 0.2, 0.2))
			_deco(p + Vector3(0, 1.65, 0), Vector3(0.45, 0.35, 0.45), Color(1, 0.92, 0.7), false, true)
		"rug":
			_deco(p + Vector3(0, 0.01, 0.6), Vector3(2.2, 0.02, 1.5), Color(0.65, 0.25, 0.3))
		"painting":
			_deco(p + Vector3(0, 1.6, -0.55), Vector3(1.0, 0.7, 0.05), Color(0.3, 0.5, 0.75))
			_deco(p + Vector3(0, 1.6, -0.52), Vector3(0.8, 0.5, 0.02), Color(0.95, 0.75, 0.3))
		"piano":
			_deco(p + Vector3(0, 0.6, -0.1), Vector3(1.5, 1.2, 0.6), Color(0.08, 0.08, 0.08))
			_deco(p + Vector3(0, 0.78, 0.25), Vector3(1.3, 0.05, 0.25), Color(0.95, 0.95, 0.95))
			_add_it("piano", "Play the piano", p + Vector3(0, 0, 1.0))
		"hottub":
			_deco(p + Vector3(0, 0.4, 0.3), Vector3(2.0, 0.8, 2.0), Color(0.75, 0.65, 0.55))
			_deco(p + Vector3(0, 0.81, 0.3), Vector3(1.7, 0.02, 1.7), Color(0.3, 0.75, 0.9))
			_add_it("hottub", "Relax in the hot tub", p + Vector3(0, 0, 1.6))
		"bed":
			pass  # the double bed upgrades the fixed bed
		"tv":
			_deco(p + Vector3(0, 0.3, -0.1), Vector3(1.4, 0.6, 0.45), Color(0.3, 0.22, 0.15))
			_deco(p + Vector3(0, 1.05, -0.2), Vector3(1.4, 0.8, 0.06), Color(0.05, 0.05, 0.07))
			_add_it("tv", "Watch TV", p + Vector3(0, 0, 1.4))
		"console":
			_deco(p + Vector3(0, 0.3, 0), Vector3(0.9, 0.6, 0.45), Color(0.3, 0.22, 0.15))
			_deco(p + Vector3(0, 0.65, 0), Vector3(0.4, 0.1, 0.3), Color(0.1, 0.1, 0.12))
			_add_it("console", "Play video games", p + Vector3(0, 0, 1.2))
		_:
			_deco(p + Vector3(0, 0.4, 0), Vector3(0.8, 0.8, 0.8), Color(0.6, 0.6, 0.6))


func _solid(pos: Vector3, size: Vector3, c: Color) -> void:
	_deco(pos, size, c)
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = size
	cs.shape = sh
	cs.position = pos
	_body.add_child(cs)


func _deco(pos: Vector3, size: Vector3, c: Color, glassy: bool = false, glow: bool = false) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.position = pos
	if glow:
		var m := StandardMaterial3D.new()
		m.albedo_color = c
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = 1.5
		mi.material_override = m
	else:
		mi.material_override = CharacterModel.mat(c, 0.2 if glassy else 0.85)
	add_child(mi)
	return mi


func _add_it(kind: String, prompt: String, pos: Vector3, data: Dictionary = {}, radius: float = 1.1) -> void:
	var it := Interactable.make(kind, property_id, prompt, radius, 2.0)
	it.position = pos
	it.data = data
	add_child(it)
	interactables.append(it)


func _set_layers(n: Node) -> void:
	for c in n.get_children():
		if c is VisualInstance3D:
			(c as VisualInstance3D).layers = 1 << (LAYER - 1)
		_set_layers(c)
