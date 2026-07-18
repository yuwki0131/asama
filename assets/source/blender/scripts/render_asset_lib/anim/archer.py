"""Rigged archer unit at production quality.

Shared organic humanoid body (see humanoid.py) with archer-specific parts:
    - Bow (yumi) replaces the spear; weapon bone parented to forearm.l
      so the bow follows the left-arm carry pose
    - Lighter cloth colour (ochre/straw) for the conscript-archer look
    - Round arrow quiver on the back (parented to spine)

Facing map SOUTH (world -Y); +X is the character's left.
Total height ~0.72 units, reads ~30px on the 48x64 unit canvas.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .humanoid import HUMANOID_BONES, WEAPON_BONE_LEFT_BOW, build_humanoid_body
from .rig import rig_limb

# Same bone list as ashigaru — the "spear" bone here represents the bow's
# grip attachment. Keeping this identical lets walk/idle/death reuse the
# humanoid action functions unchanged.
ARCHER_BONES = HUMANOID_BONES


def build_archer(scene: bpy.types.Scene) -> bpy.types.Object:
    materials = {
        "do": make_noise_material("ArcherDo", (0.058, 0.050, 0.048), (0.125, 0.110, 0.098), scale=9.0),
        "lacing": make_material("ArcherLacing", (0.340, 0.160, 0.055, 1.0)),
        "cloth": make_noise_material("ArcherCloth", (0.165, 0.145, 0.065), (0.248, 0.220, 0.110), scale=8.0),
        "hakama": make_noise_material("ArcherHakama", (0.145, 0.155, 0.080), (0.225, 0.240, 0.135), scale=8.0),
        "skin": make_material("ArcherSkin", (0.62, 0.48, 0.36, 1.0)),
        "jingasa": make_noise_material("ArcherJingasa", (0.060, 0.055, 0.038), (0.118, 0.105, 0.078), scale=7.0),
        "kote": make_noise_material("ArcherKote", (0.095, 0.075, 0.050), (0.160, 0.130, 0.090), scale=8.0),
        "sandal": make_material("ArcherSandal", (0.40, 0.32, 0.17, 1.0)),
        "strap": make_material("ArcherStrap", (0.10, 0.08, 0.05, 1.0)),
    }
    bow_wood = make_plank_material("ArcherBowWood", (0.042, 0.030, 0.018), (0.088, 0.064, 0.038))
    bow_string = make_material("ArcherBowString", (0.84, 0.80, 0.68, 1.0))
    quiver_mat = make_noise_material("ArcherQuiver", (0.072, 0.058, 0.040), (0.130, 0.105, 0.075), scale=7.0)
    shaft_mat = make_material("ArcherArrowShafts", (0.62, 0.56, 0.42, 1.0))

    rig = build_humanoid_body(scene, "ArcherRig", materials, WEAPON_BONE_LEFT_BOW)

    # Quiver on back: round lacquered tube with a hint of arrow shafts on top.
    rig_limb(scene, rig, "Quiver", (0.0, 0.074, 0.30), (0.0, 0.074, 0.545),
             0.026, 0.024, quiver_mat, "spine", segments=10, rings=2, bulge=0.0, cap="flat")
    rig_limb(scene, rig, "QuiverArrows", (0.0, 0.074, 0.545), (0.0, 0.074, 0.60),
             0.017, 0.015, shaft_mat, "spine", segments=8, rings=2, bulge=0.0, cap="flat")

    # --- yumi bow (spear bone = bow weapon bone; left-hand carry) -----------
    # Two tapered stave limbs approximating the asymmetric yumi curve.
    rig_limb(scene, rig, "BowLower", (0.092, -0.10, 0.10), (0.090, -0.11, 0.42),
             0.0055, 0.0085, bow_wood, "spear", segments=8, rings=3, bulge=0.0, cap="round")
    rig_limb(scene, rig, "BowUpper", (0.090, -0.11, 0.42), (0.088, -0.09, 0.74),
             0.0085, 0.0050, bow_wood, "spear", segments=8, rings=3, bulge=0.0, cap="round")
    # Bowstring slightly in front of stave
    rig_limb(scene, rig, "BowString", (0.092, -0.16, 0.10), (0.088, -0.15, 0.74),
             0.0028, 0.0028, bow_string, "spear", segments=6, rings=2, bulge=0.0, cap="flat")

    return rig
