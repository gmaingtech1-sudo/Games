extends SceneTree
## Compiles every .gd file in the project and reports failures.
## Usage: godot --headless --path . -s tools/check_scripts.gd

func _init() -> void:
	# Autoload singletons are registered after _init, so compile on the first frame.
	process_frame.connect(_run, CONNECT_ONE_SHOT)


func _run() -> void:
	var files := []
	_collect("res://", files)
	var bad := 0
	for f in files:
		var s = ResourceLoader.load(f)
		if s == null or not (s is GDScript) or not s.can_instantiate():
			print("FAILED: ", f)
			bad += 1
	print("Checked %d scripts, %d failed" % [files.size(), bad])
	quit(1 if bad > 0 else 0)


func _collect(dir: String, out: Array) -> void:
	var d := DirAccess.open(dir)
	if d == null:
		return
	d.list_dir_begin()
	var n := d.get_next()
	while n != "":
		if n.begins_with("."):
			n = d.get_next()
			continue
		var p := dir.path_join(n)
		if d.current_is_dir():
			_collect(p, out)
		elif n.ends_with(".gd"):
			out.append(p)
		n = d.get_next()
