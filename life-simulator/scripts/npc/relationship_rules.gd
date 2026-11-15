class_name RelationshipRules
extends RefCounted
## Friendship with named NPCs (0-100). Talking, gifts and favours raise it.

const MAX_TALKS_PER_DAY := 3


static func get_rel(s: Dictionary, npc_id: String) -> Dictionary:
	if not s["relationships"].has(npc_id):
		s["relationships"][npc_id] = {"friendship": 0.0, "status": "", "talk_day": -1, "talks": 0, "gifts": 0, "met": false}
	return s["relationships"][npc_id]


static func friendship(s: Dictionary, npc_id: String) -> float:
	if not s["relationships"].has(npc_id):
		return 0.0
	return float(s["relationships"][npc_id]["friendship"])


static func add_friendship(s: Dictionary, npc_id: String, amount: float) -> void:
	var r := get_rel(s, npc_id)
	r["friendship"] = clampf(float(r["friendship"]) + amount, 0.0, 100.0)


static func count_at_least(s: Dictionary, value: float) -> int:
	var n := 0
	for id in s["relationships"]:
		if float(s["relationships"][id]["friendship"]) >= value:
			n += 1
	return n


## kind: "chat", "joke", "compliment", "ask_out"
static func talk(s: Dictionary, npc_id: String, kind: String) -> Dictionary:
	var npc: Dictionary = DataDB.npcs.get(npc_id, {})
	if npc.is_empty():
		return {"ok": false, "msg": "Nobody's there."}
	var r := get_rel(s, npc_id)
	var day := int(s["world"]["day"])
	if int(r["talk_day"]) != day:
		r["talk_day"] = day
		r["talks"] = 0
	var first := not bool(r.get("met", false))
	r["met"] = true
	var gain := 0.0
	var line := ""
	var f := float(r["friendship"])
	var mult := NeedsRules.social_mult(s)
	match kind:
		"chat":
			gain = 5.0
			var lines: Array = npc.get("lines", ["Hello."])
			var tier := 0
			for i in DataDB.friendship_levels.size():
				if f >= float(DataDB.friendship_levels[i]["min"]):
					tier = i
			line = lines[min(tier, lines.size() - 1)]
		"joke":
			# Some personalities love jokes, others don't.
			var p: String = npc.get("personality", "")
			if p in ["serious", "ambitious", "driven", "shy"]:
				gain = 1.0
				line = "...Right. Very funny."
			else:
				gain = 8.0
				line = "Ha! That's a good one!"
		"compliment":
			gain = 4.0
			if InventoryRules.wearing_smart_outfit(s) or float(s["needs"]["hygiene"]) > 70.0:
				gain = 7.0
			line = "Aw, thank you! That's kind of you."
		"ask_out":
			if f < 60.0:
				return {"ok": false, "msg": npc["name"] + " would rather get to know you better first."}
			if r["status"] == "dating":
				return {"ok": false, "msg": "You're already dating " + str(npc["name"]) + "."}
			for other in s["relationships"]:
				if s["relationships"][other]["status"] == "dating":
					return {"ok": false, "msg": "You're already seeing someone."}
			r["status"] = "dating"
			NeedsRules.apply_effects(s, {"happiness": 20.0, "social": 25.0})
			return {"ok": true, "msg": str(npc["name"]) + " said yes! You're now dating.", "line": "I was hoping you'd ask!",
				"events": [{"name": "dating", "id": npc_id}, {"name": "needs_delta", "delta": {"happiness": 20.0, "social": 25.0}}]}
		_:
			return {"ok": false, "msg": "?"}
	var effects := {"social": 12.0, "happiness": 3.0}
	if int(r["talks"]) >= MAX_TALKS_PER_DAY:
		gain = 0.0
		effects = {"social": 4.0}
		line = "Good to see you again! I'd better get on though."
	r["talks"] = int(r["talks"]) + 1
	add_friendship(s, npc_id, gain * mult)
	NeedsRules.apply_effects(s, effects)
	s["stats"]["npc_talks"] = int(s["stats"].get("npc_talks", 0)) + 1
	var msg := ""
	if gain > 0.0:
		msg = "Friendship with %s +%d" % [npc["name"], int(round(gain * mult))]
		if mult < 1.0:
			msg += " (they noticed you need a shower)"
	return {"ok": true, "msg": msg, "line": line, "first": first,
		"events": [{"name": "talk_npc", "id": npc_id}, {"name": "needs_delta", "delta": effects}, {"name": "friendship", "id": npc_id}]}


static func gift(s: Dictionary, npc_id: String, item_id: String) -> Dictionary:
	var npc: Dictionary = DataDB.npcs.get(npc_id, {})
	var it := DataDB.item(item_id)
	if npc.is_empty() or it.is_empty():
		return {"ok": false, "msg": "Can't give that."}
	if InventoryRules.is_equipped(s, item_id) and InventoryRules.count(s, item_id) <= 1:
		return {"ok": false, "msg": "You're wearing that!"}
	if not InventoryRules.remove_item(s, item_id, 1):
		return {"ok": false, "msg": "You don't have that."}
	var r := get_rel(s, npc_id)
	r["gifts"] = int(r["gifts"]) + 1
	var liked: bool = it["category"] == npc.get("likes", "")
	var gain := 12.0 if liked else 5.0
	gain += minf(10.0, float(DataDB.item_price_p(item_id)) / 5000.0)
	add_friendship(s, npc_id, gain)
	NeedsRules.apply_effects(s, {"happiness": 4.0})
	var line := "Oh wow, I love this!" if liked else "That's thoughtful, thank you."
	return {"ok": true, "msg": "Friendship with %s +%d" % [npc["name"], int(gain)], "line": line,
		"events": [{"name": "give_item", "id": item_id, "npc": npc_id, "count": 1}, {"name": "friendship", "id": npc_id}]}


## Daily bonus for being in a relationship, and slow friendship decay with people you ignore.
static func daily(s: Dictionary) -> void:
	for id in s["relationships"]:
		var r: Dictionary = s["relationships"][id]
		if r["status"] == "dating":
			NeedsRules.apply_effects(s, {"happiness": 5.0})
		if int(r["talk_day"]) < int(s["world"]["day"]) - 5 and float(r["friendship"]) > 15.0:
			r["friendship"] = float(r["friendship"]) - 1.0
