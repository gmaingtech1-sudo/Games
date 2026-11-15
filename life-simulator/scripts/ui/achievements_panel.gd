class_name AchievementsPanel
extends RefCounted
## Lists every achievement with its unlock state and progress.


static func build(parent: Control) -> void:
	UI.clear(parent)
	var total := DataDB.achievement_order.size()
	var got := 0
	for id in DataDB.achievement_order:
		if AchievementManager.is_unlocked(id):
			got += 1
	parent.add_child(UI.label("%d / %d unlocked (unlocks are kept across all saves)" % [got, total], 20, UI.MUTED))
	var s: Dictionary = GameManager.state
	for id in DataDB.achievement_order:
		var a: Dictionary = DataDB.achievements[id]
		var unlocked := AchievementManager.is_unlocked(id)
		var c := UI.card(Color(0.14, 0.3, 0.26) if unlocked else UI.CARD)
		var row := UI.hbox(14)
		var badge := UI.label("★" if unlocked else "☆", 34, UI.ACCENT2 if unlocked else UI.MUTED)
		badge.custom_minimum_size = Vector2(44, 0)
		row.add_child(badge)
		var col := UI.vbox(2)
		UI.expand(col)
		col.add_child(UI.label(str(a["name"]), 22, UI.TEXT))
		col.add_child(UI.label(str(a["desc"]), 17, UI.MUTED))
		if not unlocked and not s.is_empty():
			var v := AchievementManager.value_for(s, str(a["check"]))
			var pct := clampf(v / float(a["value"]) * 100.0, 0.0, 100.0)
			col.add_child(UI.bar(pct, UI.ACCENT2, 10))
		row.add_child(col)
		c.add_child(row)
		parent.add_child(c)
