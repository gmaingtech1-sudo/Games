extends Node
## Save/load with 3 slots, autosave, atomic writes, a backup copy and checksums.
## Each slot file is JSON: {format, version, meta, checksum, state, settings}.
## A corrupted or tampered file falls back to the .bak copy; if both are bad
## the slot is reported as corrupted instead of crashing the game.

signal saved(slot: int)

const DIR := "user://saves"
const SLOTS := 3
const FORMAT := "LifeSimulatorSave"

var save_dir := DIR          # tests point this somewhere else
var _autosave_timer := 0.0
var last_error := ""


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(save_dir)


func _process(delta: float) -> void:
	if not GameManager.in_game or MultiplayerManager.is_online():
		return
	_autosave_timer += delta
	if _autosave_timer >= float(Settings.get_value("autosave_minutes", 3)) * 60.0:
		autosave()


func slot_path(slot: int) -> String:
	DirAccess.make_dir_recursive_absolute(save_dir)
	return "%s/slot_%d.json" % [save_dir, slot]


func autosave() -> void:
	_autosave_timer = 0.0
	if GameManager.in_game and not MultiplayerManager.is_online():
		save_game(GameManager.current_slot, true)


## Checksum of the state. Numbers are normalised to floats first because JSON
## parsing turns every number into a float.
static func checksum(state: Dictionary) -> String:
	return JSON.stringify(_ints_to_floats(state), "", true).sha256_text()


func save_game(slot: int, quiet: bool = false) -> bool:
	if GameManager.state.is_empty():
		return false
	get_tree().call_group("saveable", "write_to_state")
	GameManager.state["world"] = WorldClock.to_dict()
	# Normalise through JSON once so the checksum matches what will be read back
	# (int/float, key types and float formatting all become exactly what JSON stores).
	var st = JSON.parse_string(JSON.stringify(GameManager.state))
	if typeof(st) != TYPE_DICTIONARY:
		last_error = "state could not be serialised"
		return false
	var doc := {
		"format": FORMAT,
		"version": PlayerState.VERSION,
		"meta": {
			"name": st["name"],
			"money": int(st["cash"]) + int(st["bank"]),
			"day": int(st["world"]["day"]),
			"job": JobRules.current_title(st),
			"saved_at": Time.get_unix_time_from_system(),
			"saved_text": Time.get_datetime_string_from_system(false, true),
		},
		"checksum": checksum(st),
		"state": st,
		"settings": Settings.values,
	}
	var ok := write_doc(slot_path(slot), doc)
	if ok:
		saved.emit(slot)
		if not quiet:
			GameManager.toast("Game saved (slot %d)" % slot, "good")
	else:
		GameManager.toast("Save failed: " + last_error, "bad")
	return ok


## Writes atomically: temp file -> keep old as .bak -> rename temp into place.
func write_doc(path: String, doc: Dictionary) -> bool:
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		last_error = "cannot open file (%d)" % FileAccess.get_open_error()
		return false
	f.store_string(JSON.stringify(doc))
	f.flush()
	f.close()
	# Verify the temp file before replacing the real save.
	var check := read_doc(tmp)
	if not check["ok"]:
		last_error = "verification failed: " + str(check.get("error", ""))
		return false
	if FileAccess.file_exists(path):
		if FileAccess.file_exists(path + ".bak"):
			DirAccess.remove_absolute(path + ".bak")
		DirAccess.rename_absolute(path, path + ".bak")
	var err := DirAccess.rename_absolute(tmp, path)
	if err != OK:
		last_error = "rename failed (%d)" % err
		return false
	return true


## Reads and validates a save document. Returns {"ok", "state", "meta", "error"}.
func read_doc(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"ok": false, "error": "missing"}
	var txt := FileAccess.get_file_as_string(path)
	if txt.strip_edges() == "":
		return {"ok": false, "error": "empty"}
	var parsed = JSON.parse_string(txt)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "not valid JSON"}
	if parsed.get("format", "") != FORMAT:
		return {"ok": false, "error": "wrong format"}
	if typeof(parsed.get("state")) != TYPE_DICTIONARY:
		return {"ok": false, "error": "no state"}
	if int(parsed.get("version", 0)) > PlayerState.VERSION:
		return {"ok": false, "error": "made by a newer version"}
	var raw: Dictionary = parsed["state"]
	if str(parsed.get("checksum", "")) != checksum(raw):
		return {"ok": false, "error": "checksum mismatch (file damaged or edited)"}
	var v := PlayerState.validate(raw)
	if not v["ok"]:
		return {"ok": false, "error": "invalid state"}
	return {"ok": true, "state": v["state"], "meta": parsed.get("meta", {}), "settings": parsed.get("settings", {}), "fixes": v["errors"]}


static func _ints_to_floats(v):
	match typeof(v):
		TYPE_DICTIONARY:
			var d := {}
			for k in v:
				d[k] = _ints_to_floats(v[k])
			return d
		TYPE_ARRAY:
			var a := []
			for e in v:
				a.append(_ints_to_floats(e))
			return a
		TYPE_INT:
			return float(v)
	return v


## Loads a slot, falling back to its backup. Returns {"ok", "state", "recovered", "error"}.
func load_slot(slot: int) -> Dictionary:
	var r := read_doc(slot_path(slot))
	if r["ok"]:
		r["recovered"] = false
		return r
	var b := read_doc(slot_path(slot) + ".bak")
	if b["ok"]:
		b["recovered"] = true
		push_warning("Save slot %d was damaged (%s); restored from backup." % [slot, r["error"]])
		return b
	return {"ok": false, "error": r["error"]}


func load_game(slot: int) -> bool:
	var r := load_slot(slot)
	if not r["ok"]:
		last_error = r["error"]
		return false
	GameManager.load_state(r["state"], slot)
	if r.get("recovered", false):
		GameManager.call_deferred("toast", "Your save was damaged, so the backup was loaded.", "warn")
	return true


## Info for the slot picker: [{slot, exists, corrupt, meta}]
func list_slots() -> Array:
	var out := []
	for i in range(1, SLOTS + 1):
		var info := {"slot": i, "exists": false, "corrupt": false, "meta": {}}
		if FileAccess.file_exists(slot_path(i)) or FileAccess.file_exists(slot_path(i) + ".bak"):
			info["exists"] = true
			var r := load_slot(i)
			if r["ok"]:
				info["meta"] = r.get("meta", {})
			else:
				info["corrupt"] = true
				info["error"] = r.get("error", "")
		out.append(info)
	return out


## The most recently saved valid slot, or -1.
func latest_slot() -> int:
	var best := -1
	var best_t := -1.0
	for info in list_slots():
		if info["exists"] and not info["corrupt"]:
			var t := float(info["meta"].get("saved_at", 0))
			if t > best_t:
				best_t = t
				best = info["slot"]
	return best


func delete_slot(slot: int) -> void:
	for suffix in ["", ".bak", ".tmp"]:
		if FileAccess.file_exists(slot_path(slot) + suffix):
			DirAccess.remove_absolute(slot_path(slot) + suffix)
