"""Fence geometry with sun-bleached weathered wood.

Same geometry contract as the buildings.py fence family (post pitch, rail
levels, diagonal runs) but with brighter plank materials: the original shared
building wood rendered at ~32 mean opaque luma — an extreme outlier against
the asset population median of ~72 — and read as near-black blobs in the
composite view (composite lint VAL rule). Old fences bleach toward silver
grey, so the brightened palette is also the more truthful weathering.
"""
from __future__ import annotations

import math

import bpy

from ..core import (
    add_box, add_mesh, map_box, map_xy,
    WALL_DIRECTIONS, wall_arm_box, WALL_EPSILON,
)
from ..materials import make_plank_material

FENCE_HEIGHT = 0.72
FENCE_POST_SIZE = 0.10
FENCE_RAIL_THICKNESS = 0.055
FENCE_RAIL_LEVELS = ((0.26, 0.36), (0.52, 0.62))

DIAGONAL_CORNERS = {
    "nw": (-0.5, -0.5),
    "ne": (0.5, -0.5),
    "se": (0.5, 0.5),
    "sw": (-0.5, 0.5),
}


def fence_material_set() -> dict[str, bpy.types.Material]:
    """Sun-bleached rails, slightly darker aged posts (both well above the
    near-black shared building wood)."""
    return {
        "wood": make_plank_material("FenceWoodBleached", (0.170, 0.140, 0.100), (0.310, 0.262, 0.196)),
        "dark_wood": make_plank_material("FencePostAged", (0.105, 0.085, 0.058), (0.205, 0.168, 0.118)),
    }


def fence_post(scene: bpy.types.Scene, name: str, map_x: float, map_y: float, material: bpy.types.Material, height: float = FENCE_HEIGHT) -> None:
    half = FENCE_POST_SIZE / 2.0
    add_box(scene, name, *map_box((map_x - half, map_y - half, 0.0), (map_x + half, map_y + half, height)), material)


def _diag_prism(scene: bpy.types.Scene, name: str, a: tuple[float, float], b: tuple[float, float], half: float, z0: float, z1: float, material: bpy.types.Material) -> None:
    """Vertical-sided prism along the map-space segment a->b."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    px, py = -dy / length * half, dx / length * half
    corners = [
        (a[0] + px, a[1] + py), (b[0] + px, b[1] + py),
        (b[0] - px, b[1] - py), (a[0] - px, a[1] - py),
    ]
    vertices = [(*map_xy(x, y), z0) for x, y in corners] + [(*map_xy(x, y), z1) for x, y in corners]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    add_mesh(scene, name, vertices, faces, material)


def build_fence_wood_mask(scene: bpy.types.Scene, mask: str) -> None:
    mats = fence_material_set()
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


def _fence_diagonal_run(scene: bpy.types.Scene, prefix: str, a: tuple[float, float], b: tuple[float, float], center_post: bool) -> None:
    """Posts + 2-level rails along the map segment a->b (post spacing matches
    the straight fence's 0.24 absolute pitch)."""
    mats = fence_material_set()
    wood, dark = mats["wood"], mats["dark_wood"]

    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length

    if center_post:
        fence_post(scene, f"{prefix}PostCenter", a[0], a[1], dark, FENCE_HEIGHT + 0.05)
    distance = 0.24
    index = 0
    while distance < length - FENCE_POST_SIZE:
        fence_post(scene, f"{prefix}Post{index}", a[0] + ux * distance, a[1] + uy * distance, dark)
        distance += 0.24
        index += 1
    fence_post(scene, f"{prefix}PostEnd", b[0], b[1], dark)

    for level, (z0, z1) in enumerate(FENCE_RAIL_LEVELS):
        _diag_prism(scene, f"{prefix}Rail{level}", a, b, FENCE_RAIL_THICKNESS / 2.0, z0, z1, wood)


def build_fence_diagonal(scene: bpy.types.Scene, orientation: str) -> None:
    """Wood fence running corner-to-corner across the cell diagonal.

    nwse: NW corner to SE corner. nesw: NE corner to SW corner. Post pitch and
    rail cross-section match the straight fence so chains read as one family.
    """
    if orientation == "nwse":
        a, b = (-0.5, -0.5), (0.5, 0.5)
    else:
        a, b = (0.5, -0.5), (-0.5, 0.5)
    _fence_diagonal_run(scene, "DiagFenceA", (0.0, 0.0), a, center_post=True)
    _fence_diagonal_run(scene, "DiagFenceB", (0.0, 0.0), b, center_post=False)


def build_fence_diagonal_arm(scene: bpy.types.Scene, corner: str) -> None:
    """Junction arm from cell center to one corner, overlaid on straight
    fences that neighbor a diagonal fence (mirrors build_wall_diagonal_arm)."""
    _fence_diagonal_run(scene, "DiagFenceArm", (0.0, 0.0), DIAGONAL_CORNERS[corner], center_post=False)
