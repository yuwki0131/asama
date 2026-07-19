"""Terrain tile builders: ground, water, road, moat, bridge."""
from __future__ import annotations

from . import core
from .core import (
    add_box, add_flat_quad, add_mesh, map_box, map_xy,
    make_material, WALL_DIRECTIONS, wall_arm_box, WALL_EPSILON,
)
from .materials import (
    make_bank_material, make_holdout_material, make_mud_material,
    make_noise_material, make_trench_surface_material,
    TERRAIN_STYLES, TERRAIN_EDGE_QUADS, make_macro_terrain_material,
)

import bpy

TERRAIN_BLEED = 0.03
WATER_DEPTH = 0.17
MOAT_DEPTH = 0.30
# Dry moats read deeper than water moats (no waterline to imply volume), so
# they get their own excavation depth. Canvas budget: depth*30px must stay
# inside the 48px canvas (32px diamond + 16px below), 0.44 -> ~13px, ok.
DRY_MOAT_DEPTH = 0.44
# Horizontal run of the excavated bank slope (法面) from its top lip toward
# the trench floor - vertical walls read as masonry, not dug earth.
MOAT_SLOPE = 0.26

# --- Shared bank "edge-crossing standard" for every water tile builder ----
# Any land/water boundary in any water tile (connected shores, outer diagonal
# transitions, inner transitions) uses the same cross-section so tiles meet
# flush at shared edges in every legal adjacency:
#   * the bank line runs BANK_DEPTH_BASE inside the water, parallel to the
#     boundary, with a ground-level rim strip between boundary and bank line;
#   * the wavy jitter has fixed amplitudes and is pinned to ZERO at both run
#     ends (sin envelope), so every run crosses a tile edge at exactly
#     BANK_DEPTH_BASE regardless of tile kind or variant;
#   * the bank wall drops to -WATER_DEPTH and a BANK_WET_LAP dark lap sits at
#     water level -- identical height/thickness/colour everywhere.
BANK_DEPTH_BASE = 0.08
BANK_WET_LAP = 0.06
BANK_JITTER_A = 0.05
BANK_JITTER_B = 0.03


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
    import math as _math

    def jitter(i: int) -> float:
        raw = BANK_JITTER_A * _math.sin(seed * 2.13 + i * 2.9) + BANK_JITTER_B * _math.sin(seed * 5.7 + i * 6.1)
        envelope = _math.sin(_math.pi * i / segments)
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


def build_terrain_grass(scene: bpy.types.Scene) -> None:
    """One grass surface tile, footprint center at origin. Canvas 64x32, anchor 32,16."""
    add_mesh(
        scene,
        "GrassTile",
        [(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0), (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)],
        [(0, 1, 2, 3)],
        make_noise_material("Grass", (0.208, 0.294, 0.157), (0.322, 0.412, 0.204)),
    )


def build_terrain_macro_tile(scene: bpy.types.Scene, terrain: str, variant: int, tx: int, ty: int) -> None:
    """Interior terrain tile sampling the continuous macro noise field at
    grid offset (tx, ty). Water sits WATER_DEPTH below ground level."""
    material = make_macro_terrain_material(terrain, variant, tx, ty)
    b = TERRAIN_BLEED
    z = -WATER_DEPTH if terrain == "water" else 0.0
    add_flat_quad(scene, "Surface", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), z, material)


def build_water_shore_tile(scene: bpy.types.Scene, mask: str, variant: int = 0) -> None:
    """Water tile with real depth: the water surface sits WATER_DEPTH below
    ground, and every land-facing edge gets a wavy bank (shared edge-crossing
    standard, see _add_wavy_bank_run)."""
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    style = TERRAIN_STYLES["water"]
    rim = make_material("ShoreRim", (*style["edge"], 1.0))
    bank = make_bank_material()
    wet = make_material("ShoreWet", (0.030, 0.062, 0.080, 1.0))

    b = TERRAIN_BLEED
    water = make_noise_material("ShoreWater", (0.032, 0.070, 0.098), (0.062, 0.115, 0.150), scale=4.0)
    add_flat_quad(scene, "Water", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), -WATER_DEPTH, water)

    # Boundary runs per land edge: start/end on the tile edge, water-side
    # normal pointing into the tile.
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
    import math as _math

    b = TERRAIN_BLEED
    # Water under everything, full tile + bleed (same as the shore tiles).
    water = make_noise_material("TransWater", (0.032, 0.070, 0.098), (0.062, 0.115, 0.150), scale=4.0)
    add_flat_quad(scene, "Water", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), -WATER_DEPTH, water)

    # Diagonal endpoints A/B (tile corners between land and water edges),
    # unit normal pointing from the diagonal toward the water side, and the
    # land polygon (diagonal + the two land edges, extended by the bleed so
    # grass meets the land neighbours without seams).
    nw, ne, se, sw = (-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)
    inv = 1.0 / _math.sqrt(2.0)
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

    grass = TERRAIN_STYLES["grass"]["surface"]()
    add_mesh(scene, "Land", [(*map_xy(x, y), 0.0) for x, y in land], [tuple(range(len(land)))], grass)

    style = TERRAIN_STYLES["water"]
    rim = make_material("TransRim", (*style["edge"], 1.0))
    bank = make_bank_material()
    wet = make_material("TransWet", (0.030, 0.062, 0.080, 1.0))

    # Diagonal bank run A -> B (endpoints pinned to BANK_DEPTH_BASE at the
    # shared tile corners, extended into the bleed zone), shared edge-crossing
    # standard with the straight shore tiles.
    seed = sum(ord(c) for c in corner) + variant * 97
    _add_wavy_bank_run(scene, f"{corner}{variant}", a_pt, b_pt, normal, 8, seed, rim, bank, wet)


def build_water_transition_inner_tile(scene: bpy.types.Scene, corner: str, variant: int = 0) -> None:
    """Inner (concave) corner counterpart of build_water_transition_tile.

    ``corner`` names the two orthogonal LAND neighbours of this WATER cell
    ("ne", "es", "sw", "wn").

    Geometry contract with the outer tiles (see riverInnerTransitionCorner
    in packages/simulation/src/map.ts): in every regular placement the
    neighbour across the VERTICAL land edge (E/W) is the complementary
    outer transition whose full-tile diagonal ends exactly at this tile's
    land corner point, and the outer side of that shared edge is WATER
    everywhere except the corner point itself; the neighbour across the
    HORIZONTAL land edge (N/S) is plain grass.

    The tile therefore draws exactly ONE straight wavy bank, along the full
    horizontal land edge (shared edge-crossing standard, endpoints pinned to
    BANK_DEPTH_BASE at both tile corners), and NOTHING along the vertical
    land edge. The staircase contour then reads:

      outer diagonal -> shared corner -> this straight bank -> next corner
      -> next outer diagonal,

    one continuous chain. The previous chamfer-wedge design (grass corner
    triangle + 45° chamfer + outward "headland" flank) protruded past that
    chain into the outer neighbour's open water and produced a dark sawtooth
    tooth at every staircase step.
    """
    if corner not in ("ne", "es", "sw", "wn"):
        raise ValueError(f"Unknown inner water transition corner: {corner}")
    # sy: sign of the horizontal land edge (N/S). Local map coords: +y = south.
    sy = -1.0 if corner in ("ne", "wn") else 1.0

    b = TERRAIN_BLEED
    water = make_noise_material("InnerTransWater", (0.032, 0.070, 0.098), (0.062, 0.115, 0.150), scale=4.0)
    add_flat_quad(scene, "Water", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), -WATER_DEPTH, water)

    style = TERRAIN_STYLES["water"]
    rim = make_material("InnerTransRim", (*style["edge"], 1.0))
    bank = make_bank_material()
    wet = make_material("InnerTransWet", (0.030, 0.062, 0.080, 1.0))

    # Straight bank along the horizontal land edge, water-side normal
    # pointing into the tile. Runs corner to corner (extended into the bleed
    # zone) so it meets the two adjoining outer diagonals at the shared
    # corners exactly like a connected shore tile would.
    seed = sum(ord(c) for c in corner) + variant * 97
    _add_wavy_bank_run(
        scene, f"I{corner}{variant}", (-0.5, sy * 0.5), (0.5, sy * 0.5), (0.0, -sy), 6, seed, rim, bank, wet
    )


def build_terrain_mask(scene: bpy.types.Scene, terrain: str, mask: str) -> None:
    if terrain == "water":
        build_water_shore_tile(scene, mask, variant=0)
        return
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
    import math as _math
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
    build_surface_arm_kit(scene, mask, make_mud_material(), 0.014, 0.27)


def build_trench_moat(scene: bpy.types.Scene, mask: str, water: bool, phase: tuple[float, float] = (0.0, 0.0), seed: float = 0.0) -> None:
    """Moat as a real excavated trench: the full tile is sunk MOAT_DEPTH."""
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    earth = make_bank_material(offset=phase, seed=seed)
    rim = make_material("MoatRim", (0.150, 0.124, 0.088, 1.0))
    lip = make_material("MoatGrassLip", (0.105, 0.150, 0.070, 1.0))

    surface = make_trench_surface_material(water, phase, seed)
    surface_z = (-MOAT_DEPTH + 0.08) if water else -DRY_MOAT_DEPTH

    b = TERRAIN_BLEED
    fx0 = -0.5 - (0.45 if same["W"] else b)
    fy0 = -0.5 - (0.45 if same["N"] else b)
    add_flat_quad(scene, "TrenchFloor", (fx0, fy0), (0.5 + b, 0.5 + b), surface_z, surface)

    rim_w = 0.09
    for name in ("N", "E", "S", "W"):
        if same[name]:
            continue
        if name == "N":
            p0, p1 = (-0.5, -0.5 + rim_w), (0.5, -0.5 + rim_w)
            r0, r1 = (-0.5, -0.5), (0.5, -0.5)
        elif name == "S":
            p0, p1 = (-0.5, 0.5 - rim_w), (0.5, 0.5 - rim_w)
            r0, r1 = (-0.5, 0.5), (0.5, 0.5)
        elif name == "W":
            p0, p1 = (-0.5 + rim_w, -0.5), (-0.5 + rim_w, 0.5)
            r0, r1 = (-0.5, -0.5), (-0.5, 0.5)
        else:
            p0, p1 = (0.5 - rim_w, -0.5), (0.5 - rim_w, 0.5)
            r0, r1 = (0.5, -0.5), (0.5, 0.5)
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


def build_dry_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    build_trench_moat(scene, mask, water=False)


def build_water_moat_mask(scene: bpy.types.Scene, mask: str) -> None:
    build_trench_moat(scene, mask, water=True)


# --- Bridges: segment-based auto-tiling -----------------------------------
# One asset per footprint cell, selected by the renderer:
#   segment "single" -> isolated one-tile bridge (abutments on both ends)
#           "start"  -> approach cell at the MIN-coordinate end (on land)
#           "mid"    -> water-crossing cell, seamless along the axis
#           "end"    -> approach cell at the MAX-coordinate end (on land)
# Contract:
#   * every tile is built with its own cell center at map origin, so the
#     deck diamond center projects exactly onto the anchor pixel;
#   * every long-running element (deck, revetment, kamachi, rails) keeps a
#     constant cross-section and crosses segment-internal tile edges with a
#     TERRAIN_BLEED extension, so adjacent segments meet flush with no
#     repeated edges and no visible steps;
#   * the earth-bridge deck reuses the road kit's material, top height and
#     half-width, so road -> dobashi -> road reads as one straight line.

ROAD_FLOOR_TOP = 0.014   # build_road_mask floor_top
ROAD_ARM_HALF = 0.27     # build_road_mask arm_half


def _bridge_axes(axis: str):
    """Map (along, across) coordinates to map (x, y) per deck axis."""
    if axis == "x":
        return lambda a, c: (a, c)
    return lambda a, c: (c, a)


def _bridge_box(scene: bpy.types.Scene, pt, name, a0, a1, c0, c1, z0, z1, material) -> None:
    lo = pt(min(a0, a1), min(c0, c1))
    hi = pt(max(a0, a1), max(c0, c1))
    add_box(scene, name, *map_box((lo[0], lo[1], z0), (hi[0], hi[1], z1)), material)


def _bridge_along_extents(segment: str) -> tuple[float, float]:
    """Along-axis extents of the running elements for one segment tile.

    Land-side ends stop exactly at the tile edge (the neighbouring road tile
    provides the continuation); segment-internal edges extend by the bleed.
    """
    b = TERRAIN_BLEED
    a0 = -0.5 - (0.0 if segment in ("start", "single") else b)
    a1 = 0.5 + (0.0 if segment in ("end", "single") else b)
    return a0, a1


def build_earth_bridge(scene: bpy.types.Scene, axis: str = "x", segment: str = "single") -> None:
    """Dobashi (earthen causeway) segment tile. The deck is a dead-flat
    continuation of the road (same mud material, same top height, same
    half-width); the only vertical relief is the stone revetment face that
    carries the causeway across the sunken water. Canvas 64x48, anchor 32,24."""
    from .materials import make_ishigaki_material
    pt = _bridge_axes(axis)
    dirt = make_mud_material("CausewayDirt")
    stone = make_ishigaki_material("CausewayStone")
    a0, a1 = _bridge_along_extents(segment)

    # Deck: flat road surface across the whole tile, constant cross-section.
    _bridge_box(scene, pt, "Deck", a0, a1, -ROAD_ARM_HALF, ROAD_ARM_HALF, 0.0, ROAD_FLOOR_TOP, dirt)

    # Stone revetment flanks descending into the water. Water cells carry it
    # full length; approach cells only continue it on the water-facing half
    # so it reads as the abutment wing built into the bank.
    if segment in ("mid", "single"):
        r0, r1 = a0, a1
    elif segment == "start":
        r0, r1 = 0.12, a1
    else:  # end
        r0, r1 = a0, -0.12
    for side in (-1.0, 1.0):
        _bridge_box(
            scene, pt, f"Revet{side}",
            r0, r1, side * ROAD_ARM_HALF, side * (ROAD_ARM_HALF + 0.07),
            -0.20, ROAD_FLOOR_TOP - 0.004, stone
        )


def _bridge_wedge(scene: bpy.types.Scene, pt, name, aA, aB, c0, c1, zA, zB, base_z, material) -> None:
    """Prism whose top slopes from zA (at along=aA) to zB (at along=aB)."""
    corners_map = [
        (aA, c0, base_z), (aB, c0, base_z), (aB, c1, base_z), (aA, c1, base_z),
        (aA, c0, zA), (aB, c0, zB), (aB, c1, zB), (aA, c1, zA),
    ]
    vertices = []
    for a, c, z in corners_map:
        x, y = pt(a, c)
        wx, wy = map_xy(x, y)
        vertices.append((wx, wy, z))
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    add_mesh(scene, name, vertices, faces, material)


WOOD_DECK_Z0 = 0.085
WOOD_DECK_Z1 = 0.125
WOOD_DECK_HALF = 0.28


def build_wood_bridge(scene: bpy.types.Scene, axis: str = "x", segment: str = "single") -> None:
    """Wooden bridge segment tile: planked deck on log stringers, kamachi
    edge beams, continuous railings (posts on a 0.25 grid so the rhythm
    carries across tile edges), trestle posts in the water on mid cells and
    stone abutments with an earthen approach ramp on the end cells.
    Canvas 64x72, anchor 32,40."""
    from .materials import make_plank_material, make_ishigaki_material
    pt = _bridge_axes(axis)
    plank = make_plank_material("BridgePlank", (0.110, 0.078, 0.046), (0.185, 0.140, 0.088), boards_per_unit=12.0)
    beam = make_material("BridgeBeam", (0.070, 0.050, 0.030, 1.0))
    rail = make_material("BridgeRail", (0.085, 0.062, 0.038, 1.0))
    stone = make_ishigaki_material("BridgeAbutment")
    dirt = make_mud_material("BridgeRamp")
    a0, a1 = _bridge_along_extents(segment)

    # Log stringers under the deck, full length.
    for c in (-0.20, 0.0, 0.20):
        _bridge_box(scene, pt, f"Stringer{c}", a0, a1, c - 0.035, c + 0.035, 0.045, WOOD_DECK_Z0, beam)
    # Planked deck, constant cross-section full length.
    _bridge_box(scene, pt, "Deck", a0, a1, -WOOD_DECK_HALF, WOOD_DECK_HALF, WOOD_DECK_Z0, WOOD_DECK_Z1, plank)
    # Kamachi edge beams along both deck sides.
    for side in (-1.0, 1.0):
        _bridge_box(scene, pt, f"Kamachi{side}", a0, a1, side * (WOOD_DECK_HALF - 0.02), side * (WOOD_DECK_HALF + 0.02), WOOD_DECK_Z1, 0.15, beam)

    # Railings: two horizontal rails + posts. Interior posts sit on the
    # +-0.125 / +-0.375 grid (period 0.25 across tile edges); terminal ends
    # get a heavier end post and the rails stop inside the tile.
    rail_a0 = -0.44 if segment in ("start", "single") else a0
    rail_a1 = 0.44 if segment in ("end", "single") else a1
    for side in (-1.0, 1.0):
        c = side * 0.30
        posts = [-0.125, 0.125]
        if segment in ("mid",):
            posts += [-0.375, 0.375]
        if segment in ("start", "single"):
            posts += [-0.44]
        else:
            posts += [-0.375]
        if segment in ("end", "single"):
            posts += [0.44]
        else:
            posts += [0.375]
        for a in sorted(set(posts)):
            p = pt(a, c)
            add_box(scene, f"RailPost{side}{a}", *map_box((p[0] - 0.028, p[1] - 0.028, WOOD_DECK_Z1), (p[0] + 0.028, p[1] + 0.028, 0.42)), rail)
        for rz in (0.26, 0.38):
            _bridge_box(scene, pt, f"Rail{side}{rz}", rail_a0, rail_a1, c - 0.02, c + 0.02, rz, rz + 0.035, rail)

    # Trestle posts standing in the sunken water (mid / isolated crossings).
    if segment in ("mid", "single"):
        for c in (-0.20, 0.20):
            p = pt(0.0, c)
            add_box(scene, f"Trestle{c}", *map_box((p[0] - 0.04, p[1] - 0.04, -0.20), (p[0] + 0.04, p[1] + 0.04, WOOD_DECK_Z0)), beam)

    # Approach cells: stone abutment under the deck end + earth ramp from
    # ground level up to the deck, so the bridge visibly lands on the bank.
    ends = []
    if segment in ("start", "single"):
        ends.append(-1.0)
    if segment in ("end", "single"):
        ends.append(1.0)
    for sign in ends:
        ab0, ab1 = sign * 0.50, sign * 0.26
        _bridge_box(scene, pt, f"Abutment{sign}", ab0, ab1, -0.30, 0.30, -0.12, WOOD_DECK_Z0 - 0.005, stone)
        if sign < 0:
            _bridge_wedge(scene, pt, "RampNeg", -0.50, -0.28, -0.26, 0.26, 0.015, WOOD_DECK_Z1 - 0.004, 0.0, dirt)
        else:
            _bridge_wedge(scene, pt, "RampPos", 0.28, 0.50, -0.26, 0.26, WOOD_DECK_Z1 - 0.004, 0.015, 0.0, dirt)
