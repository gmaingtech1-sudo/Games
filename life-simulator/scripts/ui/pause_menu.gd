class_name PauseMenu
extends RefCounted
## Pause menu: resume, save, settings, achievements, help, quit to main menu.
## Single-player pauses the world; online the world keeps running.


static func open(parent: Node) -> void:
	for m in parent.get_tree().get_nodes_in_group("pause_menu"):
		return
	var m := Modal.open(parent, "Paused", 560, 640)
	m.add_to_group("pause_menu")
	m.process_mode = Node.PROCESS_MODE_ALWAYS
	var online := MultiplayerManager.is_online()
	if not online:
		parent.get_tree().paused = true
		m.closed.connect(func(): parent.get_tree().paused = false)
	var v := m.scroll_list(12)
	v.add_child(UI.button("Resume", func(): m.close(), 70, UI.ACCENT.darkened(0.2)))
	if not online:
		v.add_child(UI.button("Save game", func(): SaveManager.save_game(GameManager.current_slot), 64))
	else:
		v.add_child(UI.label("Online: %s (%d players). Your progress is saved on the server." % [MultiplayerManager.mode_name(), MultiplayerManager.players.size()], 17, UI.MUTED))
	v.add_child(UI.button("Settings", func(): var s := Modal.open(m, "Settings", 860, 620); s.process_mode = Node.PROCESS_MODE_ALWAYS; SettingsPanel.build(s.scroll_list(12)), 64))
	v.add_child(UI.button("Achievements", func(): var a := Modal.open(m, "Achievements", 860, 620); a.process_mode = Node.PROCESS_MODE_ALWAYS; AchievementsPanel.build(a.scroll_list(10)), 64))
	v.add_child(UI.button("How to play", func(): _help(m), 64))
	var quit_text := "Leave session" if online else "Save & quit to menu"
	v.add_child(UI.button(quit_text, func(): UI.confirm(m, quit_text + "?", func(): parent.get_tree().paused = false; GameManager.quit_to_menu(not online), "Yes"), 64, Color(0.45, 0.2, 0.22)))


static func _help(parent: Node) -> void:
	var h := Modal.open(parent, "How to play", 860, 620)
	h.process_mode = Node.PROCESS_MODE_ALWAYS
	var v := h.scroll_list(10)
	var lines := [
		["Moving", "Left side of the screen: virtual joystick. Right side: drag to look around. Jump and Sprint buttons are bottom right. Keyboard: WASD, Space, Shift, mouse drag."],
		["Interacting", "Walk up to glowing rings at doors, benches, ATMs, people and vehicles. The Use button shows what you can do (E on keyboard)."],
		["Needs", "Keep Hunger, Thirst, Energy, Health, Hygiene, Happiness and Social up. Eat and drink from your bag, sleep in a bed (or a bench/hostel), shower, chat to people. Neglect makes you slow, unhappy or lands you in hospital."],
		["Money", "Wages go into your bank. Cash is spent first, then your card. Use ATMs to move money. Rent and bills come out of your bank every 7 days."],
		["Work", "Get a job from the Jobs app or City Hall. Go to the workplace during working hours and press Start shift. Do well for more pay and promotions."],
		["Homes", "Rent or buy at Aisha Khan Lettings. Enter your home to sleep, shower, eat and place furniture. Upgrades add comfort and space."],
		["Vehicles", "Buy at Motor City Dealership. Press Drive near your vehicle (F). Gas/Brake buttons and the joystick steer. Watch fuel and damage."],
		["Friends", "Talk to the named residents. Chat, joke, compliment and give gifts they like. Friends ask for favours (missions)."],
		["Business & challenges", "Buy a business at the Apex Business Centre, keep it stocked and staffed, collect profits. Take on boss challenges at the Challenge Board."],
		["Saving", "Autosave runs regularly and when you leave the app. Use the phone's Save app for manual saves and other slots."],
	]
	for l in lines:
		v.add_child(UI.label(l[0], 22, UI.ACCENT))
		v.add_child(UI.label(l[1], 18, UI.TEXT))
