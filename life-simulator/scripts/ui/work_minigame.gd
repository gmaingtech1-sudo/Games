class_name WorkMinigame
extends Control
## Short job activities that decide your shift performance (and pay):
##  * tap      - tap the targets before they vanish (shop assistant, cleaner, security)
##  * sequence - memorise and repeat a sequence (mechanic, office worker)
##  * choice   - answer quick job scenarios (doctor, business manager)

const ROUND_TIME := 25.0
const SCENARIOS := {
	"doctor": [
		["A patient has a high fever and a cough.", ["Prescribe rest, fluids and paracetamol", "Send them home without advice", "Perform surgery"], 0],
		["A child has a sprained ankle.", ["Ice, rest and a support bandage", "Ignore it", "Prescribe antibiotics"], 0],
		["A patient's blood pressure is very high.", ["Start treatment and monitor", "Tell them to drink coffee", "Discharge immediately"], 0],
		["Someone arrives with chest pain.", ["Run an ECG straight away", "Ask them to wait 3 hours", "Give them a sandwich"], 0],
		["A patient is allergic to penicillin.", ["Choose a different antibiotic", "Give penicillin anyway", "Double the dose"], 0],
		["A runner is dehydrated.", ["Give oral fluids or a drip", "Tell them to run more", "Prescribe salt tablets only"], 0],
		["A patient needs stitches.", ["Clean the wound and stitch it", "Use sticky tape", "Leave it open"], 0],
	],
	"business_manager": [
		["Sales are down 10% this quarter.", ["Launch a targeted marketing campaign", "Fire everyone", "Do nothing"], 0],
		["A key client is unhappy.", ["Meet them and fix the problem", "Ignore their emails", "Raise their prices"], 0],
		["Your team is overworked.", ["Hire extra staff and rebalance work", "Cancel all holidays", "Add more meetings"], 0],
		["A supplier raises prices.", ["Negotiate or find another supplier", "Accept without question", "Stop selling products"], 0],
		["You have spare budget.", ["Invest in training and equipment", "Spend it on a party", "Hide it"], 0],
		["A competitor copies your product.", ["Innovate and improve quality", "Copy them back", "Close the company"], 0],
	],
}
const TAP_WORDS := {
	"shop_assistant": ["Stock the shelves!", ["Milk", "Bread", "Eggs", "Apples", "Cheese", "Juice", "Rice", "Pasta"]],
	"cleaner": ["Clean up the mess!", ["Spill", "Dust", "Mud", "Crumbs", "Stain", "Litter"]],
	"security_guard": ["Spot the suspicious activity!", ["Intruder", "Open door", "Alarm", "Suspect", "Broken lock"]],
}

var job: Dictionary
var on_done: Callable
var score := 0
var attempts := 0
var time_left := ROUND_TIME
var area: Control
var status: Label
var _spawn_t := 0.0
var _rng := RandomNumberGenerator.new()
var _seq: Array = []
var _seq_input: Array = []
var _seq_round := 0
var _seq_buttons: Array = []
var _seq_showing := false
var _q_index := 0
var _questions: Array = []
var finished := false


static func open(parent: Node, p_job: Dictionary, done: Callable) -> void:
	var m := Modal.open(parent, "Work: " + str(p_job["name"]), 900, 620)
	var g := WorkMinigame.new()
	g.job = p_job
	g.on_done = done
	g.size_flags_vertical = Control.SIZE_EXPAND_FILL
	g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.body.add_child(g)
	m.closed.connect(func(): if not g.finished: GameManager.toast("You left your shift early - no pay.", "warn"))


func _ready() -> void:
	_rng.randomize()
	var v := UI.vbox(8)
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(v)
	status = UI.label("", 20, UI.ACCENT2)
	v.add_child(status)
	area = Control.new()
	area.size_flags_vertical = Control.SIZE_EXPAND_FILL
	area.clip_contents = true
	v.add_child(area)
	match job["activity"]:
		"tap":
			pass
		"sequence":
			_setup_sequence()
		"choice":
			_setup_choice()


func _process(delta: float) -> void:
	if finished:
		return
	time_left -= delta
	match job["activity"]:
		"tap":
			_spawn_t -= delta
			if _spawn_t <= 0.0:
				_spawn_t = _rng.randf_range(0.55, 0.95)
				_spawn_target()
			status.text = "%s  •  Time %ds  •  Score %d/%d" % [TAP_WORDS.get(job["id"], ["Work fast!"])[0], int(maxf(time_left, 0)), score, attempts]
		"sequence":
			status.text = "Repeat the sequence  •  Round %d/4  •  Time %ds" % [_seq_round + 1, int(maxf(time_left, 0))]
		"choice":
			status.text = "Question %d/%d  •  Time %ds" % [mini(_q_index + 1, _questions.size()), _questions.size(), int(maxf(time_left, 0))]
	if time_left <= 0.0:
		_finish()


# ------------------------------------------------------------------ tap

func _spawn_target() -> void:
	if area.size.x < 100:
		return
	attempts += 1
	var words: Array = TAP_WORDS.get(job["id"], ["", ["Task"]])[1]
	var b := UI.button(words[_rng.randi_range(0, words.size() - 1)], Callable(), 84, Color(0.2, 0.55, 0.45))
	b.custom_minimum_size = Vector2(150, 84)
	b.position = Vector2(_rng.randf_range(10, area.size.x - 170), _rng.randf_range(10, area.size.y - 100))
	area.add_child(b)
	var on_tap := func():
		score += 1
		AudioManager.play_sfx("ui_confirm", 1.2, -6.0)
		b.queue_free()
	b.pressed.connect(on_tap)
	var tw := b.create_tween()
	tw.tween_interval(1.6)
	tw.tween_property(b, "modulate:a", 0.0, 0.3)
	tw.tween_callback(b.queue_free)


# ------------------------------------------------------------------ sequence

func _setup_sequence() -> void:
	var names := ["Spanner", "Jack", "Oil", "Tyre", "Battery", "Filter"] if job["id"] == "mechanic" else ["Email", "Report", "Call", "Meeting", "Invoice", "Filing"]
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	grid.set_anchors_preset(Control.PRESET_CENTER)
	grid.position = Vector2(-300, -110)
	for i in names.size():
		var b := UI.button(names[i], func(): _seq_press(i), 90, Color(0.22, 0.32, 0.5))
		b.custom_minimum_size = Vector2(190, 90)
		grid.add_child(b)
		_seq_buttons.append(b)
	area.add_child(grid)
	area.resized.connect(func(): grid.position = (area.size - grid.get_combined_minimum_size()) * 0.5)
	time_left = 45.0
	call_deferred("_next_seq_round")


func _next_seq_round() -> void:
	_seq_input.clear()
	_seq.append(_rng.randi_range(0, _seq_buttons.size() - 1))
	if _seq.size() < 3:
		_seq.append(_rng.randi_range(0, _seq_buttons.size() - 1))
	_seq_showing = true
	for b in _seq_buttons:
		b.disabled = true
	await get_tree().create_timer(0.5).timeout
	for idx in _seq:
		if finished or not is_inside_tree():
			return
		var b: Button = _seq_buttons[idx]
		b.modulate = Color(2.0, 2.0, 0.6)
		AudioManager.play_sfx("ui_click", 1.0 + idx * 0.1)
		await get_tree().create_timer(0.45).timeout
		if not is_inside_tree():
			return
		b.modulate = Color.WHITE
		await get_tree().create_timer(0.15).timeout
	_seq_showing = false
	for b in _seq_buttons:
		b.disabled = false


func _seq_press(i: int) -> void:
	if _seq_showing or finished:
		return
	attempts += 1
	var expect: int = _seq[_seq_input.size()]
	if i == expect:
		score += 1
		_seq_input.append(i)
		if _seq_input.size() == _seq.size():
			_seq_round += 1
			AudioManager.play_sfx("ui_confirm")
			if _seq_round >= 4:
				_finish()
			else:
				_next_seq_round()
	else:
		AudioManager.play_sfx("ui_error")
		_seq_input.clear()
		_seq_round += 1
		if _seq_round >= 4:
			_finish()
		else:
			_seq = _seq.slice(0, maxi(2, _seq.size() - 1))
			_next_seq_round()


# ------------------------------------------------------------------ choice

func _setup_choice() -> void:
	var pool: Array = SCENARIOS.get(job["id"], SCENARIOS["business_manager"]).duplicate()
	pool.shuffle()
	_questions = pool.slice(0, 5)
	time_left = 40.0
	_show_question()


func _show_question() -> void:
	UI.clear(area)
	if _q_index >= _questions.size():
		_finish()
		return
	var q: Array = _questions[_q_index]
	var v := UI.vbox(12)
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.add_child(UI.label(q[0], 26))
	var opts := []
	for i in q[1].size():
		opts.append([q[1][i], i == q[2]])
	opts.shuffle()
	for o in opts:
		var correct: bool = o[1]
		var on_answer := func():
			attempts += 1
			if correct:
				score += 1
				AudioManager.play_sfx("ui_confirm")
			else:
				AudioManager.play_sfx("ui_error")
			_q_index += 1
			_show_question.call_deferred()
		v.add_child(UI.button(o[0], on_answer, 72))
	area.add_child(v)


# ------------------------------------------------------------------ finish

func _finish() -> void:
	if finished:
		return
	finished = true
	var perf := 0.0
	match job["activity"]:
		"tap":
			perf = clampf(float(score) / maxf(1.0, float(attempts) * 0.85), 0.0, 1.0)
		"sequence":
			perf = clampf(float(_seq_round_successes()) / 4.0 * 0.5 + float(score) / maxf(1.0, float(attempts)) * 0.5, 0.0, 1.0)
		"choice":
			perf = clampf(float(score) / maxf(1.0, float(_questions.size())), 0.0, 1.0)
	var parent_modal := get_parent()
	while parent_modal and not (parent_modal is Modal):
		parent_modal = parent_modal.get_parent()
	if parent_modal:
		parent_modal.close()
	on_done.call(perf)


func _seq_round_successes() -> int:
	return clampi(score / 3, 0, 4)
