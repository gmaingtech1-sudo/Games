"""Creature parts. The game assembles fauna from these at runtime.

Parts are built at unit size and carry empties that mark where other parts
attach: bodies have Neck, Tail, Back and Leg* markers, heads have Horn and
Ear* markers. Bodies face -Y (the game's forward), hips sit on the
underside, and legs hang from their origin down to z = -1.
"""

import math

import bpy
from mathutils import Vector

from wf_lib import Builder, T, rot, S, empty, rng, lerp


def _markers(pairs):
    out = []
    for name, loc in pairs:
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        e.location = loc
        out.append(e)
    return out


def _belly_fn(n):
    def fn(i, j):
        if j < 0:
            return "Skin"
        a = 2 * math.pi * j / n
        return "Skin2" if math.sin(a) < -0.35 else "Skin"
    return fn


def _torso(b, sections, n=18):
    rings = [b.superellipse_ring(y, cz, w, h, n=n, e=2.0) for (y, cz, w, h) in sections]
    b.loft(rings, _belly_fn(n), smooth=True)


def _legs4(front_y, back_y, x, z):
    return [("LegFL", (x, front_y, z)), ("LegFR", (-x, front_y, z)),
            ("LegBL", (x, back_y, z)), ("LegBR", (-x, back_y, z))]


def body_a():
    b = Builder()
    _torso(b, [(-0.62, 0.08, 0.05, 0.05), (-0.55, 0.08, 0.26, 0.30), (-0.35, 0.05, 0.38, 0.42),
               (-0.05, 0.02, 0.40, 0.40), (0.25, 0.04, 0.38, 0.38), (0.48, 0.06, 0.30, 0.30),
               (0.58, 0.07, 0.10, 0.10)])
    body = b.to_object("Body")
    marks = _markers([("Neck", (0, -0.52, 0.14)), ("Tail", (0, 0.55, 0.08)), ("Back", (0, -0.05, 0.22))]
                     + _legs4(-0.33, 0.32, 0.14, -0.08))
    return empty("cr_body_a", [body] + marks)


def body_b():
    b = Builder()
    _torso(b, [(-0.62, 0.20, 0.05, 0.05), (-0.55, 0.18, 0.40, 0.42), (-0.30, 0.16, 0.62, 0.62),
               (0.0, 0.10, 0.56, 0.52), (0.30, 0.04, 0.44, 0.40), (0.52, 0.02, 0.30, 0.28),
               (0.60, 0.02, 0.08, 0.08)])
    hump = b.sphere(0.24, "Skin", T(0, -0.22, 0.42) @ S(1.0, 1.4, 0.7), subdiv=2)
    body = b.to_object("Body")
    marks = _markers([("Neck", (0, -0.55, 0.28)), ("Tail", (0, 0.58, 0.04)), ("Back", (0, -0.2, 0.5))]
                     + _legs4(-0.3, 0.33, 0.2, -0.05))
    return empty("cr_body_b", [body] + marks)


def body_c():
    b = Builder()
    b.uvsphere(0.5, "Skin", T(0, 0, 0.05) @ S(0.9, 1.0, 0.85), u=20, v=14)
    b.uvsphere(0.42, "Skin2", T(0, -0.05, -0.08) @ S(0.8, 0.9, 0.6), u=16, v=10)
    body = b.to_object("Body")
    marks = _markers([("Neck", (0, -0.42, 0.18)), ("Tail", (0, 0.46, 0.0)), ("Back", (0, 0.0, 0.45))]
                     + _legs4(-0.22, 0.22, 0.22, -0.25))
    return empty("cr_body_c", [body] + marks)


def body_d():
    """Segmented insect body with six leg markers."""
    b = Builder()
    b.uvsphere(0.2, "Skin", T(0, -0.38, 0.05) @ S(1.0, 1.1, 0.9), u=14, v=10)
    b.uvsphere(0.24, "Skin2", T(0, -0.02, 0.03) @ S(1.0, 1.2, 0.8), u=14, v=10)
    b.uvsphere(0.32, "Skin", T(0, 0.42, 0.1) @ S(1.0, 1.5, 0.9), u=16, v=12)
    for k in range(4):
        b.box((0.3, 0.04, 0.05), "Skin2", T(0, 0.3 + k * 0.1, 0.34 - abs(k - 1.5) * 0.02))
    body = b.to_object("Body")
    marks = _markers([("Neck", (0, -0.55, 0.08)), ("Tail", (0, 0.88, 0.1)), ("Back", (0, 0.0, 0.2)),
                      ("LegFL", (0.12, -0.3, -0.05)), ("LegFR", (-0.12, -0.3, -0.05)),
                      ("LegML", (0.14, -0.02, -0.05)), ("LegMR", (-0.14, -0.02, -0.05)),
                      ("LegBL", (0.12, 0.25, -0.05)), ("LegBR", (-0.12, 0.25, -0.05))])
    return empty("cr_body_d", [body] + marks)


def _eyes(b, y, z, x, r):
    b.uvsphere(r, "Eye", T(x, y, z), u=10, v=8)
    b.uvsphere(r, "Eye", T(-x, y, z), u=10, v=8)


def head_a():
    """Long grazing head (deer / horse-like)."""
    b = Builder()
    rings = [b.superellipse_ring(y, cz, w, h, n=16, e=2.0) for (y, cz, w, h) in
             [(0.02, 0.0, 0.20, 0.22), (-0.12, 0.03, 0.24, 0.26), (-0.3, 0.0, 0.18, 0.18),
              (-0.46, -0.03, 0.13, 0.12), (-0.52, -0.03, 0.06, 0.05)]]
    b.loft(rings, _belly_fn(16), smooth=True)
    _eyes(b, -0.14, 0.08, 0.11, 0.035)
    b.cylinder(0.02, 0.01, 0.02, "Eye", T(0.03, -0.52, 0.0) @ rot("X", 90), segments=6)
    b.cylinder(0.02, 0.01, 0.02, "Eye", T(-0.03, -0.52, 0.0) @ rot("X", 90), segments=6)
    head = b.to_object("Head")
    marks = _markers([("Horn", (0, -0.1, 0.13)), ("EarL", (0.09, -0.02, 0.12)), ("EarR", (-0.09, -0.02, 0.12))])
    return empty("cr_head_a", [head] + marks)


def head_b():
    """Round head with big eyes."""
    b = Builder()
    b.uvsphere(0.22, "Skin", T(0, -0.16, 0.06), u=18, v=12)
    b.uvsphere(0.12, "Skin2", T(0, -0.32, -0.02) @ S(1.0, 0.8, 0.7), u=14, v=10)
    _eyes(b, -0.3, 0.12, 0.1, 0.06)
    head = b.to_object("Head")
    marks = _markers([("Horn", (0, -0.14, 0.26)), ("EarL", (0.14, -0.1, 0.2)), ("EarR", (-0.14, -0.1, 0.2))])
    return empty("cr_head_b", [head] + marks)


def head_c():
    """Wide reptilian head with a heavy jaw."""
    b = Builder()
    rings = [b.superellipse_ring(y, cz, w, h, n=16, e=2.6) for (y, cz, w, h) in
             [(0.02, 0.0, 0.26, 0.2), (-0.15, 0.02, 0.34, 0.2), (-0.35, 0.0, 0.3, 0.14),
              (-0.5, -0.01, 0.22, 0.09), (-0.55, -0.01, 0.12, 0.05)]]
    b.loft(rings, _belly_fn(16), smooth=True)
    b.box((0.26, 0.4, 0.05), "Skin2", T(0, -0.3, -0.08))
    for k in range(6):
        b.cylinder(0.012, 0.0, 0.05, "Horn", T(0.1 * (1 if k % 2 else -1), -0.28 - (k // 2) * 0.07, -0.05) @ rot("X", 180), segments=4)
    _eyes(b, -0.16, 0.1, 0.13, 0.035)
    head = b.to_object("Head")
    marks = _markers([("Horn", (0, -0.12, 0.1)), ("EarL", (0.14, 0.0, 0.08)), ("EarR", (-0.14, 0.0, 0.08))])
    return empty("cr_head_c", [head] + marks)


def head_d():
    """Insect head with mandibles and antennae."""
    b = Builder()
    b.uvsphere(0.14, "Skin", T(0, -0.12, 0.0) @ S(1.0, 1.1, 0.9), u=14, v=10)
    _eyes(b, -0.18, 0.05, 0.1, 0.06)
    for sx in (1, -1):
        b.tube([Vector((0.05 * sx, -0.22, -0.05)), Vector((0.1 * sx, -0.3, -0.06)), Vector((0.03 * sx, -0.36, -0.06))],
               [0.025, 0.02, 0.008], "Horn", segments=6)
        b.tube([Vector((0.04 * sx, -0.18, 0.1)), Vector((0.12 * sx, -0.3, 0.3)), Vector((0.2 * sx, -0.28, 0.45))],
               [0.012, 0.01, 0.006], "Skin2", segments=5)
    head = b.to_object("Head")
    marks = _markers([("Horn", (0, -0.1, 0.12)), ("EarL", (0.1, -0.08, 0.08)), ("EarR", (-0.1, -0.08, 0.08))])
    return empty("cr_head_d", [head] + marks)


def leg_a():
    b = Builder()
    b.tube([Vector((0, 0, 0.05)), Vector((0, -0.04, -0.28)), Vector((0, -0.06, -0.5)),
            Vector((0, 0.03, -0.75)), Vector((0, 0.0, -0.93))], [0.1, 0.08, 0.055, 0.045, 0.04], "Skin", segments=8)
    b.cylinder(0.05, 0.06, 0.08, "Horn", T(0, 0.0, -0.96), segments=8)
    return empty("cr_leg_a", [b.to_object("Leg")])


def leg_b():
    b = Builder()
    b.tube([Vector((0, 0, 0.05)), Vector((0, 0.02, -0.4)), Vector((0, 0.0, -0.9))], [0.17, 0.14, 0.12], "Skin", segments=10)
    b.uvsphere(0.15, "Skin2", T(0, -0.03, -0.93) @ S(1.0, 1.2, 0.5), u=12, v=8)
    return empty("cr_leg_b", [b.to_object("Leg")])


def leg_c():
    b = Builder()
    b.tube([Vector((0, 0, 0)), Vector((0.3, 0, 0.22)), Vector((0.42, 0, 0.1)), Vector((0.5, 0, -0.95))],
           [0.05, 0.04, 0.035, 0.01], "Skin", segments=6)
    b.sphere(0.05, "Skin2", T(0.3, 0, 0.22), subdiv=1)
    return empty("cr_leg_c", [b.to_object("Leg")])


def tail_a():
    b = Builder()
    pts = [Vector((0, 0.8 * t, 0.25 * math.sin(t * 2.4))) for t in [i / 6 for i in range(7)]]
    b.tube(pts, [0.07 * (1 - i / 7) + 0.01 for i in range(7)], "Skin", segments=8)
    return empty("cr_tail_a", [b.to_object("Tail")])


def tail_b():
    b = Builder()
    b.tube([Vector((0, 0, 0)), Vector((0, 0.25, 0.05)), Vector((0, 0.45, 0.05))], [0.08, 0.06, 0.07], "Skin", segments=8)
    b.uvsphere(0.13, "Skin2", T(0, 0.55, 0.05), u=12, v=8)
    for k in range(5):
        a = k * 2 * math.pi / 5
        b.cylinder(0.035, 0.0, 0.14, "Horn", T(math.cos(a) * 0.12, 0.55, 0.05 + math.sin(a) * 0.12) @ rot("Y", -math.degrees(a) + 90), segments=5)
    return empty("cr_tail_b", [b.to_object("Tail")])


def horn_a():
    b = Builder()
    pts = [Vector((0, -0.12 * t * t, 0.35 * t)) for t in [i / 5 for i in range(6)]]
    for sx in (1, -1):
        b.tube([p + Vector((0.06 * sx + 0.08 * sx * (p.z / 0.35), 0, 0)) for p in pts],
               [0.04 * (1 - i / 6) + 0.004 for i in range(6)], "Horn", segments=7)
    return empty("cr_horn_a", [b.to_object("Horn")])


def horn_b():
    b = Builder()
    for sx in (1, -1):
        base = Vector((0.06 * sx, 0, 0))
        top = Vector((0.25 * sx, 0.05, 0.45))
        b.tube([base, (base + top) * 0.5 + Vector((0.03 * sx, 0, 0)), top], [0.025, 0.02, 0.01], "Horn", segments=6)
        for k in range(2):
            s = base + (top - base) * (0.45 + k * 0.25)
            b.tube([s, s + Vector((0.05 * sx, -0.12, 0.12))], [0.015, 0.005], "Horn", segments=5)
    return empty("cr_horn_b", [b.to_object("Horn")])


def ear_a():
    b = Builder()
    b.uvsphere(0.1, "Skin", T(0.03, 0.02, 0.12) @ rot("Y", 20) @ S(0.4, 0.18, 1.3), u=12, v=8)
    b.uvsphere(0.08, "Skin2", T(0.03, 0.0, 0.12) @ rot("Y", 20) @ S(0.3, 0.12, 1.1), u=10, v=6)
    return empty("cr_ear_a", [b.to_object("Ear")])


def crest():
    b = Builder()
    outline = [(0.0, -0.4), (0.12, -0.2), (0.16, 0.05), (0.1, 0.3), (0.0, 0.45)]
    b.wing(outline, 0.03, "Skin2", rot("Y", -90))
    return empty("cr_crest", [b.to_object("Crest")])


def wing_a():
    b = Builder()
    planform = [(0.0, -0.15), (0.6, -0.25), (1.2, -0.05), (1.0, 0.15), (0.7, 0.05), (0.45, 0.25), (0.0, 0.2)]
    b.wing(planform, 0.02, "Skin2")
    b.tube([Vector((0, -0.12, 0.01)), Vector((0.6, -0.24, 0.02)), Vector((1.2, -0.05, 0.01))], [0.03, 0.022, 0.01], "Skin", segments=6)
    return empty("cr_wing_a", [b.to_object("Wing")])


BUILDERS = {
    "cr_body_a": body_a,
    "cr_body_b": body_b,
    "cr_body_c": body_c,
    "cr_body_d": body_d,
    "cr_head_a": head_a,
    "cr_head_b": head_b,
    "cr_head_c": head_c,
    "cr_head_d": head_d,
    "cr_leg_a": leg_a,
    "cr_leg_b": leg_b,
    "cr_leg_c": leg_c,
    "cr_tail_a": tail_a,
    "cr_tail_b": tail_b,
    "cr_horn_a": horn_a,
    "cr_horn_b": horn_b,
    "cr_ear_a": ear_a,
    "cr_crest": crest,
    "cr_wing_a": wing_a,
}
