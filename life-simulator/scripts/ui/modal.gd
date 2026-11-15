class_name Modal
extends Control
## Full-screen modal window with a title bar and a close button.
## Modals are in the "modal" group so the Android back button closes the top one.

signal closed

var body: VBoxContainer
var title_label: Label
var panel: PanelContainer
var blocks_game := true


static func open(parent: Node, title: String, width: float = 900.0, height: float = 620.0, block: bool = true) -> Modal:
	var m := Modal.new()
	m.blocks_game = block
	m._build(title, width, height)
	parent.add_child(m)
	return m


func _build(title: String, width: float, height: float) -> void:
	name = "Modal"
	add_to_group("modal")
	theme = UI.theme()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(0, 0, 0, 0.55)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	panel = UI.card(UI.PANEL, 20)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(width, height)
	panel.size = Vector2(width, height)
	panel.position = -Vector2(width, height) * 0.5
	panel.anchor_left = 0.5
	panel.anchor_top = 0.5
	panel.anchor_right = 0.5
	panel.anchor_bottom = 0.5
	panel.offset_left = -width * 0.5
	panel.offset_right = width * 0.5
	panel.offset_top = -height * 0.5
	panel.offset_bottom = height * 0.5
	add_child(panel)
	var outer := UI.vbox(12)
	panel.add_child(outer)
	var top := UI.hbox(10)
	title_label = UI.label(title, 30, UI.TEXT)
	UI.expand(title_label)
	top.add_child(title_label)
	var close_btn := UI.button("✕", close, 56, Color(0.35, 0.2, 0.24))
	close_btn.custom_minimum_size = Vector2(64, 56)
	top.add_child(close_btn)
	outer.add_child(top)
	body = UI.vbox(10)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_child(body)


func _ready() -> void:
	# Fit inside small screens.
	var vp := get_viewport_rect().size
	var w := minf(panel.custom_minimum_size.x, vp.x - 24.0)
	var h := minf(panel.custom_minimum_size.y, vp.y - 24.0)
	panel.custom_minimum_size = Vector2(w, h)
	panel.offset_left = -w * 0.5
	panel.offset_right = w * 0.5
	panel.offset_top = -h * 0.5
	panel.offset_bottom = h * 0.5
	if blocks_game:
		GameManager.push_ui()


func close() -> void:
	if is_queued_for_deletion():
		return
	if blocks_game:
		GameManager.pop_ui()
	closed.emit()
	queue_free()


## Returns a scroll container filling the body with a VBox inside.
func scroll_list(sep: int = 10) -> VBoxContainer:
	var sc := UI.scroll()
	var v := UI.vbox(sep)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	body.add_child(sc)
	return v


## Closes the top-most modal in the tree. Returns true if one was closed.
static func close_top(tree: SceneTree) -> bool:
	var mods := tree.get_nodes_in_group("modal")
	for i in range(mods.size() - 1, -1, -1):
		var m = mods[i]
		if is_instance_valid(m) and not m.is_queued_for_deletion() and m.is_visible_in_tree():
			m.close()
			return true
	return false


static func close_all(tree: SceneTree) -> void:
	for m in tree.get_nodes_in_group("modal"):
		if is_instance_valid(m) and not m.is_queued_for_deletion():
			m.close()
