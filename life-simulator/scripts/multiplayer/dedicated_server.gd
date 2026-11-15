extends Node
## Headless dedicated server entry point. Run with:
##   godot --headless --path <project> -- --server --port 24555
## Optional: --quit-after <seconds> (used by automated tests).

var _quit_after := -1.0
var _elapsed := 0.0


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var port := MultiplayerManager.DEFAULT_PORT
	var i := args.find("--port")
	if i >= 0 and i + 1 < args.size():
		port = int(args[i + 1])
	i = args.find("--quit-after")
	if i >= 0 and i + 1 < args.size():
		_quit_after = float(args[i + 1])
	Engine.max_fps = 30
	if not MultiplayerManager.start_dedicated(port):
		get_tree().quit(1)
		return
	MultiplayerManager.players_changed.connect(func(): print("[server] players online: ", MultiplayerManager.players.size()))


func _process(delta: float) -> void:
	_elapsed += delta
	if _quit_after > 0.0 and _elapsed >= _quit_after:
		print("[server] shutting down (quit-after)")
		MultiplayerManager.leave()
		get_tree().quit(0)
