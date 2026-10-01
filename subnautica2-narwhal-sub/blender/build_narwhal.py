"""Builds the Narwhal, a new Tadpole chassis for Subnautica 2, in Blender.

Run it with Blender 4.2 or later (tested with 5.0):

    blender --background --python blender/build_narwhal.py

or from Blender's Scripting tab with Run Script. Run it from the
subnautica2-narwhal-sub folder. It writes:

    blender/Narwhal.blend               the model, ready to tweak by hand
    export/SM_Narwhal_Chassis.fbx       deployed chassis, with UCX_ collision
    export/SM_Narwhal_Chassis_Collapsed.fbx
    export/SM_Narwhal_DeployedCollision.fbx
    export/SM_Narwhal_CollapsedCollision.fbx
    export/Narwhal.glb                  for quick previews in any 3D viewer
    previews/*.png                      Cycles renders (skip with --no-render)
    NarwhalChassis/Resources/Icon128.png the plugin's icon

Axes and units match Unreal: 1 Blender unit = 1 metre = 100 Unreal units,
the nose points along +X and up is +Z. The origin is the middle of the
cradle where the Tadpole pod sits. The game's Tadpole is a capsule 80 cm in
radius with a 96 cm half-height (from SN2Tadpole's CollisionCylinder), and
nothing here comes inside that space when deployed.
"""

import math
import os
import sys

import bpy  # first: bmesh and mathutils come with it when run outside Blender
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EXPORT_DIR = os.path.join(ROOT, "export")
PREVIEW_DIR = os.path.join(ROOT, "previews")
RENDER = "--no-render" not in sys.argv

# The Tadpole pod's capsule, in metres.
POD_RADIUS = 0.80
POD_HALF_HEIGHT = 0.96


# -----------------------------------------------------------------------------
# Scene and materials
# -----------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def material(name, color, metallic=0.0, roughness=0.5, emission=None, strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    if not mat.node_tree:
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        bsdf.inputs["Transmission Weight"].default_value = 1.0
    mat.diffuse_color = (*color, alpha)
    return mat


def make_materials():
    # Slot names become Unreal material slots; keep them stable.
    return {
        "hull": material("M_Narwhal_Hull", (0.035, 0.24, 0.32), metallic=0.25, roughness=0.32),
        "belly": material("M_Narwhal_Belly", (0.80, 0.82, 0.78), metallic=0.1, roughness=0.45),
        "trim": material("M_Narwhal_Trim", (0.045, 0.05, 0.055), metallic=0.85, roughness=0.3),
        "tusk": material("M_Narwhal_Tusk", (0.90, 0.85, 0.70), roughness=0.38),
        "glow": material("M_Narwhal_Glow", (0.6, 0.95, 1.0), emission=(0.45, 0.9, 1.0), strength=12.0),
    }


# -----------------------------------------------------------------------------
# Mesh helpers. Everything is built with bmesh, so it runs headless.
# -----------------------------------------------------------------------------

def new_object(name, bm, mat):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def ellipsoid(name, center, scale, mat, segments=48, rings=24):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return new_object(name, bm, mat)


def _frame(tangent):
    up = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((0, 1, 0))
    side = tangent.cross(up).normalized()
    normal = side.cross(tangent).normalized()
    return side, normal


def tube(name, points, radii, mat, sides=16, twist=0.0, cap=True):
    """A tube through `points`. `radii` is one radius or one per point.
    `twist` turns the cross-section by that many radians from end to end."""
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(points)
    pts = [Vector(p) for p in points]
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        side, normal = _frame((b - a).normalized())
        turn = twist * i / max(len(pts) - 1, 1)
        ring = []
        for s in range(sides):
            ang = 2 * math.pi * s / sides + turn
            r = radii[i]
            ring.append(bm.verts.new(p + (side * math.cos(ang) + normal * math.sin(ang)) * r))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for s in range(sides):
            bm.faces.new((r0[s], r0[(s + 1) % sides], r1[(s + 1) % sides], r1[s]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, mat)


def arc_points(center, radius, start_deg, end_deg, steps, plane="YZ"):
    pts = []
    for i in range(steps + 1):
        a = math.radians(start_deg + (end_deg - start_deg) * i / steps)
        u, v = math.cos(a) * radius, math.sin(a) * radius
        if plane == "YZ":
            pts.append((center[0], center[1] + u, center[2] + v))
        else:  # XZ
            pts.append((center[0] + u, center[1], center[2] + v))
    return pts


def slab(name, outline, thickness, mat, z=0.0):
    """A flat plate from an XY outline, `thickness` deep, with softened edges."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z)) for x, y in outline]
    face = bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=[face])
    obj = new_object(name, bm, mat)
    solid = obj.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0.0
    bevel = obj.modifiers.new("Bevel", "BEVEL")
    bevel.width = thickness * 0.35
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    return obj


def box(name, center, size, mat, bevel_width=0.02):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = new_object(name, bm, mat)
    if bevel_width:
        bev = obj.modifiers.new("Bevel", "BEVEL")
        bev.width = bevel_width
        bev.segments = 2
    return obj


def cylinder(name, center, radius, depth, mat, axis="X", sides=32, open_ends=False, wall=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=not open_ends, segments=sides,
                          radius1=radius, radius2=radius, depth=depth)
    if axis == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "Y"))
    elif axis == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "X"))
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    obj = new_object(name, bm, mat)
    if wall:
        solid = obj.modifiers.new("Solidify", "SOLIDIFY")
        solid.thickness = wall
        solid.offset = 0.0
    return obj


def countershade(obj, top_mat, belly_mat, threshold=-0.3):
    """Whale-style colouring: faces pointing down get the pale belly material."""
    obj.data.materials.clear()
    obj.data.materials.append(top_mat)
    obj.data.materials.append(belly_mat)
    for poly in obj.data.polygons:
        poly.material_index = 1 if poly.normal.z < threshold else 0


def rotate_object(obj, angle_deg, axis, pivot):
    """Rotate an object's mesh about a world-space pivot."""
    pivot = Vector(pivot)
    rot = Matrix.Rotation(math.radians(angle_deg), 4, axis)
    obj.data.transform(Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot))


def mirror_y(obj):
    obj.data.transform(Matrix.Scale(-1, 4, (0, 1, 0)))
    obj.data.flip_normals()


def duplicate(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    bpy.context.scene.collection.objects.link(copy)
    return copy


# -----------------------------------------------------------------------------
# The Narwhal
# -----------------------------------------------------------------------------

def build_side(mats, side, collapsed):
    """One pontoon with its thruster, lights and handle. side is +1 or -1."""
    parts = []
    y = (0.55 if collapsed else 1.15) * side
    pz = -0.25

    pontoon = ellipsoid(f"Pontoon_{side}", (-0.15, y, pz), (1.75, 0.32, 0.36), mats["hull"])
    countershade(pontoon, mats["hull"], mats["belly"])
    parts.append(pontoon)

    # Ducted thruster at the back of the pontoon.
    duct = cylinder(f"Duct_{side}", (-2.05, y, pz), 0.27, 0.42, mats["trim"], open_ends=True, wall=0.05)
    parts.append(duct)
    parts.append(tube(f"DuctStrut_{side}", [(-1.85, y, pz), (-2.05, y, pz)], 0.07, mats["trim"], sides=12))
    hub = ellipsoid(f"PropHub_{side}", (-2.12, y, pz), (0.12, 0.07, 0.07), mats["trim"], 24, 12)
    parts.append(hub)
    for b in range(5):
        blade = box(f"Blade_{side}_{b}", (-2.12, y, pz + 0.12), (0.03, 0.09, 0.2), mats["trim"], 0.008)
        rotate_object(blade, 25 * side, "Z", (-2.12, y, pz))           # pitch
        rotate_object(blade, b * 72, "X", (-2.12, y, pz))              # spread
        parts.append(blade)
    parts.append(cylinder(f"ThrustGlow_{side}", (-1.88, y, pz), 0.2, 0.02, mats["glow"]))

    # Running light strip along the outside of the pontoon.
    strip = tube(f"LightStrip_{side}",
                 [(-1.3, y + 0.3 * side, pz + 0.05), (-0.2, y + 0.33 * side, pz + 0.07), (0.9, y + 0.28 * side, pz + 0.05)],
                 0.025, mats["glow"], sides=8)
    parts.append(strip)

    # Grab handle on top, for climbing aboard.
    parts.append(tube(f"Handle_{side}", arc_points((-0.2, y, pz + 0.33), 0.22, 0, 180, 12, plane="XZ"),
                      0.025, mats["trim"], sides=10))
    return parts


def build_narwhal(mats, collapsed=False):
    parts = []
    for side in (1, -1):
        parts += build_side(mats, side, collapsed)

    # Cradle arcs under the pod, joining the pontoons. Worked out so they
    # pass through both pontoons and bottom out at z = -1.2.
    if collapsed:
        for x in (0.55, -0.55):
            parts.append(tube(f"Cradle_{x}", [(x, -0.55, -0.25), (x, 0, -0.45), (x, 0.55, -0.25)], 0.09, mats["trim"]))
    else:
        radius, cz = 1.171, -0.029
        for x in (0.55, -0.55):
            parts.append(tube(f"Cradle_{x}", arc_points((x, 0, cz), radius, -10.9, -169.1, 24), 0.09, mats["trim"]))
        parts.append(ellipsoid("Keel", (0, 0, -1.22), (0.75, 0.16, 0.08), mats["trim"], 32, 12))

    # Yokes: the spars that tie the pontoons to the head and tail.
    span = 0.55 if collapsed else 1.15
    for x in (1.2, -1.35):
        parts.append(tube(f"Yoke_{x}", [(x, -span, -0.25), (x, 0, -0.2), (x, span, -0.25)], 0.1, mats["trim"]))

    head_x = 1.5 if collapsed else 2.0
    head = ellipsoid("Head", (head_x, 0, -0.15), (1.05, 0.85, 0.58), mats["hull"])
    countershade(head, mats["hull"], mats["belly"])
    parts.append(head)

    # The tusk: a long spiral horn with a sensor at the tip. It folds away
    # into the head when collapsed.
    tusk_len = 0.4 if collapsed else 1.45
    base = Vector((head_x + 0.98, 0, -0.1))
    n = 40
    pts = [base + Vector((tusk_len * i / n, 0, 0.06 * tusk_len * (i / n) ** 2)) for i in range(n + 1)]
    radii = [0.1 * (1 - i / n) ** 0.8 + 0.008 for i in range(n + 1)]
    parts.append(tube("Tusk", pts, radii, mats["tusk"], sides=6, twist=math.radians(900 * tusk_len / 1.45)))
    parts.append(ellipsoid("TuskSensor", tuple(pts[-1]), (0.03, 0.03, 0.03), mats["glow"], 12, 8))

    # Headlights either side of the tusk.
    for side in (1, -1):
        lx, ly, lz = head_x + 0.76, 0.45 * side, 0.02
        parts.append(cylinder(f"Lamp_{side}", (lx, ly, lz), 0.11, 0.16, mats["trim"]))
        parts.append(cylinder(f"Lens_{side}", (lx + 0.085, ly, lz), 0.085, 0.02, mats["glow"]))

    # Little canard fins on the cheeks.
    canard = slab("Canard", [(0, 0), (-0.32, 0.0), (-0.42, 0.38), (-0.22, 0.4)], 0.05, mats["hull"])
    canard.data.transform(Matrix.Translation((head_x - 0.1, 0.72, -0.3)))
    if collapsed:
        rotate_object(canard, 80, "X", (head_x, 0.72, -0.3))
    parts.append(canard)
    other = duplicate(canard, "Canard_L")
    mirror_y(other)
    parts.append(other)

    # Tail boom and flukes behind the pod.
    tail_x = -1.55 if collapsed else -1.95
    tail = ellipsoid("Tail", (tail_x, 0, -0.2), (0.95, 0.5, 0.42), mats["hull"])
    countershade(tail, mats["hull"], mats["belly"])
    parts.append(tail)

    fluke_outline = [(0.0, 0.0), (-0.25, 0.35), (-0.5, 0.85), (-0.78, 1.08), (-0.72, 0.72),
                     (-0.6, 0.32), (-0.66, 0.0)]
    full = fluke_outline + [(x, -y) for x, y in reversed(fluke_outline[1:-1])]
    fluke = slab("Flukes", full, 0.08, mats["hull"])
    fluke.data.transform(Matrix.Translation((tail_x - 0.75, 0, -0.18)))
    if collapsed:
        rotate_object(fluke, 90, "X", (tail_x - 0.75, 0, -0.18))
    parts.append(fluke)

    # Ridge along the back of the tail, the narwhal's dorsal bump.
    parts.append(tube("Ridge", [(tail_x + 0.7, 0, 0.12), (tail_x, 0, 0.24), (tail_x - 0.7, 0, 0.1)],
                      [0.04, 0.07, 0.03], mats["trim"], sides=10))
    return parts


def finish(parts, name):
    """Apply modifiers, join, smooth, UV-unwrap and centre on the cradle."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    # A second UV channel for lightmaps, which Unreal expects on static meshes.
    obj.data.uv_layers.new(name="Lightmap")
    return obj


def convex_hull(name, source, region):
    """A convex hull of the source's vertices inside an axis-aligned box."""
    (x0, y0, z0), (x1, y1, z1) = region
    bm = bmesh.new()
    for v in source.data.vertices:
        co = source.matrix_world @ v.co
        if x0 <= co.x <= x1 and y0 <= co.y <= y1 and z0 <= co.z <= z1:
            bm.verts.new(co)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    # Keep collision light: hulls the game can test quickly.
    bmesh.ops.dissolve_degenerate(bm, dist=0.01, edges=bm.edges)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.display_type = "WIRE"
    return obj


def collision_hulls(source, base_name, collapsed):
    """Several convex pieces, named UCX_<mesh>_NN so Unreal uses them as collision."""
    if collapsed:
        regions = [((-0.2, -1, -1), (3.5, 1, 1)), ((-3, -1, -1), (-0.2, 1, 1))]
    else:
        regions = [
            ((-2.6, 0.7, -0.7), (1.7, 1.6, 0.3)),     # right pontoon
            ((-2.6, -1.6, -0.7), (1.7, -0.7, 0.3)),   # left pontoon
            ((0.95, -1.0, -1.0), (4.8, 1.0, 1.0)),    # head and tusk
            ((-3.8, -1.2, -0.8), (-0.95, 1.2, 0.5)),  # tail and flukes
            ((-0.7, -0.75, -1.4), (0.7, 0.75, -0.95)),  # keel
        ]
    return [convex_hull(f"UCX_{base_name}_{i:02d}", source, r) for i, r in enumerate(regions)]


def check_pod_clearance(obj):
    """Fail loudly if any deployed vertex sits inside the Tadpole's capsule."""
    worst = None
    for v in obj.data.vertices:
        co = obj.matrix_world @ v.co
        z = max(-(POD_HALF_HEIGHT - POD_RADIUS), min(POD_HALF_HEIGHT - POD_RADIUS, co.z))
        dist = (Vector((co.x, co.y, co.z - z))).length
        if worst is None or dist < worst:
            worst = dist
    print(f"[Narwhal] closest point to the Tadpole capsule axis: {worst:.3f} m (capsule radius {POD_RADIUS} m)")
    if worst < POD_RADIUS:
        raise SystemExit("[Narwhal] the chassis cuts into the Tadpole pod")
    return worst


def export_fbx(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"MESH"},
        mesh_smooth_type="FACE",
        use_mesh_modifiers=True,
        add_leaf_bones=False,
        bake_anim=False,
        axis_forward="-Z",
        axis_up="Y",
    )
    print(f"[Narwhal] wrote {os.path.relpath(path, ROOT)}")


# -----------------------------------------------------------------------------
# Preview renders
# -----------------------------------------------------------------------------

def setup_render(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    try:
        scene.cycles.use_denoising = True
    except AttributeError:
        pass
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"

    world = bpy.data.worlds.new("Ocean")
    scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.006, 0.05, 0.085, 1.0)
    bg.inputs["Strength"].default_value = 1.0

    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 2.6
    sun.color = (0.75, 0.92, 1.0)
    sun_obj = bpy.data.objects.new("Sun", sun)
    sun_obj.rotation_euler = (math.radians(35), math.radians(-20), math.radians(30))
    scene.collection.objects.link(sun_obj)

    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 900
    fill.size = 6
    fill.color = (0.5, 0.8, 1.0)
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.location = (-4, -6, -3)
    fill_obj.rotation_euler = (math.radians(120), 0, math.radians(-35))
    scene.collection.objects.link(fill_obj)

    floor_mat = material("Sand", (0.10, 0.09, 0.065), roughness=0.95)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200)
    bmesh.ops.translate(bm, vec=Vector((0, 0, -1.9)), verts=bm.verts)
    new_object("Seabed", bm, floor_mat)


def ghost_pod(mat):
    """A stand-in for the Tadpole, only for the preview renders."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=POD_RADIUS)
    for v in bm.verts:
        v.co.z += (POD_HALF_HEIGHT - POD_RADIUS) * (1 if v.co.z > 0 else -1)
    return new_object("TadpoleStandIn", bm, mat)


def render(scene, path, location, target=(0.3, 0, -0.25), lens=35):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = location
    direction = Vector(target) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    print(f"[Narwhal] rendered {os.path.relpath(path, ROOT)}")


# -----------------------------------------------------------------------------

def main():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene = reset_scene()
    mats = make_materials()

    deployed = finish(build_narwhal(mats), "SM_Narwhal_Chassis")
    check_pod_clearance(deployed)
    deployed_ucx = collision_hulls(deployed, "SM_Narwhal_Chassis", collapsed=False)
    for hull in deployed_ucx:
        check_pod_clearance(hull)

    collapsed = finish(build_narwhal(mats, collapsed=True), "SM_Narwhal_Chassis_Collapsed")
    collapsed_ucx = collision_hulls(collapsed, "SM_Narwhal_Chassis_Collapsed", collapsed=True)

    tris = sum(len(p.vertices) - 2 for p in deployed.data.polygons)
    print(f"[Narwhal] deployed mesh: {tris} triangles, {len(deployed.data.materials)} material slots")

    export_fbx(os.path.join(EXPORT_DIR, "SM_Narwhal_Chassis.fbx"), [deployed] + deployed_ucx)
    export_fbx(os.path.join(EXPORT_DIR, "SM_Narwhal_Chassis_Collapsed.fbx"), [collapsed] + collapsed_ucx)

    # The chassis class also wants plain collision meshes of its own
    # (UWEVehicleChassis.DeployedCollision / CollapsedCollision).
    for src_hulls, label in ((deployed_ucx, "Deployed"), (collapsed_ucx, "Collapsed")):
        copies = [duplicate(h, f"{h.name}_copy") for h in src_hulls]
        bpy.ops.object.select_all(action="DESELECT")
        for c in copies:
            c.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = f"SM_Narwhal_{label}Collision"
        export_fbx(os.path.join(EXPORT_DIR, f"SM_Narwhal_{label}Collision.fbx"), [joined])
        joined.hide_render = True
        joined.hide_set(True)

    bpy.ops.object.select_all(action="DESELECT")
    deployed.select_set(True)
    collapsed.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(EXPORT_DIR, "Narwhal.glb"), use_selection=True,
                              export_format="GLB")
    print("[Narwhal] wrote export/Narwhal.glb")

    for o in deployed_ucx + collapsed_ucx:
        o.hide_render = True

    # Side by side in the .blend.
    collapsed.location.y = 6.0
    for o in collapsed_ucx:
        o.location.y = 6.0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "Narwhal.blend"))
    print("[Narwhal] saved blender/Narwhal.blend")

    if not RENDER:
        return
    setup_render(scene)
    collapsed.hide_render = True
    pod_mat = material("TadpoleStandIn", (0.95, 0.6, 0.15), roughness=0.4, alpha=0.35)
    pod = ghost_pod(pod_mat)
    pod.hide_render = True
    render(scene, os.path.join(PREVIEW_DIR, "narwhal_hero.png"), (6.2, -5.4, 2.2))
    render(scene, os.path.join(PREVIEW_DIR, "narwhal_side.png"), (0.4, -9.5, -0.1), lens=40)
    render(scene, os.path.join(PREVIEW_DIR, "narwhal_rear.png"), (-6.5, 4.2, 1.6))

    scene.render.resolution_x = scene.render.resolution_y = 128
    render(scene, os.path.join(ROOT, "NarwhalChassis", "Resources", "Icon128.png"), (5.0, -5.0, 3.2), lens=26)
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    pod.hide_render = False
    render(scene, os.path.join(PREVIEW_DIR, "narwhal_with_tadpole.png"), (3.5, -6.2, 4.8))
    pod.hide_render = True
    deployed.hide_render = True
    collapsed.hide_render = False
    collapsed.location.y = 0.0
    render(scene, os.path.join(PREVIEW_DIR, "narwhal_collapsed.png"), (5.0, -4.6, 2.0))


if __name__ == "__main__":
    main()
