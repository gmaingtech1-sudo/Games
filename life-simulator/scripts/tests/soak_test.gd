extends Node
## Soak test: runs the world at 10x speed for a while with the player wandering,
## to catch runtime errors in routines, traffic, needs, day rollover and autosave.
##   godot --headless --path . res://scenes/tests/soak_test.tscn

func _ready() -> void:
	await get_tree().process_frame
	var dummy := Node.new()
	get_tree().root.add_child(dummy)
	get_tree().current_scene = dummy
	SaveManager.save_dir = "user://soak_saves"
	GameManager.start_new_game("Soak", {}, 1)
	await get_tree().create_timer(1.0).timeout
	var w := get_tree().current_scene
	var s := GameManager.state
	s["bank"] = 50000000
	GameManager.act("buy_business", {"id": "restaurant"})
	GameManager.act("rent_property", {"id": "studio_1"})
	GameManager.act("apply_job", {"id": "shop_assistant"})
	Engine.time_scale = 10.0
	var start_day := WorldClock.day
	var t := 0.0
	var dirs := [Vector2(0, -1), Vector2(1, 0), Vector2(0, 1), Vector2(-1, 0)]
	var k := 0
	while t < 80.0:
		w.hud.joystick.value = dirs[k % 4]
		k += 1
		await get_tree().create_timer(1.5 * Engine.time_scale).timeout
		t += 1.5
	Engine.time_scale = 1.0
	w.hud.joystick.value = Vector2.ZERO
	print("SOAK days passed: ", WorldClock.day - start_day, "  npcs visible: ", w.npcs.values().filter(func(n): return n.visible).size(),
		"  business profit: ", s["businesses"][0]["total_profit"], "  needs: ", s["needs"])
	print("SOAK OK")
	get_tree().quit()
