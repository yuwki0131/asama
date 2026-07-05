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
    ground, and every land-facing edge gets a wavy bank."""
    import math as _math
    same = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    style = TERRAIN_STYLES["water"]
    rim = make_material("ShoreRim", (*style["edge"], 1.0))
    bank = make_bank_material()
    wet = make_material("ShoreWet", (0.030, 0.062, 0.080, 1.0))

    b = TERRAIN_BLEED
    water = make_noise_material("ShoreWater", (0.032, 0.070, 0.098), (0.062, 0.115, 0.150), scale=4.0)
    add_flat_quad(scene, "Water", (-0.5 - b, -0.5 - b), (0.5 + b, 0.5 + b), -WATER_DEPTH, water)

    def jitter(name, i, count):
        # Endpoints (i=0, i=count) are pinned to zero so wavy banks from
        # neighbouring tiles/variants always meet flush at tile boundaries —
        # otherwise thin grass slivers show at the seams.
        seed = sum(ord(c) for c in name) + variant * 97
        raw = 0.05 * _math.sin(seed * 2.13 + i * 2.9) + 0.03 * _math.sin(seed * 5.7 + i * 6.1)
        envelope = _math.sin(_math.pi * i / count)
        return raw * envelope

    segments = 6
    depth_base = 0.17
    for name in ("N", "E", "S", "W"):
        if same[name]:
            continue
        for i in range(segments):
            t0 = i / segments
            t1 = (i + 1) / segments
            d0 = depth_base + jitter(name + str(variant), i, segments)
            d1 = depth_base + jitter(name + str(variant), i + 1, segments)
            if name == "N":
                o0, o1 = (-0.5 + t0, -0.5), (-0.5 + t1, -0.5)
                p0, p1 = (-0.5 + t0, -0.5 + d0), (-0.5 + t1, -0.5 + d1)
            elif name == "S":
                o0, o1 = (-0.5 + t0, 0.5), (-0.5 + t1, 0.5)
                p0, p1 = (-0.5 + t0, 0.5 - d0), (-0.5 + t1, 0.5 - d1)
            elif name == "W":
                o0, o1 = (-0.5, -0.5 + t0), (-0.5, -0.5 + t1)
                p0, p1 = (-0.5 + d0, -0.5 + t0), (-0.5 + d1, -0.5 + t1)
            else:
                o0, o1 = (0.5, -0.5 + t0), (0.5, -0.5 + t1)
                p0, p1 = (0.5 - d0, -0.5 + t0), (0.5 - d1, -0.5 + t1)
            add_mesh(scene, f"Rim{name}{variant}{i}",
                [(*map_xy(*o0), 0.0), (*map_xy(*o1), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*p0), 0.0)],
                [(0, 1, 2, 3)], rim)
            add_mesh(scene, f"Bank{name}{variant}{i}",
                [(*map_xy(*p0), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*p1), -WATER_DEPTH), (*map_xy(*p0), -WATER_DEPTH)],
                [(0, 1, 2, 3)], bank)
            lap = 0.06
            if name == "N":
                q0, q1 = (p0[0], p0[1] + lap), (p1[0], p1[1] + lap)
            elif name == "S":
                q0, q1 = (p0[0], p0[1] - lap), (p1[0], p1[1] - lap)
            elif name == "W":
                q0, q1 = (p0[0] + lap, p0[1]), (p1[0] + lap, p1[1])
            else:
                q0, q1 = (p0[0] - lap, p0[1]), (p1[0] - lap, p1[1])
            add_mesh(scene, f"Wet{name}{variant}{i}",
                [(*map_xy(*p0), -WATER_DEPTH + 0.004), (*map_xy(*p1), -WATER_DEPTH + 0.004), (*map_xy(*q1), -WATER_DEPTH + 0.004), (*map_xy(*q0), -WATER_DEPTH + 0.004)],
                [(0, 1, 2, 3)], wet)


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
    surface_z = (-MOAT_DEPTH + 0.08) if water else -MOAT_DEPTH

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
        add_mesh(scene, f"BankFace{name}",
            [(*map_xy(*p0), 0.0), (*map_xy(*p1), 0.0), (*map_xy(*p1), surface_z), (*map_xy(*p0), surface_z)],
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


def build_earth_bridge(scene: bpy.types.Scene) -> None:
    """Earthen causeway crossing along map x. Canvas 64x32, anchor 32,16."""
    dirt = make_mud_material("CausewayDirt")
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
