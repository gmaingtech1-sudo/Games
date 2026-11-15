extends Node
## Renders the game and saves screenshots (for visual checks, needs a display):
##   xvfb-run -s "-screen 0 1280x720x24" godot --path . --rendering-driver opengl3 res://scenes/tests/screenshot_tour.tscn -- --out /path
var out := "user://screens"


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var i := args.find("--out")
	if i >= 0 and i + 1 < args.size():
		out = args[i + 1]
	DirAccess.make_dir_recursive_absolute(out)
	SaveManager.save_dir = "user://shot_saves"
	await get_tree().process_frame
	var dummy := Node.new()
	get_tree().root.add_child(dummy)
	get_tree().current_scene = dummy
	get_tree().change_scene_to_file(GameManager.MAIN_MENU)
	await frames(30)
	await shot("01_main_menu")
	get_tree().change_scene_to_file(GameManager.CREATOR)
	await frames(30)
	await shot("02_character_creator")
	GameManager.start_new_game("Alex", {"body": "fem", "hair": 3, "hair_color": "#a33a1a", "skin": 2}, 1, {"top": "tshirt_blue", "bottom": "jeans_blue", "shoes": "trainers_white", "accessory": "cap_red"})
	await frames(40)
	var w := get_tree().current_scene
	WorldClock.set_time(1, 11 * 60, "sunny")
	w.env_ctl.update_now()
	w.cam.yaw = PI * 0.85
	w.cam.pitch = -0.25
	await frames(40)
	await shot("03_world_day")
	# City centre view from higher up
	w.cam.target_distance = 14.0
	w.cam.pitch = -0.45
	w.cam.yaw = PI * 1.25
	await frames(60)
	await shot("04_city_overview")
	# Business district
	w.teleport_player(Vector3(75, 0.3, -100))
	w.cam.target_distance = 9.0
	w.cam.pitch = -0.15
	w.cam.yaw = PI * 0.9
	await frames(60)
	await shot("05_business_district")
	# Park
	w.teleport_player(Vector3(-10, 0.3, -112))
	w.cam.yaw = PI * 0.2
	await frames(60)
	await shot("06_park")
	# Residential at sunset in the rain
	w.teleport_player(Vector3(-100, 0.3, 30))
	WorldClock.set_time(1, 19 * 60 + 30, "rain")
	w.env_ctl.update_now()
	w.cam.yaw = PI * 0.6
	await frames(80)
	await shot("07_residential_rain_evening")
	# Night downtown
	WorldClock.set_time(1, 23 * 60, "sunny")
	w.env_ctl.update_now()
	w.teleport_player(Vector3(0, 0.3, -52))
	w.cam.yaw = PI
	await frames(80)
	await shot("08_night")
	WorldClock.set_time(1, 12 * 60, "sunny")
	w.env_ctl.update_now()
	# Vehicle
	GameManager.state["bank"] = 10000000
	GameManager.act("buy_vehicle", {"id": "sports_car", "color": "#c0392b"})
	await frames(5)
	var v = w.vehicles.values()[0]
	v.global_position = Vector3(50, 0.4, -75)
	v.rotation.y = 0.0
	w.teleport_player(Vector3(50, 0.3, -70))
	await frames(5)
	w.enter_vehicle(v)
	w.cam.yaw = 0.3
	await frames(60)
	await shot("09_driving")
	w.toggle_vehicle()
	await frames(10)
	# Interior
	GameManager.state["cash"] = 10000000
	GameManager.state["bank"] = 50000000
	GameManager.act("buy_property", {"id": "small_house_1"})
	for it in ["sofa", "tv", "plant", "bookshelf", "rug", "floor_lamp"]:
		GameManager.act("buy_item", {"id": it, "qty": 1, "shop": "furniture" if it != "tv" else "tech"})
		GameManager.act("place_furniture", {"id": "small_house_1", "item": it})
	await w.enter_home("small_house_1")
	w.cam.yaw = PI
	w.cam.pitch = -0.5
	await frames(60)
	await shot("10_home_interior")
	await w.leave_interior()
	# UI screens
	w.teleport_player(CityLayout.location_pos("supermarket") + Vector3(0, 0.3, 0))
	await frames(20)
	await shot("11_location_prompt")
	Phone.open(w.hud)
	await frames(20)
	await shot("12_phone")
	Modal.close_all(get_tree())
	ShopPanel.open(w.hud, "supermarket")
	await frames(20)
	await shot("13_shop")
	Modal.close_all(get_tree())
	BusinessPanel.open(w.hud)
	await frames(20)
	await shot("14_business")
	Modal.close_all(get_tree())
	var npc = w.npcs["priya"]
	npc.global_position = w.player.global_position + Vector3(1.5, 0, 1.5)
	DialoguePanel.open(w, npc)
	await frames(20)
	await shot("15_dialogue")
	Modal.close_all(get_tree())
	Phone.open(w.hud, "map")
	await frames(20)
	await shot("16_map")
	Modal.close_all(get_tree())
	print("screenshots saved to ", ProjectSettings.globalize_path(out))
	get_tree().quit()


func frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(out.path_join(name + ".png"))
	print("shot ", name)
