"""Shared organic humanoid body for all rigged foot units.

Replaces the box-and-slab construction with smooth lathed/capsule meshes so
the painterly dot(N, L) ramp grades continuously across every surface —
this is what removes the "polygon" read at the ~30px on-canvas figure size
and pushes the sheets toward the approved 2D idle-sprite fidelity
(unit.archer.idle.south / unit.sword_ashigaru.idle.south):

    - torso: elliptical lathe cuirass with proud horizontal lacquer bands
      (okegawa-do plate read) over a flared lathe kusazuri skirt
    - head: lathed skull ellipsoid under a curved-brim lathed jingasa
    - limbs: tapered smooth capsules with cloth/muscle bulge profiles
      (puffed sleeves, baggy hakama thighs, slim kote forearms)
    - hands: small lathed spheres; feet stay softly bevelled sandal boxes

The armature layout, bone names (HUMANOID_BONES incl. the shared "spear"
weapon bone) and overall proportions are byte-identical to the previous
box model, so every existing action keyframer and the canvas/anchor
contract (48x64, anchor 24,52.48, figure ~30px) are unchanged.

Facing map SOUTH (world -Y); +X is the character's left.
"""
from __future__ import annotations

import bpy

from .rig import make_armature, rig_box, rig_lathe, rig_limb, rig_slab

#: Bones that actions may keyframe. Kept in one place so every action keys
#: the same channel set (deterministic sheets regardless of action order).
HUMANOID_BONES = [
    "hips", "spine", "head",
    "thigh.l", "shin.l", "thigh.r", "shin.r",
    "arm.l", "forearm.l", "arm.r", "forearm.r",
    "spear",
]

#: Armature layout shared by ashigaru / archer / musketeer / engineer.
#: The weapon bone position differs per unit, so it is appended by callers.
HUMANOID_BONE_LAYOUT = [
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
]

#: Right-hand weapon-grip bone (spear / katana / gun / hammer carriers).
WEAPON_BONE_RIGHT = ("spear", (-0.128, -0.09, 0.30), (-0.128, -0.09, 0.44), "forearm.r")
#: Left-hand weapon-grip bone (bow carrier).
WEAPON_BONE_LEFT_BOW = ("spear", (0.092, -0.10, 0.28), (0.092, -0.10, 0.44), "forearm.l")


def build_humanoid_body(
    scene: bpy.types.Scene,
    rig_name: str,
    materials: dict[str, bpy.types.Material],
    weapon_bone: tuple = WEAPON_BONE_RIGHT,
) -> bpy.types.Object:
    """Build the organic shared body. *materials* keys:

    ``do`` (cuirass/skirt/sode), ``lacing`` (armor cords), ``cloth``
    (sleeves/pelvis), ``hakama`` (thighs), ``skin``, ``jingasa``,
    ``kote`` (forearms/shins), ``sandal``, ``strap`` (obi).
    """
    m = materials
    rig = make_armature(scene, rig_name, HUMANOID_BONE_LAYOUT + [weapon_bone])

    # --- pelvis / obi / armor skirt (hips) ----------------------------------
    rig_lathe(scene, rig, "Koshi",
              [(0.070, 0.258), (0.086, 0.295), (0.082, 0.348)],
              m["cloth"], "hips", scale_x=1.05, scale_y=0.72, segments=14)
    rig_lathe(scene, rig, "Obi",
              [(0.086, 0.332), (0.093, 0.348), (0.086, 0.366)],
              m["strap"], "hips", scale_x=1.05, scale_y=0.74, segments=14)
    rig_lathe(scene, rig, "Kusazuri",
              [(0.121, 0.212), (0.108, 0.262), (0.094, 0.338)],
              m["do"], "hips", scale_y=0.72, segments=14)
    # Kusazuri hem cord: thin proud ring near the plate bottom edge.
    rig_lathe(scene, rig, "KusazuriHimo",
              [(0.114, 0.228), (0.121, 0.238), (0.114, 0.248)],
              m["lacing"], "hips", scale_y=0.72, segments=14)

    # --- torso (spine): lathed cuirass with proud lacquer bands -------------
    do_scale_x, do_scale_y = 1.0, 0.72
    rig_lathe(scene, rig, "Do",
              [(0.090, 0.342), (0.100, 0.395), (0.104, 0.452), (0.095, 0.500), (0.082, 0.524)],
              m["do"], "spine", scale_x=do_scale_x, scale_y=do_scale_y, segments=16)
    for band_index, (r_lo, r_hi, z) in enumerate((
        (0.093, 0.100, 0.366),
        (0.098, 0.106, 0.408),
        (0.101, 0.109, 0.450),
    )):
        rig_lathe(scene, rig, f"DoBand{band_index}",
                  [(r_lo, z - 0.010), (r_hi, z), (r_lo, z + 0.010)],
                  m["lacing"], "spine", scale_x=do_scale_x, scale_y=do_scale_y, segments=16)
    # Sode shoulder plates: flat lacquered boards read correctly as slabs.
    rig_slab(scene, rig, "Sode.L",
             top_low=(0.098, -0.052), top_high=(0.150, 0.052),
             bottom_low=(0.118, -0.062), bottom_high=(0.182, 0.062),
             z0=0.435, z1=0.525, material=m["do"], bone_name="spine")
    rig_slab(scene, rig, "Sode.R",
             top_low=(-0.150, -0.052), top_high=(-0.098, 0.052),
             bottom_low=(-0.182, -0.062), bottom_high=(-0.118, 0.062),
             z0=0.435, z1=0.525, material=m["do"], bone_name="spine")

    # --- head (head bone): skull ellipsoid + curved-brim jingasa ------------
    rig_limb(scene, rig, "Neck", (0.0, 0.002, 0.528), (0.0, 0.002, 0.576),
             0.027, 0.030, m["skin"], "head", segments=10, rings=3, bulge=0.0)
    rig_lathe(scene, rig, "Head",
              [(0.0, 0.554), (0.028, 0.562), (0.042, 0.580), (0.047, 0.605),
               (0.044, 0.632), (0.030, 0.650), (0.0, 0.660)],
              m["skin"], "head", center=(0.0, 0.004), scale_y=0.96, segments=14)
    rig_lathe(scene, rig, "Jingasa",
              [(0.110, 0.636), (0.113, 0.644), (0.086, 0.660), (0.054, 0.680),
               (0.022, 0.698), (0.0, 0.704)],
              m["jingasa"], "head", center=(0.0, 0.004), segments=16)

    # --- legs ---------------------------------------------------------------
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x = sign * 0.053
        rig_limb(scene, rig, f"Thigh.{side}",
                 (x, 0.002, 0.305), (x, 0.0, 0.150),
                 0.040, 0.030, m["hakama"], f"thigh.{suffix}",
                 segments=10, rings=5, bulge=0.10)
        rig_limb(scene, rig, f"Suneate.{side}",
                 (x, 0.0, 0.165), (x, -0.004, 0.030),
                 0.028, 0.024, m["kote"], f"shin.{suffix}",
                 segments=10, rings=4, bulge=0.03)
        x0, x1 = sorted((sign * 0.026, sign * 0.080))
        rig_box(scene, rig, f"Foot.{side}",
                (x0, -0.088, 0.0), (x1, 0.006, 0.030),
                m["sandal"], f"shin.{suffix}", bevel=0.008)

    # --- arms ---------------------------------------------------------------
    for side, sign in (("L", 1.0), ("R", -1.0)):
        suffix = side.lower()
        x = sign * 0.119
        rig_limb(scene, rig, f"Sleeve.{side}",
                 (x, 0.0, 0.515), (x, 0.0, 0.390),
                 0.033, 0.026, m["cloth"], f"arm.{suffix}",
                 segments=10, rings=5, bulge=0.12)
        rig_limb(scene, rig, f"Kote.{side}",
                 (x, 0.0, 0.395), (x, -0.006, 0.268),
                 0.024, 0.021, m["kote"], f"forearm.{suffix}",
                 segments=10, rings=4, bulge=0.04)
        rig_lathe(scene, rig, f"Hand.{side}",
                  [(0.0, 0.218), (0.016, 0.224), (0.021, 0.240), (0.016, 0.256), (0.0, 0.262)],
                  m["skin"], f"forearm.{suffix}", center=(x, -0.006), segments=10)

    return rig
