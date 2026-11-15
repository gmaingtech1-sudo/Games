class_name CityLayout
extends RefCounted
## The city's map data: a 6x6 grid of 40 m blocks separated by 10 m roads,
## districts, and every named location. Pure data + maths so the minimap,
## NPCs, traffic and the multiplayer server can use it without building meshes.
## Modular: add a block/district or a location entry here and it appears in
## the world, on the map and in navigation.

const BLOCK := 40.0
const ROAD := 10.0
const PITCH := 50.0
const N := 6
const HALF := 150.0            # roads run from -150 to +150
const SPAWN := Vector3(18.0, 0.5, -68.0)     # Central Plaza

const DISTRICTS := {
	"centre": {"name": "City Centre", "color": Color(0.78, 0.74, 0.62)},
	"shopping": {"name": "Shopping District", "color": Color(0.85, 0.6, 0.55)},
	"business": {"name": "Business District", "color": Color(0.55, 0.65, 0.85)},
	"industrial": {"name": "Industrial Area", "color": Color(0.62, 0.6, 0.55)},
	"residential": {"name": "Residential Area", "color": Color(0.7, 0.82, 0.6)},
	"park": {"name": "Riverside Park", "color": Color(0.4, 0.72, 0.4)},
	"midtown": {"name": "Midtown", "color": Color(0.75, 0.68, 0.8)},
}

# District of each block, rows are z (north to south), columns are x.
const BLOCK_DISTRICTS := [
	["residential", "residential", "park", "park", "business", "business"],
	["shopping", "shopping", "centre", "centre", "business", "business"],
	["shopping", "shopping", "centre", "centre", "business", "business"],
	["residential", "residential", "midtown", "midtown", "industrial", "industrial"],
	["residential", "residential", "midtown", "midtown", "industrial", "industrial"],
	["residential", "residential", "midtown", "midtown", "industrial", "industrial"],
]

# Blocks that are open spaces instead of buildings.
const OPEN_BLOCKS := {
	Vector2i(2, 0): "park", Vector2i(3, 0): "park", Vector2i(3, 1): "plaza",
	Vector2i(5, 0): "events", Vector2i(0, 0): "mansion",
}

## Named locations. block = Vector2i(x, z), lot 0..3 (NW, NE, SW, SE), or lot -1 for
## a whole-block site. "features" decide what the location menu offers.
const LOCATIONS := {
	"supermarket": {"name": "FreshMart Supermarket", "block": Vector2i(0, 1), "lot": 0, "h": 9, "color": 2, "features": ["shop:supermarket", "work"]},
	"cafe": {"name": "Priya's Café", "block": Vector2i(0, 1), "lot": 1, "h": 7, "color": 5, "features": ["services:cafe"]},
	"restaurant": {"name": "The Golden Fork", "block": Vector2i(0, 1), "lot": 2, "h": 8, "color": 4, "features": ["services:restaurant"]},
	"clothing": {"name": "Urban Wardrobe", "block": Vector2i(0, 1), "lot": 3, "h": 10, "color": 6, "features": ["shop:clothing"]},
	"tech": {"name": "PixelPoint Electronics", "block": Vector2i(1, 1), "lot": 0, "h": 11, "color": 1, "features": ["shop:tech"]},
	"furniture": {"name": "HomeStyle Furniture", "block": Vector2i(1, 1), "lot": 1, "h": 9, "color": 3, "features": ["shop:furniture"]},
	"biz_clothing": {"name": "Threads Boutique", "block": Vector2i(1, 1), "lot": 2, "h": 8, "color": 6, "features": ["biz:clothing_shop"]},
	"biz_restaurant": {"name": "Corner Bistro", "block": Vector2i(1, 1), "lot": 3, "h": 7, "color": 4, "features": ["biz:restaurant"]},
	"biz_supermarket": {"name": "Neighbourhood Grocer", "block": Vector2i(0, 2), "lot": 0, "h": 8, "color": 2, "features": ["biz:supermarket"]},
	"biz_tech": {"name": "Circuit City Tech", "block": Vector2i(0, 2), "lot": 1, "h": 10, "color": 1, "features": ["biz:tech_shop"]},
	"city_hall": {"name": "City Hall & Job Centre", "block": Vector2i(2, 1), "lot": 0, "h": 22, "color": 0, "features": ["jobs", "challenges", "atm"]},
	"bank": {"name": "City Bank", "block": Vector2i(2, 1), "lot": 1, "h": 26, "color": 7, "features": ["bank", "work"]},
	"estate_agent": {"name": "Aisha Khan Lettings", "block": Vector2i(2, 1), "lot": 2, "h": 14, "color": 5, "features": ["estate"]},
	"police_station": {"name": "City Police Station", "block": Vector2i(2, 2), "lot": 0, "h": 16, "color": 1, "features": ["work", "police_info"]},
	"hostel": {"name": "Backpackers Hostel", "block": Vector2i(2, 2), "lot": 1, "h": 12, "color": 3, "features": ["services:hostel"]},
	"gym": {"name": "Leisure Centre", "block": Vector2i(2, 2), "lot": 2, "h": 10, "color": 6, "features": ["services:gym"]},
	"hospital": {"name": "St. Aurelia Hospital", "block": Vector2i(3, 2), "lot": 0, "h": 24, "color": 0, "features": ["services:hospital", "work"]},
	"office_tower": {"name": "Meridian Tower", "block": Vector2i(4, 1), "lot": 0, "h": 72, "color": 7, "features": ["work"]},
	"business_centre": {"name": "Apex Business Centre", "block": Vector2i(4, 1), "lot": 1, "h": 48, "color": 1, "features": ["business", "work", "challenges"]},
	"events": {"name": "Events Plaza", "block": Vector2i(5, 0), "lot": -1, "h": 0, "color": 0, "features": ["race", "challenges"]},
	"college": {"name": "City College", "block": Vector2i(2, 3), "lot": 0, "h": 14, "color": 4, "features": ["college"]},
	"dealership": {"name": "Motor City Dealership", "block": Vector2i(4, 3), "lot": 0, "h": 9, "color": 7, "features": ["dealership"]},
	"biz_dealership": {"name": "Prestige Motors", "block": Vector2i(5, 3), "lot": 0, "h": 9, "color": 7, "features": ["biz:car_dealership"]},
	"depot": {"name": "SwiftParcel Depot", "block": Vector2i(4, 4), "lot": 0, "h": 10, "color": 3, "features": ["work"]},
	"garage": {"name": "Gearhead Garage", "block": Vector2i(4, 4), "lot": 1, "h": 8, "color": 2, "features": ["garage", "shop:garage", "work"]},
	"fuel_station": {"name": "Fuel Station", "block": Vector2i(4, 4), "lot": 2, "h": 0, "color": 0, "features": ["fuel", "shop:supermarket"]},
	"biz_garage": {"name": "Quickfix Auto", "block": Vector2i(4, 4), "lot": 3, "h": 8, "color": 2, "features": ["biz:repair_garage"]},
	"studio_1": {"name": "Ashgrove Court", "block": Vector2i(0, 3), "lot": 0, "h": 16, "color": 5, "features": ["home:studio_1"], "style": "apartment"},
	"studio_2": {"name": "Canal View Flats", "block": Vector2i(1, 3), "lot": 1, "h": 18, "color": 3, "features": ["home:studio_2"], "style": "apartment"},
	"small_house_1": {"name": "14 Elm Road", "block": Vector2i(0, 4), "lot": 0, "h": 6, "color": 4, "features": ["home:small_house_1"], "style": "house"},
	"small_house_2": {"name": "22 Elm Road", "block": Vector2i(0, 4), "lot": 1, "h": 6, "color": 6, "features": ["home:small_house_2"], "style": "house"},
	"family_house_1": {"name": "7 Willow Crescent", "block": Vector2i(1, 4), "lot": 2, "h": 8, "color": 0, "features": ["home:family_house_1"], "style": "house"},
	"luxury_house_1": {"name": "The Glasshouse", "block": Vector2i(1, 0), "lot": 0, "h": 9, "color": 7, "features": ["home:luxury_house_1"], "style": "luxury"},
	"mansion_1": {"name": "Hartwell Manor", "block": Vector2i(0, 0), "lot": -1, "h": 12, "color": 0, "features": ["home:mansion_1"], "style": "mansion"},
	"park": {"name": "Riverside Park", "block": Vector2i(2, 0), "lot": -1, "h": 0, "color": 0, "features": [], "pos": Vector3(-25, 0, -125)},
	"plaza": {"name": "Central Plaza", "block": Vector2i(3, 1), "lot": -1, "h": 0, "color": 0, "features": [], "pos": Vector3(25, 0, -75)},
	"fountain": {"name": "Park Fountain", "block": Vector2i(2, 0), "lot": -1, "h": 0, "color": 0, "features": [], "pos": Vector3(0, 0, -125)},
	# NPC homes (not enterable)
	"home_a": {"name": "Rowan House", "block": Vector2i(0, 3), "lot": 1, "h": 7, "color": 3, "features": [], "style": "house"},
	"home_b": {"name": "Birch House", "block": Vector2i(0, 3), "lot": 2, "h": 7, "color": 5, "features": [], "style": "house"},
	"home_c": {"name": "Cedar House", "block": Vector2i(0, 3), "lot": 3, "h": 7, "color": 6, "features": [], "style": "house"},
	"home_d": {"name": "Maple Flats", "block": Vector2i(1, 3), "lot": 0, "h": 14, "color": 4, "features": [], "style": "apartment"},
	"home_e": {"name": "Hazel House", "block": Vector2i(1, 3), "lot": 2, "h": 7, "color": 0, "features": [], "style": "house"},
	"home_f": {"name": "Linden Flats", "block": Vector2i(1, 3), "lot": 3, "h": 15, "color": 1, "features": [], "style": "apartment"},
	"home_g": {"name": "Aspen House", "block": Vector2i(0, 5), "lot": 0, "h": 7, "color": 2, "features": [], "style": "house"},
	"home_h": {"name": "Willow House", "block": Vector2i(1, 5), "lot": 1, "h": 7, "color": 6, "features": [], "style": "house"},
	"home_lux": {"name": "Hillside Villa", "block": Vector2i(1, 0), "lot": 1, "h": 9, "color": 7, "features": [], "style": "luxury"},
}

# Hidden collectible spots (positions). See ActionRouter.COLLECTIBLE_SPOTS.
const COLLECTIBLES := {
	"c_park_bench": Vector3(-40, 0.4, -112), "c_fountain": Vector3(6, 0.4, -128), "c_alley": Vector3(-125, 0.4, -50),
	"c_dock": Vector3(140, 0.4, 140), "c_rooftop": Vector3(75, 0.4, 25), "c_plaza": Vector3(36, 0.4, -64),
	"c_depot": Vector3(62, 0.4, 92), "c_hill": Vector3(-140, 0.4, -140), "c_college": Vector3(-38, 0.4, 14), "c_stadium": Vector3(138, 0.4, -112),
}

# Time-trial and race routes (lists of checkpoint positions on roads).
const ROUTES := {
	"tt_centre": [Vector3(-50, 0, -100), Vector3(0, 0, -100), Vector3(50, 0, -100), Vector3(50, 0, -50), Vector3(50, 0, 0), Vector3(0, 0, 0), Vector3(-50, 0, 0), Vector3(-50, 0, -50), Vector3(-50, 0, -98)],
	"tt_ring": [Vector3(-150, 0, -150), Vector3(0, 0, -150), Vector3(150, 0, -150), Vector3(150, 0, 0), Vector3(150, 0, 150), Vector3(0, 0, 150), Vector3(-150, 0, 150), Vector3(-150, 0, 0), Vector3(-150, 0, -148)],
	"race": [Vector3(150, 0, -110), Vector3(150, 0, -50), Vector3(100, 0, -50), Vector3(100, 0, 50), Vector3(150, 0, 50), Vector3(150, 0, 150), Vector3(50, 0, 150), Vector3(50, 0, 100), Vector3(0, 0, 100), Vector3(0, 0, 0), Vector3(50, 0, 0), Vector3(50, 0, -100), Vector3(100, 0, -100), Vector3(100, 0, -150), Vector3(150, 0, -150), Vector3(150, 0, -112)],
}


static func block_center(b: Vector2i) -> Vector3:
	return Vector3(-125.0 + PITCH * b.x, 0.0, -125.0 + PITCH * b.y)


static func lot_center(b: Vector2i, lot: int) -> Vector3:
	var c := block_center(b)
	if lot < 0:
		return c
	var ox := -10.0 if lot % 2 == 0 else 10.0
	var oz := -10.0 if lot < 2 else 10.0
	return c + Vector3(ox, 0, oz)


## Direction the building's door faces (towards the nearest road).
static func door_dir(lot: int) -> Vector3:
	return Vector3(0, 0, -1) if lot < 2 else Vector3(0, 0, 1)


## Where the player stands to interact with a location.
static func location_pos(id: String) -> Vector3:
	var l: Dictionary = LOCATIONS.get(id, {})
	if l.is_empty():
		return Vector3.ZERO
	if l.has("pos"):
		return l["pos"]
	var lot: int = l["lot"]
	if lot < 0:
		var c := block_center(l["block"])
		return c + Vector3(0, 0, -18.0)
	return lot_center(l["block"], lot) + door_dir(lot) * 9.3


static func district_of_block(b: Vector2i) -> String:
	if b.x < 0 or b.y < 0 or b.x >= N or b.y >= N:
		return ""
	return BLOCK_DISTRICTS[b.y][b.x]


static func block_at(pos: Vector3) -> Vector2i:
	return Vector2i(int(floor((pos.x + HALF) / PITCH)), int(floor((pos.z + HALF) / PITCH)))


static func district_at(pos: Vector3) -> String:
	if absf(pos.x) > HALF + 5 or absf(pos.z) > HALF + 5:
		return ""
	var b := block_at(pos)
	b.x = clampi(b.x, 0, N - 1)
	b.y = clampi(b.y, 0, N - 1)
	return district_of_block(b)


static func road_line(i: int) -> float:
	return -HALF + PITCH * i


## Nearest road intersection to a position.
static func nearest_node(pos: Vector3) -> Vector2i:
	return Vector2i(clampi(int(round((pos.x + HALF) / PITCH)), 0, N), clampi(int(round((pos.z + HALF) / PITCH)), 0, N))


static func node_pos(n: Vector2i) -> Vector3:
	return Vector3(road_line(n.x), 0, road_line(n.y))


## Path along the road grid between two intersections (Manhattan, x first).
static func grid_path(a: Vector2i, b: Vector2i) -> Array:
	var out := []
	var cur := a
	out.append(cur)
	while cur.x != b.x:
		cur.x += signi(b.x - cur.x)
		out.append(cur)
	while cur.y != b.y:
		cur.y += signi(b.y - cur.y)
		out.append(cur)
	return out


static func location_district(id: String) -> String:
	var l: Dictionary = LOCATIONS.get(id, {})
	if l.is_empty():
		return ""
	return district_of_block(l["block"])


static func location_name(id: String) -> String:
	return str(LOCATIONS.get(id, {}).get("name", id))
