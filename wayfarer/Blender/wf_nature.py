"""Trees, plants, rocks, resource deposits and asteroids.

Everything stands on its origin with +Z up. The game tints Bark, Leaf,
Leaf2, Stone, Crystal and Glow per planet, and scales and rotates every
instance, so these are canonical shapes rather than finished colours.
"""

import math

from mathutils import Vector

from wf_lib import Builder, T, rot, S, empty, rng, decimated_copy, lerp


def _bent_path(R, height, bend, n=7, base=-0.4):
    pts = []
    dx, dy = R.uniform(-1, 1) * bend, R.uniform(-1, 1) * bend
    for i in range(n):
        t = i / (n - 1)
        pts.append(Vector((dx * t * t, dy * t * t, base + (height - base) * t)))
    return pts


def _foliage_blob(b, center, radius, mat, seed, subdiv=2, squash=0.8):
    faces = b.sphere(radius, mat, T(*center) @ S(1.0, 1.0, squash), subdiv=subdiv)
    b.displace(faces, radius * 0.28, 1.6 / radius, seed=seed, octaves=3)
    return faces


def _finish(name, b, lod_ratio=None, sharp=None):
    obj = b.to_object(name + "_LOD0", sharp_angle=sharp)
    objs = [obj]
    if lod_ratio:
        objs.append(decimated_copy(obj, name + "_LOD1", lod_ratio))
    return empty(name, objs)


# ───────────────────────────────────────────────────────────────── trees
def tree_broadleaf():
    R = rng(101)
    b = Builder()
    trunk = _bent_path(R, 5.2, 0.6)
    b.tube(trunk, [0.55, 0.42, 0.36, 0.32, 0.28, 0.24, 0.2], "Bark", segments=10)
    tips = []
    for k in range(6):
        a = k * math.pi * 2 / 6 + R.uniform(-0.3, 0.3)
        z0 = R.uniform(3.2, 4.8)
        start = Vector((trunk[-1].x * z0 / 5.2, trunk[-1].y * z0 / 5.2, z0))
        out = Vector((math.cos(a), math.sin(a), 0.0))
        length = R.uniform(2.0, 3.0)
        mid = start + out * length * 0.5 + Vector((0, 0, length * 0.45))
        end = start + out * length + Vector((0, 0, length * 0.7))
        b.tube([start, mid, end], [0.18, 0.12, 0.07], "Bark", segments=6)
        tips.append(end)
    top = trunk[-1] + Vector((0, 0, 1.2))
    tips.append(top)
    for i, tp in enumerate(tips):
        _foliage_blob(b, tp, R.uniform(1.6, 2.3), "Leaf" if i % 3 else "Leaf2", seed=i * 3 + 1, subdiv=3)
    for i in range(2):
        a = R.uniform(0, 2 * math.pi)
        c = top + Vector((math.cos(a) * 1.6, math.sin(a) * 1.6, R.uniform(-1.2, 0.2)))
        _foliage_blob(b, c, R.uniform(1.5, 2.0), "Leaf", seed=40 + i, subdiv=3)
    return _finish("tree_broadleaf", b, lod_ratio=0.2)


def tree_conifer():
    R = rng(202)
    b = Builder()
    b.tube(_bent_path(R, 11.5, 0.2), [0.42, 0.36, 0.3, 0.24, 0.17, 0.1, 0.04], "Bark", segments=8)
    tiers = 7
    for i in range(tiers):
        t = i / (tiers - 1)
        z = lerp(2.2, 10.2, t)
        r = lerp(3.0, 0.8, t)
        h = lerp(3.2, 2.2, t)
        faces = b.cylinder(r, 0.05, h, "Leaf" if i % 2 == 0 else "Leaf2",
                           T(0, 0, z + h * 0.5) @ rot("Z", R.uniform(0, 60)), segments=10, caps=True)
        b.displace(faces, r * 0.12, 1.3, seed=i + 5, octaves=2)
    return _finish("tree_conifer", b, lod_ratio=0.35)


def tree_palm():
    R = rng(303)
    b = Builder()
    path = []
    for i in range(10):
        t = i / 9
        path.append(Vector((1.8 * t * t, 0.3 * t, -0.3 + 8.3 * t)))
    b.tube(path, [0.36 - 0.14 * (i / 9) for i in range(10)], "Bark", segments=9)
    for i in range(1, 9):
        b.cylinder(0.33 - 0.13 * (i / 9) + 0.04, 0.3 - 0.13 * (i / 9), 0.2, "Bark",
                   T(*path[i]) @ rot("Y", 12 * (i / 9)), segments=9)
    top = path[-1]
    for k in range(9):
        a = k * 2 * math.pi / 9 + R.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), R.uniform(0.15, 0.5))).normalized()
        n = Vector((0, 0, 1)) - d * d.z
        b.leaf_blade(top, d, n.normalized() if n.length > 0.01 else Vector((0, 0, 1)),
                     R.uniform(3.6, 4.4), 0.9, "Leaf" if k % 2 else "Leaf2", bend=0.45, segments=6)
    for k in range(4):
        a = k * math.pi / 2
        b.sphere(0.2, "Leaf2", T(top.x + math.cos(a) * 0.3, top.y + math.sin(a) * 0.3, top.z - 0.35), subdiv=1)
    return _finish("tree_palm", b, lod_ratio=0.35)


def tree_fungal():
    R = rng(404)
    b = Builder()
    path = _bent_path(R, 5.0, 0.8)
    b.tube(path, [0.7, 0.5, 0.42, 0.4, 0.42, 0.5, 0.6], "Bark", segments=12)
    top = path[-1]
    cap = b.uvsphere(2.8, "Leaf", T(top.x, top.y, top.z + 0.3) @ S(1.0, 1.0, 0.42), u=24, v=12)
    b.displace(cap, 0.25, 0.8, seed=9, octaves=2)
    b.cylinder(2.5, 0.6, 0.6, "Leaf2", T(top.x, top.y, top.z - 0.15), segments=24)
    for k in range(10):
        a = R.uniform(0, 2 * math.pi)
        r = R.uniform(0.6, 2.3)
        z = top.z + 0.3 + 1.15 * math.sqrt(max(0.0, 1 - (r / 2.8) ** 2))
        b.sphere(R.uniform(0.12, 0.25), "Glow", T(top.x + math.cos(a) * r, top.y + math.sin(a) * r, z), subdiv=1)
    return _finish("tree_fungal", b, lod_ratio=0.4)


def _crystal(b, base, direction, length, radius, mat, sides=6):
    direction = direction.normalized()
    ref = Vector((0, 0, 1)) if abs(direction.z) < 0.9 else Vector((1, 0, 0))
    u = direction.cross(ref).normalized()
    v = direction.cross(u).normalized()
    rings = []
    for (t, r) in ((0.0, radius * 0.9), (0.72, radius), (1.0, radius * 0.02)):
        ring = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            ring.append(base + direction * length * t + (u * math.cos(a) + v * math.sin(a)) * r)
        rings.append(ring)
    return b.loft(rings, lambda i, j: mat, smooth=False)


def tree_crystal():
    R = rng(505)
    b = Builder()
    for k in range(7):
        a = R.uniform(0, 2 * math.pi)
        tilt = R.uniform(0.0, 0.5) if k else 0.05
        d = Vector((math.cos(a) * tilt, math.sin(a) * tilt, 1.0))
        _crystal(b, Vector((math.cos(a) * 0.4 * (k > 0), math.sin(a) * 0.4 * (k > 0), -0.3)), d,
                 R.uniform(2.5, 6.5) if k else 7.0, R.uniform(0.3, 0.6) if k else 0.7, "Crystal")
    faces = b.sphere(1.1, "Stone", S(1.2, 1.2, 0.5), subdiv=2)
    b.displace(faces, 0.25, 1.2, seed=4)
    return _finish("tree_crystal", b, lod_ratio=None, sharp=30)


def tree_dead():
    R = rng(606)
    b = Builder()
    trunk = _bent_path(R, 6.0, 1.4, n=8)
    b.tube(trunk, [0.5, 0.4, 0.33, 0.28, 0.22, 0.17, 0.12, 0.06], "Bark", segments=8)
    for k in range(7):
        i = R.randint(3, 6)
        start = trunk[i]
        a = R.uniform(0, 2 * math.pi)
        out = Vector((math.cos(a), math.sin(a), R.uniform(0.3, 1.0)))
        l = R.uniform(1.2, 2.8)
        mid = start + out * l * 0.5 + Vector((R.uniform(-.3, .3), R.uniform(-.3, .3), 0.2))
        end = start + out * l
        b.tube([start, mid, end], [0.12, 0.07, 0.02], "Bark", segments=5)
        twig_end = end + Vector((R.uniform(-.6, .6), R.uniform(-.6, .6), R.uniform(0.3, 0.8)))
        b.tube([mid, (mid + twig_end) * 0.5, twig_end], [0.05, 0.03, 0.01], "Bark", segments=4)
    return _finish("tree_dead", b, lod_ratio=0.4)


def tree_bulb():
    R = rng(707)
    b = Builder()
    for k in range(5):
        a = k * 2 * math.pi / 5 + R.uniform(-0.3, 0.3)
        h = R.uniform(3.5, 6.0)
        lean = R.uniform(0.6, 1.8)
        path = [Vector((math.cos(a) * lean * (t / 4) ** 2, math.sin(a) * lean * (t / 4) ** 2, -0.3 + h * t / 4)) for t in range(5)]
        b.tube(path, [0.22, 0.18, 0.15, 0.12, 0.1], "Bark", segments=7)
        tip = path[-1]
        b.uvsphere(R.uniform(0.6, 0.9), "Leaf", T(tip.x, tip.y, tip.z + 0.5) @ S(1, 1, 1.25), u=14, v=10)
        b.uvsphere(0.32, "Glow", T(tip.x, tip.y, tip.z + 1.25), u=10, v=6)
    for k in range(6):
        a = k * math.pi / 3
        b.leaf_blade(Vector((0, 0, 0.1)), Vector((math.cos(a), math.sin(a), 0.4)), Vector((0, 0, 1)),
                     1.6, 0.6, "Leaf2", bend=0.3)
    return _finish("tree_bulb", b, lod_ratio=0.4)


def cactus():
    R = rng(808)
    b = Builder()

    def column(base, height, radius):
        rings = []
        ribs = 10
        steps = 8
        for i in range(steps + 1):
            t = i / steps
            r = radius * (1.0 if t < 0.85 else math.sqrt(max(0.02, 1 - ((t - 0.85) / 0.15) ** 2)))
            ring = []
            for j in range(ribs * 2):
                a = math.pi * j / ribs
                rr = r * (1.0 if j % 2 == 0 else 0.82)
                ring.append(base + Vector((math.cos(a) * rr, math.sin(a) * rr, height * t)))
            rings.append(ring)
        b.loft(rings, lambda i, j: "Leaf", smooth=True)
        return base + Vector((0, 0, height))

    column(Vector((0, 0, -0.3)), 4.2, 0.45)
    for side, z, h in ((1, 1.4, 1.6), (-1, 2.1, 1.3)):
        elbow = [Vector((0.3 * side, 0, z)), Vector((0.9 * side, 0, z + 0.05)), Vector((1.05 * side, 0, z + 0.45))]
        b.tube(elbow, [0.3, 0.28, 0.28], "Leaf", segments=10, cap_start=False, cap_end=False)
        column(Vector((1.05 * side, 0, z + 0.4)), h, 0.28)
    for k in range(5):
        a = k * 2 * math.pi / 5
        b.sphere(0.12, "Leaf2", T(math.cos(a) * 0.25, math.sin(a) * 0.25, 3.95), subdiv=1)
    return _finish("cactus", b, lod_ratio=0.4)


# ─────────────────────────────────────────────────────────────── plants
def bush():
    R = rng(909)
    b = Builder()
    for k in range(6):
        a = R.uniform(0, 2 * math.pi)
        r = R.uniform(0.0, 0.7)
        _foliage_blob(b, (math.cos(a) * r, math.sin(a) * r, R.uniform(0.5, 1.1)), R.uniform(0.5, 0.8),
                      "Leaf" if k % 3 else "Leaf2", seed=60 + k, subdiv=1)
    b.tube([Vector((0, 0, -0.2)), Vector((0.1, 0, 0.5))], [0.08, 0.05], "Bark", segments=5)
    return _finish("bush", b)


def fern():
    R = rng(1010)
    b = Builder()
    for k in range(9):
        a = k * 2 * math.pi / 9 + R.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), R.uniform(0.6, 1.2)))
        b.leaf_blade(Vector((0, 0, 0.0)), d, Vector((0, 0, 1)) - d.normalized() * d.normalized().z,
                     R.uniform(1.0, 1.4), 0.35, "Leaf" if k % 2 else "Leaf2", bend=0.5, segments=5)
    return _finish("fern", b)


def grass():
    R = rng(1111)
    b = Builder()
    for k in range(11):
        a = R.uniform(0, 2 * math.pi)
        r = R.uniform(0.0, 0.25)
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.05))
        lean = Vector((math.cos(a) * 0.3 + R.uniform(-.15, .15), math.sin(a) * 0.3 + R.uniform(-.15, .15), 1.0))
        side = Vector((-math.sin(a), math.cos(a), 0))
        normal = lean.cross(side).normalized()
        b.leaf_blade(base, lean, normal, R.uniform(0.45, 0.8), 0.07, "Leaf" if k % 4 else "Leaf2", bend=0.25, segments=3)
    return _finish("grass", b)


def flower():
    R = rng(1212)
    b = Builder()
    for k in range(3):
        a = k * 2 * math.pi / 3
        top = Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, R.uniform(0.35, 0.55)))
        b.tube([Vector((0, 0, -0.05)), top * 0.5 + Vector((0, 0, 0.05)), top], [0.015, 0.012, 0.01], "Leaf", segments=4)
        for p in range(5):
            pa = p * 2 * math.pi / 5
            d = Vector((math.cos(pa), math.sin(pa), 0.5))
            b.leaf_blade(top, d, Vector((0, 0, 1)) - d.normalized() * d.normalized().z, 0.12, 0.08, "Leaf2", bend=0.2, segments=2)
        b.sphere(0.03, "Glow", T(top.x, top.y, top.z + 0.01), subdiv=1)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        d = Vector((math.cos(a), math.sin(a), 0.25))
        b.leaf_blade(Vector((0, 0, 0)), d, Vector((0, 0, 1)), 0.22, 0.09, "Leaf", bend=0.2, segments=2)
    return _finish("flower", b)


def plant_sodium():
    """Resource plant: glowing yellow bulbs (the game tints Glow yellow)."""
    R = rng(1313)
    b = Builder()
    for k in range(6):
        a = k * math.pi / 3 + 0.2
        d = Vector((math.cos(a), math.sin(a), 0.5))
        b.leaf_blade(Vector((0, 0, 0)), d, Vector((0, 0, 1)) - d.normalized() * d.normalized().z * 0.5, 0.8, 0.28, "Leaf", bend=0.4)
    for k in range(5):
        a = k * 2 * math.pi / 5
        r = 0.18 if k else 0.0
        h = R.uniform(0.55, 0.95)
        stem_top = Vector((math.cos(a) * r, math.sin(a) * r, h))
        b.tube([Vector((0, 0, -0.05)), stem_top * 0.5, stem_top], [0.03, 0.025, 0.02], "Leaf", segments=5)
        b.uvsphere(R.uniform(0.12, 0.18), "Glow", T(stem_top.x, stem_top.y, stem_top.z + 0.1) @ S(1, 1, 1.3), u=10, v=7)
    return _finish("plant_sodium", b)


def plant_oxygen():
    """Resource plant: broad red leaves around a bright bud."""
    R = rng(1414)
    b = Builder()
    for k in range(8):
        a = k * math.pi / 4 + R.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 1.1))
        b.leaf_blade(Vector((0, 0, 0.0)), d, Vector((0, 0, 1)) - d.normalized() * d.normalized().z,
                     R.uniform(0.9, 1.2), 0.45, "Leaf2", bend=0.35, segments=5, curl=0.2)
    b.uvsphere(0.2, "Glow", T(0, 0, 0.55) @ S(1, 1, 1.4), u=12, v=8)
    b.tube([Vector((0, 0, -0.05)), Vector((0, 0, 0.45))], [0.05, 0.04], "Leaf", segments=6)
    return _finish("plant_oxygen", b)


def coral_spire():
    R = rng(1515)
    b = Builder()

    def branch(start, direction, length, radius, depth):
        end = start + direction.normalized() * length
        mid = (start + end) * 0.5 + Vector((R.uniform(-.2, .2), R.uniform(-.2, .2), 0))
        b.tube([start, mid, end], [radius, radius * 0.8, radius * 0.55], "Leaf2", segments=7)
        b.sphere(radius * 0.7, "Glow", T(*end), subdiv=1)
        if depth > 0:
            for k in range(2):
                a = R.uniform(0, 2 * math.pi)
                nd = direction.normalized() + Vector((math.cos(a), math.sin(a), 0)) * 0.7
                branch(mid + (end - mid) * R.uniform(0.2, 0.8), nd, length * 0.65, radius * 0.6, depth - 1)

    branch(Vector((0, 0, -0.3)), Vector((0, 0, 1)), 3.2, 0.35, 2)
    return _finish("coral_spire", b, lod_ratio=0.4)


# ──────────────────────────────────────────────────────────────── rocks
def _rock(name, seed, scale, amount, freq, ridged=False, subdiv=4, lod=True):
    b = Builder()
    faces = b.sphere(1.0, "Stone", T(0, 0, scale[2] * 0.35) @ S(*scale), subdiv=subdiv, smooth=True)
    b.displace(faces, amount, freq, seed=seed, octaves=4, mode="ridged" if ridged else "fractal")
    b.displace(faces, amount * 0.25, freq * 3.1, seed=seed + 1, octaves=2)
    return _finish(name, b, lod_ratio=0.25 if lod else None, sharp=50)


def rock_boulder_a():
    return _rock("rock_boulder_a", 21, (1.6, 1.3, 1.1), 0.35, 0.9)


def rock_boulder_b():
    return _rock("rock_boulder_b", 22, (1.5, 1.2, 0.9), 0.45, 1.1, ridged=True)


def rock_small():
    b = Builder()
    R = rng(23)
    for k in range(4):
        s = R.uniform(0.18, 0.4)
        faces = b.sphere(1.0, "Stone", T(R.uniform(-0.5, 0.5), R.uniform(-0.5, 0.5), s * 0.3) @ S(s, s * 0.8, s * 0.6), subdiv=2)
        b.displace(faces, 0.06, 5.0, seed=k + 30, octaves=2)
    return _finish("rock_small", b, sharp=50)


def rock_spire():
    b = Builder()
    faces = b.sphere(1.0, "Stone", T(0, 0, 2.2) @ S(1.0, 0.8, 3.0), subdiv=4)
    b.displace(faces, 0.35, 0.9, seed=24, octaves=4, mode="ridged")
    return _finish("rock_spire", b, lod_ratio=0.3, sharp=50)


def crystal_hydrogen():
    R = rng(31)
    b = Builder()
    faces = b.sphere(0.7, "Stone", S(1.2, 1.0, 0.45), subdiv=2)
    b.displace(faces, 0.15, 1.8, seed=31)
    for k in range(8):
        a = R.uniform(0, 2 * math.pi)
        tilt = R.uniform(0.1, 0.8)
        d = Vector((math.cos(a) * tilt, math.sin(a) * tilt, 1.0))
        _crystal(b, Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, 0.0)), d, R.uniform(0.6, 1.6), R.uniform(0.1, 0.22), "Crystal")
    return _finish("crystal_hydrogen", b, sharp=30)


def ore_deposit():
    R = rng(41)
    b = Builder()
    faces = b.sphere(1.0, "Stone", T(0, 0, 0.6) @ S(1.6, 1.4, 1.2), subdiv=4)
    b.displace(faces, 0.4, 1.0, seed=41, octaves=3, mode="ridged")
    for k in range(9):
        a = R.uniform(0, 2 * math.pi)
        el = R.uniform(0.1, 1.0)
        d = Vector((math.cos(a), math.sin(a), el))
        start = Vector((math.cos(a) * 0.9, math.sin(a) * 0.8, 0.6 + el * 0.6))
        _crystal(b, start, d, R.uniform(0.4, 0.9), R.uniform(0.12, 0.2), "Glow", sides=5)
    return _finish("ore_deposit", b, sharp=40)


def asteroid(i):
    b = Builder()
    shapes = [(1.0, 0.8, 0.7), (1.0, 0.95, 0.9), (1.0, 0.6, 0.5)]
    faces = b.sphere(1.0, "Stone", S(*shapes[i]), subdiv=4)
    b.displace(faces, 0.28, 1.2, seed=50 + i, octaves=4, mode="ridged" if i == 1 else "fractal")
    b.displace(faces, 0.08, 4.0, seed=60 + i, octaves=2)
    # a few craters
    R = rng(70 + i)
    for _ in range(5):
        c = Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1))).normalized()
        cr = R.uniform(0.2, 0.45)
        for v in {v for f in faces for v in f.verts}:
            d = (v.co.normalized() - c).length
            if d < cr:
                v.co -= v.co.normalized() * 0.08 * (1 - (d / cr) ** 2)
    name = "asteroid_" + "abc"[i]
    return _finish(name, b, lod_ratio=0.25, sharp=55)


BUILDERS = {
    "tree_broadleaf": tree_broadleaf,
    "tree_conifer": tree_conifer,
    "tree_palm": tree_palm,
    "tree_fungal": tree_fungal,
    "tree_crystal": tree_crystal,
    "tree_dead": tree_dead,
    "tree_bulb": tree_bulb,
    "cactus": cactus,
    "bush": bush,
    "fern": fern,
    "grass": grass,
    "flower": flower,
    "plant_sodium": plant_sodium,
    "plant_oxygen": plant_oxygen,
    "coral_spire": coral_spire,
    "rock_boulder_a": rock_boulder_a,
    "rock_boulder_b": rock_boulder_b,
    "rock_small": rock_small,
    "rock_spire": rock_spire,
    "crystal_hydrogen": crystal_hydrogen,
    "ore_deposit": ore_deposit,
    "asteroid_a": lambda: asteroid(0),
    "asteroid_b": lambda: asteroid(1),
    "asteroid_c": lambda: asteroid(2),
}
