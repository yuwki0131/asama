"""Rigged engineer unit at production quality.

Shared organic humanoid body (see humanoid.py) with engineer parts:
    - Hammer (tetsu-tsuchi) replaces the spear; weapon bone on forearm.r
    - Muted brown working-clothes colour palette
    - No sashimono banner (engineer carries no standard)
    - Iron tool-belt detail on hips

Facing map SOUTH (world -Y); +X is the character's left.
Total height ~0.72 units, reads ~30px on the 48x64 unit canvas.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .humanoid import WEAPON_BONE_RIGHT, build_humanoid_body
from .rig import rig_box, rig_lathe, rig_limb


def build_engineer(scene: bpy.types.Scene) -> bpy.types.Object:
    materials = {
        "do": make_noise_material("EngDo", (0.060, 0.052, 0.046), (0.128, 0.112, 0.095), scale=9.0),
        "lacing": make_material("EngLacing", (0.300, 0.140, 0.048, 1.0)),
        "cloth": make_noise_material("EngCloth", (0.110, 0.088, 0.058), (0.188, 0.155, 0.105), scale=8.0),
        "hakama": make_noise_material("EngHakama", (0.095, 0.078, 0.052), (0.165, 0.138, 0.095), scale=8.0),
        "skin": make_material("EngSkin", (0.62, 0.48, 0.36, 1.0)),
        "jingasa": make_noise_material("EngJingasa", (0.052, 0.044, 0.036), (0.112, 0.096, 0.076), scale=7.0),
        "kote": make_noise_material("EngKote", (0.098, 0.078, 0.052), (0.168, 0.138, 0.095), scale=8.0),
        "sandal": make_material("EngSandal", (0.40, 0.32, 0.17, 1.0)),
        "strap": make_material("EngStrap", (0.10, 0.08, 0.05, 1.0)),
    }
    handle_wood = make_plank_material("EngHandle", (0.068, 0.048, 0.028), (0.128, 0.092, 0.055))
    hammer_iron = make_material("EngHammerIron", (0.32, 0.32, 0.34, 1.0))

    rig = build_humanoid_body(scene, "EngineerRig", materials, WEAPON_BONE_RIGHT)

    # Iron tool-belt ring over the obi.
    rig_lathe(scene, rig, "ToolBelt",
              [(0.087, 0.336), (0.094, 0.346), (0.087, 0.356)],
              hammer_iron, "hips", scale_x=1.05, scale_y=0.74, segments=14)

    # --- hammer (spear bone = weapon bone; right-hand grip) -----------------
    # Handle: round pole from below grip upward
    rig_limb(scene, rig, "HammerHandle", (-0.128, -0.09, 0.22), (-0.128, -0.09, 0.60),
             0.011, 0.010, handle_wood, "spear", segments=8, rings=2, bulge=0.0, cap="flat")
    # Head: wide iron box across the top of the handle
    rig_box(scene, rig, "HammerHead", (-0.168, -0.115, 0.56), (-0.088, -0.065, 0.70), hammer_iron, "spear", bevel=0.010)

    return rig
