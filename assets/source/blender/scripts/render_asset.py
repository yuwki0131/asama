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
import re
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
    sun_data.energy = 4.8
    sun_data.angle = 0.06
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)

    # Ambient fill keeps shaded faces readable; slightly cool to contrast
    # the warm sun without pushing saturation (art direction: low chroma).
    # Kept moderate so dark materials (roof tiles, water) stay dark.
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = (0.62, 0.66, 0.72, 1.0)
        background.inputs["Strength"].default_value = 0.55
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


# Terrain kit ----------------------------------------------------------------
#
# Simulation gives every terrain cell `terrain.<type>.connected.<NESW mask>`
# where a bit is 1 when the neighbor is the SAME terrain. Each 0 bit gets a
# thin border treatment along that tile edge (shoreline for water, soil rim
# for the ground types). Tiles must stay flat: a 64x32 canvas has no headroom
# above the diamond, so borders are color strips, not relief.

TERRAIN_EDGE_WIDTH = 0.14


def make_noise_material(name: str, dark: tuple[float, float, float], light: tuple[float, float, float], scale: float = 6.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*light, 1.0)

    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return material


TERRAIN_STYLES = {
    "grass": {
        "surface": lambda: make_noise_material("GrassSurface", (0.208, 0.294, 0.157), (0.322, 0.412, 0.204)),
        "variant": lambda: make_noise_material("GrassVariant", (0.190, 0.270, 0.145), (0.300, 0.380, 0.190), scale=10.0),
        "edge": (0.34, 0.29, 0.21),
    },
    "dirt": {
        "surface": lambda: make_noise_material("DirtSurface", (0.36, 0.30, 0.22), (0.48, 0.41, 0.30)),
        "variant": lambda: make_noise_material("DirtVariant", (0.33, 0.27, 0.20), (0.45, 0.38, 0.28), scale=10.0),
        "edge": (0.29, 0.24, 0.18),
    },
    "stone": {
        "surface": lambda: make_noise_material("StoneSurface", (0.36, 0.37, 0.38), (0.52, 0.53, 0.54), scale=8.0),
        "variant": lambda: make_noise_material("StoneVariant", (0.34, 0.35, 0.36), (0.50, 0.51, 0.52), scale=12.0),
        "edge": (0.26, 0.27, 0.29),
    },
    "water": {
        "surface": lambda: make_noise_material("WaterSurface", (0.075, 0.145, 0.185), (0.115, 0.195, 0.235), scale=4.0),
        "variant": lambda: make_noise_material("WaterVariant", (0.070, 0.140, 0.180), (0.110, 0.190, 0.230), scale=7.0),
        "edge": (0.50, 0.45, 0.34),
    },
}

# Tile edge quads in map coordinates. Edge order matches the NESW mask; N is
# the edge toward map y-1.
TERRAIN_EDGE_QUADS = {
    "N": ((-0.5, -0.5), (0.5, -0.5 + TERRAIN_EDGE_WIDTH)),
    "E": ((0.5 - TERRAIN_EDGE_WIDTH, -0.5), (0.5, 0.5)),
    "S": ((-0.5, 0.5 - TERRAIN_EDGE_WIDTH), (0.5, 0.5)),
    "W": ((-0.5, -0.5), (-0.5 + TERRAIN_EDGE_WIDTH, 0.5)),
}


def add_flat_quad(scene: bpy.types.Scene, name: str, low_map: tuple[float, float], high_map: tuple[float, float], z: float, material: bpy.types.Material) -> None:
    x0, y0 = low_map
    x1, y1 = high_map
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    add_mesh(scene, name, [(*map_xy(x, y), z) for x, y in corners], [(0, 1, 2, 3)], material)


# Same-terrain edges bleed slightly past the tile boundary so antialiased
# edge pixels overlap the neighbor tile instead of leaving a dark seam line.
TERRAIN_BLEED = 0.03


def build_terrain_mask(scene: bpy.types.Scene, terrain: str, mask: str) -> None:
    style = TERRAIN_STYLES[terrain]
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    y0 = -0.5 - (TERRAIN_BLEED if same["N"] else 0.0)
    x1 = 0.5 + (TERRAIN_BLEED if same["E"] else 0.0)
    y1 = 0.5 + (TERRAIN_BLEED if same["S"] else 0.0)
    x0 = -0.5 - (TERRAIN_BLEED if same["W"] else 0.0)
    add_flat_quad(scene, "Surface", (x0, y0), (x1, y1), 0.0, style["surface"]())
    edge_material = make_material("TerrainEdge", (*style["edge"], 1.0))
    for index, name in enumerate(("N", "E", "S", "W")):
        if same[name]:
            continue
        low, high = TERRAIN_EDGE_QUADS[name]
        add_flat_quad(scene, f"Edge{name}", low, high, 0.002 + 0.0005 * index, edge_material)


def build_terrain_base(scene: bpy.types.Scene, terrain: str, variant: bool = False) -> None:
    style = TERRAIN_STYLES[terrain]
    add_flat_quad(scene, "Surface", (-0.5, -0.5), (0.5, 0.5), 0.0, style["variant" if variant else "surface"]())


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
    mats = building_material_set()
    plaster, stone, roof, wood, gravel = mats["plaster"], mats["stone"], mats["roof"], mats["dark_wood"], mats["gravel"]

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


def make_textured_material(
    name: str,
    dark: tuple[float, float, float],
    light: tuple[float, float, float],
    scale: float | tuple[float, float, float] = 8.0,
    detail: float = 3.0,
    dark_stop: float = 0.35,
    light_stop: float = 0.75,
) -> bpy.types.Material:
    """Noise-driven two-tone material. A non-uniform scale stretches the
    noise into a grain (wood) or banding (roof tiles) direction."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0

    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    if isinstance(scale, tuple):
        mapping.inputs["Scale"].default_value = scale
        noise_scale = 1.0
    else:
        noise_scale = scale
        mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = detail
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = dark_stop
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = light_stop
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return material


def make_ishigaki_material(name: str = "IshigakiStone") -> bpy.types.Material:
    """Fitted-stone masonry: voronoi cells with dark mortar seams."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0

    voronoi = nodes.new("ShaderNodeTexVoronoi")
    voronoi.feature = "DISTANCE_TO_EDGE"
    voronoi.inputs["Scale"].default_value = 5.5

    seam_ramp = nodes.new("ShaderNodeValToRGB")
    seam_ramp.color_ramp.elements[0].position = 0.0
    seam_ramp.color_ramp.elements[0].color = (0.22, 0.20, 0.17, 1.0)
    seam_ramp.color_ramp.elements[1].position = 0.10
    seam_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(voronoi.outputs["Distance"], seam_ramp.inputs["Fac"])

    stone_noise = nodes.new("ShaderNodeTexNoise")
    stone_noise.inputs["Scale"].default_value = 4.0
    stone_ramp = nodes.new("ShaderNodeValToRGB")
    stone_ramp.color_ramp.elements[0].position = 0.3
    stone_ramp.color_ramp.elements[0].color = (0.40, 0.37, 0.32, 1.0)
    stone_ramp.color_ramp.elements[1].position = 0.8
    stone_ramp.color_ramp.elements[1].color = (0.56, 0.52, 0.45, 1.0)
    links.new(stone_noise.outputs["Fac"], stone_ramp.inputs["Fac"])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(stone_ramp.outputs["Color"], mix.inputs["A"])
    links.new(seam_ramp.outputs["Color"], mix.inputs["B"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    return material


def make_roof_material(name: str = "RoofTiles") -> bpy.types.Material:
    """Kawara roof: dark blue-gray with subtle course banding."""
    return make_textured_material(
        name,
        (0.055, 0.065, 0.09),
        (0.13, 0.15, 0.19),
        scale=(2.0, 2.0, 26.0),
        detail=1.5,
        dark_stop=0.42,
        light_stop=0.62,
    )


def building_material_set() -> dict[str, bpy.types.Material]:
    return {
        "plaster": make_textured_material("Plaster", (0.74, 0.71, 0.64), (0.83, 0.81, 0.75), scale=5.0),
        "wood": make_textured_material("Wood", (0.35, 0.26, 0.17), (0.48, 0.38, 0.26), scale=(18.0, 18.0, 2.5)),
        "dark_wood": make_textured_material("DarkWood", (0.24, 0.18, 0.12), (0.36, 0.28, 0.19), scale=(18.0, 18.0, 2.5)),
        "stone": make_ishigaki_material("StoneBase"),
        "roof": make_roof_material("RoofTile"),
        "thatch": make_textured_material("Thatch", (0.38, 0.31, 0.18), (0.52, 0.44, 0.27), scale=(3.0, 3.0, 22.0)),
        "gravel": make_textured_material("YardGravel", (0.46, 0.42, 0.35), (0.58, 0.54, 0.46), scale=14.0),
        "dirt": make_textured_material("YardDirt", (0.38, 0.32, 0.24), (0.50, 0.43, 0.33), scale=9.0),
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
    mats = building_material_set()
    plaster, stone, coping = mats["plaster"], mats["stone"], mats["roof"]

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


def add_frustum(scene: bpy.types.Scene, name: str, low_map: tuple[float, float], high_map: tuple[float, float], z0: float, z1: float, top_inset: float, material: bpy.types.Material) -> None:
    """Tapered box (ishigaki-style base): bottom rectangle, inset top."""
    x0, y0 = low_map
    x1, y1 = high_map
    i = top_inset
    bottom = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    top = [(x0 + i, y0 + i), (x1 - i, y0 + i), (x1 - i, y1 - i), (x0 + i, y1 - i)]
    vertices = [(*map_xy(x, y), z0) for x, y in bottom] + [(*map_xy(x, y), z1) for x, y in top]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    add_mesh(scene, name, vertices, faces, material)


def build_yagura_small_graybox(scene: bpy.types.Scene) -> None:
    """Small watchtower on a 2x2 footprint (monumental: fills the lot).

    South corner at origin, lot map [-2..0]x[-2..0]. Canvas 160x200,
    anchor 80,168. Tapered stone base + plastered story + watch story with a
    gabled roof; ridge 3.15 units (~43% of the tenshu height).
    """
    mats = building_material_set()
    plaster, stone, roof, wood = mats["plaster"], mats["stone"], mats["roof"], mats["dark_wood"]

    add_frustum(scene, "Base", (-2.0, -2.0), (0.0, 0.0), 0.0, 0.95, 0.28, stone)
    add_box(scene, "Story1", *map_box((-1.72, -1.72, 0.95), (-0.28, -0.28, 1.85)), plaster)
    # Skirt roof between stories.
    add_box(scene, "Skirt", *map_box((-1.88, -1.88, 1.82), (-0.12, -0.12, 1.92)), roof)
    add_box(scene, "Story2", *map_box((-1.45, -1.45, 1.92), (-0.55, -0.55, 2.72)), plaster)
    # Open watch band under the top roof.
    add_box(scene, "WatchBand", *map_box((-1.48, -1.48, 2.52), (-0.52, -0.52, 2.72)), wood)
    low, high = map_box((-1.65, -1.65, 0.0), (-0.35, -0.35, 0.0))
    add_gable_roof(scene, "TopRoof", (low[0], low[1]), (high[0], high[1]), 2.72, 3.15, "x", roof)


def build_farm_paddy(scene: bpy.types.Scene) -> None:
    """Rice paddy filling a 4x4 surface footprint, centered at origin.

    Canvas 256x128, anchor 128,64. Border and cross ridges (aze) around
    four water paddies; surface class, flat relief only.
    """
    ridge = make_material("AzeDirt", (0.42, 0.36, 0.27, 1.0))
    water = make_material("PaddyWater", (0.20, 0.30, 0.29, 1.0))

    add_box(scene, "FieldBase", *map_box((-2.0, -2.0, 0.0), (2.0, 2.0, 0.02)), ridge)
    add_box(scene, "Water", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.045)), water)
    half_ridge = 0.07
    # Staggered ridge heights break coplanar faces where ridges cross.
    for index, (name, low, high) in enumerate((
        ("AzeN", (-2.0, -2.0), (2.0, -2.0 + 2 * half_ridge)),
        ("AzeS", (-2.0, 2.0 - 2 * half_ridge), (2.0, 2.0)),
        ("AzeW", (-2.0, -2.0), (-2.0 + 2 * half_ridge, 2.0)),
        ("AzeE", (2.0 - 2 * half_ridge, -2.0), (2.0, 2.0)),
        ("AzeMidX", (-half_ridge, -2.0), (half_ridge, 2.0)),
        ("AzeMidY", (-2.0, -half_ridge), (2.0, half_ridge)),
    )):
        top = 0.078 - 0.0028 * index
        add_box(scene, name, *map_box((low[0], low[1], 0.0), (high[0], high[1], top)), ridge)


# Gate kit -------------------------------------------------------------------
#
# Kabukimon-style gates spanning 1-3 tiles. nw_se gates run along map x
# (footprint width x 1), ne_sw gates along map y (1 x width). Origin is the
# FOOTPRINT CENTER: the runtime treats gates as center-anchored buildings
# (GameCanvas isCenterAnchoredBuilding), so the anchor pixel is placed on the
# center of the footprint. The connection mask marks which ends adjoin walls
# (nw_se: E/W bits, ne_sw: N/S bits); connected ends grow a wall stub that
# meets the wall-kit socket at the end tile's edge midpoint.

GATE_PILLAR_SIZE = 0.30
GATE_PILLAR_HEIGHT = 1.35
GATE_DOOR_HEIGHT = 1.05
GATE_DOOR_THICKNESS = 0.10
GATE_BEAM_BOTTOM = 1.08
GATE_BEAM_TOP = 1.30
GATE_ROOF_TOP = 1.72


def gate_axis_point(axis: str, along: float, across: float) -> tuple[float, float]:
    """Map coordinates for a point at `along` on the gate axis, `across`
    offset from the centerline. Footprint center is the origin, so `along`
    runs from -length/2 to +length/2 and `across` from -0.5 to +0.5."""
    if axis == "nw_se":
        return (along, across)
    return (across, along)


def gate_box(axis: str, along0: float, along1: float, across_half: float, z0: float, z1: float) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    x0, y0 = gate_axis_point(axis, along0, -across_half)
    x1, y1 = gate_axis_point(axis, along1, across_half)
    return (min(x0, x1), min(y0, y1), z0), (max(x0, x1), max(y0, y1), z1)


def build_gate_wood(scene: bpy.types.Scene, axis: str, width: int, mask: str) -> None:
    mats = building_material_set()
    wood, door, roof, plaster, stone = mats["dark_wood"], mats["wood"], mats["roof"], mats["plaster"], mats["stone"]

    half = float(width) / 2.0
    # Stone threshold sill covering the full footprint; grounds the sprite
    # on its logical lot.
    if axis == "nw_se":
        add_box(scene, "Sill", *map_box((-half, -0.5, 0.0), (half, 0.5, 0.035)), stone)
    else:
        add_box(scene, "Sill", *map_box((-0.5, -half, 0.0), (0.5, half, 0.035)), stone)

    # Flanking pillars just inside each end of the footprint.
    for label, along in (("Near", half - 0.22), ("Far", -half + 0.22)):
        low, high = gate_box(axis, along - GATE_PILLAR_SIZE / 2.0, along + GATE_PILLAR_SIZE / 2.0, GATE_PILLAR_SIZE / 2.0, 0.0, GATE_PILLAR_HEIGHT)
        add_box(scene, f"Pillar{label}", *map_box(low, high), wood)

    # Closed double doors between the pillars.
    low, high = gate_box(axis, -half + 0.38, half - 0.38, GATE_DOOR_THICKNESS / 2.0, 0.0, GATE_DOOR_HEIGHT)
    add_box(scene, "Doors", *map_box(low, high), door)
    # Kabuki lintel beam across the top.
    low, high = gate_box(axis, -half + 0.06, half - 0.06, 0.17, GATE_BEAM_BOTTOM, GATE_BEAM_TOP)
    add_box(scene, "Beam", *map_box(low, high), wood)

    # Gabled roof over the full span, ridge along the gate axis.
    roof_low, roof_high = gate_box(axis, -half - 0.12, half + 0.12, 0.42, 0.0, 0.0)
    low, high = map_box(roof_low, roof_high)
    ridge_axis = "x" if axis == "nw_se" else "y"
    add_gable_roof(scene, "GateRoof", (low[0], low[1]), (high[0], high[1]), GATE_BEAM_TOP, GATE_ROOF_TOP, ridge_axis, roof)

    # Wall stubs on connected ends, matching the wall-kit profile so the
    # socket at the end tile edge midpoint lines up with neighbor walls.
    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    end_direction = {"nw_se": (("E", half - 0.30, half), ("W", -half, -half + 0.30)), "ne_sw": (("S", half - 0.30, half), ("N", -half, -half + 0.30))}
    for name, along0, along1 in end_direction[axis]:
        if not bits.get(name, False):
            continue
        low, high = gate_box(axis, along0, along1, WALL_BASE_THICKNESS / 2.0, 0.0, WALL_BASE_HEIGHT)
        add_box(scene, f"Stub{name}Base", *map_box(low, high), stone)
        low, high = gate_box(axis, along0, along1, WALL_BODY_THICKNESS / 2.0, WALL_BASE_HEIGHT, WALL_BODY_TOP)
        add_box(scene, f"Stub{name}Body", *map_box(low, high), plaster)
        low, high = gate_box(axis, along0, along1, WALL_COPING_THICKNESS / 2.0, 0.0, 0.0)
        wlow, whigh = map_box(low, high)
        add_gable_roof(scene, f"Stub{name}Coping", (wlow[0], wlow[1]), (whigh[0], whigh[1]), WALL_BODY_TOP, WALL_COPING_TOP, ridge_axis, roof)


# Connected surface kits (road, moats) ---------------------------------------
#
# Flat surface families with the same socket contract: arms run from tile
# center to edge midpoints. Canvas 64x32, anchor (32,16), footprint center at
# origin. Moat depth is faked with color and shallow bank relief: real
# negative-z digging would project outside the 64x32 diamond.


def build_surface_arm_kit(
    scene: bpy.types.Scene,
    mask: str,
    floor_material: bpy.types.Material,
    floor_top: float,
    arm_half: float,
    bank_material: bpy.types.Material | None = None,
    bank_top: float = 0.04,
) -> None:
    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    active = [name for name, on in bits.items() if on]

    pad_half = arm_half + 0.02
    add_box(scene, "CenterPad", *map_box((-pad_half, -pad_half, 0.0), (pad_half, pad_half, floor_top)), floor_material)
    for index, name in enumerate(active):
        direction = WALL_DIRECTIONS[name]
        inset = WALL_EPSILON * (index + 1)
        low, high = wall_arm_box(direction, arm_half - inset, 0.0, floor_top - inset)
        add_box(scene, f"Floor{name}", *map_box(low, high), floor_material)
        if bank_material is not None:
            for side in (-1.0, 1.0):
                offset = side * (arm_half + 0.045)
                blow, bhigh = wall_arm_box(direction, 0.045, 0.0, bank_top - inset)
                dx, dy = direction
                if dx != 0.0:
                    blow = (blow[0], blow[1] + offset, blow[2])
                    bhigh = (bhigh[0], bhigh[1] + offset, bhigh[2])
                else:
                    blow = (blow[0] + offset, blow[1], blow[2])
                    bhigh = (bhigh[0] + offset, bhigh[1], bhigh[2])
                add_box(scene, f"Bank{name}{side}", *map_box(blow, bhigh), bank_material)


def build_road_mask(scene: bpy.types.Scene, mask: str) -> None:
    dirt = make_material("RoadDirt", (0.54, 0.47, 0.36, 1.0))
    build_surface_arm_kit(scene, mask, dirt, 0.014, 0.27)


def build_dry_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    floor = make_material("MoatFloor", (0.30, 0.25, 0.19, 1.0))
    bank = make_material("MoatBank", (0.48, 0.42, 0.32, 1.0))
    build_surface_arm_kit(scene, mask, floor, 0.010, 0.33, bank_material=bank)


def build_water_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    water = make_material("MoatWater", (0.09, 0.17, 0.21, 1.0))
    bank = make_material("MoatBank", (0.48, 0.42, 0.32, 1.0))
    build_surface_arm_kit(scene, mask, water, 0.010, 0.33, bank_material=bank)


def build_earth_bridge(scene: bpy.types.Scene) -> None:
    """Earthen causeway crossing along map x. Canvas 64x32, anchor 32,16."""
    dirt = make_material("CausewayDirt", (0.50, 0.43, 0.32, 1.0))
    add_box(scene, "Causeway", *map_box((-0.5, -0.30, 0.0), (0.5, 0.30, 0.07)), dirt)


def build_wood_bridge(scene: bpy.types.Scene) -> None:
    """Plank bridge crossing along map x with side rails."""
    plank = make_material("BridgePlank", (0.47, 0.36, 0.24, 1.0))
    rail = make_material("BridgeRail", (0.34, 0.26, 0.17, 1.0))
    add_box(scene, "Deck", *map_box((-0.5, -0.28, 0.05), (0.5, 0.28, 0.10)), plank)
    for side in (-1.0, 1.0):
        y = side * 0.30
        add_box(scene, f"Rail{side}", *map_box((-0.5, y - 0.03, 0.10), (0.5, y + 0.03, 0.32)), rail)
        for px in (-0.42, 0.0, 0.42):
            add_box(scene, f"RailPost{side}{px}", *map_box((px - 0.035, y - 0.035, 0.0), (px + 0.035, y + 0.035, 0.34)), rail)


# Connected fence kit -------------------------------------------------------
#
# Wooden palisade fence, same socket contract as the wall kit: arms run from
# tile center to edge midpoints of set mask directions. Canvas 64x64,
# anchor (32,48).

FENCE_HEIGHT = 0.72
FENCE_POST_SIZE = 0.10
FENCE_RAIL_THICKNESS = 0.055
FENCE_RAIL_LEVELS = ((0.26, 0.36), (0.52, 0.62))


def fence_post(scene: bpy.types.Scene, name: str, map_x: float, map_y: float, material: bpy.types.Material, height: float = FENCE_HEIGHT) -> None:
    half = FENCE_POST_SIZE / 2.0
    add_box(scene, name, *map_box((map_x - half, map_y - half, 0.0), (map_x + half, map_y + half, height)), material)


def build_fence_wood_mask(scene: bpy.types.Scene, mask: str) -> None:
    mats = building_material_set()
    wood, dark = mats["wood"], mats["dark_wood"]

    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    active = [name for name, on in bits.items() if on]

    # Center post always present.
    fence_post(scene, "PostCenter", 0.0, 0.0, dark, FENCE_HEIGHT + 0.05)
    if not active:
        return

    for index, name in enumerate(active):
        dx, dy = WALL_DIRECTIONS[name]
        inset = WALL_EPSILON * (index + 1)
        # Two intermediate posts along the arm.
        for distance, label in ((0.24, "A"), (0.48, "B")):
            fence_post(scene, f"Post{name}{label}", dx * distance, dy * distance, dark)
        # Two rail levels spanning center to tile edge.
        for level, (z0, z1) in enumerate(FENCE_RAIL_LEVELS):
            half = FENCE_RAIL_THICKNESS / 2.0 - inset
            low, high = wall_arm_box((dx, dy), half, z0, z1)
            add_box(scene, f"Rail{name}{level}", *map_box(low, high), wood)


def resolve_model(name: str):
    builder = MODEL_REGISTRY.get(name)
    if builder is not None:
        return builder
    for prefix, kit in (
        ("wall-plaster-connected-", build_wall_plaster_mask),
        ("fence-wood-connected-", build_fence_wood_mask),
        ("road-connected-", build_road_mask),
        ("dry-moat-connected-", build_dry_moat_mask),
        ("water-moat-connected-", build_water_moat_mask),
    ):
        if name.startswith(prefix):
            mask = name[len(prefix):]
            if len(mask) == 4 and set(mask) <= {"0", "1"}:
                return lambda scene, kit=kit, mask=mask: kit(scene, mask)
    gate = re.fullmatch(r"gate-wood-closed-(nw_se|ne_sw)-w([123])-([01]{4})", name)
    if gate is not None:
        axis, width, mask = gate.group(1), int(gate.group(2)), gate.group(3)
        return lambda scene: build_gate_wood(scene, axis, width, mask)
    terrain = re.fullmatch(r"terrain-(grass|dirt|stone|water)-connected-([01]{4})", name)
    if terrain is not None:
        kind, mask = terrain.group(1), terrain.group(2)
        return lambda scene: build_terrain_mask(scene, kind, mask)
    flat = re.fullmatch(r"terrain-(grass|dirt|stone|water)-(base|variant)", name)
    if flat is not None:
        kind, variant = flat.group(1), flat.group(2) == "variant"
        return lambda scene: build_terrain_base(scene, kind, variant)
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
    "building-yagura-small-graybox": build_yagura_small_graybox,
    "building-farm-paddy": build_farm_paddy,
    "building-earth-bridge": build_earth_bridge,
    "building-wood-bridge": build_wood_bridge,
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
