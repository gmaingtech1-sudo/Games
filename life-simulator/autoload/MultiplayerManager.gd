extends Node
## Online multiplayer over ENet using Godot's high-level multiplayer API.
##
## Architecture (server authoritative):
##  * The server (a dedicated headless server, or the host player's game) keeps
##    an authoritative PlayerState for every connected player ("online profile"),
##    saved in user://server_profiles/.
##  * Clients NEVER change money, inventory, jobs, property, vehicles or
##    businesses themselves. They send request_action(action, params) and the
##    server runs ActionRouter.apply() on its own copy, then replies with the
##    result and a fresh snapshot of the server-owned keys.
##  * Movement is client-driven (sent 10x/sec, unreliable) and relayed.
##  * Chat is relayed by the server with length and rate limits.
##  * World time/weather is the server's clock.
## Single player never touches any of this and works fully offline.

signal status_changed(text: String)
signal players_changed
signal remote_transform(peer_id: int, pos: Vector3, rot_y: float, anim: String, vehicle: String)
signal chat_received(from_name: String, text: String, system: bool)
signal session_ended(reason: String)
signal registered_ok

const DEFAULT_PORT := 24555
const MAX_CLIENTS := 16
const PROFILE_DIR := "user://server_profiles"
const TOKEN_FILE := "user://online_tokens.cfg"
const MAX_CHAT_LEN := 140
const PROTOCOL := 1

enum Mode { OFFLINE, HOST, CLIENT, DEDICATED }

var mode := Mode.OFFLINE
var my_name := ""
var players := {}            # peer_id -> {name, appearance, equipped}
var _profiles := {}          # server: peer_id -> {name, token, state}
var _peer_rate := {}         # server: peer_id -> {t, n, chat_t}
var _req_counter := 0
var _pending_name := ""
var _pending_appearance := {}
var _send_timer := 0.0
var _time_timer := 0.0
var _save_timer := 0.0
var local_transform := {"pos": Vector3.ZERO, "rot": 0.0, "anim": "idle", "vehicle": ""}
var last_error := ""


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)
	WorldClock.day_changed.connect(_on_server_day)


# ------------------------------------------------------------------ queries

func is_online() -> bool:
	return mode != Mode.OFFLINE


func is_server() -> bool:
	return mode == Mode.HOST or mode == Mode.DEDICATED


func is_online_client() -> bool:
	return mode == Mode.CLIENT


func mode_name() -> String:
	return ["Offline", "Host", "Client", "Dedicated server"][mode]


# ------------------------------------------------------------------ start/stop

## Host a game: this device is the server and also plays.
func host_game(player_name: String, appearance: Dictionary, port: int = DEFAULT_PORT) -> bool:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_CLIENTS)
	if err != OK:
		last_error = "Could not open port %d (error %d)." % [port, err]
		status_changed.emit(last_error)
		return false
	multiplayer.multiplayer_peer = peer
	mode = Mode.HOST
	my_name = _clean_name(player_name)
	var prof := _load_or_create_profile(my_name, _get_token("host:" + my_name), appearance)
	_set_token("host:" + my_name, prof["token"])
	_profiles[1] = prof
	players[1] = {"name": my_name, "appearance": prof["state"]["appearance"], "equipped": prof["state"]["equipped"]}
	WorldClock.authoritative = true
	status_changed.emit("Hosting on port %d. Friends join with your IP: %s" % [port, ", ".join(local_addresses())])
	_start_session_game(prof["state"])
	return true


## Run a headless dedicated server (no local player).
func start_dedicated(port: int = DEFAULT_PORT) -> bool:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_CLIENTS)
	if err != OK:
		last_error = "Could not open port %d (error %d)." % [port, err]
		print("[server] ", last_error)
		return false
	multiplayer.multiplayer_peer = peer
	mode = Mode.DEDICATED
	WorldClock.authoritative = true
	WorldClock.set_time(1, 8 * 60)
	WorldClock.running = true
	print("[server] Life Simulator dedicated server listening on UDP port %d" % port)
	return true


func join_game(address: String, player_name: String, appearance: Dictionary, port: int = DEFAULT_PORT) -> bool:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		last_error = "Could not connect (error %d)." % err
		status_changed.emit(last_error)
		return false
	multiplayer.multiplayer_peer = peer
	mode = Mode.CLIENT
	_pending_name = _clean_name(player_name)
	_pending_appearance = appearance
	status_changed.emit("Connecting to %s:%d..." % [address, port])
	return true


func leave() -> void:
	if mode == Mode.OFFLINE:
		return
	if is_server():
		_save_all_profiles()
	var p := multiplayer.multiplayer_peer
	if p:
		p.close()
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
	mode = Mode.OFFLINE
	players.clear()
	_profiles.clear()
	WorldClock.authoritative = true


func _start_session_game(st: Dictionary) -> void:
	GameManager.state = st
	GameManager.current_slot = -1
	GameManager.in_game = true
	var w: Dictionary = st["world"]
	if mode == Mode.HOST:
		WorldClock.set_time(int(w["day"]), float(w["minute"]), str(w.get("weather", "sunny")))
	WorldClock.running = true
	MissionManager.on_loaded()
	AchievementManager.sync_from_state()
	GameManager.change_scene(GameManager.WORLD)


# ------------------------------------------------------------------ process

func _process(delta: float) -> void:
	if mode == Mode.OFFLINE:
		return
	_send_timer += delta
	if _send_timer >= 0.1 and GameManager.in_game and mode != Mode.DEDICATED:
		_send_timer = 0.0
		var t := local_transform
		if mode == Mode.CLIENT and multiplayer.get_unique_id() != 1 and _connected():
			_srv_transform.rpc_id(1, t["pos"], t["rot"], t["anim"], t["vehicle"])
		elif mode == Mode.HOST:
			_relay_transform(1, t["pos"], t["rot"], t["anim"], t["vehicle"])
	if is_server():
		_time_timer += delta
		if _time_timer >= 5.0:
			_time_timer = 0.0
			_cl_world_time.rpc(WorldClock.day, WorldClock.minute, WorldClock.weather)
		_save_timer += delta
		if _save_timer >= 30.0:
			_save_timer = 0.0
			_save_all_profiles()


func _connected() -> bool:
	var p := multiplayer.multiplayer_peer
	return p != null and p.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTED


# ------------------------------------------------------------------ connection events

func _on_peer_connected(id: int) -> void:
	if is_server():
		print("[server] peer connected: ", id)


func _on_peer_disconnected(id: int) -> void:
	if not is_server():
		return
	if _profiles.has(id):
		_save_profile(_profiles[id])
		var nm: String = _profiles[id]["name"]
		_profiles.erase(id)
		players.erase(id)
		_broadcast_system(nm + " left the city.")
		_cl_players.rpc(players)
		players_changed.emit()
	_peer_rate.erase(id)


func _on_connected() -> void:
	status_changed.emit("Connected. Signing in...")
	_srv_register.rpc_id(1, PROTOCOL, _pending_name, _get_token(_pending_name), _pending_appearance)


func _on_connection_failed() -> void:
	last_error = "Could not reach the server."
	status_changed.emit(last_error)
	leave()
	session_ended.emit(last_error)


func _on_server_disconnected() -> void:
	last_error = "Disconnected from server."
	var was_in_game := GameManager.in_game
	leave()
	session_ended.emit(last_error)
	if was_in_game:
		GameManager.toast("Connection to the server was lost.", "bad")
		GameManager.quit_to_menu(false)


# ------------------------------------------------------------------ server: registration

@rpc("any_peer", "call_remote", "reliable")
func _srv_register(protocol: int, player_name: String, token: String, appearance: Dictionary) -> void:
	if not is_server():
		return
	var id := multiplayer.get_remote_sender_id()
	if protocol != PROTOCOL:
		_cl_registered.rpc_id(id, false, "Version mismatch. Update the game.", "", {}, {})
		return
	var nm := _clean_name(player_name)
	if nm == "":
		_cl_registered.rpc_id(id, false, "Invalid name.", "", {}, {})
		return
	for pid in players:
		if players[pid]["name"].to_lower() == nm.to_lower():
			_cl_registered.rpc_id(id, false, "That name is already in the city.", "", {}, {})
			return
	var prof := _load_or_create_profile(nm, str(token), appearance if typeof(appearance) == TYPE_DICTIONARY else {})
	if prof.is_empty():
		_cl_registered.rpc_id(id, false, "That name belongs to another player on this server.", "", {}, {})
		return
	_profiles[id] = prof
	players[id] = {"name": nm, "appearance": prof["state"]["appearance"], "equipped": prof["state"]["equipped"]}
	_cl_registered.rpc_id(id, true, "Welcome to the city, %s!" % nm, prof["token"], _snapshot(prof["state"]),
		{"day": WorldClock.day, "minute": WorldClock.minute, "weather": WorldClock.weather})
	_cl_players.rpc(players)
	players_changed.emit()
	_broadcast_system(nm + " arrived in the city.")
	print("[server] registered ", nm, " as peer ", id)


@rpc("authority", "call_remote", "reliable")
func _cl_registered(ok: bool, msg: String, token: String, snapshot: Dictionary, world: Dictionary) -> void:
	if not ok:
		last_error = msg
		status_changed.emit(msg)
		leave()
		session_ended.emit(msg)
		return
	my_name = _pending_name
	_set_token(my_name, token)
	WorldClock.authoritative = false
	WorldClock.set_time(int(world["day"]), float(world["minute"]), str(world["weather"]))
	var st := PlayerState.new_state(my_name, _pending_appearance)
	for k in PlayerState.SERVER_KEYS:
		if snapshot.has(k):
			st[k] = snapshot[k]
	st["appearance"] = snapshot.get("appearance", st["appearance"])
	var v := PlayerState.validate(st)
	status_changed.emit(msg)
	registered_ok.emit()
	_start_session_game(v["state"])


@rpc("authority", "call_remote", "reliable")
func _cl_players(list: Dictionary) -> void:
	players = list
	players_changed.emit()


# ------------------------------------------------------------------ actions

## Client: ask the server to perform an action.
func request_action(action: String, params: Dictionary, needs: Dictionary) -> void:
	if not _connected():
		GameManager.toast("Not connected to the server.", "bad")
		return
	_req_counter += 1
	_srv_action.rpc_id(1, _req_counter, action, params, needs)


@rpc("any_peer", "call_remote", "reliable")
func _srv_action(req_id: int, action: String, params: Dictionary, needs: Dictionary) -> void:
	if not is_server():
		return
	var id := multiplayer.get_remote_sender_id()
	var r := server_apply(id, action, params, needs)
	if _profiles.has(id):
		_cl_action_result.rpc_id(id, req_id, r, _snapshot(_profiles[id]["state"]))


## Validates and applies an action for a peer on the server. Public for tests.
func server_apply(id: int, action: String, params, needs) -> Dictionary:
	if not _profiles.has(id):
		return {"ok": false, "msg": "Not signed in.", "events": []}
	if not (action in ActionRouter.ACTIONS) or action in ["sleep", "shower"]:
		return {"ok": false, "msg": "Action not allowed.", "events": []}
	if typeof(params) != TYPE_DICTIONARY:
		return {"ok": false, "msg": "Bad request.", "events": []}
	# Rate limit: at most 12 actions per second per player.
	var now := Time.get_ticks_msec()
	var rate: Dictionary = _peer_rate.get(id, {"t": now, "n": 0, "chat_t": 0})
	if now - int(rate["t"]) > 1000:
		rate["t"] = now
		rate["n"] = 0
	rate["n"] = int(rate["n"]) + 1
	_peer_rate[id] = rate
	if int(rate["n"]) > 12:
		return {"ok": false, "msg": "Slow down!", "events": []}
	var st: Dictionary = _profiles[id]["state"]
	# Needs are client-simulated (not valuable) but clamp them anyway.
	if typeof(needs) == TYPE_DICTIONARY and id != 1:
		for n in PlayerState.NEEDS:
			if needs.has(n) and typeof(needs[n]) in [TYPE_INT, TYPE_FLOAT]:
				st["needs"][n] = clampf(float(needs[n]), 0.0, 100.0)
	st["world"] = WorldClock.to_dict()
	var r := ActionRouter.apply(st, action, params, {"now_msec": now})
	if action in ["equip", "unequip"] and r.get("ok", false):
		players[id]["equipped"] = st["equipped"]
		_cl_players.rpc(players)
	return r


@rpc("authority", "call_remote", "reliable")
func _cl_action_result(_req_id: int, r: Dictionary, snapshot: Dictionary) -> void:
	GameManager.apply_server_result(r, snapshot)


func _snapshot(st: Dictionary) -> Dictionary:
	var out := {}
	for k in PlayerState.SERVER_KEYS:
		out[k] = st.get(k)
	out["appearance"] = st["appearance"]
	return out


# ------------------------------------------------------------------ transforms

@rpc("any_peer", "call_remote", "unreliable_ordered")
func _srv_transform(pos: Vector3, rot: float, anim: String, vehicle: String) -> void:
	if not is_server():
		return
	var id := multiplayer.get_remote_sender_id()
	if not _profiles.has(id):
		return
	# Basic sanity check: keep players inside the world bounds.
	if not pos.is_finite() or absf(pos.x) > 3000.0 or absf(pos.z) > 3000.0 or absf(pos.y) > 500.0:
		return
	_relay_transform(id, pos, rot, anim.substr(0, 12), vehicle.substr(0, 16))


func _relay_transform(id: int, pos: Vector3, rot: float, anim: String, vehicle: String) -> void:
	for pid in players:
		if pid != id and pid != 1:
			_cl_transform.rpc_id(pid, id, pos, rot, anim, vehicle)
	if mode == Mode.HOST and id != 1:
		remote_transform.emit(id, pos, rot, anim, vehicle)


@rpc("authority", "call_remote", "unreliable_ordered")
func _cl_transform(id: int, pos: Vector3, rot: float, anim: String, vehicle: String) -> void:
	remote_transform.emit(id, pos, rot, anim, vehicle)


# ------------------------------------------------------------------ chat

func send_chat(text: String) -> void:
	text = text.strip_edges()
	if text == "" or not is_online():
		return
	if is_server():
		_handle_chat(1, text)
	else:
		_srv_chat.rpc_id(1, text)


@rpc("any_peer", "call_remote", "reliable")
func _srv_chat(text: String) -> void:
	if is_server():
		_handle_chat(multiplayer.get_remote_sender_id(), text)


func _handle_chat(id: int, text: String) -> void:
	if not _profiles.has(id) and not (id == 1 and mode == Mode.HOST):
		return
	var now := Time.get_ticks_msec()
	var rate: Dictionary = _peer_rate.get(id, {"t": now, "n": 0, "chat_t": 0})
	if now - int(rate["chat_t"]) < 700:
		return
	rate["chat_t"] = now
	_peer_rate[id] = rate
	var clean := text.strip_edges().substr(0, MAX_CHAT_LEN).replace("[", "(").replace("]", ")")
	var nm: String = players.get(id, {}).get("name", "?")
	_cl_chat.rpc(nm, clean, false)
	if mode == Mode.HOST:
		chat_received.emit(nm, clean, false)
	elif mode == Mode.DEDICATED:
		print("[chat] %s: %s" % [nm, clean])


func _broadcast_system(text: String) -> void:
	_cl_chat.rpc("Server", text, true)
	if mode == Mode.HOST:
		chat_received.emit("Server", text, true)


@rpc("authority", "call_remote", "reliable")
func _cl_chat(from_name: String, text: String, system: bool) -> void:
	chat_received.emit(from_name, text, system)


# ------------------------------------------------------------------ world time

@rpc("authority", "call_remote", "unreliable_ordered")
func _cl_world_time(day: int, minute: float, weather: String) -> void:
	if mode != Mode.CLIENT:
		return
	# Snap only if we drifted, to avoid jitter.
	if day != WorldClock.day or absf(minute - WorldClock.minute) > 4.0 or weather != WorldClock.weather:
		var new_day := day != WorldClock.day
		WorldClock.set_time(day, minute, weather)
		if new_day:
			WorldClock.day_changed.emit(day)


func _on_server_day(_day: int) -> void:
	if not is_server():
		return
	for id in _profiles:
		var st: Dictionary = _profiles[id]["state"]
		st["world"] = WorldClock.to_dict()
		var events := ActionRouter.daily_tick(st)
		if id == 1 and mode == Mode.HOST:
			for ev in events:
				GameManager.game_event.emit(ev)
			GameManager.state_changed.emit()
			GameManager.data_changed.emit()
			MissionManager.refresh_daily()
		else:
			_cl_action_result.rpc_id(id, 0, {"ok": true, "msg": "", "quiet": true, "events": events, "action": "daily"}, _snapshot(st))
	_save_all_profiles()


# ------------------------------------------------------------------ profiles

func _clean_name(n: String) -> String:
	var out := ""
	for c in n.strip_edges():
		if c.is_valid_identifier() or c in " -'0123456789":
			out += c
	return out.strip_edges().substr(0, 16)


func _profile_path(nm: String) -> String:
	return "%s/%s.json" % [PROFILE_DIR, nm.to_lower().sha256_text().substr(0, 24)]


## Loads the profile for a name, or creates one. Returns {} if the token doesn't match.
func _load_or_create_profile(nm: String, token: String, appearance: Dictionary) -> Dictionary:
	DirAccess.make_dir_recursive_absolute(PROFILE_DIR)
	var path := _profile_path(nm)
	if FileAccess.file_exists(path):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
		if typeof(parsed) == TYPE_DICTIONARY and typeof(parsed.get("state")) == TYPE_DICTIONARY:
			if str(parsed.get("token", "")) != token:
				return {}
			var v := PlayerState.validate(parsed["state"])
			if v["ok"]:
				if not appearance.is_empty():
					v["state"]["appearance"] = _safe_appearance(appearance)
				return {"name": nm, "token": token, "state": v["state"]}
	var tok := token
	if tok == "":
		var crypto := Crypto.new()
		tok = crypto.generate_random_bytes(16).hex_encode()
	var st := PlayerState.new_state(nm, _safe_appearance(appearance))
	var prof := {"name": nm, "token": tok, "state": st}
	_save_profile(prof)
	return prof


func _safe_appearance(a: Dictionary) -> Dictionary:
	var out := PlayerState.default_appearance()
	for k in out:
		if a.has(k) and typeof(a[k]) in [TYPE_INT, TYPE_FLOAT, TYPE_STRING]:
			out[k] = a[k]
	return out


func _save_profile(prof: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(PROFILE_DIR)
	var f := FileAccess.open(_profile_path(prof["name"]), FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({"name": prof["name"], "token": prof["token"], "state": prof["state"]}))


func _save_all_profiles() -> void:
	for id in _profiles:
		_save_profile(_profiles[id])


func _get_token(key: String) -> String:
	var cfg := ConfigFile.new()
	cfg.load(TOKEN_FILE)
	return str(cfg.get_value("tokens", key.to_lower().sha256_text(), ""))


func _set_token(key: String, token: String) -> void:
	var cfg := ConfigFile.new()
	cfg.load(TOKEN_FILE)
	cfg.set_value("tokens", key.to_lower().sha256_text(), token)
	cfg.save(TOKEN_FILE)


func local_addresses() -> Array:
	var out := []
	for a in IP.get_local_addresses():
		if a.count(".") == 3 and not a.begins_with("127.") and not a.begins_with("169.254"):
			out.append(a)
	if out.is_empty():
		out.append("127.0.0.1")
	return out
