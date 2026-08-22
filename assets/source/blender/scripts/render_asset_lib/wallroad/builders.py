"""Wall-plaster / road straight-run phase builders (patrol ledger V-05).

The static registry renders one sprite per connection mask, so the Ogaki
sōbori walls and main roads tile 50+ identical straights (composite-lint
REP debt). This registry adds p1..p3 phases for the straight masks
(0101/1010) only. Geometry is copied verbatim from buildings.py
build_wall_plaster_mask / terrain.py build_surface_arm_kit; the phases
diverge in material fields only:

- plaster: blotch/streak noise offset per phase + grime-density bias
  (ramp positions), so each phase carries its own stain pattern
- coping kawara: per-phase grime_strength / tone inside the family
  envelope (the coping is the map-scale-visible band — VAR-02)
- road mud: mottle/damp noise offset + damp brightness bias, plus a
  per-phase wheel-rut band so phases differ at map scale

Targets VAR-01 (meanAbsDiff >= 12 vs the static base sprite).
"""
from __future__ import annotations

import bpy

from ..core import (
    add_box, add_gable_roof, add_mesh, finish_material, make_material,
    map_box, map_xy,
    WALL_DIRECTIONS, wall_arm_box,
    WALL_BASE_THICKNESS, WALL_BASE_HEIGHT, WALL_BODY_THICKNESS,
    WALL_BODY_TOP, WALL_COPING_THICKNESS, WALL_COPING_TOP, WALL_EPSILON,
)
from ..materials import make_ishigaki_material, make_showcase_roof

# Per-phase parameter tables. Phase 0 is the static base sprite; entries
# here are indexed by phase-1. Values stay inside the family envelope so a
# phased run reads as one weathered wall/road, not a striped one.
_PLASTER_BLOTCH_POS = (0.14, 0.36, 0.22)
_PLASTER_STREAK_POS = (0.38, 0.18, 0.33)
# The 1010 sprite shows a large plaster face, so tone/streak-darkness also
# vary per phase (clean / heavily-grimed / warm-aged) within the family
# envelope — field offsets alone left 1010 under the VAR-01 floor.
_PLASTER_DARK = ((0.735, 0.590, 0.360), (0.630, 0.485, 0.285), (0.745, 0.570, 0.310))
_PLASTER_STREAK_DARK = ((0.79, 0.76, 0.68), (0.63, 0.60, 0.53), (0.76, 0.70, 0.56))
_COPING_GRIME = (0.40, 0.70, 0.62)
_COPING_LIGHT = ((0.146, 0.117, 0.078), (0.113, 0.089, 0.059), (0.138, 0.096, 0.060))
_COPING_SEAM = ((0.46, 0.38, 0.27), (0.33, 0.27, 0.19), (0.46, 0.36, 0.22))
# Shifting the kawara column/course counts moves every tile seam, which
# decorrelates the coping band far more effectively than tone alone (the
# coping is most of the wall's visible pixels at map scale).
_COPING_COLUMNS = (8.0, 10.0, 9.5)
_COPING_COURSES = (14.0, 16.0, 13.0)
_MUD_DAMP_BASE = (0.72, 0.80, 0.76)
_MUD_DARK_POS = (0.28, 0.36, 0.32)


def _offset_vector(nodes, links, noise_node, dx: float, dy: float) -> None:
    """Feed object coords shifted by (dx, dy) into a noise node's Vector
    input, decorrelating its field from the base sprite's."""
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value = (dx, dy, 0.0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise_node.inputs["Vector"])


def make_phased_plaster(phase: int) -> bpy.types.Material:
    """make_showcase_plaster twin with a per-phase stain field."""
    dark, light = _PLASTER_DARK[phase - 1], (0.870, 0.690, 0.395)
    material = bpy.data.materials.new(f"WallPlasterP{phase}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 2.0
    _offset_vector(nodes, links, noise, 3.7 * phase, 1.9 * phase)
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = _PLASTER_BLOTCH_POS[phase - 1]
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])

    coords = nodes.new("ShaderNodeTexCoord")
    stretch = nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (9.0, 9.0, 0.7)
    stretch.inputs["Location"].default_value = (5.3 * phase, 2.6 * phase, 0.0)
    links.new(coords.outputs["Object"], stretch.inputs["Vector"])
    streaks = nodes.new("ShaderNodeTexNoise")
    streaks.inputs["Scale"].default_value = 1.0
    streaks.inputs["Detail"].default_value = 2.0
    links.new(stretch.outputs["Vector"], streaks.inputs["Vector"])
    streak_ramp = nodes.new("ShaderNodeValToRGB")
    streak_ramp.color_ramp.interpolation = "EASE"
    streak_ramp.color_ramp.elements[0].position = _PLASTER_STREAK_POS[phase - 1]
    streak_ramp.color_ramp.elements[0].color = (*_PLASTER_STREAK_DARK[phase - 1], 1.0)
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


def make_phased_coping(phase: int) -> bpy.types.Material:
    return make_showcase_roof(
        "x",
        name=f"WallCopingP{phase}",
        base_light=_COPING_LIGHT[phase - 1],
        columns=_COPING_COLUMNS[phase - 1],
        courses=_COPING_COURSES[phase - 1],
        seam=_COPING_SEAM[phase - 1],
        grime_strength=_COPING_GRIME[phase - 1],
    )


def build_wall_plaster_phase(scene: bpy.types.Scene, mask: str, phase: int) -> None:
    """Straight-mask twin of build_wall_plaster_mask with phased materials."""
    plaster = make_phased_plaster(phase)
    stone = make_ishigaki_material()
    coping = make_phased_coping(phase)

    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    active = [name for name, on in bits.items() if on]

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


def make_phased_mud(phase: int) -> bpy.types.Material:
    """make_mud_material twin with a per-phase mottle field."""
    material = bpy.data.materials.new(f"RoadMudP{phase}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    fine = nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 13.0
    fine.inputs["Detail"].default_value = 4.0
    _offset_vector(nodes, links, fine, 7.9 * phase, 4.3 * phase)
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = _MUD_DARK_POS[phase - 1]
    ramp.color_ramp.elements[0].color = (0.070, 0.054, 0.036, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.155, 0.125, 0.090, 1.0)
    links.new(fine.outputs["Fac"], ramp.inputs["Fac"])
    damp = nodes.new("ShaderNodeTexNoise")
    damp.inputs["Scale"].default_value = 1.6
    damp.inputs["Detail"].default_value = 2.0
    _offset_vector(nodes, links, damp, 2.9 * phase, 1.7 * phase)
    damp_band = nodes.new("ShaderNodeMath")
    damp_band.operation = "MULTIPLY_ADD"
    damp_band.inputs[1].default_value = 0.30
    damp_band.inputs[2].default_value = _MUD_DAMP_BASE[phase - 1]
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


def build_road_phase(scene: bpy.types.Scene, mask: str, phase: int) -> None:
    """Straight-mask twin of build_road_mask (via build_surface_arm_kit)
    with phased mud plus a shallow wheel-rut pair whose lateral placement
    shifts per phase — a texture-only change is sub-visible at 64px."""
    import math as _math

    floor_material = make_phased_mud(phase)
    floor_top = 0.014
    arm_half = 0.27

    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    active = [name for name, on in bits.items() if on]

    pad_half = arm_half + 0.02
    disc = []
    for i in range(16):
        angle = i / 16 * 2 * _math.pi
        disc.append((*map_xy(pad_half * 1.12 * _math.cos(angle), pad_half * 1.12 * _math.sin(angle)), floor_top))
    add_mesh(scene, "CenterPad", disc, [tuple(range(16))], floor_material)
    for index, name in enumerate(active):
        direction = WALL_DIRECTIONS[name]
        inset = WALL_EPSILON * (index + 1)
        low, high = wall_arm_box(direction, arm_half - inset, 0.0, floor_top - inset)
        add_box(scene, f"Floor{name}", *map_box(low, high), floor_material)

    rut = make_material("RoadRut", (0.058, 0.044, 0.030, 1.0))
    rut_offset = (0.10, 0.16, 0.13)[phase - 1]
    rut_len = 0.42
    rut_shift = (-0.07, 0.05, 0.11)[phase - 1]
    axis_x = mask == "0101"
    for side in (-1.0, 1.0):
        center_along = rut_shift * side
        lateral = side * rut_offset
        if axis_x:
            low = (center_along - rut_len / 2.0, lateral - 0.028, floor_top)
            high = (center_along + rut_len / 2.0, lateral + 0.028, floor_top + 0.003)
        else:
            low = (lateral - 0.028, center_along - rut_len / 2.0, floor_top)
            high = (lateral + 0.028, center_along + rut_len / 2.0, floor_top + 0.003)
        add_box(scene, f"Rut{side}", *map_box(low, high), rut)
