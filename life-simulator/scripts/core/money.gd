class_name Money
extends RefCounted
## Money helpers. All money in the game is stored as integer pence.


static func fmt(pence: int, show_pence: bool = false) -> String:
	var neg := pence < 0
	var p: int = abs(pence)
	var pounds: int = p / 100
	var rem: int = p % 100
	var s := str(pounds)
	var out := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		count += 1
		if count % 3 == 0 and i > 0:
			out = "," + out
	var res := "£" + out
	if show_pence or (rem != 0 and pounds < 1000):
		res += "." + ("%02d" % rem)
	return ("-" if neg else "") + res


static func p(pounds: float) -> int:
	return int(round(pounds * 100.0))
