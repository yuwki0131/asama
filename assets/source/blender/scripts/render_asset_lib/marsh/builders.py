"""Marsh (wetland) tile builders for the isolated marsh registry.

Painterly reading target: low wet ground between grass and open water —
dark mud flats, still-water pools catching a dull sky sheen, and olive
sedge hummocks breaking the surface. Clearly darker and wetter than the
grass field (LUM-02 budget: opaque mean well below 150; wetland sits
naturally around 60-90), clearly NOT the blue of moat/river water so it
never reads as a flooded cell.

Composition per tile (all 4D-seeded so runs of marsh do not visibly tile):
- base: warm dark wet-earth noise ramp,
- sedge hummocks: mid-scale noise patches of muted olive lifted over the mud,
- pools: large-scale noise low-areas filled with dark blue-green still water
  (soft MapRange threshold so pool shorelines stay organic),
- open edges (mask 0 sides): a wavy dark wet-earth fringe strip (same
  corner-pinned language as the grass/dirt/stone boundary tiles) so marsh
  grounds into grass without a straight seam.
"""
from __future__ import annotations

import math

import bpy

from ..core import add_flat_quad, add_mesh, map_xy, finish_material

TERRAIN_BLEED = 0.03
# Wide dark fringe: the wet ground bleeds into the grass so the diamond tile
# silhouette stops reading as a pasted board (L2/Astra iteration-2 feedback).
FRINGE_BASE = 0.20
FRINGE_JITTER_A = 0.07
FRINGE_JITTER_B = 0.04


def make_marsh_material(name: str, seed: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")

    # Base: warm dark wet earth.
    mud_noise = nodes.new("ShaderNodeTexNoise")
    mud_noise.noise_dimensions = "4D"
    mud_noise.inputs["W"].default_value = seed * 5.13
    mud_noise.inputs["Scale"].default_value = 7.0
    mud_noise.inputs["Detail"].default_value = 4.0
    links.new(coords.outputs["Object"], mud_noise.inputs["Vector"])
    mud_ramp = nodes.new("ShaderNodeValToRGB")
    mud_ramp.color_ramp.elements[0].position = 0.30
    mud_ramp.color_ramp.elements[0].color = (0.052, 0.046, 0.032, 1.0)
    mud_ramp.color_ramp.elements[1].position = 0.75
    mud_ramp.color_ramp.elements[1].color = (0.128, 0.112, 0.078, 1.0)
    links.new(mud_noise.outputs["Fac"], mud_ramp.inputs["Fac"])

    # Sedge hummocks: muted olive patches over the mud.
    sedge_noise = nodes.new("ShaderNodeTexNoise")
    sedge_noise.noise_dimensions = "4D"
    sedge_noise.inputs["W"].default_value = seed * 3.71 + 11.0
    sedge_noise.inputs["Scale"].default_value = 9.0
    sedge_noise.inputs["Detail"].default_value = 3.0
    links.new(coords.outputs["Object"], sedge_noise.inputs["Vector"])
    sedge_ramp = nodes.new("ShaderNodeValToRGB")
    sedge_ramp.color_ramp.elements[0].position = 0.35
    sedge_ramp.color_ramp.elements[0].color = (0.070, 0.086, 0.036, 1.0)
    sedge_ramp.color_ramp.elements[1].position = 0.80
    sedge_ramp.color_ramp.elements[1].color = (0.126, 0.148, 0.066, 1.0)
    links.new(sedge_noise.outputs["Fac"], sedge_ramp.inputs["Fac"])
    sedge_mask = nodes.new("ShaderNodeMapRange")
    sedge_mask.inputs["From Min"].default_value = 0.52
    sedge_mask.inputs["From Max"].default_value = 0.66
    sedge_mask.clamp = True
    links.new(sedge_noise.outputs["Fac"], sedge_mask.inputs["Value"])
    sedge_mix = nodes.new("ShaderNodeMix")
    sedge_mix.data_type = "RGBA"
    sedge_mix.blend_type = "MIX"
    links.new(sedge_mask.outputs["Result"], sedge_mix.inputs["Factor"])
    links.new(mud_ramp.outputs["Color"], sedge_mix.inputs["A"])
    links.new(sedge_ramp.outputs["Color"], sedge_mix.inputs["B"])

    # Still-water pools: large-scale low areas filled with dark blue-green.
    pool_noise = nodes.new("ShaderNodeTexNoise")
    pool_noise.noise_dimensions = "4D"
    pool_noise.inputs["W"].default_value = seed * 2.47 + 23.0
    pool_noise.inputs["Scale"].default_value = 3.2
    pool_noise.inputs["Detail"].default_value = 2.0
    links.new(coords.outputs["Object"], pool_noise.inputs["Vector"])
    pool_mask = nodes.new("ShaderNodeMapRange")
    # Low noise -> pool. Inverted range so Result rises where Fac is low.
    pool_mask.inputs["From Min"].default_value = 0.46
    pool_mask.inputs["From Max"].default_value = 0.34
    pool_mask.clamp = True
    links.new(pool_noise.outputs["Fac"], pool_mask.inputs["Value"])
    pool_shade = nodes.new("ShaderNodeTexNoise")
    pool_shade.noise_dimensions = "4D"
    pool_shade.inputs["W"].default_value = seed * 7.91 + 5.0
    pool_shade.inputs["Scale"].default_value = 5.5
    pool_shade.inputs["Detail"].default_value = 2.0
    links.new(coords.outputs["Object"], pool_shade.inputs["Vector"])
    pool_ramp = nodes.new("ShaderNodeValToRGB")
    # Sky-sheen top stop: pools must read as standing water, not dry dark
    # earth, at far zoom (L2 iteration-2: water-mirror was too weak).
    pool_ramp.color_ramp.elements[0].position = 0.30
    pool_ramp.color_ramp.elements[0].color = (0.030, 0.052, 0.056, 1.0)
    pool_ramp.color_ramp.elements[1].position = 0.80
    pool_ramp.color_ramp.elements[1].color = (0.085, 0.130, 0.140, 1.0)
    links.new(pool_shade.outputs["Fac"], pool_ramp.inputs["Fac"])
    pool_mix = nodes.new("ShaderNodeMix")
    pool_mix.data_type = "RGBA"
    pool_mix.blend_type = "MIX"
    links.new(pool_mask.outputs["Result"], pool_mix.inputs["Factor"])
    links.new(sedge_mix.outputs["Result"], pool_mix.inputs["A"])
    links.new(pool_ramp.outputs["Color"], pool_mix.inputs["B"])

    finish_material(material, pool_mix.outputs["Result"])
    return material


def make_marsh_edge_material(name: str, seed: float = 0.0) -> bpy.types.Material:
    """Dark wet-earth grounding fringe where marsh meets grass: shadowed
    saturated soil, darker than both the marsh field and the grass."""
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
    ramp.color_ramp.elements[0].color = (0.040, 0.038, 0.026, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.095, 0.088, 0.058, 1.0)
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
    """Flat wavy fringe strip along one open tile edge, endpoints pinned and
    extended into the bleed zone (same language as grass/dirt/stone tiles)."""

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


def build_marsh_tile(scene: bpy.types.Scene, mask: str) -> None:
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    y0 = -0.5 - (TERRAIN_BLEED if same["N"] else 0.0)
    x1 = 0.5 + (TERRAIN_BLEED if same["E"] else 0.0)
    y1 = 0.5 + (TERRAIN_BLEED if same["S"] else 0.0)
    x0 = -0.5 - (TERRAIN_BLEED if same["W"] else 0.0)
    seed = 1.0 + (int(mask, 2) % 16) * 0.61
    add_flat_quad(scene, "Surface", (x0, y0), (x1, y1), 0.0, make_marsh_material("MarshSurface", seed))

    edge_material = make_marsh_edge_material("MarshEdge", seed)
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


def build_marsh_base(scene: bpy.types.Scene) -> None:
    add_flat_quad(scene, "Surface", (-0.5, -0.5), (0.5, 0.5), 0.0,
                  make_marsh_material("MarshSurface", 9.7))
