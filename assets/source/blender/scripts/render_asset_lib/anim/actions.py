"""Humanoid action keyframers: walk / idle / attack / death.

Every frame of every bone channel is keyed with exact values, so the result
never depends on interpolation settings. Sign conventions for the straight
rest bones (roll 0):

    down-pointing limb bones (thigh/shin/arm/forearm):
        +X rotation swings the tail toward +Y (character's BACK)
    up-pointing bones (hips/spine/head/spear):
        +X rotation tips toward -Y (FRONT); local +Y twists about the axis
    hips/spear pose location: local Y = along bone (world up),
        local Z = world -Y (character's front)

Loop actions (walk/idle/attack) use phase = 2*pi*(f-1)/frames so the frame
after the last wraps seamlessly to the first. death uses t = (f-1)/(frames-1)
and holds its final pose.
"""
from __future__ import annotations

import math

import bpy

from .ashigaru import HUMANOID_BONES

RAD = math.radians


def _begin(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    scene.frame_start = 1
    scene.frame_end = frame_count
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)


def _key_pose(rig: bpy.types.Object, frame: int) -> None:
    for name in HUMANOID_BONES:
        pose_bone = rig.pose.bones[name]
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
        pose_bone.keyframe_insert(data_path="location", frame=frame)


def _curve(points: list[tuple[float, float]], t: float) -> float:
    """Piecewise-linear key-pose curve over normalized time t in [0, 1]."""
    if t <= points[0][0]:
        return points[0][1]
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if t <= t1:
            span = t1 - t0
            return v1 if span <= 0.0 else v0 + (v1 - v0) * (t - t0) / span
    return points[-1][1]


# --- walk ---------------------------------------------------------------------

LEG_SWING = RAD(26.0)
KNEE_BEND = RAD(17.0)
ARM_SWING = RAD(17.0)
SPEAR_ARM_SWING = RAD(6.0)
TORSO_TWIST = RAD(6.0)
WALK_LEAN = RAD(4.0)
HIP_BOB = 0.022


def apply_walk(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        phase = 2.0 * math.pi * (f - 1) / frame_count
        s = math.sin(phase)
        c = math.cos(phase)

        # Legs counter-swing; the knee bends while the leg passes forward.
        bones["thigh.l"].rotation_euler = (LEG_SWING * s, 0.0, 0.0)
        bones["shin.l"].rotation_euler = (KNEE_BEND * max(0.0, -c) + RAD(4.0), 0.0, 0.0)
        bones["thigh.r"].rotation_euler = (-LEG_SWING * s, 0.0, 0.0)
        bones["shin.r"].rotation_euler = (KNEE_BEND * max(0.0, c) + RAD(4.0), 0.0, 0.0)

        # Free arm counter-swings with a lagging forearm; spear arm is quiet.
        bones["arm.l"].rotation_euler = (-ARM_SWING * s, 0.0, 0.0)
        bones["forearm.l"].rotation_euler = (RAD(-7.0) + RAD(-5.0) * math.sin(phase - 0.6), 0.0, 0.0)
        bones["arm.r"].rotation_euler = (SPEAR_ARM_SWING * s, 0.0, 0.0)
        bones["forearm.r"].rotation_euler = (RAD(-5.0), 0.0, 0.0)
        bones["spear"].rotation_euler = (0.0, 0.0, 0.0)

        # Torso twist + constant forward lean; head stays level.
        bones["spine"].rotation_euler = (WALK_LEAN, TORSO_TWIST * s, 0.0)
        bones["head"].rotation_euler = (-WALK_LEAN * 0.5, -TORSO_TWIST * s * 0.7, 0.0)

        # Hip bob: lowest at full stride (double support).
        bones["hips"].location = (0.0, -HIP_BOB * s * s, 0.0)

        _key_pose(rig, f)


# --- idle ---------------------------------------------------------------------

def apply_idle(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    """Breathing plus a slow sway of the carried spear."""
    _begin(scene, rig, frame_count)
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        phase = 2.0 * math.pi * (f - 1) / frame_count
        s = math.sin(phase)

        bones["spine"].rotation_euler = (RAD(2.0) + RAD(1.6) * s, RAD(1.0) * s, 0.0)
        bones["head"].rotation_euler = (RAD(-1.2) * s, RAD(-0.8) * s, 0.0)
        bones["arm.l"].rotation_euler = (RAD(-2.0) + RAD(1.5) * s, 0.0, 0.0)
        bones["forearm.l"].rotation_euler = (RAD(-6.0) + RAD(1.5) * s, 0.0, 0.0)
        bones["arm.r"].rotation_euler = (RAD(1.5) * math.sin(phase + 0.9), 0.0, 0.0)
        bones["forearm.r"].rotation_euler = (RAD(-3.0), 0.0, 0.0)
        bones["spear"].rotation_euler = (RAD(2.2) * math.sin(phase + 0.9), 0.0, 0.0)
        bones["hips"].location = (0.0, 0.005 * s, 0.0)

        _key_pose(rig, f)


# --- attack (spear thrust) ------------------------------------------------------

# Normalized-time key poses. 0..0.2 windup (spear pulled back), 0.2..0.375
# thrust (fast), 0.375..0.55 hold at full extension, then recover to the
# stance so the loop cycles cleanly while a unit keeps fighting.
#
# The spear bone inherits the arm chain, and an arm/forearm swing of -a
# pitches the spear tip UP by ~a (empirical; arm bones point down, spear
# bone points up). The spear rx curve therefore bakes in a compensation of
# -(arm.r + forearm.r + spine lean) on top of the desired world pitch
# (2.0 rad from carry = leveled, tip forward, ~8 deg above horizontal).
_ATTACK = {
    ("spear", "rx"): [(0.0, 2.22), (0.2, 1.45), (0.375, 3.14), (0.55, 3.00), (0.8, 2.33), (1.0, 2.22)],
    ("spear", "lz"): [(0.0, 0.00), (0.2, -0.08), (0.375, 0.22), (0.55, 0.20), (0.8, 0.03), (1.0, 0.0)],
    ("arm.r", "rx"): [(0.0, -0.20), (0.2, 0.28), (0.375, -0.85), (0.55, -0.75), (0.8, -0.30), (1.0, -0.20)],
    ("forearm.r", "rx"): [(0.0, -0.10), (0.2, 0.15), (0.375, -0.45), (0.55, -0.40), (0.8, -0.15), (1.0, -0.10)],
    ("arm.l", "rx"): [(0.0, -0.55), (0.2, -0.30), (0.375, -0.95), (0.55, -0.85), (0.8, -0.62), (1.0, -0.55)],
    ("forearm.l", "rx"): [(0.0, -0.30), (0.2, -0.40), (0.375, -0.12), (0.55, -0.16), (0.8, -0.28), (1.0, -0.30)],
    ("spine", "rx"): [(0.0, 0.08), (0.2, -0.02), (0.375, 0.22), (0.6, 0.18), (1.0, 0.08)],
    ("spine", "ry"): [(0.0, -0.15), (0.2, -0.35), (0.375, 0.28), (0.6, 0.22), (1.0, -0.15)],
    ("thigh.l", "rx"): [(0.0, -0.25), (0.2, -0.10), (0.375, -0.55), (0.6, -0.48), (1.0, -0.25)],
    ("shin.l", "rx"): [(0.0, 0.30), (0.375, 0.55), (0.6, 0.50), (1.0, 0.30)],
    ("thigh.r", "rx"): [(0.0, 0.15), (0.2, 0.05), (0.375, 0.45), (0.6, 0.40), (1.0, 0.15)],
    ("shin.r", "rx"): [(0.0, 0.10), (0.375, 0.16), (1.0, 0.10)],
    ("hips", "ly"): [(0.0, 0.00), (0.375, -0.030), (0.6, -0.024), (1.0, 0.0)],
    ("hips", "lz"): [(0.0, 0.00), (0.2, -0.05), (0.375, 0.09), (0.6, 0.075), (1.0, 0.0)],
}


def apply_attack(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _ATTACK, loop=True)


# --- death ----------------------------------------------------------------------

# Backward fall in 2-3 frames; the client holds the final frame and fades.
_DEATH = {
    ("hips", "rx"): [(0.0, -0.14), (0.45, -0.72), (1.0, -1.50)],
    ("hips", "ly"): [(0.0, 0.00), (0.45, -0.11), (1.0, -0.245)],
    ("hips", "lz"): [(0.0, 0.00), (1.0, -0.05)],
    ("spine", "rx"): [(0.0, -0.10), (0.45, 0.05), (1.0, 0.16)],
    ("head", "rx"): [(0.0, -0.28), (0.45, -0.15), (1.0, 0.10)],
    ("thigh.l", "rx"): [(0.0, -0.14), (0.45, 0.24), (1.0, 0.36)],
    ("shin.l", "rx"): [(0.0, 0.20), (1.0, 0.46)],
    ("thigh.r", "rx"): [(0.0, 0.10), (0.45, 0.34), (1.0, 0.50)],
    ("shin.r", "rx"): [(0.0, 0.15), (1.0, 0.30)],
    ("arm.l", "rx"): [(0.0, -0.50), (0.45, -0.90), (1.0, -0.40)],
    ("forearm.l", "rx"): [(0.0, -0.20), (1.0, -0.25)],
    ("arm.r", "rx"): [(0.0, -0.40), (0.45, -0.70), (1.0, -0.30)],
    ("forearm.r", "rx"): [(0.0, -0.15), (1.0, -0.20)],
    ("spear", "rx"): [(0.0, 0.30), (1.0, 0.62)],
}


def apply_death(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    _begin(scene, rig, frame_count)
    _apply_curve_table(scene, rig, frame_count, _DEATH, loop=False)


# --- shared curve-table driver ---------------------------------------------------

_CHANNEL_INDEX = {"rx": 0, "ry": 1, "rz": 2, "lx": 0, "ly": 1, "lz": 2}


def _apply_curve_table(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    frame_count: int,
    table: dict[tuple[str, str], list[tuple[float, float]]],
    loop: bool,
) -> None:
    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        if loop:
            t = (f - 1) / frame_count
        else:
            t = 0.0 if frame_count <= 1 else (f - 1) / (frame_count - 1)
        for name in HUMANOID_BONES:
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
        _key_pose(rig, f)


ACTIONS = {
    "walk": apply_walk,
    "idle": apply_idle,
    "attack": apply_attack,
    "death": apply_death,
}
