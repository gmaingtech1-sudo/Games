class_name JobRules
extends RefCounted
## Applying for jobs, working shifts, promotions and college courses.

const MIN_REAL_SECONDS_BETWEEN_SHIFTS := 15   # server-side anti-cheat rate limit


static func job_def(id: String) -> Dictionary:
	return DataDB.jobs.get(id, {})


static func current_title(s: Dictionary) -> String:
	var j := job_def(s["job"]["id"])
	if j.is_empty():
		return "Unemployed"
	return j["levels"][int(s["job"]["level"])]["title"]


static func shift_pay(s: Dictionary) -> int:
	var j := job_def(s["job"]["id"])
	if j.is_empty():
		return 0
	return DataDB.to_pence(j["levels"][int(s["job"]["level"])]["pay"])


## Returns a list of unmet requirement strings (empty = eligible).
static func unmet_requirements(s: Dictionary, job_id: String) -> Array:
	var j := job_def(job_id)
	var out := []
	if j.is_empty():
		return ["Unknown job"]
	var req: Dictionary = j.get("requires", {})
	for q in req.get("qualifications", []):
		if not (q in s["qualifications"]):
			out.append("Qualification: " + str(DataDB.courses.get(q, {}).get("name", q)))
	if req.get("smart_outfit", false) and not InventoryRules.wearing_smart_outfit(s):
		out.append("Wear a smart outfit (shirt/jacket, trousers, formal shoes)")
	var jx: Dictionary = req.get("job_xp", {})
	for other in jx:
		var have := int(s["jobs_held"].get(other, {}).get("xp", 0))
		if other == s["job"]["id"]:
			have = max(have, int(s["job"]["xp"]))
		if have < int(jx[other]):
			out.append("%d shifts as %s (you have %d)" % [int(jx[other]), job_def(other).get("name", other), have])
	var ms: Dictionary = req.get("min_stat", {})
	for stat in ms:
		if float(s["needs"].get(stat, 0)) < float(ms[stat]):
			out.append("%s of at least %d" % [str(stat).capitalize(), int(ms[stat])])
	return out


static func apply(s: Dictionary, job_id: String) -> Dictionary:
	var j := job_def(job_id)
	if j.is_empty():
		return {"ok": false, "msg": "That job doesn't exist."}
	if s["job"]["id"] == job_id:
		return {"ok": false, "msg": "You already work here."}
	var unmet := unmet_requirements(s, job_id)
	if not unmet.is_empty():
		return {"ok": false, "msg": "Application rejected. You need: " + ", ".join(unmet)}
	var events := []
	if s["job"]["id"] != "":
		events.append_array(quit(s).get("events", []))
	var prev: Dictionary = s["jobs_held"].get(job_id, {"xp": 0, "level": 0})
	s["job"] = {"id": job_id, "level": int(prev.get("level", 0)), "xp": int(prev.get("xp", 0)), "last_shift_day": -1, "shifts": 0}
	s["jobs_held"][job_id] = {"xp": int(prev.get("xp", 0)), "level": int(prev.get("level", 0))}
	PlayerState.add_message(s, j["employer"], "Welcome aboard! Your shifts are %02d:00-%02d:00 at %s. See you there." % [int(j["start"]), int(j["end"]) % 24, j["employer"]])
	events.append({"name": "get_job", "id": job_id})
	return {"ok": true, "msg": "You're hired as " + current_title(s) + " at " + j["employer"] + "!", "events": events}


static func quit(s: Dictionary) -> Dictionary:
	var id: String = s["job"]["id"]
	if id == "":
		return {"ok": false, "msg": "You don't have a job."}
	s["jobs_held"][id] = {"xp": int(s["job"]["xp"]), "level": int(s["job"]["level"])}
	var name: String = job_def(id).get("name", id)
	s["job"] = {"id": "", "level": 0, "xp": 0, "last_shift_day": -1, "shifts": 0}
	return {"ok": true, "msg": "You quit your job as " + name + ".", "events": [{"name": "quit_job", "id": id}]}


## Whether a shift can start now. Returns "" if OK, otherwise the reason.
static func can_start_shift(s: Dictionary) -> String:
	var j := job_def(s["job"]["id"])
	if j.is_empty():
		return "You don't have a job."
	var hour := int(s["world"]["minute"]) / 60
	var start := int(j["start"])
	var end := int(j["end"])
	if hour < start or hour >= end:
		return "Your shift is %02d:00-%02d:00. Come back then." % [start, end % 24]
	if int(s["job"]["last_shift_day"]) == int(s["world"]["day"]):
		return "You've already worked today. Come back tomorrow."
	if float(s["needs"]["energy"]) < 10.0:
		return "You're too tired to work. Get some sleep first."
	return ""


## Completes a shift. perf is the activity score from 0.0 to 1.0.
## ctx may contain "now_msec" (server real time) for rate limiting.
static func work_shift(s: Dictionary, perf: float, ctx: Dictionary = {}) -> Dictionary:
	var reason := can_start_shift(s)
	if reason != "":
		return {"ok": false, "msg": reason}
	if ctx.has("now_msec"):
		var last := int(s["stats_server"].get("last_shift_msec", 0))
		if last > 0 and int(ctx["now_msec"]) - last < MIN_REAL_SECONDS_BETWEEN_SHIFTS * 1000:
			return {"ok": false, "msg": "Shift rejected by server (too fast)."}
		s["stats_server"]["last_shift_msec"] = int(ctx["now_msec"])
	perf = clampf(perf, 0.0, 1.0)
	var j := job_def(s["job"]["id"])
	var start := int(j["start"])
	var end := int(j["end"])
	var hour := int(s["world"]["minute"]) / 60
	var shift_hours := end - start
	var remaining := end - hour
	var punctuality := clampf(float(remaining) / float(shift_hours) + 0.25, 0.3, 1.0)
	var effective := perf * NeedsRules.performance_mult(s)
	var mult := (0.55 + 0.45 * effective) * punctuality
	# Bonuses for owning the right tools / vehicles.
	for e in s["inventory"]:
		if DataDB.item(e["id"]).get("job_bonus", "") == j["id"]:
			mult *= 1.1
			break
	for v in s["vehicles"]:
		if DataDB.vehicles.get(v["id"], {}).get("job_bonus", "") == j["id"]:
			mult *= 1.15
			break
	var pay := int(shift_pay(s) * mult)
	EconomyRules.earn(s, pay, "Wages: " + current_title(s), "bank", "salary")
	s["job"]["last_shift_day"] = int(s["world"]["day"])
	s["job"]["shifts"] = int(s["job"]["shifts"]) + 1
	var xp_gain := 1 + (1 if effective >= 0.85 else 0)
	s["job"]["xp"] = int(s["job"]["xp"]) + xp_gain
	s["stats"]["shifts"] = int(s["stats"].get("shifts", 0)) + 1
	NeedsRules.apply_effects(s, {"energy": -min(32.0, remaining * 4.0), "hunger": -remaining * 2.0, "thirst": -remaining * 2.5, "hygiene": -remaining * 2.0, "happiness": (4.0 if effective > 0.7 else -3.0)})
	var events := [
		{"name": "work_shift", "id": j["id"], "perf": effective, "amount": pay},
		{"name": "earn", "amount": pay},
		{"name": "advance_time", "minutes": remaining * 60},
	]
	var msg := "Shift complete! Performance %d%%. You earned %s." % [int(effective * 100), Money.fmt(pay)]
	# Promotion check.
	var lvl := int(s["job"]["level"])
	if lvl < j["levels"].size() - 1 and int(s["job"]["xp"]) >= int(j["levels"][lvl + 1]["xp"]):
		s["job"]["level"] = lvl + 1
		s["stats"]["promotions"] = int(s["stats"].get("promotions", 0)) + 1
		msg += " PROMOTED to " + current_title(s) + "!"
		PlayerState.add_message(s, j["employer"], "Congratulations on your promotion to %s! Your new pay is %s per shift." % [current_title(s), Money.fmt(shift_pay(s))])
		events.append({"name": "promotion", "id": j["id"], "level": lvl + 1})
	s["jobs_held"][j["id"]] = {"xp": int(s["job"]["xp"]), "level": int(s["job"]["level"])}
	return {"ok": true, "msg": msg, "events": events, "pay": pay}


static func take_course(s: Dictionary, course_id: String) -> Dictionary:
	var c: Dictionary = DataDB.courses.get(course_id, {})
	if c.is_empty():
		return {"ok": false, "msg": "Unknown course."}
	if course_id in s["qualifications"]:
		return {"ok": false, "msg": "You already have this qualification."}
	if float(s["needs"]["energy"]) < 15.0:
		return {"ok": false, "msg": "You're too tired to study."}
	var sessions := int(c["sessions"])
	var fee := DataDB.to_pence(c["fee"]) / sessions
	if not EconomyRules.pay(s, fee, "Course: " + str(c["name"]), "auto", "education"):
		return {"ok": false, "msg": "Each session costs " + Money.fmt(fee) + ". You can't afford it."}
	var done := int(s["courses"].get(course_id, 0)) + 1
	s["courses"][course_id] = done
	var hours := int(c["hours"])
	NeedsRules.apply_effects(s, {"energy": -hours * 3.0, "hunger": -hours * 2.0, "happiness": 2.0})
	var events := [{"name": "advance_time", "minutes": hours * 60}, {"name": "course_session", "id": course_id}]
	var msg := "Study session %d/%d for %s complete." % [done, sessions, c["name"]]
	if done >= sessions:
		s["qualifications"].append(course_id)
		msg = "You earned your " + str(c["name"]) + "!"
		events.append({"name": "course_complete", "id": course_id})
		PlayerState.add_message(s, "City College", "Congratulations! You have completed: " + str(c["name"]) + ".")
	return {"ok": true, "msg": msg, "events": events}
