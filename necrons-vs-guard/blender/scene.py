"""The Silent Harvest, 3D version. Builds the whole scene in Blender and renders it with Cycles.

    python3 scene.py test FRAME          # one still, written to ./test_FRAME.png
    python3 scene.py render START END    # frames START..END to ./frames/

Needs the `bpy` pip package. Everything here is built from primitives; there are no imported models.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

FPS = 24
TOTAL = 20 * FPS          # 480 frames
RX, RY = 1152, 480
HERE = os.path.dirname(os.path.abspath(__file__))
rng = random.Random(40)


def f(sec):
    return int(round(sec * FPS)) + 1


# ------------------------------------------------------------------ helpers
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, TOTAL
scene.render.resolution_x, scene.render.resolution_y = int(os.environ.get("RX", RX)), int(os.environ.get("RY", RY))
scene.render.resolution_percentage = 100

MATS = {}


def mat(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    key = (name, color, rough, metal, emit, strength)
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    MATS[key] = m
    return m


def link(o, col=None):
    return o


def obj(kind, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), m=None, parent=None, **kw):
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, **kw)
    elif kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=24, ring_count=14, location=loc, **kw)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, vertices=20, location=loc, **kw)
    elif kind == "cone":
        kw.setdefault("vertices", 20); bpy.ops.mesh.primitive_cone_add(radius1=0.5, depth=1, location=loc, **kw)
    o = bpy.context.active_object
    o.scale = scale
    o.rotation_euler = rot
    if m:
        o.data.materials.append(m)
    if parent:
        o.parent = parent
    return o


def limb(parent, loc, length, width, m, rot=(0, 0, 0)):
    """Cylinder whose origin sits at its top, so rotating it swings it like a joint."""
    o = obj("cyl", loc, (width, width, length), rot, m, parent)
    for v in o.data.vertices:
        v.co.z -= 0.5
    return o


def key_rot(o, frame, rot):
    o.rotation_euler = rot
    o.keyframe_insert("rotation_euler", frame=frame)


def key_loc(o, frame, loc):
    o.location = loc
    o.keyframe_insert("location", frame=frame)


def key_scale(o, frame, s):
    o.scale = s
    o.keyframe_insert("scale", frame=frame)


def key_vis(o, frame, visible):
    o.hide_render = not visible
    o.hide_viewport = not visible
    o.keyframe_insert("hide_render", frame=frame)
    o.keyframe_insert("hide_viewport", frame=frame)


def _fcurves(o):
    ad = o.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


def _interp(o, kind):
    for fc in _fcurves(o):
        for k in fc.keyframe_points:
            k.interpolation = kind


def linear(o):
    _interp(o, "LINEAR")


def constant(o):
    _interp(o, "CONSTANT")


def light(kind, loc, energy, color=(1, 1, 1), size=1.0, rot=(0, 0, 0)):
    d = bpy.data.lights.new("L", kind)
    d.energy = energy
    d.color = color
    if kind == "POINT":
        d.shadow_soft_size = size
    elif kind == "SUN":
        d.angle = size
    o = bpy.data.objects.new("L", d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    return o


# materials
M_SILVER = mat("silver", (0.42, 0.45, 0.43), 0.38, 1.0)
M_DARK = mat("necdark", (0.06, 0.07, 0.07), 0.6, 0.9)
M_EYE = mat("eye", (0, 0, 0), 0.3, 0, (0.1, 1, 0.3), 25)
M_GLOW = mat("glow", (0, 0, 0), 0.3, 0, (0.1, 1, 0.3), 14)
M_COAT = mat("coat", (0.12, 0.14, 0.06), 0.9)
M_HELM = mat("helm", (0.07, 0.09, 0.05), 0.55, 0.3)
M_SKIN = mat("skin", (0.45, 0.3, 0.23), 0.7)
M_GUN = mat("gun", (0.04, 0.04, 0.04), 0.5, 0.6)
M_WOOD = mat("wood", (0.12, 0.06, 0.03), 0.8)
M_BAG = mat("bag", (0.28, 0.22, 0.13), 1.0)
M_TANK = mat("tank", (0.13, 0.16, 0.07), 0.7, 0.2)
M_TRACK = mat("track", (0.03, 0.03, 0.03), 0.8, 0.3)
M_STONE = mat("stone", (0.015, 0.02, 0.02), 0.45, 0.2)
M_LASER = mat("laser", (0, 0, 0), 0.3, 0, (1, 0.1, 0.05), 40)
M_FIRE = mat("fire", (0, 0, 0), 0.3, 0, (1, 0.45, 0.08), 30)
M_SMOKE = mat("smoke", (0.02, 0.02, 0.02), 1.0)
M_BLADE = mat("blade", (0, 0, 0), 0.2, 0, (0.5, 0.7, 1), 40)
M_RED = mat("red", (0.3, 0.02, 0.02), 0.8)
M_COATBLK = mat("coatblk", (0.015, 0.015, 0.018), 0.85)


# ------------------------------------------------------------------ world, ground
def build_world():
    w = bpy.data.worlds.new("W")
    scene.world = w
    w.use_nodes = True
    n = w.node_tree.nodes
    bg = n["Background"]
    bg.inputs["Color"].default_value = (0.012, 0.02, 0.03, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc = n.new("ShaderNodeVolumeScatter")
    sc.inputs["Density"].default_value = 0.0016
    sc.inputs["Anisotropy"].default_value = 0.4
    sc.inputs["Color"].default_value = (0.5, 0.65, 0.6, 1)
    w.node_tree.links.new(sc.outputs["Volume"], n["World Output"].inputs["Volume"])
    # moon light
    light("SUN", (0, 0, 10), 0.9, (0.55, 0.7, 1.0), 0.02, (math.radians(55), 0, math.radians(-110)))


def build_ground():
    bpy.ops.mesh.primitive_plane_add(size=500, location=(0, 0, 0))
    g = bpy.context.active_object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=220)
    bpy.ops.object.mode_set(mode="OBJECT")
    tex = bpy.data.textures.new("rough", "CLOUDS")
    tex.noise_scale = 6.0
    tex.noise_depth = 4
    d = g.modifiers.new("disp", "DISPLACE")
    d.texture = tex
    d.strength = 0.9
    d.mid_level = 0.5
    m = bpy.data.materials.new("ground")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.95
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 12
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.04, 0.035, 0.028, 1)
    ramp.color_ramp.elements[1].color = (0.13, 0.115, 0.09, 1)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    g.data.materials.append(m)
    return g


# ------------------------------------------------------------------ units
def necron(x, y, face=180.0, walk=True, rise_at=None):
    root = bpy.data.objects.new("Necron", None)
    bpy.context.collection.objects.link(root)
    root.location = (x, y, 0)
    root.rotation_euler = (0, 0, math.radians(face))
    root.scale = (1.0, 1.0, 1.0)
    hipz = 0.95
    obj("cube", (0, 0, 1.45), (0.34, 0.2, 0.55), m=M_SILVER, parent=root)               # torso
    for i in range(5):                                                                    # ribs
        obj("cyl", (0.0, 0.03, 1.28 + i * 0.1), (0.4, 0.2, 0.02), (0, 0, 0), M_DARK, root)
    obj("cube", (0, 0, 1.0), (0.2, 0.14, 0.3), m=M_DARK, parent=root)                    # spine/pelvis
    head = obj("sphere", (0.0, 0.05, 1.93), (0.22, 0.26, 0.3), m=M_SILVER, parent=root)
    obj("cube", (0.0, 0.14, 1.85), (0.14, 0.1, 0.12), m=M_DARK, parent=root)              # jaw
    for sx in (-0.06, 0.06):
        obj("sphere", (sx, 0.16, 1.95), (0.04, 0.03, 0.05), m=M_EYE, parent=root)
    obj("cone", (0, -0.05, 1.8), (0.35, 0.25, 0.5), (math.pi, 0, 0), M_DARK, root)      # cowl
    legs = []
    for sx in (-0.11, 0.11):
        t = limb(root, (sx, 0, hipz), 0.47, 0.09, M_SILVER)
        t.rotation_euler = (0, 0, 0)
        k = limb(t, (0, 0, -0.47), 0.47, 0.075, M_SILVER)
        obj("cube", (0, 0.06, -0.5), (0.1, 0.22, 0.06), m=M_DARK, parent=k)
        legs.append((t, k))
    arms = []
    for sx in (-0.23, 0.23):
        a = limb(root, (sx, 0, 1.7), 0.36, 0.07, M_SILVER)
        b2 = limb(a, (0, 0, -0.36), 0.34, 0.06, M_SILVER)
        arms.append((a, b2))
    # gauss flayer held across the body
    gun = obj("cube", (0.0, 0.36, 1.45), (0.1, 0.9, 0.14), m=M_DARK, parent=root)
    obj("cyl", (0.0, 0.5, 1.5), (0.04, 0.04, 0.9), (math.pi / 2, 0, 0), M_GLOW, root)
    arms[0][0].rotation_euler = (math.radians(-60), 0, math.radians(-15))
    arms[0][1].rotation_euler = (math.radians(-40), 0, 0)
    arms[1][0].rotation_euler = (math.radians(-75), 0, math.radians(15))
    arms[1][1].rotation_euler = (math.radians(-30), 0, 0)
    root["legs"] = 0
    root.location = (x, y, 0)
    return root, legs


def guard(x, y, face=0.0, kneel=False):
    root = bpy.data.objects.new("Guard", None)
    bpy.context.collection.objects.link(root)
    root.location = (x, y, 0)
    root.rotation_euler = (0, 0, math.radians(face))
    h = 0.6 if kneel else 0.9
    obj("cube", (0, 0, h + 0.4), (0.36, 0.22, 0.6), m=M_COAT, parent=root)
    obj("cube", (0, -0.16, h + 0.45), (0.28, 0.12, 0.35), m=M_GUN, parent=root)          # pack
    obj("cube", (0, 0.12, h + 0.45), (0.3, 0.05, 0.3), m=M_HELM, parent=root)            # flak plate
    obj("sphere", (0, 0.02, h + 0.88), (0.2, 0.22, 0.24), m=M_SKIN, parent=root)
    hl = obj("sphere", (0, 0.0, h + 0.93), (0.26, 0.28, 0.24), m=M_HELM, parent=root)
    if kneel:
        obj("cyl", (-0.1, 0.1, 0.35), (0.14, 0.14, 0.6), (math.radians(80), 0, 0), M_COAT, root)
        obj("cyl", (0.1, -0.1, 0.25), (0.14, 0.14, 0.5), m=M_COAT, parent=root)
    else:
        for sx in (-0.1, 0.1):
            obj("cyl", (sx, 0, 0.45), (0.14, 0.14, 0.9), m=M_COAT, parent=root)
    obj("cube", (0.1, 0.42, h + 0.55), (0.08, 0.85, 0.12), m=M_GUN, parent=root)         # lasgun
    obj("cube", (0.1, 0.05, h + 0.5), (0.07, 0.35, 0.14), m=M_WOOD, parent=root)
    obj("cyl", (-0.2, 0.22, h + 0.45), (0.1, 0.1, 0.5), (math.radians(80), 0, math.radians(-15)), M_COAT, root)
    obj("cyl", (0.22, 0.12, h + 0.5), (0.1, 0.1, 0.45), (math.radians(80), 0, math.radians(15)), M_COAT, root)
    return root


def tank(x, y, face=0.0):
    root = bpy.data.objects.new("Tank", None)
    bpy.context.collection.objects.link(root)
    root.location = (x, y, 0)
    root.rotation_euler = (0, 0, math.radians(face))
    obj("cube", (0, 0, 1.1), (4.2, 2.6, 1.0), m=M_TANK, parent=root)
    obj("cube", (1.6, 0, 1.2), (1.6, 2.4, 0.9), (0, math.radians(-14), 0), M_TANK, root)
    for sy in (-1.5, 1.5):
        obj("cube", (0, sy, 0.6), (4.6, 0.7, 1.0), m=M_TRACK, parent=root)
        for i in range(8):
            obj("cyl", (-1.9 + i * 0.55, sy + (0.38 if sy > 0 else -0.38) * 0, 0.52), (0.5, 0.5, 0.74),
                (math.pi / 2, 0, 0), M_GUN, root)
    turret = obj("cube", (-0.2, 0, 1.95), (2.2, 2.0, 0.8), m=M_TANK, parent=root)
    obj("cyl", (-0.3, 0.4, 2.45), (0.5, 0.5, 0.2), m=M_GUN, parent=root)
    obj("cube", (-1.2, 0, 2.0), (0.9, 2.2, 0.8), m=M_TANK, parent=root)
    barrel = bpy.data.objects.new("Barrel", None)
    bpy.context.collection.objects.link(barrel)
    barrel.parent = root
    barrel.location = (0.8, 0, 2.0)
    obj("cyl", (2.2, 0, 0), (0.3, 0.3, 4.4), (0, math.pi / 2, 0), M_GUN, barrel)
    obj("cyl", (4.45, 0, 0), (0.4, 0.4, 0.3), (0, math.pi / 2, 0), M_GUN, barrel)
    for i in range(7):   # sandbags on the hull
        obj("sphere", (-1.9 + i * 0.3, -1.0, 1.7), (0.5, 0.3, 0.22), m=M_BAG, parent=root)
    obj("cyl", (-1.9, 0.7, 2.0), (0.14, 0.14, 0.8), m=M_GUN, parent=root)
    return root, barrel


def sandbag_wall(x, y, length, face=0.0, rows=2):
    root = bpy.data.objects.new("Wall", None)
    bpy.context.collection.objects.link(root)
    root.location = (x, y, 0)
    root.rotation_euler = (0, 0, math.radians(face))
    for r in range(rows):
        i = 0
        px = -length / 2 + (0.25 if r % 2 else 0)
        while px < length / 2:
            obj("sphere", (px, 0, 0.18 + r * 0.3), (0.55, 0.32, 0.26), (0, 0, rng.uniform(-0.12, 0.12)), M_BAG, root)
            px += 0.5
    return root


def pyramid_tomb(x, y, size):
    for i in range(6):
        w = size * (1 - i / 6.5)
        obj("cube", (x, y, size * 0.16 * i + size * 0.08), (w, w, size * 0.16), m=M_STONE)
    o = obj("cone", (x, y, size * 1.05), (size * 0.12, size * 0.12, size * 0.12), m=M_GLOW)
    # glowing lines, one strip on each tier
    for i in range(6):
        w = size * (1 - i / 6.5)
        obj("cube", (x - w / 2 - 0.01, y, size * 0.16 * i + size * 0.16), (0.05, w * 0.9, 0.08), m=M_GLOW)
    return o


# ------------------------------------------------------------------ effects
def flash_light(loc, frame, energy, color=(1, 0.6, 0.25), dur=4, size=1.0):
    L = light("POINT", loc, 0.0, color, size)
    L.data.keyframe_insert("energy", frame=max(1, frame - 1))
    L.data.energy = energy
    L.data.keyframe_insert("energy", frame=frame)
    L.data.energy = 0
    L.data.keyframe_insert("energy", frame=frame + dur)
    return L


def explosion(loc, frame, size=1.0):
    x, y, z = loc
    fb = obj("sphere", (x, y, z + 0.5 * size), (0.2, 0.2, 0.2), m=M_FIRE)
    key_scale(fb, frame - 1, (0.01, 0.01, 0.01))
    key_vis(fb, frame - 2, False)
    key_vis(fb, frame - 1, True)
    key_scale(fb, frame + 3, (2.2 * size,) * 3)
    key_scale(fb, frame + 12, (2.8 * size,) * 3)
    key_vis(fb, frame + 13, False)
    constant(fb)
    flash_light((x, y, z + 2 * size), frame, 90000 * size, (1, 0.6, 0.25), 14, 2)
    for _ in range(int(14 * size)):    # debris on ballistic arcs
        d = obj("cube", (x, y, z), (0.12, 0.08, 0.1), m=M_GUN)
        ang = rng.uniform(0, 2 * math.pi)
        v = rng.uniform(3, 9) * size ** 0.5
        vz = rng.uniform(5, 12)
        key_vis(d, frame - 1, False)
        key_vis(d, frame, True)
        for s in range(0, 31, 5):
            t = s / FPS
            key_loc(d, frame + s, (x + math.cos(ang) * v * t, y + math.sin(ang) * v * t, max(0.1, z + vz * t - 4.9 * t * t)))
        linear(d)
    return fb


def gauss_beam(a, b, frame):
    d = Vector(b) - Vector(a)
    L = d.length
    mid = (Vector(a) + Vector(b)) / 2
    o = obj("cyl", tuple(mid), (0.05, 0.05, L), m=M_GLOW)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    key_vis(o, frame - 1, False)
    key_vis(o, frame, True)
    key_vis(o, frame + 2, False)
    constant(o)
    flash_light(a, frame, 3000, (0.2, 1, 0.4), 2, 0.3)
    return o


def lasbolt(a, b, frame, frames=5):
    o = obj("cyl", a, (0.04, 0.04, 1.4), m=M_LASER)
    d = Vector(b) - Vector(a)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    key_vis(o, frame - 1, False)
    key_vis(o, frame, True)
    key_loc(o, frame, a)
    key_loc(o, frame + frames, b)
    key_vis(o, frame + frames + 1, False)
    linear(o)
    flash_light(a, frame, 1200, (1, 0.25, 0.1), 2, 0.2)
    return o


# ------------------------------------------------------------------ build
build_world()
build_ground()

# no man's land: moon-lit mud, wire, craters via empty bumps skipped for speed
# Guard trench line at x ~ -8..-6, facing +x. Necrons advance from +x toward -x.
guards = []
for i in range(9):
    gy = -9 + i * 2.3 + rng.uniform(-0.3, 0.3)
    guards.append(guard(-8.0 + rng.uniform(-0.3, 0.3), gy, -90, kneel=(i % 2 == 0)))
for i in range(4):
    sandbag_wall(-6.9, -9 + i * 5.6, 5.6, 90)
for i in range(7):
    guards.append(guard(-13.5 + rng.uniform(-0.6, 0.6), -8 + i * 2.8, -90, kneel=False))
sandbag_wall(-12.2, -4, 10, 90, 2)

T, BARREL = tank(-16, 7.5, 0)
T2 = None

# tombs on the horizon
glow_tip = pyramid_tomb(95, -18, 34)
pyramid_tomb(80, 28, 20)
pyramid_tomb(110, 22, 26)
flash_light((70, -18, 14), 1, 400000, (0.2, 1, 0.45), 6, 6).data.energy = 400000

# necrons advancing
nec = []
legsets = []
for i in range(26):
    x = rng.uniform(8, 38)
    y = rng.uniform(-12, 12)
    n, legs = necron(x, y, 90)
    nec.append(n)
    legsets.append(legs)

# --- animation
def march(n, legs, start, end, dx):
    """Walk n in -x by dx between frames start..end with a stepping cycle."""
    x0 = n.location.x
    key_loc(n, start, (x0, n.location.y, 0.0))
    key_loc(n, end, (x0 - dx, n.location.y, 0.0))
    steps = int((end - start) / 12)
    for s in range(steps + 1):
        fr = start + s * 12
        a = 0.45 if s % 2 == 0 else -0.45
        for j, (t, k) in enumerate(legs):
            sign = 1 if j == 0 else -1
            key_rot(t, fr, (sign * a, 0, 0))
            key_rot(k, fr, (max(0, -sign * a) * 1.2 + 0.1, 0, 0))
    linear(n)
    for t, k in legs:
        linear(t)
        linear(k)


for n, legs in zip(nec, legsets):
    march(n, legs, 1, TOTAL, 16)

# lasgun fire & gauss fire
for s in range(40):
    fr = f(1.2) + s * 9 + rng.randint(0, 6)
    g = rng.choice(guards)
    tgt = rng.choice(nec)
    a = (g.location.x + 0.4, g.location.y + 0.1, 1.5)
    b = (tgt.location.x - 16 * (fr / TOTAL) + 0.0, tgt.location.y, 1.4)
    if abs(b[0] - a[0]) < 80:
        lasbolt(a, b, fr, frames=6)
for s in range(18):
    fr = f(4.5) + s * 14 + rng.randint(0, 8)
    tgt = rng.choice(nec)
    g = rng.choice(guards)
    ax = tgt.location.x - 16 * (fr / TOTAL) - 0.7
    gauss_beam((ax, tgt.location.y, 1.55), (g.location.x, g.location.y, 1.3), fr)
    explosion((g.location.x + 0.5, g.location.y, 0.1), fr + 2, 0.35)

# tank fires
for sec, tx, ty in ((7.4, 12, 3), (8.8, 20, -5)):
    fr = f(sec)
    key_loc(BARREL, fr - 1, (0.8, 0, 2.0))
    key_loc(BARREL, fr, (0.1, 0, 2.0))
    key_loc(BARREL, fr + 10, (0.8, 0, 2.0))
    flash_light((-10.5, 7.5, 2.1), fr, 120000, (1, 0.7, 0.3), 4, 0.6)
    explosion((tx - 4, ty, 0.1), fr + 7, 1.0)
    explosion((tx + 2, ty + 2, 0.1), fr + 9, 1.1)

# the ship
ship = bpy.data.objects.new("Ship", None)
bpy.context.collection.objects.link(ship)
obj("cone", (0, 0, 0), (36, 36, 26), (math.pi, math.radians(0), math.radians(45)), M_STONE, ship, vertices=4)
for o in ship.children:
    o.data.materials.append(M_STONE)
wire = obj("cone", (0, 0, 0), (36.4, 36.4, 26.2), (math.pi, 0, math.radians(45)), M_GLOW, ship, vertices=4)
wm = wire.modifiers.new("w", "WIREFRAME")
wm.thickness = 0.03
ship.location = (30, 0, 140)
key_loc(ship, f(11), (30, 0, 140))
key_loc(ship, f(14.2), (14, 0, 34))
key_loc(ship, f(20), (12, 0, 33))
shiplight = flash_light((14, 0, 28), f(11), 0, (0.2, 1, 0.5), 400, 3)
shiplight.data.keyframe_insert("energy", frame=f(11))
shiplight.data.energy = 5000
shiplight.data.keyframe_insert("energy", frame=f(14.5))
shiplight.location = (14, 0, 28)

# the beam hits the tank at 15.2 s
bf = f(15.2)
beam = obj("cyl", (-16, 7.5, 18), (1.6, 1.6, 34), m=M_GLOW)
d = Vector((-16, 7.5, 2)) - Vector((14, 0, 21))
key_vis(beam, bf - 1, False)
key_vis(beam, bf, True)
key_vis(beam, bf + 12, False)
constant(beam)
beam.location = ((14 - 16) / 2, 3.75, 11.5)
beam.scale = (1.6, 1.6, d.length)
beam.rotation_mode = "QUATERNION"
beam.rotation_quaternion = d.to_track_quat("Z", "Y")
flash_light((-16, 7.5, 3), bf, 300000, (0.3, 1, 0.5), 12, 2)
explosion((-16, 7.5, 0.1), bf + 5, 3.2)

# commissar for the closing shot
cm = bpy.data.objects.new("Commissar", None)
bpy.context.collection.objects.link(cm)
cm.location = (-4.2, -1.0, 0)
cm.rotation_euler = (0, 0, math.radians(-8))
obj("cone", (0, 0, 0.9), (0.9, 0.7, 1.6), (math.pi, 0, 0), M_COATBLK, cm)
obj("cube", (0, 0, 1.55), (0.55, 0.34, 0.7), m=M_COATBLK, parent=cm)
obj("cube", (0.06, 0.18, 1.55), (0.06, 0.04, 0.8), (0, 0, 0), M_RED, cm).rotation_euler = (0, math.radians(25), 0)
obj("sphere", (0, 0.03, 2.07), (0.24, 0.26, 0.3), m=M_SKIN, parent=cm)
obj("cyl", (0, 0.06, 2.25), (0.34, 0.34, 0.14), m=M_COATBLK, parent=cm)
obj("cube", (0, 0.28, 2.18), (0.34, 0.18, 0.04), m=M_COATBLK, parent=cm)
arm = limb(cm, (0.36, 0, 1.85), 0.7, 0.13, M_COATBLK)
arm.rotation_euler = (0, math.radians(180 - 20), 0)
arm.rotation_euler = (math.radians(0), math.radians(160), 0)
blade = obj("cyl", (0.65, 0, 3.3), (0.07, 0.025, 1.9), m=M_BLADE, parent=cm)
for t in (f(17), f(17.5)):
    pass
bladelight = light("POINT", (-3.4, -1.0, 3.2), 3500, (0.5, 0.7, 1.0), 0.3)
bladelight.parent = cm
bladelight.location = (0.65, 0.2, 3.3)
def _all(o):
    yield o
    for c in o.children:
        yield from _all(c)


for o in list(_all(cm)):
    key_vis(o, f(17.1), False)
    key_vis(o, f(17.2), True)
    key_vis(o, 1, False)
    constant(o)
for o in bpy.data.objects:
    if o.parent == cm and o.type == "MESH":
        pass
constant(cm)

# cameras and cuts
cams = []


def camera(name, loc, look, lens, move=None, t0=0, t1=0):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = 2.4
    cd.dof.focus_distance = (Vector(look) - Vector(loc)).length
    c = bpy.data.objects.new(name, cd)
    bpy.context.collection.objects.link(c)
    c.location = loc
    c.rotation_mode = "QUATERNION"
    c.rotation_quaternion = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y")
    if move:
        key_loc(c, f(t0), loc)
        key_loc(c, f(t1), move)
        c.rotation_mode = "QUATERNION"
        c.rotation_quaternion = (Vector(look) - Vector(move)).to_track_quat("-Z", "Y")
    cams.append(c)
    return c


c1 = camera("c1", (-10.5, -8.0, 2.1), (12, -3, 2.6), 26, (-10.5, -0.5, 2.2), 0, 4)
c1.rotation_mode = "QUATERNION"
c2 = camera("c2", (-5, -14, 1.8), (18, 2, 1.6), 35, (-5, -9, 1.8), 4, 8)
c3 = camera("c3", (-10.4, 17, 2.4), (-3, 3, 1.8), 32, (-10, 12, 2.2), 8, 11)
c4 = camera("c4", (-6, -10, 1.5), (14, 0, 22), 18, (-6, -10, 1.5), 11, 15)
tr = c4.constraints.new("TRACK_TO")
tr.target = ship
tr.track_axis = "TRACK_NEGATIVE_Z"
tr.up_axis = "UP_Y"
c5 = camera("c5", (-26, 17, 3.0), (-16, 7.5, 2.5), 30, (-24, 15, 3.6), 14.4, 17.2)
c6 = camera("c6", (0.8, -4.8, 1.2), (-4.2, -1.0, 2.3), 28, (0.3, -4.4, 1.3), 17.2, 20)
marks = [(1, c1), (f(4), c2), (f(8), c3), (f(11), c4), (f(14.4), c5), (f(17.2), c6)]
for fr, c in marks:
    m = scene.timeline_markers.new(f"cut{fr}", frame=fr)
    m.camera = c
scene.camera = c1

# ------------------------------------------------------------------ render settings
scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "CPU"
cy.samples = int(os.environ.get("SAMPLES", "20"))
cy.use_denoising = True
cy.denoiser = "OPENIMAGEDENOISE"
cy.max_bounces = 4
cy.volume_bounces = 1
cy.volume_step_rate = 4.0
cy.volume_max_steps = 24
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.05
cy.sample_clamp_indirect = 8.0
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.7
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.render.threads = 4

mode = sys.argv[1] if len(sys.argv) > 1 else "test"
if mode == "test":
    for fr in [int(v) for v in sys.argv[2:]] or [40]:
        scene.frame_set(fr)
        scene.render.filepath = os.path.join(HERE, f"test_{fr:04d}.png")
        bpy.ops.render.render(write_still=True)
else:
    a, b = int(sys.argv[2]), int(sys.argv[3])
    os.makedirs(os.path.join(HERE, "frames"), exist_ok=True)
    scene.frame_start, scene.frame_end = a, b
    scene.render.filepath = os.path.join(HERE, "frames", "f_")
    bpy.ops.render.render(animation=True)
