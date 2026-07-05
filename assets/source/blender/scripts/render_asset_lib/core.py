"""Core primitives: constants, camera rig, mesh helpers, calibration models."""
from __future__ import annotations

import argparse
import math

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


def map_xy(map_x: float, map_y: float) -> tuple[float, float]:
    """Convert map-grid coordinates to Blender world coordinates."""
    return (map_x, -map_y)


def map_box(low_map: tuple[float, float, float], high_map: tuple[float, float, float]) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    """Convert a map-space box (low/high corners) to world-space low/high."""
    (x0, y0, z0), (x1, y1, z1) = low_map, high_map
    wx0, wy1 = map_xy(x0, y0)
    wx1, wy0 = map_xy(x1, y1)
    return (wx0, wy0, z0), (wx1, wy1, z1)


def add_flat_quad(scene: bpy.types.Scene, name: str, low_map: tuple[float, float], high_map: tuple[float, float], z: float, material: bpy.types.Material) -> None:
    x0, y0 = low_map
    x1, y1 = high_map
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    add_mesh(scene, name, [(*map_xy(x, y), z) for x, y in corners], [(0, 1, 2, 3)], material)


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


# Wall geometry constants shared by buildings and terrain kits.
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
