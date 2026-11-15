extends Node
## Multiplayer integration test client. Started by tools/run_net_test.sh:
##   godot --headless --path . res://scenes/tests/net_client_test.tscn -- --role a --port 24600 --name Alice123
## Role "a" checks server-side validation; role "b" checks it sees A's chat and movement.

var role := "a"
var port := 24600
var my_name := "Tester"
var passed := 0
var failed := 0
var _last_result := {}
var _chat := []
var _transforms := {}


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		match args[i]:
			"--role":
				role = args[i + 1]
			"--port":
				port = int(args[i + 1])
			"--name":
				my_name = args[i + 1]
	await get_tree().process_frame
	var dummy := Node.new()
	get_tree().root.add_child(dummy)
	get_tree().current_scene = dummy
	SaveManager.save_dir = "user://net_test_saves"
	GameManager.action_completed.connect(func(r): _last_result = r)
	MultiplayerManager.chat_received.connect(func(f, t, sys): _chat.append([f, t, sys]))
	MultiplayerManager.remote_transform.connect(func(pid, pos, rot, anim, v): _transforms[pid] = pos)
	var ok := await run()
	print("[%s] RESULT %d passed, %d failed" % [role, passed, failed])
	MultiplayerManager.leave()
	get_tree().quit(0 if failed == 0 and ok else 1)


func check(cond: bool, what: String) -> void:
	if cond:
		passed += 1
		print("[%s] PASS %s" % [role, what])
	else:
		failed += 1
		print("[%s] FAIL %s" % [role, what])


func wait_until(cond: Callable, timeout: float) -> bool:
	var t := 0.0
	while t < timeout:
		if cond.call():
			return true
		await get_tree().process_frame
		t += get_process_delta_time()
	return cond.call()


func act_and_wait(action: String, params: Dictionary) -> Dictionary:
	_last_result = {}
	GameManager.act(action, params)
	await wait_until(func(): return not _last_result.is_empty() and _last_result.get("action", "") == action, 5.0)
	return _last_result


func run() -> bool:
	if role == "host":
		return await run_host()
	var joined := [false]
	MultiplayerManager.registered_ok.connect(func(): joined[0] = true)
	check(MultiplayerManager.join_game("127.0.0.1", my_name, {"body": "fem", "hair": 2}, port), "join_game started")
	await wait_until(func(): return joined[0], 15.0)
	check(joined[0], "registered with the dedicated server")
	if not joined[0]:
		return false
	check(MultiplayerManager.is_online_client(), "client mode")
	await wait_until(func(): return GameManager.in_game, 5.0)
	check(int(GameManager.state["cash"]) == 100000, "server gave a fresh profile with £1,000")
	if role == "a":
		await test_validation()
	await test_social()
	return true


## Host mode: this process is both server and player.
func run_host() -> bool:
	check(MultiplayerManager.host_game(my_name, {"body": "masc"}, port), "host_game opened the port")
	await wait_until(func(): return GameManager.in_game, 5.0)
	check(MultiplayerManager.is_server() and not MultiplayerManager.is_online_client(), "host is the server")
	# Host acts locally on its authoritative profile.
	var r := GameManager.act("buy_item", {"id": "water", "qty": 1, "shop": "supermarket"})
	check(r.get("ok", false), "host purchase applied locally")
	var got_player := await wait_until(func(): return MultiplayerManager.players.size() >= 2, 25.0)
	check(got_player, "a client joined the host")
	var got_chat := await wait_until(func():
		for c in _chat:
			if str(c[1]).begins_with("hello from"):
				return true
		return false, 20.0)
	check(got_chat, "host received client chat")
	MultiplayerManager.send_chat("hello from host")
	var got_tf := await wait_until(func(): return not _transforms.is_empty(), 15.0)
	check(got_tf, "host received client movement")
	await get_tree().create_timer(5.0).timeout
	return true


func test_validation() -> void:
	var s := GameManager.state
	# A modified client: pretend to be rich, then try to buy a piano.
	s["cash"] = 999999999
	var r := await act_and_wait("buy_item", {"id": "piano", "qty": 1, "shop": "furniture"})
	check(not r.get("ok", true), "server rejects purchase the real wallet can't afford")
	check(int(GameManager.state["cash"]) == 100000, "server snapshot overwrote the forged cash")
	r = await act_and_wait("buy_item", {"id": "sandwich", "qty": 1, "shop": "supermarket"})
	check(r.get("ok", false), "valid purchase accepted by server")
	check(int(GameManager.state["cash"]) == 100000 - 350, "server deducted the price")
	check(InventoryRules.count(GameManager.state, "sandwich") == 3, "item added by server")
	r = await act_and_wait("buy_item", {"id": "sandwich", "qty": 1, "shop": "tech"})
	check(not r.get("ok", true), "wrong-shop purchase rejected")
	r = await act_and_wait("withdraw", {"amount": 500000})
	check(not r.get("ok", true), "withdraw beyond balance rejected")
	r = await act_and_wait("deposit", {"amount": 20000})
	check(r.get("ok", false) and int(GameManager.state["bank"]) == 20000, "deposit processed by server")
	# Forged inventory: local-only item must disappear after the next server snapshot.
	InventoryRules.add_item(GameManager.state, "gold_chain", 1)
	r = await act_and_wait("use_item", {"id": "gold_chain"})
	check(not r.get("ok", true), "server rejects using an item the client forged")
	check(InventoryRules.count(GameManager.state, "gold_chain") == 0, "forged item removed by snapshot")
	r = await act_and_wait("claim_mission", {"id": "side_saver"})
	check(r.get("ok", false), "first mission claim accepted")
	r = await act_and_wait("claim_mission", {"id": "side_saver"})
	check(not r.get("ok", true), "duplicate mission claim rejected")
	r = await act_and_wait("give_me_money", {})
	check(not r.get("ok", true), "unknown action rejected")
	r = await act_and_wait("race_result", {"position": 1, "seconds": 1.0})
	check(not r.get("ok", true), "race result without an active race rejected")
	r = await act_and_wait("work_shift", {"perf": 1.0})
	check(not r.get("ok", true), "work shift without a job rejected")


func test_social() -> void:
	# Both clients chat and move; each must see the other.
	await get_tree().create_timer(1.0).timeout
	MultiplayerManager.send_chat("hello from " + role)
	var other := "b" if role == "a" else ("host" if role == "c" else "a")
	var got_chat := await wait_until(func():
		for c in _chat:
			if str(c[1]) == "hello from " + other:
				return true
		return false, 20.0)
	check(got_chat, "received chat from the other player")
	var got_tf := await wait_until(func(): return not _transforms.is_empty(), 15.0)
	check(got_tf, "received the other player's movement")
	check(MultiplayerManager.players.size() >= 2, "player list has both players (%d)" % MultiplayerManager.players.size())
	# Stay connected long enough for the other client to finish.
	await get_tree().create_timer(4.0).timeout
