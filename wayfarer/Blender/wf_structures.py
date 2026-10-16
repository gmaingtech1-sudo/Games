"""The space station and the buildings found on planets."""

import math

import bpy
from mathutils import Vector

from wf_lib import Builder, T, rot, S, empty, rng


def _marker(name, loc):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    return e


def _inverted_box(b, size, mat, matrix):
    faces = b.box(size, mat, matrix)
    import bmesh
    bmesh.ops.reverse_faces(b.bm, faces=faces)
    return faces


def station():
    """Trading station, ~420 m across. The docking bay opens toward -Y."""
    b = Builder()
    along_y = rot("X", 90)
    # rear hub
    b.cylinder(55, 55, 80, "Hull", T(0, 35, 0) @ along_y, segments=12, smooth=False)
    b.cylinder(55, 38, 20, "HullDark", T(0, 85, 0) @ along_y, segments=12, smooth=False)
    b.cylinder(20, 20, 60, "Metal", T(0, 120, 0) @ along_y, segments=10, smooth=False)
    # front block around the bay (opening 50 x 26, 70 deep)
    b.box((30, 70, 80), "Hull", T(-40, -40, 0))
    b.box((30, 70, 80), "Hull", T(40, -40, 0))
    b.box((50, 70, 27), "Hull", T(0, -40, 26.5))
    b.box((50, 70, 27), "HullDark", T(0, -40, -26.5))
    b.box((116, 6, 86), "HullAccent", T(0, -2, 0))
    # bay interior (faces inward)
    _inverted_box(b, (50, 70, 26), "HullDark", T(0, -40, 0))
    # glowing bay frame + floor guide lights
    for z in (13.6, -13.6):
        b.box((52, 1.2, 1.2), "Glow", T(0, -75.6, z))
    for x in (25.6, -25.6):
        b.box((1.2, 1.2, 28), "Glow", T(x, -75.6, 0))
    for i in range(8):
        y = -70 + i * 8
        b.box((0.6, 3.0, 0.2), "Glow", T(-8, y, -12.9))
        b.box((0.6, 3.0, 0.2), "Glow", T(8, y, -12.9))
    b.box((14, 14, 0.2), "HullAccent", T(0, -40, -12.9))
    b.box((10, 10, 0.25), "HullDark", T(0, -40, -12.85))
    # ceiling lamps in the bay
    for i in range(5):
        b.box((30, 1.5, 0.3), "GlowAlt", T(0, -68 + i * 13, 12.8))
    # hull panelling and window strips
    for i in range(6):
        ang = i * math.pi / 3
        x, z = math.cos(ang) * 56, math.sin(ang) * 56
        b.box((6, 60, 6), "HullDark", T(x, 35, z) @ rot("Y", -math.degrees(ang)))
    for i in range(12):
        ang = (i + 0.5) * math.pi / 6
        x, z = math.cos(ang) * 55.5, math.sin(ang) * 55.5
        b.box((1.2, 50, 1.2), "Glow", T(x, 35, z) @ rot("Y", -math.degrees(ang)))
    # solar arrays
    for sx in (1, -1):
        b.box((80, 4, 4), "Metal", T(sx * 95, 120, 0))
        for k in range(4):
            b.box((18, 30, 0.8), "Glass", T(sx * (72 + k * 20), 120, 0))
    # antennas + beacons
    b.cylinder(1.2, 0.6, 60, "Metal", T(0, 60, 75), segments=8)
    b.box((2, 2, 2), "GlowAlt", T(0, 60, 106))
    b.cylinder(1.2, 0.6, 50, "Metal", T(0, 60, -70), segments=8)
    b.box((2, 2, 2), "GlowAlt", T(0, 60, -96))
    core = b.to_object("Core", sharp_angle=30)

    # rotating habitat ring (spins about the station's Y axis)
    r = Builder()
    rings = []
    n = 64
    for i in range(n + 1):
        th = 2 * math.pi * i / n
        c, s = math.cos(th), math.sin(th)
        sec = []
        for j in range(12):
            a = 2 * math.pi * j / 12
            u = 12 * math.copysign(abs(math.cos(a)) ** 0.5, math.cos(a))  # radial
            v = 9 * math.copysign(abs(math.sin(a)) ** 0.5, math.sin(a))  # along Y
            rad = 190 + u
            sec.append(Vector((c * rad, v + 30, s * rad)))
        rings.append(sec)

    def ring_mat(i, j):
        if j in (0, 11, 1):
            return "Glow" if i % 2 == 0 else "Hull"
        return "Hull" if j < 6 else "HullDark"

    r.loft(rings[:-1] + [rings[0]], ring_mat, cap_start=False, cap_end=False, smooth=False)
    for k in range(4):
        ang = k * math.pi / 2 + math.pi / 4
        mid = 120
        r.box((130, 6, 6), "Metal", T(math.cos(ang) * mid, 30, math.sin(ang) * mid) @ rot("Y", -math.degrees(ang)))
    ring = r.to_object("Ring", sharp_angle=30)
    ring.location = (0, 0, 0)

    dock = _marker("DockPoint", (0, -40, -12.8))
    entry = _marker("DockEntry", (0, -170, 0))
    return empty("station", [core, ring, dock, entry])


def outpost():
    """A small prefab habitat, ~11 x 7 m, door facing -Y."""
    b = Builder()
    rings = [b.superellipse_ring(y, 1.9, 7.0, 3.8, n=20, e=4.0) for y in (-3.2, -2.8, 2.8, 3.2)]
    rings[0] = b.superellipse_ring(-3.2, 1.9, 6.4, 3.4, n=20, e=4.0)
    rings[3] = b.superellipse_ring(3.2, 1.9, 6.4, 3.4, n=20, e=4.0)

    def mat(i, j):
        if j < 0:
            return "HullDark"
        return "HullAccent" if i in (0, 2) else "Hull"
    b.loft(rings, mat, smooth=False)
    # side module
    b.box((4.0, 4.0, 3.0), "Hull", T(5.2, 0.5, 1.5))
    b.box((4.2, 4.2, 0.3), "HullDark", T(5.2, 0.5, 3.1))
    # door + frame
    b.box((1.6, 0.3, 2.4), "HullDark", T(0, -3.3, 1.3))
    b.box((1.9, 0.2, 0.15), "Glow", T(0, -3.4, 2.6))
    for sx in (1.0, -1.0):
        b.box((0.12, 0.2, 2.5), "Glow", T(0.9 * sx, -3.4, 1.3))
    # windows
    for y in (-1.5, 0.0, 1.5):
        b.box((0.1, 0.9, 0.7), "Glass", T(3.52, y, 2.4))
        b.box((0.1, 0.9, 0.7), "Glass", T(-3.52, y, 2.4))
    # steps + foundation
    b.box((2.2, 1.0, 0.25), "Metal", T(0, -3.9, 0.12))
    b.box((7.6, 7.2, 0.3), "HullDark", T(0, 0, 0.05))
    # antenna dish + light
    b.cylinder(0.08, 0.08, 2.5, "Metal", T(-2.0, 1.5, 4.8), segments=6)
    b.cylinder(0.9, 0.2, 0.4, "Metal", T(-2.0, 1.5, 6.1) @ rot("X", 30), segments=16)
    b.box((0.2, 0.2, 0.2), "GlowAlt", T(2.0, -2.0, 4.0))
    body = b.to_object("Body", sharp_angle=35)
    door = _marker("Door", (0, -4.2, 0.2))
    return empty("outpost", [body, door])


def beacon():
    b = Builder()
    for k in range(3):
        a = k * 2 * math.pi / 3
        b.cylinder(0.12, 0.08, 4.2, "Metal", T(math.cos(a) * 1.2, math.sin(a) * 1.2, 1.9) @ rot("Z", math.degrees(a)) @ rot("Y", -16), segments=6)
    b.cylinder(0.5, 0.5, 0.6, "HullDark", T(0, 0, 3.6), segments=12)
    b.cylinder(0.15, 0.1, 6.0, "Hull", T(0, 0, 6.8), segments=8)
    b.box((1.2, 0.1, 0.6), "HullAccent", T(0, 0, 5.4))
    b.uvsphere(0.35, "GlowAlt", T(0, 0, 10.0), u=12, v=8)
    b.cylinder(0.3, 0.3, 0.8, "HullDark", T(0, -0.5, 3.0) @ rot("X", 60), segments=10)
    b.box((0.5, 0.05, 0.3), "Glow", T(0, -0.62, 3.45) @ rot("X", -30))
    body = b.to_object("Body", sharp_angle=35)
    return empty("beacon", [body])


def crate():
    b = Builder()
    b.box((1.2, 0.8, 0.7), "HullAccent", T(0, 0, 0.38))
    b.box((1.26, 0.86, 0.1), "HullDark", T(0, 0, 0.72))
    b.box((1.26, 0.86, 0.1), "HullDark", T(0, 0, 0.05))
    b.box((0.9, 0.05, 0.08), "Glow", T(0, -0.43, 0.5))
    for sx in (-0.5, 0.5):
        b.box((0.08, 0.9, 0.08), "Metal", T(sx, 0, 0.78))
    body = b.to_object("Body", sharp_angle=35)
    return empty("crate", [body])


def terminal():
    b = Builder()
    b.box((0.7, 0.5, 0.1), "HullDark", T(0, 0, 0.05))
    b.box((0.35, 0.3, 1.0), "Hull", T(0, 0.05, 0.55))
    b.box((0.8, 0.12, 0.55), "HullDark", T(0, -0.05, 1.2) @ rot("X", -25))
    b.box((0.68, 0.02, 0.44), "Glow", T(0, -0.13, 1.2) @ rot("X", -25))
    b.box((0.4, 0.2, 0.05), "GlowAlt", T(0, -0.2, 0.85))
    body = b.to_object("Body", sharp_angle=35)
    return empty("terminal", [body])


def monolith():
    """Ancient ruin: a ring of broken stone pillars around a glowing obelisk."""
    b = Builder()
    R = rng(7)
    b.cylinder(7.5, 8.0, 0.6, "Stone", T(0, 0, 0.1), segments=24, smooth=False)
    b.cylinder(3.0, 3.2, 0.5, "Stone", T(0, 0, 0.6), segments=8, smooth=False)
    ob = []
    for z, w in ((0.8, 1.5), (5.5, 1.1), (7.2, 0.7), (8.0, 0.05)):
        ring = []
        for j in range(4):
            a = j * math.pi / 2 + math.pi / 4
            ring.append(Vector((math.cos(a) * w * 0.7, math.sin(a) * w * 0.7, z)))
        ob.append(ring)
    b.loft(ob, lambda i, j: "Stone", smooth=False)
    for k in range(8):
        z = 1.6 + k * 0.5
        face_y = 0.742 - (z - 0.8) / 4.7 * 0.198
        b.box((0.08 if k % 2 else 0.35, 0.03, 0.35 if k % 2 else 0.08), "Glow", T(0, -face_y - 0.01, z))
    for k in range(6):
        a = k * math.pi / 3
        h = R.uniform(2.0, 5.5)
        tilt = R.uniform(-8, 8)
        b.box((0.9, 0.9, h), "Stone", T(math.cos(a) * 6.0, math.sin(a) * 6.0, h / 2 + 0.3) @ rot("Z", math.degrees(a)) @ rot("X", tilt))
        if h > 4.0:
            b.box((2.6, 1.0, 0.6), "Stone", T(math.cos(a) * 6.0, math.sin(a) * 6.0, h + 0.5) @ rot("Z", math.degrees(a) + 90))
    b.displace(None, 0.05, 1.3, seed=3, octaves=2)
    body = b.to_object("Body", sharp_angle=30)
    return empty("monolith", [body])


def crashed_pod():
    """Wreck of a small ship half-buried in the ground."""
    b = Builder()
    n = 18
    sections = [(-4.5, 0.2, 0.6, 0.5, 2.2), (-3.0, 0.3, 1.9, 1.5, 2.6), (0.0, 0.4, 2.5, 1.9, 3.0),
                (2.0, 0.35, 2.3, 1.6, 2.8), (2.4, 0.3, 1.7, 1.2, 2.4)]
    rings = [b.superellipse_ring(y, cz, w, h, n=n, e=e) for (y, cz, w, h, e) in sections]
    b.loft(rings, lambda i, j: "HullDark" if j >= 0 and j % 5 == 0 else ("Hull" if j >= 0 else "Metal"))
    b.uvsphere(1.0, "Glass", T(0, -1.8, 1.05) @ S(0.6, 1.3, 0.4), u=12, v=8)
    wing = [(1.0, -0.5), (3.4, 1.2), (3.2, 2.2), (1.0, 2.4)]
    b.wing(wing, 0.25, "Hull", T(0, 0, 0) @ rot("Y", -25))
    b.cylinder(0.5, 0.4, 1.6, "HullDark", T(-1.2, 3.0, 0.3) @ rot("X", 90), segments=12)
    R = rng(11)
    for i in range(10):
        s = R.uniform(0.2, 0.8)
        b.box((s, s * R.uniform(0.5, 1.5), s * 0.3), R.choice(["Hull", "HullDark", "Metal"]),
              T(R.uniform(-5, 5), R.uniform(-5, 6), s * 0.1) @ rot("Z", R.uniform(0, 360)) @ rot("X", R.uniform(-30, 30)))
    b.displace(None, 0.06, 2.0, seed=5, octaves=2)
    body = b.to_object("Body", sharp_angle=35)
    body.rotation_euler = (math.radians(12), math.radians(-18), math.radians(20))
    body.location = (0, 0, -0.3)
    loot = _marker("Loot", (0, 0.5, 1.0))
    return empty("crashed_pod", [body, loot])


def landing_pad():
    b = Builder()
    b.cylinder(8.0, 8.0, 0.5, "HullDark", T(0, 0, 0.45), segments=32, smooth=False)
    b.cylinder(7.0, 7.0, 0.1, "Metal", T(0, 0, 0.72), segments=32, smooth=False)
    for k in range(16):
        a = k * math.pi / 8
        b.box((0.3, 0.3, 0.12), "Glow", T(math.cos(a) * 7.6, math.sin(a) * 7.6, 0.72))
    for x in (-1.2, 1.2):
        b.box((0.4, 3.0, 0.05), "HullAccent", T(x, 0, 0.78))
    b.box((2.4, 0.4, 0.05), "HullAccent", T(0, 0, 0.78))
    for k in range(6):
        a = k * math.pi / 3
        b.cylinder(0.4, 0.5, 2.0, "Metal", T(math.cos(a) * 6.0, math.sin(a) * 6.0, -0.6), segments=8)
    body = b.to_object("Body", sharp_angle=35)
    return empty("landing_pad", [body])


BUILDERS = {
    "station": station,
    "outpost": outpost,
    "beacon": beacon,
    "crate": crate,
    "terminal": terminal,
    "monolith": monolith,
    "crashed_pod": crashed_pod,
    "landing_pad": landing_pad,
}
