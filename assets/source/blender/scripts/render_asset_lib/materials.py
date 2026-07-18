"""Shared material factory functions used across domain modules."""
from __future__ import annotations

from . import core
from .core import finish_material, make_material

import bpy


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
    if core.CURRENT_STYLE == "pbr":
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, ramp.outputs["Color"])
    return material


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
    if core.CURRENT_STYLE == "pbr":
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, ramp.outputs["Color"])
    return material


# Terrain kit ----------------------------------------------------------------
TERRAIN_EDGE_WIDTH = 0.14

TERRAIN_STYLES = {
    "grass": {
        "surface": lambda: make_noise_material("GrassSurface", (0.105, 0.165, 0.072), (0.225, 0.300, 0.135)),
        "variant": lambda: make_noise_material("GrassVariant", (0.098, 0.155, 0.068), (0.210, 0.280, 0.128), scale=10.0),
        "edge": (0.215, 0.180, 0.125),
    },
    "dirt": {
        "surface": lambda: make_noise_material("DirtSurface", (0.125, 0.100, 0.068), (0.225, 0.190, 0.140)),
        "variant": lambda: make_noise_material("DirtVariant", (0.118, 0.094, 0.064), (0.210, 0.178, 0.132), scale=10.0),
        "edge": (0.185, 0.160, 0.120),
    },
    "stone": {
        "surface": lambda: make_noise_material("StoneSurface", (0.36, 0.37, 0.38), (0.52, 0.53, 0.54), scale=8.0),
        "variant": lambda: make_noise_material("StoneVariant", (0.34, 0.35, 0.36), (0.50, 0.51, 0.52), scale=12.0),
        "edge": (0.26, 0.27, 0.29),
    },
    "water": {
        "surface": lambda: make_noise_material("WaterSurface", (0.032, 0.070, 0.098), (0.062, 0.115, 0.150), scale=4.0),
        "variant": lambda: make_noise_material("WaterVariant", (0.030, 0.066, 0.094), (0.058, 0.110, 0.145), scale=7.0),
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

MACRO_TERRAIN_PALETTES = {
    # deep, mid, light, warm-accent (hue drift target)
    "grass": ((0.085, 0.140, 0.060), (0.150, 0.215, 0.095), (0.235, 0.310, 0.140), (0.225, 0.245, 0.105)),
    "dirt": ((0.110, 0.088, 0.058), (0.165, 0.135, 0.095), (0.235, 0.200, 0.150), (0.200, 0.140, 0.090)),
    "water": ((0.028, 0.062, 0.090), (0.048, 0.095, 0.128), (0.080, 0.135, 0.170), (0.038, 0.085, 0.095)),
}


def make_macro_terrain_material(terrain: str, variant: int, tx: int, ty: int) -> bpy.types.Material:
    """Terrain material anchored to the map grid, with painterly depth: a
    deep three-stop value ramp, a slow hue drift toward a warm accent, and
    a fine blade/grain speckle — the leaf-litter treatment applied to the
    open ground."""
    deep, mid, light, accent = MACRO_TERRAIN_PALETTES[terrain]
    material = bpy.data.materials.new(f"Macro{terrain}{variant}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0

    coords = nodes.new("ShaderNodeTexCoord")
    shift = nodes.new("ShaderNodeMapping")
    shift.inputs["Location"].default_value = (float(tx), float(-ty), 0.0)
    links.new(coords.outputs["Object"], shift.inputs["Vector"])

    def noise4d(scale, detail, w):
        node = nodes.new("ShaderNodeTexNoise")
        node.noise_dimensions = "4D"
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = detail
        node.inputs["W"].default_value = w
        links.new(shift.outputs["Vector"], node.inputs["Vector"])
        return node.outputs["Fac"]

    # Value structure: deep -> mid -> light across a three-stop ramp.
    fine = noise4d(6.0 if terrain != "water" else 3.6, 4.0, variant * 7.77)
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = (*deep, 1.0)
    ramp.color_ramp.elements[1].position = 0.80
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    mid_stop = ramp.color_ramp.elements.new(0.55)
    mid_stop.color = (*mid, 1.0)
    links.new(fine, ramp.inputs["Fac"])

    # Hue drift: slow noise mixes the base toward the warm accent so the
    # ground shifts in COLOR, not only in value.
    drift = noise4d(0.9, 2.0, variant * 7.77 + 11.3)
    drift_ramp = nodes.new("ShaderNodeValToRGB")
    drift_ramp.color_ramp.elements[0].position = 0.42
    drift_ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    drift_ramp.color_ramp.elements[1].position = 0.78
    drift_ramp.color_ramp.elements[1].color = (0.55, 0.55, 0.55, 1.0)
    links.new(drift, drift_ramp.inputs["Fac"])
    hue_mix = nodes.new("ShaderNodeMix")
    hue_mix.data_type = "RGBA"
    links.new(drift_ramp.outputs["Color"], hue_mix.inputs["Factor"])
    links.new(ramp.outputs["Color"], hue_mix.inputs["A"])
    accent_rgb = nodes.new("ShaderNodeRGB")
    accent_rgb.outputs[0].default_value = (*accent, 1.0)
    links.new(accent_rgb.outputs[0], hue_mix.inputs["B"])

    # Broad mottling across several tiles.
    broad = noise4d(0.33, 2.0, variant * 7.77 + 3.1)
    mottle = nodes.new("ShaderNodeMath")
    mottle.operation = "MULTIPLY_ADD"
    mottle.inputs[1].default_value = 0.26
    mottle.inputs[2].default_value = 0.86
    links.new(broad, mottle.inputs[0])

    # Fine blade/grain speckle (skipped for water).
    if terrain != "water":
        speckle = noise4d(24.0, 2.0, variant * 7.77 + 21.7)
        grain = nodes.new("ShaderNodeMath")
        grain.operation = "MULTIPLY_ADD"
        grain.inputs[1].default_value = 0.14
        grain.inputs[2].default_value = 0.93
        links.new(speckle, grain.inputs[0])
        both = nodes.new("ShaderNodeMath")
        both.operation = "MULTIPLY"
        links.new(mottle.outputs["Value"], both.inputs[0])
        links.new(grain.outputs["Value"], both.inputs[1])
        value_out = both.outputs["Value"]
    else:
        value_out = mottle.outputs["Value"]

    value_color = nodes.new("ShaderNodeCombineColor")
    for channel in ("Red", "Green", "Blue"):
        links.new(value_out, value_color.inputs[channel])
    mixed = nodes.new("ShaderNodeMix")
    mixed.data_type = "RGBA"
    mixed.blend_type = "MULTIPLY"
    mixed.inputs["Factor"].default_value = 1.0
    links.new(hue_mix.outputs["Result"], mixed.inputs["A"])
    links.new(value_color.outputs["Color"], mixed.inputs["B"])
    finish_material(material, mixed.outputs["Result"])
    return material


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
    if core.CURRENT_STYLE == "pbr":
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
    if core.CURRENT_STYLE == "pbr":
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


def make_showcase_plaster(
    name: str = "ShowcasePlaster",
    *,
    dark: tuple[float, float, float] = (0.485, 0.445, 0.365),
    light: tuple[float, float, float] = (0.615, 0.575, 0.485),
) -> bpy.types.Material:
    """Aged plaster: subdued warm base, painterly blotches, and vertical
    rain-streak grime (noise stretched along z)."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 2.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (*light, 1.0)
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


def make_showcase_roof(
    ridge_axis: str = "x",
    *,
    name: str = "ShowcaseRoof",
    base_dark: tuple[float, float, float] = (0.052, 0.048, 0.046),
    base_light: tuple[float, float, float] = (0.125, 0.120, 0.115),
    mud: tuple[float, float, float] = (0.075, 0.058, 0.038),
    columns: float = 9.0,
    courses: float = 15.0,
    seam: tuple[float, float, float] = (0.42, 0.40, 0.40),
    grime_strength: float = 0.55,
) -> bpy.types.Material:
    """Kawara roof calibrated to the tenshu reference: warm dark tiles, tile
    COLUMNS running down the slope (sanigawara rows), horizontal course
    steps, per-column value jitter, and mud grime pooling in the joints."""
    material = bpy.data.materials.new(name)
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
    col.inputs[1].default_value = columns
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
    seam_element = col_shade.color_ramp.elements.new(0.46)
    seam_element.color = (*seam, 1.0)
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
    course.inputs[1].default_value = courses
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
    base_ramp.color_ramp.elements[0].color = (*base_dark, 1.0)
    base_ramp.color_ramp.elements[1].position = 0.75
    base_ramp.color_ramp.elements[1].color = (*base_light, 1.0)
    links.new(base_noise.outputs["Fac"], base_ramp.inputs["Fac"])

    # Mud grime patches.
    grime_noise = nodes.new("ShaderNodeTexNoise")
    grime_noise.inputs["Scale"].default_value = 4.5
    grime_noise.inputs["Detail"].default_value = 3.0
    grime_fac = nodes.new("ShaderNodeValToRGB")
    grime_fac.color_ramp.elements[0].position = 0.42
    grime_fac.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    grime_fac.color_ramp.elements[1].position = 0.72
    grime_fac.color_ramp.elements[1].color = (grime_strength, grime_strength, grime_strength, 1.0)
    links.new(grime_noise.outputs["Fac"], grime_fac.inputs["Fac"])
    grimed = nodes.new("ShaderNodeMix")
    grimed.data_type = "RGBA"
    links.new(grime_fac.outputs["Color"], grimed.inputs["Factor"])
    links.new(base_ramp.outputs["Color"], grimed.inputs["A"])
    mud_node = nodes.new("ShaderNodeRGB")
    mud_node.outputs[0].default_value = (*mud, 1.0)
    links.new(mud_node.outputs[0], grimed.inputs["B"])

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
    jitter = math_node("MULTIPLY_ADD", fringe_noise.outputs["Fac"], 0.62, -0.31)
    visible = math_node("GREATER_THAN", math_node("ADD", math_node("MULTIPLY", edge, 2.4), jitter), 0.14)

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
    "gravel": ((0.140, 0.126, 0.096), (0.215, 0.196, 0.155)),
    "dirt": ((0.118, 0.096, 0.066), (0.185, 0.155, 0.112)),
}


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


def make_mud_material(name: str = "RoadMud") -> bpy.types.Material:
    """Trodden mud: deep wet browns, a slow dampness mottle and fine grit."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    fine = nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 13.0
    fine.inputs["Detail"].default_value = 4.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.32
    ramp.color_ramp.elements[0].color = (0.070, 0.054, 0.036, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.155, 0.125, 0.090, 1.0)
    links.new(fine.outputs["Fac"], ramp.inputs["Fac"])
    damp = nodes.new("ShaderNodeTexNoise")
    damp.inputs["Scale"].default_value = 1.6
    damp.inputs["Detail"].default_value = 2.0
    damp_band = nodes.new("ShaderNodeMath")
    damp_band.operation = "MULTIPLY_ADD"
    damp_band.inputs[1].default_value = 0.30
    damp_band.inputs[2].default_value = 0.76
    links.new(damp.outputs["Fac"], damp_band.inputs[0])
    damp_color = nodes.new("ShaderNodeCombineColor")
    for channel in ("Red", "Green", "Blue"):
        links.new(damp_band.outputs["Value"], damp_color.inputs[channel])
    mixed = nodes.new("ShaderNodeMix")
    mixed.data_type = "RGBA"
    mixed.blend_type = "MULTIPLY"
    mixed.inputs["Factor"].default_value = 1.0
    links.new(ramp.outputs["Color"], mixed.inputs["A"])
    links.new(damp_color.outputs["Color"], mixed.inputs["B"])
    finish_material(material, mixed.outputs["Result"])
    return material


def make_gate_ground_material(axis: str = "nw_se") -> bpy.types.Material:
    """Trodden earth under gates. Palette matches the terrain dirt tiles
    (DirtSurface) so the gate sits naturally on dirt ground; the noise is
    stretched along the direction of travel so it reads as faint ruts and
    footpath wear — no masonry joints or tile seams."""
    material = bpy.data.materials.new(f"GateGround_{axis}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0

    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    # Gate span is map-x for nw_se (travel along world y) and map-y for
    # ne_sw (travel along world x): compress the noise across the passage,
    # stretch it along the walking direction.
    if axis == "nw_se":
        mapping.inputs["Scale"].default_value = (16.0, 3.0, 6.0)
    else:
        mapping.inputs["Scale"].default_value = (3.0, 16.0, 6.0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.0
    noise.inputs["Detail"].default_value = 3.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.34
    ramp.color_ramp.elements[0].color = (0.125, 0.100, 0.068, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (0.225, 0.190, 0.140, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])

    # Faint dampness mottle (weathering under foot traffic), low contrast.
    damp = nodes.new("ShaderNodeTexNoise")
    damp.inputs["Scale"].default_value = 2.2
    damp.inputs["Detail"].default_value = 2.0
    damp_band = nodes.new("ShaderNodeMath")
    damp_band.operation = "MULTIPLY_ADD"
    damp_band.inputs[1].default_value = 0.18
    damp_band.inputs[2].default_value = 0.86
    links.new(damp.outputs["Fac"], damp_band.inputs[0])
    damp_color = nodes.new("ShaderNodeCombineColor")
    for channel in ("Red", "Green", "Blue"):
        links.new(damp_band.outputs["Value"], damp_color.inputs[channel])
    mixed = nodes.new("ShaderNodeMix")
    mixed.data_type = "RGBA"
    mixed.blend_type = "MULTIPLY"
    mixed.inputs["Factor"].default_value = 1.0
    links.new(ramp.outputs["Color"], mixed.inputs["A"])
    links.new(damp_color.outputs["Color"], mixed.inputs["B"])
    if core.CURRENT_STYLE == "pbr":
        links.new(mixed.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, mixed.outputs["Result"])
    return material


def make_holdout_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Holdout")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    holdout = nodes.new("ShaderNodeHoldout")
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(holdout.outputs["Holdout"], output.inputs["Surface"])
    return material


def make_bank_material(offset: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> bpy.types.Material:
    """Excavated earth bank: horizontal strata, embedded stones, damp base.
    offset shifts the noise field in map units so tiles phased along a run
    continue the same texture; seed varies it for non-straight masks."""
    material = bpy.data.materials.new("BankEarth")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    coords = nodes.new("ShaderNodeTexCoord")
    shift = nodes.new("ShaderNodeMapping")
    shift.inputs["Location"].default_value = (offset[0], -offset[1], 0.0)
    links.new(coords.outputs["Object"], shift.inputs["Vector"])
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(shift.outputs["Vector"], separate.inputs["Vector"])

    base_noise = nodes.new("ShaderNodeTexNoise")
    base_noise.noise_dimensions = "4D"
    base_noise.inputs["W"].default_value = seed * 5.13
    base_noise.inputs["Scale"].default_value = 9.0
    base_noise.inputs["Detail"].default_value = 3.0
    links.new(shift.outputs["Vector"], base_noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.32
    ramp.color_ramp.elements[0].color = (0.062, 0.050, 0.036, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.135, 0.110, 0.078, 1.0)
    links.new(base_noise.outputs["Fac"], ramp.inputs["Fac"])

    # Horizontal strata bands down the face.
    strata = nodes.new("ShaderNodeMath")
    strata.operation = "MULTIPLY"
    strata.inputs[1].default_value = 22.0
    links.new(separate.outputs["Z"], strata.inputs[0])
    strata_f = nodes.new("ShaderNodeMath")
    strata_f.operation = "FRACT"
    links.new(strata.outputs["Value"], strata_f.inputs[0])
    strata_band = nodes.new("ShaderNodeMath")
    strata_band.operation = "MULTIPLY_ADD"
    strata_band.inputs[1].default_value = 0.18
    strata_band.inputs[2].default_value = 0.86
    links.new(strata_f.outputs["Value"], strata_band.inputs[0])

    # Embedded stones: sparse voronoi cells brightened.
    stones = nodes.new("ShaderNodeTexVoronoi")
    stones.voronoi_dimensions = "4D"
    stones.inputs["W"].default_value = seed * 3.71
    stones.inputs["Scale"].default_value = 16.0
    links.new(shift.outputs["Vector"], stones.inputs["Vector"])
    stone_ramp = nodes.new("ShaderNodeValToRGB")
    stone_ramp.color_ramp.interpolation = "CONSTANT"
    stone_ramp.color_ramp.elements[0].position = 0.0
    stone_ramp.color_ramp.elements[0].color = (1.35, 1.32, 1.25, 1.0)
    stone_ramp.color_ramp.elements[1].position = 0.14
    stone_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(stones.outputs["Distance"], stone_ramp.inputs["Fac"])

    strata_color = nodes.new("ShaderNodeCombineColor")
    for channel in ("Red", "Green", "Blue"):
        links.new(strata_band.outputs["Value"], strata_color.inputs[channel])

    def multiply(a, b):
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
        node.blend_type = "MULTIPLY"
        node.inputs["Factor"].default_value = 1.0
        links.new(a, node.inputs["A"])
        links.new(b, node.inputs["B"])
        return node.outputs["Result"]

    shaded = multiply(ramp.outputs["Color"], strata_color.outputs["Color"])
    shaded = multiply(shaded, stone_ramp.outputs["Color"])
    finish_material(material, shaded)
    return material


def make_trench_surface_material(water: bool, offset: tuple[float, float], seed: float) -> bpy.types.Material:
    """Trench floor / moat water with a map-anchored noise field."""
    if water:
        dark, light, scale = (0.022, 0.052, 0.075), (0.045, 0.088, 0.115), 4.0
    else:
        dark, light, scale = (0.058, 0.046, 0.032), (0.105, 0.085, 0.060), 7.0
    material = bpy.data.materials.new("TrenchSurface")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    shift = nodes.new("ShaderNodeMapping")
    shift.inputs["Location"].default_value = (offset[0], -offset[1], 0.0)
    links.new(coords.outputs["Object"], shift.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["W"].default_value = seed * 7.77
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0
    links.new(shift.outputs["Vector"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    finish_material(material, ramp.outputs["Color"])
    return material
