"""Town block visual variants (building.town_block.v2 .. v5).

Standalone entry point so the shared render_asset_lib modules stay
byte-identical (editing registry.py/buildings.py would invalidate the
whole production render cache). The four variant grayboxes here are the
3D composition bases for the paintover pipeline:

    blender --background --factory-startup --python \
        assets/source/blender/scripts/render_town_block_variants.py -- \
        --variants 2,3,4,5 --supersample 8 \
        --output-directory assets/intermediate/raw-renders

Canvas/anchor match building.town_block (416x304, anchor 208,272; 6x6 lot).

Variant design intent (art direction: sengoku machiya streetscape):
    v2  omote-dori nagaya  — long single-storey row house on the street
                             front, two-storey machiya + board-roof shed
                             behind, drying rack in the yard.
    v3  L-shaped corner    — two-storey corner shop with wings facing both
                             streets, inner courtyard with well/lantern.
    v4  tsumairi trio      — three gable-fronted houses shoulder to
                             shoulder, mixed heights and roofings.
    v5  dozo lane          — plastered store house (namako base) behind a
                             wide-noren shop, stacked goods.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

from render_asset_lib import core
from render_asset_lib.core import (
    PX_PER_UNIT,
    add_box, map_box, reset_scene, setup_camera, setup_render,
)
from render_asset_lib.buildings import add_itabuki_roof, add_kawara_roof, add_yard_pad
from render_asset_lib.materials import (
    building_material_set, make_material, make_namako_material, prop_materials,
)
from render_asset_lib.vegetation import (
    add_prop_bale, add_prop_barrel, add_prop_bush, add_prop_firewood,
    add_prop_lantern, add_prop_weeds, add_prop_well,
)

CANVAS = (416, 304)
ANCHOR = (208, 272)

NOREN_COLORS = {
    "indigo": (0.075, 0.105, 0.200, 1.0),
    "rust": (0.180, 0.085, 0.045, 1.0),
    "moss": (0.085, 0.120, 0.060, 1.0),
    "charcoal": (0.055, 0.055, 0.060, 1.0),
}


def _noren(name: str) -> bpy.types.Material:
    return make_material(f"Noren{name}", NOREN_COLORS[name])


def add_roof(scene, name, low, high, wall_top, ridge_top, axis, kind, mats, props, wall_key):
    """Kawara or itabuki roof with the same overhang conventions as v1."""
    if kind == "itabuki":
        add_itabuki_roof(
            scene, f"{name}Roof",
            (low[0] - 0.14, low[1] - 0.14), (high[0] + 0.14, high[1] + 0.14),
            wall_top, ridge_top, axis, mats["dark_wood"], props["stone"],
        )
        return
    roof_mat = mats["roof"] if axis == "x" else mats["roof_y"]
    verge = mats["plaster"] if wall_key == "plaster" else mats["dark_wood"]
    add_kawara_roof(
        scene, f"{name}Roof",
        (low[0] - 0.16, low[1] - 0.16), (high[0] + 0.16, high[1] + 0.16),
        wall_top, ridge_top, axis, roof_mat, mats["trim"], verge_material=verge,
    )


def facade(scene, name, low, high, wall_top, mats, front="y", door_t=0.5,
           noren=None, door_w=0.20, koshi=True, upper_window=None):
    """Street-side dressing: door, optional noren, koshi lattice, upper window.

    front="y" dresses the +y face (screen lower-left), front="x" the +x face
    (screen lower-right). door_t is the door center along the facade (0..1).
    """
    if front == "y":
        f = high[1]
        a0, a1 = low[0], high[0]
    else:
        f = high[0]
        a0, a1 = low[1], high[1]

    def fbox(bname, u0, u1, off0, off1, z0, z1, material):
        if front == "y":
            add_box(scene, bname, *map_box((u0, f + off0, z0), (u1, f + off1, z1)), material)
        else:
            add_box(scene, bname, *map_box((f + off0, u0, z0), (f + off1, u1, z1)), material)

    door_u = a0 + (a1 - a0) * door_t
    fbox(f"{name}Door", door_u - door_w, door_u + door_w, -0.01, 0.025, 0.0, 0.66, mats["dark_wood"])
    if noren is not None:
        fbox(f"{name}Noren", door_u - door_w - 0.04, door_u + door_w + 0.04, 0.025, 0.045, 0.46, 0.68, noren)
    if koshi:
        for side, (k0, k1) in enumerate(((a0 + 0.12, door_u - door_w - 0.10), (door_u + door_w + 0.10, a1 - 0.12))):
            if k1 - k0 < 0.2:
                continue
            fbox(f"{name}KoshiBack{side}", k0, k1, -0.005, 0.015, 0.10, 0.62, mats["trim"])
            bar = k0 + 0.03
            while bar < k1 - 0.03:
                fbox(f"{name}Koshi{side}{bar:.2f}", bar, bar + 0.035, 0.015, 0.035, 0.10, 0.62, mats["dark_wood"])
                bar += 0.10
    if upper_window is not None and wall_top > 1.4:
        w0, w1 = upper_window
        fbox(f"{name}UpWin", w0, w1, -0.005, 0.02, 1.08, 1.36, mats["trim"])
        bar = w0 + 0.04
        while bar < w1 - 0.035:
            fbox(f"{name}UpBar{bar:.2f}", bar, bar + 0.035, 0.02, 0.035, 1.08, 1.36, mats["plaster"])
            bar += 0.09


def add_drying_rack(scene, cx, cy, axis, mats, cloth_names=("indigo", "rust")):
    """Monohoshi: two posts, one beam, hanging cloth panels."""
    dark = mats["dark_wood"]
    half = 0.55
    if axis == "x":
        posts = ((cx - half, cy), (cx + half, cy))
    else:
        posts = ((cx, cy - half), (cx, cy + half))
    for px, py in posts:
        add_box(scene, f"RackPost{px:.2f}{py:.2f}", *map_box((px - 0.035, py - 0.035, 0.0), (px + 0.035, py + 0.035, 0.98)), dark)
    if axis == "x":
        add_box(scene, f"RackBeam{cx:.2f}{cy:.2f}", *map_box((cx - half - 0.06, cy - 0.025, 0.90), (cx + half + 0.06, cy + 0.025, 0.95)), dark)
    else:
        add_box(scene, f"RackBeam{cx:.2f}{cy:.2f}", *map_box((cx - 0.025, cy - half - 0.06, 0.90), (cx + 0.025, cy + half + 0.06, 0.95)), dark)
    offsets = (-0.30, 0.05, 0.34)
    for index, off in enumerate(offsets):
        cloth = _noren(cloth_names[index % len(cloth_names)])
        w = 0.22 if index != 1 else 0.18
        drop = 0.42 if index != 2 else 0.30
        if axis == "x":
            add_box(scene, f"RackCloth{index}{cx:.2f}", *map_box((cx + off - w / 2, cy - 0.012, 0.90 - drop), (cx + off + w / 2, cy + 0.012, 0.90)), cloth)
        else:
            add_box(scene, f"RackCloth{index}{cy:.2f}", *map_box((cx - 0.012, cy + off - w / 2, 0.90 - drop), (cx + 0.012, cy + off + w / 2, 0.90)), cloth)


def add_bench(scene, cx, cy, mats, along="x", length=0.62):
    """Endai: low slatted bench by the shopfront."""
    wood = mats["wood"]
    dark = mats["dark_wood"]
    hx = length / 2 if along == "x" else 0.14
    hy = 0.14 if along == "x" else length / 2
    add_box(scene, f"BenchTop{cx:.2f}{cy:.2f}", *map_box((cx - hx, cy - hy, 0.16), (cx + hx, cy + hy, 0.21)), wood)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx = cx + sx * (hx - 0.05)
            ly = cy + sy * (hy - 0.05)
            add_box(scene, f"BenchLeg{lx:.2f}{ly:.2f}", *map_box((lx - 0.03, ly - 0.03, 0.0), (lx + 0.03, ly + 0.03, 0.16)), dark)


def add_crate_stack(scene, cx, cy, mats, levels=2):
    wood = mats["wood"]
    dark = mats["dark_wood"]
    z = 0.0
    size = 0.20
    for level in range(levels):
        s = size - level * 0.02
        add_box(scene, f"Crate{cx:.2f}{cy:.2f}L{level}", *map_box((cx - s, cy - s, z), (cx + s, cy + s, z + 0.20)), wood if level % 2 == 0 else dark)
        z += 0.20


# ---------------------------------------------------------------------------
# Variant grayboxes
# ---------------------------------------------------------------------------

def build_v2(scene):
    """Omote-dori nagaya: street-front row house + two-storey back house."""
    mats = building_material_set()
    props = prop_materials()
    add_yard_pad(scene, 6.0, 6.0, "dirt")

    # Street-front nagaya (single storey, three tenant doors).
    low, high = (-5.7, -2.35), (-0.5, -0.75)
    add_box(scene, "NagayaBody", *map_box((low[0], low[1], 0.0), (high[0], high[1], 0.84)), mats["wood"])
    add_roof(scene, "Nagaya", low, high, 0.84, 1.34, "x", "kawara", mats, props, "wood")
    for index, (t, color) in enumerate(((0.16, "indigo"), (0.5, "rust"), (0.84, "charcoal"))):
        facade(scene, f"NagayaT{index}", low, high, 0.84, mats, front="y", door_t=t, noren=_noren(color), door_w=0.18)

    # Two-storey machiya at the back-west.
    low2, high2 = (-5.6, -5.6), (-3.5, -3.85)
    add_box(scene, "BackHouseBody", *map_box((low2[0], low2[1], 0.0), (high2[0], high2[1], 1.60)), mats["plaster"])
    add_roof(scene, "BackHouse", low2, high2, 1.60, 2.04, "y", "kawara", mats, props, "plaster")
    facade(scene, "BackHouse", low2, high2, 1.60, mats, front="y", door_t=0.4,
           upper_window=(low2[0] + 0.5, high2[0] - 0.5))

    # Board-roof shed at the back-east.
    low3, high3 = (-2.4, -5.5), (-0.6, -4.25)
    add_box(scene, "ShedBody", *map_box((low3[0], low3[1], 0.0), (high3[0], high3[1], 0.72)), mats["dark_wood"])
    add_roof(scene, "Shed", low3, high3, 0.72, 1.05, "x", "itabuki", mats, props, "dark_wood")

    # Yard dressing: laundry, bench, goods.
    add_drying_rack(scene, -2.85, -3.2, "x", mats, ("indigo", "rust"))
    add_bench(scene, -4.55, -0.5, mats, along="x")
    add_prop_barrel(scene, -0.95, -3.4, props)
    add_prop_barrel(scene, -0.7, -3.15, props)
    add_prop_bale(scene, -4.6, -3.15, True, props)
    add_prop_firewood(scene, -5.55, -3.15, props)
    add_prop_well(scene, -1.15, -5.05, props)
    add_prop_weeds(scene, -5.7, -0.35, props)
    add_prop_weeds(scene, -0.35, -5.75, props)
    add_prop_bush(scene, -5.85, -5.95, props, scale=0.7)


def build_v3(scene):
    """L-shaped corner shop: two-storey east wing + shop wing on the south."""
    mats = building_material_set()
    props = prop_materials()
    add_yard_pad(scene, 6.0, 6.0, "dirt")

    # Two-storey wing along the east street (front on +x face).
    low, high = (-2.35, -5.6), (-0.45, -1.05)
    add_box(scene, "EastWingBody", *map_box((low[0], low[1], 0.0), (high[0], high[1], 1.62)), mats["plaster"])
    add_roof(scene, "EastWing", low, high, 1.62, 2.08, "y", "kawara", mats, props, "plaster")
    facade(scene, "EastWingN", low, high, 1.62, mats, front="x", door_t=0.28, noren=_noren("moss"), upper_window=(low[1] + 0.5, low[1] + 1.9))
    facade(scene, "EastWingS", low, high, 1.62, mats, front="x", door_t=0.76, koshi=False, upper_window=(high[1] - 1.9, high[1] - 0.5))

    # Single-storey shop wing along the south street (front on +y face).
    low2, high2 = (-5.7, -2.45), (-2.35, -0.75)
    add_box(scene, "SouthWingBody", *map_box((low2[0], low2[1], 0.0), (high2[0], high2[1], 0.88)), mats["wood"])
    add_roof(scene, "SouthWing", low2, high2, 0.88, 1.38, "x", "kawara", mats, props, "wood")
    facade(scene, "SouthWing", low2, high2, 0.88, mats, front="y", door_t=0.62, noren=_noren("indigo"), door_w=0.26)

    # Inner courtyard (north-west): well, lantern, stores.
    add_prop_well(scene, -4.6, -4.6, props)
    add_prop_lantern(scene, -3.35, -5.2, props)
    add_prop_firewood(scene, -5.45, -3.5, props)
    add_prop_bale(scene, -3.2, -3.6, False, props)
    add_prop_bale(scene, -3.5, -3.4, True, props)
    add_crate_stack(scene, -2.75, -4.9, mats, levels=2)
    add_bench(scene, -3.05, -0.5, mats, along="x")
    add_prop_bush(scene, -5.75, -5.7, props, scale=0.85)
    add_prop_weeds(scene, -5.65, -0.4, props)
    add_prop_weeds(scene, -0.4, -0.5, props)


def build_v4(scene):
    """Tsumairi trio: three gable-fronted houses shoulder to shoulder."""
    mats = building_material_set()
    props = prop_materials()
    add_yard_pad(scene, 6.0, 6.0, "dirt")

    houses = (
        # name, low, high, wall_top, ridge_top, roof kind, wall key, noren, door_t
        ("TsumaW", (-5.7, -3.15), (-4.05, -0.75), 0.86, 1.44, "itabuki", "dark_wood", "rust", 0.5),
        ("TsumaC", (-3.75, -3.45), (-2.05, -0.75), 1.56, 2.14, "kawara", "plaster", "indigo", 0.5),
        ("TsumaE", (-1.75, -3.0), (-0.45, -0.75), 0.82, 1.38, "kawara", "wood", "moss", 0.42),
    )
    for name, low, high, wall_top, ridge_top, kind, wall, noren, door_t in houses:
        add_box(scene, f"{name}Body", *map_box((low[0], low[1], 0.0), (high[0], high[1], wall_top)), mats[wall])
        # Ridge along y so the gable end faces the street (tsumairi).
        add_roof(scene, name, low, high, wall_top, ridge_top, "y", kind, mats, props, wall)
        upper = (low[0] + 0.35, high[0] - 0.35) if wall_top > 1.4 else None
        facade(scene, name, low, high, wall_top, mats, front="y", door_t=door_t, noren=_noren(noren), upper_window=upper)

    # Back yard: laundry line, stores, weeds.
    add_drying_rack(scene, -4.35, -4.45, "y", mats, ("rust", "charcoal"))
    add_prop_well(scene, -2.6, -4.55, props)
    add_prop_bale(scene, -1.35, -4.3, True, props)
    add_prop_bale(scene, -1.05, -4.1, False, props)
    add_prop_barrel(scene, -0.7, -4.85, props)
    add_prop_firewood(scene, -2.0, -5.45, props)
    add_prop_bush(scene, -5.7, -5.55, props, scale=0.8)
    add_prop_weeds(scene, -5.6, -4.0, props)
    add_prop_weeds(scene, -0.4, -5.7, props)
    add_prop_weeds(scene, -3.9, -0.45, props)


def build_v5(scene):
    """Dozo lane: plastered store house behind a wide-noren shop."""
    mats = building_material_set()
    props = prop_materials()
    add_yard_pad(scene, 6.0, 6.0, "dirt")
    namako = make_namako_material()

    # Dozo (small plastered storehouse) at the back-west, namako skirt.
    low, high = (-5.6, -5.6), (-3.75, -3.75)
    add_box(scene, "DozoPlinth", *map_box((low[0] - 0.06, low[1] - 0.06, 0.0), (high[0] + 0.06, high[1] + 0.06, 0.14)), props["stone"])
    add_box(scene, "DozoSkirt", *map_box((low[0], low[1], 0.14), (high[0], high[1], 0.52)), namako)
    add_box(scene, "DozoBody", *map_box((low[0], low[1], 0.52), (high[0], high[1], 1.38)), mats["plaster"])
    add_roof(scene, "Dozo", low, high, 1.42, 1.86, "x", "kawara", mats, props, "plaster")
    add_box(scene, "DozoDoor", *map_box((-4.95, high[1] - 0.01, 0.14), (-4.45, high[1] + 0.05, 0.98)), mats["dark_wood"])
    add_box(scene, "DozoWin", *map_box((-4.25, high[1] - 0.005, 0.95), (-3.95, high[1] + 0.03, 1.2)), mats["trim"])

    # Wide-noren shop machiya on the south-east street front.
    low2, high2 = (-3.35, -2.55), (-0.5, -0.75)
    add_box(scene, "ShopBody", *map_box((low2[0], low2[1], 0.0), (high2[0], high2[1], 0.92)), mats["wood"])
    add_roof(scene, "Shop", low2, high2, 0.92, 1.46, "x", "kawara", mats, props, "wood")
    facade(scene, "Shop", low2, high2, 0.92, mats, front="y", door_t=0.32, noren=_noren("indigo"), door_w=0.3)
    # Extra-wide noren band across the rest of the shopfront.
    add_box(scene, "ShopNorenWide", *map_box((-2.05, high2[1] + 0.025, 0.46), (-0.75, high2[1] + 0.045, 0.68)), _noren("charcoal"))

    # Small board-roof house on the east side, front to the east street.
    low3, high3 = (-1.95, -5.5), (-0.55, -3.85)
    add_box(scene, "EastHouseBody", *map_box((low3[0], low3[1], 0.0), (high3[0], high3[1], 0.78)), mats["dark_wood"])
    add_roof(scene, "EastHouse", low3, high3, 0.78, 1.16, "y", "itabuki", mats, props, "dark_wood")
    facade(scene, "EastHouse", low3, high3, 0.78, mats, front="x", door_t=0.5, koshi=False)

    # Goods yard between dozo and shop.
    add_crate_stack(scene, -3.0, -3.35, mats, levels=3)
    add_crate_stack(scene, -2.5, -3.5, mats, levels=2)
    add_prop_bale(scene, -4.5, -2.6, True, props)
    add_prop_bale(scene, -4.15, -2.4, True, props)
    add_prop_bale(scene, -4.3, -2.5, False, props)
    add_prop_barrel(scene, -5.3, -2.2, props)
    add_prop_barrel(scene, -5.05, -1.95, props)
    add_bench(scene, -4.35, -0.55, mats, along="x")
    add_prop_lantern(scene, -3.6, -0.5, props)
    add_drying_rack(scene, -0.55, -2.95, "y", mats, ("moss", "rust"))
    add_prop_weeds(scene, -5.7, -0.4, props)
    add_prop_weeds(scene, -0.35, -5.7, props)
    add_prop_bush(scene, -5.85, -6.0, props, scale=0.65)


VARIANTS = {2: build_v2, 3: build_v3, 4: build_v4, 5: build_v5}


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="asama town block variant renderer")
    parser.add_argument("--variants", default="2,3,4,5")
    parser.add_argument("--supersample", type=int, default=8)
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--render-spec", default="painterly")
    parser.add_argument("--render-seed", type=int, default=0)
    args = parser.parse_args(argv)

    core.CURRENT_STYLE = {"toon-cel": "toon", "painterly": "painterly"}.get(args.render_spec, "pbr")
    for variant in [int(token) for token in args.variants.split(",") if token.strip()]:
        builder = VARIANTS[variant]
        scene = reset_scene()
        builder(scene)
        ss = max(1, args.supersample)
        canvas_w, canvas_h = CANVAS[0] * ss, CANVAS[1] * ss
        anchor_x, anchor_y = ANCHOR[0] * ss, ANCHOR[1] * ss
        setup_camera(scene, canvas_w, canvas_h, anchor_x, anchor_y, PX_PER_UNIT * ss)
        output_path = os.path.abspath(os.path.join(args.output_directory, f"building-town-block-v{variant}-hires.png"))
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        setup_render(scene, canvas_w, canvas_h, args.render_spec, True, args.render_seed, output_path)
        bpy.ops.render.render(write_still=True)
        print(f"RENDERED variant={variant} output={output_path}")


main()
