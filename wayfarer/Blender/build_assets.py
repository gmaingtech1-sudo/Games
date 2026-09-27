"""Wayfarer asset builder.

Builds every model the game uses, from code, and exports each one as an
FBX file into the Unity project (Assets/Resources/Models). Run it with
Blender 4.2 or newer:

    blender --background --python Blender/build_assets.py

Options (after a lone `--`):

    --only ship_explorer,station   build just these assets
    --previews DIR                 also render a thumbnail of each asset
                                   and a contact sheet (Cycles, CPU)
    --blend FILE                   also save every asset into one .blend,
                                   laid out in a grid, for editing by hand
    --out DIR                      export somewhere other than the Unity project

The FBX files are already in the repository, so you only need to run this
if you change a model.
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import wf_lib  # noqa: E402
import wf_ships  # noqa: E402
import wf_structures  # noqa: E402
import wf_nature  # noqa: E402
import wf_creatures  # noqa: E402

ALL = {}
for mod in (wf_ships, wf_structures, wf_nature, wf_creatures):
    ALL.update(mod.BUILDERS)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {"only": None, "previews": None, "blend": None,
            "out": os.path.normpath(os.path.join(HERE, "..", "Assets", "Resources", "Models"))}
    i = 0
    while i < len(argv):
        key = argv[i].lstrip("-")
        if key in opts and i + 1 < len(argv):
            opts[key] = argv[i + 1]
            i += 2
        else:
            i += 1
    if opts["only"]:
        opts["only"] = [s.strip() for s in opts["only"].split(",") if s.strip()]
    return opts


def hierarchy(root):
    out = [root]
    for c in root.children:
        out.extend(hierarchy(c))
    return out


def export_fbx(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in hierarchy(root):
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.fbx(
        filepath=path,
        check_existing=False,
        use_selection=True,
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Z",
        axis_up="Y",
        use_space_transform=True,
        bake_space_transform=True,
        object_types={"EMPTY", "MESH"},
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        use_triangles=True,
        use_tspace=False,
        use_custom_props=False,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="AUTO",
        embed_textures=False,
    )


def stats(root):
    tris = 0
    for o in hierarchy(root):
        if o.type == "MESH":
            if o.name.endswith("_LOD1"):
                continue
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return tris


def world_bounds(root):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for o in hierarchy(root):
        if o.type != "MESH" or o.name.endswith("_LOD1"):
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def render_preview(root, path):
    scene = bpy.context.scene
    for o in hierarchy(root):
        if o.name.endswith("_LOD1"):
            o.hide_render = True
    lo, hi = world_bounds(root)
    center = (lo + hi) * 0.5
    size = max((hi - lo).length, 0.01)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    d = Vector((-0.9, -1.3, 0.75)).normalized()
    cam.location = center + d * size * 1.35
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_end = size * 10
    scene.camera = cam

    sun_data = bpy.data.lights.new("PreviewSun", "SUN")
    sun_data.energy = 3.5
    sun = bpy.data.objects.new("PreviewSun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-40))
    scene.collection.objects.link(sun)

    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.08, 0.1, 0.14, 1.0)
        bg.inputs["Strength"].default_value = 1.0

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    try:
        scene.cycles.use_denoising = True
    except Exception:
        pass
    scene.render.resolution_x = 320
    scene.render.resolution_y = 320
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def contact_sheet(paths, out_path, cols=8):
    import numpy as np
    tiles = []
    for p in paths:
        img = bpy.data.images.load(p)
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        tiles.append(px)
        bpy.data.images.remove(img)
    if not tiles:
        return
    th, tw = tiles[0].shape[:2]
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.zeros((rows * th, cols * tw, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * th  # Blender images are bottom-up
        sheet[y0:y0 + th, c * tw:(c + 1) * tw] = t
    img = bpy.data.images.new("sheet", cols * tw, rows * th, alpha=True)
    img.pixels[:] = sheet.ravel()
    img.filepath_raw = out_path
    img.file_format = "PNG"
    img.save()


def build_blend(names, path):
    wf_lib.reset_scene()
    cols = 8
    spacing = 30.0
    for i, name in enumerate(names):
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
        before = set(bpy.data.objects)
        root = ALL[name]()
        for o in set(bpy.data.objects) - before:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            coll.objects.link(o)
        if name == "station":
            root.location = (0, -600, 0)
        else:
            r, c = divmod(i, cols)
            root.location = (c * spacing, r * spacing, 0)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


def main():
    opts = parse_args()
    names = opts["only"] or list(ALL.keys())
    os.makedirs(opts["out"], exist_ok=True)
    if opts["previews"]:
        os.makedirs(opts["previews"], exist_ok=True)
    thumbs = []
    total = 0
    for name in names:
        if name not in ALL:
            print(f"!! unknown asset {name}")
            continue
        wf_lib.reset_scene()
        root = ALL[name]()
        if root.name != name:
            root.name = name
        tris = stats(root)
        total += tris
        path = os.path.join(opts["out"], name + ".fbx")
        export_fbx(root, path)
        print(f"   {name:<18} {tris:>7} tris  -> {os.path.relpath(path)}")
        if opts["previews"]:
            tp = os.path.join(opts["previews"], name + ".png")
            render_preview(root, tp)
            thumbs.append(tp)
    print(f"== {len(names)} assets, {total} triangles")
    if thumbs:
        contact_sheet(thumbs, os.path.join(opts["previews"], "_contact_sheet.png"))
    if opts["blend"]:
        build_blend(names, os.path.abspath(opts["blend"]))
        print("== saved", opts["blend"])


if __name__ == "__main__":
    main()
