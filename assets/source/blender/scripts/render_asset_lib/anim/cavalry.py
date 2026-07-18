"""Rigged cavalry unit at production quality: horse + mounted rider.

Organic construction (smooth capsules / lathes, see rig.py helpers):
    - horse: elliptical barrel capsule, tapered neck and muzzle, mane strip,
      hair-mass tail, two-segment capsule legs with cylindrical hooves, ears
    - rider: lathed cuirass and skull, curved-brim kabuto, capsule arms —
      matching the refined foot-unit bodies (humanoid.py)

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
from .rig import make_armature, rig_box, rig_lathe, rig_limb

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
    hoof_mat   = make_material("HorseHoof",        (0.13, 0.105, 0.080, 1.0))
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
    # Elliptical barrel capsule: chest and rump domes from the round caps.
    rig_limb(scene, rig, "HorseBody",
             (0.0, -0.245, 0.485), (0.0, 0.275, 0.475),
             0.128, 0.118, horse_coat, "horse_body",
             segments=12, rings=6, bulge=0.10, scale_u=1.10, scale_v=0.84)

    # Neck: thick tapered capsule up to the poll.
    rig_limb(scene, rig, "NeckBeam",
             (0.0, -0.20, 0.545), (0.0, -0.365, 0.705),
             0.062, 0.044, horse_coat, "neck", segments=10, rings=4, bulge=0.05)
    # Mane strip along top of neck
    rig_limb(scene, rig, "Mane",
             (0.0, -0.145, 0.615), (0.0, -0.38, 0.755),
             0.020, 0.013, horse_mane, "neck", segments=8, rings=3, bulge=0.15)

    # Head: tapered muzzle capsule + ears.
    rig_limb(scene, rig, "HorseHead",
             (0.0, -0.35, 0.715), (0.0, -0.505, 0.65),
             0.042, 0.023, horse_coat, "horse_head", segments=10, rings=4, bulge=0.02)
    for side, sx in (("L", 1.0), ("R", -1.0)):
        rig_limb(scene, rig, f"Ear.{side}",
                 (sx * 0.022, -0.325, 0.735), (sx * 0.032, -0.310, 0.778),
                 0.010, 0.002, horse_coat, "horse_head", segments=6, rings=2, bulge=0.0, cap="flat")
        rig_box(scene, rig, f"Eye.{side[0]}",
                (min(sx * 0.034, sx * 0.046), -0.442, 0.700),
                (max(sx * 0.034, sx * 0.046), -0.418, 0.722),
                horse_mane, "horse_head", bevel=None)

    # Tail: hair mass tapering to a tip.
    rig_limb(scene, rig, "TailBeam",
             (0.0, 0.28, 0.50), (0.0, 0.46, 0.33),
             0.026, 0.010, horse_mane, "tail", segments=8, rings=4, bulge=0.18)

    # Saddle blanket + saddle (attached to horse_body)
    rig_box(scene, rig, "SaddleBlanket",
            (-0.115, -0.085, 0.545), (0.115, 0.145, 0.578), rider_cloth, "horse_body", bevel=0.006)
    rig_box(scene, rig, "Saddle",
            (-0.095, -0.055, 0.565), (0.095, 0.115, 0.655), saddle, "horse_body", bevel=0.010)

    # --- horse legs ---------------------------------------------------------
    # Each leg: upper capsule + lower capsule + cylindrical hoof
    for prefix, sign_x, sign_y in [("fl", 1, -1), ("fr", -1, -1), ("rl", 1, 1), ("rr", -1, 1)]:
        sx = sign_x * 0.12
        sy = sign_y * 0.22
        rig_limb(scene, rig, f"UpperLeg_{prefix}",
                 (sx, sy, 0.505), (sx, sy, 0.275),
                 0.044, 0.028, horse_coat, f"{prefix}_upper", segments=8, rings=4, bulge=0.06)
        rig_limb(scene, rig, f"LowerLeg_{prefix}",
                 (sx, sy, 0.285), (sx, sy, 0.070),
                 0.026, 0.020, horse_coat, f"{prefix}_lower", segments=8, rings=3, bulge=0.03)
        rig_limb(scene, rig, f"Hoof_{prefix}",
                 (sx, sy - 0.004, 0.072), (sx, sy - 0.004, 0.0),
                 0.023, 0.028, hoof_mat, f"{prefix}_lower", segments=8, rings=2, bulge=0.0, cap="flat")

    # --- rider --------------------------------------------------------------
    rig_lathe(scene, rig, "RiderPelvis",
              [(0.055, 0.595), (0.070, 0.625), (0.066, 0.680)],
              rider_cloth, "rider_hips", scale_y=0.75, segments=12)
    rig_lathe(scene, rig, "RiderTorso",
              [(0.068, 0.675), (0.080, 0.720), (0.083, 0.770), (0.072, 0.815), (0.058, 0.836)],
              rider_armor, "rider_spine", scale_x=1.06, scale_y=0.70, segments=14)
    rig_limb(scene, rig, "RiderNeck",
             (0.0, 0.0, 0.795), (0.0, 0.0, 0.846),
             0.022, 0.025, rider_skin, "rider_head", segments=8, rings=2, bulge=0.0)
    rig_lathe(scene, rig, "RiderHead",
              [(0.0, 0.822), (0.026, 0.830), (0.040, 0.848), (0.044, 0.872),
               (0.040, 0.896), (0.026, 0.912), (0.0, 0.920)],
              rider_skin, "rider_head", center=(0.0, 0.002), scale_y=0.95, segments=12)
    # Kabuto with curved brim (mabizashi)
    rig_lathe(scene, rig, "Kabuto",
              [(0.100, 0.895), (0.104, 0.903), (0.078, 0.918), (0.048, 0.938),
               (0.020, 0.955), (0.0, 0.962)],
              rider_helm, "rider_head", center=(0.0, 0.002), segments=14)
    # Rider arms: capsule sleeve + armored forearm + hand sphere
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x = sign * 0.111
        rig_limb(scene, rig, f"RiderArm.{side}",
                 (x, 0.0, 0.795), (x, 0.0, 0.685),
                 0.026, 0.021, rider_cloth, f"rider_arm.{suffix}", segments=8, rings=4, bulge=0.10)
        rig_limb(scene, rig, f"RiderForearm.{side}",
                 (x, 0.0, 0.690), (x, -0.004, 0.575),
                 0.019, 0.016, rider_armor, f"rider_forearm.{suffix}", segments=8, rings=3, bulge=0.04)
        rig_lathe(scene, rig, f"RiderHand.{side}",
                  [(0.0, 0.525), (0.013, 0.531), (0.017, 0.545), (0.013, 0.559), (0.0, 0.565)],
                  rider_skin, f"rider_forearm.{suffix}", center=(x, -0.004), segments=8)

    # Lance (held in right hand, angled forward-up from rider_arm.r)
    rig_limb(scene, rig, "LanceShaft",
             (-0.11, -0.04, 0.70), (-0.11, -0.58, 0.92),
             0.009, 0.008, lance_wood, "rider_arm.r", segments=8, rings=2, bulge=0.0, cap="flat")
    rig_limb(scene, rig, "LanceTip",
             (-0.11, -0.575, 0.915), (-0.11, -0.650, 0.965),
             0.014, 0.002, lance_tip, "rider_arm.r", segments=8, rings=2, bulge=0.0, cap="flat")

    return rig
