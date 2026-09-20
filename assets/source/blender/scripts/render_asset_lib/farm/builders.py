"""Seasonal rice-paddy builders for the isolated farm registry.

Shares the aze-ridge frame of the legacy build_farm_paddy so the field
silhouette stays put across the season switch, but replaces every plant with
thin blade slivers (稲は鋭い線的質感 — the legacy wide clump boxes read as
round blobs, the exact reading the farm feedback rejected).

`variant` (1/2) shifts the planting phase, the ムラ (tone-patch) mapping and
every jitter seed: two adjacent paddies rendered with different variants stop
being pixel-identical (patrol I族「2x2反復」). Positions shift by half a row
pitch, so the VAR-01 pixel-difference gate clears structurally, not by noise.
"""
from __future__ import annotations

import math

import bpy

from ..core import add_box, add_mesh, map_box, map_xy, make_material
from ..materials import make_noise_material, make_textured_material


def _blade(
    scene: bpy.types.Scene,
    name: str,
    x: float,
    y: float,
    z0: float,
    height: float,
    lean_x: float,
    lean_y: float,
    half: float,
    material: bpy.types.Material,
) -> None:
    """One rice blade: a square-based pyramid whose apex converges to a
    point (L2差し戻し: 平頂の角柱は「角材束」に読める — 先端は尖鋭に)."""
    apex_x, apex_y = map_xy(x + lean_x, y + lean_y)
    vertices = [
        (*map_xy(x - half, y - half), z0),
        (*map_xy(x + half, y - half), z0),
        (*map_xy(x + half, y + half), z0),
        (*map_xy(x - half, y + half), z0),
        (apex_x, apex_y, z0 + height),
    ]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)]
    add_mesh(scene, name, vertices, faces, material)


def _blade_fan(
    scene: bpy.types.Scene,
    name: str,
    rx: float,
    ry: float,
    base_z: float,
    height: float,
    spread: float,
    count: int,
    seed: float,
    materials: tuple[bpy.types.Material, ...],
) -> None:
    """A hill of rice as a fan of tapered blades leaning outward from the
    hill centre — a spiky line cluster with pointed tips."""
    for blade in range(count):
        t = blade / max(1, count - 1) - 0.5
        lean_x = spread * t + 0.02 * math.sin(seed * 3.1 + blade * 2.7)
        lean_y = 0.4 * spread * math.sin(seed * 2.3 + blade * 4.1)
        blade_height = height * (0.72 + 0.28 * abs(math.sin(seed * 5.7 + blade * 1.9)))
        half = 0.013 + 0.004 * ((blade + int(seed * 7)) % 2)
        material = materials[(blade + int(seed * 11)) % len(materials)]
        _blade(scene, f"{name}B{blade}", rx + lean_x * 0.25, ry + lean_y * 0.25,
               base_z, blade_height, lean_x, lean_y, half, material)


def build_farm_paddy(scene: bpy.types.Scene, season: str = "spring", variant: int = 1) -> None:
    """Rice paddy filling a 4x4 surface footprint. Canvas 256x128, anchor 128,64."""
    ridge = make_textured_material("AzeDirt", (0.185, 0.150, 0.105), (0.265, 0.220, 0.160), scale=9.0)
    add_box(scene, "FieldBase", *map_box((-2.0, -2.0, 0.0), (2.0, 2.0, 0.02)), ridge)

    water_seed = {1: 5.0, 2: 11.0, 3: 8.0}[variant]

    # Paddy inner surface.
    if season == "spring":
        # Still water toned into the slate family (patrol I族: the old bright
        # sky-cyan floated against the river/moat palette), with a faint sky
        # sheen kept so it still reads as a flooded mirror.
        surface = make_noise_material(
            "PaddyWater", (0.050, 0.088, 0.100), (0.115, 0.170, 0.185), scale=water_seed)
        add_box(scene, "Water", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.045)), surface)
    elif season == "summer":
        surface = make_noise_material(
            "PaddyWaterSummer", (0.040, 0.080, 0.062), (0.062, 0.110, 0.082), scale=water_seed)
        add_box(scene, "Water", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.040)), surface)
    elif season == "autumn":
        # 田面は暗い泥ではなく黄金の切り藁カーペット: 株間から覗く地面まで
        # 金に染まってはじめて「一面の黄金」に読める(旧出荷版と同原理)。
        surface = make_textured_material(
            "PaddyStrawMat", (0.820, 0.560, 0.060), (1.000, 0.800, 0.105), scale=9.0)
        add_box(scene, "StrawMat", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.040)), surface)
    else:
        # 冬は暗い湿土(L2差し戻し: 明るくフラットだと経年感で旧版に劣る)。
        # variantで質感スケールと明度を僅かに変え、VAR-01の差分も確保する。
        tones = {
            1: ((0.082, 0.068, 0.048), (0.150, 0.126, 0.094), 8.0),
            2: ((0.072, 0.060, 0.044), (0.136, 0.114, 0.086), 11.0),
            3: ((0.090, 0.074, 0.054), (0.160, 0.134, 0.100), 6.0),
        }[variant]
        surface = make_textured_material("PaddyDampSoil", tones[0], tones[1], scale=tones[2])
        add_box(scene, "DrySoil", *map_box((-1.86, -1.86, 0.021), (1.86, 1.86, 0.042)), surface)
        # 畝: 刈田の低い土条(轍状のリズム)。
        une = make_textured_material("PaddyUne", (0.108, 0.090, 0.066), (0.180, 0.150, 0.112), scale=9.0)
        for qx0 in (-2.0, 0.07):
            for row6 in range(5):
                uy = -1.82 + 0.02 * (variant - 1) + row6 * 0.38 + (0.10 if qx0 > 0 else 0.0)
                if uy > 1.6:
                    continue
                add_box(scene, f"Une{qx0}{row6}",
                        *map_box((qx0 + 0.10, uy, 0.042), (qx0 + 1.86, uy + 0.075, 0.058)), une)

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

    # Plant materials per season (multi-tone alternation for painterly ムラ).
    if season == "spring":
        blades = (
            make_material("PaddySeedling", (0.210, 0.330, 0.115, 1.0)),
            make_material("PaddySeedlingD", (0.150, 0.250, 0.085, 1.0)),
        )
    elif season == "summer":
        blades = (
            make_material("PaddyRiceGreen", (0.110, 0.260, 0.068, 1.0)),
            make_material("PaddyRiceGreenD", (0.075, 0.190, 0.048, 1.0)),
            make_material("PaddyRiceGreenL", (0.180, 0.345, 0.100, 1.0)),
        )
    elif season == "autumn":
        # ペインタリー照明で実効明度が~0.6倍に圧縮されるため、リニア値は
        # 目標(sRGB V0.55-0.70)より大きく取る(L2差し戻し3回目の定量指示:
        # 真金画素(H30-70°,S≥0.45,V≥0.45)比率60%以上)。
        # 彩度が合否を分ける(S<0.45で75%が落ちた): >1.0のリニア値はクリップ
        # でRとGが均一化し、照明が青を持ち上げて脱彩する。1.0以下に抑えつつ
        # 青チャンネルを大きく下げて彩度を確保する。
        blades = (
            make_noise_material("PaddyRiceGold", (0.900, 0.590, 0.040), (1.000, 0.790, 0.072), scale=8.0),
            make_noise_material("PaddyRiceGoldD", (0.700, 0.430, 0.030), (0.900, 0.610, 0.050), scale=8.0),
            make_noise_material("PaddyRiceGoldL", (1.000, 0.760, 0.055), (1.000, 0.930, 0.095), scale=8.0),
        )
        ear = make_material("PaddyRiceEar", (1.000, 0.940, 0.110, 1.0))
    else:
        blades = (
            make_material("PaddyStubble", (0.310, 0.258, 0.155, 1.0)),
            make_material("PaddyStubbleD", (0.245, 0.198, 0.118, 1.0)),
        )

    # Planting grid. Variants shift the column AND row phase and remap the
    # ムラ so neighbouring paddies stop being carbon copies (3-way: two
    # adjacent paddies rarely share a variant, and even then the coordinate
    # jitter differs).
    col_phase = {1: 0.0, 2: 0.145, 3: -0.10}[variant]
    row_phase = {1: 0.0, 2: 0.0, 3: 0.16}[variant]
    mura = {
        1: (lambda row, col: (row + col) % 3),
        2: (lambda row, col: (row * 2 + col) % 3),
        3: (lambda row, col: (row * 3 + col * 2) % 3),
    }[variant]
    for qx, qy in ((-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)):
        for row in range(5):
            ry = qy - 0.75 + row * 0.32 + row_phase
            for col in range(6):
                rx = qx - 0.72 + col * 0.29 + (0.07 if row % 2 else 0.0) + col_phase
                if abs(rx - qx) > 0.8 or abs(ry - qy) > 0.8:
                    continue
                seed = rx * 12.7 + ry * 7.3 + variant * 4.9
                jitter = 0.03 * math.sin(seed)
                name = f"Rice{qx}{qy}{row}{col}"
                shade = mura(row, col)
                if season == "spring":
                    # Freshly planted hill: 3 short thin blades over the water.
                    _blade_fan(scene, name, rx + jitter, ry, 0.045,
                               0.11 + 0.02 * (shade % 2), 0.05, 3, seed, blades)
                elif season == "summer":
                    # Lush hill: 6 tall blades + interleaved half-pitch hill
                    # so the basin reads 青々と茂った青田(水面は株間に僅かに
                    # 覗く程度)。
                    _blade_fan(scene, name, rx + jitter, ry, 0.030,
                               0.30 + 0.035 * (shade % 3), 0.13, 6, seed, blades)
                    mid_ry = ry + 0.16
                    if abs(mid_ry - qy) <= 0.78:
                        _blade_fan(scene, f"{name}M", rx + 0.145 - jitter, mid_ry, 0.030,
                                   0.25 + 0.03 * ((shade + 1) % 3), 0.11, 5, seed * 1.7, blades)
                        _blade_fan(scene, f"{name}N", rx - 0.13 + jitter, mid_ry, 0.030,
                                   0.22 + 0.03 * ((shade + 2) % 3), 0.10, 3, seed * 2.3, blades)
                elif season == "autumn":
                    # Ripe basin: 7-blade hill + TWO interleaved half-pitch
                    # hills so gold covers ≥80% of the soil (L2差し戻し2回目:
                    # 被覆率と色相の両方で「一面の金」必達)。
                    _blade_fan(scene, name, rx + jitter, ry, 0.030,
                               0.28 + 0.03 * (shade % 3), 0.15, 7, seed, blades)
                    mid_ry = ry + 0.16
                    if abs(mid_ry - qy) <= 0.78:
                        _blade_fan(scene, f"{name}M", rx + 0.145 - jitter, mid_ry, 0.030,
                                   0.24 + 0.03 * ((shade + 1) % 3), 0.13, 5, seed * 1.7, blades)
                        _blade_fan(scene, f"{name}N", rx - 0.13 + jitter, mid_ry, 0.030,
                                   0.22 + 0.03 * ((shade + 2) % 3), 0.12, 4, seed * 2.3, blades)
                    droop = 0.07 * math.copysign(1.0, math.sin(rx * 9.1 + ry * 5.3 + variant))
                    _blade(scene, f"{name}Ear", rx + jitter + droop * 0.5, ry + droop * 0.2,
                           0.22 + 0.03 * (shade % 3), 0.10, droop, droop * 0.4, 0.018, ear)
                else:
                    # Winter stubble: sparse short stubs (one in three cut to
                    # the ground), thin like cut straw.
                    if (row * 11 + col * 5 + variant) % 3 == 0:
                        continue
                    _blade_fan(scene, name, rx + jitter, ry, 0.042,
                               0.055 + 0.012 * (shade % 2), 0.03, 2, seed, blades)
