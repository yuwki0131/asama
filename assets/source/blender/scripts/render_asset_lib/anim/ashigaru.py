"""Rigged spear ashigaru at production quality.

Upgrades over the P2 spike model:
    - part split: kusazuri armor skirt, tapered cuirass (do), sode shoulder
      plates, kote forearms, suneate shins, sandals, neck, chest lacing
    - bevel modifiers soften every box silhouette
    - conical jingasa (12-segment cone) instead of stacked boxes
    - two-segment limbs (thigh/shin, upper arm/forearm) for readable knees
      and a proper spear thrust
    - dedicated spear bone so attack can level the spear independently

Facing map SOUTH (world -Y); +X is the character's left. Total height
~0.72 units, reads ~30px on the 48x64 unit canvas.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .rig import make_armature, rig_beam, rig_box, rig_cone, rig_slab

#: Bones that actions may keyframe. Kept in one place so every action keys
#: the same channel set (deterministic sheets regardless of action order).
HUMANOID_BONES = [
    "hips", "spine", "head",
    "thigh.l", "shin.l", "thigh.r", "shin.r",
    "arm.l", "forearm.l", "arm.r", "forearm.r",
    "spear",
]


def build_spear_ashigaru(scene: bpy.types.Scene) -> bpy.types.Object:
    # --- materials (painterly factory conventions, pre-darkened albedo) ----
    do_armor = make_noise_material("AshigaruDo", (0.062, 0.055, 0.052), (0.135, 0.120, 0.105), scale=9.0)
    lacing = make_material("AshigaruLacing", (0.360, 0.170, 0.060, 1.0))
    cloth = make_noise_material("AshigaruCloth", (0.085, 0.095, 0.150), (0.155, 0.170, 0.245), scale=8.0)
    hakama = make_noise_material("AshigaruHakama", (0.120, 0.130, 0.185), (0.205, 0.220, 0.290), scale=8.0)
    skin = make_material("AshigaruSkin", (0.62, 0.48, 0.36, 1.0))
    jingasa = make_noise_material("AshigaruJingasa", (0.050, 0.042, 0.036), (0.110, 0.095, 0.075), scale=7.0)
    kote = make_noise_material("AshigaruKote", (0.095, 0.075, 0.050), (0.165, 0.135, 0.095), scale=8.0)
    sandal = make_material("AshigaruSandal", (0.400, 0.320, 0.170, 1.0))
    strap = make_material("AshigaruStrap", (0.100, 0.080, 0.050, 1.0))
    wood = make_plank_material("AshigaruSpearShaft", (0.075, 0.055, 0.034), (0.140, 0.105, 0.065))
    steel = make_material("AshigaruSpearHead", (0.58, 0.62, 0.68, 1.0))
    banner = make_noise_material("AshigaruBanner", (0.095, 0.145, 0.310), (0.165, 0.230, 0.420), scale=5.0)
    mon = make_material("AshigaruMon", (0.85, 0.86, 0.88, 1.0))

    # --- armature ----------------------------------------------------------
    rig = make_armature(scene, "AshigaruRig", [
        ("hips", (0.0, 0.0, 0.30), (0.0, 0.0, 0.37), None),
        ("spine", (0.0, 0.0, 0.37), (0.0, 0.0, 0.55), "hips"),
        ("head", (0.0, 0.0, 0.55), (0.0, 0.0, 0.67), "spine"),
        ("thigh.l", (0.052, 0.0, 0.30), (0.052, 0.0, 0.16), "hips"),
        ("shin.l", (0.052, 0.0, 0.16), (0.052, 0.0, 0.02), "thigh.l"),
        ("thigh.r", (-0.052, 0.0, 0.30), (-0.052, 0.0, 0.16), "hips"),
        ("shin.r", (-0.052, 0.0, 0.16), (-0.052, 0.0, 0.02), "thigh.r"),
        ("arm.l", (0.118, 0.0, 0.51), (0.118, 0.0, 0.395), "spine"),
        ("forearm.l", (0.118, 0.0, 0.395), (0.118, 0.0, 0.27), "arm.l"),
        ("arm.r", (-0.118, 0.0, 0.51), (-0.118, 0.0, 0.395), "spine"),
        ("forearm.r", (-0.118, 0.0, 0.395), (-0.118, 0.0, 0.27), "arm.r"),
        # Vertical helper bone at the right-hand grip. +X pitches the spear
        # tip toward the front (-Y); location Z pushes it forward.
        ("spear", (-0.128, -0.09, 0.30), (-0.128, -0.09, 0.44), "forearm.r"),
    ])

    # --- pelvis / armor skirt (hips) ---------------------------------------
    rig_box(scene, rig, "Pelvis", (-0.085, -0.055, 0.265), (0.085, 0.055, 0.345), cloth, "hips")
    rig_box(scene, rig, "Obi", (-0.090, -0.060, 0.335), (0.090, 0.060, 0.365), strap, "hips", bevel=0.006)
    rig_slab(
        scene, rig, "Kusazuri",
        top_low=(-0.090, -0.060), top_high=(0.090, 0.060),
        bottom_low=(-0.118, -0.078), bottom_high=(0.118, 0.078),
        z0=0.215, z1=0.335, material=do_armor, bone_name="hips",
    )

    # --- torso (spine) ------------------------------------------------------
    rig_slab(
        scene, rig, "Do",
        top_low=(-0.104, -0.068), top_high=(0.104, 0.068),
        bottom_low=(-0.090, -0.058), bottom_high=(0.090, 0.058),
        z0=0.345, z1=0.505, material=do_armor, bone_name="spine",
    )
    rig_box(scene, rig, "DoLacing", (-0.096, -0.064, 0.345), (0.096, 0.064, 0.364), lacing, "spine", bevel=0.005)
    rig_box(scene, rig, "MunaitaCord", (-0.055, -0.074, 0.455), (0.055, -0.058, 0.474), lacing, "spine", bevel=0.004)
    # Sode shoulder plates, sloped outward-down.
    rig_slab(
        scene, rig, "Sode.L",
        top_low=(0.098, -0.056), top_high=(0.150, 0.056),
        bottom_low=(0.118, -0.066), bottom_high=(0.182, 0.066),
        z0=0.435, z1=0.525, material=do_armor, bone_name="spine",
    )
    rig_slab(
        scene, rig, "Sode.R",
        top_low=(-0.150, -0.056), top_high=(-0.098, 0.056),
        bottom_low=(-0.182, -0.066), bottom_high=(-0.118, 0.066),
        z0=0.435, z1=0.525, material=do_armor, bone_name="spine",
    )

    # --- sashimono banner (spine; +Y is the character's back) ---------------
    rig_beam(scene, rig, "BannerPole", (0.0, 0.082, 0.34), (0.0, 0.082, 1.02), 0.014, wood, "spine")
    rig_box(scene, rig, "BannerCross", (-0.066, 0.076, 0.994), (0.066, 0.088, 1.006), wood, "spine", bevel=None)
    rig_box(scene, rig, "Banner", (-0.060, 0.078, 0.700), (0.060, 0.086, 0.994), banner, "spine", bevel=None)
    rig_box(scene, rig, "BannerMon", (-0.028, 0.0765, 0.820), (0.028, 0.0875, 0.876), mon, "spine", bevel=None)

    # --- head (head bone) ----------------------------------------------------
    rig_box(scene, rig, "Neck", (-0.030, -0.030, 0.530), (0.030, 0.030, 0.570), skin, "head", bevel=0.006)
    rig_box(scene, rig, "Head", (-0.046, -0.044, 0.558), (0.046, 0.050, 0.650), skin, "head")
    rig_cone(
        scene, rig, "Jingasa",
        center=(0.0, 0.004), radius=0.106, z0=0.636, z1=0.702,
        material=jingasa, bone_name="head", segments=12, top_radius=0.018,
    )

    # --- legs ---------------------------------------------------------------
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x0, x1 = sorted((sign * 0.022, sign * 0.084))
        rig_box(scene, rig, f"Thigh.{side}", (x0, -0.044, 0.150), (x1, 0.044, 0.305), hakama, f"thigh.{suffix}")
        x0, x1 = sorted((sign * 0.026, sign * 0.080))
        rig_box(scene, rig, f"Suneate.{side}", (x0, -0.037, 0.028), (x1, 0.037, 0.165), kote, f"shin.{suffix}")
        rig_box(scene, rig, f"Foot.{side}", (x0, -0.088, 0.0), (x1, 0.006, 0.030), sandal, f"shin.{suffix}", bevel=0.006)

    # --- arms ---------------------------------------------------------------
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x0, x1 = sorted((sign * 0.098, sign * 0.146))
        rig_box(scene, rig, f"Sleeve.{side}", (x0, -0.040, 0.388), (x1, 0.040, 0.512), cloth, f"arm.{suffix}")
        x0, x1 = sorted((sign * 0.102, sign * 0.142))
        rig_box(scene, rig, f"Kote.{side}", (x0, -0.035, 0.262), (x1, 0.035, 0.392), kote, f"forearm.{suffix}")
        x0, x1 = sorted((sign * 0.104, sign * 0.140))
        rig_box(scene, rig, f"Hand.{side}", (x0, -0.032, 0.222), (x1, 0.032, 0.266), skin, f"forearm.{suffix}", bevel=0.006)

    # --- spear (spear bone; carry pose = butt low front, blade high back) ----
    rig_beam(scene, rig, "SpearShaft", (-0.128, -0.315, 0.055), (-0.128, 0.235, 0.815), 0.022, wood, "spear")
    rig_beam(scene, rig, "SpearHead", (-0.128, 0.235, 0.815), (-0.128, 0.288, 0.888), 0.034, steel, "spear")

    return rig
