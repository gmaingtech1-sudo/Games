"""Sets up the Narwhal chassis inside the unofficial Subnautica 2 modkit.

Run it in the Unreal Editor with the modkit project open and the
NarwhalChassis plugin copied into its Plugins folder:

    Tools > Execute Python Script... > pick this file

(the Python Editor Script Plugin must be enabled; it is by default in UE 5.6).
Run it again at any time: it replaces what it made before and leaves
everything else alone.

What it does:
  1. Imports the Blender exports from ../export into /NarwhalChassis/Meshes,
     using the UCX_ hulls in them as collision.
  2. Makes BP_Narwhal_TadpoleChassis, a child of the game's Scout Ray
     chassis blueprint, so it inherits all of the chassis behaviour.
  3. Points the blueprint's DeployedCollision and CollapsedCollision at the
     Narwhal collision meshes.
  4. Copies the Scout Ray's chassis data, item type, recipe and construct
     data into the plugin under Narwhal names, and tunes the handling.

The steps the editor can't script (swapping the visible mesh on inherited
components and re-linking the copied data assets) are in the README.
"""

import os

import unreal

PLUGIN = "/NarwhalChassis"
HERE = os.path.dirname(os.path.abspath(__file__))
EXPORT = os.path.normpath(os.path.join(HERE, "..", "export"))

TEMPLATE_BP = "/Game/Blueprints/Vehicle/Tadpole/BP_ScoutRay_TadpoleChassis"

# Game data assets to copy, found by name because their folders aren't
# listed in the game's reflection data. Template name -> our name.
TEMPLATE_DATA = {
    "DA_ScoutRay_TadpoleChassis": "DA_Narwhal_TadpoleChassis",
    "DA_ScoutRay_ItemType": "DA_Narwhal_ItemType",
    "DA_Tadpole_ScoutRay_Chassis_Recipe": "DA_Tadpole_Narwhal_Chassis_Recipe",
    "DA_ScoutChassis_ConstructData": "DA_NarwhalChassis_ConstructData",
}

# Handling for the Narwhal, applied on top of the Scout Ray's values.
# Property names are UWEVehicleChassisData's, in snake_case.
HANDLING = {
    "max_swim_acceleration": 1.20,   # quicker off the mark
    "angular_acceleration": 1.15,    # snappier turns
    "banking_modifier": 1.25,        # leans into turns like a whale
    "strafe_speed_modifier": 0.9,    # a little less sideways drift
}

tools = unreal.AssetToolsHelpers.get_asset_tools()
lib = unreal.EditorAssetLibrary


def log(msg):
    unreal.log(f"[Narwhal] {msg}")


def warn(msg):
    unreal.log_warning(f"[Narwhal] {msg}")


# -----------------------------------------------------------------------------

def import_mesh(fbx_name, folder):
    path = os.path.join(EXPORT, fbx_name)
    if not os.path.exists(path):
        warn(f"missing {path}; run blender/build_narwhal.py first")
        return None

    ui = unreal.FbxImportUI()
    ui.import_mesh = True
    ui.import_as_skeletal = False
    ui.import_materials = True
    ui.import_textures = False
    ui.import_animations = False
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
    data = ui.static_mesh_import_data
    data.combine_meshes = True
    data.auto_generate_collision = False      # we bring our own UCX_ hulls
    data.generate_lightmap_u_vs = False       # UV channel 1 comes from Blender
    data.convert_scene = True
    data.convert_scene_unit = True

    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = folder
    task.automated = True
    task.replace_existing = True
    task.save = True
    task.options = ui
    tools.import_asset_tasks([task])

    asset_path = f"{folder}/{os.path.splitext(fbx_name)[0]}"
    mesh = lib.load_asset(asset_path)
    if mesh:
        log(f"imported {asset_path}")
    else:
        warn(f"import of {fbx_name} didn't produce {asset_path}")
    return mesh


def find_game_asset(name):
    """Find a game asset by name anywhere under /Game/Data."""
    for path in lib.list_assets("/Game/Data", recursive=True, include_folder=False):
        if path.rsplit("/", 1)[-1].split(".")[0] == name:
            return path.split(".")[0]
    return None


def make_child_blueprint(parent_path, name, folder):
    target = f"{folder}/{name}"
    if lib.does_asset_exist(target):
        lib.delete_asset(target)
    parent_bp = lib.load_asset(parent_path)
    if not parent_bp:
        warn(f"couldn't load {parent_path}; is GameInstallDirectory.txt set?")
        return None
    parent_class = parent_bp.generated_class()
    factory = unreal.BlueprintFactory()
    factory.set_editor_property("parent_class", parent_class)
    bp = tools.create_asset(name, folder, unreal.Blueprint, factory)
    log(f"created {target} (child of {parent_path})")
    return bp


def set_default(bp, prop, value):
    cdo = unreal.get_default_object(bp.generated_class())
    try:
        cdo.set_editor_property(prop, value)
        log(f"set {prop} on {bp.get_name()}")
    except Exception as err:  # the property may have moved in a game update
        warn(f"couldn't set {prop}: {err}")


def copy_data_assets():
    copies = {}
    for template, ours in TEMPLATE_DATA.items():
        src = find_game_asset(template)
        if not src:
            warn(f"couldn't find {template} in /Game/Data")
            continue
        dst = f"{PLUGIN}/Data/{ours}"
        if lib.does_asset_exist(dst):
            lib.delete_asset(dst)
        copy = lib.duplicate_asset(src, dst)
        if copy:
            log(f"copied {src} -> {dst}")
            copies[ours] = copy
        else:
            warn(f"couldn't copy {src}")
    return copies


def tune_handling(chassis_data):
    for prop, scale in HANDLING.items():
        try:
            old = chassis_data.get_editor_property(prop)
            chassis_data.set_editor_property(prop, old * scale)
            log(f"{prop}: {old:.2f} -> {old * scale:.2f}")
        except Exception as err:
            warn(f"couldn't tune {prop}: {err}")
    lib.save_loaded_asset(chassis_data)


# -----------------------------------------------------------------------------

def main():
    meshes = f"{PLUGIN}/Meshes"
    deployed = import_mesh("SM_Narwhal_Chassis.fbx", meshes)
    collapsed = import_mesh("SM_Narwhal_Chassis_Collapsed.fbx", meshes)
    deployed_col = import_mesh("SM_Narwhal_DeployedCollision.fbx", meshes)
    collapsed_col = import_mesh("SM_Narwhal_CollapsedCollision.fbx", meshes)

    bp = make_child_blueprint(TEMPLATE_BP, "BP_Narwhal_TadpoleChassis", PLUGIN)
    if bp:
        if deployed_col:
            set_default(bp, "deployed_collision", deployed_col)
        if collapsed_col:
            set_default(bp, "collapsed_collision", collapsed_col)
        unreal.BlueprintEditorLibrary.compile_blueprint(bp)
        lib.save_loaded_asset(bp)

    copies = copy_data_assets()
    if "DA_Narwhal_TadpoleChassis" in copies:
        tune_handling(copies["DA_Narwhal_TadpoleChassis"])

    for asset in copies.values():
        lib.save_loaded_asset(asset)

    log("Done. Now follow 'Finishing in the editor' in the README.")
    if deployed and collapsed:
        lib.sync_browser_to_objects([deployed.get_path_name(), collapsed.get_path_name()])


main()
