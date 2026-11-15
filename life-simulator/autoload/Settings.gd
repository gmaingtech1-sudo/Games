extends Node
## Player settings (audio, graphics, controls), stored in user://settings.cfg.
## Graphics presets are tuned for Android: Low targets older mid-range phones.

signal changed

const PATH := "user://settings.cfg"
const PRESETS := {
	"low": {"shadows": false, "render_scale": 0.7, "view_distance": 170.0, "npc_count": 8, "traffic": 5, "fps": 30, "fog": true, "msaa": 0, "rain_particles": 250},
	"medium": {"shadows": true, "render_scale": 0.85, "view_distance": 240.0, "npc_count": 12, "traffic": 8, "fps": 30, "fog": true, "msaa": 0, "rain_particles": 500},
	"high": {"shadows": true, "render_scale": 1.0, "view_distance": 340.0, "npc_count": 16, "traffic": 12, "fps": 60, "fog": true, "msaa": 1, "rain_particles": 900},
}

var values := {
	"master_volume": 0.9,
	"music_volume": 0.6,
	"sfx_volume": 0.85,
	"graphics": "medium",
	"camera_sensitivity": 1.0,
	"invert_y": false,
	"show_fps": false,
	"vibration": true,
	"joystick_size": 1.0,
	"autosave_minutes": 3,
	"player_name_online": "",
	"last_server": "127.0.0.1",
}


func _ready() -> void:
	_ensure_buses()
	load_settings()
	if OS.has_feature("mobile") and not FileAccess.file_exists(PATH):
		values["graphics"] = "medium"
	apply()


func get_value(key: String, default = null):
	return values.get(key, default)


func set_value(key: String, value) -> void:
	values[key] = value
	apply()
	save_settings()
	changed.emit()


func preset() -> Dictionary:
	return PRESETS.get(values["graphics"], PRESETS["medium"])


func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return
	for k in values.keys():
		if cfg.has_section_key("settings", k):
			var v = cfg.get_value("settings", k)
			if typeof(v) == typeof(values[k]) or (typeof(v) in [TYPE_INT, TYPE_FLOAT] and typeof(values[k]) in [TYPE_INT, TYPE_FLOAT]):
				values[k] = v
	if not PRESETS.has(values["graphics"]):
		values["graphics"] = "medium"


func save_settings() -> void:
	var cfg := ConfigFile.new()
	for k in values:
		cfg.set_value("settings", k, values[k])
	cfg.save(PATH)


## Pushes settings to the engine (audio buses, frame rate, render scale).
func apply() -> void:
	_set_bus("Master", float(values["master_volume"]))
	_set_bus("Music", float(values["music_volume"]))
	_set_bus("SFX", float(values["sfx_volume"]))
	var p := preset()
	Engine.max_fps = int(p["fps"])
	var vp := get_viewport()
	if vp:
		vp.scaling_3d_scale = float(p["render_scale"])
		vp.msaa_3d = Viewport.MSAA_2X if int(p["msaa"]) > 0 else Viewport.MSAA_DISABLED


func _ensure_buses() -> void:
	for bus_name in ["Music", "SFX"]:
		if AudioServer.get_bus_index(bus_name) < 0:
			AudioServer.add_bus()
			var idx := AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, bus_name)
			AudioServer.set_bus_send(idx, "Master")


func _set_bus(bus_name: String, linear: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx < 0:
		return
	AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(linear, 0.0001)))
	AudioServer.set_bus_mute(idx, linear <= 0.001)


func vibrate(ms: int = 30) -> void:
	if values["vibration"] and OS.has_feature("mobile"):
		Input.vibrate_handheld(ms)
