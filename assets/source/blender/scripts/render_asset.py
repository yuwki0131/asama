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

# Rendering style, set from --render-spec before models are built.
#   "pbr"       -> Principled BSDF under the fixed sun (current look)
#   "toon"      -> emission cel bands from the fixed light direction + outlines
#   "painterly" -> emission with a soft painterly ramp, no outlines
CURRENT_STYLE = "pbr"

# Fixed light direction shared by the sun and the stylized shading, so all
# three styles agree on where the light comes from.
LIGHT_DIRECTION = Vector((1.0, -0.2, -1.4)).normalized()


def finish_material(material: bpy.types.Material, color_output) -> None:
    """Route a computed base-color socket into the style's shading model.

    PBR keeps the Principled BSDF. The stylized modes replace it with an
    emission shader whose brightness is a function of dot(N, L) against the
    fixed light: hard bands for toon, a smooth ramp for painterly. Emission
    makes the shading fully deterministic and independent of scene lights.
    """
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    if CURRENT_STYLE == "pbr":
        if bsdf is not None:
            links.new(color_output, bsdf.inputs["Base Color"])
        return

    geometry = nodes.new("ShaderNodeNewGeometry")
    to_light = nodes.new("ShaderNodeVectorMath")
    to_light.operation = "DOT_PRODUCT"
    to_light.inputs[1].default_value = tuple(-LIGHT_DIRECTION)
    links.new(geometry.outputs["Normal"], to_light.inputs[0])

    ramp = nodes.new("ShaderNodeValToRGB")
    if CURRENT_STYLE == "toon":
        ramp.color_ramp.interpolation = "CONSTANT"
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0.42, 0.40, 0.50, 1.0)
        ramp.color_ramp.elements[1].position = 0.25
        ramp.color_ramp.elements[1].color = (0.74, 0.72, 0.76, 1.0)
        lit = ramp.color_ramp.elements.new(0.58)
        lit.color = (1.12, 1.09, 1.02, 1.0)
    else:  # painterly
        ramp.color_ramp.interpolation = "EASE"
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0.38, 0.38, 0.52, 1.0)
        ramp.color_ramp.elements[1].position = 0.72
        ramp.color_ramp.elements[1].color = (0.98, 0.94, 0.86, 1.0)
    links.new(to_light.outputs["Value"], ramp.inputs["Fac"])

    shade = nodes.new("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    shade.inputs["Factor"].default_value = 1.0
    links.new(color_output, shade.inputs["A"])
    links.new(ramp.outputs["Color"], shade.inputs["B"])

    # Ambient occlusion gives the deep eave and contact shadows that the
    # emission shading would otherwise lose entirely.
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.7
    soften = nodes.new("ShaderNodeMath")
    soften.operation = "MULTIPLY_ADD"
    soften.inputs[1].default_value = 0.68
    soften.inputs[2].default_value = 0.32
    links.new(ao.outputs["AO"], soften.inputs[0])
    ao_color = nodes.new("ShaderNodeCombineColor")
    links.new(soften.outputs["Value"], ao_color.inputs["Red"])
    links.new(soften.outputs["Value"], ao_color.inputs["Green"])
    links.new(soften.outputs["Value"], ao_color.inputs["Blue"])
    shaded = nodes.new("ShaderNodeMix")
    shaded.data_type = "RGBA"
    shaded.blend_type = "MULTIPLY"
    shaded.inputs["Factor"].default_value = 1.0
    links.new(shade.outputs["Result"], shaded.inputs["A"])
    links.new(ao_color.outputs["Color"], shaded.inputs["B"])

    emission = nodes.new("ShaderNodeEmission")
    links.new(shaded.outputs["Result"], emission.inputs["Color"])

    output = nodes.get("Material Output")
    if output is None:
        output = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs["Emission"], output.inputs["Surface"])


def make_flat_color_node(material: bpy.types.Material, rgba: tuple[float, float, float, float]):
    """RGB constant node usable as a color socket for finish_material."""
    node = material.node_tree.nodes.new("ShaderNodeRGB")
    node.outputs[0].default_value = rgba
    return node.outputs[0]


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
    parser.add_argument("--supersample", type=int, default=1, help="render at N x resolution (caller downsamples)")
    return parser.parse_args(argv)


def parse_pair(text: str, separator: str) -> tuple[float, float]:
    left, right = text.split(separator, 1)
    return float(left), float(right)


def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_camera(scene: bpy.types.Scene, canvas_w: float, canvas_h: float, anchor_x: float, anchor_y: float, px_per_unit: float = PX_PER_UNIT) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("IsoCamera")
    camera_data.type = "ORTHO"
    camera_data.sensor_fit = "HORIZONTAL"
    camera_data.ortho_scale = canvas_w / px_per_unit
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
        right * (-dx_px / px_per_unit)
        + up * (dy_px / px_per_unit)
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
    elif spec_name in ("cycles-cpu", "toon-cel", "painterly"):
        render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        # The stylized modes shade via emission and ignore lights, so fewer
        # samples suffice there.
        scene.cycles.samples = 64 if spec_name == "cycles-cpu" else 32
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
        bsdf.inputs["Roughness"].default_value = 1.0
    if CURRENT_STYLE != "pbr":
        finish_material(material, make_flat_color_node(material, rgba))
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


ROOF_CURVE_SEGMENTS = 4
ROOF_CURVE_EXPONENT = 1.55


def add_gable_roof(scene: bpy.types.Scene, name: str, low: tuple[float, float], high: tuple[float, float], base_z: float, ridge_z: float, ridge_axis: str, material: bpy.types.Material, end_material: bpy.types.Material | None = None) -> bpy.types.Object:
    """Gabled roof with a concave Japanese sori curve: shallow at the eaves,
    steepening toward the ridge. Ridge runs along ridge_axis ('x' or 'y')."""
    x0, y0 = low
    x1, y1 = high

    def profile(t: float) -> float:
        return base_z + (ridge_z - base_z) * (t ** ROOF_CURVE_EXPONENT)

    steps = [i / ROOF_CURVE_SEGMENTS for i in range(ROOF_CURVE_SEGMENTS + 1)]

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    def row(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[int, int]:
        index = len(vertices)
        vertices.append(a)
        vertices.append(b)
        return index, index + 1

    if ridge_axis == "x":
        mid = (y0 + y1) / 2.0
        south = [row((x0, y1 + (mid - y1) * t, profile(t)), (x1, y1 + (mid - y1) * t, profile(t))) for t in steps]
        north = [row((x0, y0 + (mid - y0) * t, profile(t)), (x1, y0 + (mid - y0) * t, profile(t))) for t in steps]
    else:
        mid = (x0 + x1) / 2.0
        south = [row((x1 + (mid - x1) * t, y0, profile(t)), (x1 + (mid - x1) * t, y1, profile(t))) for t in steps]
        north = [row((x0 + (mid - x0) * t, y0, profile(t)), (x0 + (mid - x0) * t, y1, profile(t))) for t in steps]

    for slope in (south, north):
        for (a0, b0), (a1, b1) in zip(slope, slope[1:]):
            faces.append((a0, b0, b1, a1))

    # Gable end caps: the curved profile down one slope and up the other.
    end_face_start = len(faces)
    for end in (0, 1):
        loop = [south[i][end] for i in range(len(south))] + [north[i][end] for i in range(len(north) - 2, -1, -1)]
        faces.append(tuple(loop))

    obj = add_mesh(scene, name, vertices, faces, material)
    if end_material is not None:
        # Real kura roofs plaster the gable verge white; assign the second
        # material to the two end-cap polygons.
        obj.data.materials.append(end_material)
        for index in range(end_face_start, len(faces)):
            obj.data.polygons[index].material_index = 1
    return obj


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
    if CURRENT_STYLE == "pbr":
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, ramp.outputs["Color"])
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
    if CURRENT_STYLE == "pbr":
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, ramp.outputs["Color"])
    return material


TERRAIN_STYLES = {
    "grass": {
        "surface": lambda: make_noise_material("GrassSurface", (0.205, 0.275, 0.120), (0.320, 0.395, 0.180)),
        "variant": lambda: make_noise_material("GrassVariant", (0.190, 0.255, 0.112), (0.300, 0.370, 0.170), scale=10.0),
        "edge": (0.34, 0.29, 0.21),
    },
    "dirt": {
        "surface": lambda: make_noise_material("DirtSurface", (0.235, 0.205, 0.150), (0.315, 0.275, 0.205)),
        "variant": lambda: make_noise_material("DirtVariant", (0.215, 0.190, 0.140), (0.295, 0.260, 0.195), scale=10.0),
        "edge": (0.185, 0.160, 0.120),
    },
    "stone": {
        "surface": lambda: make_noise_material("StoneSurface", (0.36, 0.37, 0.38), (0.52, 0.53, 0.54), scale=8.0),
        "variant": lambda: make_noise_material("StoneVariant", (0.34, 0.35, 0.36), (0.50, 0.51, 0.52), scale=12.0),
        "edge": (0.26, 0.27, 0.29),
    },
    "water": {
        "surface": lambda: make_noise_material("WaterSurface", (0.050, 0.100, 0.130), (0.085, 0.145, 0.180), scale=4.0),
        "variant": lambda: make_noise_material("WaterVariant", (0.047, 0.096, 0.126), (0.080, 0.140, 0.175), scale=7.0),
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
    wet_material = make_material("TerrainWet", (0.030, 0.062, 0.080, 1.0)) if terrain == "water" else None
    for index, name in enumerate(("N", "E", "S", "W")):
        if same[name]:
            continue
        low, high = TERRAIN_EDGE_QUADS[name]
        if wet_material is not None:
            # Shoreline: outer half is dry sand, inner half is the wet band.
            (ox0, oy0), (ox1, oy1) = low, high
            half = TERRAIN_EDGE_WIDTH / 2.0
            if name == "N":
                add_flat_quad(scene, f"Edge{name}", (ox0, oy0), (ox1, oy0 + half), 0.002 + 0.0005 * index, edge_material)
                add_flat_quad(scene, f"Wet{name}", (ox0, oy0 + half), (ox1, oy1), 0.002 + 0.0005 * index, wet_material)
            elif name == "S":
                add_flat_quad(scene, f"Edge{name}", (ox0, oy1 - half), (ox1, oy1), 0.002 + 0.0005 * index, edge_material)
                add_flat_quad(scene, f"Wet{name}", (ox0, oy0), (ox1, oy1 - half), 0.002 + 0.0005 * index, wet_material)
            elif name == "W":
                add_flat_quad(scene, f"Edge{name}", (ox0, oy0), (ox0 + half, oy1), 0.002 + 0.0005 * index, edge_material)
                add_flat_quad(scene, f"Wet{name}", (ox0 + half, oy0), (ox1, oy1), 0.002 + 0.0005 * index, wet_material)
            else:
                add_flat_quad(scene, f"Edge{name}", (ox1 - half, oy0), (ox1, oy1), 0.002 + 0.0005 * index, edge_material)
                add_flat_quad(scene, f"Wet{name}", (ox0, oy0), (ox1 - half, oy1), 0.002 + 0.0005 * index, wet_material)
            continue
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


def make_fringed_pad_material(lot_width: float, lot_height: float, dark: tuple[float, float, float], light: tuple[float, float, float]) -> bpy.types.Material:
    """Ground pad whose edges are eaten by noise so the lot blends into the
    surrounding terrain instead of ending on a hard diamond line. The south
    corner region stays opaque so the contact pixel still lands on the
    anchor."""
    material = bpy.data.materials.new("FringedPad")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], separate.inputs["Vector"])

    # World coords of the pad: x in [-lot_width, 0], y in [0, lot_height].
    def math_node(op, a, b=None, const=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = op
        if isinstance(a, (int, float)):
            node.inputs[0].default_value = a
        else:
            links.new(a, node.inputs[0])
        if b is not None:
            if isinstance(b, (int, float)):
                node.inputs[1].default_value = b
            else:
                links.new(b, node.inputs[1])
        return node.outputs["Value"]

    edge_x0 = math_node("ADD", separate.outputs["X"], lot_width)
    edge_x1 = math_node("MULTIPLY", separate.outputs["X"], -1.0)
    edge_y0 = math_node("MAXIMUM", separate.outputs["Y"], 0.0)
    edge_y1 = math_node("SUBTRACT", lot_height, separate.outputs["Y"])
    edge = math_node("MINIMUM", math_node("MINIMUM", edge_x0, edge_x1), math_node("MINIMUM", edge_y0, edge_y1))

    fringe_noise = nodes.new("ShaderNodeTexNoise")
    fringe_noise.inputs["Scale"].default_value = 11.0
    fringe_noise.inputs["Detail"].default_value = 2.0
    jitter = math_node("MULTIPLY_ADD", fringe_noise.outputs["Fac"], 0.42, -0.21)
    visible = math_node("GREATER_THAN", math_node("ADD", math_node("MULTIPLY", edge, 4.0), jitter), 0.16)

    surface_noise = nodes.new("ShaderNodeTexNoise")
    surface_noise.inputs["Scale"].default_value = 14.0
    surface_noise.inputs["Detail"].default_value = 3.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(surface_noise.outputs["Fac"], ramp.inputs["Fac"])

    emission = nodes.new("ShaderNodeEmission")
    links.new(ramp.outputs["Color"], emission.inputs["Color"])
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(visible, mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


PAD_PALETTES = {
    "gravel": ((0.235, 0.210, 0.165), (0.320, 0.290, 0.235)),
    "dirt": ((0.195, 0.160, 0.115), (0.265, 0.225, 0.165)),
}


def add_yard_pad(scene: bpy.types.Scene, lot_width: float, lot_height: float, kind: str = "gravel") -> None:
    """Flat pad covering the map [-lot_width..0]x[-lot_height..0] lot with a
    noise-fringed boundary."""
    dark, light = PAD_PALETTES[kind]
    material = make_fringed_pad_material(lot_width, lot_height, dark, light)
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


def make_namako_material() -> bpy.types.Material:
    """Namako-kabe: dark tiles with a raised white diagonal grid. The grid is
    driven by two 45-degree wave sets in (wall-run, height) space so the same
    shader reads correctly on both wall orientations."""
    material = bpy.data.materials.new("NamakoWall")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], separate.inputs["Vector"])
    run = nodes.new("ShaderNodeMath")
    run.operation = "ADD"
    links.new(separate.outputs["X"], run.inputs[0])
    links.new(separate.outputs["Y"], run.inputs[1])

    def diagonal(sign: float):
        axis = nodes.new("ShaderNodeMath")
        axis.operation = "MULTIPLY_ADD"
        axis.inputs[1].default_value = sign
        links.new(separate.outputs["Z"], axis.inputs[0])
        links.new(run.outputs["Value"], axis.inputs[2])
        freq = nodes.new("ShaderNodeMath")
        freq.operation = "MULTIPLY"
        freq.inputs[1].default_value = 7.0
        links.new(axis.outputs["Value"], freq.inputs[0])
        saw = nodes.new("ShaderNodeMath")
        saw.operation = "FRACT"
        links.new(freq.outputs["Value"], saw.inputs[0])
        tri0 = nodes.new("ShaderNodeMath")
        tri0.operation = "SUBTRACT"
        links.new(saw.outputs["Value"], tri0.inputs[0])
        tri0.inputs[1].default_value = 0.5
        tri = nodes.new("ShaderNodeMath")
        tri.operation = "ABSOLUTE"
        links.new(tri0.outputs["Value"], tri.inputs[0])
        line = nodes.new("ShaderNodeMath")
        line.operation = "GREATER_THAN"
        line.inputs[1].default_value = 0.40
        links.new(tri.outputs["Value"], line.inputs[0])
        return line.outputs["Value"]

    either = nodes.new("ShaderNodeMath")
    either.operation = "MAXIMUM"
    links.new(diagonal(1.0), either.inputs[0])
    links.new(diagonal(-1.0), either.inputs[1])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.055, 0.055, 0.062, 1.0)
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (0.43, 0.40, 0.33, 1.0)
    links.new(either.outputs["Value"], ramp.inputs["Fac"])
    finish_material(material, ramp.outputs["Color"])
    return material


def make_showcase_plaster() -> bpy.types.Material:
    """Aged plaster: subdued warm base, painterly blotches, and vertical
    rain-streak grime (noise stretched along z)."""
    material = bpy.data.materials.new("ShowcasePlaster")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 2.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.485, 0.445, 0.365, 1.0)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (0.615, 0.575, 0.485, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])

    coords = nodes.new("ShaderNodeTexCoord")
    stretch = nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (9.0, 9.0, 0.7)
    links.new(coords.outputs["Object"], stretch.inputs["Vector"])
    streaks = nodes.new("ShaderNodeTexNoise")
    streaks.inputs["Scale"].default_value = 1.0
    streaks.inputs["Detail"].default_value = 2.0
    links.new(stretch.outputs["Vector"], streaks.inputs["Vector"])
    streak_ramp = nodes.new("ShaderNodeValToRGB")
    streak_ramp.color_ramp.interpolation = "EASE"
    streak_ramp.color_ramp.elements[0].position = 0.28
    streak_ramp.color_ramp.elements[0].color = (0.72, 0.70, 0.64, 1.0)
    streak_ramp.color_ramp.elements[1].position = 0.55
    streak_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(streaks.outputs["Fac"], streak_ramp.inputs["Fac"])

    grimed = nodes.new("ShaderNodeMix")
    grimed.data_type = "RGBA"
    grimed.blend_type = "MULTIPLY"
    grimed.inputs["Factor"].default_value = 1.0
    links.new(ramp.outputs["Color"], grimed.inputs["A"])
    links.new(streak_ramp.outputs["Color"], grimed.inputs["B"])
    finish_material(material, grimed.outputs["Result"])
    return material


def make_showcase_roof(ridge_axis: str = "x") -> bpy.types.Material:
    """Kawara roof calibrated to the tenshu reference: warm dark tiles, tile
    COLUMNS running down the slope (sanigawara rows), horizontal course
    steps, per-column value jitter, and mud grime pooling in the joints."""
    material = bpy.data.materials.new("ShowcaseRoof")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], separate.inputs["Vector"])

    # Tile columns are indexed by the position ALONG the ridge so the seams
    # run straight down the slope; indexing by any in-plane diagonal reads
    # as slanted planking instead of kawara.
    col = nodes.new("ShaderNodeMath")
    col.operation = "MULTIPLY"
    col.inputs[1].default_value = 9.0
    links.new(separate.outputs["X" if ridge_axis == "x" else "Y"], col.inputs[0])
    col_id = nodes.new("ShaderNodeMath")
    col_id.operation = "FLOOR"
    links.new(col.outputs["Value"], col_id.inputs[0])
    col_fract = nodes.new("ShaderNodeMath")
    col_fract.operation = "FRACT"
    links.new(col.outputs["Value"], col_fract.inputs[0])
    col_tri0 = nodes.new("ShaderNodeMath")
    col_tri0.operation = "SUBTRACT"
    links.new(col_fract.outputs["Value"], col_tri0.inputs[0])
    col_tri0.inputs[1].default_value = 0.5
    col_tri = nodes.new("ShaderNodeMath")
    col_tri.operation = "ABSOLUTE"
    links.new(col_tri0.outputs["Value"], col_tri.inputs[0])
    # Joint shadow between columns (dark near the seam, rounded highlight mid-tile).
    col_shade = nodes.new("ShaderNodeValToRGB")
    col_shade.color_ramp.interpolation = "EASE"
    # tri=0 at tile center, 0.5 at the seam: bright rounded cap at the
    # center (ibushi silver catch-light), falling to a dark seam shadow.
    col_shade.color_ramp.elements[0].position = 0.0
    col_shade.color_ramp.elements[0].color = (1.30, 1.30, 1.34, 1.0)
    col_shade.color_ramp.elements[1].position = 0.24
    col_shade.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    seam = col_shade.color_ramp.elements.new(0.46)
    seam.color = (0.42, 0.40, 0.40, 1.0)
    links.new(col_tri.outputs["Value"], col_shade.inputs["Fac"])

    # Per-column value jitter (aged tiles differ slightly).
    jitter_noise = nodes.new("ShaderNodeTexWhiteNoise")
    jitter_noise.noise_dimensions = "1D"
    links.new(col_id.outputs["Value"], jitter_noise.inputs["W"])
    jitter = nodes.new("ShaderNodeMath")
    jitter.operation = "MULTIPLY_ADD"
    jitter.inputs[1].default_value = 0.30
    jitter.inputs[2].default_value = 0.82
    links.new(jitter_noise.outputs["Value"], jitter.inputs[0])

    # Horizontal course steps down the slope.
    course = nodes.new("ShaderNodeMath")
    course.operation = "MULTIPLY"
    course.inputs[1].default_value = 15.0
    links.new(separate.outputs["Z"], course.inputs[0])
    course_fract = nodes.new("ShaderNodeMath")
    course_fract.operation = "FRACT"
    links.new(course.outputs["Value"], course_fract.inputs[0])
    course_step = nodes.new("ShaderNodeMath")
    course_step.operation = "MULTIPLY_ADD"
    course_step.inputs[1].default_value = 0.34
    course_step.inputs[2].default_value = 0.70
    links.new(course_fract.outputs["Value"], course_step.inputs[0])

    # Base tile color: warm dark gray-brown (tenshu reference).
    base_noise = nodes.new("ShaderNodeTexNoise")
    base_noise.inputs["Scale"].default_value = 2.4
    base_noise.inputs["Detail"].default_value = 2.0
    base_ramp = nodes.new("ShaderNodeValToRGB")
    base_ramp.color_ramp.interpolation = "EASE"
    base_ramp.color_ramp.elements[0].position = 0.3
    base_ramp.color_ramp.elements[0].color = (0.052, 0.048, 0.046, 1.0)
    base_ramp.color_ramp.elements[1].position = 0.75
    base_ramp.color_ramp.elements[1].color = (0.125, 0.120, 0.115, 1.0)
    links.new(base_noise.outputs["Fac"], base_ramp.inputs["Fac"])

    # Mud grime patches.
    grime_noise = nodes.new("ShaderNodeTexNoise")
    grime_noise.inputs["Scale"].default_value = 4.5
    grime_noise.inputs["Detail"].default_value = 3.0
    grime_fac = nodes.new("ShaderNodeValToRGB")
    grime_fac.color_ramp.elements[0].position = 0.42
    grime_fac.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    grime_fac.color_ramp.elements[1].position = 0.72
    grime_fac.color_ramp.elements[1].color = (0.55, 0.55, 0.55, 1.0)
    links.new(grime_noise.outputs["Fac"], grime_fac.inputs["Fac"])
    grimed = nodes.new("ShaderNodeMix")
    grimed.data_type = "RGBA"
    links.new(grime_fac.outputs["Color"], grimed.inputs["Factor"])
    links.new(base_ramp.outputs["Color"], grimed.inputs["A"])
    mud = nodes.new("ShaderNodeRGB")
    mud.outputs[0].default_value = (0.075, 0.058, 0.038, 1.0)
    links.new(mud.outputs[0], grimed.inputs["B"])

    def multiply(a, b):
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
        node.blend_type = "MULTIPLY"
        node.inputs["Factor"].default_value = 1.0
        links.new(a, node.inputs["A"])
        links.new(b, node.inputs["B"])
        return node.outputs["Result"]

    def scalar_color(value_socket):
        node = nodes.new("ShaderNodeCombineColor")
        links.new(value_socket, node.inputs["Red"])
        links.new(value_socket, node.inputs["Green"])
        links.new(value_socket, node.inputs["Blue"])
        return node.outputs["Color"]

    shaded = multiply(grimed.outputs["Result"], col_shade.outputs["Color"])
    shaded = multiply(shaded, scalar_color(jitter.outputs["Value"]))
    shaded = multiply(shaded, scalar_color(course_step.outputs["Value"]))
    finish_material(material, shaded)
    return material


def add_kawara_roof(
    scene: bpy.types.Scene,
    name: str,
    low_map: tuple[float, float],
    high_map: tuple[float, float],
    base_z: float,
    ridge_z: float,
    ridge_axis: str,
    roof_material: bpy.types.Material,
    trim_material: bpy.types.Material,
    verge_material: bpy.types.Material | None = None,
) -> None:
    """Quality-standard kawara roof assembly (approved on the showcase kura):
    curved gable surface, noshi ridge stack with oni end tiles, eave fascia
    and per-column round tile ends, optional white-plaster gable verge.
    Supports ridge_axis "x" and "y" in map coordinates."""
    if ridge_axis == "y":
        # Mirror the whole assembly through the map diagonal: build in a
        # swapped coordinate frame and swap back when emitting boxes.
        def swap(p):
            return (p[1], p[0])
        x0, y0 = swap(low_map)
        x1, y1 = swap(high_map)
    else:
        x0, y0 = low_map
        x1, y1 = high_map

    def emit_box(name_suffix, a_map, b_map, z0, z1, material):
        if ridge_axis == "y":
            a_map = (a_map[1], a_map[0])
            b_map = (b_map[1], b_map[0])
        low_w, high_w = map_box((min(a_map[0], b_map[0]), min(a_map[1], b_map[1]), z0), (max(a_map[0], b_map[0]), max(a_map[1], b_map[1]), z1))
        add_box(scene, f"{name}{name_suffix}", low_w, high_w, material)

    if ridge_axis == "y":
        low, high = map_box((y0, x0, 0.0), (y1, x1, 0.0))
    else:
        low, high = map_box((x0, y0, 0.0), (x1, y1, 0.0))
    add_gable_roof(scene, f"{name}Surface", (low[0], low[1]), (high[0], high[1]), base_z, ridge_z, "x" if ridge_axis == "x" else "y", roof_material, end_material=verge_material)

    mid = (y0 + y1) / 2.0
    emit_box("Noshi", (x0 - 0.04, mid - 0.08), (x1 + 0.04, mid + 0.08), ridge_z - 0.04, ridge_z + 0.05, trim_material)
    emit_box("Cap", (x0 - 0.02, mid - 0.045), (x1 + 0.02, mid + 0.045), ridge_z + 0.05, ridge_z + 0.105, trim_material)
    for ox in (x0 - 0.08, x1 - 0.04):
        emit_box(f"Oni{ox:.2f}", (ox, mid - 0.09), (ox + 0.12, mid + 0.09), ridge_z - 0.06, ridge_z + 0.14, trim_material)

    pitch = 1.0 / 9.0
    for ey in (y0, y1):
        emit_box(f"Fascia{ey:.2f}", (x0, ey - 0.04), (x1, ey + 0.04), base_z - 0.055, base_z - 0.005, trim_material)
    count = int((x1 - x0) / pitch)
    for index in range(count + 1):
        ex = x0 + index * pitch - 0.028
        for ey in (y0, y1):
            emit_box(f"Eave{index}{ey:.2f}", (ex, ey - 0.05), (ex + 0.056, ey + 0.05), base_z - 0.07, base_z + 0.005, trim_material)


def build_storehouse_showcase(scene: bpy.types.Scene) -> None:
    """Production-quality kura for the painterly style gate. Same 3x3 lot and
    massing as the approved graybox; detail: ishigaki plinth, namako-kabe
    lower band, plastered upper storey, kannon double door with awning, two
    mushiko windows, curved roof with ridge cap and oni end tiles."""
    plaster = make_showcase_plaster()
    namako = make_namako_material()
    roof = make_showcase_roof()
    stone = make_ishigaki_material("ShowcaseIshigaki")
    wood = make_textured_material("ShowcaseWood", (0.048, 0.034, 0.020), (0.095, 0.070, 0.042), scale=(18.0, 18.0, 2.5))
    gravel = make_textured_material("ShowcaseGravel", (0.55, 0.50, 0.40), (0.68, 0.63, 0.52), scale=14.0)
    ridge_dark = make_material("RidgeTile", (0.045, 0.042, 0.045, 1.0))

    add_yard_pad(scene, 3.0, 3.0, "gravel")
    # Ishigaki plinth.
    add_frustum(scene, "Plinth", (-2.62, -2.32), (-0.38, -0.68), 0.0, 0.24, 0.05, stone)
    # Namako lower band.
    add_box(scene, "Namako", *map_box((-2.5, -2.2, 0.24), (-0.5, -0.8, 0.56)), namako)
    # Plaster upper storey, slightly inset.
    add_box(scene, "Upper", *map_box((-2.47, -2.17, 0.56), (-0.53, -0.83, 1.17)), plaster)

    # Kannon double door on the long south-west face (map +y side), with a
    # stepped plaster frame and a small tiled awning.
    add_box(scene, "DoorFrame", *map_box((-1.78, -0.86, 0.24), (-1.22, -0.78, 0.98)), plaster)
    add_box(scene, "DoorRecess", *map_box((-1.72, -0.83, 0.24), (-1.28, -0.76, 0.92)), wood)
    add_box(scene, "DoorSplit", *map_box((-1.515, -0.80, 0.24), (-1.485, -0.75, 0.92)), ridge_dark)

    # Mushiko windows high on the same face and one on the gable end.
    for index, (wx0, wx1) in enumerate(((-2.28, -1.98), (-1.06, -0.76))):
        add_box(scene, f"WinFrame{index}", *map_box((wx0 - 0.04, -0.85, 0.78), (wx1 + 0.04, -0.79, 1.04)), plaster)
        add_box(scene, f"Win{index}", *map_box((wx0, -0.82, 0.82), (wx1, -0.77, 1.00)), ridge_dark)
        bar = wx0 + 0.05
        while bar < wx1 - 0.02:
            add_box(scene, f"WinBar{index}{bar:.2f}", *map_box((bar, -0.81, 0.82), (bar + 0.035, -0.755, 1.00)), plaster)
            bar += 0.09

    # Kura walls are fully plastered (nurigome): no exposed timber. A thin
    # plaster drip ledge articulates the namako/upper boundary instead.
    add_box(scene, "DripLedge", *map_box((-2.53, -2.23, 0.545), (-0.47, -0.77, 0.585)), plaster)

    # Stone step before the door.
    add_box(scene, "DoorStep", *map_box((-1.70, -0.72, 0.0), (-1.30, -0.58, 0.12)), stone)

    # Kura crest (white disc) on the visible gable-end wall.
    crest_bright = make_material("CrestWhite", (0.72, 0.70, 0.62, 1.0))
    crest_dark = make_material("CrestInk", (0.10, 0.095, 0.10, 1.0))
    import math as _math
    for radius, depth, mat in ((0.095, 0.045, crest_bright), (0.062, 0.055, crest_dark), (0.032, 0.065, crest_bright)):
        ring = []
        for i in range(8):
            angle = i / 8 * 2 * _math.pi
            ring.append((-1.5 + radius * _math.cos(angle), 1.00 + radius * _math.sin(angle)))
        vertices = [(*map_xy(-0.53 + depth, ry), rz) for ry, rz in [(-1.5, 0.92)]]
        vertices = []
        for ry, rz in ring:
            vertices.append((*map_xy(-0.53 - 0.0, ry), rz))
        # place slightly proud of the +x gable wall
        vertices = [((v[0] + depth), v[1], v[2]) for v in vertices]
        add_mesh(scene, f"Crest{radius}", vertices, [tuple(range(8))], mat)

    # Small tiled awnings over the mushiko windows.
    for index, (wx0, wx1) in enumerate(((-2.28, -1.98), (-1.06, -0.76))):
        alow, ahigh = map_box((wx0 - 0.07, -0.94, 0.0), (wx1 + 0.07, -0.76, 0.0))
        add_box(scene, f"WinAwning{index}", (alow[0], alow[1], 1.055), (ahigh[0], ahigh[1], 1.095), ridge_dark)

    # Door strap hardware.
    for bz in (0.42, 0.72):
        add_box(scene, f"DoorBand{bz}", *map_box((-1.71, -0.845, bz), (-1.29, -0.755, bz + 0.035)), crest_dark)

    # Rain-splash grime band above the plinth.
    splash = make_material("SplashGrime", (0.155, 0.145, 0.125, 1.0))
    add_box(scene, "Splash", *map_box((-2.505, -2.205, 0.24), (-0.495, -0.795, 0.305)), splash)

    # Quality-standard kawara roof (see add_kawara_roof).
    add_kawara_roof(scene, "KuraRoof", (-2.62, -2.32), (-0.38, -0.68), 1.17, 1.58, "x", roof, ridge_dark, verge_material=plaster)


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

    add_yard_pad(scene, 3.0, 3.0, "gravel")
    # Stone plinth under the building only.
    add_box(scene, "Plinth", *map_box((-2.65, -2.35, 0.0), (-0.35, -0.65, 0.22)), stone)
    # Plastered storehouse body, one tall storage story.
    add_box(scene, "Body", *map_box((-2.5, -2.2, 0.22), (-0.5, -0.8, 0.22 + STORY_WALL_HEIGHT)), plaster)
    # Dark wood band under the eaves.
    add_box(scene, "EaveBand", *map_box((-2.55, -2.25, 0.97), (-0.45, -0.75, 0.22 + STORY_WALL_HEIGHT)), wood)
    # Gabled tile roof with overhang, ridge along the long map-x axis.
    low, high = map_box((-2.75, -2.45, 0.0), (-0.25, -0.55, 0.0))
    add_gable_roof(scene, "Roof", (low[0], low[1]), (high[0], high[1]), 0.22 + STORY_WALL_HEIGHT, 1.75, "x", roof)


def make_foliage_material(name: str, dark: tuple[float, float, float], light: tuple[float, float, float]) -> bpy.types.Material:
    return make_noise_material(name, dark, light, scale=9.0)


def make_plank_material(name: str, dark: tuple[float, float, float], light: tuple[float, float, float], boards_per_unit: float = 5.0) -> bpy.types.Material:
    """Wood with pronounced anisotropic grain and horizontal board seams."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    stretch = nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (26.0, 26.0, 2.2)
    links.new(coords.outputs["Object"], stretch.inputs["Vector"])
    grain = nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 1.0
    grain.inputs["Detail"].default_value = 4.0
    links.new(stretch.outputs["Vector"], grain.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(grain.outputs["Fac"], ramp.inputs["Fac"])

    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], separate.inputs["Vector"])
    seam = nodes.new("ShaderNodeMath")
    seam.operation = "MULTIPLY"
    seam.inputs[1].default_value = boards_per_unit
    links.new(separate.outputs["Z"], seam.inputs[0])
    seam_f = nodes.new("ShaderNodeMath")
    seam_f.operation = "FRACT"
    links.new(seam.outputs["Value"], seam_f.inputs[0])
    seam_band = nodes.new("ShaderNodeMath")
    seam_band.operation = "MULTIPLY_ADD"
    seam_band.inputs[1].default_value = 0.18
    seam_band.inputs[2].default_value = 0.82
    links.new(seam_f.outputs["Value"], seam_band.inputs[0])
    seam_color = nodes.new("ShaderNodeCombineColor")
    for channel in ("Red", "Green", "Blue"):
        links.new(seam_band.outputs["Value"], seam_color.inputs[channel])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(ramp.outputs["Color"], mix.inputs["A"])
    links.new(seam_color.outputs["Color"], mix.inputs["B"])
    finish_material(material, mix.outputs["Result"])
    return material


def add_beam(scene: bpy.types.Scene, name: str, a: tuple[float, float, float], b: tuple[float, float, float], thickness: float, material: bpy.types.Material, tip_thickness: float | None = None) -> None:
    """Slanted square-section beam between two map-space points (trunks,
    branches, bamboo culms). tip_thickness tapers the far end."""
    ax, ay, az = a
    bx, by, bz = b
    halves = (thickness / 2.0, (tip_thickness if tip_thickness is not None else thickness) / 2.0)
    vertices = []
    for (px, py, pz), h in zip(((ax, ay, az), (bx, by, bz)), halves):
        for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h)):
            vertices.append((*map_xy(px + dx, py + dy), pz))
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    add_mesh(scene, name, vertices, faces, material)


def add_foliage_blob(scene: bpy.types.Scene, name: str, cx: float, cy: float, z: float, radius: float, height: float, material: bpy.types.Material, squash: float = 1.0) -> None:
    """Organic leaf mass: an octagonal ellipsoid (rings of 8 vertices with an
    ellipsoid radius profile), so foliage reads as rounded clumps instead of
    square slabs."""
    import math as _math
    h = height * squash
    ring_ts = (0.14, 0.42, 0.72, 0.92)
    ring_radii = tuple(radius * _math.sin(_math.pi * min(t, 0.97)) ** 0.72 for t in ring_ts)
    seed = sum(ord(c) for c in name)
    vertices: list[tuple[float, float, float]] = []
    for ring, (t, r) in enumerate(zip(ring_ts, ring_radii)):
        for i in range(8):
            angle = (i + 0.5) / 8 * 2 * _math.pi
            # Deterministic lumpiness: each vertex pushes in or out a little
            # so the silhouette reads as leaf clumps, not a smooth solid.
            jitter = 1.0 + 0.16 * _math.sin(seed * 3.7 + ring * 12.9898 + i * 78.233)
            zj = h * 0.05 * _math.sin(seed * 1.3 + ring * 7.31 + i * 41.7)
            rj = r * jitter
            vertices.append((*map_xy(cx + rj * _math.cos(angle), cy + rj * _math.sin(angle)), z + h * t + zj))
    bottom = len(vertices)
    vertices.append((*map_xy(cx, cy), z))
    top = len(vertices)
    vertices.append((*map_xy(cx, cy), z + h))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(ring_ts) - 1):
        a = ring * 8
        b = (ring + 1) * 8
        for i in range(8):
            j = (i + 1) % 8
            faces.append((a + i, a + j, b + j, b + i))
    for i in range(8):
        j = (i + 1) % 8
        faces.append((bottom, i, j))
        last = (len(ring_ts) - 1) * 8
        faces.append((top, last + j, last + i))
    add_mesh(scene, name, vertices, faces, material)


def add_tree_base(scene: bpy.types.Scene, cx: float, cy: float, trunk_r: float, bark: bpy.types.Material) -> None:
    """Ground treatment under a tree: tapered root flare, a leaf-litter and
    undergrowth patch, grass tufts in two shades, and a few pebbles."""
    grass_dark = make_material("BaseGrassD", (0.130, 0.165, 0.062, 1.0))
    grass_light = make_material("BaseGrassL", (0.215, 0.255, 0.100, 1.0))
    litter_soil = make_foliage_material("BaseLitterSoil", (0.085, 0.068, 0.042), (0.130, 0.105, 0.062))
    litter_leaf = make_foliage_material("BaseLitterLeaf", (0.060, 0.085, 0.038), (0.100, 0.130, 0.058))
    pebble = make_noise_material("BasePebble", (0.105, 0.102, 0.095), (0.180, 0.175, 0.160), scale=7.0)

    # Leaf-litter / shaded undergrowth patch: flat cards hugging the ground,
    # denser near the trunk. Reads as the shadowed, mulched foot of a tree.
    add_leaf_cards(
        scene,
        f"Litter{cx}",
        (cx, cy, 0.015),
        (0.34, 0.34, 0.012),
        44,
        [litter_soil, litter_leaf],
        seed=cx * 11 + cy * 5 + 71,
        card_size=0.085,
        shade_bias=0.35,
    )

    # Tapered roots, slightly sinking into the ground.
    roots = ((0.19, 0.03), (-0.15, 0.12), (0.04, -0.19), (-0.11, -0.14), (0.13, 0.15))
    for index, (rx, ry) in enumerate(roots):
        add_beam(scene, f"Root{cx}{index}", (cx + rx, cy + ry, -0.01), (cx + rx * 0.2, cy + ry * 0.2, 0.11), trunk_r * 0.5, bark, tip_thickness=trunk_r * 0.95)

    # Grass tufts in two shades and heights.
    tufts = ((0.26, -0.09, 0), (-0.24, 0.16, 1), (0.09, 0.26, 0), (-0.19, -0.21, 1), (0.28, 0.14, 1), (-0.30, 0.02, 0), (0.02, -0.30, 1))
    for index, (tx, ty, shade) in enumerate(tufts):
        height = 0.11 + (index % 3) * 0.035
        material = grass_light if shade else grass_dark
        add_beam(scene, f"BaseTuft{cx}{index}", (cx + tx, cy + ty, 0.0), (cx + tx + 0.025, cy + ty - 0.02, height), 0.02, material, tip_thickness=0.006)
        add_beam(scene, f"BaseTuftB{cx}{index}", (cx + tx + 0.02, cy + ty + 0.02, 0.0), (cx + tx - 0.01, cy + ty + 0.04, height * 0.7), 0.016, material, tip_thickness=0.005)

    # Pebbles.
    for index, (bx, by, size) in enumerate(((0.31, 0.05, 0.045), (-0.27, -0.12, 0.035))):
        add_frustum(scene, f"BasePebble{cx}{index}", (cx + bx - size, cy + by - size), (cx + bx + size, cy + by + size), 0.0, size * 1.3, size * 0.5, pebble)


def add_leaf_cards(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    count: int,
    materials: list[bpy.types.Material],
    seed: float,
    card_size: float = 0.085,
    shade_bias: float = 0.75,
    card_aspect: float = 1.0,
    droop: float = 0.0,
) -> None:
    """Foliage as a cloud of small quads inside an ellipsoid. Each card takes
    the painterly light ramp individually, so canopies get dappled light in
    the same shading language as the rest of the world."""
    import math as _math

    def rand(k: float) -> float:
        return (_math.sin(seed * 7.13 + k) * 43758.5453) % 1.0

    cx, cy, cz = center
    rx, ry, rz = radii
    buckets: list[list[tuple[float, float, float]]] = [[] for _ in materials]
    faces_per_bucket: list[list[tuple[int, ...]]] = [[] for _ in materials]
    for i in range(count):
        u = rand(i * 3.1)
        v = rand(i * 3.1 + 1.0)
        w = rand(i * 3.1 + 2.0)
        # Bias toward the shell so silhouettes stay leafy, centers stay full.
        radial = 0.45 + 0.55 * (u ** 0.4)
        theta = v * 2.0 * _math.pi
        phi = _math.acos(2.0 * w - 1.0)
        px = cx + rx * radial * _math.sin(phi) * _math.cos(theta)
        py = cy + ry * radial * _math.sin(phi) * _math.sin(theta)
        pz = cz + rz * radial * _math.cos(phi)
        # Card orientation: mostly horizontal, some tilt; droop pulls the
        # outer edge downward like hanging needle bundles.
        tilt = (rand(i * 5.7) - 0.5) * 1.1 - droop * radial
        yaw = rand(i * 9.3) * 2.0 * _math.pi
        half = card_size * (0.7 + 0.6 * rand(i * 4.9))
        long_half = half * card_aspect
        ax = _math.cos(yaw) * long_half
        ay = _math.sin(yaw) * long_half
        bx = -_math.sin(yaw) * half * _math.cos(tilt)
        by = _math.cos(yaw) * half * _math.cos(tilt)
        bz = half * _math.sin(tilt)
        # Self-shadow + sun side: cards high in the cloud and on the lit
        # side (map direction (1, 0.2), matching LIGHT_DIRECTION) lean
        # bright; low shaded cards lean dark (materials ordered dark->light).
        t_height = 0.5 + 0.5 * (pz - cz) / max(rz, 1e-5)
        t_light = 0.5 + 0.5 * ((px - cx) * 0.98 + (py - cy) * 0.196) / max(rx, 1e-5)
        t_shade = 0.6 * t_height + 0.4 * t_light
        mix = t_shade * shade_bias + rand(i * 6.7) * (1.0 - shade_bias)
        bucket = min(len(materials) - 1, max(0, int(mix * len(materials))))
        vertices = buckets[bucket]
        base = len(vertices)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vertices.append((*map_xy(px + sx * ax + sy * bx, py + sx * ay + sy * by), pz + sy * bz))
        faces_per_bucket[bucket].append((base, base + 1, base + 2, base + 3))
    for index, material in enumerate(materials):
        if faces_per_bucket[index]:
            add_mesh(scene, f"{name}Cards{index}", buckets[index], faces_per_bucket[index], material)


def add_foliage_skirt(scene: bpy.types.Scene, name: str, cx: float, cy: float, z: float, radius: float, height: float, material: bpy.types.Material) -> None:
    """Octagonal cone skirt (wide rim tapering to a point): the stylized
    conifer tier with a visible layered hem."""
    import math as _math
    vertices: list[tuple[float, float, float]] = []
    for i in range(8):
        angle = (i + 0.5) / 8 * 2 * _math.pi
        vertices.append((*map_xy(cx + radius * _math.cos(angle), cy + radius * _math.sin(angle)), z))
    apex = len(vertices)
    vertices.append((*map_xy(cx, cy), z + height))
    bottom = len(vertices)
    vertices.append((*map_xy(cx, cy), z - height * 0.12))
    faces: list[tuple[int, ...]] = []
    for i in range(8):
        j = (i + 1) % 8
        faces.append((i, j, apex))
        faces.append((bottom, j, i))
    add_mesh(scene, name, vertices, faces, material)


def add_cloud_pad(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radius: float,
    lit_material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    seed: float,
) -> None:
    """Pine cloud pad drawn the nihonga way: overlapping arcs. A rosette of
    bumps (center + ring) whose scalloped outline reads as a needle cloud;
    a thin dark under-layer gives the shaded base."""
    import math as _math

    def rand(k: float) -> float:
        return (_math.sin(seed * 5.77 + k) * 43758.5453) % 1.0

    cx, cy, cz = center
    bump_r = radius * 0.46
    # Shadow base: slightly wider, thin, tucked under.
    add_foliage_blob(scene, f"{name}Base", cx + 0.02, cy + 0.02, cz - bump_r * 0.30, radius * 0.95, bump_r * 0.55, shadow_material, squash=0.8)
    # Center crown bump.
    add_foliage_blob(scene, f"{name}C", cx, cy, cz + bump_r * 0.10, bump_r * 1.15, bump_r * 0.95, lit_material, squash=0.85)
    # Ring of scallop bumps.
    count = 6
    for i in range(count):
        angle = (i + rand(i * 2.3) * 0.5) / count * 2.0 * _math.pi
        dist = radius * (0.58 + 0.10 * rand(i * 3.7))
        bx = cx + dist * _math.cos(angle)
        by = cy + dist * _math.sin(angle)
        bz = cz + bump_r * (0.05 - 0.18 * rand(i * 1.9))
        size = bump_r * (0.78 + 0.28 * rand(i * 4.1))
        add_foliage_blob(scene, f"{name}B{i}", bx, by, bz, size, size * 0.9, lit_material, squash=0.8)


def build_tree_pine(scene: bpy.types.Scene, variant: int = 0) -> None:
    """Akamatsu (Japanese red pine): a visibly bent trunk, bare lower bole,
    and asymmetric umbrella pads carried at the END of individual branches.
    Canvas 64x112, anchor 32,96."""
    bark = make_textured_material("PineBark", (0.075, 0.048, 0.032), (0.130, 0.088, 0.056), scale=(14.0, 14.0, 3.0))
    needle_dark = make_foliage_material("PineNeedlesD", (0.048, 0.092, 0.055), (0.085, 0.140, 0.078))
    needle_light = make_foliage_material("PineNeedlesL", (0.075, 0.130, 0.070), (0.130, 0.200, 0.105))
    s = 1.0 if variant % 2 == 0 else -1.0

    add_tree_base(scene, 0.0, 0.0, 0.12, bark)
    # Trunk and pad layout traced from the approved AI pine reference
    # (assets/source/ai/deco-tree-pine-1__raw.png): a thick S-curve with
    # shelves alternating left-right and shrinking toward the crown.
    p0 = (0.0, 0.0, 0.0)
    p1 = (0.16 * s, 0.10 * s, 0.35)
    p2 = (-0.06 * s, -0.04 * s, 0.72)
    p3 = (0.22 * s, 0.12 * s, 1.10)
    p4 = (-0.02 * s, 0.02 * s, 1.45)
    add_beam(scene, "Trunk1", p0, p1, 0.15, bark, tip_thickness=0.11)
    add_beam(scene, "Trunk2", p1, p2, 0.11, bark, tip_thickness=0.085)
    add_beam(scene, "Trunk3", p2, p3, 0.085, bark, tip_thickness=0.06)
    add_beam(scene, "Trunk4", p3, p4, 0.06, bark, tip_thickness=0.035)

    # Shelf pads (tana): thin, wide clouds held out at the switchback
    # elbows so the trunk line stays readable between them.
    needle_shadow = make_material("PineCloudShadow", (0.045, 0.085, 0.050, 1.0))
    needle_lit = make_material("PineCloudLit", (0.100, 0.160, 0.082, 1.0))
    accent_lit = make_material("PineAccentLit", (0.155, 0.225, 0.115, 1.0))
    import math as _math
    # Alternating shelf rhythm (the pine symbol): left, right, left, right,
    # crown — each shelf smaller than the one below, trunk visible between.
    tiers = [
        (p2, (-0.50 * s, -0.30 * s, 0.72), 0.30),
        (p2, (-0.20 * s, -0.42 * s, 0.80), 0.23),
        (p2, (0.48 * s, 0.30 * s, 0.88), 0.26),
        (p2, (0.66 * s, 0.10 * s, 0.80), 0.17),
        (p3, (-0.34 * s, -0.12 * s, 1.10), 0.22),
        (p3, (0.30 * s, 0.18 * s, 1.28), 0.19),
        (p4, (0.16 * s, 0.08 * s, 1.44), 0.13),
        (p4, (0.0, 0.0, 1.58), 0.22),
    ]
    for index, (base, tip, radius) in enumerate(tiers):
        add_beam(scene, f"Branch{index}", base, (tip[0], tip[1], tip[2] - 0.06), 0.04, bark, tip_thickness=0.02)
        add_cloud_pad(
            scene,
            f"Pad{index}",
            (tip[0], tip[1], tip[2] + 0.03),
            radius,
            needle_lit,
            needle_shadow,
            seed=float(variant * 37 + index * 11 + 7),
        )
    # A single bare dead branch, a byobu-e pine idiom.
    add_beam(scene, "DeadBranch", p2, (-0.04 * s, 0.30 * s, 1.04), 0.035, bark, tip_thickness=0.014)
    for index, (kx, ky, kz) in enumerate(((0.05 * s, 0.02 * s, 0.34), (0.13 * s, 0.09 * s, 0.72))):
        add_box(scene, f"Knot{index}", *map_box((kx - 0.035, ky - 0.035, kz), (kx + 0.035, ky + 0.035, kz + 0.06)), bark)


def build_tree_cedar(scene: bpy.types.Scene) -> None:
    """Sugi (cedar): tall, narrow, dense spire. Overlapping soft tiers that
    shrink smoothly to a point; foliage starts low, trunk barely shows.
    Canvas 64x128, anchor 32,112."""
    bark = make_textured_material("CedarBark", (0.062, 0.045, 0.032), (0.100, 0.078, 0.055), scale=(14.0, 14.0, 3.0))
    dark = make_foliage_material("CedarNeedlesD", (0.035, 0.075, 0.048), (0.062, 0.110, 0.068))
    light = make_foliage_material("CedarNeedlesL", (0.052, 0.100, 0.058), (0.090, 0.150, 0.085))
    add_tree_base(scene, 0.0, 0.0, 0.09, bark)
    add_beam(scene, "Trunk", (0.0, 0.0, 0.0), (0.05, -0.03, 2.02), 0.13, bark, tip_thickness=0.045)
    # One-stroke cone: three smooth stacked masses, alternating shade bands.
    mid = make_foliage_material("CedarNeedlesM", (0.048, 0.092, 0.055), (0.075, 0.125, 0.070))
    # Layered cone skirts: each tier is a wide-hemmed cone overlapping the
    # one above, ending in a sharp apex — the stylized sugi silhouette.
    tiers = [
        (0.36, 0.28, 0.55, dark), (0.30, 0.62, 0.52, mid), (0.24, 0.96, 0.50, dark),
        (0.18, 1.30, 0.48, mid), (0.12, 1.62, 0.46, light),
    ]
    for index, (radius, z, height, mat) in enumerate(tiers):
        jx = 0.012 if index % 2 == 0 else -0.012
        add_foliage_skirt(scene, f"Tier{index}", jx, -jx, z, radius, height, mat)
    add_foliage_skirt(scene, "Apex", 0.0, 0.0, 1.92, 0.07, 0.34, light)


def build_tree_broadleaf(scene: bpy.types.Scene) -> None:
    """Keyaki-style broadleaf: short trunk splitting into limbs, a dome of
    several overlapping leaf masses with light/dark variation.
    Canvas 64x112, anchor 32,96."""
    bark = make_textured_material("BroadBark", (0.070, 0.052, 0.036), (0.118, 0.090, 0.062), scale=(14.0, 14.0, 3.0))
    deep = make_foliage_material("BroadLeavesDeep", (0.032, 0.062, 0.028), (0.060, 0.100, 0.045))
    dark = make_foliage_material("BroadLeavesD", (0.052, 0.095, 0.040), (0.095, 0.150, 0.065))
    light = make_foliage_material("BroadLeavesL", (0.085, 0.140, 0.058), (0.160, 0.225, 0.100))
    sun = make_foliage_material("BroadLeavesSun", (0.125, 0.185, 0.080), (0.205, 0.270, 0.125))
    add_tree_base(scene, 0.0, 0.0, 0.12, bark)
    add_beam(scene, "Trunk", (0.0, 0.0, 0.0), (0.02, -0.02, 0.55), 0.16, bark, tip_thickness=0.11)
    limbs = [
        ((0.02, -0.02, 0.50), (-0.24, 0.11, 0.88)),
        ((0.02, -0.02, 0.50), (0.26, -0.15, 0.92)),
        ((0.02, -0.02, 0.52), (0.02, 0.22, 0.98)),
        ((0.02, -0.02, 0.52), (-0.10, -0.20, 0.95)),
    ]
    for index, (base, tip) in enumerate(limbs):
        add_beam(scene, f"Limb{index}", base, tip, 0.06, bark, tip_thickness=0.028)
        for t_index, (dx, dy, dz) in enumerate(((0.10, 0.06, 0.14), (-0.07, 0.10, 0.16))):
            add_beam(scene, f"LimbTwig{index}{t_index}", tip, (tip[0] + dx, tip[1] + dy, tip[2] + dz), 0.02, bark, tip_thickness=0.01)
    # Cloud dome split into a shaded mass and a sunlit mass offset toward
    # the light (map direction (1, 0.2)).
    add_foliage_blob(scene, "DomeShade", -0.05, -0.03, 0.62, 0.42, 0.62, dark)
    add_foliage_blob(scene, "DomeShade2", 0.06, 0.14, 0.70, 0.33, 0.50, dark)
    add_foliage_blob(scene, "DomeLit", 0.13, 0.02, 0.88, 0.33, 0.50, light)
    add_foliage_blob(scene, "DomeLit2", 0.02, -0.12, 0.98, 0.26, 0.40, sun)


def build_bamboo(scene: bpy.types.Scene) -> None:
    """Bamboo grove: many slender culms leaning outward from the clump,
    joined above by feathery shared canopies (not per-culm lollipops).
    Canvas 64x128, anchor 32,112."""
    culm = make_material("BambooCulm", (0.120, 0.175, 0.068, 1.0))
    culm_light = make_material("BambooCulmL", (0.165, 0.230, 0.095, 1.0))
    leaves_dark = make_foliage_material("BambooLeavesD", (0.080, 0.140, 0.050), (0.130, 0.200, 0.078))
    leaves_light = make_foliage_material("BambooLeavesL", (0.120, 0.190, 0.068), (0.200, 0.285, 0.110))
    stalks = [
        (-0.16, -0.06, 2.05, 0.10), (-0.03, -0.17, 2.25, 0.02), (0.13, 0.00, 2.10, -0.08),
        (0.03, 0.15, 1.90, 0.12), (-0.12, 0.12, 2.15, -0.10), (0.17, -0.13, 1.80, 0.06),
        (-0.22, 0.02, 1.70, -0.13), (0.08, -0.08, 2.30, -0.02),
    ]
    bark = make_textured_material("BambooBark", (0.075, 0.055, 0.034), (0.135, 0.100, 0.062), scale=(14.0, 14.0, 3.0))
    add_tree_base(scene, 0.0, 0.0, 0.0, bark)
    for index, (sx, sy, height, lean) in enumerate(stalks):
        mat = culm if index % 2 == 0 else culm_light
        add_beam(scene, f"Culm{index}", (sx, sy, 0.0), (sx + lean, sy + lean * 0.7, height), 0.038, mat, tip_thickness=0.024)
        # Culm nodes: brighter rings up the stalk.
        node_z = 0.32
        while node_z < height - 0.25:
            f = node_z / height
            nx = sx + lean * f
            ny = sy + lean * 0.7 * f
            add_box(scene, f"Node{index}{node_z:.2f}", *map_box((nx - 0.026, ny - 0.026, node_z), (nx + 0.026, ny + 0.026, node_z + 0.022)), culm_light)
            node_z += 0.34
    # Crescent sasa tufts: sparse fans of drooping elongated leaves at the
    # culm tops, with sky showing between the tufts.
    import math as _math
    tuft_specs = [
        (-0.14, -0.02, 1.92, 0.9), (0.10, -0.12, 2.16, -0.6), (0.16, 0.06, 1.98, 0.4),
        (-0.05, 0.16, 1.78, -0.9), (-0.20, 0.10, 2.02, 0.7), (0.02, -0.04, 2.32, -0.3),
        (0.20, -0.16, 1.66, 0.5), (-0.24, -0.06, 1.58, -0.5),
    ]
    for index, (tx, ty, tz, spin) in enumerate(tuft_specs):
        mat = leaves_dark if index % 2 == 0 else leaves_light
        # A fan of 4 drooping blade cards per tuft.
        for blade in range(4):
            angle = spin + (blade - 1.5) * 0.55
            length = 0.16 + 0.04 * ((blade + index) % 2)
            ex = tx + length * _math.cos(angle)
            ey = ty + length * _math.sin(angle)
            ez = tz - 0.10 - 0.03 * blade
            add_beam(scene, f"Blade{index}{blade}", (tx, ty, tz), (ex, ey, ez), 0.035, mat, tip_thickness=0.008)


# --- Prop library: period exterior clutter -----------------------------------

def prop_materials() -> dict[str, bpy.types.Material]:
    return {
        "stone": make_noise_material("PropStone", (0.105, 0.102, 0.095), (0.180, 0.175, 0.160), scale=7.0),
        "wood": make_textured_material("PropWood", (0.075, 0.055, 0.034), (0.135, 0.100, 0.062), scale=(14.0, 14.0, 3.0)),
        "straw": make_noise_material("PropStraw", (0.190, 0.150, 0.075), (0.280, 0.230, 0.120), scale=10.0),
        "rope": make_material("PropRope", (0.095, 0.075, 0.048, 1.0)),
        "shoji": make_material("PropShoji", (0.560, 0.540, 0.480, 1.0)),
        "bushD": make_foliage_material("PropBushD", (0.048, 0.088, 0.042), (0.085, 0.135, 0.062)),
        "grass": make_material("PropGrass", (0.200, 0.240, 0.095, 1.0)),
    }


def add_prop_well(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    add_box(scene, "WellRing", *map_box((cx - 0.16, cy - 0.16, 0.0), (cx + 0.16, cy + 0.16, 0.22)), mats["stone"])
    add_box(scene, "WellHole", *map_box((cx - 0.10, cy - 0.10, 0.22), (cx + 0.10, cy + 0.10, 0.225)), mats["rope"])
    for side in (-0.14, 0.14):
        add_box(scene, f"WellPost{side}", *map_box((cx + side - 0.02, cy - 0.02, 0.0), (cx + side + 0.02, cy + 0.02, 0.62)), mats["wood"])
    low, high = map_box((cx - 0.22, cy - 0.12, 0.0), (cx + 0.22, cy + 0.12, 0.0))
    add_gable_roof(scene, "WellRoof", (low[0], low[1]), (high[0], high[1]), 0.62, 0.76, "x", mats["wood"])


def add_prop_lantern(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    stone = mats["stone"]
    add_box(scene, f"LanternBase{cx}", *map_box((cx - 0.09, cy - 0.09, 0.0), (cx + 0.09, cy + 0.09, 0.08)), stone)
    add_box(scene, f"LanternShaft{cx}", *map_box((cx - 0.035, cy - 0.035, 0.08), (cx + 0.035, cy + 0.035, 0.40)), stone)
    add_box(scene, f"LanternFire{cx}", *map_box((cx - 0.07, cy - 0.07, 0.40), (cx + 0.07, cy + 0.07, 0.54)), mats["shoji"])
    add_frustum(scene, f"LanternCap{cx}", (cx - 0.11, cy - 0.11), (cx + 0.11, cy + 0.11), 0.54, 0.64, 0.09, stone)


def add_prop_bale(scene: bpy.types.Scene, cx: float, cy: float, angle_x: bool, mats: dict) -> None:
    if angle_x:
        add_box(scene, f"Bale{cx}{cy}", *map_box((cx - 0.16, cy - 0.09, 0.0), (cx + 0.16, cy + 0.09, 0.17)), mats["straw"])
        for bx in (cx - 0.07, cx + 0.07):
            add_box(scene, f"BaleRope{bx}{cy}", *map_box((bx - 0.015, cy - 0.095, 0.0), (bx + 0.015, cy + 0.095, 0.175)), mats["rope"])
    else:
        add_box(scene, f"Bale{cx}{cy}", *map_box((cx - 0.09, cy - 0.16, 0.0), (cx + 0.09, cy + 0.16, 0.17)), mats["straw"])
        for by in (cy - 0.07, cy + 0.07):
            add_box(scene, f"BaleRope{cx}{by}", *map_box((cx - 0.095, by - 0.015, 0.0), (cx + 0.095, by + 0.015, 0.175)), mats["rope"])


def add_prop_barrel(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    add_frustum(scene, f"BarrelLow{cx}{cy}", (cx - 0.11, cy - 0.11), (cx + 0.11, cy + 0.11), 0.0, 0.14, -0.02, mats["wood"])
    add_frustum(scene, f"BarrelHigh{cx}{cy}", (cx - 0.13, cy - 0.13), (cx + 0.13, cy + 0.13), 0.14, 0.30, 0.03, mats["wood"])
    add_box(scene, f"BarrelBand{cx}{cy}", *map_box((cx - 0.135, cy - 0.135, 0.13), (cx + 0.135, cy + 0.135, 0.155)), mats["rope"])


def add_prop_firewood(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    for level, count in ((0.0, 4), (0.09, 3), (0.18, 2)):
        for i in range(count):
            off = (i - (count - 1) / 2) * 0.10
            add_box(scene, f"Log{cx}{level}{i}", *map_box((cx + off - 0.045, cy - 0.16, level), (cx + off + 0.045, cy + 0.16, level + 0.09)), mats["wood"])


def add_prop_bush(scene: bpy.types.Scene, cx: float, cy: float, mats: dict, scale: float = 1.0) -> None:
    light = make_foliage_material("PropBushL", (0.075, 0.125, 0.058), (0.130, 0.190, 0.090))
    add_leaf_cards(scene, f"Bush{cx}{cy}", (cx, cy, 0.14 * scale), (0.24 * scale, 0.24 * scale, 0.15 * scale), 46, [mats["bushD"], light], seed=cx * 7 + cy * 3 + 41, card_size=0.07 * scale)
    add_leaf_cards(scene, f"Bush2{cx}{cy}", (cx + 0.15 * scale, cy - 0.11 * scale, 0.10 * scale), (0.15 * scale, 0.15 * scale, 0.10 * scale), 26, [mats["bushD"], light], seed=cx * 5 + cy * 9 + 47, card_size=0.06 * scale)


def add_prop_weeds(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    tufts = [(0.0, 0.0), (0.12, -0.06), (-0.10, 0.08), (0.04, 0.13), (-0.13, -0.10)]
    for index, (tx, ty) in enumerate(tufts):
        height = 0.14 + (index % 3) * 0.04
        add_beam(scene, f"Weed{cx}{cy}{index}", (cx + tx, cy + ty, 0.0), (cx + tx + 0.03, cy + ty - 0.02, height), 0.018, mats["grass"])


def build_deco_bush(scene: bpy.types.Scene) -> None:
    """Yabu: wild bush clump. Canvas 64x56, anchor 32,40."""
    mats = prop_materials()
    add_prop_bush(scene, -0.05, 0.02, mats, scale=1.25)
    add_prop_weeds(scene, 0.2, -0.15, mats)


def build_deco_weeds(scene: bpy.types.Scene) -> None:
    """Roadside weeds. Canvas 64x48, anchor 32,32."""
    mats = prop_materials()
    add_prop_weeds(scene, -0.08, 0.0, mats)
    add_prop_weeds(scene, 0.14, 0.10, mats)


def build_rock(scene: bpy.types.Scene) -> None:
    """Weathered boulder cluster. Canvas 64x56, anchor 32,40."""
    stone = make_noise_material("BoulderStone", (0.100, 0.100, 0.098), (0.185, 0.182, 0.172), scale=7.0)
    add_frustum(scene, "RockBig", (-0.30, -0.16), (0.14, 0.30), 0.0, 0.42, 0.10, stone)
    add_frustum(scene, "RockSmall", (0.02, -0.32), (0.36, 0.04), 0.0, 0.26, 0.07, stone)
    add_frustum(scene, "RockTiny", (-0.38, 0.10), (-0.12, 0.34), 0.0, 0.16, 0.05, stone)


def build_reeds(scene: bpy.types.Scene) -> None:
    """Waterside reeds. Canvas 64x56, anchor 32,40."""
    stem = make_material("ReedStem", (0.115, 0.145, 0.052, 1.0))
    head = make_material("ReedHead", (0.240, 0.195, 0.105, 1.0))
    tufts = [(-0.24, -0.10), (-0.05, -0.24), (0.16, -0.06), (0.04, 0.14), (-0.18, 0.18), (0.24, 0.18)]
    for index, (sx, sy) in enumerate(tufts):
        height = 0.34 + (index % 3) * 0.05
        add_box(scene, f"Stem{index}", *map_box((sx - 0.012, sy - 0.012, 0.0), (sx + 0.012, sy + 0.012, height)), stem)
        add_box(scene, f"Head{index}", *map_box((sx - 0.02, sy - 0.02, height), (sx + 0.02, sy + 0.02, height + 0.09)), head)


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
    if CURRENT_STYLE == "pbr":
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, ramp.outputs["Color"])
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
    stone_ramp.color_ramp.elements[0].color = (0.150, 0.130, 0.100, 1.0)
    stone_ramp.color_ramp.elements[1].position = 0.8
    stone_ramp.color_ramp.elements[1].color = (0.265, 0.235, 0.185, 1.0)
    links.new(stone_noise.outputs["Fac"], stone_ramp.inputs["Fac"])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(stone_ramp.outputs["Color"], mix.inputs["A"])
    links.new(seam_ramp.outputs["Color"], mix.inputs["B"])
    if CURRENT_STYLE == "pbr":
        links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, mix.outputs["Result"])
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
    """Quality-standard materials (approved on the showcase kura)."""
    return {
        "plaster": make_showcase_plaster(),
        "wood": make_plank_material("Wood", (0.075, 0.055, 0.034), (0.140, 0.105, 0.065)),
        "dark_wood": make_plank_material("DarkWood", (0.046, 0.032, 0.019), (0.098, 0.072, 0.044)),
        "stone": make_ishigaki_material(),
        "roof": make_showcase_roof(),
        "roof_y": make_showcase_roof(ridge_axis="y"),
        "trim": make_material("RoofTrim", (0.045, 0.042, 0.045, 1.0)),
        "thatch": make_textured_material("Thatch", (0.150, 0.118, 0.062), (0.235, 0.190, 0.105), scale=(3.0, 3.0, 22.0)),
        "gravel": make_textured_material("YardGravel", (0.235, 0.210, 0.165), (0.320, 0.290, 0.235), scale=14.0),
        "dirt": make_textured_material("YardDirt", (0.195, 0.160, 0.115), (0.265, 0.225, 0.165), scale=9.0),
    }


def build_market_graybox(scene: bpy.types.Scene) -> None:
    """Ichiba (market) on a 4x3 lot: two open stall sheds along map x.

    Canvas 256x192, anchor 128,160. Low wooden sheds (ridge 1.3 units).
    """
    mats = building_material_set()
    add_yard_pad(scene, 4.0, 3.0, "gravel")
    add_gabled_house(scene, "StallNorth", (-3.5, -2.6), (-0.5, -1.75), 0.8, 1.3, "x", mats["wood"], mats["thatch"], roof_overhang=0.15)
    add_gabled_house(scene, "StallSouth", (-3.5, -1.25), (-0.5, -0.4), 0.8, 1.3, "x", mats["wood"], mats["thatch"], roof_overhang=0.15)
    # Market identifiers: an indigo nobori banner and noren cloth strips.
    cloth = make_material("MarketCloth", (0.075, 0.105, 0.200, 1.0))
    pole = mats["dark_wood"]
    add_box(scene, "BannerPole", *map_box((-0.36, -2.90, 0.0), (-0.30, -2.84, 1.65)), pole)
    add_box(scene, "Banner", *map_box((-0.335, -2.875, 0.85), (-0.10, -2.855, 1.58)), cloth)
    for index, sx in enumerate((-3.3, -2.55, -1.8, -1.05)):
        add_box(scene, f"Noren{index}", *map_box((sx, -0.395, 0.52), (sx + 0.55, -0.375, 0.78)), cloth)
    # Goods on display: rice bales, barrels and crates spilling into the lane.
    props = prop_materials()
    add_prop_bale(scene, -3.1, -1.52, True, props)
    add_prop_bale(scene, -2.7, -1.50, False, props)
    add_prop_bale(scene, -3.05, -0.22, True, props)
    add_prop_barrel(scene, -1.35, -1.52, props)
    add_prop_barrel(scene, -1.05, -1.48, props)
    add_prop_barrel(scene, -0.30, -2.30, props)
    for index, bx in enumerate((-2.2, -1.9)):
        add_box(scene, f"Crate{index}", *map_box((bx - 0.13, -1.62, 0.0), (bx + 0.13, -1.36, 0.24)), props["wood"])
    add_prop_weeds(scene, -3.75, -0.25, props)


def build_barracks_graybox(scene: bpy.types.Scene) -> None:
    """Heisha (barracks) on a 4x3 lot: one nagaya longhouse, drill yard south.

    Canvas 256x192, anchor 128,160. Single story (walls 0.9, ridge 1.65).
    """
    mats = building_material_set()
    add_yard_pad(scene, 4.0, 3.0, "dirt")
    add_box(scene, "NagayaPlinth", *map_box((-3.68, -2.58, 0.0), (-0.32, -1.32, 0.15)), mats["stone"])
    add_box(scene, "NagayaBody", *map_box((-3.6, -2.5, 0.15), (-0.4, -1.4, 0.92)), mats["plaster"])
    add_kawara_roof(scene, "NagayaRoof", (-3.78, -2.62), (-0.22, -1.28), 0.92, 1.40, "x", mats["roof"], mats["trim"], verge_material=mats["plaster"])
    # Openings: a sliding entry door and latticed windows on the yard face.
    rack = mats["dark_wood"]
    add_box(scene, "DoorFrame", *map_box((-2.24, -1.415, 0.15), (-1.76, -1.375, 0.82)), rack)
    add_box(scene, "DoorPanel", *map_box((-2.18, -1.405, 0.15), (-1.82, -1.385, 0.76)), mats["wood"])
    for index, (wx0, wx1) in enumerate(((-3.35, -2.85), (-1.35, -0.85))):
        add_box(scene, f"BWinFrame{index}", *map_box((wx0 - 0.04, -1.42, 0.42), (wx1 + 0.04, -1.38, 0.76)), rack)
        add_box(scene, f"BWin{index}", *map_box((wx0, -1.415, 0.46), (wx1, -1.385, 0.72)), mats["trim"])
        bar = wx0 + 0.05
        while bar < wx1 - 0.02:
            add_box(scene, f"BWinBar{index}{bar:.2f}", *map_box((bar, -1.41, 0.46), (bar + 0.035, -1.38, 0.72)), rack)
            bar += 0.10
    # Drill-yard clutter: spear rack, rice bales, firewood.
    add_box(scene, "RackBar", *map_box((-2.6, -0.72, 0.55), (-1.4, -0.68, 0.62)), rack)
    for px in (-2.58, -2.0, -1.46):
        add_box(scene, f"RackLeg{px}", *map_box((px, -0.72, 0.0), (px + 0.05, -0.68, 0.58)), rack)
    for sx in (-2.45, -2.25, -2.05, -1.85, -1.65):
        add_box(scene, f"Spear{sx}", *map_box((sx, -0.715, 0.1), (sx + 0.03, -0.685, 0.95)), rack)
    props = prop_materials()
    add_prop_bale(scene, -3.45, -0.55, False, props)
    add_prop_bale(scene, -3.42, -0.90, False, props)
    add_prop_firewood(scene, -0.55, -0.60, props)
    add_prop_weeds(scene, -0.30, -2.70, props)


def build_samurai_residence_graybox(scene: bpy.types.Scene) -> None:
    """Buke-yashiki: exposed-timber shoin house behind a wooden board fence,
    with an engawa, shoji panels and a small garden (pond, lantern, stepping
    stones, garden pine, well). Canvas 288x224, anchor 144,192."""
    mats = building_material_set()
    props = prop_materials()
    wood = mats["wood"]
    dark = mats["dark_wood"]
    add_yard_pad(scene, 4.0, 4.0, "gravel")

    # Itabei: wooden board fence with a narrow rain cap, gate gap on south.
    for name, low, high in (
        ("FenceN", (-3.95, -4.0, 0.0), (-0.05, -3.88, 0.52)),
        ("FenceW", (-4.0, -3.95, 0.0), (-3.88, -0.05, 0.52)),
        ("FenceE", (-0.12, -3.95, 0.0), (0.0, -0.05, 0.52)),
        ("FenceS1", (-3.95, -0.12, 0.0), (-2.35, 0.0, 0.52)),
        ("FenceS2", (-1.65, -0.12, 0.0), (-0.05, 0.0, 0.52)),
    ):
        add_box(scene, name, *map_box(low, high), dark)
    for cname, clow, chigh in (
        ("FCapN", (-3.99, -4.03), (-0.01, -3.85)),
        ("FCapW", (-4.03, -3.99), (-3.85, -0.01)),
        ("FCapE", (-0.15, -3.99), (0.03, -0.01)),
        ("FCapS1", (-3.99, -0.15), (-2.31, 0.03)),
        ("FCapS2", (-1.69, -0.15), (-0.01, 0.03)),
    ):
        add_box(scene, cname, *map_box((clow[0], clow[1], 0.52), (chigh[0], chigh[1], 0.575)), wood)

    # Main house (lowered): raised floor, posts + siding, shoji band.
    add_box(scene, "FloorFrame", *map_box((-3.30, -3.40, 0.0), (-1.10, -1.90, 0.26)), dark)
    add_box(scene, "MainBody", *map_box((-3.2, -3.3, 0.26), (-1.2, -2.0, 1.00)), wood)
    for index, sx in enumerate((-3.05, -2.62, -2.19, -1.76)):
        add_box(scene, f"ShojiS{index}", *map_box((sx, -2.03, 0.36), (sx + 0.34, -1.985, 0.88)), props["shoji"])
    for index, sy in enumerate((-3.10, -2.72)):
        add_box(scene, f"ShojiE{index}", *map_box((-1.23, sy, 0.36), (-1.185, sy + 0.30, 0.88)), props["shoji"])
    for px, py in ((-3.2, -2.0), (-2.55, -2.0), (-1.9, -2.0), (-1.2, -2.0), (-1.2, -2.65), (-1.2, -3.3)):
        add_box(scene, f"HousePost{px}{py}", *map_box((px - 0.045, py - 0.045, 0.26), (px + 0.045, py + 0.045, 1.00)), dark)
    add_box(scene, "Engawa", *map_box((-3.25, -2.0, 0.20), (-1.15, -1.72, 0.30)), props["wood"])
    for ex in (-3.15, -2.55, -1.95, -1.35):
        add_box(scene, f"EngawaPost{ex}", *map_box((ex - 0.03, -1.78, 0.0), (ex + 0.03, -1.72, 0.26)), dark)
    add_kawara_roof(scene, "MainRoof", (-3.42, -3.5), (-0.98, -1.8), 1.00, 1.58, "x", mats["roof"], mats["trim"], verge_material=dark)
    # Annex with a wooden shingle roof.
    add_box(scene, "AnnexBody", *map_box((-1.0, -2.6, 0.0), (-0.3, -1.9, 0.68)), dark)
    add_itabuki_roof(scene, "AnnexRoof", (-1.08, -2.68), (-0.22, -1.82), 0.68, 0.98, "y", dark, props["stone"])

    # Garden: small pond with stone rim, lantern, stepping stones, pine,
    # bushes; well against the north fence.
    pond = make_material("GardenPond", (0.040, 0.085, 0.105, 1.0))
    add_flat_quad(scene, "Pond", (-1.75, -1.35), (-0.85, -0.75), 0.012, pond)
    rim_stones = ((-1.8, -1.1), (-1.55, -1.42), (-1.1, -1.45), (-0.8, -1.2), (-0.82, -0.85), (-1.2, -0.68), (-1.65, -0.72))
    for index, (rx, ry) in enumerate(rim_stones):
        add_box(scene, f"PondRim{index}", *map_box((rx - 0.06, ry - 0.05, 0.0), (rx + 0.06, ry + 0.05, 0.075)), props["stone"])
    add_prop_lantern(scene, -2.05, -1.15, props)
    for index, (tx, ty) in enumerate(((-2.0, -0.45), (-2.15, -0.85), (-2.35, -1.3), (-2.6, -1.6))):
        add_box(scene, f"StepStone{index}", *map_box((tx - 0.09, ty - 0.07, 0.0), (tx + 0.09, ty + 0.07, 0.035)), props["stone"])
    add_prop_well(scene, -0.55, -3.35, props)
    add_prop_bush(scene, -3.5, -1.0, props)
    add_prop_bush(scene, -0.45, -1.75, props, scale=0.75)
    add_prop_weeds(scene, -3.6, -0.35, props)
    add_prop_weeds(scene, -0.3, -0.4, props)
    bark = props["wood"]
    add_beam(scene, "GardenPineTrunk", (-3.45, -1.35, 0.0), (-3.32, -1.22, 0.72), 0.07, bark)
    add_leaf_cards(scene, "GardenPinePad1", (-3.32, -1.22, 0.66), (0.24, 0.24, 0.08), 48, [props["bushD"]], seed=53.0, card_size=0.07)
    add_leaf_cards(scene, "GardenPinePad2", (-3.5, -1.42, 0.47), (0.17, 0.17, 0.06), 30, [props["bushD"]], seed=59.0, card_size=0.06)


def add_itabuki_roof(scene: bpy.types.Scene, name: str, low_map: tuple[float, float], high_map: tuple[float, float], base_z: float, ridge_z: float, ridge_axis: str, wood: bpy.types.Material, stone: bpy.types.Material) -> None:
    """Ishioki-itabuki: wooden plank roof weighted with rows of stones, the
    common townhouse roof before kawara spread."""
    x0, y0 = low_map
    x1, y1 = high_map
    low, high = map_box((x0, y0, 0.0), (x1, y1, 0.0))
    add_gable_roof(scene, f"{name}Surface", (low[0], low[1]), (high[0], high[1]), base_z, ridge_z, ridge_axis, wood)
    # Ridge board.
    if ridge_axis == "x":
        mid = (y0 + y1) / 2.0
        rlow, rhigh = map_box((x0 - 0.03, mid - 0.06, 0.0), (x1 + 0.03, mid + 0.06, 0.0))
    else:
        mid = (x0 + x1) / 2.0
        rlow, rhigh = map_box((mid - 0.06, y0 - 0.03, 0.0), (mid + 0.06, y1 + 0.03, 0.0))
    add_box(scene, f"{name}RidgeBoard", (rlow[0], rlow[1], ridge_z - 0.03), (rhigh[0], rhigh[1], ridge_z + 0.045), wood)
    # Weight stones scattered on both slopes in loose rows.
    import math as _math
    seed = sum(ord(c) for c in name)
    span = (x1 - x0) if ridge_axis == "x" else (y1 - y0)
    count = max(3, int(span / 0.34))
    slope_len = ((y1 - y0) if ridge_axis == "x" else (x1 - x0)) / 2.0
    rise = ridge_z - base_z
    for row, frac in ((0, 0.36), (1, 0.68)):
        for i in range(count):
            along = (i + 0.5) / count * span + 0.05 * _math.sin(seed + row * 9.1 + i * 5.7)
            offset = slope_len * frac
            z = base_z + rise * (1.0 - frac) * 0.92
            for side in (-1, 1):
                if ridge_axis == "x":
                    sx = x0 + along
                    sy = (y0 + y1) / 2.0 + side * offset
                else:
                    sx = (x0 + x1) / 2.0 + side * offset
                    sy = y0 + along
                add_box(scene, f"{name}Stone{row}{i}{side}", *map_box((sx - 0.055, sy - 0.045, z), (sx + 0.055, sy + 0.045, z + 0.07)), stone)


def build_town_block_graybox(scene: bpy.types.Scene) -> None:
    """Machi (town block) on a 6x6 lot: four machiya houses around a cross
    alley, one of them two-story.

    Canvas 416x304, anchor 208,272.
    """
    mats = building_material_set()
    add_yard_pad(scene, 6.0, 6.0, "dirt")

    houses = (
        # name, low, high, wall_top, ridge_top, axis, wall_mat, roof_kind
        ("MachiyaNW", (-5.6, -5.5), (-3.4, -4.0), 1.62, 2.02, "x", "plaster", "kawara"),
        ("MachiyaNE", (-2.6, -5.5), (-0.4, -4.1), 0.80, 1.32, "x", "wood", "itabuki"),
        ("MachiyaSW", (-5.6, -2.2), (-3.5, -0.7), 0.80, 1.26, "y", "dark_wood", "itabuki"),
        ("MachiyaSE", (-2.5, -2.3), (-0.4, -0.6), 0.80, 1.38, "y", "wood", "kawara"),
    )
    props = prop_materials()
    cloth = make_material("MachiyaNoren", (0.075, 0.105, 0.200, 1.0))
    for name, low, high, wall_top, ridge_top, axis, wall, roof_kind in houses:
        add_box(scene, f"{name}Body", *map_box((low[0], low[1], 0.0), (high[0], high[1], wall_top)), mats[wall])
        if roof_kind == "itabuki":
            add_itabuki_roof(scene, f"{name}Roof", (low[0] - 0.14, low[1] - 0.14), (high[0] + 0.14, high[1] + 0.14), wall_top, ridge_top, axis, mats["dark_wood"], props["stone"])
        else:
            roof_mat = mats["roof"] if axis == "x" else mats["roof_y"]
            # Wooden houses get wooden verge boards; only plastered walls
            # carry the white shikkui verge.
            verge = mats["plaster"] if wall == "plaster" else mats["dark_wood"]
            add_kawara_roof(
                scene,
                f"{name}Roof",
                (low[0] - 0.16, low[1] - 0.16),
                (high[0] + 0.16, high[1] + 0.16),
                wall_top,
                ridge_top,
                axis,
                roof_mat,
                mats["trim"],
                verge_material=verge,
            )
        # Street front: koshi lattice band, doorway, and a noren.
        fy = high[1]
        x0, x1 = low[0], high[0]
        door_x = (x0 + x1) / 2.0
        add_box(scene, f"{name}Door", *map_box((door_x - 0.20, fy - 0.01, 0.0), (door_x + 0.20, fy + 0.025, 0.66)), mats["dark_wood"])
        add_box(scene, f"{name}Noren", *map_box((door_x - 0.24, fy + 0.025, 0.46), (door_x + 0.24, fy + 0.045, 0.68)), cloth)
        for side, (kx0, kx1) in enumerate(((x0 + 0.12, door_x - 0.30), (door_x + 0.30, x1 - 0.12))):
            if kx1 - kx0 < 0.2:
                continue
            add_box(scene, f"{name}KoshiBack{side}", *map_box((kx0, fy - 0.005, 0.10), (kx1, fy + 0.015, 0.62)), mats["trim"])
            bar = kx0 + 0.03
            while bar < kx1 - 0.03:
                add_box(scene, f"{name}Koshi{side}{bar:.2f}", *map_box((bar, fy + 0.015, 0.10), (bar + 0.035, fy + 0.035, 0.62)), mats["dark_wood"])
                bar += 0.10
        if wall_top > 1.4:
            add_box(scene, f"{name}UpWin", *map_box((door_x - 0.35, fy - 0.005, 1.08), (door_x + 0.35, fy + 0.02, 1.36)), mats["trim"])
            bar = door_x - 0.31
            while bar < door_x + 0.31:
                add_box(scene, f"{name}UpBar{bar:.2f}", *map_box((bar, fy + 0.02, 1.08), (bar + 0.035, fy + 0.035, 1.36)), mats["plaster"])
                bar += 0.09
    # Clutter along the street fronts (screen-facing sides) where it reads.
    add_prop_barrel(scene, -3.15, -0.35, props)
    add_prop_barrel(scene, -2.9, -0.22, props)
    add_prop_bale(scene, -0.9, -0.3, True, props)
    add_prop_firewood(scene, -0.22, -1.5, props)
    add_prop_well(scene, -3.0, -3.15, props)
    add_prop_bale(scene, -0.25, -3.3, False, props)
    add_prop_weeds(scene, -5.55, -0.3, props)
    add_prop_weeds(scene, -0.35, -5.8, props)
    add_prop_bush(scene, -5.8, -6.05, props, scale=0.7)


def build_unit_engineer(scene: bpy.types.Scene) -> None:
    """Engineer figure, ~28px tall at unit scale. Canvas 48x64, anchor 24,52.48
    (matches the existing unit sprites). Ground contact at origin."""
    cloth = make_material("EngineerCloth", (0.30, 0.33, 0.28, 1.0))
    skin = make_material("EngineerSkin", (0.62, 0.48, 0.36, 1.0))
    hat = make_material("EngineerHat", (0.55, 0.47, 0.28, 1.0))
    tool = make_material("EngineerTool", (0.35, 0.27, 0.18, 1.0))

    add_box(scene, "Legs", *map_box((-0.09, -0.06, 0.0), (0.09, 0.06, 0.30)), cloth)
    add_box(scene, "Torso", *map_box((-0.11, -0.07, 0.30), (0.11, 0.07, 0.52)), cloth)
    add_box(scene, "Head", *map_box((-0.06, -0.06, 0.52), (0.06, 0.06, 0.64)), skin)
    # Straw hat: flat wide box + small crown.
    add_box(scene, "HatBrim", *map_box((-0.13, -0.13, 0.63), (0.13, 0.13, 0.66)), hat)
    add_box(scene, "HatTop", *map_box((-0.06, -0.06, 0.66), (0.06, 0.06, 0.71)), hat)
    # Shovel over the shoulder.
    add_box(scene, "ShovelShaft", *map_box((0.10, -0.02, 0.20), (0.14, 0.02, 0.72)), tool)
    add_box(scene, "ShovelBlade", *map_box((0.08, -0.04, 0.72), (0.16, 0.04, 0.82)), tool)


def build_wall_ladder(scene: bpy.types.Scene) -> None:
    """Siege ladder leaning over a wall cell, drawn as an overlay sprite on
    the laddered wall. Canvas 64x96, anchor 32,80 (same as the wall)."""
    wood = make_material("LadderWood", (0.52, 0.40, 0.24, 1.0))
    steps = 7
    for i in range(steps + 1):
        t = i / steps
        x = 0.38 - 0.48 * t
        y = 0.38 - 0.48 * t
        z = 1.28 * t
        add_box(scene, f"Rung{i}", *map_box((x - 0.05, y - 0.24, z), (x + 0.05, y + 0.24, z + 0.05)), wood)
    # Side rails hinted as slightly larger end rungs.
    add_box(scene, "BaseFoot", *map_box((0.34, 0.10, 0.0), (0.46, 0.66, 0.05)), wood)


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
    # Skirt roof gets tile trim color via mats below.
    add_box(scene, "Story1", *map_box((-1.72, -1.72, 0.95), (-0.28, -0.28, 1.85)), plaster)
    # Skirt roof between stories.
    add_box(scene, "Skirt", *map_box((-1.88, -1.88, 1.82), (-0.12, -0.12, 1.92)), roof)
    add_box(scene, "Story2", *map_box((-1.45, -1.45, 1.92), (-0.55, -0.55, 2.72)), plaster)
    # Open watch band under the top roof.
    add_box(scene, "WatchBand", *map_box((-1.48, -1.48, 2.52), (-0.52, -0.52, 2.72)), wood)
    # Watch slits (monomi windows) on both visible faces of the top storey.
    trim = mats["trim"]
    for sy in (-0.545, ):
        for wx in (-1.30, -1.02, -0.74):
            add_box(scene, f"Slit{wx}", *map_box((wx, sy - 0.02, 2.30), (wx + 0.14, sy + 0.02, 2.50)), trim)
    for sx in (-0.545, ):
        for wy in (-1.30, -1.02, -0.74):
            add_box(scene, f"SlitY{wy}", *map_box((sx - 0.02, wy, 2.30), (sx + 0.02, wy + 0.14, 2.50)), trim)
    add_kawara_roof(scene, "TopRoof", (-1.68, -1.62), (-0.32, -0.38), 2.72, 3.12, "x", roof, trim, verge_material=plaster)


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


def build_gate_wood(scene: bpy.types.Scene, axis: str, width: int, mask: str, doors_closed: bool = True) -> None:
    mats = building_material_set()
    wood, door, plaster, stone = mats["dark_wood"], mats["wood"], mats["plaster"], mats["stone"]

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

    if doors_closed:
        # Closed double doors between the pillars.
        low, high = gate_box(axis, -half + 0.38, half - 0.38, GATE_DOOR_THICKNESS / 2.0, 0.0, GATE_DOOR_HEIGHT)
        add_box(scene, "Doors", *map_box(low, high), door)
    else:
        # Open gate: door leaves folded back against the pillars.
        for side in (-1.0, 1.0):
            low, high = gate_box(axis, side * (half - 0.42), side * (half - 0.38), 0.36, 0.0, GATE_DOOR_HEIGHT)
            add_box(scene, f"OpenLeaf{side}", *map_box(low, high), door)
    # Kabuki lintel beam across the top.
    low, high = gate_box(axis, -half + 0.06, half - 0.06, 0.17, GATE_BEAM_BOTTOM, GATE_BEAM_TOP)
    add_box(scene, "Beam", *map_box(low, high), wood)

    # Kawara roof over the full span, ridge along the gate axis.
    roof_low, roof_high = gate_box(axis, -half - 0.12, half + 0.12, 0.42, 0.0, 0.0)
    ridge_axis = "x" if axis == "nw_se" else "y"
    roof_mat = mats["roof"] if ridge_axis == "x" else mats["roof_y"]
    add_kawara_roof(
        scene,
        "GateRoof",
        (min(roof_low[0], roof_high[0]), min(roof_low[1], roof_high[1])),
        (max(roof_low[0], roof_high[0]), max(roof_low[1], roof_high[1])),
        GATE_BEAM_TOP,
        GATE_ROOF_TOP,
        ridge_axis,
        roof_mat,
        mats["trim"],
        verge_material=plaster,
    )

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
        add_gable_roof(scene, f"Stub{name}Coping", (wlow[0], wlow[1]), (whigh[0], whigh[1]), WALL_BODY_TOP, WALL_COPING_TOP, ridge_axis, roof_mat)


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
    dirt = make_material("RoadDirt", (0.225, 0.190, 0.140, 1.0))
    build_surface_arm_kit(scene, mask, dirt, 0.014, 0.27)


def build_dry_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    floor = make_material("MoatFloor", (0.115, 0.095, 0.070, 1.0))
    bank = make_material("MoatBank", (0.215, 0.185, 0.140, 1.0))
    build_surface_arm_kit(scene, mask, floor, 0.010, 0.33, bank_material=bank)


def build_water_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    water = make_material("MoatWater", (0.045, 0.095, 0.125, 1.0))
    bank = make_material("MoatBank", (0.215, 0.185, 0.140, 1.0))
    build_surface_arm_kit(scene, mask, water, 0.010, 0.33, bank_material=bank)


def build_earth_bridge(scene: bpy.types.Scene) -> None:
    """Earthen causeway crossing along map x. Canvas 64x32, anchor 32,16."""
    dirt = make_material("CausewayDirt", (0.205, 0.175, 0.130, 1.0))
    add_box(scene, "Causeway", *map_box((-0.5, -0.30, 0.0), (0.5, 0.30, 0.07)), dirt)


def build_wood_bridge(scene: bpy.types.Scene) -> None:
    """Plank bridge crossing along map x with side rails."""
    plank = make_material("BridgePlank", (0.140, 0.100, 0.060, 1.0))
    rail = make_material("BridgeRail", (0.080, 0.058, 0.036, 1.0))
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
    gate = re.fullmatch(r"gate-wood-(closed|open)-(nw_se|ne_sw)-w([123])-([01]{4})", name)
    if gate is not None:
        state, axis, width, mask = gate.group(1), gate.group(2), int(gate.group(3)), gate.group(4)
        return lambda scene: build_gate_wood(scene, axis, width, mask, doors_closed=state == "closed")
    terrain = re.fullmatch(r"terrain-(grass|dirt|stone|water)-connected-([01]{4})", name)
    if terrain is not None:
        kind, mask = terrain.group(1), terrain.group(2)
        return lambda scene: build_terrain_mask(scene, kind, mask)
    flat = re.fullmatch(r"terrain-(grass|dirt|stone|water)-(base|variant)", name)
    if flat is not None:
        kind, variant = flat.group(1), flat.group(2) == "variant"
        return lambda scene: build_terrain_base(scene, kind, variant)
    return None


OUTLINE_THICKNESS = 0.028


def add_outline_hulls(scene: bpy.types.Scene) -> None:
    """Inverted-hull outlines for the toon style.

    Each mesh gets a slightly inflated copy with flipped normals whose
    material is dark on camera-facing polygons and transparent on backfacing
    ones, which in Cycles leaves only a thin silhouette ring visible. Flat
    ground pieces (terrain, pads) are skipped: outlining the ground reads as
    a grid, not as line art.
    """
    outline = bpy.data.materials.new("OutlineInk")
    outline.use_nodes = True
    nodes = outline.node_tree.nodes
    links = outline.node_tree.links
    nodes.clear()
    geometry = nodes.new("ShaderNodeNewGeometry")
    dark = nodes.new("ShaderNodeEmission")
    dark.inputs["Color"].default_value = (0.09, 0.07, 0.06, 1.0)
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(geometry.outputs["Backfacing"], mix.inputs["Fac"])
    links.new(dark.outputs["Emission"], mix.inputs[1])
    links.new(transparent.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])

    for obj in list(scene.collection.objects):
        if obj.type != "MESH" or obj.dimensions.z < 0.09:
            continue
        hull = obj.copy()
        hull.data = obj.data.copy()
        hull.data.materials.clear()
        hull.data.materials.append(outline)
        # Inflate along vertex normals and flip: a single shell whose
        # camera-facing side is transparent and whose far side draws the
        # silhouette ring. (Solidify would add an inner surface that covers
        # the object in ink.)
        mesh = hull.data
        offsets = [(v.co + v.normal * OUTLINE_THICKNESS) for v in mesh.vertices]
        for vertex, position in zip(mesh.vertices, offsets):
            vertex.co = position
        for polygon in mesh.polygons:
            polygon.flip()
        mesh.update()
        scene.collection.objects.link(hull)


MODEL_REGISTRY = {
    "calibration-tile": build_calibration_tile,
    "calibration-cube": build_calibration_cube,
    "calibration-grid": build_calibration_grid,
    "calibration-chirality": build_calibration_chirality,
    "terrain-grass-base": build_terrain_grass,
    "building-storehouse-graybox": build_storehouse_graybox,
    "building-storehouse-showcase": build_storehouse_showcase,
    "building-market-graybox": build_market_graybox,
    "building-barracks-graybox": build_barracks_graybox,
    "building-samurai-residence-graybox": build_samurai_residence_graybox,
    "building-town-block-graybox": build_town_block_graybox,
    "building-yagura-small-graybox": build_yagura_small_graybox,
    "building-farm-paddy": build_farm_paddy,
    "building-earth-bridge": build_earth_bridge,
    "building-wood-bridge": build_wood_bridge,
    "unit-engineer": build_unit_engineer,
    "wall-ladder": build_wall_ladder,
    "tree-pine": build_tree_pine,
    "tree-pine-2": lambda scene: build_tree_pine(scene, variant=1),
    "tree-cedar": build_tree_cedar,
    "tree-broadleaf": build_tree_broadleaf,
    "bamboo-cluster": build_bamboo,
    "rock-cluster": build_rock,
    "reeds": build_reeds,
    "deco-bush": build_deco_bush,
    "deco-weeds": build_deco_weeds,
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

    global CURRENT_STYLE
    CURRENT_STYLE = {"toon-cel": "toon", "painterly": "painterly"}.get(args.render_spec, "pbr")

    scene = reset_scene()
    builder(scene)
    if CURRENT_STYLE == "toon":
        add_outline_hulls(scene)
    supersample = max(1, args.supersample)
    canvas_w *= supersample
    canvas_h *= supersample
    anchor_x *= supersample
    anchor_y *= supersample
    setup_camera(scene, canvas_w, canvas_h, anchor_x, anchor_y, PX_PER_UNIT * supersample)

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
