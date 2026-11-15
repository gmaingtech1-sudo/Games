class_name Minimap
extends Control
## North-up minimap drawn with 2D primitives (much cheaper than a second 3D
## camera on mobile). Shows districts, roads, key places, the player, other
## online players and the current waypoint. Also used full-size by the Map app.

const KEY_PLACES := {
	"supermarket": ["F", Color(0.95, 0.55, 0.2)], "city_hall": ["J", Color(0.3, 0.6, 1.0)], "bank": ["£", Color(0.2, 0.75, 0.45)],
	"estate_agent": ["H", Color(0.85, 0.4, 0.75)], "hospital": ["+", Color(0.9, 0.2, 0.2)], "police_station": ["P", Color(0.2, 0.35, 0.8)],
	"dealership": ["C", Color(0.9, 0.8, 0.2)], "garage": ["G", Color(0.6, 0.6, 0.65)], "college": ["U", Color(0.6, 0.4, 0.85)],
	"clothing": ["W", Color(0.75, 0.35, 0.9)], "tech": ["E", Color(0.35, 0.5, 0.65)], "furniture": ["Fu", Color(0.65, 0.45, 0.25)],
	"restaurant": ["R", Color(0.95, 0.4, 0.3)], "cafe": ["Ca", Color(0.75, 0.5, 0.3)], "gym": ["Gy", Color(0.2, 0.7, 0.7)],
	"business_centre": ["B", Color(0.4, 0.45, 0.9)], "events": ["!", Color(1.0, 0.3, 0.3)], "depot": ["D", Color(0.7, 0.55, 0.3)],
	"office_tower": ["O", Color(0.45, 0.55, 0.75)], "fuel_station": ["Fl", Color(0.85, 0.25, 0.25)], "hostel": ["Ho", Color(0.5, 0.6, 0.4)],
}

var world: Node
var scale_px := 0.85       # pixels per metre
var full_map := false
var waypoint := Vector3.INF
var _font: Font


func _ready() -> void:
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_PASS
	_font = get_theme_default_font()


func _process(_d: float) -> void:
	if is_visible_in_tree():
		queue_redraw()


func _center_world() -> Vector3:
	if full_map:
		return Vector3.ZERO
	if world and world.player:
		var p: Vector3 = world.player.global_position
		if world.is_in_interior():
			p = world.interior_return_pos()
		return p
	return Vector3.ZERO


func w2m(p: Vector3) -> Vector2:
	var c := _center_world()
	return size * 0.5 + Vector2(p.x - c.x, p.z - c.z) * scale_px


func _draw() -> void:
	if full_map:
		scale_px = minf(size.x, size.y) / 340.0
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.2, 0.32, 0.18, 0.92))
	# Blocks
	for bz in CityLayout.N:
		for bx in CityLayout.N:
			var b := Vector2i(bx, bz)
			var c := CityLayout.block_center(b)
			var d := CityLayout.district_of_block(b)
			var col: Color = CityLayout.DISTRICTS[d]["color"]
			var tl := w2m(c - Vector3(20, 0, 20))
			draw_rect(Rect2(tl, Vector2(40, 40) * scale_px), col.darkened(0.25))
	# Roads
	for i in CityLayout.N + 1:
		var line := CityLayout.road_line(i)
		draw_line(w2m(Vector3(-155, 0, line)), w2m(Vector3(155, 0, line)), Color(0.15, 0.15, 0.17), 10.0 * scale_px)
		draw_line(w2m(Vector3(line, 0, -155)), w2m(Vector3(line, 0, 155)), Color(0.15, 0.15, 0.17), 10.0 * scale_px)
	# Places
	var fs := 13 if not full_map else 15
	for id in KEY_PLACES:
		var p := w2m(CityLayout.location_pos(id))
		var info: Array = KEY_PLACES[id]
		draw_circle(p, 8.5 if not full_map else 11.0, info[1])
		var w := _font.get_string_size(info[0], HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(_font, p + Vector2(-w * 0.5, fs * 0.36), info[0], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)
		if full_map:
			draw_string(_font, p + Vector2(13, 5), CityLayout.location_name(id), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 1, 1, 0.85))
	# Homes the player has
	if not GameManager.state.is_empty():
		for rec in GameManager.state["properties"]:
			var hp := w2m(CityLayout.location_pos(rec["id"]))
			draw_circle(hp, 10, Color(0.1, 0.8, 0.4))
			draw_string(_font, hp + Vector2(-5, 5), "H", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)
	# Online players
	if world and MultiplayerManager.is_online():
		for pid in world.remote_players:
			var rp = world.remote_players[pid]
			draw_circle(w2m(rp.global_position), 6, Color(0.4, 1.0, 0.95))
	# Owned vehicles
	if world:
		for uid in world.vehicles:
			var v = world.vehicles[uid]
			if is_instance_valid(v) and v != world.player.vehicle:
				draw_rect(Rect2(w2m(v.global_position) - Vector2(5, 5), Vector2(10, 10)), Color(1.0, 0.85, 0.2))
	# Waypoint
	if waypoint != Vector3.INF:
		var wp := w2m(waypoint)
		var cen := size * 0.5
		if not Rect2(Vector2(8, 8), size - Vector2(16, 16)).has_point(wp):
			wp = cen + (wp - cen).normalized() * (minf(size.x, size.y) * 0.5 - 12)
		draw_circle(wp, 10, Color(1, 0.85, 0.1))
		draw_arc(wp, 13, 0, TAU, 24, Color(0, 0, 0, 0.6), 2.0)
	# Player arrow
	if world and world.player:
		var pp := w2m(world.player.global_position if not world.is_in_interior() else world.interior_return_pos())
		var ang: float = world.player.model.rotation.y
		if world.player.vehicle:
			var f: Vector3 = -world.player.vehicle.global_transform.basis.z
			ang = atan2(f.x, f.z)
		var fwd := Vector2(sin(ang), cos(ang))
		var right := Vector2(fwd.y, -fwd.x)
		var pts := PackedVector2Array([pp + fwd * 12, pp - fwd * 8 + right * 8, pp - fwd * 4, pp - fwd * 8 - right * 8])
		draw_colored_polygon(pts, Color.WHITE)
		draw_polyline(pts + PackedVector2Array([pts[0]]), Color(0, 0, 0, 0.7), 2.0)
	draw_rect(Rect2(Vector2.ZERO, size), Color(1, 1, 1, 0.5), false, 3.0)
	if not full_map:
		draw_string(_font, Vector2(size.x * 0.5 - 5, 16), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(1, 1, 1, 0.9))
