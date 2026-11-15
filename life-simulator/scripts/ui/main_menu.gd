extends Control
## Main menu: New Game, Continue, Load, Multiplayer, Settings, Achievements, Exit.

var _t := 0.0
var _buttons: VBoxContainer
var _continue_btn: Button
var _status: Label


func _ready() -> void:
	theme = UI.theme()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	get_tree().paused = false
	GameManager.in_game = false
	WorldClock.running = false
	AudioManager.play_music("menu")
	_build()


func _build() -> void:
	var bg := _Skyline.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var root := HBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 60
	root.offset_right = -60
	root.offset_top = 40
	root.offset_bottom = -30
	add_child(root)

	var left := UI.vbox(6)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.alignment = BoxContainer.ALIGNMENT_CENTER
	var title := UI.label("LIFE SIMULATOR", 76, Color.WHITE)
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.45))
	title.add_theme_constant_override("shadow_offset_y", 4)
	title.add_theme_constant_override("shadow_offset_x", 3)
	left.add_child(title)
	left.add_child(UI.label("Build Your Life. Your Way.", 32, Color(1, 0.93, 0.8)))
	left.add_child(UI.spacer(0, 20))
	left.add_child(UI.label("Start with £1,000, a phone and big dreams.\nGet a job, find a home, buy a car, make friends and build a business empire.", 20, Color(1, 1, 1, 0.85)))
	root.add_child(left)

	var panel := UI.card(Color(0.07, 0.09, 0.14, 0.82), 22)
	panel.custom_minimum_size = Vector2(400, 0)
	panel.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_buttons = UI.vbox(12)
	panel.add_child(_buttons)
	root.add_child(panel)

	var latest := SaveManager.latest_slot()
	_continue_btn = UI.button("Continue", _on_continue, 70, UI.ACCENT.darkened(0.2))
	_continue_btn.disabled = latest < 0
	_buttons.add_child(_continue_btn)
	_buttons.add_child(UI.button("New Game", _on_new_game, 64))
	_buttons.add_child(UI.button("Load Game", _on_load, 64))
	_buttons.add_child(UI.button("Multiplayer", _on_multiplayer, 64))
	var row := UI.hbox(12)
	row.add_child(UI.expand(UI.button("Settings", _on_settings, 64)))
	row.add_child(UI.expand(UI.button("Achievements", _on_achievements, 64)))
	_buttons.add_child(row)
	_buttons.add_child(UI.button("Exit", _on_exit, 58, Color(0.35, 0.2, 0.24)))
	_status = UI.label("v" + str(ProjectSettings.get_setting("application/config/version")), 16, Color(1, 1, 1, 0.6), HORIZONTAL_ALIGNMENT_RIGHT)
	_buttons.add_child(_status)


func _on_continue() -> void:
	var slot := SaveManager.latest_slot()
	if slot < 0 or not SaveManager.load_game(slot):
		_status.text = "Couldn't load: " + SaveManager.last_error
		AudioManager.play_sfx("ui_error")


func _on_new_game() -> void:
	var m := Modal.open(self, "New Game - choose a save slot", 760, 520, false)
	var list := m.scroll_list(12)
	for info in SaveManager.list_slots():
		var slot: int = info["slot"]
		var text := "Slot %d - Empty" % slot
		if info["exists"]:
			text = "Slot %d - %s" % [slot, "Corrupted save" if info["corrupt"] else "%s, Day %d, %s (overwrite)" % [info["meta"].get("name", "?"), int(info["meta"].get("day", 1)), Money.fmt(int(info["meta"].get("money", 0)))]]
		var on_pick := func():
			if info["exists"]:
				UI.confirm(self, "Overwrite slot %d? That save will be lost." % slot, func(): m.close(); _start_creator(slot), "Overwrite")
			else:
				m.close()
				_start_creator(slot)
		list.add_child(UI.button(text, on_pick, 72))


func _start_creator(slot: int) -> void:
	GameManager.pending_new_game = {"slot": slot, "online": ""}
	GameManager.change_scene(GameManager.CREATOR)


func _on_load() -> void:
	var m := Modal.open(self, "Load Game", 820, 560, false)
	var list := m.scroll_list(12)
	for info in SaveManager.list_slots():
		var slot: int = info["slot"]
		var row := UI.hbox(10)
		var text := "Slot %d - Empty" % slot
		var can_load := false
		if info["exists"] and info["corrupt"]:
			text = "Slot %d - Damaged save (%s)" % [slot, info.get("error", "")]
		elif info["exists"]:
			var meta: Dictionary = info["meta"]
			text = "Slot %d - %s\nDay %d • %s • %s\nSaved %s" % [slot, meta.get("name", "?"), int(meta.get("day", 1)), Money.fmt(int(meta.get("money", 0))), meta.get("job", ""), meta.get("saved_text", "")]
			can_load = true
		var on_load := func():
			if not SaveManager.load_game(slot):
				_status.text = "Load failed: " + SaveManager.last_error
		var b := UI.button(text, on_load, 96)
		b.disabled = not can_load
		UI.expand(b)
		row.add_child(b)
		if info["exists"]:
			var del := UI.button("Delete", func(): UI.confirm(self, "Delete slot %d permanently?" % slot, func(): SaveManager.delete_slot(slot); m.close(); _on_load(); _continue_btn.disabled = SaveManager.latest_slot() < 0, "Delete"), 96, Color(0.45, 0.2, 0.22))
			del.custom_minimum_size = Vector2(130, 96)
			row.add_child(del)
		list.add_child(row)


func _on_multiplayer() -> void:
	MultiplayerMenu.open(self)


func _on_settings() -> void:
	var m := Modal.open(self, "Settings", 900, 640, false)
	SettingsPanel.build(m.scroll_list(12))


func _on_achievements() -> void:
	var m := Modal.open(self, "Achievements", 860, 640, false)
	AchievementsPanel.build(m.scroll_list(10))


func _on_exit() -> void:
	UI.confirm(self, "Exit Life Simulator?", func(): get_tree().quit(), "Exit")


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		for c in get_children():
			if c.has_meta("is_dialog"):
				c.queue_free()
				return
		if not Modal.close_top(get_tree()):
			_on_exit()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_back_key"):
		_notification(NOTIFICATION_WM_GO_BACK_REQUEST)


## Animated sunset skyline drawn with simple shapes (cheap on mobile).
class _Skyline extends Control:
	var t := 0.0
	var buildings := []

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var rng := RandomNumberGenerator.new()
		rng.seed = 42
		var x := -40.0
		while x < 2400.0:
			var w := rng.randf_range(60, 150)
			buildings.append({"x": x, "w": w, "h": rng.randf_range(160, 460), "c": rng.randf_range(0.0, 1.0), "seed": rng.randi()})
			x += w + rng.randf_range(4, 20)

	func _process(delta: float) -> void:
		t += delta
		queue_redraw()

	func _draw() -> void:
		var sz := size
		var steps := 24
		for i in steps:
			var f := float(i) / steps
			var c := Color(0.98, 0.55, 0.3).lerp(Color(0.2, 0.18, 0.42), f).lerp(Color(0.95, 0.75, 0.45), 0.0)
			c = Color(0.16, 0.2, 0.45).lerp(Color(0.98, 0.58, 0.35), f)
			draw_rect(Rect2(0, sz.y * f, sz.x, sz.y / steps + 1), c)
		draw_circle(Vector2(sz.x * 0.72, sz.y * 0.62), 90, Color(1.0, 0.86, 0.55, 0.9))
		var off := fmod(t * 12.0, 1200.0)
		for b in buildings:
			var bx: float = b["x"] - off
			if bx < -200:
				bx += 2400
			var h: float = b["h"] * sz.y / 720.0
			var col := Color(0.12, 0.13, 0.25).lerp(Color(0.22, 0.2, 0.36), b["c"])
			draw_rect(Rect2(bx, sz.y - h, b["w"], h), col)
			var rng := RandomNumberGenerator.new()
			rng.seed = b["seed"]
			var wy: float = sz.y - h + 14
			while wy < sz.y - 20:
				var wx: float = bx + 10
				while wx < bx + b["w"] - 14:
					if rng.randf() < 0.45:
						draw_rect(Rect2(wx, wy, 8, 11), Color(1, 0.85, 0.5, 0.85))
					wx += 18
				wy += 24
		draw_rect(Rect2(0, sz.y - 18, sz.x, 18), Color(0.08, 0.08, 0.14))
