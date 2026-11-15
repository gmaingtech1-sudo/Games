class_name UI
extends RefCounted
## Shared UI theme and widget helpers. Everything is sized for touchscreens:
## buttons are at least 64px tall at the 720p design resolution.

const BG := Color(0.07, 0.09, 0.14, 0.94)
const PANEL := Color(0.11, 0.14, 0.21, 0.97)
const CARD := Color(0.16, 0.2, 0.29, 1.0)
const ACCENT := Color(0.18, 0.75, 0.68)
const ACCENT2 := Color(1.0, 0.62, 0.25)
const TEXT := Color(0.95, 0.96, 0.98)
const MUTED := Color(0.66, 0.71, 0.8)
const GOOD := Color(0.35, 0.85, 0.45)
const BAD := Color(0.95, 0.35, 0.35)
const WARN := Color(1.0, 0.8, 0.3)

static var _theme: Theme


static func theme() -> Theme:
	if _theme:
		return _theme
	var t := Theme.new()
	t.default_font_size = 22
	t.set_color("font_color", "Label", TEXT)
	t.set_color("font_color", "Button", TEXT)
	t.set_color("font_hover_color", "Button", TEXT)
	t.set_color("font_pressed_color", "Button", TEXT)
	t.set_color("font_disabled_color", "Button", Color(0.55, 0.58, 0.65))
	t.set_stylebox("normal", "Button", box(Color(0.2, 0.25, 0.36), 14))
	t.set_stylebox("hover", "Button", box(Color(0.25, 0.31, 0.44), 14))
	t.set_stylebox("pressed", "Button", box(ACCENT.darkened(0.25), 14))
	t.set_stylebox("disabled", "Button", box(Color(0.15, 0.17, 0.23), 14))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_stylebox("panel", "Panel", box(PANEL, 18))
	t.set_stylebox("panel", "PanelContainer", box(PANEL, 18))
	t.set_stylebox("normal", "LineEdit", box(Color(0.06, 0.08, 0.12), 10, Color(0.3, 0.36, 0.5), 2))
	t.set_stylebox("focus", "LineEdit", box(Color(0.06, 0.08, 0.12), 10, ACCENT, 2))
	t.set_color("font_color", "LineEdit", TEXT)
	t.set_stylebox("background", "ProgressBar", box(Color(0.05, 0.06, 0.1, 0.9), 6))
	t.set_stylebox("fill", "ProgressBar", box(ACCENT, 6))
	t.set_stylebox("grabber_area", "HSlider", box(ACCENT, 6))
	t.set_stylebox("grabber_area_highlight", "HSlider", box(ACCENT, 6))
	t.set_stylebox("slider", "HSlider", box(Color(0.25, 0.28, 0.36), 6))
	t.set_constant("separation", "VBoxContainer", 10)
	t.set_constant("separation", "HBoxContainer", 10)
	t.set_stylebox("panel", "TooltipPanel", box(PANEL, 8))
	t.set_stylebox("tab_selected", "TabBar", box(ACCENT.darkened(0.2), 10))
	t.set_stylebox("tab_unselected", "TabBar", box(Color(0.18, 0.22, 0.31), 10))
	t.set_stylebox("tab_hovered", "TabBar", box(Color(0.25, 0.3, 0.4), 10))
	var scroll_style := box(Color(1, 1, 1, 0.25), 6)
	t.set_stylebox("grabber", "VScrollBar", scroll_style)
	t.set_stylebox("grabber_highlight", "VScrollBar", scroll_style)
	t.set_stylebox("grabber_pressed", "VScrollBar", scroll_style)
	t.set_stylebox("scroll", "VScrollBar", box(Color(0, 0, 0, 0.15), 6))
	_theme = t
	return t


static func box(color: Color, radius: int = 12, border: Color = Color(0, 0, 0, 0), border_w: int = 0) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	if border_w > 0:
		sb.border_color = border
		sb.set_border_width_all(border_w)
	sb.anti_aliasing = true
	return sb


static func label(text: String, size: int = 22, color: Color = TEXT, align: int = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.horizontal_alignment = align
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


static func button(text: String, cb: Callable = Callable(), min_h: int = 64, color: Color = Color(0, 0, 0, 0)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, min_h)
	b.clip_text = false
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if color.a > 0:
		b.add_theme_stylebox_override("normal", box(color, 14))
		b.add_theme_stylebox_override("hover", box(color.lightened(0.1), 14))
		b.add_theme_stylebox_override("pressed", box(color.darkened(0.2), 14))
	if cb.is_valid():
		b.pressed.connect(cb)
	b.pressed.connect(func(): AudioManager.play_sfx("ui_click"))
	return b


static func vbox(sep: int = 10) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v


static func hbox(sep: int = 10) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h


static func card(color: Color = CARD, radius: int = 14) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(color, radius))
	return p


static func scroll() -> ScrollContainer:
	var s := ScrollContainer.new()
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.size_flags_vertical = Control.SIZE_EXPAND_FILL
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return s


static func spacer(h: int = 0, v: int = 0) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(h, v)
	return c


static func expand(c: Control) -> Control:
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


static func bar(value: float, color: Color, h: int = 16) -> ProgressBar:
	var pb := ProgressBar.new()
	pb.min_value = 0
	pb.max_value = 100
	pb.value = value
	pb.show_percentage = false
	pb.custom_minimum_size = Vector2(0, h)
	pb.add_theme_stylebox_override("fill", box(color, 6))
	return pb


static func clear(node: Node) -> void:
	for c in node.get_children():
		node.remove_child(c)
		c.queue_free()


static func fmt_time(day: int, minute: int) -> String:
	return "Day %d %02d:%02d" % [day, minute / 60, minute % 60]


## A small coloured icon tile for an item: category colour + item initial.
static func item_icon(item_id: String, size: int = 56) -> Control:
	var it := DataDB.item(item_id)
	var p := PanelContainer.new()
	var col := DataDB.category_color(str(it.get("category", "")))
	if it.has("color"):
		col = Color(str(it["color"]))
	p.add_theme_stylebox_override("panel", box(col, 12, Color(1, 1, 1, 0.35), 2))
	p.custom_minimum_size = Vector2(size, size)
	var l := Label.new()
	l.text = ItemGlyph.glyph(item_id)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", int(size * 0.42))
	var lum := col.r * 0.3 + col.g * 0.59 + col.b * 0.11
	l.add_theme_color_override("font_color", Color(0.08, 0.08, 0.1) if lum > 0.62 else Color.WHITE)
	p.add_child(l)
	return p


## A list row: optional icon, title + subtitle, and action buttons on the right.
static func row(title: String, subtitle: String, buttons: Array = [], icon: Control = null, color: Color = CARD) -> PanelContainer:
	var c := card(color, 14)
	var h := hbox(12)
	if icon:
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(icon)
	var v := vbox(2)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(label(title, 21, TEXT))
	if subtitle != "":
		v.add_child(label(subtitle, 16, MUTED))
	h.add_child(v)
	if not buttons.is_empty():
		var bv: BoxContainer = vbox(6) if buttons.size() > 2 else hbox(6)
		bv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for b in buttons:
			b.custom_minimum_size = Vector2(maxf(b.custom_minimum_size.x, 110), 56)
			bv.add_child(b)
		h.add_child(bv)
	c.add_child(h)
	return c


static func small_button(text: String, cb: Callable, color: Color = Color(0, 0, 0, 0)) -> Button:
	var b := button(text, cb, 56, color)
	b.add_theme_font_size_override("font_size", 18)
	return b


static func header(text: String) -> Label:
	var l := label(text, 24, ACCENT)
	return l


## Builds a panel now and rebuilds it whenever the game state changes
## (also when a server result arrives online). Keeps the scroll position.
static func live(container: Control, build: Callable) -> void:
	build.call()
	var pending := [false]
	var rebuild := func():
		if pending[0] or not is_instance_valid(container) or not container.is_inside_tree():
			return
		pending[0] = true
		await container.get_tree().process_frame
		pending[0] = false
		if not is_instance_valid(container) or not container.is_inside_tree():
			return
		var sc := container.get_parent() as ScrollContainer
		var keep := sc.scroll_vertical if sc else 0
		build.call()
		if sc:
			await container.get_tree().process_frame
			if is_instance_valid(sc):
				sc.scroll_vertical = keep
	GameManager.data_changed.connect(rebuild)
	MissionManager.missions_changed.connect(rebuild)
	var cleanup := func():
		if GameManager.data_changed.is_connected(rebuild):
			GameManager.data_changed.disconnect(rebuild)
		if MissionManager.missions_changed.is_connected(rebuild):
			MissionManager.missions_changed.disconnect(rebuild)
	container.tree_exiting.connect(cleanup)


## The nearest Modal above a node (for attaching confirm dialogs).
static func host(n: Node) -> Node:
	var p := n
	while p:
		if p is Modal:
			return p
		p = p.get_parent()
	return n


## Simple confirm dialog. Calls on_yes when confirmed.
static func confirm(parent: Node, text: String, on_yes: Callable, yes_text: String = "Yes") -> Control:
	var shade := ColorRect.new()
	shade.color = Color(0, 0, 0, 0.6)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	var c := card(PANEL, 18)
	c.set_anchors_preset(Control.PRESET_CENTER)
	c.custom_minimum_size = Vector2(520, 0)
	c.position = Vector2(-260, -120)
	var v := vbox(16)
	v.add_child(label(text, 24, TEXT, HORIZONTAL_ALIGNMENT_CENTER))
	var h := hbox(16)
	var no := button("Cancel", func(): shade.queue_free())
	var yes := button(yes_text, func(): shade.queue_free(); on_yes.call(), 64, ACCENT.darkened(0.2))
	expand(no)
	expand(yes)
	h.add_child(no)
	h.add_child(yes)
	v.add_child(h)
	c.add_child(v)
	shade.add_child(c)
	shade.set_meta("is_dialog", true)
	parent.add_child(shade)
	c.reset_size()
	c.position = (shade.get_viewport_rect().size - c.size) * 0.5 if shade.is_inside_tree() else c.position
	return shade
