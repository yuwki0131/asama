"""Headless Blender render entry point for the asama isometric asset pipeline.

Run:
    blender --background --factory-startup --python render_asset.py -- \
        --model calibration-tile \
        --canvas 64x32 \
        --anchor 32,16 \
        --output-directory assets/intermediate/raw-renders \
        --render-spec workbench-flat

Contract (docs/05_map-and-art/isometric-alignment.md):
    tile width  64px, tile height 32px (2:1 dimetric)
    screenX = (mapX - mapY) * 32
    screenY = (mapX + mapY) * 16

The camera rig guarantees the contract by construction:
    - orthographic camera, rotation (60 deg, 0, 45 deg)
    - 1 Blender unit == 1 tile side on the ground plane
    - ortho scale chosen so one tile projects to exactly 64x32 px
    - camera translated in its view plane so that world origin projects
      to the requested anchor pixel

Models place their logical placement point at world origin:
    - surface / connected assets: footprint center at origin
    - large vertical buildings: south/bottom contact point at origin

Map-to-world convention (IMPORTANT):
    Screen space is y-down (left-handed) while Blender world space is
    right-handed, so satisfying both screenX=(mapX-mapY)*32 and
    screenY=(mapX+mapY)*16 with a physical camera requires mirroring one
    axis. The fixed convention is:

        worldX = mapX
        worldY = -mapY

    Model builders MUST author geometry in world coordinates using this
    mapping. Example: a building whose footprint extends 4 tiles north-west
    from its south contact corner at map [-4..0]x[-4..0] occupies world
    x in [-4,0], y in [0,4]. Use map_xy() to convert.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

TILE_WIDTH_PX = 64.0
TILE_HEIGHT_PX = 32.0
# Horizontal pixels per world unit in the camera view plane.
# A unit tile's ground diagonal (length sqrt(2)) spans the 64px diamond width.
PX_PER_UNIT = TILE_WIDTH_PX / math.sqrt(2.0)
CAMERA_DISTANCE = 50.0

ISO_ROTATION = Euler((math.radians(60.0), 0.0, math.radians(45.0)), "XYZ")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="asama isometric asset renderer")
    parser.add_argument("--model", required=True, help="registered model name to build")
    parser.add_argument("--canvas", required=True, help="output size, e.g. 64x32")
    parser.add_argument("--anchor", required=True, help="anchor pixel, e.g. 32,16")
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--output-name", default=None, help="file name without extension (default: model name)")
    parser.add_argument("--render-spec", default="workbench-flat")
    parser.add_argument("--transparent-background", default="true")
    parser.add_argument("--render-seed", type=int, default=0)
    parser.add_argument("--frame", type=int, default=1)
    parser.add_argument("--report-json", default=None, help="optional path for a render report JSON")
    return parser.parse_args(argv)


def parse_pair(text: str, separator: str) -> tuple[float, float]:
    left, right = text.split(separator, 1)
    return float(left), float(right)


def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_camera(scene: bpy.types.Scene, canvas_w: float, canvas_h: float, anchor_x: float, anchor_y: float) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("IsoCamera")
    camera_data.type = "ORTHO"
    camera_data.sensor_fit = "HORIZONTAL"
    camera_data.ortho_scale = canvas_w / PX_PER_UNIT
    camera_data.clip_start = 0.1
    camera_data.clip_end = 500.0

    camera = bpy.data.objects.new("IsoCamera", camera_data)
    scene.collection.objects.link(camera)
    camera.rotation_euler = ISO_ROTATION

    quat = ISO_ROTATION.to_quaternion()
    forward = quat @ Vector((0.0, 0.0, -1.0))
    right = quat @ Vector((1.0, 0.0, 0.0))
    up = quat @ Vector((0.0, 1.0, 0.0))

    # With the camera axis through world origin, origin projects to canvas
    # center. Translate the camera in its view plane so origin lands on the
    # anchor pixel instead. Screen y grows downward.
    dx_px = anchor_x - canvas_w / 2.0
    dy_px = anchor_y - canvas_h / 2.0
    camera.location = (
        right * (-dx_px / PX_PER_UNIT)
        + up * (dy_px / PX_PER_UNIT)
        - forward * CAMERA_DISTANCE
    )

    scene.camera = camera
    return camera


def setup_render(scene: bpy.types.Scene, canvas_w: int, canvas_h: int, spec_name: str, transparent: bool, seed: int, output_path: str) -> None:
    render = scene.render
    render.resolution_x = canvas_w
    render.resolution_y = canvas_h
    render.resolution_percentage = 100
    render.film_transparent = transparent
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"
    render.filepath = output_path

    if spec_name == "workbench-flat":
        render.engine = "BLENDER_WORKBENCH"
        shading = scene.display.shading
        shading.light = "FLAT"
        shading.color_type = "MATERIAL"
        scene.display.render_aa = "8"
    elif spec_name == "cycles-cpu":
        render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 64
        scene.cycles.seed = seed
        scene.cycles.use_denoising = False
        setup_production_lighting(scene)
    else:
        raise SystemExit(f"unknown render spec: {spec_name}")


def setup_production_lighting(scene: bpy.types.Scene) -> None:
    """Fixed sun per art direction: light from screen top-left, shadows to
    screen bottom-right, identical for every asset.

    With the fixed camera azimuth, screen bottom-right corresponds to the
    world direction (+x, slightly -y). The sun travels along that horizontal
    heading at roughly 50 degrees elevation.
    """
    direction = Vector((1.0, -0.2, -1.4)).normalized()
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 4.2
    sun_data.angle = 0.06
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)

    # Ambient fill keeps shaded faces readable; slightly cool to contrast
    # the warm sun without pushing saturation (art direction: low chroma).
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = (0.65, 0.68, 0.74, 1.0)
        background.inputs["Strength"].default_value = 0.85
    scene.world = world


def make_material(name: str, rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = rgba
    return material


def add_mesh(scene: bpy.types.Scene, name: str, vertices: list[tuple[float, float, float]], faces: list[tuple[int, ...]], material: bpy.types.Material) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    scene.collection.objects.link(obj)
    return obj


def build_calibration_tile(scene: bpy.types.Scene) -> None:
    """Unit ground tile, footprint center at origin.

    Expected projection on a 64x32 canvas with anchor (32,16):
    diamond vertices at (32,0), (64,16), (32,32), (0,16).
    """
    material = make_material("CalibrationTile", (0.1, 0.7, 0.2, 1.0))
    add_mesh(
        scene,
        "CalibrationTile",
        [(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0), (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)],
        [(0, 1, 2, 3)],
        material,
    )


def build_calibration_cube(scene: bpy.types.Scene) -> None:
    """Unit footprint cube, height 1, footprint center at origin."""
    material = make_material("CalibrationCube", (0.7, 0.3, 0.1, 1.0))
    h = 1.0
    add_mesh(
        scene,
        "CalibrationCube",
        [
            (-0.5, -0.5, 0.0), (0.5, -0.5, 0.0), (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0),
            (-0.5, -0.5, h), (0.5, -0.5, h), (0.5, 0.5, h), (-0.5, 0.5, h),
        ],
        [
            (0, 1, 2, 3), (4, 5, 6, 7),
            (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        ],
        material,
    )


def build_calibration_grid(scene: bpy.types.Scene) -> None:
    """3x3 tile checkerboard, footprint center at origin, for seam checks."""
    dark = make_material("GridDark", (0.15, 0.4, 0.15, 1.0))
    light = make_material("GridLight", (0.3, 0.65, 0.3, 1.0))
    for gx in range(3):
        for gy in range(3):
            x0 = gx - 1.5
            y0 = gy - 1.5
            add_mesh(
                scene,
                f"GridTile_{gx}_{gy}",
                [(x0, y0, 0.0), (x0 + 1, y0, 0.0), (x0 + 1, y0 + 1, 0.0), (x0, y0 + 1, 0.0)],
                [(0, 1, 2, 3)],
                dark if (gx + gy) % 2 == 0 else light,
            )


def add_box(scene: bpy.types.Scene, name: str, low: tuple[float, float, float], high: tuple[float, float, float], material: bpy.types.Material) -> bpy.types.Object:
    x0, y0, z0 = low
    x1, y1, z1 = high
    return add_mesh(
        scene,
        name,
        [
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        ],
        [
            (0, 1, 2, 3), (4, 5, 6, 7),
            (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        ],
        material,
    )


def add_gable_roof(scene: bpy.types.Scene, name: str, low: tuple[float, float], high: tuple[float, float], base_z: float, ridge_z: float, ridge_axis: str, material: bpy.types.Material) -> bpy.types.Object:
    """Gabled prism roof. Ridge runs along ridge_axis ('x' or 'y')."""
    x0, y0 = low
    x1, y1 = high
    if ridge_axis == "x":
        ridge_a = ((x0, (y0 + y1) / 2.0, ridge_z))
        ridge_b = ((x1, (y0 + y1) / 2.0, ridge_z))
        vertices = [
            (x0, y0, base_z), (x1, y0, base_z), (x1, y1, base_z), (x0, y1, base_z),
            ridge_a, ridge_b,
        ]
        faces = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    else:
        ridge_a = (((x0 + x1) / 2.0, y0, ridge_z))
        ridge_b = (((x0 + x1) / 2.0, y1, ridge_z))
        vertices = [
            (x0, y0, base_z), (x1, y0, base_z), (x1, y1, base_z), (x0, y1, base_z),
            ridge_a, ridge_b,
        ]
        faces = [(0, 4, 5, 3), (1, 2, 5, 4), (0, 1, 4), (2, 3, 5), (0, 3, 2, 1)]
    return add_mesh(scene, name, vertices, faces, material)


def make_grass_material() -> bpy.types.Material:
    """Low-saturation grass with subtle large-scale noise variation."""
    material = bpy.data.materials.new("Grass")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 4.0

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.208, 0.294, 0.157, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.322, 0.412, 0.204, 1.0)

    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return material


def build_terrain_grass(scene: bpy.types.Scene) -> None:
    """One grass surface tile, footprint center at origin. Canvas 64x32, anchor 32,16."""
    add_mesh(
        scene,
        "GrassTile",
        [(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0), (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)],
        [(0, 1, 2, 3)],
        make_grass_material(),
    )


def map_xy(map_x: float, map_y: float) -> tuple[float, float]:
    """Convert map-grid coordinates to Blender world coordinates."""
    return (map_x, -map_y)


def map_box(low_map: tuple[float, float, float], high_map: tuple[float, float, float]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    """Convert a map-space box (low/high corners) to world-space low/high."""
    (x0, y0, z0), (x1, y1, z1) = low_map, high_map
    wx0, wy1 = map_xy(x0, y0)
    wx1, wy0 = map_xy(x1, y1)
    return (wx0, wy0, z0), (wx1, wy1, z1)


# Building scale standard --------------------------------------------------
#
# Calibrated against building.tenshu.test (8x8 footprint, ~7.4 world units
# tall including its stone base, filling ~93% of its footprint): the tenshu
# is the reference silhouette the rest of the roster scales under.
#
#   - one wall story (ground to eaves): ~0.9-1.0 units (~35-39px)
#   - common single-story building total height (ridge): ~1.6-1.9 units
#   - ordinary buildings leave visible yard inside their logical footprint;
#     only monumental structures (tenshu, yagura, gates) fill it
#   - the unused footprint is grounded with a flat yard pad so the lot
#     still reads as occupied

STORY_WALL_HEIGHT = 0.95
YARD_PAD_HEIGHT = 0.02


def add_yard_pad(scene: bpy.types.Scene, lot_width: float, lot_height: float, material: bpy.types.Material) -> None:
    """Flat pad covering the full map [-lot_width..0]x[-lot_height..0] lot.

    The pad reaches the exact lot boundary so the sprite's south contact
    pixel lands on the anchor (large buildings are placed by their south
    corner).
    """
    add_box(scene, "YardPad", *map_box((-lot_width, -lot_height, 0.0), (0.0, 0.0, YARD_PAD_HEIGHT)), material)


def add_gabled_house(
    scene: bpy.types.Scene,
    name: str,
    low: tuple[float, float],
    high: tuple[float, float],
    wall_top: float,
    ridge_top: float,
    ridge_axis: str,
    wall_material: bpy.types.Material,
    roof_material: bpy.types.Material,
    plinth_material: bpy.types.Material | None = None,
    plinth_height: float = 0.0,
    roof_overhang: float = 0.2,
) -> None:
    """Common house block: optional plinth, walls, gabled roof with overhang.

    low/high are the wall footprint corners in map coordinates.
    """
    x0, y0 = low
    x1, y1 = high
    base = 0.0
    if plinth_material is not None and plinth_height > 0.0:
        add_box(scene, f"{name}Plinth", *map_box((x0 - 0.08, y0 - 0.08, 0.0), (x1 + 0.08, y1 + 0.08, plinth_height)), plinth_material)
        base = plinth_height
    add_box(scene, f"{name}Body", *map_box((x0, y0, base), (x1, y1, wall_top)), wall_material)
    roof_low, roof_high = map_box((x0 - roof_overhang, y0 - roof_overhang, 0.0), (x1 + roof_overhang, y1 + roof_overhang, 0.0))
    world_axis = ridge_axis  # map x stays world x; map y maps to world y with flipped sign only
    add_gable_roof(scene, f"{name}Roof", (roof_low[0], roof_low[1]), (roof_high[0], roof_high[1]), wall_top, ridge_top, world_axis, roof_material)


def build_storehouse_graybox(scene: bpy.types.Scene) -> None:
    """Kura (storehouse) on a 3x3 lot, scaled to the tenshu standard.

    Large vertical building: south/bottom contact point at world origin, so
    the lot square is map [-3..0]x[-3..0]. Canvas 224x176, anchor 112,144.
    The building itself is a modest single-story kura (~1.75 units to the
    ridge, ~24% of the tenshu height) centered in the lot; a gravel yard pad
    grounds the remaining footprint.
    """
    plaster = make_material("Plaster", (0.78, 0.76, 0.70, 1.0))
    stone = make_material("StoneBase", (0.42, 0.40, 0.36, 1.0))
    roof = make_material("RoofTile", (0.22, 0.24, 0.29, 1.0))
    wood = make_material("Wood", (0.35, 0.26, 0.18, 1.0))
    gravel = make_material("YardGravel", (0.52, 0.48, 0.40, 1.0))

    add_yard_pad(scene, 3.0, 3.0, gravel)
    # Stone plinth under the building only.
    add_box(scene, "Plinth", *map_box((-2.65, -2.35, 0.0), (-0.35, -0.65, 0.22)), stone)
    # Plastered storehouse body, one tall storage story.
    add_box(scene, "Body", *map_box((-2.5, -2.2, 0.22), (-0.5, -0.8, 0.22 + STORY_WALL_HEIGHT)), plaster)
    # Dark wood band under the eaves.
    add_box(scene, "EaveBand", *map_box((-2.55, -2.25, 0.97), (-0.45, -0.75, 0.22 + STORY_WALL_HEIGHT)), wood)
    # Gabled tile roof with overhang, ridge along the long map-x axis.
    low, high = map_box((-2.75, -2.45, 0.0), (-0.25, -0.55, 0.0))
    add_gable_roof(scene, "Roof", (low[0], low[1]), (high[0], high[1]), 0.22 + STORY_WALL_HEIGHT, 1.75, "x", roof)


def build_calibration_chirality(scene: bpy.types.Scene) -> None:
    """Asymmetric marker that locks the map-to-world mirror convention.

    A flat tile sits at map (0,0) (footprint center at origin) and a unit
    cube occupies the EAST neighbor column, map [1..2]x[0..1]. Map east
    (+mapX) must project to screen lower-right, so with canvas 160x128 and
    anchor 80,48 the cube must appear right of and below the flat tile.
    The opaque centroid must land right of canvas center; a mirrored
    projection puts it left, which the calibration check must reject.
    """
    tile = make_material("ChiralityTile", (0.2, 0.5, 0.7, 1.0))
    cube = make_material("ChiralityCube", (0.75, 0.55, 0.15, 1.0))
    add_mesh(
        scene,
        "ChiralityTilePlane",
        [(-0.5, 0.5, 0.0), (0.5, 0.5, 0.0), (0.5, -0.5, 0.0), (-0.5, -0.5, 0.0)],
        [(0, 1, 2, 3)],
        tile,
    )
    add_box(scene, "ChiralityCube", *map_box((1.0, 0.0, 0.0), (2.0, 1.0, 1.0)), cube)


def building_material_set() -> dict[str, bpy.types.Material]:
    return {
        "plaster": make_material("Plaster", (0.78, 0.76, 0.70, 1.0)),
        "wood": make_material("Wood", (0.42, 0.32, 0.22, 1.0)),
        "dark_wood": make_material("DarkWood", (0.30, 0.23, 0.16, 1.0)),
        "stone": make_material("StoneBase", (0.42, 0.40, 0.36, 1.0)),
        "roof": make_material("RoofTile", (0.22, 0.24, 0.29, 1.0)),
        "thatch": make_material("Thatch", (0.45, 0.38, 0.24, 1.0)),
        "gravel": make_material("YardGravel", (0.52, 0.48, 0.40, 1.0)),
        "dirt": make_material("YardDirt", (0.44, 0.38, 0.29, 1.0)),
    }


def build_market_graybox(scene: bpy.types.Scene) -> None:
    """Ichiba (market) on a 4x3 lot: two open stall sheds along map x.

    Canvas 256x192, anchor 128,160. Low wooden sheds (ridge 1.3 units).
    """
    mats = building_material_set()
    add_yard_pad(scene, 4.0, 3.0, mats["gravel"])
    add_gabled_house(scene, "StallNorth", (-3.5, -2.6), (-0.5, -1.75), 0.8, 1.3, "x", mats["wood"], mats["thatch"], roof_overhang=0.15)
    add_gabled_house(scene, "StallSouth", (-3.5, -1.25), (-0.5, -0.4), 0.8, 1.3, "x", mats["wood"], mats["thatch"], roof_overhang=0.15)


def build_barracks_graybox(scene: bpy.types.Scene) -> None:
    """Heisha (barracks) on a 4x3 lot: one nagaya longhouse, drill yard south.

    Canvas 256x192, anchor 128,160. Single story (walls 0.9, ridge 1.65).
    """
    mats = building_material_set()
    add_yard_pad(scene, 4.0, 3.0, mats["dirt"])
    add_gabled_house(
        scene, "Nagaya", (-3.6, -2.5), (-0.4, -1.4), 1.05, 1.65, "x",
        mats["dark_wood"], mats["roof"], plinth_material=mats["stone"], plinth_height=0.15,
    )


def build_samurai_residence_graybox(scene: bpy.types.Scene) -> None:
    """Buke-yashiki (samurai residence) on a 4x4 lot: walled compound with a
    main house and a south gate gap.

    Canvas 288x224, anchor 144,192. Main house ridge 1.85 units.
    """
    mats = building_material_set()
    add_yard_pad(scene, 4.0, 4.0, mats["gravel"])

    wall_height = 0.55
    t = 0.15
    # Perimeter wall with a centered gap on the south-east edge (map y=0 side).
    for name, low, high in (
        ("CompoundWallN", (-3.95, -4.0, 0.0), (-0.05, -4.0 + t, wall_height)),
        ("CompoundWallW", (-4.0, -3.95, 0.0), (-4.0 + t, -0.05, wall_height)),
        ("CompoundWallE", (-t, -3.95, 0.0), (0.0, -0.05, wall_height)),
        ("CompoundWallS1", (-3.95, -t, 0.0), (-2.35, 0.0, wall_height)),
        ("CompoundWallS2", (-1.65, -t, 0.0), (-0.05, 0.0, wall_height)),
    ):
        add_box(scene, name, *map_box(low, high), mats["plaster"])

    add_gabled_house(
        scene, "MainHouse", (-3.2, -3.3), (-1.2, -2.0), 1.13, 1.85, "x",
        mats["plaster"], mats["roof"], plinth_material=mats["stone"], plinth_height=0.18, roof_overhang=0.25,
    )
    # Small storehouse annex in the east corner of the yard.
    add_gabled_house(scene, "Annex", (-1.0, -2.6), (-0.3, -1.9), 0.75, 1.1, "y", mats["dark_wood"], mats["roof"], roof_overhang=0.1)


def build_town_block_graybox(scene: bpy.types.Scene) -> None:
    """Machi (town block) on a 6x6 lot: four machiya houses around a cross
    alley, one of them two-story.

    Canvas 416x304, anchor 208,272.
    """
    mats = building_material_set()
    add_yard_pad(scene, 6.0, 6.0, mats["dirt"])

    houses = (
        # name, low, high, wall_top, ridge_top, ridge_axis, wall_mat
        ("MachiyaNW", (-5.6, -5.5), (-3.4, -4.0), 1.9, 2.35, "x", "plaster"),
        ("MachiyaNE", (-2.6, -5.5), (-0.4, -4.1), 0.95, 1.6, "x", "wood"),
        ("MachiyaSW", (-5.6, -2.2), (-3.5, -0.7), 0.95, 1.5, "y", "dark_wood"),
        ("MachiyaSE", (-2.5, -2.3), (-0.4, -0.6), 0.95, 1.7, "y", "wood"),
    )
    for name, low, high, wall_top, ridge_top, axis, wall in houses:
        add_gabled_house(scene, name, low, high, wall_top, ridge_top, axis, mats[wall], mats["roof"], roof_overhang=0.18)


# Connected wall kit -------------------------------------------------------
#
# One parametric builder covers all 16 connection masks. Arms run from the
# tile center to the edge midpoint of each set direction, so socket
# continuity with neighbor tiles holds by construction: every arm is cut
# exactly at the tile edge and the neighbor's matching arm continues it.
# Mask bit order N,E,S,W matches simulation map-coordinate adjacency
# (y-1, x+1, y+1, x-1).

WALL_DIRECTIONS = {
    "N": (0.0, -1.0),
    "E": (1.0, 0.0),
    "S": (0.0, 1.0),
    "W": (-1.0, 0.0),
}

WALL_BASE_THICKNESS = 0.38
WALL_BASE_HEIGHT = 0.22
WALL_BODY_THICKNESS = 0.26
WALL_BODY_TOP = 0.95
WALL_COPING_THICKNESS = 0.36
WALL_COPING_TOP = 1.14
# Per-part inset multiplier that breaks coplanar faces where arms overlap
# near the tile center; far below one pixel (1px is about 0.022 units).
WALL_EPSILON = 0.0012


def wall_arm_box(direction: tuple[float, float], half_thickness: float, z0: float, z1: float) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    dx, dy = direction
    if dx != 0.0:
        x0, x1 = (0.0, 0.5) if dx > 0 else (-0.5, 0.0)
        return (x0, -half_thickness, z0), (x1, half_thickness, z1)
    y0, y1 = (0.0, 0.5) if dy > 0 else (-0.5, 0.0)
    return (-half_thickness, y0, z0), (half_thickness, y1, z1)


def build_wall_plaster_mask(scene: bpy.types.Scene, mask: str) -> None:
    plaster = make_material("WallPlaster", (0.80, 0.78, 0.72, 1.0))
    stone = make_material("WallStone", (0.40, 0.38, 0.34, 1.0))
    coping = make_material("WallCoping", (0.22, 0.24, 0.29, 1.0))

    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    active = [name for name, on in bits.items() if on]

    if not active:
        # Isolated pillar: square post with a pyramid cap.
        half = WALL_BASE_THICKNESS / 2.0
        add_box(scene, "PillarBase", *map_box((-half, -half, 0.0), (half, half, WALL_BASE_HEIGHT)), stone)
        body_half = WALL_BODY_THICKNESS / 2.0 + 0.03
        add_box(scene, "PillarBody", *map_box((-body_half, -body_half, WALL_BASE_HEIGHT), (body_half, body_half, WALL_BODY_TOP)), plaster)
        cap_half = WALL_COPING_THICKNESS / 2.0 + 0.02
        apex = ((0.0, 0.0, WALL_COPING_TOP))
        base_z = WALL_BODY_TOP
        add_mesh(
            scene,
            "PillarCap",
            [
                (-cap_half, -cap_half, base_z), (cap_half, -cap_half, base_z),
                (cap_half, cap_half, base_z), (-cap_half, cap_half, base_z),
                apex,
            ],
            [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)],
            coping,
        )
        return

    for index, name in enumerate(active):
        direction = WALL_DIRECTIONS[name]
        inset = WALL_EPSILON * (index + 1)

        base_low, base_high = wall_arm_box(direction, WALL_BASE_THICKNESS / 2.0 - inset, 0.0, WALL_BASE_HEIGHT)
        add_box(scene, f"WallBase{name}", *map_box(base_low, base_high), stone)

        body_low, body_high = wall_arm_box(direction, WALL_BODY_THICKNESS / 2.0 - inset, WALL_BASE_HEIGHT, WALL_BODY_TOP)
        add_box(scene, f"WallBody{name}", *map_box(body_low, body_high), plaster)

        half = WALL_COPING_THICKNESS / 2.0 - inset
        cop_low, cop_high = wall_arm_box(direction, half, 0.0, 0.0)
        low, high = map_box(cop_low, cop_high)
        ridge_axis = "x" if direction[0] != 0.0 else "y"
        add_gable_roof(
            scene,
            f"WallCoping{name}",
            (low[0], low[1]),
            (high[0], high[1]),
            WALL_BODY_TOP,
            WALL_COPING_TOP,
            ridge_axis,
            coping,
        )


def resolve_model(name: str):
    builder = MODEL_REGISTRY.get(name)
    if builder is not None:
        return builder
    prefix = "wall-plaster-connected-"
    if name.startswith(prefix):
        mask = name[len(prefix):]
        if len(mask) == 4 and set(mask) <= {"0", "1"}:
            return lambda scene: build_wall_plaster_mask(scene, mask)
    return None


MODEL_REGISTRY = {
    "calibration-tile": build_calibration_tile,
    "calibration-cube": build_calibration_cube,
    "calibration-grid": build_calibration_grid,
    "calibration-chirality": build_calibration_chirality,
    "terrain-grass-base": build_terrain_grass,
    "building-storehouse-graybox": build_storehouse_graybox,
    "building-market-graybox": build_market_graybox,
    "building-barracks-graybox": build_barracks_graybox,
    "building-samurai-residence-graybox": build_samurai_residence_graybox,
    "building-town-block-graybox": build_town_block_graybox,
}


def main() -> None:
    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1 :]
    else:
        argv = []
    args = parse_args(argv)

    canvas_w, canvas_h = parse_pair(args.canvas, "x")
    anchor_x, anchor_y = parse_pair(args.anchor, ",")

    builder = resolve_model(args.model)
    if builder is None:
        raise SystemExit(f"unknown model: {args.model}; known: {sorted(MODEL_REGISTRY)} plus wall-plaster-connected-<NESW mask>")

    scene = reset_scene()
    builder(scene)
    setup_camera(scene, canvas_w, canvas_h, anchor_x, anchor_y)

    output_name = args.output_name or args.model
    output_path = os.path.abspath(os.path.join(args.output_directory, f"{output_name}.png"))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    setup_render(
        scene,
        int(canvas_w),
        int(canvas_h),
        args.render_spec,
        args.transparent_background.lower() == "true",
        args.render_seed,
        output_path,
    )

    bpy.ops.render.render(write_still=True)

    report = {
        "model": args.model,
        "output": output_path,
        "canvas": [int(canvas_w), int(canvas_h)],
        "anchor": [anchor_x, anchor_y],
        "renderSpec": args.render_spec,
        "pxPerUnit": PX_PER_UNIT,
        "blenderVersion": bpy.app.version_string,
    }
    if args.report_json:
        os.makedirs(os.path.dirname(os.path.abspath(args.report_json)), exist_ok=True)
        with open(args.report_json, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
    print(f"RENDERED {json.dumps(report)}")


main()
