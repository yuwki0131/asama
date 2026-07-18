"""Rigged supply cart unit at production quality.

A 2-wheel ox-cart silhouette with three bones:
    cart_body  — root; controls the entire cart and cargo
    wheel.l    — left wheel (world +X side); animated with ry spin
    wheel.r    — right wheel (world -X side); animated with ry spin

Facing map SOUTH (world -Y). Canvas 56x48, anchorX=28, anchorY=38.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .rig import make_armature, rig_beam, rig_box, rig_limb

#: All bones that supply_cart actions keyframe.
CART_BONES = ["cart_body", "wheel.l", "wheel.r"]


def build_supply_cart(scene: bpy.types.Scene) -> bpy.types.Object:
    # --- materials ----------------------------------------------------------
    plank    = make_plank_material("CartPlank",   (0.068, 0.048, 0.028), (0.128, 0.092, 0.055))
    iron     = make_material("CartIron",         (0.28, 0.28, 0.30, 1.0))
    rope_mat = make_noise_material("CartRope",    (0.130, 0.108, 0.072), (0.200, 0.168, 0.118), scale=6.0)
    cargo    = make_noise_material("CartCargo",   (0.075, 0.062, 0.042), (0.145, 0.122, 0.085), scale=5.0)
    axle_mat = make_material("CartAxle",         (0.32, 0.28, 0.22, 1.0))

    # --- armature -----------------------------------------------------------
    rig = make_armature(scene, "SupplyCartRig", [
        # Root stub bone at cart-body centre-top
        ("cart_body", (0.0,   0.0,   0.28), (0.0,   0.0,   0.30), None),
        # Wheel stub bones at axle height, left and right
        ("wheel.l",   ( 0.26,  0.0,   0.20), ( 0.26,  0.0,   0.22), "cart_body"),
        ("wheel.r",   (-0.26,  0.0,   0.20), (-0.26,  0.0,   0.22), "cart_body"),
    ])

    # --- cart body ----------------------------------------------------------
    # Main cargo box
    rig_box(scene, rig, "CargoBox",
        (-0.210, -0.155, 0.12), (0.210, 0.185, 0.34), plank, "cart_body", bevel=0.006)
    # Front and rear boards (slightly wider)
    rig_box(scene, rig, "FrontBoard",
        (-0.218, -0.168, 0.12), (0.218, -0.145, 0.36), plank, "cart_body", bevel=0.004)
    rig_box(scene, rig, "RearBoard",
        (-0.218,  0.168, 0.12), (0.218,  0.195, 0.36), plank, "cart_body", bevel=0.004)
    # Cargo: three rice-straw bales (tawara) — two side by side, one on top.
    for name, bx, bz in (("BaleL", 0.090, 0.395), ("BaleR", -0.090, 0.395), ("BaleTop", 0.0, 0.498)):
        rig_limb(scene, rig, name,
            (bx, -0.125, bz), (bx, 0.150, bz),
            0.058, 0.058, cargo, "cart_body", segments=10, rings=3, bulge=0.04)
    # Cargo rope across the top bale
    rig_box(scene, rig, "CargoRopeH",
        (-0.155, -0.004, 0.495), (0.155, 0.016, 0.562), rope_mat, "cart_body", bevel=None)
    rig_box(scene, rig, "CargoRopeV",
        (-0.010, -0.130, 0.520), (0.010, 0.155, 0.566), rope_mat, "cart_body", bevel=None)
    # Axle (passes through both wheel bones)
    rig_limb(scene, rig, "Axle",
        (-0.28, 0.0, 0.20), (0.28, 0.0, 0.20),
        0.013, 0.013, axle_mat, "cart_body", segments=8, rings=2, bulge=0.0, cap="flat")
    # Tow-poles (round shafts extending forward from cart)
    for name, px in (("TowPole", -0.040), ("TowPoleR", 0.040)):
        rig_limb(scene, rig, name,
            (px, -0.14, 0.18), (px, -0.42, 0.16),
            0.012, 0.010, plank, "cart_body", segments=8, rings=2, bulge=0.0, cap="round")

    # --- wheels (each parented to its own bone so ry makes it spin) ---------
    # Proper round disc wheel (14-segment cylinder along the axle) with
    # crossing spokes slightly proud of both faces so the spin reads.
    for side, sx in (("L", 0.26), ("R", -0.26)):
        bone = f"wheel.{side.lower()}"
        rig_limb(scene, rig, f"WheelDisc.{side}",
            (sx - 0.024, 0.0, 0.20), (sx + 0.024, 0.0, 0.20),
            0.172, 0.172, plank, bone, segments=14, rings=2, bulge=0.0, cap="flat")
        # Hub boss cylinder
        rig_limb(scene, rig, f"WheelHub.{side}",
            (sx - 0.036, 0.0, 0.20), (sx + 0.036, 0.0, 0.20),
            0.042, 0.042, iron, bone, segments=10, rings=2, bulge=0.0, cap="flat")
        # Crossing spokes, proud of the disc faces so rotation is visible
        rig_beam(scene, rig, f"SpokeH.{side}",
            (sx - 0.032, -0.170, 0.20), (sx + 0.032, 0.170, 0.20), 0.030, axle_mat, bone)
        rig_beam(scene, rig, f"SpokeV.{side}",
            (sx - 0.032, 0.0, 0.03), (sx + 0.032, 0.0, 0.37), 0.030, axle_mat, bone)

    return rig
