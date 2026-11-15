extends Node3D
## Ambient traffic. Cars drive on the LEFT (UK rules) along the road grid,
## pick a random turn at each junction, and slow down for the player,
## the player's vehicle and the car in front.

const LANE := 2.4
const CRUISE := 10.0
const COLORS := ["#c0392b", "#2e6fd1", "#f4f4f4", "#1d1f24", "#7a7f87", "#27ae60", "#f1c40f", "#e67e22", "#16a085", "#8e44ad"]
const TYPES := ["hatchback", "saloon", "suv", "van", "hatchback", "saloon"]

var cars: Array = []
var player: Node3D
var rng := RandomNumberGenerator.new()


class TrafficCar:
	var body: AnimatableBody3D
	var model: VehicleModel
	var node_from: Vector2i
	var node_to: Vector2i
	var dir: Vector3
	var speed := 0.0
	var waypoints: Array = []


func spawn(count: int) -> void:
	rng.seed = 99
	for i in count:
		var c := TrafficCar.new()
		c.body = AnimatableBody3D.new()
		c.body.sync_to_physics = false
		c.body.collision_layer = 4
		c.body.collision_mask = 0
		var cs := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(1.9, 1.4, 4.4)
		cs.shape = box
		cs.position.y = 0.8
		c.body.add_child(cs)
		c.model = VehicleModel.new()
		var t: String = TYPES[i % TYPES.size()]
		c.model.build("van" if t == "van" else "car", Color(COLORS[rng.randi_range(0, COLORS.size() - 1)]), t)
		c.body.add_child(c.model)
		add_child(c.body)
		# Start somewhere on the grid.
		c.node_from = Vector2i(rng.randi_range(0, CityLayout.N), rng.randi_range(0, CityLayout.N))
		c.node_to = _random_neighbor(c.node_from, Vector2i(-99, -99))
		c.dir = (CityLayout.node_pos(c.node_to) - CityLayout.node_pos(c.node_from)).normalized()
		var t0 := rng.randf_range(0.2, 0.8)
		c.body.global_position = CityLayout.node_pos(c.node_from).lerp(CityLayout.node_pos(c.node_to), t0) + _lane(c.dir)
		c.body.rotation.y = atan2(-c.dir.x, -c.dir.z)
		c.speed = CRUISE
		c.waypoints = [CityLayout.node_pos(c.node_to) - c.dir * 6.0 + _lane(c.dir)]
		cars.append(c)


func _lane(d: Vector3) -> Vector3:
	# Left-hand traffic: offset to the left of the direction of travel.
	return Vector3(d.z, 0, -d.x) * LANE


func _random_neighbor(n: Vector2i, avoid: Vector2i) -> Vector2i:
	var opts := []
	for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var m: Vector2i = n + d
		if m.x < 0 or m.y < 0 or m.x > CityLayout.N or m.y > CityLayout.N or m == avoid:
			continue
		opts.append(m)
	if opts.is_empty():
		return avoid
	return opts[rng.randi_range(0, opts.size() - 1)]


func _physics_process(delta: float) -> void:
	for c in cars:
		_drive(c, delta)


func _drive(c: TrafficCar, delta: float) -> void:
	if c.waypoints.is_empty():
		# Arrived at a junction entry: choose the next road.
		var nxt := _random_neighbor(c.node_to, c.node_from)
		var new_dir := (CityLayout.node_pos(nxt) - CityLayout.node_pos(c.node_to)).normalized()
		var centre := CityLayout.node_pos(c.node_to)
		c.waypoints = [centre + new_dir * 6.0 + _lane(new_dir), CityLayout.node_pos(nxt) - new_dir * 6.0 + _lane(new_dir)]
		c.node_from = c.node_to
		c.node_to = nxt
		c.dir = new_dir
	var pos := c.body.global_position
	var tgt: Vector3 = c.waypoints[0]
	var to := tgt - pos
	to.y = 0
	var dist := to.length()
	# Look ahead for obstacles.
	var fwd := -c.body.global_transform.basis.z
	var want := CRUISE
	if player and is_instance_valid(player):
		var obstacles: Array = [player.global_position]
		if player.get("vehicle") and is_instance_valid(player.vehicle):
			obstacles.append(player.vehicle.global_position)
		for o in obstacles:
			var rel: Vector3 = o - pos
			rel.y = 0
			var ahead := rel.dot(fwd)
			var side := absf(rel.dot(Vector3(fwd.z, 0, -fwd.x)))
			if ahead > 0.0 and ahead < 11.0 and side < 2.4:
				want = 0.0 if ahead < 6.0 else CRUISE * 0.35
	for o2 in cars:
		if o2 == c:
			continue
		var rel2: Vector3 = o2.body.global_position - pos
		var ahead2 := rel2.dot(fwd)
		var side2 := absf(rel2.dot(Vector3(fwd.z, 0, -fwd.x)))
		if ahead2 > 0.0 and ahead2 < 9.0 and side2 < 1.8:
			want = minf(want, 0.0 if ahead2 < 6.0 else CRUISE * 0.4)
	c.speed = move_toward(c.speed, want, (14.0 if want < c.speed else 5.0) * delta)
	if dist < 0.8:
		c.waypoints.pop_front()
		return
	var step := minf(dist, c.speed * delta)
	var newp := pos + to.normalized() * step
	newp.y = 0.0
	c.body.global_position = newp
	if c.speed > 0.2:
		var yaw := atan2(-to.x, -to.z)
		c.body.rotation.y = lerp_angle(c.body.rotation.y, yaw, minf(1.0, delta * 5.0))
	c.model.spin_wheels(step, 0.0)
