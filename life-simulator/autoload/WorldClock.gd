extends Node
## In-game time and weather. One real second = MINUTES_PER_SECOND game minutes,
## so a full day lasts 12 real minutes. In multiplayer the server's clock is
## authoritative and is pushed to clients.

signal minute_passed(minutes: float)
signal hour_changed(hour: int)
signal day_changed(day: int)
signal weather_changed(weather: String)

const MINUTES_PER_SECOND := 2.0
const WEATHERS := ["sunny", "cloudy", "rain"]

var running := false
var day := 1
var minute := 480.0
var weather := "sunny"
var _weather_hours_left := 5
var _last_hour := -1
var _acc := 0.0
var authoritative := true     # false on multiplayer clients


func set_time(d: int, m: float, w: String = "") -> void:
	day = max(1, d)
	minute = clampf(m, 0.0, 1439.99)
	_last_hour = int(minute) / 60
	if w != "" and w != weather and w in WEATHERS:
		weather = w
		weather_changed.emit(weather)


func hour() -> int:
	return int(minute) / 60


func time_string() -> String:
	return "%02d:%02d" % [int(minute) / 60, int(minute) % 60]


func day_name() -> String:
	return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(day - 1) % 7]


func is_night() -> bool:
	return minute < 6 * 60 or minute > 20 * 60 + 30


## 0 at midnight, 1 at midday; used for lighting.
func daylight() -> float:
	var t := minute / 1440.0
	return clampf(sin((t - 0.25) * TAU) * 1.4 + 0.25, 0.0, 1.0)


func _process(delta: float) -> void:
	if not running:
		return
	var mins := delta * MINUTES_PER_SECOND
	_step(mins)
	_acc += mins
	if _acc >= 1.0:
		minute_passed.emit(_acc)
		_acc = 0.0


func _step(mins: float) -> void:
	minute += mins
	while minute >= 1440.0:
		minute -= 1440.0
		if authoritative:
			day += 1
			day_changed.emit(day)
	var h := int(minute) / 60
	if h != _last_hour:
		_last_hour = h
		hour_changed.emit(h)
		if authoritative:
			_weather_hours_left -= 1
			if _weather_hours_left <= 0:
				_roll_weather()


## Skips time forward (sleeping, working). Fires day_changed for each new day.
func advance(minutes: float) -> void:
	var remaining := minutes
	while remaining > 0.0:
		var stepm := minf(remaining, 60.0)
		_step(stepm)
		remaining -= stepm
	minute_passed.emit(0.0)


func _roll_weather() -> void:
	var r := randf()
	var w := "sunny"
	if r < 0.45:
		w = "sunny"
	elif r < 0.75:
		w = "cloudy"
	else:
		w = "rain"
	_weather_hours_left = randi_range(3, 8)
	if w != weather:
		weather = w
		weather_changed.emit(weather)


func force_weather(w: String) -> void:
	if w in WEATHERS:
		weather = w
		_weather_hours_left = 6
		weather_changed.emit(weather)


func to_dict() -> Dictionary:
	return {"day": day, "minute": int(minute), "weather": weather}
