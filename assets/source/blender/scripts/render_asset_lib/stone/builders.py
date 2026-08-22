"""Stone ridge (rocky outcrop) tile builders for the isolated stone registry.

Patrol ledger V-12: the legacy TERRAIN_STYLES["stone"] surface was a flat,
near-achromatic pale-gray noise ((0.36..0.54) linear, rendered mean sRGB
(156,155,152)) — far brighter than every surrounding terrain, so the
procedural stone ridge read as a white snow road zig-zagging across the
plain at far zoom. The tile also framed its open edges with a flat darker
quad, a hard straight band that reinforced the staircase silhouette.

This registry renders the ridge as warm weathered rock instead:
- voronoi slab cells with dark seams multiplied over a warm earthen-gray
  noise ramp (per-mask 4D seed so neighbouring ridge tiles do not repeat),
- a wavy dark-earth fringe at open edges (same corner-pinned strip language
  as grass/dirt boundary tiles) so the rock grounds into the grass instead
  of ending on a straight pale frame.
"""
from __future__ import annotations

import math

import bpy

from ..core import add_flat_quad, add_mesh, map_xy, finish_material

TERRAIN_BLEED = 0.03
FRINGE_BASE = 0.14
FRINGE_JITTER_A = 0.05
FRINGE_JITTER_B = 0.03


def make_rock_material(name: str, seed: float = 0.0) -> bpy.types.Material:
    """Warm weathered rock: voronoi slab cells (dark seams) over an earthen
    warm-gray noise ramp. The 4D W seed varies both fields per tile so the
    2-3 cell wide ridge does not tile visibly along its run."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")

    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["W"].default_value = seed * 5.13
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 4.0
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    rock_ramp = nodes.new("ShaderNodeValToRGB")
    rock_ramp.color_ramp.elements[0].position = 0.28
    rock_ramp.color_ramp.elements[0].color = (0.095, 0.084, 0.068, 1.0)
    rock_ramp.color_ramp.elements[1].position = 0.78
    rock_ramp.color_ramp.elements[1].color = (0.250, 0.226, 0.184, 1.0)
    links.new(noise.outputs["Fac"], rock_ramp.inputs["Fac"])

    voronoi = nodes.new("ShaderNodeTexVoronoi")
    voronoi.feature = "DISTANCE_TO_EDGE"
    voronoi.voronoi_dimensions = "4D"
    voronoi.inputs["W"].default_value = seed * 3.71
    voronoi.inputs["Scale"].default_value = 5.0
    links.new(coords.outputs["Object"], voronoi.inputs["Vector"])
    seam_ramp = nodes.new("ShaderNodeValToRGB")
    seam_ramp.color_ramp.elements[0].position = 0.0
    seam_ramp.color_ramp.elements[0].color = (0.30, 0.28, 0.25, 1.0)
    seam_ramp.color_ramp.elements[1].position = 0.11
    seam_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(voronoi.outputs["Distance"], seam_ramp.inputs["Fac"])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(rock_ramp.outputs["Color"], mix.inputs["A"])
    links.new(seam_ramp.outputs["Color"], mix.inputs["B"])
    finish_material(material, mix.outputs["Result"])
    return material


def make_rock_edge_material(name: str, seed: float = 0.0) -> bpy.types.Material:
    """Dark earth grounding fringe where the rock meets grass: noise-broken
    shadowed soil, clearly darker than both the rock and the grass field."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["W"].default_value = seed * 4.37
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 3.0
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[0].color = (0.060, 0.055, 0.040, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.130, 0.115, 0.082, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    finish_material(material, ramp.outputs["Color"])
    return material


def _add_fringe_run(
    scene: bpy.types.Scene,
    prefix: str,
    start: tuple[float, float],
    end: tuple[float, float],
    normal: tuple[float, float],
    segments: int,
    seed: float,
    material: bpy.types.Material,
    z: float,
) -> None:
    """Flat wavy fringe strip along one open tile edge, from the tile
    boundary to a jittered inner width, endpoints pinned and extended into
    the bleed zone (copied from terrain.py's grass/dirt fringe)."""

    def jitter(i: int) -> float:
        raw = FRINGE_JITTER_A * math.sin(seed * 2.13 + i * 2.9) + FRINGE_JITTER_B * math.sin(seed * 5.7 + i * 6.1)
        envelope = math.sin(math.pi * i / segments)
        return raw * envelope

    dx, dy = end[0] - start[0], end[1] - start[1]
    for i in range(segments):
        t0 = i / segments
        t1 = (i + 1) / segments
        if i == 0:
            t0 = -TERRAIN_BLEED
        if i == segments - 1:
            t1 = 1.0 + TERRAIN_BLEED
        w0 = FRINGE_BASE + jitter(i)
        w1 = FRINGE_BASE + jitter(i + 1)
        p0 = (start[0] + dx * t0, start[1] + dy * t0)
        p1 = (start[0] + dx * t1, start[1] + dy * t1)
        q0 = (p0[0] + normal[0] * w0, p0[1] + normal[1] * w0)
        q1 = (p1[0] + normal[0] * w1, p1[1] + normal[1] * w1)
        add_mesh(scene, f"{prefix}{i}",
            [(*map_xy(*p0), z), (*map_xy(*p1), z), (*map_xy(*q1), z), (*map_xy(*q0), z)],
            [(0, 1, 2, 3)], material)


def build_stone_tile(scene: bpy.types.Scene, mask: str) -> None:
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    y0 = -0.5 - (TERRAIN_BLEED if same["N"] else 0.0)
    x1 = 0.5 + (TERRAIN_BLEED if same["E"] else 0.0)
    y1 = 0.5 + (TERRAIN_BLEED if same["S"] else 0.0)
    x0 = -0.5 - (TERRAIN_BLEED if same["W"] else 0.0)
    seed = 1.0 + (int(mask, 2) % 16) * 0.61
    add_flat_quad(scene, "Surface", (x0, y0), (x1, y1), 0.0, make_rock_material("RockSurface", seed))

    edge_material = make_rock_edge_material("RockEdge", seed)
    runs = {
        "N": ((-0.5, -0.5), (0.5, -0.5), (0.0, 1.0)),
        "E": ((0.5, -0.5), (0.5, 0.5), (-1.0, 0.0)),
        "S": ((-0.5, 0.5), (0.5, 0.5), (0.0, -1.0)),
        "W": ((-0.5, -0.5), (-0.5, 0.5), (1.0, 0.0)),
    }
    for index, name in enumerate(("N", "E", "S", "W")):
        if same[name]:
            continue
        start, end, normal = runs[name]
        run_seed = ord(name) * 3.7 + (int(mask, 2) % 13) * 0.53
        _add_fringe_run(scene, f"F{name}", start, end, normal, 6, run_seed,
                        edge_material, 0.002 + 0.0005 * index)


def build_stone_base(scene: bpy.types.Scene) -> None:
    add_flat_quad(scene, "Surface", (-0.5, -0.5), (0.5, 0.5), 0.0,
                  make_rock_material("RockSurface", 9.7))
