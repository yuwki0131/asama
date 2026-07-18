"""Rigged musketeer unit at production quality.

Shared organic humanoid body (see humanoid.py) with musketeer parts:
    - Tanegashima (arquebus) replaces the spear; weapon bone on forearm.r
    - Dark charcoal cloth to contrast the pale gun smoke colour
    - Matchlock mechanism detail on the barrel

Facing map SOUTH (world -Y); +X is the character's left.
Total height ~0.72 units, reads ~30px on the 48x64 unit canvas.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .humanoid import WEAPON_BONE_RIGHT, build_humanoid_body
from .rig import rig_box, rig_limb


def build_musketeer(scene: bpy.types.Scene) -> bpy.types.Object:
    materials = {
        "do": make_noise_material("MuskDo", (0.055, 0.048, 0.044), (0.118, 0.105, 0.092), scale=9.0),
        "lacing": make_material("MuskLacing", (0.320, 0.145, 0.052, 1.0)),
        "cloth": make_noise_material("MuskCloth", (0.050, 0.052, 0.060), (0.100, 0.105, 0.118), scale=8.0),
        "hakama": make_noise_material("MuskHakama", (0.060, 0.065, 0.080), (0.115, 0.125, 0.148), scale=8.0),
        "skin": make_material("MuskSkin", (0.62, 0.48, 0.36, 1.0)),
        "jingasa": make_noise_material("MuskJingasa", (0.048, 0.040, 0.034), (0.105, 0.090, 0.072), scale=7.0),
        "kote": make_noise_material("MuskKote", (0.090, 0.072, 0.048), (0.155, 0.128, 0.088), scale=8.0),
        "sandal": make_material("MuskSandal", (0.40, 0.32, 0.17, 1.0)),
        "strap": make_material("MuskStrap", (0.10, 0.08, 0.05, 1.0)),
    }
    gun_wood = make_plank_material("MuskStock", (0.058, 0.040, 0.022), (0.112, 0.080, 0.048))
    gun_steel = make_material("MuskBarrel", (0.48, 0.50, 0.54, 1.0))

    rig = build_humanoid_body(scene, "MusketeerRig", materials, WEAPON_BONE_RIGHT)

    # --- tanegashima arquebus (spear bone = weapon bone; right hand grip) ---
    # Wooden stock from grip downward (kept boxy: carpentry, not anatomy).
    rig_box(scene, rig, "GunStock", (-0.136, -0.06, 0.22), (-0.120, 0.02, 0.44), gun_wood, "spear", bevel=0.006)
    # Round steel barrel angles forward and upward from the grip.
    rig_limb(scene, rig, "GunBarrel", (-0.128, -0.06, 0.44), (-0.128, -0.36, 0.70),
             0.011, 0.009, gun_steel, "spear", segments=8, rings=2, bulge=0.0, cap="flat")
    # Matchlock mechanism box on the side
    rig_box(scene, rig, "Matchlock", (-0.122, -0.18, 0.40), (-0.110, -0.06, 0.50), gun_steel, "spear", bevel=None)

    return rig
