class_name ChallengeRules
extends RefCounted
## Boss-style challenges: Business Tycoon, Street Racing, Property Mogul, Career.
## Progress and rewards are worked out from the authoritative state, so they are
## safe to run on the multiplayer server.

const DIFFS := ["easy", "normal", "hard"]
const RACE_MIN_SECONDS := 15.0   # nobody can legally finish the race faster


static func def(id: String) -> Dictionary:
	return DataDB.challenges.get(id, {})


static func rec(s: Dictionary, id: String) -> Dictionary:
	return s["challenges"].get(id, {})


static func is_active(s: Dictionary, id: String) -> bool:
	return rec(s, id).get("status", "") == "active"


static func total_business_profit(s: Dictionary) -> int:
	var t := 0
	for b in s["businesses"]:
		t += int(b["total_profit"])
	return t


static func portfolio(s: Dictionary) -> Dictionary:
	var count := 0
	var value := 0
	for p in s["properties"]:
		if p["mode"] == "own":
			count += 1
			value += PropertyRules.property_value(p)
	return {"count": count, "value": value}


static func start(s: Dictionary, id: String, diff: String) -> Dictionary:
	var d := def(id)
	if d.is_empty() or not (diff in DIFFS):
		return {"ok": false, "msg": "Unknown challenge."}
	if is_active(s, id):
		return {"ok": false, "msg": "Already in progress."}
	match d.get("requires", ""):
		"business":
			if s["businesses"].is_empty():
				return {"ok": false, "msg": "You need to own a business to enter."}
		"job":
			if s["job"]["id"] == "":
				return {"ok": false, "msg": "You need a job to enter."}
	var cfg: Dictionary = d["difficulties"][diff]
	var day := int(s["world"]["day"])
	var r := {"status": "active", "difficulty": diff, "start_day": day, "end_day": day + int(cfg.get("days", 0)),
		"baseline": 0, "rival": 0, "shifts": 0, "perf_sum": 0.0, "wins": rec(s, id).get("wins", [])}
	if id == "business_tycoon":
		r["baseline"] = total_business_profit(s)
	s["challenges"][id] = r
	return {"ok": true, "msg": "Challenge started: %s (%s)" % [d["name"], diff.capitalize()], "events": [{"name": "challenge_started", "id": id}]}


static func abandon(s: Dictionary, id: String) -> Dictionary:
	if not is_active(s, id):
		return {"ok": false, "msg": "Not in progress."}
	s["challenges"][id]["status"] = "lost"
	return {"ok": true, "msg": "Challenge abandoned."}


static func progress_text(s: Dictionary, id: String) -> String:
	var r := rec(s, id)
	if r.is_empty():
		return ""
	var cfg: Dictionary = def(id)["difficulties"][r["difficulty"]]
	match id:
		"business_tycoon":
			return "You: %s  vs  Apex: %s  (ends day %d)" % [Money.fmt(total_business_profit(s) - int(r["baseline"])), Money.fmt(int(r["rival"])), int(r["end_day"])]
		"property_mogul":
			var pf := portfolio(s)
			return "Owned %d/%d, value %s/%s (ends day %d)" % [pf["count"], int(cfg["count"]), Money.fmt(pf["value"]), Money.fmt(DataDB.to_pence(cfg["value"])), int(r["end_day"])]
		"career_challenge":
			var avg := 0.0 if int(r["shifts"]) == 0 else float(r["perf_sum"]) / float(r["shifts"])
			return "Shifts %d/%d, average %d%% (need %d%%), ends day %d" % [int(r["shifts"]), int(cfg["shifts"]), int(avg * 100), int(cfg["avg_perf"]), int(r["end_day"])]
		"street_racing":
			return "Head to the race start at the Events Plaza." if r["status"] == "active" else ""
	return ""


static func _win(s: Dictionary, id: String) -> Array:
	var r: Dictionary = s["challenges"][id]
	var d := def(id)
	r["status"] = "won"
	var events := [{"name": "challenge_won", "id": id, "difficulty": r["difficulty"]}]
	var wins: Array = r.get("wins", [])
	if not (r["difficulty"] in wins):
		wins.append(r["difficulty"])
		r["wins"] = wins
		var reward := DataDB.to_pence(d["difficulties"][r["difficulty"]]["reward"])
		EconomyRules.earn(s, reward, "Challenge prize: " + str(d["name"]), "bank", "prize")
		if id == "street_racing":
			InventoryRules.add_item(s, "trophy", 1)
		if id == "property_mogul":
			InventoryRules.add_item(s, "golden_key", 1)
		PlayerState.add_message(s, "Challenge Board", "You won %s (%s)! Prize: %s" % [d["name"], str(r["difficulty"]).capitalize(), Money.fmt(reward)])
	else:
		PlayerState.add_message(s, "Challenge Board", "You won %s again! (Prize already claimed at this difficulty.)" % d["name"])
	return events


static func _lose(s: Dictionary, id: String) -> Array:
	s["challenges"][id]["status"] = "lost"
	PlayerState.add_message(s, "Challenge Board", "You lost %s this time. Try again whenever you're ready." % def(id)["name"])
	return [{"name": "challenge_lost", "id": id}]


## Checks for wins that can happen at any moment (property mogul, career).
static func evaluate(s: Dictionary) -> Array:
	var events := []
	for id in s["challenges"].keys():
		if not is_active(s, id):
			continue
		var r: Dictionary = s["challenges"][id]
		var cfg: Dictionary = def(id)["difficulties"][r["difficulty"]]
		match id:
			"property_mogul":
				var pf := portfolio(s)
				if pf["count"] >= int(cfg["count"]) and pf["value"] >= DataDB.to_pence(cfg["value"]):
					events.append_array(_win(s, id))
			"career_challenge":
				if int(r["shifts"]) >= int(cfg["shifts"]):
					var avg := float(r["perf_sum"]) / float(r["shifts"])
					if avg * 100.0 >= float(cfg["avg_perf"]):
						events.append_array(_win(s, id))
					else:
						events.append_array(_lose(s, id))
	return events


static func on_event(s: Dictionary, ev: Dictionary) -> void:
	if ev.get("name", "") == "work_shift" and is_active(s, "career_challenge"):
		var r: Dictionary = s["challenges"]["career_challenge"]
		r["shifts"] = int(r["shifts"]) + 1
		r["perf_sum"] = float(r["perf_sum"]) + float(ev.get("perf", 0.0))


## Called once per in-game day after the business simulation.
static func daily(s: Dictionary, rng_seed: int = -1) -> Array:
	var events := []
	var rng := RandomNumberGenerator.new()
	if rng_seed >= 0:
		rng.seed = rng_seed
	else:
		rng.randomize()
	var day := int(s["world"]["day"])
	for id in s["challenges"].keys():
		if not is_active(s, id):
			continue
		var r: Dictionary = s["challenges"][id]
		var cfg: Dictionary = def(id)["difficulties"][r["difficulty"]]
		if id == "business_tycoon":
			r["rival"] = int(r["rival"]) + int(DataDB.to_pence(cfg["rival_daily"]) * rng.randf_range(0.8, 1.2))
		if id == "street_racing":
			continue
		if day >= int(r["end_day"]):
			if id == "business_tycoon":
				if total_business_profit(s) - int(r["baseline"]) > int(r["rival"]):
					events.append_array(_win(s, id))
				else:
					events.append_array(_lose(s, id))
			else:
				events.append_array(_lose(s, id))
	events.append_array(evaluate(s))
	return events


## The client reports a finished race. The server rejects impossible times.
static func race_result(s: Dictionary, position: int, seconds: float) -> Dictionary:
	if not is_active(s, "street_racing"):
		return {"ok": false, "msg": "No race in progress."}
	if seconds < RACE_MIN_SECONDS:
		s["challenges"]["street_racing"]["status"] = "lost"
		return {"ok": false, "msg": "Race result rejected (impossible time)."}
	if position == 1:
		var ev := _win(s, "street_racing")
		return {"ok": true, "msg": "You won the race in %.1f s!" % seconds, "events": ev}
	var ev2 := _lose(s, "street_racing")
	return {"ok": true, "msg": "You finished in position %d. Better luck next time!" % position, "events": ev2}
