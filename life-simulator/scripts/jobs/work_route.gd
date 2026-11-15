extends Node
## In-world job activity for Delivery Drivers and Police Officers:
## visit a series of drop-off / patrol points across the city against the clock.
## Faster completion = higher performance = better pay and promotions.

var world: Node
var active := false
var points: Array = []
var index := 0
var elapsed := 0.0
var par := 0.0
var job: Dictionary = {}
var marker: Node3D

const STOPS := ["supermarket", "cafe", "tech", "furniture", "city_hall", "bank", "hospital", "college",
	"gym", "hostel", "garage", "home_a", "home_d", "home_g", "office_tower", "business_centre", "clothing", "studio_2"]


func start(p_job: Dictionary) -> void:
	if active:
		return
	job = p_job
	active = true
	index = 0
	elapsed = 0.0
	points.clear()
	var pool := STOPS.duplicate()
	pool.shuffle()
	var count := 3 if job["id"] == "delivery_driver" else 4
	var total := 0.0
	var prev: Vector3 = world.player.global_position
	for i in count:
		var p := CityLayout.location_pos(pool[i])
		points.append(p)
		total += prev.distance_to(p)
		prev = p
	# Par time: generous walking pace, much easier with a vehicle.
	par = total / 7.0 + 20.0
	_make_marker()
	_place()
	var what := "deliveries" if job["id"] == "delivery_driver" else "patrol points"
	GameManager.toast("Shift started: %d %s. Follow the blue marker. Par time %ds." % [count, what, int(par)], "info")
	world.hud.show_race_info(true)


func _make_marker() -> void:
	if marker:
		marker.queue_free()
	marker = Node3D.new()
	var mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 1.6
	cyl.bottom_radius = 1.6
	cyl.height = 30.0
	mi.mesh = cyl
	mi.position.y = 15.0
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.2, 0.6, 1.0, 0.35)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.add_child(mi)
	world.add_child(marker)


func _place() -> void:
	marker.global_position = points[index]
	world.hud.set_waypoint(points[index])


func _process(delta: float) -> void:
	if not active:
		return
	elapsed += delta
	var pp: Vector3 = world.player.global_position
	if world.player.vehicle:
		pp = world.player.vehicle.global_position
	if Vector2(pp.x - points[index].x, pp.z - points[index].z).length() < 4.5:
		index += 1
		AudioManager.play_sfx("checkpoint")
		if index >= points.size():
			_finish()
			return
		_place()
	world.hud.set_race_text("%s: stop %d/%d  •  %ds (par %ds)" % [job["name"], index + 1, points.size(), int(elapsed), int(par)])
	if elapsed > par * 3.0:
		GameManager.toast("You took too long. Shift abandoned.", "bad")
		_cleanup()


func _finish() -> void:
	var perf := clampf(1.15 - (elapsed - par) / par * 0.6, 0.35, 1.0) if elapsed > par else 1.0
	_cleanup()
	world.finish_shift(perf)


func cancel() -> void:
	if active:
		GameManager.toast("Shift cancelled.", "warn")
		_cleanup()


func _cleanup() -> void:
	active = false
	if marker:
		marker.queue_free()
		marker = null
	world.hud.show_race_info(false)
	world.hud.set_waypoint(Vector3.INF)
