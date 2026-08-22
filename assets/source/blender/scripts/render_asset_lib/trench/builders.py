"""Moat/river builders, copied from terrain.py for the isolated trench
registry, with two visual fixes (patrol ledger V-01):

1. Holdout skirts no longer cast shadows (disable_holdout_shadows): the
   ground-level skirts shadowed the sunken floor's far corner, and that
   identical dark band tiled at 64px read as fish-scale wallpaper over
   wide water.
2. make_trench_surface_material is overridden with wider/steeper water and
   dry-floor ramps so the map-anchored phase field actually reads (the
   shared version left p0..p3 pixel-identical, meanAbsDiff ~13/765; see
   art-rulebook VAR-01).
"""
from __future__ import annotations

import math

import bpy

from ..core import (
    add_beam, add_box, add_flat_quad, add_frustum, add_mesh,
    map_box, map_xy, make_material,
)
from ..materials import (
    make_bank_material, make_holdout_material, make_noise_material,
)
from ..core import finish_material

TERRAIN_BLEED = 0.03
MOAT_DEPTH = 0.30
DRY_MOAT_DEPTH = 0.44
MOAT_SLOPE = 0.26


def disable_holdout_shadows(scene: bpy.types.Scene) -> None:
    """In Cycles a Holdout surface still casts shadows; the skirts sit at
    ground level above the sunken floor, so every tile got the same dark
    corner band. Camera-visibility holdout behaviour is unaffected."""
    for obj in scene.objects:
        materials = getattr(obj.data, "materials", None)
        if materials is None:
            continue
        if any(m is not None and m.name.startswith("Holdout") for m in materials):
            obj.visible_shadow = False


def make_trench_surface_material(water: bool, offset: tuple[float, float], seed: float) -> bpy.types.Material:
    """Trench floor / moat water with a map-anchored noise field (widened
    water ramp versus the shared materials.py version, see module doc)."""
    if water:
        dark, light, scale = (0.018, 0.046, 0.070), (0.066, 0.114, 0.142), 3.2
        ramp_lo, ramp_hi = 0.40, 0.66
    else:
        dark, light, scale = (0.040, 0.031, 0.020), (0.125, 0.100, 0.070), 5.5
        ramp_lo, ramp_hi = 0.38, 0.68
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
    ramp.color_ramp.elements[0].position = ramp_lo
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = ramp_hi
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    finish_material(material, ramp.outputs["Color"])
    return material


def make_trench_bank_material(offset: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> bpy.types.Material:
    """Shared bank material with the base soil ramp widened/steepened: banks
    dominate the dry-moat pixel budget, so the shared ramp left phase/seed
    variants under the VAR-01 floor (meanAbsDiff 8-12 vs >=12)."""
    material = make_bank_material(offset=offset, seed=seed)
    for node in material.node_tree.nodes:
        # Only the base soil ramp (LINEAR, element0 at 0.32) — the stone ramp
        # is CONSTANT and finish_material's painterly light ramp is EASE.
        if (
            node.bl_idname == "ShaderNodeValToRGB"
            and node.color_ramp.interpolation == "LINEAR"
            and abs(node.color_ramp.elements[0].position - 0.32) < 1e-6
        ):
            node.color_ramp.elements[0].position = 0.36
            node.color_ramp.elements[0].color = (0.048, 0.038, 0.026, 1.0)
            node.color_ramp.elements[1].position = 0.70
            node.color_ramp.elements[1].color = (0.155, 0.128, 0.092, 1.0)
    return material


def _object_noise_ramp_material(
    name: str,
    stops: list[tuple[float, tuple[float, float, float]]],
    scale: float,
    offset: tuple[float, float],
    seed: float,
    detail: float = 3.0,
) -> bpy.types.Material:
    """Map-anchored (object coords + phase offset) noise through a multi-stop
    ramp, so the pattern continues across tile borders like the water field."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    shift = nodes.new("ShaderNodeMapping")
    shift.inputs["Location"].default_value = (offset[0], -offset[1], 0.0)
    links.new(coords.outputs["Object"], shift.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["W"].default_value = seed * 5.13
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    links.new(shift.outputs["Vector"], noise.inputs["Vector"])
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


def make_trench_rim_material(offset: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> bpy.types.Material:
    """Moat rim strip (V-06): the old flat chocolate (0.150,0.124,0.088) drew a
    uniform dark band the whole run and read as a black stripe at map zoom.
    Noise-broken dry earth with an olive high end feathers the outer edge
    toward the neighbouring grass so the silhouette reads organic."""
    return _object_noise_ramp_material(
        "MoatRim",
        [
            (0.30, (0.118, 0.095, 0.064)),
            (0.56, (0.205, 0.168, 0.110)),
            (0.82, (0.128, 0.152, 0.076)),
        ],
        scale=7.5, offset=offset, seed=seed + 0.71,
    )


def make_waterline_material(offset: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> bpy.types.Material:
    """Broken bright lapping line where a bank meets standing water (V-06):
    the low end matches the water field so the highlight appears as
    intermittent dashes, not a hard contour."""
    return _object_noise_ramp_material(
        "TrenchWaterline",
        [
            (0.40, (0.070, 0.118, 0.145)),
            (0.68, (0.190, 0.238, 0.236)),
        ],
        scale=13.0, offset=offset, seed=seed + 0.29, detail=2.0,
    )


def build_trench_moat(scene: bpy.types.Scene, mask: str, water: bool, phase: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> None:
    """Moat as a real excavated trench: the full tile is sunk MOAT_DEPTH."""
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    earth = make_trench_bank_material(offset=phase, seed=seed)
    rim = make_trench_rim_material(offset=phase, seed=seed)
    lip = make_material("MoatGrassLip", (0.105, 0.150, 0.070, 1.0))
    waterline = make_waterline_material(offset=phase, seed=seed) if water else None

    surface = make_trench_surface_material(water, phase, seed)
    surface_z = (-MOAT_DEPTH + 0.08) if water else -DRY_MOAT_DEPTH

    b = TERRAIN_BLEED
    fx0 = -0.5 - (0.45 if same["W"] else b)
    fy0 = -0.5 - (0.45 if same["N"] else b)
    add_flat_quad(scene, "TrenchFloor", (fx0, fy0), (0.5 + b, 0.5 + b), surface_z, surface)

    rim_w = 0.09
    # This tile's floor overdraws the already-painted W/N neighbor by 0.45
    # (painter order: lower x+y first), so every run-parallel bank/rim/lip
    # must extend the same distance or the neighbor's bank shows a water
    # tooth where the floor covered it (task: 土手の途切れ).
    ext_x0 = -0.45 if same["W"] else 0.0
    ext_x1 = b if same["E"] else 0.0
    ext_y0 = -0.45 if same["N"] else 0.0
    ext_y1 = b if same["S"] else 0.0
    for name in ("N", "E", "S", "W"):
        if same[name]:
            continue
        if name == "N":
            p0, p1 = (-0.5 + ext_x0, -0.5 + rim_w), (0.5 + ext_x1, -0.5 + rim_w)
            r0, r1 = (-0.5 + ext_x0, -0.5), (0.5 + ext_x1, -0.5)
        elif name == "S":
            p0, p1 = (-0.5 + ext_x0, 0.5 - rim_w), (0.5 + ext_x1, 0.5 - rim_w)
            r0, r1 = (-0.5 + ext_x0, 0.5), (0.5 + ext_x1, 0.5)
        elif name == "W":
            p0, p1 = (-0.5 + rim_w, -0.5 + ext_y0), (-0.5 + rim_w, 0.5 + ext_y1)
            r0, r1 = (-0.5, -0.5 + ext_y0), (-0.5, 0.5 + ext_y1)
        else:
            p0, p1 = (0.5 - rim_w, -0.5 + ext_y0), (0.5 - rim_w, 0.5 + ext_y1)
            r0, r1 = (0.5, -0.5 + ext_y0), (0.5, 0.5 + ext_y1)
        add_mesh(scene, f"Rim{name}",
            [(*map_xy(*r0), 0.0), (*map_xy(*r1), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*p0), 0.0)],
            [(0, 1, 2, 3)], rim)
        ix, iy = {"N": (0.0, 1.0), "S": (0.0, -1.0), "W": (1.0, 0.0), "E": (-1.0, 0.0)}[name]
        q0 = (p0[0] + ix * MOAT_SLOPE, p0[1] + iy * MOAT_SLOPE)
        q1 = (p1[0] + ix * MOAT_SLOPE, p1[1] + iy * MOAT_SLOPE)
        add_mesh(scene, f"BankFace{name}",
            [(*map_xy(*p0), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*q1), surface_z), (*map_xy(*q0), surface_z)],
            [(0, 1, 2, 3)], earth)
        add_mesh(scene, f"Lip{name}",
            [(*map_xy(*p0), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*p1), -0.035), (*map_xy(*p0), -0.035)],
            [(0, 1, 2, 3)], lip)
        if waterline is not None:
            w0 = (q0[0] + ix * 0.055, q0[1] + iy * 0.055)
            w1 = (q1[0] + ix * 0.055, q1[1] + iy * 0.055)
            add_mesh(scene, f"Waterline{name}",
                [(*map_xy(*q0), surface_z + 0.004), (*map_xy(*q1), surface_z + 0.004),
                 (*map_xy(*w1), surface_z + 0.004), (*map_xy(*w0), surface_z + 0.004)],
                [(0, 1, 2, 3)], waterline)

    holdout = make_holdout_material()
    for name, low, high in (
        ("N", (-0.5, -3.0), (0.5, -0.5)),
        ("S", (-0.5, 0.5), (0.5, 3.0)),
        ("W", (-3.0, -0.5), (-0.5, 0.5)),
        ("E", (0.5, -0.5), (3.0, 0.5)),
    ):
        if same[name]:
            continue
        add_flat_quad(scene, f"Skirt{name}", low, high, 0.0005, holdout)
    for name, low, high in (
        ("NW", (-3.0, -3.0), (-0.5, -0.5)),
        ("NE", (0.5, -3.0), (3.0, -0.5)),
        ("SW", (-3.0, 0.5), (-0.5, 3.0)),
        ("SE", (0.5, 0.5), (3.0, 3.0)),
    ):
        add_flat_quad(scene, f"SkirtCorner{name}", low, high, 0.0005, holdout)


def build_trench_moat_diagonal(scene: bpy.types.Scene, water: bool, orientation: str) -> None:
    """Moat trench running corner-to-corner across the cell diagonal.

    nwse: NW corner to SE corner. nesw: NE corner to SW corner. A sunk floor
    band along the diagonal with rim/lip/bank strips on both sides; the band
    overshoots both corners slightly so chained diagonal tiles read as one
    continuous trench. Off-band tile area stays transparent (terrain shows).
    """
    import math
    earth = make_trench_bank_material()
    rim_mat = make_trench_rim_material()
    lip_mat = make_material("MoatGrassLip", (0.105, 0.150, 0.070, 1.0))
    waterline = make_waterline_material() if water else None
    surface = make_trench_surface_material(water, (0.0, 0.0), 0.0)
    surface_z = (-MOAT_DEPTH + 0.08) if water else -DRY_MOAT_DEPTH

    if orientation == "nwse":
        a, b = (-0.5, -0.5), (0.5, 0.5)
    else:
        a, b = (0.5, -0.5), (-0.5, 0.5)
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux

    overshoot = 0.04
    a = (a[0] - ux * overshoot, a[1] - uy * overshoot)
    b = (b[0] + ux * overshoot, b[1] + uy * overshoot)

    half_top = 0.42
    rim_w = 0.09
    # Steeper than straight-moat MOAT_SLOPE: the side-on (nesw) view is mostly
    # bank face, so a gentle slope leaves almost no visible water surface.
    slope = 0.14

    def offset(point: tuple[float, float], side: float, amount: float) -> tuple[float, float]:
        return (point[0] + px * side * amount, point[1] + py * side * amount)

    floor = [offset(a, 1.0, half_top), offset(b, 1.0, half_top), offset(b, -1.0, half_top), offset(a, -1.0, half_top)]
    add_mesh(scene, "DiagTrenchFloor", [(*map_xy(x, y), surface_z) for x, y in floor], [(0, 1, 2, 3)], surface)

    for side in (1.0, -1.0):
        top0, top1 = offset(a, side, half_top), offset(b, side, half_top)
        bot0, bot1 = offset(a, side, half_top - slope), offset(b, side, half_top - slope)
        out0, out1 = offset(a, side, half_top + rim_w), offset(b, side, half_top + rim_w)
        add_mesh(scene, f"DiagBank{side}",
            [(*map_xy(*top0), 0.0), (*map_xy(*top1), 0.0), (*map_xy(*bot1), surface_z), (*map_xy(*bot0), surface_z)],
            [(0, 1, 2, 3)], earth)
        add_mesh(scene, f"DiagRim{side}",
            [(*map_xy(*top0), 0.0), (*map_xy(*top1), 0.0), (*map_xy(*out1), 0.0), (*map_xy(*out0), 0.0)],
            [(0, 1, 2, 3)], rim_mat)
        add_mesh(scene, f"DiagLip{side}",
            [(*map_xy(*top0), 0.0), (*map_xy(*top1), 0.0), (*map_xy(*top1), -0.035), (*map_xy(*top0), -0.035)],
            [(0, 1, 2, 3)], lip_mat)
        if waterline is not None:
            in0 = offset(a, side, half_top - slope - 0.055)
            in1 = offset(b, side, half_top - slope - 0.055)
            add_mesh(scene, f"DiagWaterline{side}",
                [(*map_xy(*bot0), surface_z + 0.004), (*map_xy(*bot1), surface_z + 0.004),
                 (*map_xy(*in1), surface_z + 0.004), (*map_xy(*in0), surface_z + 0.004)],
                [(0, 1, 2, 3)], waterline)

    # Holdout skirts clip band bleed into edge neighbors and off-diagonal
    # corners. On-diagonal corners stay open so chained tiles bleed into each
    # other through the shared corner: the near strip of each adjacent edge
    # skirt is notched back by `notch` around the open corner, otherwise the
    # band pinches to a point at every cell boundary (scalloped chain).
    holdout = make_holdout_material()
    # Band-parallel skirts: occlude everything outside the rim outer edge along
    # the whole (extended) band, exactly where neighbor terrain would sit in
    # true 3D. Kills water pixels leaking through skirt notches (sawtooth) and
    # keeps the band's outer silhouette a clean diagonal line.
    rim_edge = half_top + rim_w
    a_ext = (a[0] - ux * 1.0, a[1] - uy * 1.0)
    b_ext = (b[0] + ux * 1.0, b[1] + uy * 1.0)
    for side in (1.0, -1.0):
        quad = [
            offset(a_ext, side, rim_edge), offset(b_ext, side, rim_edge),
            offset(b_ext, side, rim_edge + 2.5), offset(a_ext, side, rim_edge + 2.5),
        ]
        add_mesh(scene, f"SkirtBand{side}", [(*map_xy(x, y), 0.0005) for x, y in quad], [(0, 1, 2, 3)], holdout)
    notch = half_top + rim_w + overshoot
    open_corners = ("NW", "SE") if orientation == "nwse" else ("NE", "SW")
    edge_corners = {"N": ("NW", "NE"), "S": ("SW", "SE"), "W": ("NW", "SW"), "E": ("NE", "SE")}
    for name, far_low, far_high, near_low, near_high in (
        ("N", (-0.5, -3.0), (0.5, -0.5 - notch), (-0.5, -0.5 - notch), (0.5, -0.5)),
        ("S", (-0.5, 0.5 + notch), (0.5, 3.0), (-0.5, 0.5), (0.5, 0.5 + notch)),
        ("W", (-3.0, -0.5), (-0.5 - notch, 0.5), (-0.5 - notch, -0.5), (-0.5, 0.5)),
        ("E", (0.5 + notch, -0.5), (3.0, 0.5), (0.5, -0.5), (0.5 + notch, 0.5)),
    ):
        add_flat_quad(scene, f"Skirt{name}Far", far_low, far_high, 0.0005, holdout)
        low, high = list(near_low), list(near_high)
        for corner in edge_corners[name]:
            if corner not in open_corners:
                continue
            axis = 0 if name in ("N", "S") else 1
            clip_low = corner[1] == "W" if axis == 0 else corner[0] == "N"
            if clip_low:
                low[axis] = min(low[axis] + notch, high[axis])
            else:
                high[axis] = max(high[axis] - notch, low[axis])
        add_flat_quad(scene, f"Skirt{name}Near", tuple(low), tuple(high), 0.0005, holdout)
    for name, low, high in (
        ("NW", (-3.0, -3.0), (-0.5, -0.5)),
        ("NE", (0.5, -3.0), (3.0, -0.5)),
        ("SW", (-3.0, 0.5), (-0.5, 3.0)),
        ("SE", (0.5, 0.5), (3.0, 3.0)),
    ):
        if name in open_corners:
            continue
        add_flat_quad(scene, f"SkirtCorner{name}", low, high, 0.0005, holdout)


def build_dry_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    build_trench_moat(scene, mask, water=False)


def build_water_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    build_trench_moat(scene, mask, water=True)


# --- River: natural-levee water channel -----------------------------------
# Same trench cross-section contract as the moat family (identical canvas,
# anchor, floor overdraw and skirt rules) so river tiles chain and junction
# exactly like water_moat. Differentiation is entirely in the bank language:
# the moat reads as an excavated fortification (dark rim strip, strata earth
# face), the river reads as a natural stream (wide grassy rim, sandy earth
# face, reed tufts and waterline rocks).

RIVER_RIM_W = 0.13
# Gentler than it looks: with the wider grass rim the bank face must stay
# narrow or the water pinches to a stripe (moat: rim 0.09 + slope 0.26).
RIVER_SLOPE = 0.20


def _make_river_object_noise_material(
    name: str,
    dark: tuple[float, float, float],
    light: tuple[float, float, float],
    scale: float,
    offset: tuple[float, float],
    seed: float,
) -> bpy.types.Material:
    """Noise material on OBJECT coordinates. make_noise_material uses generated
    coordinates which normalize to the mesh bounding box, so on long thin bank
    faces the noise stretches into plank-like streaks; object coordinates keep
    the grain isotropic and let phased tiles continue the same field."""
    from ..core import finish_material
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    shift = nodes.new("ShaderNodeMapping")
    shift.inputs["Location"].default_value = (offset[0], -offset[1], 0.0)
    links.new(coords.outputs["Object"], shift.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["W"].default_value = seed * 4.91
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 3.0
    links.new(shift.outputs["Vector"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.32
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    finish_material(material, ramp.outputs["Color"])
    return material


def _river_materials(phase: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> dict:
    return {
        "bank": _make_river_object_noise_material(
            "RiverBankEarth", (0.070, 0.054, 0.036), (0.150, 0.120, 0.078), 9.0, phase, seed),
        "rim": _make_river_object_noise_material(
            "RiverGrassRim", (0.062, 0.104, 0.040), (0.126, 0.178, 0.076), 11.0, phase, seed + 0.37),
        "lip": make_material("RiverWetMud", (0.086, 0.070, 0.046, 1.0)),
        "surface": make_trench_surface_material(True, phase, seed),
        "reed_stem": make_material("RiverReedStem", (0.115, 0.145, 0.052, 1.0)),
        "reed_head": make_material("RiverReedHead", (0.240, 0.195, 0.105, 1.0)),
        "rock": make_noise_material("RiverRock", (0.100, 0.100, 0.098), (0.185, 0.182, 0.172), scale=7.0),
        "tuft": make_material("RiverGrassTuft", (0.096, 0.150, 0.056, 1.0)),
        "waterline": make_waterline_material(offset=phase, seed=seed),
    }


def _river_rand(seed: float):
    """Deterministic per-tile pseudo random stream (no python random import so
    repeated renders of the same model stay pixel-identical)."""
    counter = [0.0]

    def rand() -> float:
        counter[0] += 1.0
        return math.fmod(abs(math.sin(counter[0] * 12.9898 + seed * 78.233)) * 43758.5453, 1.0)

    return rand


def _add_river_reed_tuft(scene: bpy.types.Scene, key: str, cx: float, cy: float, mats: dict, rand) -> None:
    from ..core import add_beam
    for index in range(2):
        ox = (rand() - 0.5) * 0.08
        oy = (rand() - 0.5) * 0.08
        height = 0.13 + rand() * 0.08
        lean_x = (rand() - 0.5) * 0.05
        lean_y = (rand() - 0.5) * 0.05
        add_beam(scene, f"RiverReed{key}{index}",
                 (cx + ox, cy + oy, 0.0), (cx + ox + lean_x, cy + oy + lean_y, height),
                 0.012, mats["reed_stem"])
        add_box(scene, f"RiverReedHead{key}{index}",
                *map_box((cx + ox + lean_x - 0.011, cy + oy + lean_y - 0.011, height),
                         (cx + ox + lean_x + 0.011, cy + oy + lean_y + 0.011, height + 0.035)),
                mats["reed_head"])


def _add_river_rock(scene: bpy.types.Scene, key: str, cx: float, cy: float, z0: float, mats: dict, rand) -> None:
    from ..core import add_frustum
    size = 0.035 + rand() * 0.03
    height = 0.07 + rand() * 0.04
    add_frustum(scene, f"RiverRock{key}", (cx - size, cy - size), (cx + size, cy + size),
                z0, z0 + height, 0.025, mats["rock"])


def _add_river_grass_tuft(scene: bpy.types.Scene, key: str, cx: float, cy: float, mats: dict, rand) -> None:
    from ..core import add_beam
    for index in range(2):
        ox = (rand() - 0.5) * 0.08
        oy = (rand() - 0.5) * 0.08
        height = 0.07 + rand() * 0.05
        add_beam(scene, f"RiverTuft{key}{index}",
                 (cx + ox, cy + oy, 0.0), (cx + ox + 0.02, cy + oy - 0.015, height),
                 0.015, mats["tuft"])


def build_river(scene: bpy.types.Scene, mask: str, phase: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> None:
    """River tile: sunken water channel with natural grass/earth levee banks.

    Geometry contract matches build_trench_moat(water=True) exactly (floor
    depth, 0.45 W/N overdraw, run-parallel extensions, holdout skirts), so
    river masks tile with each other with the same seams as water_moat.
    """
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    detail_seed = seed * 13.7 + phase[0] * 31.0 + phase[1] * 17.0 + int(mask, 2) * 0.61
    mats = _river_materials(phase=phase, seed=seed)
    rand = _river_rand(detail_seed)

    surface_z = -MOAT_DEPTH + 0.08

    b = TERRAIN_BLEED
    fx0 = -0.5 - (0.45 if same["W"] else b)
    fy0 = -0.5 - (0.45 if same["N"] else b)
    add_flat_quad(scene, "RiverFloor", (fx0, fy0), (0.5 + b, 0.5 + b), surface_z, mats["surface"])

    rim_w = RIVER_RIM_W
    ext_x0 = -0.45 if same["W"] else 0.0
    ext_x1 = b if same["E"] else 0.0
    ext_y0 = -0.45 if same["N"] else 0.0
    ext_y1 = b if same["S"] else 0.0
    for name in ("N", "E", "S", "W"):
        if same[name]:
            continue
        if name == "N":
            p0, p1 = (-0.5 + ext_x0, -0.5 + rim_w), (0.5 + ext_x1, -0.5 + rim_w)
            r0, r1 = (-0.5 + ext_x0, -0.5), (0.5 + ext_x1, -0.5)
        elif name == "S":
            p0, p1 = (-0.5 + ext_x0, 0.5 - rim_w), (0.5 + ext_x1, 0.5 - rim_w)
            r0, r1 = (-0.5 + ext_x0, 0.5), (0.5 + ext_x1, 0.5)
        elif name == "W":
            p0, p1 = (-0.5 + rim_w, -0.5 + ext_y0), (-0.5 + rim_w, 0.5 + ext_y1)
            r0, r1 = (-0.5, -0.5 + ext_y0), (-0.5, 0.5 + ext_y1)
        else:
            p0, p1 = (0.5 - rim_w, -0.5 + ext_y0), (0.5 - rim_w, 0.5 + ext_y1)
            r0, r1 = (0.5, -0.5 + ext_y0), (0.5, 0.5 + ext_y1)
        add_mesh(scene, f"RiverRim{name}",
            [(*map_xy(*r0), 0.0), (*map_xy(*r1), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*p0), 0.0)],
            [(0, 1, 2, 3)], mats["rim"])
        ix, iy = {"N": (0.0, 1.0), "S": (0.0, -1.0), "W": (1.0, 0.0), "E": (-1.0, 0.0)}[name]
        q0 = (p0[0] + ix * RIVER_SLOPE, p0[1] + iy * RIVER_SLOPE)
        q1 = (p1[0] + ix * RIVER_SLOPE, p1[1] + iy * RIVER_SLOPE)
        add_mesh(scene, f"RiverBankFace{name}",
            [(*map_xy(*p0), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*q1), surface_z), (*map_xy(*q0), surface_z)],
            [(0, 1, 2, 3)], mats["bank"])
        add_mesh(scene, f"RiverLip{name}",
            [(*map_xy(*p0), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*p1), -0.03), (*map_xy(*p0), -0.03)],
            [(0, 1, 2, 3)], mats["lip"])
        w0 = (q0[0] + ix * 0.055, q0[1] + iy * 0.055)
        w1 = (q1[0] + ix * 0.055, q1[1] + iy * 0.055)
        add_mesh(scene, f"RiverWaterline{name}",
            [(*map_xy(*q0), surface_z + 0.004), (*map_xy(*q1), surface_z + 0.004),
             (*map_xy(*w1), surface_z + 0.004), (*map_xy(*w0), surface_z + 0.004)],
            [(0, 1, 2, 3)], mats["waterline"])

        # Waterside detail. The painter order overdraws this tile with the
        # E/S neighbor's extended floor (0.45), so props stay in the half of
        # the run that the forward neighbor never covers.
        run_axis_x = name in ("N", "S")
        forward_connected = same["E"] if run_axis_x else same["S"]
        t_min, t_max = -0.34, (0.0 if forward_connected else 0.34)

        def rim_point(t: float, inset: float) -> tuple[float, float]:
            if name == "N":
                return (t, -0.5 + inset)
            if name == "S":
                return (t, 0.5 - inset)
            if name == "W":
                return (-0.5 + inset, t)
            return (0.5 - inset, t)

        t = t_min + (t_max - t_min) * rand()
        cx, cy = rim_point(t, 0.05 + rand() * 0.05)
        _add_river_reed_tuft(scene, f"{name}0", cx, cy, mats, rand)
        if rand() > 0.55:
            t = t_min + (t_max - t_min) * rand()
            cx, cy = rim_point(t, rim_w + RIVER_SLOPE * 0.8)
            _add_river_rock(scene, name, cx, cy, surface_z, mats, rand)
        if rand() > 0.45:
            t = t_min + (t_max - t_min) * rand()
            cx, cy = rim_point(t, 0.04 + rand() * 0.06)
            _add_river_grass_tuft(scene, name, cx, cy, mats, rand)

    holdout = make_holdout_material()
    for name, low, high in (
        ("N", (-0.5, -3.0), (0.5, -0.5)),
        ("S", (-0.5, 0.5), (0.5, 3.0)),
        ("W", (-3.0, -0.5), (-0.5, 0.5)),
        ("E", (0.5, -0.5), (3.0, 0.5)),
    ):
        if same[name]:
            continue
        add_flat_quad(scene, f"Skirt{name}", low, high, 0.0005, holdout)
    for name, low, high in (
        ("NW", (-3.0, -3.0), (-0.5, -0.5)),
        ("NE", (0.5, -3.0), (3.0, -0.5)),
        ("SW", (-3.0, 0.5), (-0.5, 3.0)),
        ("SE", (0.5, 0.5), (3.0, 3.0)),
    ):
        add_flat_quad(scene, f"SkirtCorner{name}", low, high, 0.0005, holdout)


def build_river_diagonal(scene: bpy.types.Scene, orientation: str) -> None:
    """River band running corner-to-corner, mirroring build_trench_moat_diagonal
    geometry (band width, overshoot, notched skirts) with the river's natural
    levee bank language instead of the moat's excavated one."""
    mats = _river_materials()
    rand = _river_rand(3.31 if orientation == "nwse" else 7.13)
    surface_z = -MOAT_DEPTH + 0.08

    if orientation == "nwse":
        a, b = (-0.5, -0.5), (0.5, 0.5)
    else:
        a, b = (0.5, -0.5), (-0.5, 0.5)
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux

    overshoot = 0.04
    a = (a[0] - ux * overshoot, a[1] - uy * overshoot)
    b = (b[0] + ux * overshoot, b[1] + uy * overshoot)

    half_top = 0.42
    rim_w = RIVER_RIM_W
    slope = 0.14

    def offset(point: tuple[float, float], side: float, amount: float) -> tuple[float, float]:
        return (point[0] + px * side * amount, point[1] + py * side * amount)

    def lerp(t: float) -> tuple[float, float]:
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    floor = [offset(a, 1.0, half_top), offset(b, 1.0, half_top), offset(b, -1.0, half_top), offset(a, -1.0, half_top)]
    add_mesh(scene, "RiverDiagFloor", [(*map_xy(x, y), surface_z) for x, y in floor], [(0, 1, 2, 3)], mats["surface"])

    for side in (1.0, -1.0):
        top0, top1 = offset(a, side, half_top), offset(b, side, half_top)
        bot0, bot1 = offset(a, side, half_top - slope), offset(b, side, half_top - slope)
        out0, out1 = offset(a, side, half_top + rim_w), offset(b, side, half_top + rim_w)
        add_mesh(scene, f"RiverDiagBank{side}",
            [(*map_xy(*top0), 0.0), (*map_xy(*top1), 0.0), (*map_xy(*bot1), surface_z), (*map_xy(*bot0), surface_z)],
            [(0, 1, 2, 3)], mats["bank"])
        add_mesh(scene, f"RiverDiagRim{side}",
            [(*map_xy(*top0), 0.0), (*map_xy(*top1), 0.0), (*map_xy(*out1), 0.0), (*map_xy(*out0), 0.0)],
            [(0, 1, 2, 3)], mats["rim"])
        add_mesh(scene, f"RiverDiagLip{side}",
            [(*map_xy(*top0), 0.0), (*map_xy(*top1), 0.0), (*map_xy(*top1), -0.03), (*map_xy(*top0), -0.03)],
            [(0, 1, 2, 3)], mats["lip"])
        in0 = offset(a, side, half_top - slope - 0.055)
        in1 = offset(b, side, half_top - slope - 0.055)
        add_mesh(scene, f"RiverDiagWaterline{side}",
            [(*map_xy(*bot0), surface_z + 0.004), (*map_xy(*bot1), surface_z + 0.004),
             (*map_xy(*in1), surface_z + 0.004), (*map_xy(*in0), surface_z + 0.004)],
            [(0, 1, 2, 3)], mats["waterline"])

        # Waterside detail on the rim, kept away from both corners so chained
        # diagonal tiles do not double up props at the shared corner.
        t = 0.25 + rand() * 0.45
        base = lerp(t)
        cx, cy = offset(base, side, half_top + 0.03 + rand() * 0.04)
        _add_river_reed_tuft(scene, f"D{side}0", cx, cy, mats, rand)
        if rand() > 0.6:
            t = 0.25 + rand() * 0.45
            base = lerp(t)
            cx, cy = offset(base, side, half_top - slope - 0.03)
            _add_river_rock(scene, f"D{side}", cx, cy, surface_z, mats, rand)

    holdout = make_holdout_material()
    rim_edge = half_top + rim_w
    a_ext = (a[0] - ux * 1.0, a[1] - uy * 1.0)
    b_ext = (b[0] + ux * 1.0, b[1] + uy * 1.0)
    for side in (1.0, -1.0):
        quad = [
            offset(a_ext, side, rim_edge), offset(b_ext, side, rim_edge),
            offset(b_ext, side, rim_edge + 2.5), offset(a_ext, side, rim_edge + 2.5),
        ]
        add_mesh(scene, f"SkirtBand{side}", [(*map_xy(x, y), 0.0005) for x, y in quad], [(0, 1, 2, 3)], holdout)
    notch = half_top + rim_w + overshoot
    open_corners = ("NW", "SE") if orientation == "nwse" else ("NE", "SW")
    edge_corners = {"N": ("NW", "NE"), "S": ("SW", "SE"), "W": ("NW", "SW"), "E": ("NE", "SE")}
    for name, far_low, far_high, near_low, near_high in (
        ("N", (-0.5, -3.0), (0.5, -0.5 - notch), (-0.5, -0.5 - notch), (0.5, -0.5)),
        ("S", (-0.5, 0.5 + notch), (0.5, 3.0), (-0.5, 0.5), (0.5, 0.5 + notch)),
        ("W", (-3.0, -0.5), (-0.5 - notch, 0.5), (-0.5 - notch, -0.5), (-0.5, 0.5)),
        ("E", (0.5 + notch, -0.5), (3.0, 0.5), (0.5, -0.5), (0.5 + notch, 0.5)),
    ):
        add_flat_quad(scene, f"Skirt{name}Far", far_low, far_high, 0.0005, holdout)
        low, high = list(near_low), list(near_high)
        for corner in edge_corners[name]:
            if corner not in open_corners:
                continue
            axis = 0 if name in ("N", "S") else 1
            clip_low = corner[1] == "W" if axis == 0 else corner[0] == "N"
            if clip_low:
                low[axis] = min(low[axis] + notch, high[axis])
            else:
                high[axis] = max(high[axis] - notch, low[axis])
        add_flat_quad(scene, f"Skirt{name}Near", tuple(low), tuple(high), 0.0005, holdout)
    for name, low, high in (
        ("NW", (-3.0, -3.0), (-0.5, -0.5)),
        ("NE", (0.5, -3.0), (3.0, -0.5)),
        ("SW", (-3.0, 0.5), (-0.5, 3.0)),
        ("SE", (0.5, 0.5), (3.0, 3.0)),
    ):
        if name in open_corners:
            continue
        add_flat_quad(scene, f"SkirtCorner{name}", low, high, 0.0005, holdout)


def build_river_mask(scene: bpy.types.Scene, mask: str) -> None:
    build_river(scene, mask)

