"""Water shore/transition builders, copied from terrain.py for the isolated
shore registry, with one visual fix (patrol ledger V-06 白茶け):

The rim strip between grass and bank used the flat TERRAIN_STYLES["water"]
"edge" colour (0.50, 0.45, 0.34) — a pale sand band far lighter than any
surrounding grass, so the wavy-but-tile-pinned bank contour read as a hard
white diamond staircase along the procedural river. The rim now uses the
same noise-broken dry-earth/olive ramp as the trench (moat/river) rim, so
both water families share one bank colour language and the silhouette
feathers into the grass.
"""
from __future__ import annotations

import math

import bpy

from ..core import add_flat_quad, add_mesh, map_xy, make_material, finish_material
from ..materials import make_bank_material

TERRAIN_BLEED = 0.03
WATER_DEPTH = 0.17

BANK_DEPTH_BASE = 0.08
BANK_WET_LAP = 0.06
BANK_JITTER_A = 0.05
BANK_JITTER_B = 0.03


def _object_noise_ramp_material(
    name: str,
    stops: list[tuple[float, tuple[float, float, float]]],
    scale: float,
    seed: float,
    detail: float = 3.0,
) -> bpy.types.Material:
    """Map-anchored (object coords) noise through a multi-stop ramp; the 4D W
    seed varies the pattern per variant without moving the geometry."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["W"].default_value = seed * 5.13
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = stops[0][0]
    ramp.color_ramp.elements[0].color = (*stops[0][1], 1.0)
    ramp.color_ramp.elements[1].position = stops[-1][0]
    ramp.color_ramp.elements[1].color = (*stops[-1][1], 1.0)
    for position, color in stops[1:-1]:
        element = ramp.color_ramp.elements.new(position)
        element.color = (*color, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    finish_material(material, ramp.outputs["Color"])
    return material


def make_shore_water_material(name: str, seed: float = 0.0) -> bpy.types.Material:
    """Water field with a per-variant 4D seed: the legacy shared noise made
    v0/v1/v2 pixel-near-identical over the dominant water area (VAR-01)."""
    # Ramp steeper than the legacy 0.35/0.75 (trench V-01 precedent): the
    # low-contrast field left variant pairs under the VAR-01 threshold.
    return _object_noise_ramp_material(
        name,
        [
            (0.42, (0.032, 0.070, 0.098)),
            (0.68, (0.062, 0.115, 0.150)),
        ],
        scale=4.0, seed=seed, detail=4.0,
    )


def make_shore_grass_material(seed: float = 0.0) -> bpy.types.Material:
    """Transition-tile grass half with a per-variant seed: the shared
    GrassSurface noise diluted the variant diff below VAR-01 (the grass half
    dominates the outer transition tiles)."""
    return _object_noise_ramp_material(
        "TransGrass",
        [
            (0.35, (0.105, 0.165, 0.072)),
            (0.75, (0.225, 0.300, 0.135)),
        ],
        scale=6.0, seed=seed + 0.43, detail=4.0,
    )


def make_shore_rim_material(seed: float = 0.0) -> bpy.types.Material:
    """Shore rim strip (V-06): same ramp as the trench MoatRim so moat, river
    and terrain shore banks share one colour language."""
    return _object_noise_ramp_material(
        "ShoreRim",
        [
            (0.30, (0.118, 0.095, 0.064)),
            (0.56, (0.205, 0.168, 0.110)),
            (0.82, (0.128, 0.152, 0.076)),
        ],
        scale=7.5, seed=seed + 0.71,
    )


def _add_wavy_bank_run(
    scene: bpy.types.Scene,
    prefix: str,
    start: tuple[float, float],
    end: tuple[float, float],
    normal: tuple[float, float],
    segments: int,
    seed: float,
    rim: bpy.types.Material,
    bank: bpy.types.Material,
    wet: bpy.types.Material,
    extend_start: float = TERRAIN_BLEED,
    extend_end: float = TERRAIN_BLEED,
) -> None:
    """One wavy bank run from ``start`` to ``end`` (map coords on the land/
    water boundary), water on the ``normal`` side. Endpoints are pinned to
    BANK_DEPTH_BASE (jitter envelope reaches zero) and the first/last segment
    extends past the run ends by ``extend_*`` (in t units) into the bleed
    zone, so adjoining runs from neighbouring tiles always meet flush."""

    def jitter(i: int) -> float:
        raw = BANK_JITTER_A * math.sin(seed * 2.13 + i * 2.9) + BANK_JITTER_B * math.sin(seed * 5.7 + i * 6.1)
        envelope = math.sin(math.pi * i / segments)
        return raw * envelope

    dx, dy = end[0] - start[0], end[1] - start[1]
    for i in range(segments):
        t0 = i / segments
        t1 = (i + 1) / segments
        if i == 0:
            t0 = -extend_start
        if i == segments - 1:
            t1 = 1.0 + extend_end
        d0 = BANK_DEPTH_BASE + jitter(i)
        d1 = BANK_DEPTH_BASE + jitter(i + 1)
        p0 = (start[0] + dx * t0, start[1] + dy * t0)
        p1 = (start[0] + dx * t1, start[1] + dy * t1)
        q0 = (p0[0] + normal[0] * d0, p0[1] + normal[1] * d0)
        q1 = (p1[0] + normal[0] * d1, p1[1] + normal[1] * d1)
        add_mesh(scene, f"{prefix}Rim{i}",
            [(*map_xy(*p0), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*q1), 0.0), (*map_xy(*q0), 0.0)],
            [(0, 1, 2, 3)], rim)
        add_mesh(scene, f"{prefix}Bank{i}",
            [(*map_xy(*q0), 0.0), (*map_xy(*q1), 0.0), (*map_xy(*q1), -WATER_DEPTH), (*map_xy(*q0), -WATER_DEPTH)],
            [(0, 1, 2, 3)], bank)
        w0 = (q0[0] + normal[0] * BANK_WET_LAP, q0[1] + normal[1] * BANK_WET_LAP)
        w1 = (q1[0] + normal[0] * BANK_WET_LAP, q1[1] + normal[1] * BANK_WET_LAP)
        add_mesh(scene, f"{prefix}Wet{i}",
            [(*map_xy(*q0), -WATER_DEPTH + 0.004), (*map_xy(*q1), -WATER_DEPTH + 0.004),
             (*map_xy(*w1), -WATER_DEPTH + 0.004), (*map_xy(*w0), -WATER_DEPTH + 0.004)],
            [(0, 1, 2, 3)], wet)


def build_water_shore_tile(scene: bpy.types.Scene, mask: str, variant: int = 0) -> None:
    """Water tile with real depth: the water surface sits WATER_DEPTH below
    ground, and every land-facing edge gets a wavy bank (shared edge-crossing
    standard, see _add_wavy_bank_run)."""
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    rim = make_shore_rim_material(seed=float(variant))
    bank = make_bank_material()
    wet = make_material("ShoreWet", (0.030, 0.062, 0.080, 1.0))

    b = TERRAIN_BLEED
    water = make_shore_water_material("ShoreWater", seed=float(variant) * 1.37)
    add_flat_quad(scene, "Water", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), -WATER_DEPTH, water)

    runs = {
        "N": ((-0.5, -0.5), (0.5, -0.5), (0.0, 1.0)),
        "S": ((-0.5, 0.5), (0.5, 0.5), (0.0, -1.0)),
        "W": ((-0.5, -0.5), (-0.5, 0.5), (1.0, 0.0)),
        "E": ((0.5, -0.5), (0.5, 0.5), (-1.0, 0.0)),
    }
    for name in ("N", "E", "S", "W"):
        if same[name]:
            continue
        start, end, normal = runs[name]
        seed = sum(ord(c) for c in (name + str(variant))) + variant * 97
        _add_wavy_bank_run(scene, f"{name}{variant}", start, end, normal, 6, seed, rim, bank, wet)


def build_water_transition_tile(scene: bpy.types.Scene, corner: str, variant: int = 0) -> None:
    """Diagonal shore transition tile for the river's outer corners.

    ``corner`` names the two orthogonal WATER neighbours ("ne", "es", "sw",
    "wn"); the tile splits along the diagonal between the two land-adjacent
    tile corners: water surface (WATER_DEPTH below ground, flush with the
    neighbouring water tiles) on the corner side, grass at ground level on
    the other, separated by the same wavy rim/bank/wet-lap treatment as the
    straight shore tiles so the two read as one continuous painterly bank.
    """
    b = TERRAIN_BLEED
    water = make_shore_water_material("TransWater", seed=float(variant) * 1.37 + sum(ord(c) for c in corner) * 0.011)
    add_flat_quad(scene, "Water", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), -WATER_DEPTH, water)

    nw, ne, se, sw = (-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)
    inv = 1.0 / math.sqrt(2.0)
    if corner == "ne":
        a_pt, b_pt, normal = nw, se, (inv, -inv)
        land = [nw, se, (se[0], se[1] + b), (nw[0] - b, se[1] + b), (nw[0] - b, nw[1])]
    elif corner == "sw":
        a_pt, b_pt, normal = nw, se, (-inv, inv)
        land = [nw, se, (se[0] + b, se[1]), (se[0] + b, nw[1] - b), (nw[0], nw[1] - b)]
    elif corner == "es":
        a_pt, b_pt, normal = ne, sw, (inv, inv)
        land = [ne, sw, (sw[0] - b, sw[1]), (sw[0] - b, ne[1] - b), (ne[0], ne[1] - b)]
    elif corner == "wn":
        a_pt, b_pt, normal = ne, sw, (-inv, -inv)
        land = [ne, sw, (sw[0], sw[1] + b), (ne[0] + b, sw[1] + b), (ne[0] + b, ne[1])]
    else:
        raise ValueError(f"Unknown water transition corner: {corner}")

    grass = make_shore_grass_material(seed=float(variant) * 1.37 + sum(ord(c) for c in corner) * 0.011)
    add_mesh(scene, "Land", [(*map_xy(x, y), 0.0) for x, y in land], [tuple(range(len(land)))], grass)

    rim = make_shore_rim_material(seed=float(variant) + sum(ord(c) for c in corner) * 0.037)
    bank = make_bank_material()
    wet = make_material("TransWet", (0.030, 0.062, 0.080, 1.0))

    seed = sum(ord(c) for c in corner) + variant * 97
    _add_wavy_bank_run(scene, f"{corner}{variant}", a_pt, b_pt, normal, 8, seed, rim, bank, wet)


def build_water_transition_inner_tile(scene: bpy.types.Scene, corner: str, variant: int = 0) -> None:
    """Inner (concave) corner counterpart of build_water_transition_tile.

    ``corner`` names the two orthogonal LAND neighbours of this WATER cell
    ("ne", "es", "sw", "wn"). The tile draws exactly ONE straight wavy bank
    along the full horizontal land edge (shared edge-crossing standard) and
    nothing along the vertical land edge; see terrain.py for the full
    geometry-contract rationale."""
    if corner not in ("ne", "es", "sw", "wn"):
        raise ValueError(f"Unknown inner water transition corner: {corner}")
    # sy: sign of the horizontal land edge (N/S). Local map coords: +y = south.
    sy = -1.0 if corner in ("ne", "wn") else 1.0

    b = TERRAIN_BLEED
    water = make_shore_water_material("InnerTransWater", seed=float(variant) * 1.37 + sum(ord(c) for c in corner) * 0.017)
    add_flat_quad(scene, "Water", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), -WATER_DEPTH, water)

    rim = make_shore_rim_material(seed=float(variant) + sum(ord(c) for c in corner) * 0.053)
    bank = make_bank_material()
    wet = make_material("InnerTransWet", (0.030, 0.062, 0.080, 1.0))

    seed = sum(ord(c) for c in corner) + variant * 97
    _add_wavy_bank_run(
        scene, f"I{corner}{variant}", (-0.5, sy * 0.5), (0.5, sy * 0.5), (0.0, -sy), 6, seed, rim, bank, wet
    )
