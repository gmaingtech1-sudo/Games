class_name MissionRules
extends RefCounted
## Mission reward claiming and the deterministic daily-mission picker.
## Objective tracking happens in MissionManager (client side); paying the
## reward goes through here so the server can check it is not claimed twice
## and the amount always comes from the game data, never from the client.

const DAILY_COUNT := 3


## The daily missions for a given day. Deterministic so client and server agree.
static func daily_for_day(day: int) -> Array:
	var ids: Array = DataDB.daily_pool.keys()
	ids.sort()
	var rng := RandomNumberGenerator.new()
	rng.seed = day * 7919 + 17
	var out := []
	while out.size() < min(DAILY_COUNT, ids.size()):
		var id: String = ids[rng.randi_range(0, ids.size() - 1)]
		if not (id in out):
			out.append(id)
	return out


static func claim_key(id: String, day: int) -> String:
	return "%s@%d" % [id, day] if DataDB.daily_pool.has(id) else id


static func def(id: String) -> Dictionary:
	if DataDB.missions.has(id):
		return DataDB.missions[id]
	return DataDB.daily_pool.get(id, {})


static func claim(s: Dictionary, id: String) -> Dictionary:
	var m := def(id)
	if m.is_empty():
		return {"ok": false, "quiet": true, "msg": "Unknown mission."}
	var day := int(s["world"]["day"])
	if DataDB.daily_pool.has(id) and not (id in daily_for_day(day)):
		return {"ok": false, "quiet": true, "msg": "That daily mission isn't available today."}
	var key := claim_key(id, day)
	if key in s["claimed"]:
		return {"ok": false, "quiet": true, "msg": "Reward already claimed."}
	for req in m.get("requires", []):
		if not (req in s["claimed"]):
			return {"ok": false, "quiet": true, "msg": "Mission not unlocked."}
	s["claimed"].append(key)
	# Keep the claimed list small: drop old daily keys.
	var keep := []
	for k in s["claimed"]:
		if "@" in k and int(k.split("@")[1]) < day - 1:
			continue
		keep.append(k)
	s["claimed"] = keep
	var rw: Dictionary = m.get("rewards", {})
	var parts := []
	if rw.has("money"):
		var amt := DataDB.to_pence(rw["money"])
		EconomyRules.earn(s, amt, "Mission reward: " + str(m["title"]), "bank", "reward")
		parts.append(Money.fmt(amt))
	for e in rw.get("items", []):
		if InventoryRules.add_item(s, e["id"], int(e["qty"])):
			parts.append("%dx %s" % [int(e["qty"]), DataDB.item_name(e["id"])])
	if rw.has("friendship") and m.has("giver"):
		RelationshipRules.add_friendship(s, m["giver"], float(rw["friendship"]))
		parts.append("+%d friendship" % int(rw["friendship"]))
	return {"ok": true, "msg": "Mission complete: %s! Reward: %s" % [m["title"], ", ".join(parts)],
		"events": [{"name": "mission_claimed", "id": id}]}
