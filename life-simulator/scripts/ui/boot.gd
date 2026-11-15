extends Node
## First scene. Decides between the dedicated server and the normal game.
## Dedicated server:  godot --headless -- --server [--port 24555]

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if "--server" in args or OS.has_feature("dedicated_server"):
		get_tree().change_scene_to_file.call_deferred("res://scenes/multiplayer/dedicated_server.tscn")
		return
	get_tree().change_scene_to_file.call_deferred(GameManager.MAIN_MENU)
