"""Rigged cavalry unit at production quality: horse + mounted rider.

The compound rig has two conceptual layers:
    - Horse layer: horse_body (root) → neck → horse_head / tail / 4x upper+lower legs
    - Rider layer: rider_hips (parented to horse_body) → rider_spine → rider_head /
      rider_arm.l / rider_forearm.l / rider_arm.r / rider_forearm.r

Bone naming convention:
    fl = front-left  (world +X, front = world -Y)
    fr = front-right (world -X, front = world -Y)
    rl = rear-left   (world +X, rear  = world +Y)
    rr = rear-right  (world -X, rear  = world +Y)

Sign convention (same as humanoid):
    Down-pointing leg bones: +X rotation swings tail toward +Y (horse back).

Facing map SOUTH (world -Y). Canvas 64x64, anchorX=32, anchorY=52.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .rig import make_armature, rig_beam, rig_box, rig_cone, rig_slab

#: All bones that cavalry actions keyframe.
CAVALRY_BONES = [
    "horse_body", "neck", "horse_head", "tail",
    "fl_upper", "fl_lower", "fr_upper", "fr_lower",
    "rl_upper", "rl_lower", "rr_upper", "rr_lower",
    "rider_hips", "rider_spine", "rider_head",
    "rider_arm.l", "rider_forearm.l", "rider_arm.r", "rider_forearm.r",
]


def build_cavalry(scene: bpy.types.Scene) -> bpy.types.Object:
    # --- materials ----------------------------------------------------------
    horse_coat = make_noise_material("HorseCoat",   (0.058, 0.038, 0.022), (0.125, 0.090, 0.058), scale=7.0)
    horse_mane = make_noise_material("HorseMane",   (0.025, 0.018, 0.012), (0.068, 0.050, 0.034), scale=6.0)
    hoof_mat   = make_material("HorseHoof",        (0.22, 0.18, 0.14, 1.0))
    saddle     = make_noise_material("HorseSaddle", (0.072, 0.050, 0.030), (0.138, 0.098, 0.060), scale=8.0)
    rider_armor= make_noise_material("RiderArmor",  (0.055, 0.048, 0.044), (0.118, 0.105, 0.090), scale=9.0)
    rider_cloth= make_noise_material("RiderCloth",  (0.080, 0.095, 0.160), (0.150, 0.168, 0.255), scale=8.0)
    rider_skin = make_material("RiderSkin",        (0.62, 0.48, 0.36, 1.0))
    rider_helm = make_noise_material("RiderHelmet", (0.048, 0.040, 0.032), (0.108, 0.092, 0.072), scale=7.0)
    lance_wood = make_plank_material("RiderLance",  (0.070, 0.050, 0.030), (0.130, 0.095, 0.058))
    lance_tip  = make_material("RiderLanceTip",    (0.55, 0.60, 0.66, 1.0))

    # --- armature -----------------------------------------------------------
    rig = make_armature(scene, "CavalryRig", [
        # Horse root (stub bone at back-midpoint height)
        ("horse_body",     (0.0,   0.0,   0.46), (0.0,   0.0,   0.48), None),
        # Neck angles forward-upward
        ("neck",           (0.0,  -0.22,  0.54), (0.0,  -0.36,  0.70), "horse_body"),
        ("horse_head",     (0.0,  -0.36,  0.70), (0.0,  -0.46,  0.66), "neck"),
        # Tail angles rearward-downward
        ("tail",           (0.0,   0.28,  0.50), (0.0,   0.44,  0.36), "horse_body"),
        # Front legs (front of horse = world -Y)
        ("fl_upper",       ( 0.12, -0.22,  0.50), ( 0.12, -0.22,  0.28), "horse_body"),
        ("fl_lower",       ( 0.12, -0.22,  0.28), ( 0.12, -0.22,  0.06), "fl_upper"),
        ("fr_upper",       (-0.12, -0.22,  0.50), (-0.12, -0.22,  0.28), "horse_body"),
        ("fr_lower",       (-0.12, -0.22,  0.28), (-0.12, -0.22,  0.06), "fr_upper"),
        # Rear legs (rear of horse = world +Y)
        ("rl_upper",       ( 0.12,  0.22,  0.50), ( 0.12,  0.22,  0.28), "horse_body"),
        ("rl_lower",       ( 0.12,  0.22,  0.28), ( 0.12,  0.22,  0.06), "rl_upper"),
        ("rr_upper",       (-0.12,  0.22,  0.50), (-0.12,  0.22,  0.28), "horse_body"),
        ("rr_lower",       (-0.12,  0.22,  0.28), (-0.12,  0.22,  0.06), "rr_upper"),
        # Rider: parented to horse_body so rider moves with horse
        ("rider_hips",     (0.0,   0.0,   0.62), (0.0,   0.0,   0.68), "horse_body"),
        ("rider_spine",    (0.0,   0.0,   0.68), (0.0,   0.0,   0.82), "rider_hips"),
        ("rider_head",     (0.0,   0.0,   0.82), (0.0,   0.0,   0.94), "rider_spine"),
        ("rider_arm.l",    ( 0.11,  0.0,   0.79), ( 0.11,  0.0,   0.68), "rider_spine"),
        ("rider_forearm.l",( 0.11,  0.0,   0.68), ( 0.11,  0.0,   0.57), "rider_arm.l"),
        ("rider_arm.r",    (-0.11,  0.0,   0.79), (-0.11,  0.0,   0.68), "rider_spine"),
        ("rider_forearm.r",(-0.11,  0.0,   0.68), (-0.11,  0.0,   0.57), "rider_arm.r"),
    ])

    # --- horse body ---------------------------------------------------------
    # Main torso slab (slightly wider at shoulder, narrower at rump)
    rig_slab(scene, rig, "HorseBody",
        top_low=(-0.14, -0.24), top_high=(0.14, 0.26),
        bottom_low=(-0.13, -0.22), bottom_high=(0.13, 0.24),
        z0=0.44, z1=0.56, material=horse_coat, bone_name="horse_body")
    # Belly slightly wider lower
    rig_slab(scene, rig, "HorseBelly",
        top_low=(-0.13, -0.22), top_high=(0.13, 0.24),
        bottom_low=(-0.15, -0.24), bottom_high=(0.15, 0.26),
        z0=0.36, z1=0.44, material=horse_coat, bone_name="horse_body")

    # Neck beam
    rig_beam(scene, rig, "NeckBeam",
        (0.0, -0.22, 0.54), (0.0, -0.36, 0.70), 0.098, horse_coat, "neck")
    # Mane strip along top of neck
    rig_beam(scene, rig, "Mane",
        (0.0, -0.16, 0.62), (0.0, -0.36, 0.74), 0.035, horse_mane, "neck")

    # Head
    rig_box(scene, rig, "HorseHead",
        (-0.052, -0.48, 0.62), (0.052, -0.34, 0.74), horse_coat, "horse_head")
    rig_box(scene, rig, "Snout",
        (-0.038, -0.52, 0.62), (0.038, -0.40, 0.69), horse_coat, "horse_head", bevel=0.006)
    # Eye dots
    rig_box(scene, rig, "EyeL",
        ( 0.038, -0.465, 0.68), ( 0.055, -0.435, 0.71), horse_mane, "horse_head", bevel=None)
    rig_box(scene, rig, "EyeR",
        (-0.055, -0.465, 0.68), (-0.038, -0.435, 0.71), horse_mane, "horse_head", bevel=None)

    # Tail
    rig_beam(scene, rig, "TailBeam",
        (0.0, 0.28, 0.50), (0.0, 0.44, 0.34), 0.048, horse_mane, "tail")

    # Saddle (attached to horse_body)
    rig_box(scene, rig, "Saddle",
        (-0.10, -0.06, 0.55), (0.10, 0.12, 0.66), saddle, "horse_body", bevel=0.008)

    # --- horse legs ---------------------------------------------------------
    # Each leg: upper limb + lower limb + hoof
    for prefix, sign_x, sign_y in [("fl", 1, -1), ("fr", -1, -1), ("rl", 1, 1), ("rr", -1, 1)]:
        sx = sign_x * 0.12
        sy = sign_y * 0.22
        x0, x1 = sorted((sx - 0.040, sx + 0.040))
        rig_box(scene, rig, f"UpperLeg_{prefix}",
            (x0, sy - 0.038, 0.28), (x1, sy + 0.038, 0.50), horse_coat, f"{prefix}_upper")
        rig_box(scene, rig, f"LowerLeg_{prefix}",
            (x0, sy - 0.034, 0.06), (x1, sy + 0.034, 0.28), horse_coat, f"{prefix}_lower")
        rig_box(scene, rig, f"Hoof_{prefix}",
            (x0, sy - 0.040, 0.0),  (x1, sy + 0.040, 0.08), hoof_mat,  f"{prefix}_lower", bevel=0.004)

    # --- rider --------------------------------------------------------------
    rig_box(scene, rig, "RiderPelvis",
        (-0.072, -0.042, 0.60), (0.072, 0.042, 0.68), rider_cloth, "rider_hips")
    rig_box(scene, rig, "RiderTorso",
        (-0.082, -0.052, 0.68), (0.082, 0.052, 0.84), rider_armor, "rider_spine")
    rig_box(scene, rig, "RiderNeck",
        (-0.026, -0.026, 0.80), (0.026, 0.026, 0.84), rider_skin, "rider_head", bevel=0.005)
    rig_box(scene, rig, "RiderHead",
        (-0.044, -0.040, 0.82), (0.044, 0.044, 0.94), rider_skin, "rider_head")
    # Helmet (kabuto)
    rig_cone(scene, rig, "Kabuto",
        center=(0.0, 0.002), radius=0.096, z0=0.920, z1=0.990,
        material=rider_helm, bone_name="rider_head", segments=10, top_radius=0.020)
    # Rider arms
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x0, x1 = sorted((sign * 0.084, sign * 0.132))
        rig_box(scene, rig, f"RiderArm.{side}",
            (x0, -0.030, 0.70), (x1, 0.030, 0.80), rider_cloth, f"rider_arm.{suffix}")
        rig_box(scene, rig, f"RiderForearm.{side}",
            (x0, -0.026, 0.57), (x1, 0.026, 0.70), rider_armor, f"rider_forearm.{suffix}")
        rig_box(scene, rig, f"RiderHand.{side}",
            (x0, -0.024, 0.52), (x1, 0.024, 0.59), rider_skin,  f"rider_forearm.{suffix}", bevel=0.005)

    # Lance (held in right hand, angled forward-up from rider_arm.r)
    rig_beam(scene, rig, "LanceShaft",
        (-0.11, -0.04, 0.70), (-0.11, -0.58, 0.92), 0.018, lance_wood, "rider_arm.r")
    rig_beam(scene, rig, "LanceTip",
        (-0.11, -0.58, 0.92), (-0.11, -0.64, 0.96), 0.028, lance_tip, "rider_arm.r")

    return rig
