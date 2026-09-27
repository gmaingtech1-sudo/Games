"""Shared modelling helpers for the Wayfarer asset builder.

Everything is built with bmesh so the script runs headless
(`blender --background --python build_assets.py`). Units are metres,
+Z is up and models face -Y (Blender's front view), which the FBX export
turns into Unity's +Z forward / +Y up.

Material slot names matter: the game swaps each imported material for its
own by name (Hull, HullAccent, HullDark, Metal, Glass, Glow, GlowAlt,
Rubber, Bark, Leaf, Leaf2, Stone, Crystal, Skin, Skin2, Eye, Horn).
"""

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

# Preview colours only. Unity replaces them with per-planet / per-ship palettes.
MATERIAL_LOOK = {
    "Hull": dict(color=(0.78, 0.80, 0.82), metal=0.35, rough=0.35),
    "HullAccent": dict(color=(0.85, 0.32, 0.08), metal=0.2, rough=0.4),
    "HullDark": dict(color=(0.10, 0.11, 0.13), metal=0.6, rough=0.45),
    "Metal": dict(color=(0.45, 0.47, 0.50), metal=0.9, rough=0.3),
    "Glass": dict(color=(0.05, 0.09, 0.12), metal=0.0, rough=0.05),
    "Glow": dict(color=(0.3, 0.8, 1.0), emit=(0.3, 0.8, 1.0), strength=6.0),
    "GlowAlt": dict(color=(1.0, 0.55, 0.15), emit=(1.0, 0.55, 0.15), strength=5.0),
    "Rubber": dict(color=(0.03, 0.03, 0.03), metal=0.0, rough=0.9),
    "Bark": dict(color=(0.28, 0.19, 0.12), metal=0.0, rough=0.9),
    "Leaf": dict(color=(0.20, 0.45, 0.12), metal=0.0, rough=0.7),
    "Leaf2": dict(color=(0.55, 0.62, 0.15), metal=0.0, rough=0.7),
    "Stone": dict(color=(0.42, 0.40, 0.37), metal=0.0, rough=0.85),
    "Crystal": dict(color=(0.35, 0.65, 1.0), metal=0.1, rough=0.1, emit=(0.2, 0.5, 1.0), strength=1.5),
    "Skin": dict(color=(0.55, 0.42, 0.30), metal=0.0, rough=0.7),
    "Skin2": dict(color=(0.85, 0.78, 0.62), metal=0.0, rough=0.7),
    "Eye": dict(color=(0.02, 0.02, 0.02), metal=0.0, rough=0.05),
    "Horn": dict(color=(0.80, 0.76, 0.66), metal=0.0, rough=0.5),
}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    look = MATERIAL_LOOK.get(name, dict(color=(0.6, 0.6, 0.6)))
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b = look["color"]
    m.diffuse_color = (r, g, b, 1.0)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
        bsdf.inputs["Metallic"].default_value = look.get("metal", 0.0)
        bsdf.inputs["Roughness"].default_value = look.get("rough", 0.5)
        if "emit" in look:
            er, eg, eb = look["emit"]
            bsdf.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
            bsdf.inputs["Emission Strength"].default_value = look.get("strength", 1.0)
    return m


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


class Builder:
    """Accumulates geometry into one bmesh with named material slots."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    # ---------------------------------------------------------------- utils
    def mi(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def _tag(self, faces, mat, smooth):
        idx = self.mi(mat)
        for f in faces:
            f.material_index = idx
            f.smooth = smooth
        return faces

    @staticmethod
    def _faces_of(verts):
        out = set()
        for v in verts:
            out.update(v.link_faces)
        return list(out)

    # ----------------------------------------------------------- primitives
    def box(self, size, mat, matrix=Matrix(), smooth=False):
        sx, sy, sz = size
        m = matrix @ Matrix.Diagonal((sx, sy, sz, 1.0))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self._tag(self._faces_of(res["verts"]), mat, smooth)

    def cylinder(self, r1, r2, depth, mat, matrix=Matrix(), segments=16, caps=True, smooth=True):
        res = bmesh.ops.create_cone(
            self.bm, cap_ends=caps, cap_tris=False, segments=segments,
            radius1=r1, radius2=r2, depth=depth, matrix=matrix)
        faces = self._faces_of(res["verts"])
        self._tag(faces, mat, smooth)
        # keep caps flat-shaded so nozzles and discs read crisply
        for f in faces:
            if len(f.verts) > 4:
                f.smooth = False
        return faces

    def sphere(self, radius, mat, matrix=Matrix(), subdiv=2, smooth=True):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=radius, matrix=matrix)
        return self._tag(self._faces_of(res["verts"]), mat, smooth)

    def uvsphere(self, radius, mat, matrix=Matrix(), u=16, v=10, smooth=True):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=radius, matrix=matrix)
        return self._tag(self._faces_of(res["verts"]), mat, smooth)

    def polygon_prism(self, pts2d, z0, z1, mat, matrix=Matrix(), smooth=False, side_mat=None):
        """Extrude a 2D outline (in XY) from z0 to z1."""
        bm = self.bm
        bot = [bm.verts.new(matrix @ Vector((x, y, z0))) for x, y in pts2d]
        top = [bm.verts.new(matrix @ Vector((x, y, z1))) for x, y in pts2d]
        faces = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
        n = len(pts2d)
        sides = []
        for i in range(n):
            j = (i + 1) % n
            sides.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
        self._tag(faces, mat, smooth)
        self._tag(sides, side_mat or mat, smooth)
        return faces + sides

    # ------------------------------------------------------------- lofting
    def loft(self, rings, mat_fn, cap_start=True, cap_end=True, smooth=True, closed=True):
        """Bridge a list of rings (lists of Vector). mat_fn(i_ring, j_point) -> material name."""
        bm = self.bm
        vrings = [[bm.verts.new(p) for p in ring] for ring in rings]
        faces = []
        n = len(rings[0])
        seg = n if closed else n - 1
        for i in range(len(vrings) - 1):
            a, b = vrings[i], vrings[i + 1]
            for j in range(seg):
                k = (j + 1) % n
                f = bm.faces.new((a[j], a[k], b[k], b[j]))
                f.material_index = self.mi(mat_fn(i, j))
                f.smooth = smooth
                faces.append(f)
        if closed:
            if cap_start:
                f = self._cap(vrings[0], reverse=False)
                f.material_index = self.mi(mat_fn(0, -1))
                faces.append(f)
            if cap_end:
                f = self._cap(vrings[-1], reverse=True)
                f.material_index = self.mi(mat_fn(len(vrings) - 1, -1))
                faces.append(f)
        return faces

    def _cap(self, ring, reverse):
        bm = self.bm
        c = Vector((0, 0, 0))
        for v in ring:
            c += v.co
        c /= len(ring)
        if (ring[0].co - c).length < 1e-5:
            # degenerate ring (a point) – nothing to cap
            return bm.faces.new(ring[:3])
        f = bm.faces.new(list(reversed(ring)) if reverse else ring)
        f.smooth = False
        return f

    def tube(self, path, radii, mat, segments=10, cap_start=True, cap_end=True, smooth=True, flatten=1.0):
        """A tube following a list of points with per-point radius."""
        rings = []
        prev_side = None
        for i, p in enumerate(path):
            if i == 0:
                t = (path[1] - path[0]).normalized()
            elif i == len(path) - 1:
                t = (path[-1] - path[-2]).normalized()
            else:
                t = (path[i + 1] - path[i - 1]).normalized()
            if prev_side is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                side = t.cross(ref).normalized()
            else:
                side = (prev_side - t * prev_side.dot(t)).normalized()
            up = side.cross(t).normalized()
            prev_side = side
            r = radii[i]
            ring = []
            for j in range(segments):
                a = 2 * math.pi * j / segments
                ring.append(p + side * math.cos(a) * r + up * math.sin(a) * r * flatten)
            rings.append(ring)
        return self.loft(rings, lambda i, j: mat, cap_start, cap_end, smooth)

    def superellipse_ring(self, y, cz, w, h, n=24, e=2.5, cx=0.0):
        pts = []
        for j in range(n):
            a = 2 * math.pi * j / n
            c, s = math.cos(a), math.sin(a)
            x = cx + w * 0.5 * math.copysign(abs(c) ** (2.0 / e), c)
            z = cz + h * 0.5 * math.copysign(abs(s) ** (2.0 / e), s)
            pts.append(Vector((x, y, z)))
        return pts

    def wing(self, planform, thickness, mat, matrix=Matrix(), edge_mat=None, taper_to=0.35):
        """A thin lifting surface from a planform outline in the XY plane.
        Thickness tapers toward the outermost X so tips stay thin."""
        bm = self.bm
        xs = [abs(p[0]) for p in planform]
        xmax = max(xs) if max(xs) > 0 else 1.0
        top, bot = [], []
        for x, y in planform:
            t = thickness * lerp(1.0, taper_to, abs(x) / xmax) * 0.5
            top.append(bm.verts.new(matrix @ Vector((x, y, t))))
            bot.append(bm.verts.new(matrix @ Vector((x, y, -t))))
        faces = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
        sides = []
        n = len(planform)
        for i in range(n):
            j = (i + 1) % n
            sides.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
        # outline may be wound either way; make the top face point up
        up = (matrix.to_3x3() @ Vector((0, 0, 1))).normalized()
        faces[0].normal_update()
        if faces[0].normal.dot(up) < 0:
            bmesh.ops.reverse_faces(bm, faces=faces + sides)
        self._tag(faces, mat, False)
        self._tag(sides, edge_mat or mat, False)
        return faces + sides

    def leaf_blade(self, base, direction, normal, length, width, mat, bend=0.3, segments=4, curl=0.0):
        """A double-sided curved leaf/blade (two faces back to back)."""
        bm = self.bm
        direction = direction.normalized()
        normal = normal.normalized()
        side = direction.cross(normal).normalized()
        left, right, mid = [], [], []
        for i in range(segments + 1):
            t = i / segments
            w = width * math.sin(math.pi * min(1.0, t * 1.1 + 0.05)) * (1.0 - 0.15 * t)
            p = base + direction * (length * t) + normal * (-bend * length * t * t)
            left.append(p - side * w * 0.5 + normal * curl * w)
            right.append(p + side * w * 0.5 + normal * curl * w)
        vl = [bm.verts.new(p) for p in left]
        vr = [bm.verts.new(p) for p in right]
        vl2 = [bm.verts.new(p - normal * 0.002) for p in left]
        vr2 = [bm.verts.new(p - normal * 0.002) for p in right]
        faces = []
        for i in range(segments):
            faces.append(bm.faces.new((vl[i], vr[i], vr[i + 1], vl[i + 1])))
            faces.append(bm.faces.new((vl2[i + 1], vr2[i + 1], vr2[i], vl2[i])))
        return self._tag(faces, mat, True)

    # ------------------------------------------------------------ deformers
    def displace(self, faces_or_all, amount, scale, seed=0, octaves=3, mode="fractal"):
        verts = set()
        src = self.bm.faces if faces_or_all is None else faces_or_all
        for f in src:
            verts.update(f.verts)
        self.bm.normal_update()
        off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
        for v in verts:
            p = v.co * scale + off
            if mode == "ridged":
                n = 1.0 - abs(noise.noise(p))
                n = n * n - 0.4
            else:
                n = noise.fractal(p, 0.8, 2.0, octaves)
            v.co += v.normal * n * amount

    def mark_sharp(self, angle_deg=35.0):
        lim = math.radians(angle_deg)
        for e in self.bm.edges:
            if len(e.link_faces) == 2:
                try:
                    a = e.calc_face_angle()
                except ValueError:
                    a = 0.0
                if a > lim:
                    e.smooth = False

    # ---------------------------------------------------------------- output
    def to_object(self, name, sharp_angle=None, collection=None):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        self.bm.normal_update()
        if sharp_angle is not None:
            self.mark_sharp(sharp_angle)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(material(m))
        obj = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(obj)
        return obj


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def S(x, y=None, z=None):
    if y is None:
        y = z = x
    return Matrix.Diagonal((x, y, z, 1.0))


def empty(name, children, collection=None):
    e = bpy.data.objects.new(name, None)
    (collection or bpy.context.scene.collection).objects.link(e)
    for c in children:
        c.parent = e
    return e


def decimated_copy(obj, name, ratio):
    """A lower-detail copy for distant LOD."""
    me = obj.data.copy()
    me.name = name
    lod = bpy.data.objects.new(name, me)
    for c in obj.users_collection:
        c.objects.link(lod)
    mod = lod.modifiers.new("decimate", "DECIMATE")
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = lod.evaluated_get(dg)
    new_me = bpy.data.meshes.new_from_object(ev)
    new_me.name = name
    old = lod.data
    lod.modifiers.clear()
    lod.data = new_me
    bpy.data.meshes.remove(old)
    return lod


def rng(seed):
    return random.Random(seed)
