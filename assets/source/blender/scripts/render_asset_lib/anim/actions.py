"""Humanoid and non-humanoid action keyframers.

Covers: walk / idle / attack / death for all animated unit types.

Sign conventions for straight rest bones (roll 0):

    Down-pointing limb bones (thigh/shin/arm/forearm):
        +X rotation swings the tail toward +Y (character's BACK)
    Up-pointing bones (hips/spine/head/spear):
        +X rotation tips toward -Y (FRONT)
    hips/spear pose location: local Y = along bone (world up),
        local Z = world -Y (character's front)

Loop actions use phase = 2*pi*(f-1)/frames so the last frame wraps
seamlessly to the first. Death uses t = (f-1)/(frames-1) and holds
the final pose.

Model-specific action lookup
-----------------------------
``ACTIONS`` contains both plain names (``"walk"``, ``"attack"`` …) that are
shared across humanoid units, and ``"<model>:<action>"`` keys that override
the plain name for a specific model.  ``render_anim_asset.py`` tries the
model-scoped key first, falling back to the plain key.
"""
from __future__ import annotations

import math

import bpy

from .ashigaru import HUMANOID_BONES
from .cavalry import CAVALRY_BONES
from .supply_cart import CART_BONES

RAD = math.radians


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def _begin(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    scene.frame_start = 1
    scene.frame_end = frame_count
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)


def _key_pose_for_list(rig: bpy.types.Object, frame: int, bone_list: list[str]) -> None:
    for name in bone_list:
        pose_bone = rig.pose.bones[name]
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
        pose_bone.keyframe_insert(data_path="location", frame=frame)


def _key_pose(rig: bpy.types.Object, frame: int) -> None:
    _key_pose_for_list(rig, frame, HUMANOID_BONES)


def _curve(points: list[tuple[float, float]], t: float) -> float:
    """Piecewise-linear key-pose curve over normalised time t in [0, 1]."""
    if t <= points[0][0]:
        return points[0][1]
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if t <= t1:
            span = t1 - t0
            return v1 if span <= 0.0 else v0 + (v1 - v0) * (t - t0) / span
    return points[-1][1]


_CHANNEL_INDEX = {"rx": 0, "ry": 1, "rz": 2, "lx": 0, "ly": 1, "lz": 2}


def _apply_curve_table(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    frame_count: int,
    table: dict[tuple[str, str], list[tuple[float, float]]],
    loop: bool,
    bone_list: list[str] | None = None,
) -> None:
    """Drive every bone in *bone_list* from a {(bone, channel): curve} table.

    *bone_list* defaults to ``HUMANOID_BONES`` so existing callers are
    unchanged.
    """
    if bone_list is None:
        bone_list = HUMANOID_BONES
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        if loop:
            t = (f - 1) / frame_count
        else:
            t = 0.0 if frame_count <= 1 else (f - 1) / (frame_count - 1)
        # Reset all tracked bones to rest pose before applying curves.
        for name in bone_list:
            bones[name].rotation_euler = (0.0, 0.0, 0.0)
            bones[name].location = (0.0, 0.0, 0.0)
        for (bone_name, channel), points in table.items():
            value = _curve(points, t)
            pose_bone = bones[bone_name]
            if channel.startswith("r"):
                euler = list(pose_bone.rotation_euler)
                euler[_CHANNEL_INDEX[channel]] = value
                pose_bone.rotation_euler = tuple(euler)
            else:
                location = list(pose_bone.location)
                location[_CHANNEL_INDEX[channel]] = value
                pose_bone.location = tuple(location)
        _key_pose_for_list(rig, f, bone_list)


# ===========================================================================
# SHARED HUMANOID ACTIONS  (spear ashigaru + archer + musketeer + engineer)
# ===========================================================================

# --- walk ------------------------------------------------------------------

LEG_SWING    = RAD(26.0)
KNEE_BEND    = RAD(17.0)
ARM_SWING    = RAD(17.0)
SPEAR_ARM_SWING = RAD(6.0)
TORSO_TWIST  = RAD(6.0)
WALK_LEAN    = RAD(4.0)
HIP_BOB      = 0.022


def apply_walk(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        phase = 2.0 * math.pi * (f - 1) / frame_count
        s = math.sin(phase)
        c = math.cos(phase)

        bones["thigh.l"].rotation_euler    = (LEG_SWING * s, 0.0, 0.0)
        bones["shin.l"].rotation_euler     = (KNEE_BEND * max(0.0, -c) + RAD(4.0), 0.0, 0.0)
        bones["thigh.r"].rotation_euler    = (-LEG_SWING * s, 0.0, 0.0)
        bones["shin.r"].rotation_euler     = (KNEE_BEND * max(0.0, c) + RAD(4.0), 0.0, 0.0)

        bones["arm.l"].rotation_euler      = (-ARM_SWING * s, 0.0, 0.0)
        bones["forearm.l"].rotation_euler  = (RAD(-7.0) + RAD(-5.0) * math.sin(phase - 0.6), 0.0, 0.0)
        bones["arm.r"].rotation_euler      = (SPEAR_ARM_SWING * s, 0.0, 0.0)
        bones["forearm.r"].rotation_euler  = (RAD(-5.0), 0.0, 0.0)
        bones["spear"].rotation_euler      = (0.0, 0.0, 0.0)

        bones["spine"].rotation_euler      = (WALK_LEAN, TORSO_TWIST * s, 0.0)
        bones["head"].rotation_euler       = (-WALK_LEAN * 0.5, -TORSO_TWIST * s * 0.7, 0.0)
        bones["hips"].location             = (0.0, -HIP_BOB * s * s, 0.0)

        _key_pose(rig, f)


# --- idle ------------------------------------------------------------------

def apply_idle(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        phase = 2.0 * math.pi * (f - 1) / frame_count
        s = math.sin(phase)

        bones["spine"].rotation_euler     = (RAD(2.0) + RAD(1.6) * s, RAD(1.0) * s, 0.0)
        bones["head"].rotation_euler      = (RAD(-1.2) * s, RAD(-0.8) * s, 0.0)
        bones["arm.l"].rotation_euler     = (RAD(-2.0) + RAD(1.5) * s, 0.0, 0.0)
        bones["forearm.l"].rotation_euler = (RAD(-6.0) + RAD(1.5) * s, 0.0, 0.0)
        bones["arm.r"].rotation_euler     = (RAD(1.5) * math.sin(phase + 0.9), 0.0, 0.0)
        bones["forearm.r"].rotation_euler = (RAD(-3.0), 0.0, 0.0)
        bones["spear"].rotation_euler     = (RAD(2.2) * math.sin(phase + 0.9), 0.0, 0.0)
        bones["hips"].location            = (0.0, 0.005 * s, 0.0)

        _key_pose(rig, f)


# --- ashigaru spear attack -------------------------------------------------

_ATTACK = {
    ("spear",     "rx"): [(0.0, 2.22), (0.2, 1.45), (0.375, 3.14), (0.55, 3.00), (0.8, 2.33), (1.0, 2.22)],
    ("spear",     "lz"): [(0.0, 0.00), (0.2, -0.08), (0.375, 0.22), (0.55, 0.20), (0.8, 0.03), (1.0, 0.0)],
    ("arm.r",     "rx"): [(0.0, -0.20), (0.2, 0.28), (0.375, -0.85), (0.55, -0.75), (0.8, -0.30), (1.0, -0.20)],
    ("forearm.r", "rx"): [(0.0, -0.10), (0.2, 0.15), (0.375, -0.45), (0.55, -0.40), (0.8, -0.15), (1.0, -0.10)],
    ("arm.l",     "rx"): [(0.0, -0.55), (0.2, -0.30), (0.375, -0.95), (0.55, -0.85), (0.8, -0.62), (1.0, -0.55)],
    ("forearm.l", "rx"): [(0.0, -0.30), (0.2, -0.40), (0.375, -0.12), (0.55, -0.16), (0.8, -0.28), (1.0, -0.30)],
    ("spine",     "rx"): [(0.0, 0.08), (0.2, -0.02), (0.375, 0.22), (0.6, 0.18), (1.0, 0.08)],
    ("spine",     "ry"): [(0.0, -0.15), (0.2, -0.35), (0.375, 0.28), (0.6, 0.22), (1.0, -0.15)],
    ("thigh.l",   "rx"): [(0.0, -0.25), (0.2, -0.10), (0.375, -0.55), (0.6, -0.48), (1.0, -0.25)],
    ("shin.l",    "rx"): [(0.0, 0.30), (0.375, 0.55), (0.6, 0.50), (1.0, 0.30)],
    ("thigh.r",   "rx"): [(0.0, 0.15), (0.2, 0.05), (0.375, 0.45), (0.6, 0.40), (1.0, 0.15)],
    ("shin.r",    "rx"): [(0.0, 0.10), (0.375, 0.16), (1.0, 0.10)],
    ("hips",      "ly"): [(0.0, 0.00), (0.375, -0.030), (0.6, -0.024), (1.0, 0.0)],
    ("hips",      "lz"): [(0.0, 0.00), (0.2, -0.05), (0.375, 0.09), (0.6, 0.075), (1.0, 0.0)],
}


def apply_attack(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _ATTACK, loop=True)


# --- sword ashigaru attack: high guard into diagonal kesagiri -------------

_SWORD_ATTACK = {
    # Draw the blade up and across the right shoulder, cut diagonally through
    # the target, then recover to the one-handed ready pose.
    ("spear",     "rx"): [(0.0, 0.18), (0.25, -1.30), (0.375, -1.55), (0.625, 1.12), (0.75, 0.62), (1.0, 0.18)],
    ("spear",     "ry"): [(0.0, 0.00), (0.25, -0.42), (0.375, -0.58), (0.625, 0.50), (0.75, 0.24), (1.0, 0.00)],
    ("spear",     "rz"): [(0.0, 0.08), (0.25, -0.72), (0.375, -0.92), (0.625, 0.78), (0.75, 0.42), (1.0, 0.08)],
    ("arm.r",     "rx"): [(0.0, -0.28), (0.25, -1.05), (0.375, -1.22), (0.625, -0.18), (0.75, -0.12), (1.0, -0.28)],
    ("arm.r",     "ry"): [(0.0, 0.00), (0.375, -0.38), (0.625, 0.34), (1.0, 0.00)],
    ("forearm.r", "rx"): [(0.0, -0.16), (0.375, -0.55), (0.625, -0.08), (1.0, -0.16)],
    ("arm.l",     "rx"): [(0.0, -0.16), (0.375, -0.42), (0.625, -0.58), (1.0, -0.16)],
    ("forearm.l", "rx"): [(0.0, -0.12), (0.375, -0.28), (0.625, -0.34), (1.0, -0.12)],
    ("spine",     "rx"): [(0.0, 0.06), (0.375, -0.14), (0.625, 0.28), (0.75, 0.18), (1.0, 0.06)],
    ("spine",     "ry"): [(0.0, -0.08), (0.375, -0.42), (0.625, 0.48), (0.75, 0.24), (1.0, -0.08)],
    ("head",      "ry"): [(0.0, 0.04), (0.375, 0.18), (0.625, -0.20), (1.0, 0.04)],
    ("thigh.l",   "rx"): [(0.0, -0.12), (0.375, -0.28), (0.625, -0.42), (1.0, -0.12)],
    ("shin.l",    "rx"): [(0.0, 0.18), (0.625, 0.38), (1.0, 0.18)],
    ("thigh.r",   "rx"): [(0.0, 0.10), (0.375, 0.24), (0.625, 0.34), (1.0, 0.10)],
    ("hips",      "ly"): [(0.0, 0.00), (0.625, -0.035), (1.0, 0.00)],
    ("hips",      "lz"): [(0.0, 0.00), (0.375, -0.025), (0.625, 0.055), (1.0, 0.00)],
}


def apply_sword_attack(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _SWORD_ATTACK, loop=True)


# --- death -----------------------------------------------------------------

_DEATH = {
    ("hips",      "rx"): [(0.0, -0.14), (0.45, -0.72), (1.0, -1.50)],
    ("hips",      "ly"): [(0.0, 0.00), (0.45, -0.11), (1.0, -0.245)],
    ("hips",      "lz"): [(0.0, 0.00), (1.0, -0.05)],
    ("spine",     "rx"): [(0.0, -0.10), (0.45, 0.05), (1.0, 0.16)],
    ("head",      "rx"): [(0.0, -0.28), (0.45, -0.15), (1.0, 0.10)],
    ("thigh.l",   "rx"): [(0.0, -0.14), (0.45, 0.24), (1.0, 0.36)],
    ("shin.l",    "rx"): [(0.0, 0.20), (1.0, 0.46)],
    ("thigh.r",   "rx"): [(0.0, 0.10), (0.45, 0.34), (1.0, 0.50)],
    ("shin.r",    "rx"): [(0.0, 0.15), (1.0, 0.30)],
    ("arm.l",     "rx"): [(0.0, -0.50), (0.45, -0.90), (1.0, -0.40)],
    ("forearm.l", "rx"): [(0.0, -0.20), (1.0, -0.25)],
    ("arm.r",     "rx"): [(0.0, -0.40), (0.45, -0.70), (1.0, -0.30)],
    ("forearm.r", "rx"): [(0.0, -0.15), (1.0, -0.20)],
    ("spear",     "rx"): [(0.0, 0.30), (1.0, 0.62)],
}


def apply_death(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _DEATH, loop=False)


# ===========================================================================
# ARCHER  — bow-draw attack
# ===========================================================================

# Bow is held in the left hand (arm.l / forearm.l / "spear" bone parented to
# forearm.l). The right hand draws the string back.
#
# Phase breakdown (8 frames, 12 fps):
#   t=0.0  rest/ready
#   t=0.25 both arms raise to shoulder height
#   t=0.5  full draw — right elbow pulled back, left arm extended, spine lean back
#   t=0.625 release — right arm snaps forward
#   t=0.75  follow-through
#   t=1.0  return to ready (loop)

_ARCHER_ATTACK = {
    # Bow arm (left) raises and extends
    ("arm.l",     "rx"): [(0.0, -0.40), (0.25, -0.72), (0.5, -0.72), (0.625, -0.44), (0.75, -0.36), (1.0, -0.40)],
    ("forearm.l", "rx"): [(0.0, -0.20), (0.25, -0.28), (0.5, -0.22), (0.625, -0.18), (0.75, -0.20), (1.0, -0.20)],
    # Draw arm (right) extends then yanks back
    ("arm.r",     "rx"): [(0.0, -0.22), (0.25, -0.65), (0.5, -0.52), (0.625,  0.12), (0.75, -0.10), (1.0, -0.22)],
    ("forearm.r", "rx"): [(0.0, -0.10), (0.25, -0.42), (0.5, -0.62), (0.625, -0.06), (0.75, -0.05), (1.0, -0.10)],
    # Spine leans back during full draw
    ("spine",     "rx"): [(0.0, 0.06), (0.25, 0.04), (0.5, -0.16), (0.625, 0.14), (0.75, 0.10), (1.0, 0.06)],
    # Bow bone (spear) tips into shooting position relative to forearm.l
    ("spear",     "rx"): [(0.0, 0.60), (0.25, 0.12), (0.5, 0.08), (0.625, 0.16), (0.75, 0.40), (1.0, 0.60)],
    # Head angles to sight along the arrow
    ("head",      "rx"): [(0.0, -0.10), (0.25, -0.16), (0.5, -0.22), (0.625, -0.04), (0.75, -0.08), (1.0, -0.10)],
    # Slight hip shift into stance
    ("hips",      "ly"): [(0.0, 0.0), (0.5, -0.018), (1.0, 0.0)],
}


def apply_archer_attack(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _ARCHER_ATTACK, loop=True)


# ===========================================================================
# MUSKETEER  — arquebus fire
# ===========================================================================

# Gun (tanegashima) is carried on right side ("spear" bone → forearm.r).
# Both hands raise gun to shoulder; at t≈0.625 the gun fires with a
# violent torso recoil.

_MUSKETEER_ATTACK = {
    # Both arms raise gun to aim
    ("arm.l",     "rx"): [(0.0, -0.30), (0.3, -0.88), (0.5, -0.82), (0.625, -0.58), (0.75, -0.24), (1.0, -0.30)],
    ("forearm.l", "rx"): [(0.0, -0.15), (0.3, -0.42), (0.5, -0.40), (0.625, -0.28), (0.75, -0.12), (1.0, -0.15)],
    ("arm.r",     "rx"): [(0.0, -0.35), (0.3, -0.94), (0.5, -0.88), (0.625, -0.60), (0.75, -0.28), (1.0, -0.35)],
    ("forearm.r", "rx"): [(0.0, -0.20), (0.3, -0.46), (0.5, -0.44), (0.625, -0.32), (0.75, -0.14), (1.0, -0.20)],
    # Spine leans slightly forward for aim, kicks back on fire
    ("spine",     "rx"): [(0.0, 0.05), (0.3, 0.10), (0.5, 0.08), (0.625, -0.30), (0.75, 0.18), (1.0, 0.05)],
    # Gun angles up for aim, then recoils
    ("spear",     "rx"): [(0.0, 0.50), (0.3, -0.82), (0.5, -1.12), (0.625, -0.68), (0.75, 0.22), (1.0, 0.50)],
    # Head presses forward to sight, jerks at recoil
    ("head",      "rx"): [(0.0, -0.08), (0.3, 0.06), (0.5, 0.08), (0.625, -0.24), (0.75, -0.04), (1.0, -0.08)],
    # Recoil hip bump
    ("hips",      "lz"): [(0.0, 0.0), (0.5, 0.0), (0.625, 0.06), (0.75, 0.02), (1.0, 0.0)],
    # Brace right leg at fire
    ("thigh.r",   "rx"): [(0.0, 0.0), (0.625, 0.14), (0.75, 0.04), (1.0, 0.0)],
}


def apply_musketeer_attack(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _MUSKETEER_ATTACK, loop=True)


# ===========================================================================
# ENGINEER  — overhead hammer swing
# ===========================================================================

# Hammer is carried on right side ("spear" bone → forearm.r).
# Both arms raise overhead, then slam the hammer down hard.

_ENGINEER_ATTACK = {
    # Raise phase: arms swing back-overhead (very negative rx = arms behind head)
    ("arm.l",     "rx"): [(0.0, -0.35), (0.25, -1.24), (0.375, -1.44), (0.625, -0.12), (0.75, -0.24), (1.0, -0.35)],
    ("forearm.l", "rx"): [(0.0, -0.20), (0.25, -0.58), (0.375, -0.36), (0.625, -0.08), (0.75, -0.14), (1.0, -0.20)],
    ("arm.r",     "rx"): [(0.0, -0.40), (0.25, -1.30), (0.375, -1.50), (0.625, -0.16), (0.75, -0.28), (1.0, -0.40)],
    ("forearm.r", "rx"): [(0.0, -0.25), (0.25, -0.62), (0.375, -0.40), (0.625, -0.10), (0.75, -0.18), (1.0, -0.25)],
    # Spine: lean back on raise, punch forward on slam
    ("spine",     "rx"): [(0.0, 0.08), (0.25, -0.12), (0.375, -0.20), (0.625, 0.34), (0.75, 0.18), (1.0, 0.08)],
    # Hammer bone: overhead (rx very negative) then slams to +rx (downward)
    ("spear",     "rx"): [(0.0, 1.20), (0.25, -1.88), (0.375, -2.28), (0.625, 0.58), (0.75, 1.08), (1.0, 1.20)],
    # Head follows swing
    ("head",      "rx"): [(0.0, -0.10), (0.25, -0.22), (0.375, -0.28), (0.625, 0.14), (0.75, 0.02), (1.0, -0.10)],
    # Hip drops on impact
    ("hips",      "lz"): [(0.0, 0.0), (0.375, 0.0), (0.625, 0.07), (0.75, 0.02), (1.0, 0.0)],
}


def apply_engineer_attack(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _ENGINEER_ATTACK, loop=True)


# ===========================================================================
# CAVALRY  — horse + rider
# ===========================================================================

HORSE_TROT  = RAD(32.0)
KNEE_BEND_H = RAD(18.0)
RIDER_BOUNCE = 0.016


def apply_cavalry_walk(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    """Trot gait: diagonal pairs (FL+RR vs FR+RL) alternate each half-cycle."""
    _begin(scene, rig, frame_count)
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        phase = 2.0 * math.pi * (f - 1) / frame_count
        s = math.sin(phase)
        c = math.cos(phase)

        # Diagonal pair 1 (FL + RR) — in phase
        bones["fl_upper"].rotation_euler = ( HORSE_TROT * s, 0.0, 0.0)
        bones["fl_lower"].rotation_euler = (KNEE_BEND_H * max(0.0, -c) + RAD(8.0), 0.0, 0.0)
        bones["rr_upper"].rotation_euler = ( HORSE_TROT * s, 0.0, 0.0)
        bones["rr_lower"].rotation_euler = (KNEE_BEND_H * max(0.0, -c) + RAD(8.0), 0.0, 0.0)

        # Diagonal pair 2 (FR + RL) — counter-phase
        bones["fr_upper"].rotation_euler = (-HORSE_TROT * s, 0.0, 0.0)
        bones["fr_lower"].rotation_euler = (KNEE_BEND_H * max(0.0, c) + RAD(8.0), 0.0, 0.0)
        bones["rl_upper"].rotation_euler = (-HORSE_TROT * s, 0.0, 0.0)
        bones["rl_lower"].rotation_euler = (KNEE_BEND_H * max(0.0, c) + RAD(8.0), 0.0, 0.0)

        # Horse body vertical bob
        bones["horse_body"].location = (0.0, 0.0, -RIDER_BOUNCE * s * s)

        # Neck / head slight sway with stride
        bones["neck"].rotation_euler       = (RAD(-4.0) * s, 0.0, 0.0)
        bones["horse_head"].rotation_euler = (RAD( 3.5) * s, 0.0, 0.0)

        # Tail swings opposite to stride
        bones["tail"].rotation_euler = (RAD(9.0) * -s, 0.0, 0.0)

        # Rider hips follow horse bob
        bones["rider_hips"].location            = (0.0, 0.0, -RIDER_BOUNCE * s * s)
        bones["rider_spine"].rotation_euler     = (RAD(3.0) * c, 0.0, 0.0)
        bones["rider_head"].rotation_euler      = (RAD(-2.0) * c, 0.0, 0.0)

        _key_pose_for_list(rig, f, CAVALRY_BONES)


def apply_cavalry_idle(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    """Horse head sways and tail twitches; rider breathes."""
    _begin(scene, rig, frame_count)
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        phase = 2.0 * math.pi * (f - 1) / frame_count
        s = math.sin(phase)

        # Horse slow sway
        bones["neck"].rotation_euler        = (RAD(3.0) * s, 0.0, 0.0)
        bones["horse_head"].rotation_euler  = (RAD(-2.5) * s, 0.0, 0.0)
        bones["tail"].rotation_euler        = (RAD(10.0) * math.sin(phase + 1.2), 0.0, 0.0)

        # Rider breathing
        bones["rider_spine"].rotation_euler = (RAD(1.5) * s, 0.0, 0.0)
        bones["rider_head"].rotation_euler  = (RAD(-1.0) * s, 0.0, 0.0)

        _key_pose_for_list(rig, f, CAVALRY_BONES)


# Cavalry attack: rider lance/sword swing; horse stays in idle pose.
_CAVALRY_ATTACK = {
    # Raise lance/sword arm (right = rider_arm.r, negative X = rider's right)
    ("rider_arm.r",     "rx"): [(0.0, -0.22), (0.25, -1.12), (0.375, -1.52), (0.625, -0.14), (0.75, -0.10), (1.0, -0.22)],
    ("rider_forearm.r", "rx"): [(0.0, -0.10), (0.25, -0.40), (0.375, -0.36), (0.625,  0.18), (0.75,  0.06), (1.0, -0.10)],
    # Left arm balance
    ("rider_arm.l",     "rx"): [(0.0, -0.28), (0.375, -0.45), (0.625, -0.18), (1.0, -0.28)],
    ("rider_forearm.l", "rx"): [(0.0, -0.14), (0.375, -0.22), (1.0, -0.14)],
    # Rider torso rotates with the swing
    ("rider_spine",     "rx"): [(0.0, 0.05), (0.25, -0.10), (0.375, -0.16), (0.625, 0.24), (0.75, 0.14), (1.0, 0.05)],
    ("rider_spine",     "ry"): [(0.0, -0.14), (0.25, -0.28), (0.375, 0.22), (0.625, 0.26), (0.75, 0.06), (1.0, -0.14)],
    # Head follows
    ("rider_head",      "rx"): [(0.0, -0.08), (0.375, -0.18), (0.625, 0.14), (1.0, -0.08)],
}


def apply_cavalry_attack(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _CAVALRY_ATTACK, loop=True,
                       bone_list=CAVALRY_BONES)


# Cavalry death: horse tips sideways (horse_body rx), legs splay, rider thrown.
_CAVALRY_DEATH = {
    ("horse_body", "rx"): [(0.0, 0.0), (0.5, -0.55), (1.0, -1.42)],
    ("horse_body", "lz"): [(0.0, 0.0), (0.5, -0.10), (1.0, -0.30)],
    # Front legs splay
    ("fl_upper",   "rx"): [(0.0, 0.0), (1.0, -0.52)],
    ("fl_lower",   "rx"): [(0.0, 0.08), (1.0,  0.38)],
    ("fr_upper",   "rx"): [(0.0, 0.0), (1.0, -0.42)],
    ("fr_lower",   "rx"): [(0.0, 0.08), (1.0,  0.30)],
    # Rear legs kick
    ("rl_upper",   "rx"): [(0.0, 0.0), (1.0,  0.52)],
    ("rl_lower",   "rx"): [(0.0, 0.08), (1.0,  0.36)],
    ("rr_upper",   "rx"): [(0.0, 0.0), (1.0,  0.44)],
    ("rr_lower",   "rx"): [(0.0, 0.08), (1.0,  0.28)],
    # Rider thrown forward
    ("rider_hips",     "rx"): [(0.0, 0.0), (0.5, -0.48), (1.0, -1.22)],
    ("rider_hips",     "lz"): [(0.0, 0.0), (1.0,  0.14)],
    ("rider_spine",    "rx"): [(0.0, 0.05), (0.5, -0.24), (1.0, -0.68)],
    ("rider_head",     "rx"): [(0.0, -0.08), (0.5, -0.36), (1.0, -1.04)],
    ("rider_arm.l",    "rx"): [(0.0, -0.28), (1.0, -1.12)],
    ("rider_arm.r",    "rx"): [(0.0, -0.22), (1.0, -0.94)],
}


def apply_cavalry_death(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _CAVALRY_DEATH, loop=False,
                       bone_list=CAVALRY_BONES)


# ===========================================================================
# SUPPLY CART  — 3-bone cart (cart_body, wheel.l, wheel.r)
# ===========================================================================

def apply_cart_walk(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    """Wheels spin 360° per cycle; cart_body bobs ±0.008 units."""
    _begin(scene, rig, frame_count)
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        # Full revolution per loop cycle.
        phase = 2.0 * math.pi * (f - 1) / frame_count

        # Wheel rotation around Y axis (axle runs along X; ry spins the disc).
        bones["wheel.l"].rotation_euler = (0.0, phase, 0.0)
        bones["wheel.r"].rotation_euler = (0.0, phase, 0.0)

        # Slight vertical bob as the cart rolls over uneven ground.
        bones["cart_body"].location = (0.0, 0.0, -0.008 * math.sin(phase) ** 2)

        _key_pose_for_list(rig, f, CART_BONES)


_CART_DEATH = {
    # Cart tips onto its side (rx ~1.2 rad over 3 frames)
    ("cart_body", "rx"): [(0.0, 0.0), (0.5, -0.68), (1.0, -1.22)],
    ("cart_body", "lz"): [(0.0, 0.0), (0.5, -0.06), (1.0, -0.18)],
    # Wheels flail as the axle breaks free
    ("wheel.l",   "rz"): [(0.0, 0.0), (1.0,  0.48)],
    ("wheel.r",   "rz"): [(0.0, 0.0), (1.0, -0.48)],
}


def apply_cart_death(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _CART_DEATH, loop=False,
                       bone_list=CART_BONES)


# ===========================================================================
# Global action registry
# ===========================================================================
# Plain names are shared across all humanoid units (spear_ashigaru, engineer,
# musketeer). Model-specific attack overrides use "<model>:<action>" keys so
# ``render_anim_asset.py`` can fall back to the plain key when no override
# exists, keeping the JSON action names simple ("walk", "attack", etc.).

ACTIONS: dict[str, object] = {
    # --- shared humanoid ---
    "walk":   apply_walk,
    "idle":   apply_idle,
    "attack": apply_attack,
    "death":  apply_death,

    # --- archer (model-specific attack override) ---
    "unit-archer-rigged:attack":    apply_archer_attack,

    # --- sword ashigaru (diagonal cut) ---
    "unit-sword-ashigaru-rigged:attack": apply_sword_attack,

    # --- musketeer ---
    "unit-musketeer-rigged:attack": apply_musketeer_attack,

    # --- engineer ---
    "unit-engineer-rigged:attack":  apply_engineer_attack,

    # --- cavalry (all actions are model-specific) ---
    "unit-cavalry-rigged:walk":   apply_cavalry_walk,
    "unit-cavalry-rigged:idle":   apply_cavalry_idle,
    "unit-cavalry-rigged:attack": apply_cavalry_attack,
    "unit-cavalry-rigged:death":  apply_cavalry_death,

    # --- supply cart ---
    "unit-supply-cart-rigged:walk":  apply_cart_walk,
    "unit-supply-cart-rigged:death": apply_cart_death,
}
