"""Building, gate, wall, and fence geometry builders."""
from __future__ import annotations

from .core import (
    add_box, add_flat_quad, add_frustum, add_gable_roof, add_mesh,
    make_material, map_box, map_xy,
    WALL_DIRECTIONS, wall_arm_box,
    WALL_BASE_THICKNESS, WALL_BASE_HEIGHT, WALL_BODY_THICKNESS,
    WALL_BODY_TOP, WALL_COPING_THICKNESS, WALL_COPING_TOP, WALL_EPSILON,
)
from .materials import (
    building_material_set, make_gate_ground_material, make_ishigaki_material,
    make_namako_material, make_noise_material, make_plank_material,
    make_showcase_plaster, make_showcase_roof, make_textured_material,
    prop_materials,
)
from .vegetation import (
    add_leaf_cards, add_prop_barrel, add_prop_bale, add_prop_bush,
    add_prop_firewood, add_prop_lantern, add_prop_weeds, add_prop_well,
)

import bpy

# Building scale standard (tenshu calibration)
STORY_WALL_HEIGHT = 0.95
YARD_PAD_HEIGHT = 0.02

# Gate geometry constants
GATE_PILLAR_SIZE = 0.30
GATE_PILLAR_HEIGHT = 1.35
GATE_DOOR_HEIGHT = 1.05
GATE_DOOR_THICKNESS = 0.10
GATE_BEAM_BOTTOM = 1.08
GATE_BEAM_TOP = 1.30
GATE_ROOF_TOP = 1.72

# Fence geometry constants
FENCE_HEIGHT = 0.72
FENCE_POST_SIZE = 0.10
FENCE_RAIL_THICKNESS = 0.055
FENCE_RAIL_LEVELS = ((0.26, 0.36), (0.52, 0.62))


def add_yard_pad(scene: bpy.types.Scene, lot_width: float, lot_height: float, kind: str = "gravel") -> None:
    """Flat pad covering the map [-lot_width..0]x[-lot_height..0] lot."""
    from .materials import PAD_PALETTES, make_fringed_pad_material
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
    """Common house block: optional plinth, walls, gabled roof with overhang."""
    x0, y0 = low
    x1, y1 = high
    base = 0.0
    if plinth_material is not None and plinth_height > 0.0:
        add_box(scene, f"{name}Plinth", *map_box((x0 - 0.08, y0 - 0.08, 0.0), (x1 + 0.08, y1 + 0.08, plinth_height)), plinth_material)
        base = plinth_height
    add_box(scene, f"{name}Body", *map_box((x0, y0, base), (x1, y1, wall_top)), wall_material)
    roof_low, roof_high = map_box((x0 - roof_overhang, y0 - roof_overhang, 0.0), (x1 + roof_overhang, y1 + roof_overhang, 0.0))
    add_gable_roof(scene, f"{name}Roof", (roof_low[0], roof_low[1]), (roof_high[0], roof_high[1]), wall_top, ridge_top, ridge_axis, roof_material)


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
    """Quality-standard kawara roof assembly."""
    if ridge_axis == "y":
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


def add_yosemune_roof(
    scene: bpy.types.Scene,
    name: str,
    low_map: tuple[float, float],
    high_map: tuple[float, float],
    base_z: float,
    ridge_z: float,
    roof_material: bpy.types.Material,
    trim_material: bpy.types.Material,
) -> None:
    """Hipped (yosemune) kawara roof, ridge along map x."""
    x0, y0 = low_map
    x1, y1 = high_map
    ym = (y0 + y1) / 2.0
    hip = (y1 - y0) * 0.62
    r0 = (x0 + hip, ym)
    r1 = (x1 - hip, ym)
    e = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    vertices = [(*map_xy(px, py), base_z) for px, py in e]
    vertices.append((*map_xy(*r0), ridge_z))
    vertices.append((*map_xy(*r1), ridge_z))
    faces = [(0, 1, 5, 4), (3, 2, 5, 4), (0, 4, 3), (1, 2, 5)]
    add_mesh(scene, f"{name}Surface", vertices, faces, roof_material)

    cap_low, cap_high = map_box((r0[0] - 0.06, ym - 0.06, 0.0), (r1[0] + 0.06, ym + 0.06, 0.0))
    add_box(scene, f"{name}Cap", (cap_low[0], cap_low[1], ridge_z - 0.02), (cap_high[0], cap_high[1], ridge_z + 0.06), trim_material)
    for ox in (r0[0] - 0.10, r1[0] - 0.02):
        end_low, end_high = map_box((ox, ym - 0.08, 0.0), (ox + 0.12, ym + 0.08, 0.0))
        add_box(scene, f"{name}Oni{ox:.2f}", (end_low[0], end_low[1], ridge_z - 0.04), (end_high[0], end_high[1], ridge_z + 0.13), trim_material)

    pitch = 1.0 / 9.0
    for ey in (y0, y1):
        count = int((x1 - x0) / pitch)
        for index in range(count + 1):
            ex = x0 + index * pitch - 0.028
            elow, ehigh = map_box((ex, ey - 0.045, 0.0), (ex + 0.056, ey + 0.045, 0.0))
            add_box(scene, f"{name}EaveX{index}{ey:.2f}", (elow[0], elow[1], base_z - 0.06), (ehigh[0], ehigh[1], base_z + 0.005), trim_material)
    for ex in (x0, x1):
        count = int((y1 - y0) / pitch)
        for index in range(count + 1):
            ey = y0 + index * pitch - 0.028
            elow, ehigh = map_box((ex - 0.045, ey, 0.0), (ex + 0.045, ey + 0.056, 0.0))
            add_box(scene, f"{name}EaveY{index}{ex:.2f}", (elow[0], elow[1], base_z - 0.06), (ehigh[0], ehigh[1], base_z + 0.005), trim_material)


def add_itabuki_roof(scene: bpy.types.Scene, name: str, low_map: tuple[float, float], high_map: tuple[float, float], base_z: float, ridge_z: float, ridge_axis: str, wood: bpy.types.Material, stone: bpy.types.Material) -> None:
    """Ishioki-itabuki: wooden plank roof weighted with rows of stones."""
    x0, y0 = low_map
    x1, y1 = high_map
    low, high = map_box((x0, y0, 0.0), (x1, y1, 0.0))
    add_gable_roof(scene, f"{name}Surface", (low[0], low[1]), (high[0], high[1]), base_z, ridge_z, ridge_axis, wood)
    if ridge_axis == "x":
        mid = (y0 + y1) / 2.0
        rlow, rhigh = map_box((x0 - 0.03, mid - 0.06, 0.0), (x1 + 0.03, mid + 0.06, 0.0))
    else:
        mid = (x0 + x1) / 2.0
        rlow, rhigh = map_box((mid - 0.06, y0 - 0.03, 0.0), (mid + 0.06, y1 + 0.03, 0.0))
    add_box(scene, f"{name}RidgeBoard", (rlow[0], rlow[1], ridge_z - 0.03), (rhigh[0], rhigh[1], ridge_z + 0.045), wood)
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


def build_wall_plaster_mask(scene: bpy.types.Scene, mask: str) -> None:
    mats = building_material_set()
    plaster, stone, coping = mats["plaster"], mats["stone"], mats["roof"]

    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    active = [name for name, on in bits.items() if on]

    if not active:
        half = WALL_BASE_THICKNESS / 2.0
        add_box(scene, "PillarBase", *map_box((-half, -half, 0.0), (half, half, WALL_BASE_HEIGHT)), stone)
        body_half = WALL_BODY_THICKNESS / 2.0 + 0.03
        add_box(scene, "PillarBody", *map_box((-body_half, -body_half, WALL_BASE_HEIGHT), (body_half, body_half, WALL_BODY_TOP)), plaster)
        cap_half = WALL_COPING_THICKNESS / 2.0 + 0.02
        apex = (0.0, 0.0, WALL_COPING_TOP)
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


def build_wall_ladder(scene: bpy.types.Scene) -> None:
    """Siege ladder leaning over a wall cell. Canvas 64x96, anchor 32,80."""
    wood = make_material("LadderWood", (0.52, 0.40, 0.24, 1.0))
    steps = 7
    for i in range(steps + 1):
        t = i / steps
        x = 0.38 - 0.48 * t
        y = 0.38 - 0.48 * t
        z = 1.28 * t
        add_box(scene, f"Rung{i}", *map_box((x - 0.05, y - 0.24, z), (x + 0.05, y + 0.24, z + 0.05)), wood)
    add_box(scene, "BaseFoot", *map_box((0.34, 0.10, 0.0), (0.46, 0.66, 0.05)), wood)


def fence_post(scene: bpy.types.Scene, name: str, map_x: float, map_y: float, material: bpy.types.Material, height: float = FENCE_HEIGHT) -> None:
    half = FENCE_POST_SIZE / 2.0
    add_box(scene, name, *map_box((map_x - half, map_y - half, 0.0), (map_x + half, map_y + half, height)), material)


def build_fence_wood_mask(scene: bpy.types.Scene, mask: str) -> None:
    mats = building_material_set()
    wood, dark = mats["wood"], mats["dark_wood"]

    bits = {name: mask[index] == "1" for index, name in enumerate(("N", "E", "S", "W"))}
    active = [name for name, on in bits.items() if on]

    fence_post(scene, "PostCenter", 0.0, 0.0, dark, FENCE_HEIGHT + 0.05)
    if not active:
        return

    for index, name in enumerate(active):
        dx, dy = WALL_DIRECTIONS[name]
        inset = WALL_EPSILON * (index + 1)
        for distance, label in ((0.24, "A"), (0.48, "B")):
            fence_post(scene, f"Post{name}{label}", dx * distance, dy * distance, dark)
        for level, (z0, z1) in enumerate(FENCE_RAIL_LEVELS):
            half = FENCE_RAIL_THICKNESS / 2.0 - inset
            low, high = wall_arm_box((dx, dy), half, z0, z1)
            add_box(scene, f"Rail{name}{level}", *map_box(low, high), wood)


def gate_axis_point(axis: str, along: float, across: float) -> tuple[float, float]:
    if axis == "nw_se":
        return (along, across)
    return (across, along)


def gate_box(axis: str, along0: float, along1: float, across_half: float, z0: float, z1: float) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    x0, y0 = gate_axis_point(axis, along0, -across_half)
    x1, y1 = gate_axis_point(axis, along1, across_half)
    return (min(x0, x1), min(y0, y1), z0), (max(x0, x1), max(y0, y1), z1)


def build_gate_wood(scene: bpy.types.Scene, axis: str, width: int, mask: str, doors_closed: bool = True, opening: int | None = None) -> None:
    """Wooden gate spanning `width` cells. When `opening` is given (narrow
    gate), only that many central cells form the doorway and the remaining
    cells on each side are built as thick flanking wall segments — a 3-cell
    gate that only lets units through its center cell."""
    mats = building_material_set()
    wood, door, plaster, stone = mats["dark_wood"], mats["wood"], mats["plaster"], mats["stone"]

    half = float(width) / 2.0
    # Doorway half-extent along the gate axis. Full-width gates open across
    # the entire footprint; narrow gates only across the central `opening`.
    ohalf = half if opening is None else float(opening) / 2.0
    ridge_axis = "x" if axis == "nw_se" else "y"
    roof_mat = mats["roof"] if ridge_axis == "x" else mats["roof_y"]

    # Gate ground is trodden earth matching the terrain dirt tiles — no
    # masonry sill (user feedback: stone tiling under gates looks wrong).
    ground = make_gate_ground_material(axis)
    if axis == "nw_se":
        add_box(scene, "Sill", *map_box((-half, -0.5, 0.0), (half, 0.5, 0.02)), ground)
    else:
        add_box(scene, "Sill", *map_box((-0.5, -half, 0.0), (0.5, half, 0.02)), ground)

    if opening is not None:
        # Flanking wall segments — deliberately beefier than regular walls so
        # the gate reads as "mostly wall, 1-cell doorway".
        flank_base_half = WALL_BASE_THICKNESS / 2.0 + 0.06
        flank_body_half = WALL_BODY_THICKNESS / 2.0 + 0.05
        flank_cap_half = WALL_COPING_THICKNESS / 2.0 + 0.05
        for label, along0, along1 in (("E", ohalf, half), ("W", -half, -ohalf)):
            low, high = gate_box(axis, along0, along1, flank_base_half, 0.0, WALL_BASE_HEIGHT)
            add_box(scene, f"Flank{label}Base", *map_box(low, high), stone)
            low, high = gate_box(axis, along0, along1, flank_body_half, WALL_BASE_HEIGHT, WALL_BODY_TOP)
            add_box(scene, f"Flank{label}Body", *map_box(low, high), plaster)
            low, high = gate_box(axis, along0, along1, flank_cap_half, 0.0, 0.0)
            wlow, whigh = map_box(low, high)
            add_gable_roof(scene, f"Flank{label}Coping", (wlow[0], wlow[1]), (whigh[0], whigh[1]), WALL_BODY_TOP, WALL_COPING_TOP, ridge_axis, roof_mat)

    # Narrow gates hug the pillars to the doorway edges so the 1-cell opening
    # stays readable; full-width gates keep the original inset.
    pillar_inset = 0.22 if opening is None else 0.10
    for label, along in (("Near", ohalf - pillar_inset), ("Far", -ohalf + pillar_inset)):
        low, high = gate_box(axis, along - GATE_PILLAR_SIZE / 2.0, along + GATE_PILLAR_SIZE / 2.0, GATE_PILLAR_SIZE / 2.0, 0.0, GATE_PILLAR_HEIGHT)
        add_box(scene, f"Pillar{label}", *map_box(low, high), wood)

    door_margin = 0.38 if opening is None else 0.06
    if doors_closed:
        low, high = gate_box(axis, -ohalf + door_margin, ohalf - door_margin, GATE_DOOR_THICKNESS / 2.0, 0.0, GATE_DOOR_HEIGHT)
        add_box(scene, "Doors", *map_box(low, high), door)
    else:
        leaf_offset = 0.42 if opening is None else 0.14
        for side in (-1.0, 1.0):
            low, high = gate_box(axis, side * (ohalf - leaf_offset), side * (ohalf - leaf_offset + 0.04), 0.36, 0.0, GATE_DOOR_HEIGHT)
            add_box(scene, f"OpenLeaf{side}", *map_box(low, high), door)
    low, high = gate_box(axis, -ohalf - 0.06, ohalf + 0.06, 0.17, GATE_BEAM_BOTTOM, GATE_BEAM_TOP)
    add_box(scene, "Beam", *map_box(low, high), wood)

    roof_pad = 0.12 if opening is None else 0.24
    roof_low, roof_high = gate_box(axis, -ohalf - roof_pad, ohalf + roof_pad, 0.42, 0.0, 0.0)
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


def build_storehouse_showcase(scene: bpy.types.Scene) -> None:
    """Production-quality kura. Canvas 224x176, anchor 112,144."""
    plaster = make_showcase_plaster()
    namako = make_namako_material()
    roof = make_showcase_roof()
    stone = make_ishigaki_material("ShowcaseIshigaki")
    wood = make_textured_material("ShowcaseWood", (0.048, 0.034, 0.020), (0.095, 0.070, 0.042), scale=(18.0, 18.0, 2.5))
    gravel = make_textured_material("ShowcaseGravel", (0.55, 0.50, 0.40), (0.68, 0.63, 0.52), scale=14.0)
    ridge_dark = make_material("RidgeTile", (0.045, 0.042, 0.045, 1.0))

    add_yard_pad(scene, 3.0, 3.0, "gravel")
    add_frustum(scene, "Plinth", (-2.62, -2.32), (-0.38, -0.68), 0.0, 0.24, 0.05, stone)
    add_box(scene, "Namako", *map_box((-2.5, -2.2, 0.24), (-0.5, -0.8, 0.56)), namako)
    add_box(scene, "Upper", *map_box((-2.47, -2.17, 0.56), (-0.53, -0.83, 1.17)), plaster)

    add_box(scene, "DoorFrame", *map_box((-1.78, -0.86, 0.24), (-1.22, -0.78, 0.98)), plaster)
    add_box(scene, "DoorRecess", *map_box((-1.72, -0.83, 0.24), (-1.28, -0.76, 0.92)), wood)
    add_box(scene, "DoorSplit", *map_box((-1.515, -0.80, 0.24), (-1.485, -0.75, 0.92)), ridge_dark)

    for index, (wx0, wx1) in enumerate(((-2.28, -1.98), (-1.06, -0.76))):
        add_box(scene, f"WinFrame{index}", *map_box((wx0 - 0.04, -0.85, 0.78), (wx1 + 0.04, -0.79, 1.04)), plaster)
        add_box(scene, f"Win{index}", *map_box((wx0, -0.82, 0.82), (wx1, -0.77, 1.00)), ridge_dark)
        bar = wx0 + 0.05
        while bar < wx1 - 0.02:
            add_box(scene, f"WinBar{index}{bar:.2f}", *map_box((bar, -0.81, 0.82), (bar + 0.035, -0.755, 1.00)), plaster)
            bar += 0.09

    add_box(scene, "DripLedge", *map_box((-2.53, -2.23, 0.545), (-0.47, -0.77, 0.585)), plaster)
    add_box(scene, "DoorStep", *map_box((-1.70, -0.72, 0.0), (-1.30, -0.58, 0.12)), stone)

    crest_bright = make_material("CrestWhite", (0.72, 0.70, 0.62, 1.0))
    crest_dark = make_material("CrestInk", (0.10, 0.095, 0.10, 1.0))
    import math as _math
    for radius, depth, mat in ((0.095, 0.045, crest_bright), (0.062, 0.055, crest_dark), (0.032, 0.065, crest_bright)):
        ring = []
        for i in range(8):
            angle = i / 8 * 2 * _math.pi
            ring.append((-1.5 + radius * _math.cos(angle), 1.00 + radius * _math.sin(angle)))
        vertices = [((v[0] + depth), -v[0], v[1]) for v in ring]
        vertices = []
        for ry, rz in ring:
            vertices.append((*map_xy(-0.53 - 0.0, ry), rz))
        vertices = [((v[0] + depth), v[1], v[2]) for v in vertices]
        add_mesh(scene, f"Crest{radius}", vertices, [tuple(range(8))], mat)

    for index, (wx0, wx1) in enumerate(((-2.28, -1.98), (-1.06, -0.76))):
        alow, ahigh = map_box((wx0 - 0.07, -0.94, 0.0), (wx1 + 0.07, -0.76, 0.0))
        add_box(scene, f"WinAwning{index}", (alow[0], alow[1], 1.055), (ahigh[0], ahigh[1], 1.095), ridge_dark)

    for bz in (0.42, 0.72):
        add_box(scene, f"DoorBand{bz}", *map_box((-1.71, -0.845, bz), (-1.29, -0.755, bz + 0.035)), crest_dark)

    splash = make_material("SplashGrime", (0.155, 0.145, 0.125, 1.0))
    add_box(scene, "Splash", *map_box((-2.505, -2.205, 0.24), (-0.495, -0.795, 0.305)), splash)
    add_kawara_roof(scene, "KuraRoof", (-2.62, -2.32), (-0.38, -0.68), 1.17, 1.58, "x", roof, ridge_dark, verge_material=plaster)


def build_storehouse_graybox(scene: bpy.types.Scene) -> None:
    """Kura on a 3x3 lot. Canvas 224x176, anchor 112,144."""
    mats = building_material_set()
    plaster, stone, roof, wood, gravel = mats["plaster"], mats["stone"], mats["roof"], mats["dark_wood"], mats["gravel"]

    add_yard_pad(scene, 3.0, 3.0, "gravel")
    add_box(scene, "Plinth", *map_box((-2.65, -2.35, 0.0), (-0.35, -0.65, 0.22)), stone)
    add_box(scene, "Body", *map_box((-2.5, -2.2, 0.22), (-0.5, -0.8, 0.22 + STORY_WALL_HEIGHT)), plaster)
    add_box(scene, "EaveBand", *map_box((-2.55, -2.25, 0.97), (-0.45, -0.75, 0.22 + STORY_WALL_HEIGHT)), wood)
    low, high = map_box((-2.75, -2.45, 0.0), (-0.25, -0.55, 0.0))
    add_gable_roof(scene, "Roof", (low[0], low[1]), (high[0], high[1]), 0.22 + STORY_WALL_HEIGHT, 1.75, "x", roof)


def build_market_graybox(scene: bpy.types.Scene) -> None:
    """Ichiba on a 4x3 lot. Canvas 256x192, anchor 128,160."""
    mats = building_material_set()
    add_yard_pad(scene, 4.0, 3.0, "gravel")
    add_gabled_house(scene, "StallNorth", (-3.5, -2.6), (-0.5, -1.75), 0.8, 1.3, "x", mats["wood"], mats["thatch"], roof_overhang=0.15)
    add_gabled_house(scene, "StallSouth", (-3.5, -1.25), (-0.5, -0.4), 0.8, 1.3, "x", mats["wood"], mats["thatch"], roof_overhang=0.15)
    cloth = make_material("MarketCloth", (0.075, 0.105, 0.200, 1.0))
    pole = mats["dark_wood"]
    add_box(scene, "BannerPole", *map_box((-0.36, -2.90, 0.0), (-0.30, -2.84, 1.65)), pole)
    add_box(scene, "Banner", *map_box((-0.335, -2.875, 0.85), (-0.10, -2.855, 1.58)), cloth)
    for index, sx in enumerate((-3.3, -2.55, -1.8, -1.05)):
        add_box(scene, f"Noren{index}", *map_box((sx, -0.395, 0.52), (sx + 0.55, -0.375, 0.78)), cloth)
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
    """Heisha on a 4x3 lot. Canvas 256x192, anchor 128,160."""
    mats = building_material_set()
    add_yard_pad(scene, 4.0, 3.0, "dirt")
    add_box(scene, "NagayaPlinth", *map_box((-3.68, -2.58, 0.0), (-0.32, -1.32, 0.15)), mats["stone"])
    add_box(scene, "NagayaBody", *map_box((-3.6, -2.5, 0.15), (-0.4, -1.4, 0.92)), mats["plaster"])
    add_yosemune_roof(scene, "NagayaRoof", (-3.78, -2.62), (-0.22, -1.28), 0.92, 1.18, mats["roof"], mats["trim"])
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
    """Buke-yashiki. Canvas 288x224, anchor 144,192."""
    mats = building_material_set()
    props = prop_materials()
    wood = mats["wood"]
    dark = mats["dark_wood"]
    add_yard_pad(scene, 4.0, 4.0, "gravel")

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
    add_box(scene, "AnnexBody", *map_box((-1.0, -2.6, 0.0), (-0.3, -1.9, 0.68)), dark)
    add_itabuki_roof(scene, "AnnexRoof", (-1.08, -2.68), (-0.22, -1.82), 0.68, 0.98, "y", dark, props["stone"])

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
    from .core import add_beam
    add_beam(scene, "GardenPineTrunk", (-3.45, -1.35, 0.0), (-3.32, -1.22, 0.72), 0.07, bark)
    add_leaf_cards(scene, "GardenPinePad1", (-3.32, -1.22, 0.66), (0.24, 0.24, 0.08), 48, [props["bushD"]], seed=53.0, card_size=0.07)
    add_leaf_cards(scene, "GardenPinePad2", (-3.5, -1.42, 0.47), (0.17, 0.17, 0.06), 30, [props["bushD"]], seed=59.0, card_size=0.06)


def build_town_block_graybox(scene: bpy.types.Scene) -> None:
    """Machi on a 6x6 lot. Canvas 416x304, anchor 208,272."""
    mats = building_material_set()
    add_yard_pad(scene, 6.0, 6.0, "dirt")

    houses = (
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
    add_prop_barrel(scene, -3.15, -0.35, props)
    add_prop_barrel(scene, -2.9, -0.22, props)
    add_prop_bale(scene, -0.9, -0.3, True, props)
    add_prop_firewood(scene, -0.22, -1.5, props)
    add_prop_well(scene, -3.0, -3.15, props)
    add_prop_bale(scene, -0.25, -3.3, False, props)
    add_prop_weeds(scene, -5.55, -0.3, props)
    add_prop_weeds(scene, -0.35, -5.8, props)
    add_prop_bush(scene, -5.8, -6.05, props, scale=0.7)


def build_yagura_small_graybox(scene: bpy.types.Scene) -> None:
    """Small watchtower on a 2x2 footprint. Canvas 160x200, anchor 80,168."""
    mats = building_material_set()
    plaster, stone, roof, wood = mats["plaster"], mats["stone"], mats["roof"], mats["dark_wood"]

    add_frustum(scene, "Base", (-2.0, -2.0), (0.0, 0.0), 0.0, 0.95, 0.28, stone)
    add_box(scene, "Story1", *map_box((-1.72, -1.72, 0.95), (-0.28, -0.28, 1.85)), plaster)
    add_box(scene, "Skirt", *map_box((-1.88, -1.88, 1.82), (-0.12, -0.12, 1.92)), roof)
    add_box(scene, "Story2", *map_box((-1.45, -1.45, 1.92), (-0.55, -0.55, 2.72)), plaster)
    add_box(scene, "WatchBand", *map_box((-1.48, -1.48, 2.52), (-0.52, -0.52, 2.72)), wood)
    trim = mats["trim"]
    for sy in (-0.545, ):
        for wx in (-1.30, -1.02, -0.74):
            add_box(scene, f"Slit{wx}", *map_box((wx, sy - 0.02, 2.30), (wx + 0.14, sy + 0.02, 2.50)), trim)
    for sx in (-0.545, ):
        for wy in (-1.30, -1.02, -0.74):
            add_box(scene, f"SlitY{wy}", *map_box((sx - 0.02, wy, 2.30), (sx + 0.02, wy + 0.14, 2.50)), trim)
    add_kawara_roof(scene, "TopRoof", (-1.68, -1.62), (-0.32, -0.38), 2.72, 3.12, "x", roof, trim, verge_material=plaster)


def build_tenshu_graybox(scene: bpy.types.Scene) -> None:
    """Godai-style keep: two-stage ishigaki, five shrinking tiers with
    alternating kawara roofs, chidori-hafu dormers, top hip roof with
    shachi finials. Lot 8x8, origin at south corner convention (build in
    [-8,0]x[-8,0] like other lot buildings)."""
    mats = building_material_set()
    plaster = mats["plaster"]
    roof_x = mats["roof"]
    roof_y = mats["roof_y"]
    trim = mats["trim"]
    dark = mats["dark_wood"]
    stone = make_ishigaki_material("TenshuIshigaki")
    gold = make_material("Shachi", (0.55, 0.42, 0.12, 1.0))

    # NOTE: no yard apron in the sprite — the courtyard ground is rendered
    # as terrain (sim converts lot cells to dirt), otherwise the flat ground
    # pixels break Y-sorting against neighbouring tall decorations.
    # Lot is 7x7 and the ishigaki fills it almost fully so the blocked
    # footprint matches what the player sees (no invisible dead ring).
    cx, cy = -3.5, -3.5  # lot center

    def centered(w: float):
        return (cx - w / 2, cy - w / 2), (cx + w / 2, cy + w / 2)

    # Ishigaki: two battered stages.
    # NOTE: IshigakiLower and IshigakiUpper are omitted here — the terrain
    # elevation system renders dedicated ishigaki revetment tiles that sit
    # around the tenshu lot.  Including them in the building sprite causes
    # double-drawing where the two layers overlap.
    # add_frustum(scene, "IshigakiLower", low, high, 0.0, 0.85, 0.75, stone)
    # add_frustum(scene, "IshigakiUpper", low, high, 0.85, 1.5, 0.5, stone)

    # Tiers: (width, body height, roof rise, ridge axis) — tall tower with
    # walls clearly visible between roofs.
    tiers = [
        (4.2, 1.20, 0.60, "x"),
        (3.6, 1.05, 0.56, "y"),
        (3.0, 0.95, 0.52, "x"),
        (2.4, 0.90, 0.62, "y"),
    ]
    z = 1.5
    for index, (w, body_h, rise, axis) in enumerate(tiers):
        low, high = centered(w)
        # Dark wood skirt band then plaster body (tenshu reference look).
        add_box(scene, f"T{index}Skirt", *map_box((low[0], low[1], z), (high[0], high[1], z + 0.16)), dark)
        add_box(scene, f"T{index}Body", *map_box((low[0], low[1], z + 0.16), (high[0], high[1], z + body_h)), plaster)
        # Window slit rows on the two visible faces.
        n_win = max(2, int(w) - 1)
        for wi in range(n_win):
            fx = low[0] + (wi + 0.75) * (w / (n_win + 0.5))
            add_box(scene, f"T{index}WinS{wi}", *map_box((fx, high[1] - 0.035, z + 0.42), (fx + 0.22, high[1] + 0.005, z + 0.62)), trim)
            fy = low[1] + (wi + 0.75) * (w / (n_win + 0.5))
            add_box(scene, f"T{index}WinE{wi}", *map_box((high[0] - 0.035, fy, z + 0.42), (high[0] + 0.005, fy + 0.22, z + 0.62)), trim)
        roof_low = (low[0] - 0.5, low[1] - 0.5)
        roof_high = (high[0] + 0.5, high[1] + 0.5)
        z_eave = z + body_h
        z_ridge = z_eave + rise
        if index < len(tiers) - 1:
            mat = roof_x if axis == "x" else roof_y
            add_kawara_roof(scene, f"T{index}Roof", roof_low, roof_high, z_eave, z_ridge, axis, mat, trim, verge_material=plaster)
            # Chidori-hafu dormer on the south-west face of even tiers.
            if index % 2 == 0:
                dw = w * 0.5
                dlow = (cx - dw / 2, high[1] - 0.35)
                dhigh = (cx + dw / 2, high[1] + 0.42)
                add_gable_roof(scene, f"T{index}Hafu", (map_xy(*dlow)), (map_xy(*dhigh)), z_eave + 0.08, z_eave + rise * 0.85, "y", roof_y, end_material=plaster)
            # next tier starts near the ridge so wall area stays exposed
            z = z_eave + rise * 0.85
        else:
            # Top: grand hip roof (no shachi for now, user ruling 2026-07-05).
            add_yosemune_roof(scene, "TopRoof", roof_low, roof_high, z_eave, z_ridge + 0.18, roof_x, trim)



# ---------------------------------------------------------------------------
# Production tenshu (three-tier keep on an ishigaki mound, 4x4 lot)
# ---------------------------------------------------------------------------

# Variants keep the same design language (white plaster, kawara skirt roofs,
# chidori-hafu, kato-mado, shachi) — only proportions differ:
#   A (production): three roofs, strong tier reduction — grounded borogata
#   B: three roofs, gentle reduction — slimmer column
#   C: three roofs with oversized chidori-hafu
TENSHU_DEFAULT_VARIANT = "A"

# Mound height = exactly ONE terrain elevation step (elevation/tiles.py LEVEL,
# 40 screen px), per user ruling 2026-07-18: the keep's built-in ishigaki plinth
# must match the terrain revetment height because scenarios place the tenshu on
# an ishigaki-clad terrain hill; the plinth is just the top course.
import math as _math
TENSHU_ISHIGAKI_TOP = 5.0 * _math.sqrt(6.0) / 12.0  # == elevation.tiles.LEVEL
TENSHU_ISHIGAKI_BATTER = 0.30  # top inset fraction of mound height (terrain sori)
TENSHU_MOUND_BASE_HALF = 1.95  # mound base fills the 4x4 lot minus a hair

# Global keep scale (selection gate 2026-07-18: 0.60 vs 0.75 of the PR#62
# volume; heights AND widths shrink together so the silhouette keeps its
# proportions while harmonizing with the kura/yagura neighbours).
TENSHU_DEFAULT_SCALE = 0.75

# Tier widths are chosen so the FIRST story rises almost flush with the stone
# crest (user ruling 2026-07-18: no visible flat 犬走り between the ishigaki
# edge and the plaster wall — a real keep fills its stone platform). With the
# 0.75 global scale, tier-0 of A spans 3.93*0.75=2.95 map units against a
# stone crest of ~1.64 half-width, leaving only a ~0.17-unit stone rim;
# the tier-0 skirt roof eaves then reach back out over the stone edge.
# Slim rework (user ruling 2026-07-19: "全体的に太い、シュッと"): tier
# reduction strengthened to ~0.69/0.64 (was ~0.81) so the top story reads
# clearly small, and story walls are taller so the whole silhouette leans
# toward the yagura's tower-like height:width (~1.0-1.2:1 on screen).
TENSHU_VARIANTS = {
    "A": {
        # Wall:roof close to 1:1 (Himeji/Matsumoto reference) so the white
        # plaster band reads clearly between the tiled skirt roofs.
        "tiers": ((3.93, 1.62), (2.71, 1.38), (1.72, 1.15)),
        "rises": (0.34, 0.31),
        "top_rise": 0.60,
        "hafu": ((0, "S", 0.38), (1, "E", 0.42)),
    },
    "B": {
        "tiers": ((3.78, 1.32), (3.10, 1.20), (2.50, 1.06)),
        "rises": (0.34, 0.33),
        "top_rise": 0.52,
        "hafu": ((1, "S", 0.40),),
    },
    "C": {
        "tiers": ((3.97, 1.50), (2.85, 1.34), (1.95, 1.15)),
        "rises": (0.40, 0.38),
        "top_rise": 0.66,
        "hafu": ((0, "S", 0.60), (1, "E", 0.55)),
    },
}


def _kirikomi_mound(scene: bpy.types.Scene, cx: float, cy: float,
                    base_half: float, height: float) -> float:
    """Square ishigaki mound built with the SAME coursed kirikomi-hagi
    masonry as the terrain revetments (elevation/tiles.py): 8 px courses in
    running bond, per-stone planar quads tangent to the concave sori
    surface, mortar-shadow joint backing, damp/mossy aging toward the foot.
    One stone-wall vocabulary everywhere - a building mound must not read
    as a different masonry from the terrain walls next to it
    (art-rulebook ISHIGAKI-03). Returns the crest half-width."""
    from .elevation import tiles as _tiles

    amp = min(_tiles.ISHIGAKI_BATTER * height, _tiles.ISHIGAKI_SORI_MAX)

    def half_at(t: float) -> float:
        return base_half - amp * (1.0 - (1.0 - t) ** 2)

    # Joint/mortar backing: a battered frustum a hair inside the stones so
    # only the seams between quads read as the dark bed/head joints.
    segments = 6
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    ring_starts: list[int] = []
    for k in range(segments + 1):
        t = k / segments
        h = half_at(t)
        z = height * t
        ring_starts.append(len(vertices))
        for x, y in ((cx - h, cy - h), (cx + h, cy - h), (cx + h, cy + h), (cx - h, cy + h)):
            vertices.append((*map_xy(x, y), z))
    for k in range(segments):
        a, b = ring_starts[k], ring_starts[k + 1]
        for i in range(4):
            j = (i + 1) % 4
            faces.append((a + i, a + j, b + j, b + i))
    add_mesh(scene, "MoundJoint", vertices, faces, _tiles._kirikomi_joint_material())
    # Stone crest cap (terrain hides its crest under the surface tile; the
    # mound's crest ring stays visible around the keep, so cap it in stone).
    crest = half_at(1.0)
    cap = [(*map_xy(x, y), height) for x, y in
           ((cx - crest, cy - crest), (cx + crest, cy - crest), (cx + crest, cy + crest), (cx - crest, cy + crest))]
    add_mesh(scene, "MoundCap", cap, [(0, 1, 2, 3)], _tiles._kirikomi_stone_materials()[3])

    stones = _tiles._kirikomi_stone_materials()
    damp, mossy = _tiles._kirikomi_weathered_materials()
    n_courses = max(1, round(height / _tiles.KIRI_COURSE))
    # All four faces so the masonry is orientation-proof; (nx, ny) is the
    # outward normal, `a` runs along the face through the mound centre.
    for seed, nx, ny in ((5.0, 0.0, -1.0), (6.0, 1.0, 0.0), (7.0, 0.0, 1.0), (8.0, -1.0, 0.0)):
        for j in range(n_courses):
            z1 = height - j * _tiles.KIRI_COURSE
            z0 = max(0.0, z1 - _tiles.KIRI_COURSE + _tiles.KIRI_BED)
            z_c = 0.5 * (z0 + z1)
            t_c = z_c / height
            o_c = half_at(t_c) + _tiles.KIRI_LIP
            slope = -2.0 * (amp / height) * (1.0 - t_c)  # d(half)/dz
            a_lim = half_at(t_c)  # clip stones at the corner arris
            shift = 0.16 + 0.24 * _tiles._hash01(seed, j, 81.0)
            a = -a_lim - shift
            k = 0
            while a < a_lim - 0.02:
                width = 0.24 + 0.16 * _tiles._hash01(seed, j, 90.0 + 7.0 * k)
                a0 = max(-a_lim, a)
                a1 = min(a_lim, a + width - _tiles.KIRI_GAP)
                if a1 - a0 > 0.03:
                    roll = _tiles._hash01(seed, j, 60.0 + 5.0 * k)
                    material = stones[int(roll * 5.0) % 5]
                    # Aging gradient: damp then mossy blocks thicken toward
                    # the foot of the wall (same thresholds as the terrain).
                    depth = j / max(1, n_courses - 1)
                    age = _tiles._hash01(seed, j, 70.0 + 3.0 * k)
                    if depth > 0.75 and age < 0.12 + 0.30 * (depth - 0.75) / 0.25:
                        material = mossy
                    elif depth > 0.5 and age > 0.85 - 0.40 * (depth - 0.5) / 0.5:
                        material = damp
                    a_c = 0.5 * (a0 + a1)
                    tilt_a = 0.055 * (_tiles._hash01(seed, j, 71.0 + k) - 0.5)
                    tilt_z = 0.055 * (_tiles._hash01(seed, j, 72.0 + k) - 0.5)
                    quad: list[tuple[float, float, float]] = []
                    for aa, zz in ((a0, z0), (a1, z0), (a0, z1), (a1, z1)):
                        o = o_c + (slope + tilt_z) * (zz - z_c) + tilt_a * (aa - a_c)
                        if ny != 0.0:
                            x, y = cx + aa, cy + o * ny
                        else:
                            x, y = cx + o * nx, cy + aa
                        quad.append((*map_xy(x, y), zz))
                    add_mesh(scene, f"MoundStone{int(seed)}_{j}_{k}", quad, [(0, 1, 3, 2)], material)
                a += width
                k += 1
    return crest



def _tenshu_material_set() -> dict[str, bpy.types.Material]:
    """Building materials lifted to the tone of the painterly raster
    neighbours (showcase kura): bright blue-gray kawara with per-tile value
    jitter, warm aged-white plaster, and light ridge caps. The keep's deep
    eaves + AO would otherwise sink the whole sprite toward black."""
    mats = building_material_set()
    mats["plaster"] = make_showcase_plaster(
        "TenshuPlaster", dark=(0.660, 0.630, 0.560), light=(0.820, 0.790, 0.720))
    roof_kwargs = dict(
        base_dark=(0.150, 0.160, 0.180),
        base_light=(0.295, 0.310, 0.335),
        mud=(0.150, 0.135, 0.115),
        columns=7.0,
        courses=11.0,
        seam=(0.47, 0.47, 0.50),
        grime_strength=0.42,
    )
    mats["roof"] = make_showcase_roof("x", name="TenshuRoof", **roof_kwargs)
    mats["roof_y"] = make_showcase_roof("y", name="TenshuRoofY", **roof_kwargs)
    # Ridge caps / fascia read as pale ibushi-silver against the tiles.
    mats["ridge"] = make_noise_material(
        "TenshuRidge", (0.255, 0.265, 0.292), (0.355, 0.365, 0.392), scale=7.0)
    mats["dark_wood"] = make_plank_material(
        "TenshuDarkWood", (0.065, 0.048, 0.030), (0.130, 0.100, 0.062))
    # Hem grime: thin warm gray-brown wash where plaster meets the skirt.
    mats["hem"] = make_noise_material(
        "TenshuHem", (0.440, 0.410, 0.350), (0.560, 0.530, 0.465), scale=9.0)
    return mats


def _tenshu_skirt_roof(
    scene: bpy.types.Scene,
    name: str,
    cx: float,
    cy: float,
    outer_w: float,
    inner_w: float,
    z_eave: float,
    z_top: float,
    mats: dict,
) -> None:
    """Hipped kawara skirt roof ring between two keep stories: four sori-curved
    slopes, trim hip ridges (sumimune), eave fascia and rafter tips."""
    from .core import ROOF_CURVE_EXPONENT, add_beam
    trim = mats.get("ridge", mats["trim"])
    rafter = mats["trim"]
    seg = 4
    oh = outer_w / 2.0
    ih = inner_w / 2.0

    def ring(t: float) -> tuple[float, float]:
        h = oh + (ih - oh) * t
        z = z_eave + (z_top - z_eave) * (t ** ROOF_CURVE_EXPONENT)
        return h, z

    rings = [ring(i / seg) for i in range(seg + 1)]
    # Slopes facing map N/S carry the x-banded tile columns, E/W the y-banded
    # ones, so the seams always run straight down the slope.
    for axis, mat in (("y", mats["roof"]), ("x", mats["roof_y"])):
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        for side in (-1.0, 1.0):
            base = len(vertices)
            for h, z in rings:
                if axis == "y":
                    a = (cx - h, cy + side * h)
                    b = (cx + h, cy + side * h)
                else:
                    a = (cx + side * h, cy - h)
                    b = (cx + side * h, cy + h)
                vertices.append((*map_xy(*a), z))
                vertices.append((*map_xy(*b), z))
            for i in range(seg):
                faces.append((base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2))
        add_mesh(scene, f"{name}Slope{axis}", vertices, faces, mat)

    # Hip ridges follow the sagging profile in two segments.
    mid_h, mid_z = ring(0.5)
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            a = (cx + sx * oh, cy + sy * oh, z_eave + 0.005)
            m = (cx + sx * mid_h, cy + sy * mid_h, mid_z + 0.035)
            b = (cx + sx * ih, cy + sy * ih, z_top + 0.045)
            add_beam(scene, f"{name}Hip{sx:+.0f}{sy:+.0f}a", a, m, 0.10, trim, tip_thickness=0.085)
            add_beam(scene, f"{name}Hip{sx:+.0f}{sy:+.0f}b", m, b, 0.085, trim, tip_thickness=0.07)
            # Corner onigawara block at the eave end of the hip.
            ox, oy = cx + sx * oh, cy + sy * oh
            add_box(scene, f"{name}Oni{sx:+.0f}{sy:+.0f}", *map_box((ox - 0.075, oy - 0.075, z_eave - 0.02), (ox + 0.075, oy + 0.075, z_eave + 0.10)), trim)

    # Eave fascia and rafter tips on all four sides.
    x0, y0 = cx - oh, cy - oh
    x1, y1 = cx + oh, cy + oh
    for ey in (y0, y1):
        add_box(scene, f"{name}FasciaX{ey:.2f}", *map_box((x0, ey - 0.04, z_eave - 0.055), (x1, ey + 0.04, z_eave - 0.005)), trim)
    for ex in (x0, x1):
        add_box(scene, f"{name}FasciaY{ex:.2f}", *map_box((ex - 0.04, y0, z_eave - 0.055), (ex + 0.04, y1, z_eave - 0.005)), trim)
    pitch = 1.0 / 9.0
    count = int(outer_w / pitch)
    for i in range(count + 1):
        e = x0 + i * pitch - 0.028
        if e + 0.056 > x1 + 0.03:
            continue
        for ey in (y0, y1):
            add_box(scene, f"{name}EaveX{i}{ey:.2f}", *map_box((e, ey - 0.05, z_eave - 0.07), (e + 0.056, ey + 0.05, z_eave + 0.005)), rafter)
        for ex in (x0, x1):
            add_box(scene, f"{name}EaveY{i}{ex:.2f}", *map_box((ex - 0.05, e, z_eave - 0.07), (ex + 0.05, e + 0.056, z_eave + 0.005)), rafter)


def _tenshu_chidori_hafu(
    scene: bpy.types.Scene,
    name: str,
    cx: float,
    cy: float,
    face: str,
    width: float,
    body_half: float,
    z_eave: float,
    rise: float,
    mats: dict,
    scale: float = 1.0,
) -> None:
    """Chidori-hafu dormer gable riding a skirt roof slope; the white plaster
    triangle faces the camera-visible S or E face."""
    plaster = mats["plaster"]
    trim = mats.get("ridge", mats["trim"])
    hw = width / 2.0
    z0 = z_eave + 0.04 * scale
    z1 = z_eave + rise * 1.18
    front = body_half + 0.34 * scale
    back = body_half - 0.42 * scale
    if face == "S":
        low = map_xy(cx - hw, cy + back)
        high = map_xy(cx + hw, cy + front)
        lo = (min(low[0], high[0]), min(low[1], high[1]))
        hi = (max(low[0], high[0]), max(low[1], high[1]))
        add_gable_roof(scene, f"{name}Roof", lo, hi, z0, z1, "y", mats["roof_y"], end_material=plaster)
        add_box(scene, f"{name}Cap", *map_box((cx - 0.035, cy + back - 0.02, z1 - 0.015), (cx + 0.035, cy + front + 0.02, z1 + 0.045)), trim)
        add_box(scene, f"{name}Barge", *map_box((cx - hw - 0.03, cy + front - 0.035, z0 - 0.045), (cx + hw + 0.03, cy + front + 0.035, z0 + 0.005)), trim)
    else:  # "E"
        low = map_xy(cx + back, cy - hw)
        high = map_xy(cx + front, cy + hw)
        lo = (min(low[0], high[0]), min(low[1], high[1]))
        hi = (max(low[0], high[0]), max(low[1], high[1]))
        add_gable_roof(scene, f"{name}Roof", lo, hi, z0, z1, "x", mats["roof"], end_material=plaster)
        add_box(scene, f"{name}Cap", *map_box((cx + back - 0.02, cy - 0.035, z1 - 0.015), (cx + front + 0.02, cy + 0.035, z1 + 0.045)), trim)
        add_box(scene, f"{name}Barge", *map_box((cx + front - 0.035, cy - hw - 0.03, z0 - 0.045), (cx + front + 0.035, cy + hw + 0.03, z0 + 0.005)), trim)


def _tenshu_windows(
    scene: bpy.types.Scene,
    name: str,
    cx: float,
    cy: float,
    w: float,
    z0: float,
    h: float,
    mats: dict,
) -> None:
    """Koshi (lattice) window rows on the two camera-visible faces."""
    plaster = mats["plaster"]
    trim = mats["trim"]
    half = w / 2.0
    count = max(2, int(round(w * 0.85)))
    ww = 0.30
    wz0 = z0 + h * 0.40
    wz1 = z0 + h * 0.68
    span = w - 0.70
    step = span / max(1, count - 1) if count > 1 else 0.0
    for i in range(count):
        u = cx - span / 2.0 + i * step
        # South face (y = cy + half).
        fy = cy + half
        add_box(scene, f"{name}SFrame{i}", *map_box((u - ww / 2 - 0.035, fy - 0.02, wz0 - 0.035), (u + ww / 2 + 0.035, fy + 0.018, wz1 + 0.035)), plaster)
        add_box(scene, f"{name}SWin{i}", *map_box((u - ww / 2, fy - 0.01, wz0), (u + ww / 2, fy + 0.024, wz1)), trim)
        bar = u - ww / 2 + 0.045
        while bar < u + ww / 2 - 0.02:
            add_box(scene, f"{name}SBar{i}{bar:.2f}", *map_box((bar, fy - 0.005, wz0), (bar + 0.032, fy + 0.030, wz1)), plaster)
            bar += 0.085
        # East face (x = cx + half).
        v = cy - span / 2.0 + i * step
        fx = cx + half
        add_box(scene, f"{name}EFrame{i}", *map_box((fx - 0.02, v - ww / 2 - 0.035, wz0 - 0.035), (fx + 0.018, v + ww / 2 + 0.035, wz1 + 0.035)), plaster)
        add_box(scene, f"{name}EWin{i}", *map_box((fx - 0.01, v - ww / 2, wz0), (fx + 0.024, v + ww / 2, wz1)), trim)
        bar = v - ww / 2 + 0.045
        while bar < v + ww / 2 - 0.02:
            add_box(scene, f"{name}EBar{i}{bar:.2f}", *map_box((fx - 0.005, bar, wz0), (fx + 0.030, bar + 0.032, wz1)), plaster)
            bar += 0.085


def _tenshu_katomado(
    scene: bpy.types.Scene,
    name: str,
    cx: float,
    cy: float,
    half: float,
    z_center: float,
    mats: dict,
    scale: float = 1.0,
) -> None:
    """Kato-mado (bell-shaped windows) centered on the top story's visible
    faces: plaster surround with a dark peaked-arch panel."""
    plaster = mats["plaster"]
    trim = mats["trim"]

    def pentagon(hw: float, hz: float, peak: float):
        return [(-hw, -hz), (hw, -hz), (hw, hz), (0.0, hz + peak), (-hw, hz)]

    for face in ("S", "E"):
        for layer, (hw, hz, peak, proud, material) in enumerate((
            (0.20 * scale, 0.16 * scale, 0.10 * scale, 0.020, plaster),
            (0.145 * scale, 0.115 * scale, 0.075 * scale, 0.032, trim),
        )):
            vertices = []
            for u, dz in pentagon(hw, hz, peak):
                if face == "S":
                    x, y = cx + u, cy + half + proud
                else:
                    x, y = cx + half + proud, cy + u
                vertices.append((*map_xy(x, y), z_center + dz))
            add_mesh(scene, f"{name}{face}{layer}", vertices, [tuple(range(5))], material)


def _tenshu_koran(
    scene: bpy.types.Scene,
    name: str,
    cx: float,
    cy: float,
    offset: float,
    z_base: float,
    mats: dict,
    scale: float = 1.0,
) -> None:
    """High-rimmed balcony rail (koran) around the top story."""
    dark = mats["dark_wood"]
    rail_h = 0.26 * scale
    x0, y0 = cx - offset, cy - offset
    x1, y1 = cx + offset, cy + offset
    for rz0, rz1 in ((z_base + rail_h - 0.045, z_base + rail_h), (z_base + 0.08, z_base + 0.115)):
        add_box(scene, f"{name}RailN{rz0:.2f}", *map_box((x0 - 0.03, y0 - 0.03, rz0), (x1 + 0.03, y0 + 0.03, rz1)), dark)
        add_box(scene, f"{name}RailS{rz0:.2f}", *map_box((x0 - 0.03, y1 - 0.03, rz0), (x1 + 0.03, y1 + 0.03, rz1)), dark)
        add_box(scene, f"{name}RailW{rz0:.2f}", *map_box((x0 - 0.03, y0 - 0.03, rz0), (x0 + 0.03, y1 + 0.03, rz1)), dark)
        add_box(scene, f"{name}RailE{rz0:.2f}", *map_box((x1 - 0.03, y0 - 0.03, rz0), (x1 + 0.03, y1 + 0.03, rz1)), dark)
    positions = (x0, (x0 + x1) / 2.0, x1)
    for px in positions:
        for py in positions:
            if px in (x0, x1) or py in (y0, y1):
                add_box(scene, f"{name}Post{px:.2f}{py:.2f}", *map_box((px - 0.028, py - 0.028, z_base), (px + 0.028, py + 0.028, z_base + rail_h)), dark)


def _tenshu_shachi(scene: bpy.types.Scene, name: str, x: float, y: float, z: float, gold: bpy.types.Material, scale: float = 1.0) -> None:
    """Simplified shachihoko silhouette: arched body with a raised tail."""
    from .core import add_beam
    s = scale
    add_box(scene, f"{name}Body", *map_box((x - 0.055 * s, y - 0.042 * s, z), (x + 0.055 * s, y + 0.042 * s, z + 0.20 * s)), gold)
    add_beam(scene, f"{name}Tail", (x, y, z + 0.16 * s), (x + 0.0, y + 0.0, z + 0.30 * s), 0.075 * s, gold, tip_thickness=0.035 * s)


def build_tenshu(scene: bpy.types.Scene, variant: str = TENSHU_DEFAULT_VARIANT, scale: float | None = None) -> None:
    """Production three-tier keep on a 4x4 lot. Canvas 320x320, anchor 160,288.

    Low ishigaki mound exactly one terrain elevation step tall (the scenario
    terrain hill supplies the height drama); the first story rises almost
    flush with the stone crest (no visible flat between ishigaki edge and
    plaster wall), then shrinking stories: dark shitami-ita skirt boards +
    aged white plaster, koshi window rows, hipped kawara skirt roofs with
    sumimune hips, chidori-hafu dormers, kato-mado and a koran rail on the
    top story, gabled top roof with shachi finials.
    `scale` shrinks the keep heights/roofs uniformly (tier widths in the
    variant spec are pre-divided by it so the footprint stays flush) while
    the mound stays lot-sized and 1-step tall. Same shared iso camera as
    every building, so all ridge lines land on the 2:1 tile angle."""
    spec = TENSHU_VARIANTS[variant]
    s = TENSHU_DEFAULT_SCALE if scale is None else scale
    mats = _tenshu_material_set()
    plaster = mats["plaster"]
    dark = mats["dark_wood"]
    hem = mats["hem"]
    gold = make_material("TenshuShachi", (0.58, 0.46, 0.17, 1.0))

    cx, cy = -2.0, -2.0  # lot center of the [-4,0]x[-4,0] footprint

    # --- Ishigaki mound: ONE terrain step tall, built with the exact same
    # coursed kirikomi masonry as the terrain revetments (ISHIGAKI-03: one
    # stone-wall vocabulary — no patchwork between mound and terrain walls).
    # No corner quoin blocks (user ruling 2026-07-19).
    height = TENSHU_ISHIGAKI_TOP
    crest_half = _kirikomi_mound(scene, cx, cy, TENSHU_MOUND_BASE_HALF, height)

    # Thin gravel bed under the first story. The story wall rises within
    # ~0.14 units of the stone crest, so only a sliver of this (plus the
    # stone rim) ever reads on screen — no walkable 犬走り flat remains.
    walk = crest_half - 0.10
    add_box(scene, "IshigakiWalk", *map_box((cx - walk, cy - walk, height), (cx + walk, cy + walk, height + 0.018)), mats["gravel"])

    tiers = [(w * s, body_h * s) for w, body_h in spec["tiers"]]
    rises = [r * s for r in spec["rises"]]
    hafu_spec = {(t, f): w for t, f, w in spec["hafu"]}
    skirt_h = 0.14 * s
    hem_top = 0.23 * s
    z = height
    for index, (w, body_h) in enumerate(tiers):
        half = w / 2.0
        low = (cx - half, cy - half)
        high = (cx + half, cy + half)
        # Dark shitami-ita skirt band, hem-grimed plaster foot, then aged
        # white plaster body (the hem keeps the whitewash from reading as
        # fresh paint next to the weathered raster neighbours).
        add_box(scene, f"T{index}Skirt", *map_box((low[0] - 0.02, low[1] - 0.02, z), (high[0] + 0.02, high[1] + 0.02, z + skirt_h)), dark)
        add_box(scene, f"T{index}Hem", *map_box((low[0] - 0.004, low[1] - 0.004, z + skirt_h), (high[0] + 0.004, high[1] + 0.004, z + hem_top)), hem)
        add_box(scene, f"T{index}Body", *map_box((low[0], low[1], z + skirt_h), (high[0], high[1], z + body_h)), plaster)
        if index < len(tiers) - 1:
            _tenshu_windows(scene, f"T{index}", cx, cy, w, z + hem_top, body_h - hem_top, mats)
            z_eave = z + body_h
            rise = rises[index]
            outer_w = w + 0.48 * s
            inner_w = tiers[index + 1][0] + 0.18 * s
            _tenshu_skirt_roof(scene, f"T{index}Roof", cx, cy, outer_w, inner_w, z_eave, z_eave + rise, mats)
            for face in ("S", "E"):
                hafu_w = hafu_spec.get((index, face))
                if hafu_w is not None:
                    _tenshu_chidori_hafu(scene, f"T{index}Hafu{face}", cx, cy, face, w * hafu_w, half, z_eave, rise, mats, scale=s)
            z = z_eave + rise - 0.10 * s
        else:
            # Top story: koran rail, kato-mado, gabled kawara roof, shachi.
            _tenshu_koran(scene, "Koran", cx, cy, half + 0.22 * s, z - 0.02, mats, scale=s)
            _tenshu_katomado(scene, "Kato", cx, cy, half, z + skirt_h + (body_h - skirt_h) * 0.52, mats, scale=s)
            z_eave = z + body_h
            ridge_z = z_eave + spec["top_rise"] * s
            # Tighter top-roof overhang than before (0.46/0.40): keeps the
            # top roof clearly the smallest — target <=55% of the tier-0
            # skirt roof width on screen so the keep reads slim, not squat.
            roof_low = (cx - half - 0.33 * s, cy - half - 0.29 * s)
            roof_high = (cx + half + 0.33 * s, cy + half + 0.29 * s)
            add_kawara_roof(scene, "TopRoof", roof_low, roof_high, z_eave, ridge_z, "x", mats["roof"], mats["ridge"], verge_material=plaster)
            for sx in (-1.0, 1.0):
                _tenshu_shachi(scene, f"Shachi{sx:+.0f}", cx + sx * (half + 0.30 * s), cy, ridge_z + 0.10 * s, gold, scale=s)


def build_farm_paddy(scene: bpy.types.Scene, season: str = "spring") -> None:
    """Rice paddy filling a 4x4 surface footprint. Canvas 256x128, anchor 128,64.

    Seasonal variants share the exact same base/aze-ridge structure and plant
    grid positions so the silhouette never jumps when the season switches:
    - spring: flooded, pale reflective water + freshly planted small seedlings
    - summer: lush tall green rice rows, water barely visible (dark, shaded)
    - autumn: golden ripe rice with drooping ear tips and subtle color patches
    - winter: harvested; dry bare soil with short pale stubble rows
    """
    import math as _math

    ridge = make_textured_material("AzeDirt", (0.185, 0.150, 0.105), (0.265, 0.220, 0.160), scale=9.0)

    add_box(scene, "FieldBase", *map_box((-2.0, -2.0, 0.0), (2.0, 2.0, 0.02)), ridge)

    # Paddy inner surface: what fills the basin between the aze ridges.
    if season == "spring":
        # Pale blue-gray water with a hint of sky reflection.
        surface = make_noise_material("PaddyWater", (0.150, 0.225, 0.250), (0.280, 0.370, 0.400), scale=5.0)
        add_box(scene, "Water", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.045)), surface)
    elif season == "summer":
        # Dark green-tinted water, mostly hidden under the grown rows.
        surface = make_noise_material("PaddyWaterSummer", (0.040, 0.080, 0.062), (0.062, 0.110, 0.082), scale=5.0)
        add_box(scene, "Water", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.040)), surface)
    elif season == "autumn":
        # Drained field: damp dark soil under the ripe rows.
        surface = make_textured_material("PaddyMud", (0.110, 0.088, 0.058), (0.180, 0.148, 0.100), scale=8.0)
        add_box(scene, "Mud", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.040)), surface)
    else:
        # Winter: dry cracked pale earth, one tone for the whole basin.
        surface = make_textured_material("PaddyDrySoil", (0.165, 0.135, 0.095), (0.270, 0.228, 0.168), scale=7.0)
        add_box(scene, "DrySoil", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.042)), surface)

    half_ridge = 0.07
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

    # Plant materials per season (two-tone alternation for painterly ムラ).
    if season == "spring":
        plant_a = make_material("PaddySeedling", (0.210, 0.330, 0.115, 1.0))
        plant_b = make_material("PaddySeedlingD", (0.150, 0.250, 0.085, 1.0))
    elif season == "summer":
        plant_a = make_material("PaddyRiceGreen", (0.110, 0.260, 0.068, 1.0))
        plant_b = make_material("PaddyRiceGreenD", (0.075, 0.190, 0.048, 1.0))
        tuft = make_material("PaddyRiceGreenL", (0.170, 0.330, 0.095, 1.0))
    elif season == "autumn":
        plant_a = make_material("PaddyRiceGold", (0.470, 0.320, 0.078, 1.0))
        plant_b = make_material("PaddyRiceGoldD", (0.360, 0.225, 0.055, 1.0))
        ear = make_material("PaddyRiceEar", (0.560, 0.415, 0.115, 1.0))
    else:
        plant_a = make_material("PaddyStubble", (0.310, 0.258, 0.155, 1.0))
        plant_b = make_material("PaddyStubbleD", (0.245, 0.198, 0.118, 1.0))

    # Common grid: 4 quadrants x 5 rows x 6 columns; per-season only the
    # clump size / height / material changes so positions stay identical.
    for qx, qy in ((-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)):
        for row in range(5):
            ry = qy - 0.75 + row * 0.32
            for col in range(6):
                rx = qx - 0.72 + col * 0.29 + (0.07 if row % 2 else 0.0)
                if abs(rx - qx) > 0.8 or abs(ry - qy) > 0.8:
                    continue
                mat = plant_a if (row + col) % 3 else plant_b
                jitter = 0.03 * _math.sin(rx * 12.7 + ry * 7.3)
                name = f"Rice{qx}{qy}{row}{col}"
                if season == "spring":
                    add_box(
                        scene,
                        name,
                        *map_box((rx - 0.028 + jitter, ry - 0.028, 0.045), (rx + 0.028 + jitter, ry + 0.028, 0.13 + 0.02 * ((row + col) % 2))),
                        mat,
                    )
                elif season == "summer":
                    # Wide lush clumps almost closing over the water, with a
                    # smaller light-green tuft on top to break the box look.
                    half = 0.080 + 0.012 * ((row * 7 + col * 3) % 3)
                    top = 0.26 + 0.030 * ((row + col) % 3)
                    add_box(
                        scene,
                        name,
                        *map_box((rx - half + jitter, ry - half, 0.030), (rx + half + jitter, ry + half, top)),
                        mat,
                    )
                    add_box(
                        scene,
                        f"{name}Tuft",
                        *map_box(
                            (rx - half * 0.55 + jitter, ry - half * 0.55, top - 0.01),
                            (rx + half * 0.55 + jitter, ry + half * 0.55, top + 0.055),
                        ),
                        tuft,
                    )
                elif season == "autumn":
                    # Ripe stalks slightly shorter than summer; a small offset
                    # cap box in warm ear-yellow suggests the drooping heads.
                    half = 0.080 + 0.010 * ((row * 5 + col) % 3)
                    top = 0.24 + 0.03 * ((row + col) % 3)
                    add_box(
                        scene,
                        name,
                        *map_box((rx - half + jitter, ry - half, 0.030), (rx + half + jitter, ry + half, top)),
                        mat,
                    )
                    droop = 0.05 * _math.copysign(1.0, _math.sin(rx * 9.1 + ry * 5.3))
                    add_box(
                        scene,
                        f"{name}Ear",
                        *map_box(
                            (rx - half * 0.7 + jitter + droop, ry - half * 0.7 + droop * 0.4, top - 0.015),
                            (rx + half * 0.7 + jitter + droop, ry + half * 0.7 + droop * 0.4, top + 0.028),
                        ),
                        ear,
                    )
                else:
                    # Winter stubble: short dry stubs, roughly one in three cut
                    # clean to the ground (skipped) for a sparse harvested look.
                    if (row * 11 + col * 5) % 3 == 0:
                        continue
                    add_box(
                        scene,
                        name,
                        *map_box((rx - 0.024 + jitter, ry - 0.024, 0.042), (rx + 0.024 + jitter, ry + 0.024, 0.085 + 0.012 * ((row + col) % 2))),
                        mat,
                    )
