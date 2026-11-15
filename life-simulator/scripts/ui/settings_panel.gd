class_name SettingsPanel
extends RefCounted
## Builds the settings UI (audio, graphics presets, controls) into a container.
## Used by the main menu, the pause menu and the phone's Settings app.


static func build(parent: Control) -> void:
	UI.clear(parent)
	parent.add_child(UI.label("Audio", 26, UI.ACCENT))
	_slider(parent, "Master volume", "master_volume")
	_slider(parent, "Music volume", "music_volume")
	_slider(parent, "Sound effects volume", "sfx_volume")
	parent.add_child(UI.label("Graphics", 26, UI.ACCENT))
	var h := UI.hbox(10)
	for p in ["low", "medium", "high"]:
		var b := UI.button(p.capitalize(), func(): Settings.set_value("graphics", p); build(parent))
		UI.expand(b)
		if Settings.get_value("graphics") == p:
			b.add_theme_stylebox_override("normal", UI.box(UI.ACCENT.darkened(0.25), 14))
		h.add_child(b)
	parent.add_child(h)
	var pr := Settings.preset()
	parent.add_child(UI.label("Shadows: %s • Render scale: %d%% • View distance: %dm • Frame cap: %d FPS • People: %d • Traffic: %d" % [
		"On" if pr["shadows"] else "Off", int(pr["render_scale"] * 100), int(pr["view_distance"]), pr["fps"], pr["npc_count"], pr["traffic"]], 18, UI.MUTED))
	parent.add_child(UI.label("Low is kindest to your battery. Changes to people/traffic apply next time the city loads.", 16, UI.MUTED))
	parent.add_child(UI.label("Controls", 26, UI.ACCENT))
	_slider(parent, "Camera sensitivity", "camera_sensitivity", 0.3, 2.0)
	_slider(parent, "Joystick size", "joystick_size", 0.7, 1.4)
	_toggle(parent, "Invert camera Y", "invert_y")
	_toggle(parent, "Vibration", "vibration")
	_toggle(parent, "Show FPS", "show_fps")
	parent.add_child(UI.label("Autosave every %d minutes" % int(Settings.get_value("autosave_minutes")), 20))
	var ah := UI.hbox(10)
	for m in [1, 3, 5, 10]:
		var b := UI.button("%d min" % m, func(): Settings.set_value("autosave_minutes", m); build(parent))
		UI.expand(b)
		ah.add_child(b)
	parent.add_child(ah)


static func _slider(parent: Control, text: String, key: String, mn: float = 0.0, mx: float = 1.0) -> void:
	var row := UI.hbox(14)
	var l := UI.label(text, 20)
	l.custom_minimum_size = Vector2(260, 0)
	row.add_child(l)
	var s := HSlider.new()
	s.min_value = mn
	s.max_value = mx
	s.step = 0.05
	s.value = float(Settings.get_value(key))
	s.custom_minimum_size = Vector2(0, 48)
	UI.expand(s)
	var val := UI.label("%d%%" % int(s.value * 100), 20, UI.MUTED)
	val.custom_minimum_size = Vector2(70, 0)
	s.value_changed.connect(func(v): Settings.set_value(key, v); val.text = "%d%%" % int(v * 100))
	row.add_child(s)
	row.add_child(val)
	parent.add_child(row)


static func _toggle(parent: Control, text: String, key: String) -> void:
	var cb := CheckButton.new()
	cb.text = text
	cb.button_pressed = bool(Settings.get_value(key))
	cb.custom_minimum_size = Vector2(0, 52)
	cb.add_theme_font_size_override("font_size", 20)
	cb.toggled.connect(func(on): Settings.set_value(key, on))
	parent.add_child(cb)
