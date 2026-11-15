class_name Interactable
extends Area3D
## Something the player can interact with. The player tracks overlapping
## Interactables and the HUD shows a prompt for the nearest one.
## kind: "location", "bench", "atm", "vehicle", "npc", "collectible", "bed",
##       "shower", "fridge", "sofa", "exit", "tv", "checkpoint", "decorate"

var kind := "location"
var target_id := ""
var prompt := "Interact"
var data := {}


static func make(p_kind: String, p_id: String, p_prompt: String, radius: float = 2.2, height: float = 3.0) -> Interactable:
	var a := Interactable.new()
	a.kind = p_kind
	a.target_id = p_id
	a.prompt = p_prompt
	a.collision_layer = 16      # layer 5 "interact"
	a.collision_mask = 2        # detects the player (layer 2)
	a.monitorable = true
	a.monitoring = false
	var cs := CollisionShape3D.new()
	var sh := CylinderShape3D.new()
	sh.radius = radius
	sh.height = height
	cs.shape = sh
	cs.position.y = height * 0.5
	a.add_child(cs)
	return a
