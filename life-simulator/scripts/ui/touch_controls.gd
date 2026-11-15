class_name TouchControls
extends RefCounted
## Multi-touch friendly on-screen controls. Godot's emulated mouse only follows
## the first finger, so these read InputEventScreenTouch directly, letting you
## hold the joystick and press Jump/Sprint at the same time.


## A round on-screen button.
class TouchBtn extends Control:
	signal pressed
	signal released
	var text := ""
	var color := Color(0.15, 0.2, 0.3, 0.6)
	var is_down := false
	var _index := -99
	var toggle := false
	var toggled_on := false
	var font_size := 20

	func _init(p_text: String = "", diameter: float = 110.0, p_color: Color = Color(0.15, 0.2, 0.3, 0.6)) -> void:
		text = p_text
		color = p_color
		custom_minimum_size = Vector2(diameter, diameter)
		size = custom_minimum_size
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _hit(pos: Vector2) -> bool:
		if not is_visible_in_tree() or GameManager.ui_blocking > 0:
			return false
		var r := get_global_rect()
		return r.get_center().distance_to(pos) <= r.size.x * 0.55

	func _input(event: InputEvent) -> void:
		if event is InputEventScreenTouch:
			if event.pressed and _index == -99 and _hit(event.position):
				_press(event.index)
				get_viewport().set_input_as_handled()
			elif not event.pressed and event.index == _index:
				_release()
				get_viewport().set_input_as_handled()
		elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed and _index == -99 and _hit(event.position):
				_press(-2)
				get_viewport().set_input_as_handled()
			elif not event.pressed and _index == -2:
				_release()

	func _press(i: int) -> void:
		_index = i
		is_down = true
		if toggle:
			toggled_on = not toggled_on
		pressed.emit()
		Settings.vibrate(15)
		queue_redraw()

	func _release() -> void:
		_index = -99
		is_down = false
		released.emit()
		queue_redraw()

	func force_release() -> void:
		if is_down:
			_release()

	func set_text(t: String) -> void:
		text = t
		queue_redraw()

	func _notification(what: int) -> void:
		if what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree():
			force_release()

	func _draw() -> void:
		var c := size * 0.5
		var r := minf(size.x, size.y) * 0.5
		var col := color.lightened(0.25) if (is_down or (toggle and toggled_on)) else color
		draw_circle(c, r, col)
		draw_arc(c, r - 2, 0, TAU, 40, Color(1, 1, 1, 0.55), 3.0, true)
		var font := get_theme_default_font()
		var lines := text.split("\n")
		var lh := font_size + 2
		var y0 := c.y - (lines.size() - 1) * lh * 0.5 + font_size * 0.35
		for i in lines.size():
			var w := font.get_string_size(lines[i], HORIZONTAL_ALIGNMENT_CENTER, -1, font_size).x
			draw_string(font, Vector2(c.x - w * 0.5, y0 + i * lh), lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color.WHITE)


## Floating virtual joystick: touch anywhere in its zone and drag.
class Joystick extends Control:
	var value := Vector2.ZERO
	var radius := 85.0
	var _index := -99
	var _origin := Vector2.ZERO
	var _knob := Vector2.ZERO
	var zone := Rect2()

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _rest_center() -> Vector2:
		return Vector2(radius + 50, get_viewport_rect().size.y - radius - 50)

	func _zone() -> Rect2:
		var vp := get_viewport_rect().size
		return Rect2(0, vp.y * 0.35, vp.x * 0.38, vp.y * 0.65)

	func _input(event: InputEvent) -> void:
		if not is_visible_in_tree():
			return
		if event is InputEventScreenTouch:
			if event.pressed and _index == -99 and _zone().has_point(event.position) and GameManager.ui_blocking == 0:
				_begin(event.index, event.position)
				get_viewport().set_input_as_handled()
			elif not event.pressed and event.index == _index:
				_end()
		elif event is InputEventScreenDrag and event.index == _index:
			_move(event.position)
			get_viewport().set_input_as_handled()

	func _begin(i: int, p: Vector2) -> void:
		_index = i
		_origin = p
		_knob = p

	func _move(p: Vector2) -> void:
		var d := p - _origin
		var r := radius * float(Settings.get_value("joystick_size", 1.0))
		if d.length() > r:
			d = d.normalized() * r
		_knob = _origin + d
		value = d / r
		queue_redraw()

	func _end() -> void:
		_index = -99
		value = Vector2.ZERO
		queue_redraw()

	func release() -> void:
		_end()

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var r := radius * float(Settings.get_value("joystick_size", 1.0))
		var o := _origin if _index != -99 else _rest_center()
		var k := _knob if _index != -99 else o
		draw_circle(o, r, Color(0.1, 0.12, 0.2, 0.35))
		draw_arc(o, r, 0, TAU, 48, Color(1, 1, 1, 0.4), 3.0, true)
		draw_circle(k, r * 0.42, Color(1, 1, 1, 0.55 if _index != -99 else 0.3))
