"""Rigged engineer unit at production quality.

Based on the spear ashigaru body with the following changes:
    - Hammer (tetsu-tsuchi) replaces the spear; weapon bone on forearm.r
    - Muted brown working-clothes colour palette
    - No sashimono banner (engineer carries no standard)
    - Leather tool-belt detail on hips

Facing map SOUTH (world -Y); +X is the character's left.
Total height ~0.72 units, reads ~30px on the 48x64 unit canvas.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .rig import make_armature, rig_beam, rig_box, rig_cone, rig_slab


def build_engineer(scene: bpy.types.Scene) -> bpy.types.Object:
    # --- materials ----------------------------------------------------------
    do_armor     = make_noise_material("EngDo",      (0.060, 0.052, 0.046), (0.128, 0.112, 0.095), scale=9.0)
    lacing       = make_material("EngLacing",       (0.300, 0.140, 0.048, 1.0))
    cloth        = make_noise_material("EngCloth",   (0.110, 0.088, 0.058), (0.188, 0.155, 0.105), scale=8.0)
    hakama       = make_noise_material("EngHakama",  (0.095, 0.078, 0.052), (0.165, 0.138, 0.095), scale=8.0)
    skin         = make_material("EngSkin",         (0.62, 0.48, 0.36, 1.0))
    jingasa      = make_noise_material("EngJingasa", (0.052, 0.044, 0.036), (0.112, 0.096, 0.076), scale=7.0)
    kote         = make_noise_material("EngKote",    (0.098, 0.078, 0.052), (0.168, 0.138, 0.095), scale=8.0)
    sandal       = make_material("EngSandal",       (0.40, 0.32, 0.17, 1.0))
    strap        = make_material("EngStrap",        (0.10, 0.08, 0.05, 1.0))
    handle_wood  = make_plank_material("EngHandle",  (0.068, 0.048, 0.028), (0.128, 0.092, 0.055))
    hammer_iron  = make_material("EngHammerIron",   (0.32, 0.32, 0.34, 1.0))

    # --- armature -----------------------------------------------------------
    rig = make_armature(scene, "EngineerRig", [
        ("hips",       (0.0,    0.0,   0.30), (0.0,    0.0,   0.37), None),
        ("spine",      (0.0,    0.0,   0.37), (0.0,    0.0,   0.55), "hips"),
        ("head",       (0.0,    0.0,   0.55), (0.0,    0.0,   0.67), "spine"),
        ("thigh.l",    ( 0.052, 0.0,   0.30), ( 0.052, 0.0,   0.16), "hips"),
        ("shin.l",     ( 0.052, 0.0,   0.16), ( 0.052, 0.0,   0.02), "thigh.l"),
        ("thigh.r",    (-0.052, 0.0,   0.30), (-0.052, 0.0,   0.16), "hips"),
        ("shin.r",     (-0.052, 0.0,   0.16), (-0.052, 0.0,   0.02), "thigh.r"),
        ("arm.l",      ( 0.118, 0.0,   0.51), ( 0.118, 0.0,   0.395), "spine"),
        ("forearm.l",  ( 0.118, 0.0,   0.395),( 0.118, 0.0,   0.27), "arm.l"),
        ("arm.r",      (-0.118, 0.0,   0.51), (-0.118, 0.0,   0.395), "spine"),
        ("forearm.r",  (-0.118, 0.0,   0.395),(-0.118, 0.0,   0.27), "arm.r"),
        # Hammer weapon bone at right-hand grip (same position as ashigaru spear bone).
        ("spear",      (-0.128, -0.09, 0.30), (-0.128, -0.09, 0.44), "forearm.r"),
    ])

    # --- pelvis / armor skirt (hips) ----------------------------------------
    rig_box(scene, rig, "Pelvis",   (-0.085, -0.055, 0.265), (0.085,  0.055, 0.345), cloth,   "hips")
    rig_box(scene, rig, "Obi",      (-0.090, -0.060, 0.335), (0.090,  0.060, 0.365), strap,   "hips", bevel=0.006)
    # Tool belt detail
    rig_box(scene, rig, "ToolBelt", (-0.092, -0.062, 0.338), (0.092,  0.062, 0.356), hammer_iron, "hips", bevel=None)
    rig_slab(scene, rig, "Kusazuri",
        top_low=(-0.090, -0.060), top_high=(0.090, 0.060),
        bottom_low=(-0.118, -0.078), bottom_high=(0.118, 0.078),
        z0=0.215, z1=0.335, material=do_armor, bone_name="hips")

    # --- torso (spine) ------------------------------------------------------
    rig_slab(scene, rig, "Do",
        top_low=(-0.104, -0.068), top_high=(0.104, 0.068),
        bottom_low=(-0.090, -0.058), bottom_high=(0.090, 0.058),
        z0=0.345, z1=0.505, material=do_armor, bone_name="spine")
    rig_box(scene, rig, "DoLacing", (-0.096, -0.064, 0.345), (0.096,  0.064, 0.364), lacing,  "spine", bevel=0.005)
    rig_slab(scene, rig, "Sode.L",
        top_low=(0.098, -0.056), top_high=(0.150, 0.056),
        bottom_low=(0.118, -0.066), bottom_high=(0.182, 0.066),
        z0=0.435, z1=0.525, material=do_armor, bone_name="spine")
    rig_slab(scene, rig, "Sode.R",
        top_low=(-0.150, -0.056), top_high=(-0.098, 0.056),
        bottom_low=(-0.182, -0.066), bottom_high=(-0.118, 0.066),
        z0=0.435, z1=0.525, material=do_armor, bone_name="spine")

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
        rig_box(scene, rig, f"Thigh.{side}",   (x0, -0.044, 0.150), (x1,  0.044, 0.305), hakama, f"thigh.{suffix}")
        x0, x1 = sorted((sign * 0.026, sign * 0.080))
        rig_box(scene, rig, f"Suneate.{side}", (x0, -0.037, 0.028), (x1,  0.037, 0.165), kote,   f"shin.{suffix}")
        rig_box(scene, rig, f"Foot.{side}",    (x0, -0.088, 0.0),   (x1,  0.006, 0.030), sandal, f"shin.{suffix}", bevel=0.006)

    # --- arms ---------------------------------------------------------------
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x0, x1 = sorted((sign * 0.098, sign * 0.146))
        rig_box(scene, rig, f"Sleeve.{side}",  (x0, -0.040, 0.388), (x1,  0.040, 0.512), cloth, f"arm.{suffix}")
        x0, x1 = sorted((sign * 0.102, sign * 0.142))
        rig_box(scene, rig, f"Kote.{side}",    (x0, -0.035, 0.262), (x1,  0.035, 0.392), kote,  f"forearm.{suffix}")
        x0, x1 = sorted((sign * 0.104, sign * 0.140))
        rig_box(scene, rig, f"Hand.{side}",    (x0, -0.032, 0.222), (x1,  0.032, 0.266), skin,  f"forearm.{suffix}", bevel=0.006)

    # --- hammer (spear bone = weapon bone; right-hand grip) -----------------
    # Handle: long pole from below grip upward
    rig_beam(scene, rig, "HammerHandle", (-0.128, -0.09, 0.22), (-0.128, -0.09, 0.60), 0.020, handle_wood, "spear")
    # Head: wide iron box across the top of the handle
    rig_box(scene, rig, "HammerHead",    (-0.168, -0.115, 0.56), (-0.088, -0.065, 0.70), hammer_iron, "spear", bevel=0.008)

    return rig
