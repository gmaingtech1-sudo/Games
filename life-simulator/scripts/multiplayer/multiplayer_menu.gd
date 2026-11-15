class_name MultiplayerMenu
extends RefCounted
## Host / join UI. Online play uses a separate online profile stored by the
## server, so your single-player saves are never affected.


static func open(parent: Control) -> void:
	var m := Modal.open(parent, "Multiplayer", 900, 640, false)
	var v := m.scroll_list(12)
	v.add_child(UI.label("Explore the city together. The server owns everyone's money and items, so nobody can cheat. Your single-player saves are separate and stay offline.", 18, UI.MUTED))
	var name_edit := LineEdit.new()
	name_edit.placeholder_text = "Your name"
	name_edit.text = str(Settings.get_value("player_name_online", ""))
	if name_edit.text == "":
		name_edit.text = _default_name()
	name_edit.max_length = 16
	name_edit.custom_minimum_size = Vector2(0, 60)
	v.add_child(UI.label("Player name", 20))
	v.add_child(name_edit)

	var ip_edit := LineEdit.new()
	ip_edit.placeholder_text = "Server address, e.g. 192.168.1.20"
	ip_edit.text = str(Settings.get_value("last_server", "127.0.0.1"))
	ip_edit.custom_minimum_size = Vector2(0, 60)
	var port_edit := LineEdit.new()
	port_edit.text = str(MultiplayerManager.DEFAULT_PORT)
	port_edit.custom_minimum_size = Vector2(140, 60)
	v.add_child(UI.label("Server address and port", 20))
	var row := UI.hbox(10)
	UI.expand(ip_edit)
	row.add_child(ip_edit)
	row.add_child(port_edit)
	v.add_child(row)

	var status := UI.label("Not connected.", 20, UI.WARN)
	var on_status := func(t): if is_instance_valid(status): status.text = t
	MultiplayerManager.status_changed.connect(on_status)
	m.closed.connect(func(): MultiplayerManager.status_changed.disconnect(on_status))

	var btns := UI.hbox(12)
	var do_join := func():
		var nm := name_edit.text.strip_edges()
		if nm == "":
			status.text = "Enter a name first."
			return
		Settings.set_value("player_name_online", nm)
		Settings.set_value("last_server", ip_edit.text.strip_edges())
		MultiplayerManager.join_game(ip_edit.text.strip_edges(), nm, _appearance(), int(port_edit.text))
	var do_host := func():
		var nm := name_edit.text.strip_edges()
		if nm == "":
			status.text = "Enter a name first."
			return
		Settings.set_value("player_name_online", nm)
		if MultiplayerManager.host_game(nm, _appearance(), int(port_edit.text)):
			m.close()
	var join := UI.button("Join Game", do_join, 72, UI.ACCENT.darkened(0.2))
	var host := UI.button("Host Game", do_host, 72)
	UI.expand(join)
	UI.expand(host)
	btns.add_child(join)
	btns.add_child(host)
	v.add_child(btns)
	v.add_child(status)
	v.add_child(UI.label("Hosting: friends on the same Wi-Fi join with your local IP (%s). For internet play, forward UDP port %d on your router or run a dedicated server (see docs/MULTIPLAYER.md)." % [", ".join(MultiplayerManager.local_addresses()), MultiplayerManager.DEFAULT_PORT], 17, UI.MUTED))
	v.add_child(UI.label("Your character's look comes from your most recent single-player save.", 17, UI.MUTED))


static func _default_name() -> String:
	var slot := SaveManager.latest_slot()
	if slot > 0:
		var r := SaveManager.load_slot(slot)
		if r["ok"]:
			return str(r["state"]["name"])
	return "Player%d" % (randi() % 1000)


static func _appearance() -> Dictionary:
	var slot := SaveManager.latest_slot()
	if slot > 0:
		var r := SaveManager.load_slot(slot)
		if r["ok"]:
			return r["state"]["appearance"]
	return PlayerState.default_appearance()
