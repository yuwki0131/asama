"""Machiya builders (isolated copy of the buildings.py machiya code path).

Duplicated rather than imported: the isolated cache key hashes only this
package plus core.py/materials.py, so importing geometry from buildings.py or
vegetation.py would let those files change without invalidating machiya
renders. Divergence from the source copy is intentional only in the material
set (weathered, sun-bleached planks for the v2 body and v3 itabuki roof, and
the v2-only weathered kawara roof + wood verge that keep packed rows from
reading as one repeated unit — in rows only roofs/gables stay visible).
"""
from __future__ import annotations

import math

import bpy

from ..core import add_beam, add_box, add_gable_roof, map_box
from ..materials import (
    PAD_PALETTES,
    building_material_set,
    make_fringed_pad_material,
    make_material,
    make_plank_material,
    make_showcase_roof,
    prop_materials,
)

YARD_PAD_HEIGHT = 0.02


def machiya_material_set() -> dict[str, bpy.types.Material]:
    """Shared building materials plus bleached planks for the dark variants.

    DarkWood (0.046..0.098 linear) reads as pure black once painterly grading
    lands on it; these lifted plank tones keep the weathered look while
    clearing the opaque-mean-luma >= 48 floor (fence precedent: a ~2.3x lift
    landed at luma 55-64).
    """
    mats = building_material_set()
    mats["body_plank"] = make_plank_material(
        "MachiyaWeatheredPlank", (0.150, 0.120, 0.082), (0.280, 0.232, 0.165)
    )
    mats["itabuki_plank"] = make_plank_material(
        "MachiyaItabukiPlank", (0.165, 0.150, 0.120), (0.300, 0.272, 0.220)
    )
    # In packed rows only the roof + gable stay visible (bodies occlude each
    # other), so v2 gets its own roof family: sun-bleached warm-brown kawara.
    # V-13: the first weathered pass still rendered at roof-band luma ~47 —
    # within 4 points of the v1 ibushi dark (~51), so 2/3 of a packed row read
    # as the same near-black roof. Lifted to a clear mid tone (target band
    # ~66-74, sitting between v1 ~51 and the v3 itabuki ~87) with lighter mud
    # and less grime so the three-variant rhythm survives at map scale.
    weathered = dict(
        name="MachiyaRoofWeathered",
        base_dark=(0.295, 0.235, 0.155),
        base_light=(0.560, 0.450, 0.285),
        mud=(0.280, 0.220, 0.140),
        columns=7.0,
        seam=(0.50, 0.42, 0.29),
        grime_strength=0.24,
    )
    mats["roof_v2"] = make_showcase_roof("x", **weathered)
    weathered["name"] = "MachiyaRoofWeatheredY"
    mats["roof_v2_y"] = make_showcase_roof("y", **weathered)
    return mats


def add_yard_pad(scene: bpy.types.Scene, lot_width: float, lot_height: float, kind: str = "gravel") -> None:
    """Flat pad covering the map [-lot_width..0]x[-lot_height..0] lot."""
    dark, light = PAD_PALETTES[kind]
    material = make_fringed_pad_material(lot_width, lot_height, dark, light)
    add_box(scene, "YardPad", *map_box((-lot_width, -lot_height, 0.0), (0.0, 0.0, YARD_PAD_HEIGHT)), material)


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
    seed = sum(ord(c) for c in name)
    span = (x1 - x0) if ridge_axis == "x" else (y1 - y0)
    count = max(3, int(span / 0.34))
    slope_len = ((y1 - y0) if ridge_axis == "x" else (x1 - x0)) / 2.0
    rise = ridge_z - base_z
    for row, frac in ((0, 0.36), (1, 0.68)):
        for i in range(count):
            along = (i + 0.5) / count * span + 0.05 * math.sin(seed + row * 9.1 + i * 5.7)
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


def add_prop_weeds(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    tufts = [(0.0, 0.0), (0.12, -0.06), (-0.10, 0.08), (0.04, 0.13), (-0.13, -0.10)]
    for index, (tx, ty) in enumerate(tufts):
        height = 0.14 + (index % 3) * 0.04
        add_beam(scene, f"Weed{cx}{cy}{index}", (cx + tx, cy + ty, 0.0), (cx + tx + 0.03, cy + ty - 0.02, height), 0.018, mats["grass"])


def build_machiya(scene: bpy.types.Scene, variant: int = 1, orientation: str = "nw_se") -> None:
    """Tanzaku machiya (narrow-frontage townhouse) on a 2x1 lot.

    Local frame: u along the long axis in [-2, 0], v across in [-1, 0].
    orientation "nw_se" keeps (u, v) = (x, y); "ne_sw" swaps to a 1x2 lot.
    Variants: 1 = hirairi plaster two-story with koshi lattice, 2 = tsumairi
    weathered-plank house with white gable verge and door awning, 3 = itabuki
    bleached-plank roof cottage. Canvas 192x160, anchor 112,128 (nw_se)
    / 80,128 (ne_sw).
    """
    swap = orientation == "ne_sw"

    def pt(u: float, v: float) -> tuple[float, float]:
        return (v, u) if swap else (u, v)

    def rect(a: tuple[float, float], b: tuple[float, float]) -> tuple[tuple[float, float], tuple[float, float]]:
        (ax, ay), (bx, by) = pt(*a), pt(*b)
        return (min(ax, bx), min(ay, by)), (max(ax, bx), max(ay, by))

    def box(name: str, a: tuple[float, float], b: tuple[float, float], z0: float, z1: float, material: bpy.types.Material) -> None:
        low, high = rect(a, b)
        add_box(scene, name, *map_box((low[0], low[1], z0), (high[0], high[1], z1)), material)

    axis = "y" if swap else "x"
    mats = machiya_material_set()
    props = prop_materials()
    cloth = make_material("MachiyaNoren", (0.075, 0.105, 0.200, 1.0))
    splash = make_material("MachiyaSplash", (0.150, 0.140, 0.122, 1.0))

    add_yard_pad(scene, 1.0 if swap else 2.0, 2.0 if swap else 1.0, "dirt")

    if variant == 1:
        # Hirairi: plaster tsushi-nikai facing the long side. Door + noren and
        # koshi lattice on the long face, mushiko windows under the eaves.
        plinth_top, wall_top, ridge_top = 0.10, 1.18, 1.56
        box("Plinth", (-1.94, -0.94), (-0.06, -0.05), 0.0, plinth_top, mats["stone"])
        box("Body", (-1.88, -0.88), (-0.12, -0.10), plinth_top, wall_top, mats["plaster"])
        box("Splash", (-1.90, -0.90), (-0.10, -0.08), plinth_top, plinth_top + 0.07, splash)
        # Long street face (v-high): central doorway, indigo noren, koshi.
        box("Door", (-1.25, -0.105), (-0.85, -0.070), plinth_top, 0.78, mats["dark_wood"])
        box("Noren", (-1.29, -0.070), (-0.81, -0.050), 0.56, 0.80, cloth)
        for side, (k0, k1) in enumerate(((-1.80, -1.33), (-0.77, -0.20))):
            box(f"KoshiBack{side}", (k0, -0.100), (k1, -0.080), 0.16, 0.72, mats["trim"])
            bar = k0 + 0.03
            while bar < k1 - 0.03:
                box(f"Koshi{side}{bar:.2f}", (bar, -0.080), (bar + 0.035, -0.060), 0.16, 0.72, mats["dark_wood"])
                bar += 0.10
        # Mushiko-mado: squat barred openings in the upper plaster.
        for index, (w0, w1) in enumerate(((-1.62, -1.18), (-0.86, -0.42))):
            box(f"MushikoBack{index}", (w0, -0.100), (w1, -0.082), 0.86, 1.06, mats["trim"])
            bar = w0 + 0.045
            while bar < w1 - 0.02:
                box(f"Mushiko{index}{bar:.2f}", (bar, -0.082), (bar + 0.032, -0.062), 0.86, 1.06, mats["plaster"])
                bar += 0.085
        # Gable-end face (u-high): weatherboard skirt against rain splash.
        box("Shitami", (-0.120, -0.86), (-0.098, -0.12), plinth_top, 0.58, mats["dark_wood"])
        add_kawara_roof(
            scene, "MachiyaRoof", *rect((-2.0, -1.0), (0.0, 0.0)), wall_top, ridge_top, axis,
            mats["roof"] if axis == "x" else mats["roof_y"], mats["trim"], verge_material=mats["plaster"],
        )
    elif variant == 2:
        # Tsumairi: weathered shitami-ita planks, entrance on the gable end
        # under a slab awning; the white-plastered verge marks the street gable.
        plinth_top, wall_top, ridge_top = 0.08, 0.90, 1.34
        box("Plinth", (-1.94, -0.94), (-0.06, -0.05), 0.0, plinth_top, mats["stone"])
        box("Body", (-1.88, -0.88), (-0.12, -0.10), plinth_top, wall_top, mats["body_plank"])
        box("Splash", (-1.90, -0.90), (-0.10, -0.08), plinth_top, plinth_top + 0.06, splash)
        # Gable street face (u-high): door, noren, awning band.
        box("Door", (-0.125, -0.63), (-0.095, -0.35), plinth_top, 0.72, mats["wood"])
        box("Noren", (-0.095, -0.66), (-0.075, -0.32), 0.52, 0.74, cloth)
        box("Hisashi", (-0.115, -0.90), (-0.02, -0.08), 0.76, 0.80, mats["trim"])
        # Long face: two barred koshi windows in the planking.
        for index, (w0, w1) in enumerate(((-1.66, -1.24), (-0.84, -0.42))):
            box(f"KoshiBack{index}", (w0, -0.100), (w1, -0.080), 0.30, 0.64, mats["trim"])
            bar = w0 + 0.03
            while bar < w1 - 0.03:
                box(f"Koshi{index}{bar:.2f}", (bar, -0.080), (bar + 0.035, -0.060), 0.30, 0.64, mats["dark_wood"])
                bar += 0.095
        add_kawara_roof(
            scene, "MachiyaRoof", *rect((-2.0, -1.0), (0.0, 0.0)), wall_top, ridge_top, axis,
            mats["roof_v2"] if axis == "x" else mats["roof_v2_y"], mats["trim"], verge_material=mats["trim"],
        )
    else:
        # Itabuki cottage: low plank walls under a stone-weighted board roof.
        plinth_top, wall_top, ridge_top = 0.06, 0.74, 1.06
        box("Plinth", (-1.94, -0.94), (-0.06, -0.05), 0.0, plinth_top, mats["stone"])
        box("Body", (-1.88, -0.88), (-0.12, -0.10), plinth_top, wall_top, mats["wood"])
        box("Splash", (-1.90, -0.90), (-0.10, -0.08), plinth_top, plinth_top + 0.055, splash)
        box("Shitami", (-1.885, -0.885), (-0.115, -0.095), plinth_top, 0.36, mats["dark_wood"])
        box("Door", (-1.30, -0.105), (-0.95, -0.070), plinth_top, 0.62, mats["dark_wood"])
        for index, (w0, w1) in enumerate(((-1.74, -1.42), (-0.72, -0.34)),):
            box(f"WinBack{index}", (w0, -0.100), (w1, -0.082), 0.34, 0.60, mats["trim"])
            bar = w0 + 0.03
            while bar < w1 - 0.03:
                box(f"WinBar{index}{bar:.2f}", (bar, -0.082), (bar + 0.032, -0.062), 0.34, 0.60, mats["dark_wood"])
                bar += 0.09
        add_itabuki_roof(
            scene, "MachiyaRoof", *rect((-2.0, -1.0), (0.0, 0.0)), wall_top, ridge_top, axis,
            mats["itabuki_plank"], props["stone"],
        )
        add_prop_weeds(scene, *pt(-1.82, -0.14), props)

    # Corner plugs: the plinth/splash/shitami skirts step outward past the wall
    # face, so at each silhouette corner a diagonal sight line can slip between
    # skirt top and eave past both wall faces, leaving pinhole alpha gaps
    # (NOISE-06). Wall-height posts 0.005 proud of the plinth close them.
    plug = mats["plaster"] if variant == 1 else (mats["body_plank"] if variant == 2 else mats["dark_wood"])
    for su, (u0, u1) in (("W", (-1.945, -1.80)), ("E", (-0.20, -0.055))):
        for sv, (v0, v1) in (("S", (-0.945, -0.80)), ("N", (-0.20, -0.045))):
            box(f"CornerPlug{su}{sv}", (u0, v0), (u1, v1), 0.0, wall_top, plug)
