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
from .rig import make_armature, rig_beam, rig_box, rig_slab

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
    # Cargo: a lumpy box on top
    rig_box(scene, rig, "Cargo",
        (-0.175, -0.130, 0.34), (0.175, 0.155, 0.46), cargo, "cart_body")
    # Cargo rope across top
    rig_box(scene, rig, "CargoRopeH",
        (-0.175, -0.005, 0.42), (0.175, 0.015, 0.48), rope_mat, "cart_body", bevel=None)
    rig_box(scene, rig, "CargoRopeV",
        (-0.010, -0.130, 0.42), (0.010, 0.155, 0.48), rope_mat, "cart_body", bevel=None)
    # Axle (passes through both wheel bones)
    rig_beam(scene, rig, "Axle",
        (-0.28, 0.0, 0.20), (0.28, 0.0, 0.20), 0.024, axle_mat, "cart_body")
    # Tow-pole (shaft extending forward from cart)
    rig_beam(scene, rig, "TowPole",
        (-0.040, -0.14, 0.18), (-0.040, -0.42, 0.16), 0.022, plank, "cart_body")
    rig_beam(scene, rig, "TowPoleR",
        ( 0.040, -0.14, 0.18), ( 0.040, -0.42, 0.16), 0.022, plank, "cart_body")

    # --- wheels (each parented to its own bone so ry makes it spin) ---------
    for side, sx in (("L", 0.26), ("R", -0.26)):
        bone = f"wheel.{side.lower()}"
        # Outer face plate of the wheel
        rig_box(scene, rig, f"WheelRim.{side}",
            (sx - 0.038, -0.178, 0.02), (sx + 0.038, 0.178, 0.38), plank, bone, bevel=0.006)
        # Hub boss
        rig_box(scene, rig, f"WheelHub.{side}",
            (sx - 0.048, -0.040, 0.17), (sx + 0.048, 0.040, 0.23), iron, bone)
        # Horizontal spoke
        rig_beam(scene, rig, f"SpokeH.{side}",
            (sx - 0.030, -0.168, 0.20), (sx + 0.030, 0.168, 0.20), 0.028, axle_mat, bone)
        # Vertical spoke
        rig_beam(scene, rig, f"SpokeV.{side}",
            (sx - 0.030, 0.0, 0.04), (sx + 0.030, 0.0, 0.36), 0.028, axle_mat, bone)
        # Iron tire (thin box around rim outline)
        rig_box(scene, rig, f"Tire.{side}",
            (sx - 0.028, -0.188, 0.00), (sx + 0.028, 0.188, 0.04), iron, bone, bevel=None)
        rig_box(scene, rig, f"TireTop.{side}",
            (sx - 0.028, -0.188, 0.36), (sx + 0.028, 0.188, 0.40), iron, bone, bevel=None)

    return rig
