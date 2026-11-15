extends CanvasLayer
## In-game HUD: money, time & weather, needs bars, minimap, mission tracker,
## interaction prompt, touch controls (walking and driving), notifications,
## online chat, fades and the Android back button.

var world: Node
var root: Control
var money_label: Label
var time_label: Label
var bars := {}
var minimap: Minimap
var tracker: VBoxContainer
var tracker_title: Label
var tracker_obj: Label
var toasts: VBoxContainer
var district_label: Label
var race_label: Label
var fade: ColorRect
var fps_label: Label
var chat_box: VBoxContainer
var chat_log: Label
var chat_edit: LineEdit
var joystick: TouchControls.Joystick
var btn_jump: TouchControls.TouchBtn
var btn_sprint: TouchControls.TouchBtn
var btn_interact: TouchControls.TouchBtn
var btn_vehicle: TouchControls.TouchBtn
var btn_gas: TouchControls.TouchBtn
var btn_brake: TouchControls.TouchBtn
var btn_hbrake: TouchControls.TouchBtn
var btn_horn: TouchControls.TouchBtn
var btn_exit: TouchControls.TouchBtn
var walk_controls: Control
var drive_controls: Control
var _driving := false
var _vehicle: Node = null
var _cam_index := -99
var _district_t := 0.0
var _chat_lines: Array = []
var _prompt_it: Interactable = null
var speed_label: Label
var fuel_bar: ProgressBar
var dmg_bar: ProgressBar


func _ready() -> void:
	layer = 10
	root = Control.new()
	root.theme = UI.theme()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_top_left()
	_build_top_right()
	_build_controls()
	_build_center()
	_build_chat()
	fade = ColorRect.new()
	fade.color = Color(0, 0, 0, 0)
	fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fade)
	GameManager.notify.connect(toast)
	GameManager.state_changed.connect(_refresh_stats)
	MissionManager.missions_changed.connect(_refresh_tracker)
	MissionManager.mission_completed.connect(func(id): _refresh_tracker())
	MultiplayerManager.chat_received.connect(_on_chat)
	_refresh_stats()
	_refresh_tracker()
	set_prompt(null)


# ------------------------------------------------------------------ build

func _build_top_left() -> void:
	var column := UI.vbox(8)
	column.position = Vector2(14, 12)
	column.custom_minimum_size = Vector2(340, 0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(column)
	var panel := UI.card(Color(0.05, 0.07, 0.12, 0.72), 16)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	column.add_child(panel)
	var v := UI.vbox(4)
	panel.add_child(v)
	money_label = UI.label("", 20, Color(0.6, 1.0, 0.65))
	money_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	money_label.clip_text = true
	v.add_child(money_label)
	time_label = UI.label("", 17, UI.MUTED)
	time_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	time_label.clip_text = true
	v.add_child(time_label)
	for n in [["health", "Health", Color(0.9, 0.3, 0.35)], ["hunger", "Hunger", Color(0.95, 0.6, 0.2)], ["thirst", "Thirst", Color(0.3, 0.65, 0.95)], ["energy", "Energy", Color(0.95, 0.85, 0.3)], ["hygiene", "Hygiene", Color(0.5, 0.85, 0.85)], ["happiness", "Happy", Color(0.85, 0.5, 0.9)], ["social", "Social", Color(0.5, 0.85, 0.5)]]:
		var row := UI.hbox(6)
		var l := UI.label(n[1], 14, UI.MUTED)
		l.custom_minimum_size = Vector2(62, 0)
		l.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(l)
		var b := UI.bar(50, n[2], 11)
		UI.expand(b)
		row.add_child(b)
		v.add_child(row)
		bars[n[0]] = b
	panel.gui_input.connect(func(e): if _tap(e): CharacterPanel.open(self))
	# Mission tracker under the stats.
	var tp := UI.card(Color(0.05, 0.07, 0.12, 0.65), 14)
	tp.mouse_filter = Control.MOUSE_FILTER_STOP
	column.add_child(tp)
	tracker = UI.vbox(2)
	tp.add_child(tracker)
	tracker_title = UI.label("", 17, UI.ACCENT2)
	tracker_obj = UI.label("", 15, UI.TEXT)
	tracker.add_child(tracker_title)
	tracker.add_child(tracker_obj)
	tp.gui_input.connect(func(e): if _tap(e): MissionsPanel.open(self))
	fps_label = UI.label("", 14, Color(1, 1, 1, 0.6))
	fps_label.position = Vector2(364, 12)
	root.add_child(fps_label)


func _tap(e: InputEvent) -> bool:
	return e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT


func _build_top_right() -> void:
	minimap = Minimap.new()
	minimap.world = world
	minimap.anchor_left = 1.0
	minimap.anchor_right = 1.0
	minimap.offset_left = -232
	minimap.offset_right = -14
	minimap.offset_top = 12
	minimap.offset_bottom = 230
	root.add_child(minimap)
	minimap.gui_input.connect(func(e): if _tap(e): Phone.open(self, "map"))
	var row := UI.hbox(10)
	row.anchor_left = 1.0
	row.anchor_right = 1.0
	row.offset_left = -232
	row.offset_right = -14
	row.offset_top = 240
	row.offset_bottom = 304
	root.add_child(row)
	var phone := UI.button("Phone", func(): Phone.open(self), 60, UI.ACCENT.darkened(0.3))
	UI.expand(phone)
	row.add_child(phone)
	var pause := UI.button("II", open_pause, 60)
	pause.custom_minimum_size = Vector2(64, 60)
	row.add_child(pause)


func _build_controls() -> void:
	joystick = TouchControls.Joystick.new()
	joystick.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(joystick)

	walk_controls = Control.new()
	walk_controls.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	walk_controls.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(walk_controls)
	btn_jump = _add_btn(walk_controls, "Jump", 118, Vector2(-150, -150), Color(0.2, 0.45, 0.8, 0.6))
	btn_sprint = _add_btn(walk_controls, "Sprint", 96, Vector2(-290, -120), Color(0.25, 0.3, 0.45, 0.6))
	btn_sprint.toggle = true
	btn_interact = _add_btn(walk_controls, "Use", 120, Vector2(-160, -300), Color(0.15, 0.6, 0.5, 0.75))
	btn_interact.font_size = 17
	btn_vehicle = _add_btn(walk_controls, "Drive", 96, Vector2(-300, -260), Color(0.8, 0.55, 0.15, 0.7))
	btn_jump.pressed.connect(func(): world.player.request_jump())
	btn_sprint.pressed.connect(func(): world.player.sprint_toggle = btn_sprint.toggled_on)
	btn_interact.pressed.connect(func(): world.player.interact())
	btn_vehicle.pressed.connect(func(): world.toggle_vehicle())

	drive_controls = Control.new()
	drive_controls.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	drive_controls.mouse_filter = Control.MOUSE_FILTER_IGNORE
	drive_controls.visible = false
	root.add_child(drive_controls)
	btn_gas = _add_btn(drive_controls, "Gas", 130, Vector2(-150, -150), Color(0.2, 0.65, 0.3, 0.65))
	btn_brake = _add_btn(drive_controls, "Brake\nReverse", 110, Vector2(-300, -120), Color(0.75, 0.25, 0.25, 0.65))
	btn_brake.font_size = 16
	btn_hbrake = _add_btn(drive_controls, "Hand\nbrake", 88, Vector2(-290, -265), Color(0.4, 0.4, 0.45, 0.65))
	btn_hbrake.font_size = 16
	btn_horn = _add_btn(drive_controls, "Horn", 80, Vector2(-150, -300), Color(0.3, 0.3, 0.5, 0.6))
	btn_exit = _add_btn(drive_controls, "Exit", 90, Vector2(-400, -280), Color(0.8, 0.55, 0.15, 0.7))
	btn_horn.pressed.connect(func(): if _vehicle: _vehicle.honk())
	btn_exit.pressed.connect(func(): world.toggle_vehicle())
	# Speedometer / fuel / damage
	var dash := UI.card(Color(0.05, 0.07, 0.12, 0.72), 14)
	dash.anchor_left = 0.5
	dash.anchor_right = 0.5
	dash.anchor_top = 1.0
	dash.anchor_bottom = 1.0
	dash.offset_left = -150
	dash.offset_right = 150
	dash.offset_top = -110
	dash.offset_bottom = -14
	drive_controls.add_child(dash)
	var dv := UI.vbox(4)
	dash.add_child(dv)
	speed_label = UI.label("0 mph", 26, UI.TEXT, HORIZONTAL_ALIGNMENT_CENTER)
	speed_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	dv.add_child(speed_label)
	var fr := UI.hbox(6)
	var fl := UI.label("Fuel", 14, UI.MUTED)
	fl.autowrap_mode = TextServer.AUTOWRAP_OFF
	fr.add_child(fl)
	fuel_bar = UI.bar(100, UI.WARN, 10)
	UI.expand(fuel_bar)
	fr.add_child(fuel_bar)
	var dl := UI.label("Damage", 14, UI.MUTED)
	dl.autowrap_mode = TextServer.AUTOWRAP_OFF
	fr.add_child(dl)
	dmg_bar = UI.bar(0, UI.BAD, 10)
	UI.expand(dmg_bar)
	fr.add_child(dmg_bar)
	dv.add_child(fr)


func _add_btn(parent: Control, text: String, d: float, offset: Vector2, col: Color) -> TouchControls.TouchBtn:
	var b := TouchControls.TouchBtn.new(text, d, col)
	b.anchor_left = 1.0
	b.anchor_right = 1.0
	b.anchor_top = 1.0
	b.anchor_bottom = 1.0
	b.offset_left = offset.x - d * 0.5
	b.offset_top = offset.y - d * 0.5
	b.offset_right = offset.x + d * 0.5
	b.offset_bottom = offset.y + d * 0.5
	parent.add_child(b)
	return b


func _build_center() -> void:
	toasts = UI.vbox(6)
	toasts.anchor_left = 0.5
	toasts.anchor_right = 0.5
	toasts.offset_left = -260
	toasts.offset_right = 260
	toasts.offset_top = 14
	toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(toasts)
	district_label = UI.label("", 34, Color(1, 1, 1), HORIZONTAL_ALIGNMENT_CENTER)
	district_label.modulate.a = 0.0
	district_label.anchor_left = 0.5
	district_label.anchor_right = 0.5
	district_label.anchor_top = 0.3
	district_label.offset_left = -300
	district_label.offset_right = 300
	district_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	district_label.add_theme_constant_override("shadow_offset_y", 3)
	district_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(district_label)
	race_label = UI.label("", 28, Color(1, 0.9, 0.3), HORIZONTAL_ALIGNMENT_CENTER)
	race_label.anchor_left = 0.5
	race_label.anchor_right = 0.5
	race_label.anchor_top = 0.16
	race_label.offset_left = -360
	race_label.offset_right = 360
	race_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	race_label.add_theme_constant_override("shadow_offset_y", 3)
	race_label.visible = false
	race_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(race_label)


func _build_chat() -> void:
	chat_box = UI.vbox(4)
	chat_box.position = Vector2(14, 420)
	chat_box.custom_minimum_size = Vector2(380, 0)
	chat_box.visible = MultiplayerManager.is_online()
	root.add_child(chat_box)
	chat_log = UI.label("", 15, Color(1, 1, 1, 0.9))
	chat_log.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	chat_log.add_theme_constant_override("shadow_offset_y", 2)
	chat_box.add_child(chat_log)
	var row := UI.hbox(6)
	chat_edit = LineEdit.new()
	chat_edit.placeholder_text = "Say something..."
	chat_edit.max_length = MultiplayerManager.MAX_CHAT_LEN
	chat_edit.custom_minimum_size = Vector2(0, 44)
	UI.expand(chat_edit)
	chat_edit.text_submitted.connect(_send_chat)
	chat_edit.focus_entered.connect(func(): GameManager.push_ui())
	chat_edit.focus_exited.connect(func(): GameManager.pop_ui())
	row.add_child(chat_edit)
	var send := UI.button("Send", func(): _send_chat(chat_edit.text), 44)
	row.add_child(send)
	chat_box.add_child(row)


# ------------------------------------------------------------------ updates

func _process(delta: float) -> void:
	if world == null or world.player == null:
		return
	var p = world.player
	if _driving and _vehicle and is_instance_valid(_vehicle):
		var v = _vehicle
		var thr := 0.0
		if btn_gas.is_down:
			thr = 1.0
		elif btn_brake.is_down:
			thr = -1.0
		elif absf(joystick.value.y) > 0.3:
			thr = -joystick.value.y
		v.touch_throttle = thr
		v.touch_steer = joystick.value.x
		if btn_hbrake.is_down:
			v.handbrake = true
		speed_label.text = "%d mph" % int(absf(v.speed) * 2.237)
		fuel_bar.value = v.fuel / maxf(1.0, float(v.def.get("fuel_capacity", 40))) * 100.0
		dmg_bar.value = v.damage
	else:
		p.touch_move = joystick.value
	if _district_t > 0.0:
		_district_t -= delta
		district_label.modulate.a = clampf(_district_t, 0.0, 1.0)
	fps_label.visible = bool(Settings.get_value("show_fps", false))
	if fps_label.visible:
		fps_label.text = "%d FPS" % Engine.get_frames_per_second()
	if Engine.get_process_frames() % 20 == 0:
		_update_waypoint()


func _refresh_stats() -> void:
	var s := GameManager.state
	if s.is_empty() or money_label == null:
		return
	money_label.text = "Cash %s   Bank %s" % [Money.fmt(int(s["cash"])), Money.fmt(int(s["bank"]))]
	var w := {"sunny": "Sunny", "cloudy": "Cloudy", "rain": "Rain"}
	time_label.text = "%s, Day %d  %s  •  %s%s" % [WorldClock.day_name(), WorldClock.day, WorldClock.time_string(), w.get(WorldClock.weather, ""), "  •  " + MultiplayerManager.mode_name() if MultiplayerManager.is_online() else ""]
	for k in bars:
		var val := float(s["needs"][k])
		bars[k].value = val
		bars[k].modulate = Color(1, 1, 1) if val > 20 else Color(1, 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.01), 0.5)


func _refresh_tracker() -> void:
	if GameManager.state.is_empty() or tracker_title == null:
		return
	var id: String = GameManager.state["missions"]["tracked"]
	if id == "" or not GameManager.state["missions"]["active"].has(id):
		tracker_title.text = "No mission tracked"
		tracker_obj.text = "Tap to open missions"
		return
	var d := MissionManager.definition(id)
	tracker_title.text = str(d.get("title", id))
	var objs: Array = d.get("objectives", [])
	for i in objs.size():
		var have := MissionManager.objective_progress(id, i)
		if have < float(objs[i]["count"]):
			var cnt := int(objs[i]["count"])
			tracker_obj.text = "• " + str(objs[i]["text"]) + ("" if cnt <= 1 or objs[i]["type"] == "time_trial" or objs[i]["type"] == "stat_above" else "  (%d/%d)" % [int(have), cnt])
			return
	tracker_obj.text = "Complete!"


func _update_waypoint() -> void:
	if world.race and world.race.is_running():
		return
	if world.work_route and world.work_route.active:
		return
	var id: String = GameManager.state["missions"].get("tracked", "")
	var loc := MissionManager.objective_location(id) if id != "" else ""
	var wp := Vector3.INF
	if loc == "home":
		if GameManager.state["home"] != "":
			wp = CityLayout.location_pos(GameManager.state["home"])
	elif loc.begins_with("npc:"):
		var n = world.npcs.get(loc.substr(4))
		if n and n.visible:
			wp = n.global_position
	elif loc.begins_with("district_"):
		var dname := loc.substr(9)
		for bz in CityLayout.N:
			for bx in CityLayout.N:
				if wp == Vector3.INF and CityLayout.district_of_block(Vector2i(bx, bz)) == dname:
					wp = CityLayout.block_center(Vector2i(bx, bz))
	elif loc != "" and CityLayout.LOCATIONS.has(loc):
		wp = CityLayout.location_pos(loc)
	minimap.waypoint = wp


func set_waypoint(p: Vector3) -> void:
	minimap.waypoint = p


func set_prompt(it) -> void:
	_prompt_it = it
	if btn_interact == null:
		return
	if it == null or not is_instance_valid(it):
		btn_interact.visible = false
		btn_vehicle.visible = false
		return
	if it.kind == "vehicle":
		btn_interact.visible = false
		btn_vehicle.visible = true
		btn_vehicle.set_text("Drive")
	else:
		btn_vehicle.visible = false
		btn_interact.visible = true
		var t: String = it.prompt
		if t.length() > 14:
			var words := t.split(" ")
			var line1 := ""
			var line2 := ""
			for w in words:
				if (line1 + " " + w).length() <= 13 and line2 == "":
					line1 = (line1 + " " + w).strip_edges()
				else:
					line2 = (line2 + " " + w).strip_edges()
			t = line1 + "\n" + line2.substr(0, 14)
		btn_interact.set_text(t)


func set_driving(on: bool, v: Node) -> void:
	_driving = on
	_vehicle = v
	walk_controls.visible = not on
	drive_controls.visible = on
	joystick.release()
	if not on:
		set_prompt(world.player.current_interactable)


func show_district(name: String) -> void:
	district_label.text = name
	_district_t = 3.0


func show_race_info(on: bool) -> void:
	race_label.visible = on
	if not on:
		race_label.text = ""


func set_race_text(t: String) -> void:
	race_label.text = t


# ------------------------------------------------------------------ toasts

func toast(text: String, kind: String = "info") -> void:
	var col := UI.CARD
	match kind:
		"good":
			col = Color(0.12, 0.42, 0.28, 0.95)
		"bad":
			col = Color(0.5, 0.15, 0.18, 0.95)
		"warn":
			col = Color(0.5, 0.38, 0.1, 0.95)
		"achievement":
			col = Color(0.55, 0.4, 0.05, 0.97)
		_:
			col = Color(0.14, 0.2, 0.32, 0.95)
	var c := UI.card(col, 14)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := UI.label(("★ " if kind == "achievement" else "") + text, 19, UI.TEXT, HORIZONTAL_ALIGNMENT_CENTER)
	c.add_child(l)
	toasts.add_child(c)
	if kind == "info" or kind == "warn":
		AudioManager.play_sfx("notify", 1.0, -8.0)
	while toasts.get_child_count() > 4:
		toasts.get_child(0).queue_free()
		toasts.remove_child(toasts.get_child(0))
	var tw := c.create_tween()
	c.modulate.a = 0.0
	tw.tween_property(c, "modulate:a", 1.0, 0.2)
	tw.tween_interval(3.2 if kind != "achievement" else 4.5)
	tw.tween_property(c, "modulate:a", 0.0, 0.4)
	tw.tween_callback(c.queue_free)


# ------------------------------------------------------------------ fades

func fade_out(t: float) -> void:
	var tw := create_tween()
	tw.tween_property(fade, "color:a", 1.0, t)
	await tw.finished


func fade_in(t: float) -> void:
	var tw := create_tween()
	tw.tween_property(fade, "color:a", 0.0, t)
	await tw.finished


func fade_flash() -> void:
	fade.color.a = 0.8
	var tw := create_tween()
	tw.tween_property(fade, "color:a", 0.0, 0.8)


# ------------------------------------------------------------------ chat

func _on_chat(from_name: String, text: String, system: bool) -> void:
	chat_box.visible = true
	_chat_lines.append(("* " if system else from_name + ": ") + text)
	while _chat_lines.size() > 6:
		_chat_lines.pop_front()
	chat_log.text = "\n".join(_chat_lines)


func _send_chat(t: String) -> void:
	MultiplayerManager.send_chat(t)
	chat_edit.text = ""
	chat_edit.release_focus()


# ------------------------------------------------------------------ input

func _unhandled_input(event: InputEvent) -> void:
	# Camera look: drag on the right part of the screen.
	if world == null or world.cam == null or GameManager.ui_blocking > 0:
		return
	var vp := root.get_viewport_rect().size
	if event is InputEventScreenTouch:
		if event.pressed and _cam_index == -99 and event.position.x > vp.x * 0.38:
			_cam_index = event.index
		elif not event.pressed and event.index == _cam_index:
			_cam_index = -99
	elif event is InputEventScreenDrag and event.index == _cam_index:
		world.cam.rotate_input(event.relative)
	elif event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION:
		if event.button_mask & (MOUSE_BUTTON_MASK_LEFT | MOUSE_BUTTON_MASK_RIGHT):
			world.cam.rotate_input(event.relative)
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			world.cam.zoom(-0.6)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			world.cam.zoom(0.6)
	elif event.is_action_pressed("phone"):
		Phone.open(self)
	elif event.is_action_pressed("chat") and MultiplayerManager.is_online():
		chat_edit.grab_focus()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("ui_back_key"):
		_back()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_back()


## Android back button: close the top menu, otherwise open the pause menu.
func _back() -> void:
	if chat_edit and chat_edit.has_focus():
		chat_edit.release_focus()
		return
	if Modal.close_top(get_tree()):
		return
	if world.player.state == "sit":
		world.player.stand_up()
		return
	open_pause()


func open_pause() -> void:
	PauseMenu.open(self)
