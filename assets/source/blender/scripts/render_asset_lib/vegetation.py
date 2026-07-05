"""Vegetation, prop, and natural feature builders."""
from __future__ import annotations

from .core import (
    add_box, add_beam, add_flat_quad, add_frustum, add_gable_roof,
    add_mesh, map_box, map_xy, make_material,
)
from .materials import (
    make_foliage_material, make_noise_material, make_textured_material, prop_materials,
)

import bpy


def add_foliage_blob(scene: bpy.types.Scene, name: str, cx: float, cy: float, z: float, radius: float, height: float, material: bpy.types.Material, squash: float = 1.0) -> None:
    """Organic leaf mass: an octagonal ellipsoid."""
    import math as _math
    h = height * squash
    ring_ts = (0.14, 0.42, 0.72, 0.92)
    ring_radii = tuple(radius * _math.sin(_math.pi * min(t, 0.97)) ** 0.72 for t in ring_ts)
    seed = sum(ord(c) for c in name)
    vertices: list[tuple[float, float, float]] = []
    for ring, (t, r) in enumerate(zip(ring_ts, ring_radii)):
        for i in range(8):
            angle = (i + 0.5) / 8 * 2 * _math.pi
            jitter = 1.0 + 0.16 * _math.sin(seed * 3.7 + ring * 12.9898 + i * 78.233)
            zj = h * 0.05 * _math.sin(seed * 1.3 + ring * 7.31 + i * 41.7)
            rj = r * jitter
            vertices.append((*map_xy(cx + rj * _math.cos(angle), cy + rj * _math.sin(angle)), z + h * t + zj))
    bottom = len(vertices)
    vertices.append((*map_xy(cx, cy), z))
    top = len(vertices)
    vertices.append((*map_xy(cx, cy), z + h))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(ring_ts) - 1):
        a = ring * 8
        b = (ring + 1) * 8
        for i in range(8):
            j = (i + 1) % 8
            faces.append((a + i, a + j, b + j, b + i))
    for i in range(8):
        j = (i + 1) % 8
        faces.append((bottom, i, j))
        last = (len(ring_ts) - 1) * 8
        faces.append((top, last + j, last + i))
    add_mesh(scene, name, vertices, faces, material)


def add_foliage_skirt(scene: bpy.types.Scene, name: str, cx: float, cy: float, z: float, radius: float, height: float, material: bpy.types.Material) -> None:
    """Octagonal cone skirt: the stylized conifer tier."""
    import math as _math
    vertices: list[tuple[float, float, float]] = []
    for i in range(8):
        angle = (i + 0.5) / 8 * 2 * _math.pi
        vertices.append((*map_xy(cx + radius * _math.cos(angle), cy + radius * _math.sin(angle)), z))
    apex = len(vertices)
    vertices.append((*map_xy(cx, cy), z + height))
    bottom = len(vertices)
    vertices.append((*map_xy(cx, cy), z - height * 0.12))
    faces: list[tuple[int, ...]] = []
    for i in range(8):
        j = (i + 1) % 8
        faces.append((i, j, apex))
        faces.append((bottom, j, i))
    add_mesh(scene, name, vertices, faces, material)


def add_leaf_cards(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    count: int,
    materials: list[bpy.types.Material],
    seed: float,
    card_size: float = 0.085,
    shade_bias: float = 0.75,
    card_aspect: float = 1.0,
    droop: float = 0.0,
) -> None:
    """Foliage as a cloud of small quads inside an ellipsoid."""
    import math as _math

    def rand(k: float) -> float:
        return (_math.sin(seed * 7.13 + k) * 43758.5453) % 1.0

    cx, cy, cz = center
    rx, ry, rz = radii
    buckets: list[list[tuple[float, float, float]]] = [[] for _ in materials]
    faces_per_bucket: list[list[tuple[int, ...]]] = [[] for _ in materials]
    for i in range(count):
        u = rand(i * 3.1)
        v = rand(i * 3.1 + 1.0)
        w = rand(i * 3.1 + 2.0)
        radial = 0.45 + 0.55 * (u ** 0.4)
        theta = v * 2.0 * _math.pi
        phi = _math.acos(2.0 * w - 1.0)
        px = cx + rx * radial * _math.sin(phi) * _math.cos(theta)
        py = cy + ry * radial * _math.sin(phi) * _math.sin(theta)
        pz = cz + rz * radial * _math.cos(phi)
        tilt = (rand(i * 5.7) - 0.5) * 1.1 - droop * radial
        yaw = rand(i * 9.3) * 2.0 * _math.pi
        half = card_size * (0.7 + 0.6 * rand(i * 4.9))
        long_half = half * card_aspect
        ax = _math.cos(yaw) * long_half
        ay = _math.sin(yaw) * long_half
        bx = -_math.sin(yaw) * half * _math.cos(tilt)
        by = _math.cos(yaw) * half * _math.cos(tilt)
        bz = half * _math.sin(tilt)
        t_height = 0.5 + 0.5 * (pz - cz) / max(rz, 1e-5)
        t_light = 0.5 + 0.5 * ((px - cx) * 0.98 + (py - cy) * 0.196) / max(rx, 1e-5)
        t_shade = 0.6 * t_height + 0.4 * t_light
        mix = t_shade * shade_bias + rand(i * 6.7) * (1.0 - shade_bias)
        bucket = min(len(materials) - 1, max(0, int(mix * len(materials))))
        vertices = buckets[bucket]
        base = len(vertices)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vertices.append((*map_xy(px + sx * ax + sy * bx, py + sx * ay + sy * by), pz + sy * bz))
        faces_per_bucket[bucket].append((base, base + 1, base + 2, base + 3))
    for index, material in enumerate(materials):
        if faces_per_bucket[index]:
            add_mesh(scene, f"{name}Cards{index}", buckets[index], faces_per_bucket[index], material)


def add_cloud_pad(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radius: float,
    lit_material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    seed: float,
) -> None:
    """Pine cloud pad drawn the nihonga way: overlapping arcs."""
    import math as _math

    def rand(k: float) -> float:
        return (_math.sin(seed * 5.77 + k) * 43758.5453) % 1.0

    cx, cy, cz = center
    bump_r = radius * 0.46
    add_foliage_blob(scene, f"{name}Base", cx + 0.02, cy + 0.02, cz - bump_r * 0.30, radius * 0.95, bump_r * 0.55, shadow_material, squash=0.8)
    add_foliage_blob(scene, f"{name}C", cx, cy, cz + bump_r * 0.10, bump_r * 1.15, bump_r * 0.95, lit_material, squash=0.85)
    count = 6
    for i in range(count):
        angle = (i + rand(i * 2.3) * 0.5) / count * 2.0 * _math.pi
        dist = radius * (0.58 + 0.10 * rand(i * 3.7))
        bx = cx + dist * _math.cos(angle)
        by = cy + dist * _math.sin(angle)
        bz = cz + bump_r * (0.05 - 0.18 * rand(i * 1.9))
        size = bump_r * (0.78 + 0.28 * rand(i * 4.1))
        add_foliage_blob(scene, f"{name}B{i}", bx, by, bz, size, size * 0.9, lit_material, squash=0.8)


def add_tree_base(scene: bpy.types.Scene, cx: float, cy: float, trunk_r: float, bark: bpy.types.Material) -> None:
    """Ground treatment under a tree: tapered root flare, leaf-litter, tufts, pebbles."""
    grass_dark = make_material("BaseGrassD", (0.130, 0.165, 0.062, 1.0))
    grass_light = make_material("BaseGrassL", (0.215, 0.255, 0.100, 1.0))
    litter_soil = make_foliage_material("BaseLitterSoil", (0.085, 0.068, 0.042), (0.130, 0.105, 0.062))
    litter_leaf = make_foliage_material("BaseLitterLeaf", (0.060, 0.085, 0.038), (0.100, 0.130, 0.058))
    pebble = make_noise_material("BasePebble", (0.105, 0.102, 0.095), (0.180, 0.175, 0.160), scale=7.0)

    add_leaf_cards(
        scene,
        f"Litter{cx}",
        (cx, cy, 0.015),
        (0.34, 0.34, 0.012),
        44,
        [litter_soil, litter_leaf],
        seed=cx * 11 + cy * 5 + 71,
        card_size=0.085,
        shade_bias=0.35,
    )

    roots = ((0.19, 0.03), (-0.15, 0.12), (0.04, -0.19), (-0.11, -0.14), (0.13, 0.15))
    for index, (rx, ry) in enumerate(roots):
        add_beam(scene, f"Root{cx}{index}", (cx + rx, cy + ry, -0.01), (cx + rx * 0.2, cy + ry * 0.2, 0.11), trunk_r * 0.5, bark, tip_thickness=trunk_r * 0.95)

    tufts = ((0.26, -0.09, 0), (-0.24, 0.16, 1), (0.09, 0.26, 0), (-0.19, -0.21, 1), (0.28, 0.14, 1), (-0.30, 0.02, 0), (0.02, -0.30, 1))
    for index, (tx, ty, shade) in enumerate(tufts):
        height = 0.11 + (index % 3) * 0.035
        material = grass_light if shade else grass_dark
        add_beam(scene, f"BaseTuft{cx}{index}", (cx + tx, cy + ty, 0.0), (cx + tx + 0.025, cy + ty - 0.02, height), 0.02, material, tip_thickness=0.006)
        add_beam(scene, f"BaseTuftB{cx}{index}", (cx + tx + 0.02, cy + ty + 0.02, 0.0), (cx + tx - 0.01, cy + ty + 0.04, height * 0.7), 0.016, material, tip_thickness=0.005)

    for index, (bx, by, size) in enumerate(((0.31, 0.05, 0.045), (-0.27, -0.12, 0.035))):
        add_frustum(scene, f"BasePebble{cx}{index}", (cx + bx - size, cy + by - size), (cx + bx + size, cy + by + size), 0.0, size * 1.3, size * 0.5, pebble)


def build_tree_pine(scene: bpy.types.Scene, variant: int = 0) -> None:
    """Akamatsu (Japanese red pine). Canvas 64x112, anchor 32,96."""
    bark = make_textured_material("PineBark", (0.075, 0.048, 0.032), (0.130, 0.088, 0.056), scale=(14.0, 14.0, 3.0))
    needle_dark = make_foliage_material("PineNeedlesD", (0.048, 0.092, 0.055), (0.085, 0.140, 0.078))
    needle_light = make_foliage_material("PineNeedlesL", (0.075, 0.130, 0.070), (0.130, 0.200, 0.105))
    s = 1.0 if variant % 2 == 0 else -1.0

    add_tree_base(scene, 0.0, 0.0, 0.12, bark)
    p0 = (0.0, 0.0, 0.0)
    p1 = (0.16 * s, 0.10 * s, 0.35)
    p2 = (-0.06 * s, -0.04 * s, 0.72)
    p3 = (0.22 * s, 0.12 * s, 1.10)
    p4 = (-0.02 * s, 0.02 * s, 1.45)
    add_beam(scene, "Trunk1", p0, p1, 0.15, bark, tip_thickness=0.11)
    add_beam(scene, "Trunk2", p1, p2, 0.11, bark, tip_thickness=0.085)
    add_beam(scene, "Trunk3", p2, p3, 0.085, bark, tip_thickness=0.06)
    add_beam(scene, "Trunk4", p3, p4, 0.06, bark, tip_thickness=0.035)

    needle_shadow = make_material("PineCloudShadow", (0.045, 0.085, 0.050, 1.0))
    needle_lit = make_material("PineCloudLit", (0.100, 0.160, 0.082, 1.0))
    import math as _math
    tiers = [
        (p2, (-0.50 * s, -0.30 * s, 0.72), 0.30),
        (p2, (-0.20 * s, -0.42 * s, 0.80), 0.23),
        (p2, (0.48 * s, 0.30 * s, 0.88), 0.26),
        (p2, (0.66 * s, 0.10 * s, 0.80), 0.17),
        (p3, (-0.34 * s, -0.12 * s, 1.10), 0.22),
        (p3, (0.30 * s, 0.18 * s, 1.28), 0.19),
        (p4, (0.16 * s, 0.08 * s, 1.44), 0.13),
        (p4, (0.0, 0.0, 1.58), 0.22),
    ]
    for index, (base, tip, radius) in enumerate(tiers):
        add_beam(scene, f"Branch{index}", base, (tip[0], tip[1], tip[2] - 0.06), 0.04, bark, tip_thickness=0.02)
        add_cloud_pad(
            scene,
            f"Pad{index}",
            (tip[0], tip[1], tip[2] + 0.03),
            radius,
            needle_lit,
            needle_shadow,
            seed=float(variant * 37 + index * 11 + 7),
        )
    add_beam(scene, "DeadBranch", p2, (-0.04 * s, 0.30 * s, 1.04), 0.035, bark, tip_thickness=0.014)
    for index, (kx, ky, kz) in enumerate(((0.05 * s, 0.02 * s, 0.34), (0.13 * s, 0.09 * s, 0.72))):
        add_box(scene, f"Knot{index}", *map_box((kx - 0.035, ky - 0.035, kz), (kx + 0.035, ky + 0.035, kz + 0.06)), bark)


def build_tree_cedar(scene: bpy.types.Scene) -> None:
    """Sugi (cedar): tall, narrow, dense spire. Canvas 64x128, anchor 32,112."""
    bark = make_textured_material("CedarBark", (0.062, 0.045, 0.032), (0.100, 0.078, 0.055), scale=(14.0, 14.0, 3.0))
    dark = make_foliage_material("CedarNeedlesD", (0.035, 0.075, 0.048), (0.062, 0.110, 0.068))
    light = make_foliage_material("CedarNeedlesL", (0.052, 0.100, 0.058), (0.090, 0.150, 0.085))
    add_tree_base(scene, 0.0, 0.0, 0.09, bark)
    add_beam(scene, "Trunk", (0.0, 0.0, 0.0), (0.05, -0.03, 2.02), 0.13, bark, tip_thickness=0.045)
    mid = make_foliage_material("CedarNeedlesM", (0.048, 0.092, 0.055), (0.075, 0.125, 0.070))
    tiers = [
        (0.36, 0.28, 0.55, dark), (0.30, 0.62, 0.52, mid), (0.24, 0.96, 0.50, dark),
        (0.18, 1.30, 0.48, mid), (0.12, 1.62, 0.46, light),
    ]
    for index, (radius, z, height, mat) in enumerate(tiers):
        jx = 0.012 if index % 2 == 0 else -0.012
        add_foliage_skirt(scene, f"Tier{index}", jx, -jx, z, radius, height, mat)
    add_foliage_skirt(scene, "Apex", 0.0, 0.0, 1.92, 0.07, 0.34, light)


def build_tree_broadleaf(scene: bpy.types.Scene) -> None:
    """Keyaki-style broadleaf. Canvas 64x112, anchor 32,96."""
    bark = make_textured_material("BroadBark", (0.070, 0.052, 0.036), (0.118, 0.090, 0.062), scale=(14.0, 14.0, 3.0))
    deep = make_foliage_material("BroadLeavesDeep", (0.032, 0.062, 0.028), (0.060, 0.100, 0.045))
    dark = make_foliage_material("BroadLeavesD", (0.052, 0.095, 0.040), (0.095, 0.150, 0.065))
    light = make_foliage_material("BroadLeavesL", (0.085, 0.140, 0.058), (0.160, 0.225, 0.100))
    sun = make_foliage_material("BroadLeavesSun", (0.125, 0.185, 0.080), (0.205, 0.270, 0.125))
    add_tree_base(scene, 0.0, 0.0, 0.12, bark)
    add_beam(scene, "Trunk", (0.0, 0.0, 0.0), (0.02, -0.02, 0.55), 0.16, bark, tip_thickness=0.11)
    limbs = [
        ((0.02, -0.02, 0.50), (-0.24, 0.11, 0.88)),
        ((0.02, -0.02, 0.50), (0.26, -0.15, 0.92)),
        ((0.02, -0.02, 0.52), (0.02, 0.22, 0.98)),
        ((0.02, -0.02, 0.52), (-0.10, -0.20, 0.95)),
    ]
    for index, (base, tip) in enumerate(limbs):
        add_beam(scene, f"Limb{index}", base, tip, 0.06, bark, tip_thickness=0.028)
        for t_index, (dx, dy, dz) in enumerate(((0.10, 0.06, 0.14), (-0.07, 0.10, 0.16))):
            add_beam(scene, f"LimbTwig{index}{t_index}", tip, (tip[0] + dx, tip[1] + dy, tip[2] + dz), 0.02, bark, tip_thickness=0.01)
    add_foliage_blob(scene, "DomeShade", -0.05, -0.03, 0.62, 0.42, 0.62, dark)
    add_foliage_blob(scene, "DomeShade2", 0.06, 0.14, 0.70, 0.33, 0.50, dark)
    add_foliage_blob(scene, "DomeLit", 0.13, 0.02, 0.88, 0.33, 0.50, light)
    add_foliage_blob(scene, "DomeLit2", 0.02, -0.12, 0.98, 0.26, 0.40, sun)


def build_bamboo(scene: bpy.types.Scene) -> None:
    """Bamboo grove. Canvas 64x128, anchor 32,112."""
    culm = make_material("BambooCulm", (0.120, 0.175, 0.068, 1.0))
    culm_light = make_material("BambooCulmL", (0.165, 0.230, 0.095, 1.0))
    leaves_dark = make_foliage_material("BambooLeavesD", (0.080, 0.140, 0.050), (0.130, 0.200, 0.078))
    leaves_light = make_foliage_material("BambooLeavesL", (0.120, 0.190, 0.068), (0.200, 0.285, 0.110))
    stalks = [
        (-0.16, -0.06, 2.05, 0.10), (-0.03, -0.17, 2.25, 0.02), (0.13, 0.00, 2.10, -0.08),
        (0.03, 0.15, 1.90, 0.12), (-0.12, 0.12, 2.15, -0.10), (0.17, -0.13, 1.80, 0.06),
        (-0.22, 0.02, 1.70, -0.13), (0.08, -0.08, 2.30, -0.02),
    ]
    bark = make_textured_material("BambooBark", (0.075, 0.055, 0.034), (0.135, 0.100, 0.062), scale=(14.0, 14.0, 3.0))
    add_tree_base(scene, 0.0, 0.0, 0.0, bark)
    for index, (sx, sy, height, lean) in enumerate(stalks):
        mat = culm if index % 2 == 0 else culm_light
        add_beam(scene, f"Culm{index}", (sx, sy, 0.0), (sx + lean, sy + lean * 0.7, height), 0.038, mat, tip_thickness=0.024)
        node_z = 0.32
        while node_z < height - 0.25:
            f = node_z / height
            nx = sx + lean * f
            ny = sy + lean * 0.7 * f
            add_box(scene, f"Node{index}{node_z:.2f}", *map_box((nx - 0.026, ny - 0.026, node_z), (nx + 0.026, ny + 0.026, node_z + 0.022)), culm_light)
            node_z += 0.34
    import math as _math
    tuft_specs = [
        (-0.14, -0.02, 1.92, 0.9), (0.10, -0.12, 2.16, -0.6), (0.16, 0.06, 1.98, 0.4),
        (-0.05, 0.16, 1.78, -0.9), (-0.20, 0.10, 2.02, 0.7), (0.02, -0.04, 2.32, -0.3),
        (0.20, -0.16, 1.66, 0.5), (-0.24, -0.06, 1.58, -0.5),
    ]
    for index, (tx, ty, tz, spin) in enumerate(tuft_specs):
        mat = leaves_dark if index % 2 == 0 else leaves_light
        for blade in range(4):
            angle = spin + (blade - 1.5) * 0.55
            length = 0.16 + 0.04 * ((blade + index) % 2)
            ex = tx + length * _math.cos(angle)
            ey = ty + length * _math.sin(angle)
            ez = tz - 0.10 - 0.03 * blade
            add_beam(scene, f"Blade{index}{blade}", (tx, ty, tz), (ex, ey, ez), 0.035, mat, tip_thickness=0.008)


# Prop library ----------------------------------------------------------------

def add_prop_well(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    add_box(scene, "WellRing", *map_box((cx - 0.16, cy - 0.16, 0.0), (cx + 0.16, cy + 0.16, 0.22)), mats["stone"])
    add_box(scene, "WellHole", *map_box((cx - 0.10, cy - 0.10, 0.22), (cx + 0.10, cy + 0.10, 0.225)), mats["rope"])
    for side in (-0.14, 0.14):
        add_box(scene, f"WellPost{side}", *map_box((cx + side - 0.02, cy - 0.02, 0.0), (cx + side + 0.02, cy + 0.02, 0.62)), mats["wood"])
    low, high = map_box((cx - 0.22, cy - 0.12, 0.0), (cx + 0.22, cy + 0.12, 0.0))
    add_gable_roof(scene, "WellRoof", (low[0], low[1]), (high[0], high[1]), 0.62, 0.76, "x", mats["wood"])


def add_prop_lantern(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    stone = mats["stone"]
    add_box(scene, f"LanternBase{cx}", *map_box((cx - 0.09, cy - 0.09, 0.0), (cx + 0.09, cy + 0.09, 0.08)), stone)
    add_box(scene, f"LanternShaft{cx}", *map_box((cx - 0.035, cy - 0.035, 0.08), (cx + 0.035, cy + 0.035, 0.40)), stone)
    add_box(scene, f"LanternFire{cx}", *map_box((cx - 0.07, cy - 0.07, 0.40), (cx + 0.07, cy + 0.07, 0.54)), mats["shoji"])
    add_frustum(scene, f"LanternCap{cx}", (cx - 0.11, cy - 0.11), (cx + 0.11, cy + 0.11), 0.54, 0.64, 0.09, stone)


def add_prop_bale(scene: bpy.types.Scene, cx: float, cy: float, angle_x: bool, mats: dict) -> None:
    if angle_x:
        add_box(scene, f"Bale{cx}{cy}", *map_box((cx - 0.16, cy - 0.09, 0.0), (cx + 0.16, cy + 0.09, 0.17)), mats["straw"])
        for bx in (cx - 0.07, cx + 0.07):
            add_box(scene, f"BaleRope{bx}{cy}", *map_box((bx - 0.015, cy - 0.095, 0.0), (bx + 0.015, cy + 0.095, 0.175)), mats["rope"])
    else:
        add_box(scene, f"Bale{cx}{cy}", *map_box((cx - 0.09, cy - 0.16, 0.0), (cx + 0.09, cy + 0.16, 0.17)), mats["straw"])
        for by in (cy - 0.07, cy + 0.07):
            add_box(scene, f"BaleRope{cx}{by}", *map_box((cx - 0.095, by - 0.015, 0.0), (cx + 0.095, by + 0.015, 0.175)), mats["rope"])


def add_prop_barrel(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    add_frustum(scene, f"BarrelLow{cx}{cy}", (cx - 0.11, cy - 0.11), (cx + 0.11, cy + 0.11), 0.0, 0.14, -0.02, mats["wood"])
    add_frustum(scene, f"BarrelHigh{cx}{cy}", (cx - 0.13, cy - 0.13), (cx + 0.13, cy + 0.13), 0.14, 0.30, 0.03, mats["wood"])
    add_box(scene, f"BarrelBand{cx}{cy}", *map_box((cx - 0.135, cy - 0.135, 0.13), (cx + 0.135, cy + 0.135, 0.155)), mats["rope"])


def add_prop_firewood(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    for level, count in ((0.0, 4), (0.09, 3), (0.18, 2)):
        for i in range(count):
            off = (i - (count - 1) / 2) * 0.10
            add_box(scene, f"Log{cx}{level}{i}", *map_box((cx + off - 0.045, cy - 0.16, level), (cx + off + 0.045, cy + 0.16, level + 0.09)), mats["wood"])


def add_prop_bush(scene: bpy.types.Scene, cx: float, cy: float, mats: dict, scale: float = 1.0) -> None:
    light = make_foliage_material("PropBushL", (0.075, 0.125, 0.058), (0.130, 0.190, 0.090))
    add_leaf_cards(scene, f"Bush{cx}{cy}", (cx, cy, 0.14 * scale), (0.24 * scale, 0.24 * scale, 0.15 * scale), 46, [mats["bushD"], light], seed=cx * 7 + cy * 3 + 41, card_size=0.07 * scale)
    add_leaf_cards(scene, f"Bush2{cx}{cy}", (cx + 0.15 * scale, cy - 0.11 * scale, 0.10 * scale), (0.15 * scale, 0.15 * scale, 0.10 * scale), 26, [mats["bushD"], light], seed=cx * 5 + cy * 9 + 47, card_size=0.06 * scale)


def add_prop_weeds(scene: bpy.types.Scene, cx: float, cy: float, mats: dict) -> None:
    tufts = [(0.0, 0.0), (0.12, -0.06), (-0.10, 0.08), (0.04, 0.13), (-0.13, -0.10)]
    for index, (tx, ty) in enumerate(tufts):
        height = 0.14 + (index % 3) * 0.04
        add_beam(scene, f"Weed{cx}{cy}{index}", (cx + tx, cy + ty, 0.0), (cx + tx + 0.03, cy + ty - 0.02, height), 0.018, mats["grass"])


def build_deco_bush(scene: bpy.types.Scene) -> None:
    """Yabu: wild bush clump. Canvas 64x56, anchor 32,40."""
    mats = prop_materials()
    add_prop_bush(scene, -0.05, 0.02, mats, scale=1.25)
    add_prop_weeds(scene, 0.2, -0.15, mats)


def build_deco_weeds(scene: bpy.types.Scene) -> None:
    """Roadside weeds. Canvas 64x48, anchor 32,32."""
    mats = prop_materials()
    add_prop_weeds(scene, -0.08, 0.0, mats)
    add_prop_weeds(scene, 0.14, 0.10, mats)


def build_rock(scene: bpy.types.Scene) -> None:
    """Weathered boulder cluster. Canvas 64x56, anchor 32,40."""
    stone = make_noise_material("BoulderStone", (0.100, 0.100, 0.098), (0.185, 0.182, 0.172), scale=7.0)
    add_frustum(scene, "RockBig", (-0.30, -0.16), (0.14, 0.30), 0.0, 0.42, 0.10, stone)
    add_frustum(scene, "RockSmall", (0.02, -0.32), (0.36, 0.04), 0.0, 0.26, 0.07, stone)
    add_frustum(scene, "RockTiny", (-0.38, 0.10), (-0.12, 0.34), 0.0, 0.16, 0.05, stone)


def build_reeds(scene: bpy.types.Scene) -> None:
    """Waterside reeds. Canvas 64x56, anchor 32,40."""
    stem = make_material("ReedStem", (0.115, 0.145, 0.052, 1.0))
    head = make_material("ReedHead", (0.240, 0.195, 0.105, 1.0))
    tufts = [(-0.24, -0.10), (-0.05, -0.24), (0.16, -0.06), (0.04, 0.14), (-0.18, 0.18), (0.24, 0.18)]
    for index, (sx, sy) in enumerate(tufts):
        height = 0.34 + (index % 3) * 0.05
        add_box(scene, f"Stem{index}", *map_box((sx - 0.012, sy - 0.012, 0.0), (sx + 0.012, sy + 0.012, height)), stem)
        add_box(scene, f"Head{index}", *map_box((sx - 0.02, sy - 0.02, height), (sx + 0.02, sy + 0.02, height + 0.09)), head)
