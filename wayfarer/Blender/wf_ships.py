"""Ships, the multi-tool and the sentinel drone."""

import math

from mathutils import Vector

from wf_lib import Builder, T, rot, S, empty
import bpy


def _hull_mat(top="Hull", side="HullAccent", bottom="HullDark", n=24):
    def fn(i, j):
        if j < 0:
            return bottom
        a = 2 * math.pi * j / n
        s = math.sin(a)
        if s > 0.30:
            return top
        if s < -0.25:
            return bottom
        return side
    return fn


def _mirror_x(pts):
    return [(-x, y) for x, y in reversed(pts)]


def _nacelle(b, x, z, y0, y1, r, glow="Glow"):
    length = y1 - y0
    cy = (y0 + y1) * 0.5
    along_y = rot("X", 90)
    b.cylinder(r * 0.85, r, length * 0.2, "HullDark", T(x, y0 + length * 0.1, z) @ along_y, segments=20)
    b.cylinder(r, r, length * 0.6, "Hull", T(x, cy, z) @ along_y, segments=20)
    b.cylinder(r, r * 0.8, length * 0.2, "HullDark", T(x, y1 - length * 0.1, z) @ along_y, segments=20)
    b.cylinder(r * 0.72, r * 0.72, 0.06, glow, T(x, y1 + 0.02, z) @ along_y, segments=20)
    # intake ring detail
    b.cylinder(r * 1.04, r * 1.04, 0.18, "Metal", T(x, y0 + length * 0.22, z) @ along_y, segments=20)


def explorer_ship():
    """The player's starship: ~15 m long, faces -Y."""
    b = Builder()
    n = 28
    # nose (y=-7.6) to tail (y=6.7):  y, centre z, width, height, squareness
    sections = [
        (-7.6, 0.10, 0.10, 0.08, 2.0),
        (-7.0, 0.10, 0.70, 0.45, 2.2),
        (-5.8, 0.18, 1.45, 0.95, 2.4),
        (-4.0, 0.28, 2.10, 1.45, 2.6),
        (-2.0, 0.34, 2.55, 1.75, 2.8),
        (0.5, 0.34, 2.85, 1.85, 3.0),
        (3.0, 0.30, 2.80, 1.70, 3.0),
        (5.0, 0.24, 2.45, 1.40, 2.8),
        (6.3, 0.20, 1.90, 1.05, 2.6),
        (6.7, 0.20, 1.40, 0.80, 2.4),
    ]
    rings = [b.superellipse_ring(y, cz, w, h, n=n, e=e) for (y, cz, w, h, e) in sections]
    b.loft(rings, _hull_mat(n=n), cap_start=True, cap_end=True, smooth=True)

    # canopy
    b.uvsphere(1.0, "Glass", T(0, -3.0, 0.98) @ S(0.78, 2.0, 0.55), u=24, v=12)
    b.box((0.08, 3.6, 0.10), "HullDark", T(0, -3.0, 1.52))  # canopy spine

    # wings (swept, slight dihedral)
    right = [(1.1, -0.6), (5.6, 2.5), (5.8, 4.1), (1.1, 4.4)]
    b.wing(right, 0.34, "Hull", T(0, 0, 0.05) @ rot("Y", -6), edge_mat="HullAccent")
    b.wing(_mirror_x(right), 0.34, "Hull", T(0, 0, 0.05) @ rot("Y", 6), edge_mat="HullAccent")
    # wing root fairings
    b.box((0.9, 3.8, 0.45), "HullDark", T(1.35, 1.9, -0.05))
    b.box((0.9, 3.8, 0.45), "HullDark", T(-1.35, 1.9, -0.05))

    # wingtip fins with nav lights
    fin = [(0.0, 2.6), (0.0, 4.2), (1.0, 4.5), (1.15, 3.6)]
    for sx, mat_light in ((1, "GlowAlt"), (-1, "GlowAlt")):
        tipx = 5.72 * sx
        tipz = 0.05 + 5.72 * math.tan(math.radians(6))
        b.wing(fin, 0.12, "HullAccent", T(tipx, 0, tipz) @ rot("Y", -90))
        b.box((0.16, 0.3, 0.12), mat_light, T(tipx, 2.4, tipz))

    # twin engine nacelles + main engine
    _nacelle(b, 1.45, 0.05, 2.2, 7.2, 0.56)
    _nacelle(b, -1.45, 0.05, 2.2, 7.2, 0.56)
    b.cylinder(0.72, 0.62, 0.5, "HullDark", T(0, 6.85, 0.22) @ rot("X", 90), segments=24)
    b.cylinder(0.52, 0.52, 0.06, "Glow", T(0, 7.12, 0.22) @ rot("X", 90), segments=24)

    # tail fin
    tail = [(0.0, 2.2), (0.0, 6.2), (1.9, 6.55), (2.0, 5.5)]
    b.wing(tail, 0.18, "Hull", T(0, 0, 1.05) @ rot("Y", -90), edge_mat="HullAccent")
    b.box((0.12, 0.25, 0.1), "GlowAlt", T(0, 6.45, 3.02))

    # nose sensor, belly panels, intakes
    b.cylinder(0.05, 0.02, 0.8, "Metal", T(0, -7.9, 0.1) @ rot("X", 90), segments=8)
    b.box((1.5, 5.0, 0.18), "HullDark", T(0, -0.5, -0.62))
    b.box((0.5, 1.2, 0.25), "Metal", T(0.95, -1.8, -0.35))
    b.box((0.5, 1.2, 0.25), "Metal", T(-0.95, -1.8, -0.35))
    for y in (-1.0, 0.2, 1.4):
        b.box((2.2, 0.08, 0.06), "Metal", T(0, y, 1.23))
    body = b.to_object("Body", sharp_angle=40)

    # landing gear (separate so the game can retract it)
    g = Builder()
    for (x, y) in ((0.0, -4.4), (1.55, 3.1), (-1.55, 3.1)):
        g.cylinder(0.11, 0.11, 1.55, "Metal", T(x, y, -1.25), segments=10)
        g.cylinder(0.18, 0.18, 0.5, "HullDark", T(x, y, -0.7), segments=10)
        g.cylinder(0.42, 0.46, 0.12, "Rubber", T(x, y, -2.08), segments=16)
        g.box((0.08, 0.7, 0.08), "Metal", T(x, y + 0.25, -1.15) @ rot("X", 30))
    gear = g.to_object("Gear", sharp_angle=40)

    cockpit = bpy.data.objects.new("Cockpit", None)
    bpy.context.scene.collection.objects.link(cockpit)
    cockpit.location = (0, -3.2, 1.05)
    return empty("ship_explorer", [body, gear, cockpit])


def pirate_ship():
    """A hostile fighter: ~10 m, forward-swept blades, red glow."""
    b = Builder()
    n = 20
    sections = [
        (-5.4, 0.0, 0.10, 0.10, 2.0),
        (-4.6, 0.0, 0.70, 0.40, 2.0),
        (-2.8, 0.1, 1.40, 0.90, 2.3),
        (-0.5, 0.15, 1.80, 1.20, 2.6),
        (2.0, 0.15, 1.70, 1.10, 2.6),
        (3.8, 0.1, 1.30, 0.80, 2.4),
        (4.3, 0.1, 0.90, 0.60, 2.2),
    ]
    rings = [b.superellipse_ring(y, cz, w, h, n=n, e=e) for (y, cz, w, h, e) in sections]
    b.loft(rings, _hull_mat(top="HullDark", side="HullAccent", bottom="Metal", n=n))
    b.uvsphere(1.0, "Glass", T(0, -1.9, 0.62) @ S(0.5, 1.3, 0.35), u=16, v=10)
    blade = [(0.8, 1.8), (4.6, -1.8), (4.9, -0.9), (0.8, 3.6)]
    b.wing(blade, 0.22, "HullDark", T(0, 0, 0.0) @ rot("Y", 12), edge_mat="HullAccent")
    b.wing(_mirror_x(blade), 0.22, "HullDark", T(0, 0, 0.0) @ rot("Y", -12), edge_mat="HullAccent")
    tip_drop = -4.4 * math.sin(math.radians(12))
    for sx in (1, -1):
        b.cylinder(0.12, 0.08, 1.6, "Metal", T(4.4 * sx, -1.2, tip_drop) @ rot("X", 90), segments=8)
    _nacelle(b, 0.0, 0.15, 2.4, 5.0, 0.5, glow="GlowAlt")
    fin = [(0.0, 1.0), (0.0, 3.8), (1.2, 4.4), (1.3, 3.2)]
    b.wing(fin, 0.12, "HullAccent", T(0.5, 0, 0.6) @ rot("Y", -70))
    b.wing(fin, 0.12, "HullAccent", T(-0.5, 0, 0.6) @ rot("Y", -110))
    body = b.to_object("Body", sharp_angle=40)
    muzzle = bpy.data.objects.new("Muzzle", None)
    bpy.context.scene.collection.objects.link(muzzle)
    muzzle.location = (0, -5.6, 0.0)
    return empty("ship_pirate", [body, muzzle])


def hauler_ship():
    """A slow cargo hauler that flies around stations: ~32 m."""
    b = Builder()
    n = 16
    sections = [
        (-15.0, 1.0, 3.0, 2.4, 3.0),
        (-14.0, 1.0, 5.0, 4.0, 3.5),
        (-11.0, 1.0, 6.0, 5.0, 4.0),
        (-8.0, 1.0, 6.0, 5.0, 4.0),
    ]
    rings = [b.superellipse_ring(y, cz, w, h, n=n, e=e) for (y, cz, w, h, e) in sections]
    b.loft(rings, _hull_mat(n=n))
    b.box((5.6, 1.2, 1.6), "Glass", T(0, -14.2, 2.2))
    b.box((2.4, 20.0, 2.4), "HullDark", T(0, 1.5, 1.0))  # spine
    cols = ["HullAccent", "Hull", "Metal", "HullAccent", "Hull"]
    for i in range(5):
        y = -6.0 + i * 3.6
        for sx in (1, -1):
            for sz in (-1, 1):
                b.box((3.2, 3.2, 2.8), cols[(i + sx + sz) % len(cols)], T(sx * 1.9, y, 1.0 + sz * 1.6))
    b.box((7.5, 4.0, 5.5), "Hull", T(0, 12.5, 1.0))
    for sx in (-2.2, 0.0, 2.2):
        b.cylinder(0.9, 1.1, 1.6, "HullDark", T(sx, 15.2, 1.0) @ rot("X", 90), segments=16)
        b.cylinder(0.8, 0.8, 0.08, "Glow", T(sx, 16.0, 1.0) @ rot("X", 90), segments=16)
    body = b.to_object("Body", sharp_angle=40)
    return empty("ship_hauler", [body])


def multitool():
    """The hand-held mining/scanning tool, origin at the grip, ~0.5 m long."""
    b = Builder()
    n = 16
    sections = [
        (-0.30, 0.085, 0.040, 0.040, 2.0),
        (-0.26, 0.085, 0.070, 0.065, 2.4),
        (-0.12, 0.090, 0.090, 0.085, 2.8),
        (0.04, 0.095, 0.100, 0.100, 3.0),
        (0.14, 0.090, 0.090, 0.090, 2.8),
        (0.18, 0.090, 0.060, 0.060, 2.4),
    ]
    rings = [b.superellipse_ring(y, cz, w, h, n=n, e=e) for (y, cz, w, h, e) in sections]
    b.loft(rings, _hull_mat(top="HullAccent", side="Metal", bottom="HullDark", n=n))
    along = rot("X", 90)
    b.cylinder(0.022, 0.018, 0.14, "Metal", T(0, -0.36, 0.085) @ along, segments=12)
    for i in range(3):
        b.cylinder(0.05, 0.05, 0.012, "Glow", T(0, -0.21 + i * 0.045, 0.087) @ along, segments=16)
    b.box((0.02, 0.10, 0.03), "HullDark", T(0, -0.02, 0.155))
    b.box((0.012, 0.06, 0.012), "Glow", T(0, -0.02, 0.175))
    # grip and trigger guard
    b.box((0.045, 0.06, 0.16), "HullDark", T(0, 0.04, 0.0) @ rot("X", -18))
    b.box((0.012, 0.05, 0.012), "Metal", T(0, -0.04, 0.03))
    # side power cell
    b.cylinder(0.025, 0.025, 0.10, "Glow", T(0.055, 0.02, 0.09) @ along, segments=10)
    body = b.to_object("Body", sharp_angle=35)
    muzzle = bpy.data.objects.new("Muzzle", None)
    bpy.context.scene.collection.objects.link(muzzle)
    muzzle.location = (0, -0.44, 0.085)
    return empty("multitool", [body, muzzle])


def drone():
    """Sentinel drone: ~1.5 m hovering sphere with a single glowing eye."""
    b = Builder()
    b.uvsphere(0.6, "Hull", S(1.0, 1.1, 0.8), u=24, v=14)
    b.cylinder(0.34, 0.34, 0.12, "HullDark", T(0, -0.62, 0.02) @ rot("X", 90), segments=20)
    b.cylinder(0.22, 0.22, 0.06, "Glow", T(0, -0.70, 0.02) @ rot("X", 90), segments=20)
    b.box((1.9, 0.5, 0.06), "HullDark", T(0, 0.1, 0.0))
    for sx in (1, -1):
        b.box((0.08, 0.6, 0.35), "HullAccent", T(0.95 * sx, 0.1, 0.0))
        b.box((0.05, 0.08, 0.1), "Glow", T(0.99 * sx, -0.2, 0.0))
    b.cylinder(0.02, 0.01, 0.6, "Metal", T(0, 0.3, 0.72), segments=6)
    b.cylinder(0.25, 0.1, 0.25, "HullDark", T(0, 0, -0.55), segments=12)
    body = b.to_object("Body", sharp_angle=40)
    muzzle = bpy.data.objects.new("Muzzle", None)
    bpy.context.scene.collection.objects.link(muzzle)
    muzzle.location = (0, -0.75, 0.02)
    return empty("drone", [body, muzzle])


BUILDERS = {
    "ship_explorer": explorer_ship,
    "ship_pirate": pirate_ship,
    "ship_hauler": hauler_ship,
    "multitool": multitool,
    "drone": drone,
}
