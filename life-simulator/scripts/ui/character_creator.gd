extends Control
## Character creator: name, gender presentation, hair, hair colour, skin,
## eyes and a free starter outfit, with a live rotating 3D preview.

const TOPS := ["tshirt_white", "tshirt_blue", "hoodie_grey"]
const BOTTOMS := ["joggers_grey", "jeans_blue", "skirt_navy", "shorts_khaki"]
const SHOES := ["trainers_basic", "trainers_white"]
const ACCESSORIES := ["", "cap_red", "glasses", "beanie"]
const EYES := ["#3a2a1a", "#2f6db5", "#3f8a4f", "#6b6b6b", "#8a5a2b"]

var appearance := PlayerState.default_appearance()
var outfit := {"top": "tshirt_white", "bottom": "joggers_grey", "shoes": "trainers_basic", "accessory": ""}
var model: CharacterModel
var pivot: Node3D
var name_edit: LineEdit
var options: VBoxContainer
var _drag := false


func _ready() -> void:
	theme = UI.theme()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	AudioManager.play_music("menu")
	var bg := ColorRect.new()
	bg.color = Color(0.09, 0.11, 0.17)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var root := HBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 20
	root.offset_right = -20
	root.offset_top = 16
	root.offset_bottom = -16
	root.add_theme_constant_override("separation", 20)
	add_child(root)

	# --- 3D preview
	var svc := SubViewportContainer.new()
	svc.stretch = true
	svc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	svc.size_flags_stretch_ratio = 0.9
	svc.gui_input.connect(_on_preview_input)
	root.add_child(svc)
	var sv := SubViewport.new()
	sv.own_world_3d = true
	sv.transparent_bg = false
	sv.msaa_3d = Viewport.MSAA_2X
	svc.add_child(sv)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.16, 0.2, 0.3)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.7, 0.75, 0.85)
	e.ambient_light_energy = 0.6
	env.environment = e
	sv.add_child(env)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-35, 30, 0)
	light.light_energy = 1.2
	light.shadow_enabled = true
	sv.add_child(light)
	var cam := Camera3D.new()
	cam.position = Vector3(0, 1.15, 3.1)
	cam.rotation_degrees = Vector3(-6, 0, 0)
	cam.fov = 42
	sv.add_child(cam)
	var floor_mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.9
	cyl.bottom_radius = 0.9
	cyl.height = 0.06
	floor_mi.mesh = cyl
	floor_mi.position.y = -0.03
	floor_mi.material_override = CharacterModel.mat(Color(0.25, 0.3, 0.42))
	sv.add_child(floor_mi)
	pivot = Node3D.new()
	sv.add_child(pivot)
	model = CharacterModel.new()
	pivot.add_child(model)

	# --- options
	var panel := UI.card(UI.PANEL, 20)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(panel)
	var col := UI.vbox(10)
	panel.add_child(col)
	col.add_child(UI.label("Create Your Character", 32))
	var sc := UI.scroll()
	col.add_child(sc)
	options = UI.vbox(12)
	options.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(options)
	var bottom := UI.hbox(12)
	bottom.add_child(UI.expand(UI.button("Back", _on_back, 64)))
	var start := UI.button("Start My Life  ▶", _on_start, 64, UI.ACCENT.darkened(0.2))
	UI.expand(start)
	start.size_flags_stretch_ratio = 2.0
	bottom.add_child(start)
	col.add_child(bottom)

	name_edit = LineEdit.new()
	name_edit.placeholder_text = "Character name"
	name_edit.max_length = 16
	name_edit.text = ["Alex", "Jordan", "Sam", "Charlie", "Riley", "Morgan"][randi() % 6]
	name_edit.custom_minimum_size = Vector2(0, 60)
	_build_options()
	_refresh()


func _build_options() -> void:
	UI.clear(options)
	options.add_child(UI.label("Name", 20, UI.MUTED))
	if name_edit.get_parent():
		name_edit.get_parent().remove_child(name_edit)
	options.add_child(name_edit)
	_choice_row("Gender presentation", [["Masculine", "masc"], ["Feminine", "fem"], ["Neutral", "neutral"]], appearance["body"], func(v): appearance["body"] = v)
	_stepper("Hair style", CharacterModel.HAIR_STYLES, int(appearance["hair"]), func(i): appearance["hair"] = i)
	_swatches("Hair colour", CharacterModel.HAIR_COLORS, str(appearance["hair_color"]), func(c): appearance["hair_color"] = c)
	_swatches("Skin tone", CharacterModel.SKIN_TONES, CharacterModel.SKIN_TONES[int(appearance["skin"])], func(c): appearance["skin"] = CharacterModel.SKIN_TONES.find(c))
	_swatches("Eye colour", EYES, str(appearance.get("eyes", EYES[0])), func(c): appearance["eyes"] = c)
	_item_row("Top", TOPS, "top")
	_item_row("Bottoms", BOTTOMS, "bottom")
	_item_row("Shoes", SHOES, "shoes")
	_item_row("Accessory", ACCESSORIES, "accessory")
	options.add_child(UI.label("Drag the preview to turn your character. You can buy more clothes in the city.", 16, UI.MUTED))


func _choice_row(title: String, choices: Array, current: String, setter: Callable) -> void:
	options.add_child(UI.label(title, 20, UI.MUTED))
	var h := UI.hbox(8)
	for ch in choices:
		var b := UI.button(ch[0], func(): setter.call(ch[1]); _build_options(); _refresh(), 56)
		if ch[1] == current:
			b.add_theme_stylebox_override("normal", UI.box(UI.ACCENT.darkened(0.25), 14))
		UI.expand(b)
		h.add_child(b)
	options.add_child(h)


func _stepper(title: String, names: Array, current: int, setter: Callable) -> void:
	options.add_child(UI.label(title, 20, UI.MUTED))
	var h := UI.hbox(8)
	var prev := UI.button("◀", func(): setter.call(posmod(current - 1, names.size())); _build_options(); _refresh(), 56)
	prev.custom_minimum_size = Vector2(80, 56)
	var lbl := UI.label(names[current], 22, UI.TEXT, HORIZONTAL_ALIGNMENT_CENTER)
	UI.expand(lbl)
	var nxt := UI.button("▶", func(): setter.call(posmod(current + 1, names.size())); _build_options(); _refresh(), 56)
	nxt.custom_minimum_size = Vector2(80, 56)
	h.add_child(prev)
	h.add_child(lbl)
	h.add_child(nxt)
	options.add_child(h)


func _swatches(title: String, colors: Array, current: String, setter: Callable) -> void:
	options.add_child(UI.label(title, 20, UI.MUTED))
	var g := GridContainer.new()
	g.columns = 8
	g.add_theme_constant_override("h_separation", 8)
	g.add_theme_constant_override("v_separation", 8)
	for c in colors:
		var b := Button.new()
		b.custom_minimum_size = Vector2(54, 54)
		var sel: bool = str(c).to_lower() == current.to_lower()
		b.add_theme_stylebox_override("normal", UI.box(Color(c), 27, Color.WHITE if sel else Color(0, 0, 0, 0.4), 4 if sel else 2))
		b.add_theme_stylebox_override("hover", UI.box(Color(c).lightened(0.1), 27, Color.WHITE, 2))
		b.add_theme_stylebox_override("pressed", UI.box(Color(c), 27, UI.ACCENT, 4))
		b.pressed.connect(func(): setter.call(c); AudioManager.play_sfx("ui_click"); _build_options(); _refresh())
		g.add_child(b)
	options.add_child(g)


func _item_row(title: String, ids: Array, slot: String) -> void:
	options.add_child(UI.label(title, 20, UI.MUTED))
	var h := UI.hbox(8)
	for id in ids:
		var text: String = "None" if id == "" else DataDB.item_name(id)
		var b := UI.button(text, func(): outfit[slot] = id; _build_options(); _refresh(), 56)
		if outfit[slot] == id:
			b.add_theme_stylebox_override("normal", UI.box(UI.ACCENT.darkened(0.25), 14))
		b.add_theme_font_size_override("font_size", 17)
		UI.expand(b)
		h.add_child(b)
	options.add_child(h)


func _refresh() -> void:
	model.setup(appearance, outfit)


func _process(delta: float) -> void:
	if model:
		model.animate(delta, 0.0, "idle")
	if not _drag and pivot:
		pivot.rotation.y += delta * 0.4


func _on_preview_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or event is InputEventMouseButton:
		_drag = event.pressed
	elif event is InputEventScreenDrag or (event is InputEventMouseMotion and _drag):
		pivot.rotation.y += event.relative.x * 0.01


func _on_back() -> void:
	GameManager.change_scene(GameManager.MAIN_MENU)


func _on_start() -> void:
	var nm := name_edit.text.strip_edges()
	if nm == "":
		GameManager.toast("Please enter a name.", "bad")
		name_edit.grab_focus()
		return
	var slot: int = GameManager.pending_new_game.get("slot", 1)
	GameManager.start_new_game(nm, appearance, slot, outfit)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_on_back()
