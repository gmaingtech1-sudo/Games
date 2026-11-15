extends Node3D
## Builds the 3D city from CityLayout: ground, roads, pavements, buildings,
## parks, props, signs, lamps, collisions and interaction points.
## Repeated geometry is batched with MultiMeshInstance3D so the whole city
## needs only a few dozen draw calls (important for mid-range Android GPUs).

const PALETTE := [
	Color(0.9, 0.86, 0.78), Color(0.7, 0.74, 0.8), Color(0.84, 0.66, 0.52), Color(0.74, 0.5, 0.42),
	Color(0.9, 0.8, 0.6), Color(0.72, 0.8, 0.72), Color(0.86, 0.72, 0.74), Color(0.58, 0.6, 0.64),
]

var rng := RandomNumberGenerator.new()
var building_mats: Array[ShaderMaterial] = []
var lamp_mat: StandardMaterial3D
var night_mats: Array[ShaderMaterial] = []
var interactables: Array = []
var _batches := {}        # key -> {mesh, material, transforms: Array[Transform3D], colors}
var _static_body: StaticBody3D
var collectible_nodes := {}


func build() -> void:
	rng.seed = 20261114
	_static_body = StaticBody3D.new()
	_static_body.name = "CityCollision"
	_static_body.collision_layer = 1
	add_child(_static_body)
	_make_materials()
	_ground()
	_roads()
	for bz in CityLayout.N:
		for bx in CityLayout.N:
			_block(Vector2i(bx, bz))
	_landmarks()
	_street_props()
	_boundary()
	_flush_batches()
	_collectibles()


# ------------------------------------------------------------------ materials

func _facade_texture() -> ImageTexture:
	# 4x4 facade tiles (each about 3.5 m): wall + window. Alpha marks windows
	# that light up at night (read by facade.gdshader).
	var size := 64
	var img := Image.create(size * 4, size * 4, false, Image.FORMAT_RGBA8)
	var r := RandomNumberGenerator.new()
	r.seed = 7
	for ty in 4:
		for tx in 4:
			var lit := 1.0 if r.randf() < 0.45 else 0.0
			for y in size:
				for x in size:
					var win := x >= 12 and x < 52 and y >= 12 and y < 46
					var frame := (x >= 10 and x < 54 and y >= 10 and y < 48) and not win
					var c := Color(0.93, 0.92, 0.9, 0.0)
					if win:
						var g := 0.28 + 0.12 * float(y - 12) / 34.0
						c = Color(g * 0.85, g * 0.95, g * 1.1, lit)
					elif frame:
						c = Color(0.62, 0.62, 0.64, 0.0)
					elif y >= 52:
						c = Color(0.82, 0.81, 0.8, 0.0)
					img.set_pixel(tx * size + x, ty * size + y, c)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _noise_texture(base: Color, var_amt: float, size: int = 64, seed_v: int = 1) -> ImageTexture:
	var img := Image.create(size, size, false, Image.FORMAT_RGB8)
	var r := RandomNumberGenerator.new()
	r.seed = seed_v
	for y in size:
		for x in size:
			var v := r.randf_range(-var_amt, var_amt)
			img.set_pixel(x, y, Color(clampf(base.r + v, 0, 1), clampf(base.g + v, 0, 1), clampf(base.b + v, 0, 1)))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _road_texture() -> ImageTexture:
	var w := 128
	var h := 64
	var img := Image.create(w, h, false, Image.FORMAT_RGB8)
	var r := RandomNumberGenerator.new()
	r.seed = 3
	for y in h:
		for x in w:
			var v := r.randf_range(-0.03, 0.03)
			var c := Color(0.22 + v, 0.22 + v, 0.24 + v)
			# Centre dashed line and edge lines.
			if y >= 31 and y <= 32 and x < 64:
				c = Color(0.95, 0.85, 0.35)
			if y <= 2 or y >= 61:
				c = Color(0.85, 0.85, 0.85)
			img.set_pixel(x, y, c)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


const FACADE_SHADER := preload("res://assets/buildings/facade.gdshader")


func _make_materials() -> void:
	var tex := _facade_texture()
	for c in PALETTE:
		var m := ShaderMaterial.new()
		m.shader = FACADE_SHADER
		m.set_shader_parameter("facade", tex)
		m.set_shader_parameter("tint", c)
		m.set_shader_parameter("night", 0.0)
		building_mats.append(m)
		night_mats.append(m)
	lamp_mat = StandardMaterial3D.new()
	lamp_mat.albedo_color = Color(1, 0.95, 0.8)
	lamp_mat.emission_enabled = true
	lamp_mat.emission = Color(1.0, 0.85, 0.55)
	lamp_mat.emission_energy_multiplier = 0.0


func set_night_amount(night: float) -> void:
	for m in night_mats:
		m.set_shader_parameter("night", night)
	lamp_mat.emission_energy_multiplier = night * 4.0


func plain(color: Color, rough: float = 0.9) -> StandardMaterial3D:
	return CharacterModel.mat(color, rough)


# ------------------------------------------------------------------ batching helpers

func _batch(key: String, mesh: Mesh, material: Material, xf: Transform3D) -> void:
	if not _batches.has(key):
		_batches[key] = {"mesh": mesh, "material": material, "xfs": []}
	_batches[key]["xfs"].append(xf)


func _flush_batches() -> void:
	for key in _batches:
		var b: Dictionary = _batches[key]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = b["mesh"]
		mm.instance_count = b["xfs"].size()
		for i in b["xfs"].size():
			mm.set_instance_transform(i, b["xfs"][i])
		var mmi := MultiMeshInstance3D.new()
		mmi.name = "Batch_" + key
		mmi.multimesh = mm
		mmi.material_override = b["material"]
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if not key.begins_with("flat") else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mmi)
	_batches.clear()


var _unit_box: BoxMesh


func _box(key: String, material: Material, center: Vector3, size: Vector3, rot_y: float = 0.0, collide: bool = true) -> void:
	if _unit_box == null:
		_unit_box = BoxMesh.new()
	var basis := Basis(Vector3.UP, rot_y).scaled(size)
	_batch(key, _unit_box, material, Transform3D(basis, center))
	if collide:
		_collider(center, size, rot_y)


func _collider(center: Vector3, size: Vector3, rot_y: float = 0.0) -> void:
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = size
	cs.shape = sh
	cs.transform = Transform3D(Basis(Vector3.UP, rot_y), center)
	_static_body.add_child(cs)


# ------------------------------------------------------------------ ground & roads

func _ground() -> void:
	var ground := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(900, 900)
	ground.mesh = pm
	var gm := StandardMaterial3D.new()
	gm.albedo_texture = _noise_texture(Color(0.33, 0.52, 0.25), 0.05, 64, 11)
	gm.uv1_scale = Vector3(150, 150, 1)
	gm.roughness = 1.0
	ground.material_override = gm
	ground.name = "Ground"
	add_child(ground)
	var cs := CollisionShape3D.new()
	var sh := WorldBoundaryShape3D.new()
	cs.shape = sh
	_static_body.add_child(cs)
	# Pavement under every non-park block.
	var pave := StandardMaterial3D.new()
	pave.albedo_texture = _noise_texture(Color(0.52, 0.51, 0.49), 0.04, 64, 5)
	pave.uv1_triplanar = true
	pave.uv1_world_triplanar = true
	pave.uv1_scale = Vector3(0.5, 0.5, 0.5)
	for bz in CityLayout.N:
		for bx in CityLayout.N:
			var b := Vector2i(bx, bz)
			var c := CityLayout.block_center(b)
			if CityLayout.OPEN_BLOCKS.get(b, "") == "park":
				continue
			_box("flat_pave", pave, c + Vector3(0, 0.02, 0), Vector3(CityLayout.BLOCK, 0.04, CityLayout.BLOCK), 0.0, false)


func _roads() -> void:
	var rm := StandardMaterial3D.new()
	rm.albedo_texture = _road_texture()
	rm.roughness = 0.75
	var length := CityLayout.HALF * 2.0 + CityLayout.ROAD
	for i in CityLayout.N + 1:
		var line := CityLayout.road_line(i)
		for axis in 2:
			var mi := MeshInstance3D.new()
			var pm := PlaneMesh.new()
			pm.size = Vector2(length, CityLayout.ROAD)
			mi.mesh = pm
			var m: StandardMaterial3D = rm.duplicate()
			m.uv1_scale = Vector3(length / 8.0, 1, 1)
			mi.material_override = m
			if axis == 0:
				mi.position = Vector3(0, 0.03 + i * 0.0005, line)
			else:
				mi.position = Vector3(line, 0.035 + i * 0.0005, 0)
				mi.rotation.y = PI / 2
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mi)
	# Plain asphalt squares over intersections so the dashes don't cross.
	var inter := plain(Color(0.22, 0.22, 0.24), 0.8)
	for ix in CityLayout.N + 1:
		for iz in CityLayout.N + 1:
			_box("flat_inter", inter, Vector3(CityLayout.road_line(ix), 0.045, CityLayout.road_line(iz)), Vector3(CityLayout.ROAD, 0.01, CityLayout.ROAD), 0.0, false)
	# Zebra crossings near the city centre.
	var zebra := plain(Color(0.95, 0.95, 0.95))
	for ix in [2, 3, 4]:
		for iz in [1, 2, 3]:
			var p := Vector3(CityLayout.road_line(ix), 0.05, CityLayout.road_line(iz))
			for k in 5:
				_box("flat_zebra", zebra, p + Vector3(-3.6 + k * 1.8, 0, 6.5), Vector3(0.9, 0.01, 2.5), 0.0, false)


# ------------------------------------------------------------------ blocks

func _block(b: Vector2i) -> void:
	var open: String = CityLayout.OPEN_BLOCKS.get(b, "")
	var district := CityLayout.district_of_block(b)
	if open == "park":
		_park_block(b)
		return
	if open == "plaza":
		_plaza(b)
		return
	if open == "events":
		_events_plaza(b)
		return
	# Which lots are taken by named locations?
	var taken := {}
	for id in CityLayout.LOCATIONS:
		var l: Dictionary = CityLayout.LOCATIONS[id]
		if l["block"] == b and not l.has("pos"):
			if int(l["lot"]) < 0:
				taken = {0: id, 1: id, 2: id, 3: id}
			else:
				taken[int(l["lot"])] = id
	if open == "mansion":
		return  # built in _landmarks
	for lot in 4:
		if taken.has(lot):
			continue
		_generic_building(b, lot, district)


func _generic_building(b: Vector2i, lot: int, district: String) -> void:
	var c := CityLayout.lot_center(b, lot)
	var col := rng.randi_range(0, PALETTE.size() - 1)
	match district:
		"business":
			var h := rng.randf_range(30, 70)
			_tower(c, Vector3(rng.randf_range(13, 17), h, rng.randf_range(13, 17)), col)
		"centre":
			_tower(c, Vector3(16, rng.randf_range(14, 30), 16), col)
		"shopping":
			_shop_front(c, lot, rng.randf_range(7, 12), col, "")
		"industrial":
			_warehouse(c, rng.randf_range(7, 11), col)
		"residential":
			if rng.randf() < 0.75:
				_house(c, lot, rng.randf_range(5.5, 7.5), col)
			else:
				_tower(c, Vector3(14, rng.randf_range(12, 18), 14), col)
		"midtown":
			if rng.randf() < 0.5:
				_tower(c, Vector3(15, rng.randf_range(12, 24), 15), col)
			else:
				_house(c, lot, 7.0, col)
		_:
			_tower(c, Vector3(14, 12, 14), col)


func _tower(c: Vector3, size: Vector3, col: int) -> void:
	_box("bld_%d" % col, building_mats[col], c + Vector3(0, size.y * 0.5, 0), size)
	# Roof cap + rooftop unit
	_box("flat_roof", plain(Color(0.35, 0.36, 0.4)), c + Vector3(0, size.y + 0.15, 0), Vector3(size.x + 0.4, 0.3, size.z + 0.4), 0.0, false)
	if size.y > 20:
		_box("roofunit", plain(Color(0.55, 0.56, 0.6)), c + Vector3(rng.randf_range(-3, 3), size.y + 1.3, rng.randf_range(-3, 3)), Vector3(3, 2, 3), 0.0, false)


func _shop_front(c: Vector3, lot: int, h: float, col: int, _sign: String) -> void:
	var size := Vector3(16, h, 16)
	_box("bld_%d" % col, building_mats[col], c + Vector3(0, h * 0.5, 0), size)
	_box("flat_roof", plain(Color(0.35, 0.36, 0.4)), c + Vector3(0, h + 0.15, 0), Vector3(16.4, 0.3, 16.4), 0.0, false)
	var d := CityLayout.door_dir(lot)
	# Awning
	var aw_col: Color = [Color(0.8, 0.25, 0.25), Color(0.2, 0.5, 0.8), Color(0.2, 0.65, 0.4), Color(0.9, 0.6, 0.2)][col % 4]
	_box("awning_%d" % (col % 4), plain(aw_col), c + d * 8.9 + Vector3(0, 3.3, 0), Vector3(12, 0.25, 1.8), 0.0, false)
	# Shop window
	_box("glass", plain(Color(0.35, 0.5, 0.6), 0.15), c + d * 8.05 + Vector3(0, 1.6, 0), Vector3(12, 2.6, 0.2), 0.0, false)


func _warehouse(c: Vector3, h: float, col: int) -> void:
	_box("bld_ind_%d" % (col % 3), plain([Color(0.62, 0.6, 0.55), Color(0.55, 0.6, 0.62), Color(0.7, 0.65, 0.55)][col % 3]), c + Vector3(0, h * 0.5, 0), Vector3(17, h, 17))
	_box("flat_roof", plain(Color(0.35, 0.36, 0.4)), c + Vector3(0, h + 0.15, 0), Vector3(17.4, 0.3, 17.4), 0.0, false)
	if rng.randf() < 0.4:
		var chim := CylinderMesh.new()
		chim.top_radius = 0.8
		chim.bottom_radius = 1.0
		chim.height = 12
		_batch("chimney", chim, plain(Color(0.5, 0.35, 0.3)), Transform3D(Basis(), c + Vector3(5, h + 6, 5)))


var _prism: PrismMesh


func _house(c: Vector3, lot: int, h: float, col: int) -> void:
	if _prism == null:
		_prism = PrismMesh.new()
	var w := 11.0
	var dpt := 10.0
	_box("bld_%d" % col, building_mats[col], c + Vector3(0, h * 0.5, 0), Vector3(w, h, dpt))
	var roof_col: Color = [Color(0.55, 0.22, 0.18), Color(0.3, 0.3, 0.35), Color(0.45, 0.3, 0.22)][col % 3]
	_batch("roof_%d" % (col % 3), _prism, plain(roof_col), Transform3D(Basis(Vector3.UP, 0).scaled(Vector3(w + 0.8, 3.2, dpt + 0.8)), c + Vector3(0, h + 1.6, 0)))
	var d := CityLayout.door_dir(lot)
	_box("door", plain(Color(0.4, 0.25, 0.15)), c + d * (dpt * 0.5 + 0.05) + Vector3(0, 1.1, 0), Vector3(1.4, 2.2, 0.15), 0.0, false)
	# Front garden hedge
	_box("hedge", plain(Color(0.2, 0.42, 0.18)), c + d * 7.5 + Vector3(-3.5, 0.5, 0), Vector3(4, 1.0, 0.8))
	_box("hedge", plain(Color(0.2, 0.42, 0.18)), c + d * 7.5 + Vector3(3.5, 0.5, 0), Vector3(4, 1.0, 0.8))


func _park_block(b: Vector2i) -> void:
	var c := CityLayout.block_center(b)
	# Paths
	var path := plain(Color(0.78, 0.7, 0.55))
	_box("flat_path", path, c + Vector3(0, 0.03, 0), Vector3(40, 0.03, 3.5), 0.0, false)
	_box("flat_path", path, c + Vector3(0, 0.03, 0), Vector3(3.5, 0.03, 40), 0.0, false)
	# Trees
	for i in 14:
		var p := c + Vector3(rng.randf_range(-18, 18), 0, rng.randf_range(-18, 18))
		if absf(p.x - c.x) < 3.5 or absf(p.z - c.z) < 3.5:
			continue
		_tree(p, rng.randf_range(0.9, 1.4))
	# Benches (sit / sleep)
	for off in [Vector3(-8, 0, 3), Vector3(8, 0, -3), Vector3(3, 0, 9), Vector3(-3, 0, -9)]:
		_bench(c + off, 0.0 if absf(off.z) < 5 else PI / 2)
	# Pond on the west park block
	if b.x == 2:
		var pond := CylinderMesh.new()
		pond.top_radius = 6
		pond.bottom_radius = 6
		pond.height = 0.1
		var water := StandardMaterial3D.new()
		water.albedo_color = Color(0.25, 0.5, 0.7)
		water.roughness = 0.05
		water.metallic = 0.3
		_batch("flat_pond", pond, water, Transform3D(Basis(), c + Vector3(-9, 0.04, 9)))


func _tree(p: Vector3, s: float) -> void:
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.18
	trunk.bottom_radius = 0.25
	trunk.height = 3.0
	trunk.radial_segments = 6
	var crown := SphereMesh.new()
	crown.radius = 1.8
	crown.height = 3.4
	crown.radial_segments = 10
	crown.rings = 6
	_batch("trunk", _cache_mesh("trunk", trunk), plain(Color(0.4, 0.28, 0.18)), Transform3D(Basis().scaled(Vector3(s, s, s)), p + Vector3(0, 1.5 * s, 0)))
	var shade := 0.85 + rng.randf() * 0.3
	_batch("crown", _cache_mesh("crown", crown), plain(Color(0.25 * shade, 0.5 * shade, 0.2 * shade)), Transform3D(Basis().scaled(Vector3(s, s, s)), p + Vector3(0, 4.0 * s, 0)))
	_collider(p + Vector3(0, 1.5, 0), Vector3(0.5, 3, 0.5))


var _mesh_cache := {}


func _cache_mesh(key: String, m: Mesh) -> Mesh:
	if not _mesh_cache.has(key):
		_mesh_cache[key] = m
	return _mesh_cache[key]


func _bench(p: Vector3, rot: float) -> void:
	var wood := plain(Color(0.55, 0.38, 0.22))
	var basis := Basis(Vector3.UP, rot)
	_box("bench_seat", wood, p + Vector3(0, 0.45, 0), Vector3(2.0, 0.12, 0.6), rot, false)
	_box("bench_seat", wood, p + basis * Vector3(0, 0.85, -0.28), Vector3(2.0, 0.5, 0.08), rot, false)
	_collider(p + Vector3(0, 0.4, 0), Vector3(2.0, 0.8, 0.6), rot)
	var it := Interactable.make("bench", "", "Sit on bench", 1.8)
	it.position = p + basis * Vector3(0, 0, 0.9)
	it.data = {"seat": p + Vector3(0, 0.0, 0), "rot": rot}
	add_child(it)
	interactables.append(it)


func _plaza(b: Vector2i) -> void:
	var c := CityLayout.block_center(b)
	var stone := plain(Color(0.6, 0.58, 0.54))
	_box("flat_plaza", stone, c + Vector3(0, 0.05, 0), Vector3(38, 0.05, 38), 0.0, false)
	# Statue on a plinth
	_box("plinth", plain(Color(0.6, 0.6, 0.62)), c + Vector3(0, 1.0, 0), Vector3(3, 2, 3))
	var fig := CapsuleMesh.new()
	fig.radius = 0.6
	fig.height = 3.2
	_batch("statue", fig, CharacterModel.mat(Color(0.55, 0.42, 0.28), 0.45, 0.5), Transform3D(Basis(), c + Vector3(0, 3.6, 0)))
	for k in 4:
		var ang := k * PI / 2.0
		_bench(c + Vector3(cos(ang) * 9, 0, sin(ang) * 9), ang + PI / 2)
		_tree(c + Vector3(cos(ang + PI / 4) * 14, 0, sin(ang + PI / 4) * 14), 1.0)


func _events_plaza(b: Vector2i) -> void:
	var c := CityLayout.block_center(b)
	_box("flat_events", plain(Color(0.3, 0.3, 0.33)), c + Vector3(0, 0.05, 0), Vector3(38, 0.05, 38), 0.0, false)
	# Grandstand
	for k in 4:
		_box("stand", plain(Color(0.7, 0.2, 0.2) if k % 2 == 0 else Color(0.85, 0.85, 0.85)), c + Vector3(-4 + k * 0.0, 0.6 + k * 0.8, 10 + k * 1.4), Vector3(26, 1.2 + k * 0.0, 1.4))
	# Start/finish gantry over the east road
	var gx := CityLayout.road_line(6)
	_box("gantry", plain(Color(0.15, 0.15, 0.15)), Vector3(gx - 6, 3, -112), Vector3(0.4, 6, 0.4))
	_box("gantry", plain(Color(0.15, 0.15, 0.15)), Vector3(gx + 6, 3, -112), Vector3(0.4, 6, 0.4))
	_box("gantry_top", plain(Color(0.9, 0.9, 0.9)), Vector3(gx, 6, -112), Vector3(12.4, 1.2, 0.4), 0.0, false)
	# Chequered start line
	for k in 10:
		_box("flat_check_%d" % (k % 2), plain(Color.WHITE if k % 2 == 0 else Color.BLACK), Vector3(gx - 4.5 + k, 0.06, -112), Vector3(1, 0.01, 1), 0.0, false)


# ------------------------------------------------------------------ named locations

func _landmarks() -> void:
	for id in CityLayout.LOCATIONS:
		var l: Dictionary = CityLayout.LOCATIONS[id]
		if l.has("pos"):
			continue
		var b: Vector2i = l["block"]
		var lot: int = l["lot"]
		var c := CityLayout.lot_center(b, lot)
		var h: float = float(l["h"])
		var col: int = int(l["color"])
		var style: String = l.get("style", "")
		var district := CityLayout.district_of_block(b)
		match id:
			"mansion_1":
				_mansion(c)
			"events":
				pass
			"fuel_station":
				_fuel_station(c)
			"dealership":
				_dealership(b, c)
			"hospital":
				_box("bld_0", building_mats[0], c + Vector3(5, h * 0.5, 5), Vector3(18, h, 26))
				_box("flat_roof", plain(Color(0.35, 0.36, 0.4)), c + Vector3(5, h + 0.15, 5), Vector3(18.4, 0.3, 26.4), 0.0, false)
				_box("redcross", plain(Color(0.85, 0.15, 0.15)), c + Vector3(5, h - 3, -8.1), Vector3(4, 1, 0.2), 0.0, false)
				_box("redcross", plain(Color(0.85, 0.15, 0.15)), c + Vector3(5, h - 3, -8.1), Vector3(1, 4, 0.2), 0.0, false)
			_:
				match style:
					"house":
						_house(c, lot, h, col)
					"luxury":
						_luxury_house(c, lot)
					"apartment":
						_tower(c, Vector3(15, h, 15), col)
					_:
						if district == "shopping":
							_shop_front(c, lot, h, col, l["name"])
						elif district == "industrial":
							_warehouse(c, h, col)
						else:
							_tower(c, Vector3(16, h, 16), col)
		if l["features"].is_empty():
			continue
		var door := CityLayout.location_pos(id)
		# Door marker + interaction point + sign
		var it := Interactable.make("location", id, "Enter " + str(l["name"]), 2.4)
		it.position = door
		add_child(it)
		interactables.append(it)
		_marker(door)
		if h > 0 or lot < 0:
			_sign(l["name"], door + Vector3(0, minf(maxf(h, 4.0) - 1.2, 6.0) if h > 0 else 4.5, 0) - CityLayout.door_dir(maxi(lot, 0)) * 0.3, CityLayout.door_dir(maxi(lot, 0)))


func _marker(p: Vector3) -> void:
	var ring := TorusMesh.new()
	ring.inner_radius = 0.9
	ring.outer_radius = 1.1
	ring.rings = 16
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.2, 0.9, 0.8, 0.8)
	m.emission_enabled = true
	m.emission = Color(0.2, 0.9, 0.8)
	m.emission_energy_multiplier = 1.0
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_batch("flat_marker", _cache_mesh("ring", ring), m, Transform3D(Basis().scaled(Vector3(1, 0.4, 1)), p + Vector3(0, 0.08, 0)))


func _sign(text: String, pos: Vector3, facing: Vector3) -> void:
	var l := Label3D.new()
	l.text = text
	l.font_size = 64
	l.pixel_size = 0.012
	l.outline_size = 12
	l.modulate = Color(1, 1, 1)
	l.outline_modulate = Color(0.05, 0.08, 0.15)
	l.transform = Transform3D(Basis.looking_at(-facing, Vector3.UP), pos)
	l.double_sided = false
	l.visibility_range_end = 120.0
	add_child(l)


func _mansion(c: Vector3) -> void:
	var m := building_mats[0]
	_box("bld_0", m, c + Vector3(0, 6, 4), Vector3(26, 12, 14))
	_box("bld_0", m, c + Vector3(-11, 4.5, -3), Vector3(6, 9, 10))
	_box("bld_0", m, c + Vector3(11, 4.5, -3), Vector3(6, 9, 10))
	if _prism == null:
		_prism = PrismMesh.new()
	_batch("roof_1", _prism, plain(Color(0.3, 0.3, 0.35)), Transform3D(Basis().scaled(Vector3(27, 4, 15)), c + Vector3(0, 14, 4)))
	for k in 4:
		var col := CylinderMesh.new()
		col.top_radius = 0.35
		col.bottom_radius = 0.35
		col.height = 8
		_batch("column", _cache_mesh("column", col), plain(Color(0.95, 0.95, 0.92)), Transform3D(Basis(), c + Vector3(-4.5 + k * 3, 4, -3.6)))
	var pool := BoxMesh.new()
	var water := StandardMaterial3D.new()
	water.albedo_color = Color(0.3, 0.7, 0.9)
	water.roughness = 0.05
	_batch("flat_pool", pool, water, Transform3D(Basis().scaled(Vector3(10, 0.1, 5)), c + Vector3(0, 0.06, -12)))
	for k in 6:
		_tree(c + Vector3(-17 + k * 7, 0, -18), 0.9)


func _luxury_house(c: Vector3, lot: int) -> void:
	var glass := plain(Color(0.45, 0.65, 0.75), 0.1)
	_box("bld_7", building_mats[7], c + Vector3(0, 2.5, 0), Vector3(14, 5, 12))
	_box("lux_glass", glass, c + Vector3(-1, 7, 1), Vector3(11, 4, 9))
	_box("flat_roof", plain(Color(0.9, 0.9, 0.9)), c + Vector3(-1, 9.15, 1), Vector3(12, 0.3, 10), 0.0, false)
	var d := CityLayout.door_dir(lot)
	_box("door", plain(Color(0.2, 0.2, 0.2)), c + d * 6.05 + Vector3(0, 1.2, 0), Vector3(1.8, 2.4, 0.15), 0.0, false)


func _fuel_station(c: Vector3) -> void:
	_box("canopy", plain(Color(0.9, 0.9, 0.9)), c + Vector3(0, 5, 0), Vector3(14, 0.6, 10), 0.0, false)
	_box("canopy_trim", plain(Color(0.85, 0.2, 0.2)), c + Vector3(0, 5.5, 0), Vector3(14.2, 0.4, 10.2), 0.0, false)
	for x in [-4.0, 4.0]:
		_box("pillar", plain(Color(0.85, 0.85, 0.85)), c + Vector3(x, 2.4, 0), Vector3(0.5, 4.8, 0.5))
		_box("pump", plain(Color(0.2, 0.5, 0.8)), c + Vector3(x, 0.8, 2), Vector3(0.9, 1.6, 0.6))
	_box("bld_2", building_mats[2], c + Vector3(0, 2, 8), Vector3(10, 4, 4))


func _dealership(b: Vector2i, c: Vector3) -> void:
	var glass := plain(Color(0.45, 0.65, 0.75), 0.1)
	_box("bld_7", building_mats[7], c + Vector3(0, 4.5, 0), Vector3(16, 9, 16))
	_box("lux_glass", glass, c + Vector3(0, 2.5, -8.1), Vector3(14, 4.5, 0.3), 0.0, false)
	# Forecourt for the rest of the block
	var bc := CityLayout.block_center(b)
	_box("flat_forecourt", plain(Color(0.4, 0.4, 0.43)), bc + Vector3(5, 0.05, 5), Vector3(28, 0.04, 28), 0.0, false)
	for k in 6:
		_box("flat_bayline", plain(Color(0.95, 0.95, 0.95)), bc + Vector3(-2 + k * 4, 0.07, 12), Vector3(0.15, 0.01, 5), 0.0, false)


# ------------------------------------------------------------------ props

func _street_props() -> void:
	var pole_mesh := CylinderMesh.new()
	pole_mesh.top_radius = 0.08
	pole_mesh.bottom_radius = 0.12
	pole_mesh.height = 6
	pole_mesh.radial_segments = 6
	var head := SphereMesh.new()
	head.radius = 0.35
	head.height = 0.5
	head.radial_segments = 8
	head.rings = 4
	var pole_mat := plain(Color(0.2, 0.22, 0.25), 0.5)
	# Lamps along every road, on block corners.
	for bz in CityLayout.N:
		for bx in CityLayout.N:
			var c := CityLayout.block_center(Vector2i(bx, bz))
			for corner in [Vector3(-18.5, 0, -18.5), Vector3(18.5, 0, -18.5), Vector3(-18.5, 0, 18.5), Vector3(18.5, 0, 18.5), Vector3(0, 0, -18.5), Vector3(0, 0, 18.5)]:
				var p: Vector3 = c + corner
				_batch("lamp_pole", pole_mesh, pole_mat, Transform3D(Basis(), p + Vector3(0, 3, 0)))
				_batch("lamp_head", head, lamp_mat, Transform3D(Basis(), p + Vector3(0, 6.1, 0)))
				_collider(p + Vector3(0, 3, 0), Vector3(0.3, 6, 0.3))
			# Street trees on residential / midtown pavements
			var d := CityLayout.district_of_block(Vector2i(bx, bz))
			if d in ["residential", "midtown", "centre"] and not CityLayout.OPEN_BLOCKS.has(Vector2i(bx, bz)):
				for off in [Vector3(-9, 0, -18.6), Vector3(9, 0, 18.6)]:
					_tree(c + off, 0.75)
	# ATMs
	for p in [CityLayout.location_pos("bank") + Vector3(4, 0, 0), CityLayout.location_pos("supermarket") + Vector3(-4, 0, 0), CityLayout.location_pos("city_hall") + Vector3(4, 0, 0), CityLayout.location_pos("fuel_station") + Vector3(4, 0, 0)]:
		_box("atm", plain(Color(0.15, 0.45, 0.35)), p + Vector3(0, 0.9, 0.4), Vector3(0.8, 1.8, 0.5))
		var it := Interactable.make("atm", "", "Use ATM", 1.6)
		it.position = p
		add_child(it)
		interactables.append(it)
	# Bus shelters (more places to sit)
	for p in [Vector3(-60, 0, -82), Vector3(40, 0, 18), Vector3(-108, 0, 68)]:
		_box("shelter", plain(Color(0.3, 0.5, 0.75), 0.3), p + Vector3(0, 2.6, 0), Vector3(4, 0.15, 1.6), 0.0, false)
		_box("shelter_back", plain(Color(0.6, 0.75, 0.85), 0.1), p + Vector3(0, 1.3, -0.75), Vector3(4, 2.6, 0.08))
		_bench(p, 0.0)


func _boundary() -> void:
	# Keep everyone inside the world: invisible walls plus a ring of trees.
	var lim := 175.0
	for s in [Vector3(lim, 5, 0), Vector3(-lim, 5, 0)]:
		_collider(s, Vector3(2, 10, lim * 2))
	for s in [Vector3(0, 5, lim), Vector3(0, 5, -lim)]:
		_collider(s, Vector3(lim * 2, 10, 2))
	for i in 70:
		var ang := float(i) / 70.0 * TAU
		var r := 168.0 + rng.randf_range(-3, 6)
		_tree(Vector3(cos(ang) * r, 0, sin(ang) * r).clamp(Vector3(-172, 0, -172), Vector3(172, 0, 172)), rng.randf_range(1.0, 1.6))


func _collectibles() -> void:
	for id in CityLayout.COLLECTIBLES:
		var p: Vector3 = CityLayout.COLLECTIBLES[id]
		var node := Node3D.new()
		node.position = p
		var mi := MeshInstance3D.new()
		var gem := PrismMesh.new()
		gem.size = Vector3(0.4, 0.5, 0.4)
		mi.mesh = gem
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(1, 0.85, 0.2)
		m.emission_enabled = true
		m.emission = Color(1, 0.8, 0.2)
		m.emission_energy_multiplier = 1.2
		mi.material_override = m
		node.add_child(mi)
		var it := Interactable.make("collectible", id, "Pick up", 1.4)
		node.add_child(it)
		interactables.append(it)
		add_child(node)
		collectible_nodes[id] = node


func hide_collected(claimed: Array) -> void:
	for id in collectible_nodes:
		var vis: bool = not (("spot:" + id) in claimed)
		collectible_nodes[id].visible = vis
		for c in collectible_nodes[id].get_children():
			if c is Interactable:
				c.monitorable = vis


func _process(delta: float) -> void:
	for id in collectible_nodes:
		var n: Node3D = collectible_nodes[id]
		if n.visible:
			n.rotation.y += delta * 2.0
