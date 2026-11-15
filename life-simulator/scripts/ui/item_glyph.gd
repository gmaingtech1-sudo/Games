class_name ItemGlyph
extends RefCounted
## Short text glyphs used inside item icon tiles (works with the default font,
## no emoji needed).

const GLYPHS := {
	"food": "F", "drink": "D", "clothing": "C", "electronics": "E", "furniture": "H",
	"tools": "T", "vehicle_parts": "V", "collectibles": "★",
}


static func glyph(item_id: String) -> String:
	var it := DataDB.item(item_id)
	var name := str(it.get("name", "?"))
	var words := name.split(" ", false)
	if words.size() >= 2:
		return (words[0].substr(0, 1) + words[1].substr(0, 1)).to_upper()
	return name.substr(0, 2)
