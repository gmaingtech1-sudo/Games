extends Node
## Central game hub. Owns the player state Dictionary, routes every action
## through ActionRouter (locally, or via the server when playing online),
## processes the resulting events and ticks needs over game time.

signal state_changed          # any change, including needs ticking every game minute
signal data_changed           # only after actions / server results / daily updates (for menus)
signal action_completed(result: Dictionary)
signal notify(text: String, kind: String)
signal game_event(ev: Dictionary)
signal appearance_changed
signal hospitalised
signal collapsed

const MAIN_MENU := "res://scenes/menus/main_menu.tscn"
const CREATOR := "res://scenes/menus/character_creator.tscn"
const WORLD := "res://scenes/main/game_world.tscn"

var state: Dictionary = {}
var in_game := false
var current_slot := 1
var activity := "idle"        # set by the player controller each frame
var at_home := false
var ui_blocking := 0           # >0 while a menu that blocks movement is open
var pending_new_game := {}
var _consequence_cooldown := 0.0
var _last_warning_minute := -999


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	WorldClock.minute_passed.connect(_on_minute)
	WorldClock.day_changed.connect(_on_day)
	WorldClock.weather_changed.connect(func(w): if not state.is_empty(): state["world"]["weather"] = w)
	get_tree().auto_accept_quit = true


# ------------------------------------------------------------------ game flow

func start_new_game(player_name: String, appearance: Dictionary, slot: int = 1, outfit: Dictionary = {}) -> void:
	state = PlayerState.new_state(player_name, appearance)
	# Swap the default starter clothes for the outfit chosen in the creator.
	for slot_name in outfit:
		var id: String = outfit[slot_name]
		var old: String = state["equipped"].get(slot_name, "")
		if id == old:
			continue
		if old != "":
			InventoryRules.remove_item(state, old, 1)
		if id != "" and DataDB.items.has(id):
			InventoryRules.add_item(state, id, 1)
		state["equipped"][slot_name] = id
	current_slot = slot
	_begin()
	PlayerState.add_message(state, "Mum", "Good luck in the big city, love! Get yourself a job and some proper food. x")
	PlayerState.add_message(state, "City Council", "Welcome! New residents can apply for jobs on the Jobs app, and find homes with Aisha Khan Lettings in the city centre.")
	MissionManager.on_new_game()
	SaveManager.save_game(current_slot)
	change_scene(WORLD)


func load_state(s: Dictionary, slot: int) -> void:
	state = s
	current_slot = slot
	_begin()
	MissionManager.on_loaded()
	change_scene(WORLD)


func _begin() -> void:
	in_game = true
	var w: Dictionary = state["world"]
	WorldClock.authoritative = true
	WorldClock.set_time(int(w["day"]), float(w["minute"]), str(w.get("weather", "sunny")))
	WorldClock.running = true
	AchievementManager.sync_from_state()


func quit_to_menu(save: bool = true) -> void:
	if save and in_game and not MultiplayerManager.is_online():
		SaveManager.save_game(current_slot)
	MultiplayerManager.leave()
	in_game = false
	WorldClock.running = false
	ui_blocking = 0
	get_tree().paused = false
	change_scene(MAIN_MENU)


func change_scene(path: String) -> void:
	get_tree().call_deferred("change_scene_to_file", path)


# ------------------------------------------------------------------ actions

## Performs a validated player action. Locally the result is returned and
## processed immediately; online the request goes to the server and the result
## arrives later through action_completed.
func act(action: String, params: Dictionary = {}) -> Dictionary:
	if state.is_empty():
		return {"ok": false, "msg": "No game loaded."}
	if MultiplayerManager.is_online_client() and not (action in ["sleep", "shower"]):
		MultiplayerManager.request_action(action, params, state["needs"].duplicate())
		return {"ok": true, "pending": true, "msg": ""}
	_sync_world_to_state()
	var r := ActionRouter.apply(state, action, params, {})
	_handle_result(r, false)
	return r


## Called by MultiplayerManager with the server's verdict and the new authoritative snapshot.
func apply_server_result(r: Dictionary, snapshot: Dictionary) -> void:
	for k in PlayerState.SERVER_KEYS:
		if snapshot.has(k):
			state[k] = snapshot[k]
	_handle_result(r, true)


func _handle_result(r: Dictionary, from_server: bool) -> void:
	var online := from_server
	for ev in r.get("events", []):
		match ev.get("name", ""):
			"advance_time":
				if not MultiplayerManager.is_online():
					WorldClock.advance(float(ev["minutes"]))
					_sync_world_to_state()
			"needs_delta":
				if online:
					NeedsRules.apply_effects(state, ev.get("delta", {}))
			"appearance_changed":
				appearance_changed.emit()
			"hospitalised":
				if online:
					NeedsRules.apply_effects(state, {"health": 55.0})
				hospitalised.emit()
		game_event.emit(ev)
	if r.has("msg") and str(r["msg"]) != "" and not r.get("quiet", false):
		notify.emit(str(r["msg"]), "good" if r.get("ok", false) else "bad")
		if r.get("ok", false):
			AudioManager.play_sfx("ui_confirm")
		else:
			AudioManager.play_sfx("ui_error")
	action_completed.emit(r)
	state_changed.emit()
	data_changed.emit()


## Client-side gameplay events (visiting places, walking, driving...).
func record_event(ev_name: String, data: Dictionary = {}) -> void:
	var ev := data.duplicate()
	ev["name"] = ev_name
	match ev_name:
		"walk_distance":
			state["stats"]["distance_walked"] = float(state["stats"]["distance_walked"]) + float(data.get("count", 0))
		"drive_distance":
			state["stats"]["distance_driven"] = float(state["stats"]["distance_driven"]) + float(data.get("count", 0))
		"visit":
			var target: String = data.get("id", "")
			if target.begins_with("district:"):
				var dlist: Array = state["stats"]["districts"]
				if not (target in dlist):
					dlist.append(target)
			else:
				var vlist: Array = state["stats"]["visited"]
				if not (target in vlist):
					vlist.append(target)
	game_event.emit(ev)


func toast(text: String, kind: String = "info") -> void:
	notify.emit(text, kind)


# ------------------------------------------------------------------ time & needs

func _sync_world_to_state() -> void:
	if state.is_empty():
		return
	state["world"] = WorldClock.to_dict()


func _on_minute(mins: float) -> void:
	if not in_game or state.is_empty():
		return
	_sync_world_to_state()
	if mins > 0.0:
		var comfort := 0.0
		if at_home:
			var rec := PropertyRules.find(state, state["home"])
			if not rec.is_empty():
				comfort = PropertyRules.comfort(rec) / 3.0
		NeedsRules.tick(state, mins, activity, comfort)
	_check_consequences()
	state_changed.emit()


func _check_consequences() -> void:
	var n: Dictionary = state["needs"]
	var now := PlayerState.now_abs(state)
	if float(n["health"]) <= 0.5 and now - _last_warning_minute > 30:
		_last_warning_minute = now
		var r := act("hospital_revive")
		if r.get("pending", false):
			NeedsRules.apply_effects(state, {"health": 55.0, "energy": 40.0, "hunger": 45.0, "thirst": 45.0})
	elif float(n["energy"]) <= 0.5 and now - _last_warning_minute > 30:
		_last_warning_minute = now
		notify.emit("You collapsed from exhaustion and slept where you fell...", "bad")
		act("sleep", {"place": "bench", "hours": 5})
		collapsed.emit()
	elif now - _last_warning_minute > 90:
		var w := NeedsRules.warnings(state)
		if not w.is_empty():
			_last_warning_minute = now
			notify.emit(w[0], "warn")


func _on_day(_day: int) -> void:
	if not in_game or state.is_empty() or MultiplayerManager.is_online():
		return
	_sync_world_to_state()
	var events := ActionRouter.daily_tick(state)
	var profit := 0
	for ev in events:
		if ev.get("name") == "business_day":
			profit += int(ev["profit"])
		game_event.emit(ev)
	if not state["businesses"].is_empty():
		notify.emit("Day %d. Your businesses made %s yesterday." % [state["world"]["day"], Money.fmt(profit)], "info")
	else:
		notify.emit("Day %d (%s)" % [state["world"]["day"], WorldClock.day_name()], "info")
	MissionManager.refresh_daily()
	state_changed.emit()
	data_changed.emit()
	SaveManager.autosave()


# ------------------------------------------------------------------ helpers

func money_total() -> int:
	return int(state.get("cash", 0)) + int(state.get("bank", 0))


func push_ui() -> void:
	ui_blocking += 1


func pop_ui() -> void:
	ui_blocking = max(0, ui_blocking - 1)


func _notification(what: int) -> void:
	# Save when the app is sent to the background on Android or closed.
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_WM_CLOSE_REQUEST:
		if in_game and not MultiplayerManager.is_online():
			SaveManager.save_game(current_slot, true)
