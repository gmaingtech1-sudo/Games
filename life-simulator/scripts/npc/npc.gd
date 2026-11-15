extends CharacterBody3D
## A named city resident with a daily routine (home -> work -> leisure -> home),
## walking along the pavements. Talk to them to build friendships.
## When far from the camera they move faster so routines keep up with game time.

const WALK := 1.6
const SIDEWALK_OFFSET := Vector3(6.5, 0, 6.5)

var npc_id := ""
var data: Dictionary = {}
var model: CharacterModel
var label: Label3D
var interact_area: Interactable
var path: Array = []          # Vector3 waypoints
var goal := ""                # location id we're heading to
var at_goal := false
var indoors := false
var talking := false
var player: Node3D
var _wander_t := 0.0
var _react_cool := 0.0
var _rng := RandomNumberGenerator.new()
var _repath_cool := 0.0


func setup(id: String) -> void:
	npc_id = id
	data = DataDB.npcs.get(id, {})
	_rng.seed = hash(id)


func _ready() -> void:
	collision_layer = 8
	collision_mask = 1 | 2 | 4
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.3
	cap.height = 1.7
	cs.shape = cap
	cs.position.y = 0.85
	add_child(cs)
	model = CharacterModel.new()
	add_child(model)
	var outfit := {"top": "", "bottom": "", "shoes": "", "accessory": ""}
	model.setup({"body": data.get("body", "masc"), "hair": data.get("hair", 1), "hair_color": data.get("hair_color", "#222222"), "skin": data.get("skin", 1)}, outfit)
	_apply_colors()
	label = Label3D.new()
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position.y = 2.15
	label.font_size = 40
	label.pixel_size = 0.008
	label.outline_size = 10
	label.visibility_range_end = 22.0
	label.no_depth_test = false
	add_child(label)
	interact_area = Interactable.make("npc", npc_id, "Talk to " + str(data.get("name", "")), 1.8, 2.2)
	add_child(interact_area)
	refresh_label()
	GameManager.data_changed.connect(refresh_label)
	MissionManager.missions_changed.connect(refresh_label)


func _apply_colors() -> void:
	# NPCs wear their signature colours rather than shop items.
	var top_c := Color(str(data.get("top", "#888888")))
	var bot_c := Color(str(data.get("bottom", "#333333")))
	model.equipped = {}
	model.rebuild()
	_tint(model.torso, top_c, ["Upper"])
	for leg in [model.leg_l, model.leg_r]:
		for c in leg.get_children():
			if c is MeshInstance3D and (c.name == "Upper" or c.name == "Lower"):
				c.material_override = CharacterModel.mat(bot_c)
	for arm in [model.arm_l, model.arm_r]:
		var first: Node = arm.get_child(0)
		if first is MeshInstance3D:
			first.material_override = CharacterModel.mat(top_c)


func _tint(torso: Node3D, c: Color, _names: Array) -> void:
	# The first mesh of the torso is the chest.
	for ch in torso.get_children():
		if ch is MeshInstance3D:
			ch.material_override = CharacterModel.mat(c)
			break


func refresh_label() -> void:
	if GameManager.state.is_empty() or label == null:
		return
	var rel: Dictionary = GameManager.state["relationships"].get(npc_id, {})
	var met: bool = rel.get("met", false)
	var f := float(rel.get("friendship", 0))
	var txt: String = data.get("name", "") if met else data.get("occupation", "Resident")
	if met:
		txt += "\n" + DataDB.friendship_level_name(f)
		if rel.get("status", "") == "dating":
			txt += " ♥"
	if MissionManager.npc_mission_available(npc_id):
		txt = "! " + txt
	label.text = txt
	label.modulate = Color(1, 0.9, 0.4) if MissionManager.npc_mission_available(npc_id) else Color(1, 1, 1)


# ------------------------------------------------------------------ routine

func scheduled_location() -> String:
	var h := WorldClock.hour()
	if h < 7 or h >= 22:
		return data.get("home", "home_a")
	if h < 17:
		var day := (WorldClock.day - 1) % 7
		if day >= 5:   # weekends: leisure all day
			return data.get("leisure", "park")
		if h == 12:    # lunch break
			return data.get("leisure", "park")
		return data.get("work", "park")
	return data.get("leisure", "park")


static func is_outdoor(loc: String) -> bool:
	return loc in ["park", "plaza", "events", "fountain"]


## Only homes hide NPCs (overnight). At work and leisure spots they hang around
## outside the entrance so the streets feel alive and the player can find them.
func _hides_at(loc: String) -> bool:
	return loc == data.get("home", "")


func place_at_schedule() -> void:
	goal = scheduled_location()
	var p := _goal_pos(goal)
	global_position = p + Vector3(_rng.randf_range(-2, 2), 0, _rng.randf_range(-2, 2))
	at_goal = true
	_set_indoors(_hides_at(goal))


func _goal_pos(loc: String) -> Vector3:
	var p := CityLayout.location_pos(loc)
	if not is_outdoor(loc) and loc != data.get("home", ""):
		# Loiter beside the entrance, along the pavement.
		p += Vector3(_rng.randf_range(-4, 4), 0, 0)
	if loc == "park":
		p += Vector3(_rng.randf_range(-12, 12), 0, _rng.randf_range(-12, 12))
	elif loc == "plaza":
		p += Vector3(_rng.randf_range(-8, 8), 0, _rng.randf_range(-8, 8))
	return p


func _node_for_location(loc: String) -> Vector2i:
	var l: Dictionary = CityLayout.LOCATIONS.get(loc, {})
	if l.is_empty() or l.has("pos"):
		return CityLayout.nearest_node(CityLayout.location_pos(loc))
	var b: Vector2i = l["block"]
	return Vector2i(b.x, b.y if int(l["lot"]) < 2 else b.y + 1)


func _plan_path(loc: String) -> void:
	path.clear()
	var start := CityLayout.nearest_node(global_position - SIDEWALK_OFFSET)
	var end := _node_for_location(loc)
	for n in CityLayout.grid_path(start, end):
		path.append(CityLayout.node_pos(n) + SIDEWALK_OFFSET)
	path.append(_goal_pos(loc))


func _set_indoors(v: bool) -> void:
	indoors = v
	visible = not v
	collision_layer = 0 if v else 8
	interact_area.monitorable = not v


func _physics_process(delta: float) -> void:
	_react_cool -= delta
	_repath_cool -= delta
	var want := scheduled_location()
	if want != goal:
		goal = want
		at_goal = false
		if indoors:
			_set_indoors(false)
		_plan_path(goal)
	if talking:
		velocity = Vector3.ZERO
		if player:
			var to := player.global_position - global_position
			model.rotation.y = lerp_angle(model.rotation.y, atan2(to.x, to.z), delta * 6.0)
		model.animate(delta, 0.0, "idle")
		return
	if indoors:
		return
	var far := player == null or player.global_position.distance_to(global_position) > 70.0
	var spd := WALK * (6.0 if far else 1.0)
	var move := Vector3.ZERO
	if not at_goal:
		if path.is_empty():
			_plan_path(goal)
		var tgt: Vector3 = path[0]
		var to := tgt - global_position
		to.y = 0
		if to.length() < 0.6:
			path.pop_front()
			if path.is_empty():
				at_goal = true
				if _hides_at(goal):
					_set_indoors(true)
					return
		else:
			move = to.normalized() * spd
	else:
		# Idle / wander at outdoor goals.
		_wander_t -= delta
		if _wander_t <= 0.0 and not _hides_at(goal):
			_wander_t = _rng.randf_range(5, 14) if is_outdoor(goal) else _rng.randf_range(10, 25)
			path = [_goal_pos(goal)]
			at_goal = false
	# React to the player nearby: stop, face them and wave if friends.
	if player and not far:
		var dp := player.global_position - global_position
		if dp.length() < 2.2 and move != Vector3.ZERO and move.normalized().dot(dp.normalized()) > 0.6:
			move = Vector3.ZERO
		if dp.length() < 5.0 and _react_cool <= 0.0:
			_react_cool = 12.0
			if RelationshipRules.friendship(GameManager.state, npc_id) >= 15.0:
				model.wave()
	velocity = Vector3(move.x, 0, move.z)
	move_and_slide()
	global_position.y = 0.0
	var hs := Vector2(velocity.x, velocity.z).length()
	if hs > 0.1:
		model.rotation.y = lerp_angle(model.rotation.y, atan2(velocity.x, velocity.z), delta * 8.0)
	elif not at_goal and _repath_cool <= 0.0:
		# Stuck: replan from here.
		_repath_cool = 3.0
		_plan_path(goal)
	model.animate(delta, hs / (6.0 if far else 1.0), "walk" if hs > 0.1 else "idle")


func start_talk(p: Node3D) -> void:
	talking = true
	player = p
	model.wave()


func end_talk() -> void:
	talking = false
