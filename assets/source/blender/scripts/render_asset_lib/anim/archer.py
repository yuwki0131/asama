"""Rigged archer unit at production quality.

Based on the spear ashigaru body with the following changes:
    - Bow (yumi) replaces the spear; weapon bone parented to forearm.l
      so the bow follows the left-arm carry pose
    - Lighter cloth colour (ochre/straw) for the conscript-archer look
    - Arrow quiver box on the back (parented to spine)

Facing map SOUTH (world -Y); +X is the character's left.
Total height ~0.72 units, reads ~30px on the 48x64 unit canvas.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .rig import make_armature, rig_beam, rig_box, rig_cone, rig_slab

# Same bone list as ashigaru — the "spear" bone here represents the bow's
# grip attachment. Keeping this identical lets walk/idle/death reuse the
# humanoid action functions unchanged.
ARCHER_BONES = [
    "hips", "spine", "head",
    "thigh.l", "shin.l", "thigh.r", "shin.r",
    "arm.l", "forearm.l", "arm.r", "forearm.r",
    "spear",
]


def build_archer(scene: bpy.types.Scene) -> bpy.types.Object:
    # --- materials ----------------------------------------------------------
    do_armor = make_noise_material("ArcherDo", (0.058, 0.050, 0.048), (0.125, 0.110, 0.098), scale=9.0)
    cloth = make_noise_material("ArcherCloth", (0.165, 0.145, 0.065), (0.248, 0.220, 0.110), scale=8.0)
    hakama = make_noise_material("ArcherHakama", (0.145, 0.155, 0.080), (0.225, 0.240, 0.135), scale=8.0)
    skin = make_material("ArcherSkin", (0.62, 0.48, 0.36, 1.0))
    jingasa = make_noise_material("ArcherJingasa", (0.060, 0.055, 0.038), (0.118, 0.105, 0.078), scale=7.0)
    kote = make_noise_material("ArcherKote", (0.095, 0.075, 0.050), (0.160, 0.130, 0.090), scale=8.0)
    sandal = make_material("ArcherSandal", (0.40, 0.32, 0.17, 1.0))
    strap = make_material("ArcherStrap", (0.10, 0.08, 0.05, 1.0))
    bow_wood = make_plank_material("ArcherBowWood", (0.042, 0.030, 0.018), (0.088, 0.064, 0.038))
    bow_string = make_material("ArcherBowString", (0.84, 0.80, 0.68, 1.0))
    quiver_mat = make_noise_material("ArcherQuiver", (0.072, 0.058, 0.040), (0.130, 0.105, 0.075), scale=7.0)
    lacing = make_material("ArcherLacing", (0.340, 0.160, 0.055, 1.0))

    # --- armature -----------------------------------------------------------
    rig = make_armature(scene, "ArcherRig", [
        ("hips",       (0.0,   0.0,   0.30), (0.0,   0.0,   0.37), None),
        ("spine",      (0.0,   0.0,   0.37), (0.0,   0.0,   0.55), "hips"),
        ("head",       (0.0,   0.0,   0.55), (0.0,   0.0,   0.67), "spine"),
        ("thigh.l",    (0.052,  0.0,   0.30), (0.052,  0.0,   0.16), "hips"),
        ("shin.l",     (0.052,  0.0,   0.16), (0.052,  0.0,   0.02), "thigh.l"),
        ("thigh.r",    (-0.052, 0.0,   0.30), (-0.052, 0.0,   0.16), "hips"),
        ("shin.r",     (-0.052, 0.0,   0.16), (-0.052, 0.0,   0.02), "thigh.r"),
        ("arm.l",      (0.118,  0.0,   0.51), (0.118,  0.0,   0.395), "spine"),
        ("forearm.l",  (0.118,  0.0,   0.395), (0.118, 0.0,   0.27), "arm.l"),
        ("arm.r",      (-0.118, 0.0,   0.51), (-0.118, 0.0,   0.395), "spine"),
        ("forearm.r",  (-0.118, 0.0,   0.395), (-0.118, 0.0,   0.27), "arm.r"),
        # Bow weapon bone attached to left forearm (archer holds bow in left hand).
        ("spear",      (0.092,  -0.10, 0.28), (0.092,  -0.10, 0.44), "forearm.l"),
    ])

    # --- pelvis / armor skirt (hips) ----------------------------------------
    rig_box(scene, rig, "Pelvis",   (-0.085, -0.055, 0.265), (0.085,  0.055, 0.345), cloth,    "hips")
    rig_box(scene, rig, "Obi",      (-0.090, -0.060, 0.335), (0.090,  0.060, 0.365), strap,    "hips", bevel=0.006)
    rig_slab(scene, rig, "Kusazuri",
        top_low=(-0.090, -0.060), top_high=(0.090, 0.060),
        bottom_low=(-0.118, -0.078), bottom_high=(0.118, 0.078),
        z0=0.215, z1=0.335, material=do_armor, bone_name="hips")

    # --- torso (spine) ------------------------------------------------------
    rig_slab(scene, rig, "Do",
        top_low=(-0.104, -0.068), top_high=(0.104, 0.068),
        bottom_low=(-0.090, -0.058), bottom_high=(0.090, 0.058),
        z0=0.345, z1=0.505, material=do_armor, bone_name="spine")
    rig_box(scene, rig, "DoLacing",    (-0.096, -0.064, 0.345), (0.096,  0.064, 0.364), lacing, "spine", bevel=0.005)
    rig_slab(scene, rig, "Sode.L",
        top_low=(0.098, -0.056), top_high=(0.150, 0.056),
        bottom_low=(0.118, -0.066), bottom_high=(0.182, 0.066),
        z0=0.435, z1=0.525, material=do_armor, bone_name="spine")
    rig_slab(scene, rig, "Sode.R",
        top_low=(-0.150, -0.056), top_high=(-0.098, 0.056),
        bottom_low=(-0.182, -0.066), bottom_high=(-0.118, 0.066),
        z0=0.435, z1=0.525, material=do_armor, bone_name="spine")

    # Quiver on back (small box of arrows on spine)
    rig_box(scene, rig, "Quiver", (-0.024, 0.058, 0.30), (0.024, 0.090, 0.56), quiver_mat, "spine", bevel=0.004)

    # --- head (head bone) ---------------------------------------------------
    rig_box(scene, rig, "Neck",    (-0.030, -0.030, 0.530), (0.030,  0.030, 0.570), skin,    "head", bevel=0.006)
    rig_box(scene, rig, "Head",    (-0.046, -0.044, 0.558), (0.046,  0.050, 0.650), skin,    "head")
    rig_cone(scene, rig, "Jingasa",
        center=(0.0, 0.004), radius=0.106, z0=0.636, z1=0.702,
        material=jingasa, bone_name="head", segments=12, top_radius=0.018)

    # --- legs ---------------------------------------------------------------
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x0, x1 = sorted((sign * 0.022, sign * 0.084))
        rig_box(scene, rig, f"Thigh.{side}",    (x0, -0.044, 0.150), (x1,  0.044, 0.305), hakama, f"thigh.{suffix}")
        x0, x1 = sorted((sign * 0.026, sign * 0.080))
        rig_box(scene, rig, f"Suneate.{side}",  (x0, -0.037, 0.028), (x1,  0.037, 0.165), kote,   f"shin.{suffix}")
        rig_box(scene, rig, f"Foot.{side}",     (x0, -0.088, 0.0),   (x1,  0.006, 0.030), sandal, f"shin.{suffix}", bevel=0.006)

    # --- arms ---------------------------------------------------------------
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x0, x1 = sorted((sign * 0.098, sign * 0.146))
        rig_box(scene, rig, f"Sleeve.{side}",  (x0, -0.040, 0.388), (x1,  0.040, 0.512), cloth, f"arm.{suffix}")
        x0, x1 = sorted((sign * 0.102, sign * 0.142))
        rig_box(scene, rig, f"Kote.{side}",    (x0, -0.035, 0.262), (x1,  0.035, 0.392), kote,  f"forearm.{suffix}")
        x0, x1 = sorted((sign * 0.104, sign * 0.140))
        rig_box(scene, rig, f"Hand.{side}",    (x0, -0.032, 0.222), (x1,  0.032, 0.266), skin,  f"forearm.{suffix}", bevel=0.006)

    # --- yumi bow (spear bone = bow weapon bone; left-hand carry) -----------
    # Two-segment stave approximating the asymmetric yumi curve.
    rig_beam(scene, rig, "BowLower", (0.092, -0.10, 0.10), (0.090, -0.11, 0.42), 0.015, bow_wood, "spear")
    rig_beam(scene, rig, "BowUpper", (0.090, -0.11, 0.42), (0.088, -0.09, 0.74), 0.015, bow_wood, "spear")
    # Bowstring slightly in front of stave
    rig_beam(scene, rig, "BowString", (0.092, -0.16, 0.10), (0.088, -0.15, 0.74), 0.006, bow_string, "spear")

    return rig
