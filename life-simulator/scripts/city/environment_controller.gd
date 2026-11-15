extends Node3D
## Day/night cycle and weather: sun angle and colour, sky, ambient light, fog,
## night window/lamp glow, cloud cover and rain particles that follow the camera.

var sun: DirectionalLight3D
var moon: DirectionalLight3D
var env: Environment
var sky_mat: ProceduralSkyMaterial
var rain: CPUParticles3D
var city: Node3D
var _cloud := 0.0          # 0 clear .. 1 overcast (smoothed)
var _rain_amt := 0.0
var _follow: Node3D


func setup(city_node: Node3D, preset: Dictionary) -> void:
	city = city_node
	var we := WorldEnvironment.new()
	env = Environment.new()
	sky_mat = ProceduralSkyMaterial.new()
	sky_mat.sky_horizon_color = Color(0.75, 0.82, 0.9)
	sky_mat.ground_horizon_color = Color(0.6, 0.65, 0.7)
	sky_mat.ground_bottom_color = Color(0.25, 0.3, 0.3)
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_32
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 0.9
	env.fog_enabled = bool(preset.get("fog", true))
	env.fog_density = 0.0
	env.fog_light_color = Color(0.7, 0.75, 0.82)
	env.fog_sky_affect = 0.4
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_depth_begin = float(preset["view_distance"]) * 0.45
	env.fog_depth_end = float(preset["view_distance"])
	env.fog_depth_curve = 1.2
	env.fog_light_energy = 1.0
	we.environment = env
	add_child(we)

	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = bool(preset.get("shadows", true))
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 60.0
	sun.light_cull_mask = 1     # interiors use visual layer 2, so sunlight never leaks inside
	sun.shadow_bias = 0.06
	sun.shadow_normal_bias = 1.5
	add_child(sun)
	moon = DirectionalLight3D.new()
	moon.light_color = Color(0.55, 0.65, 0.95)
	moon.light_energy = 0.0
	moon.shadow_enabled = false
	moon.light_cull_mask = 1
	moon.rotation_degrees = Vector3(-55, -150, 0)
	add_child(moon)

	rain = CPUParticles3D.new()
	rain.amount = int(preset.get("rain_particles", 500))
	rain.lifetime = 0.9
	rain.emitting = false
	rain.local_coords = false
	rain.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	rain.emission_box_extents = Vector3(18, 1, 18)
	rain.direction = Vector3(0.05, -1, 0)
	rain.spread = 2.0
	rain.gravity = Vector3(0, -20, 0)
	rain.initial_velocity_min = 16.0
	rain.initial_velocity_max = 20.0
	var drop := QuadMesh.new()
	drop.size = Vector2(0.03, 0.5)
	var dm := StandardMaterial3D.new()
	dm.albedo_color = Color(0.75, 0.8, 0.9, 0.55)
	dm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dm.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	drop.material = dm
	rain.mesh = drop
	add_child(rain)
	WorldClock.weather_changed.connect(_on_weather)
	Settings.changed.connect(_apply_preset)
	_on_weather(WorldClock.weather)
	update_now()


## Graphics preset changed in Settings: update shadows, view distance and rain density live.
func _apply_preset() -> void:
	var p := Settings.preset()
	sun.shadow_enabled = bool(p["shadows"])
	env.fog_depth_end = float(p["view_distance"])
	rain.amount = int(p["rain_particles"])
	var cam := get_viewport().get_camera_3d()
	if cam:
		cam.far = float(p["view_distance"]) + 40.0


func follow(target: Node3D) -> void:
	_follow = target


func _on_weather(w: String) -> void:
	AudioManager.set_rain(w == "rain")


func update_now() -> void:
	_cloud = _cloud_target()
	_rain_amt = 1.0 if WorldClock.weather == "rain" else 0.0
	_process(0.0)


func _cloud_target() -> float:
	match WorldClock.weather:
		"cloudy":
			return 0.65
		"rain":
			return 1.0
	return 0.0


func _process(delta: float) -> void:
	_cloud = move_toward(_cloud, _cloud_target(), delta * 0.1)
	_rain_amt = move_toward(_rain_amt, 1.0 if WorldClock.weather == "rain" else 0.0, delta * 0.25)
	var t := WorldClock.minute / 1440.0
	# Sun travels east to west; highest at 13:00.
	var elev := sin((t - 0.25) * TAU)          # -1 midnight .. 1 noon
	var day := WorldClock.daylight()
	sun.rotation = Vector3(-maxf(0.08, elev) * 1.25 - 0.1, (t - 0.5) * TAU * 0.9, 0)
	var warm := clampf(1.0 - absf(elev) * 2.2, 0.0, 1.0) * float(elev > -0.1)
	sun.light_color = Color(1.0, 0.95, 0.88).lerp(Color(1.0, 0.6, 0.35), warm)
	sun.light_energy = day * (1.05 - _cloud * 0.6)
	sun.visible = day > 0.02
	moon.light_energy = (1.0 - day) * 0.22
	var night := 1.0 - day
	var top_day := Color(0.28, 0.5, 0.86).lerp(Color(0.5, 0.55, 0.62), _cloud)
	var hor_day := Color(0.72, 0.82, 0.92).lerp(Color(0.68, 0.7, 0.74), _cloud)
	var top_night := Color(0.02, 0.03, 0.08)
	var hor_night := Color(0.08, 0.1, 0.18)
	var hor := hor_day.lerp(hor_night, night).lerp(Color(1.0, 0.62, 0.38), warm * 0.6 * (1.0 - _cloud))
	sky_mat.sky_top_color = top_day.lerp(top_night, night)
	sky_mat.sky_horizon_color = hor
	sky_mat.ground_horizon_color = hor.darkened(0.15)
	sky_mat.sun_angle_max = 30.0
	env.ambient_light_energy = lerpf(0.25, 0.8, day) * (1.0 - _cloud * 0.2)
	env.fog_light_color = hor
	env.fog_density = 0.0
	env.fog_depth_begin = lerpf(float(Settings.preset()["view_distance"]) * 0.45, 30.0, _rain_amt * 0.6)
	if city and city.has_method("set_night_amount"):
		city.set_night_amount(clampf(night * 1.3 - 0.2, 0.0, 1.0))
	rain.emitting = _rain_amt > 0.3
	if _follow:
		rain.global_position = _follow.global_position + Vector3(0, 12, 0)
