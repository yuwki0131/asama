"""SPIKE: rigged ashigaru walk cycle -> 8 directions x 8 frames.

Proves that "armature + keyframes -> multi-frame sprite bake" works with the
existing isometric camera rig and the painterly render spec, without touching
render_asset.py / registry.py (whose cache must stay valid).

Run:
    "$ASAMA_BLENDER_BIN" --background --factory-startup \
        --python assets/source/blender/scripts/spike_anim_walk.py -- \
        --output-directory assets/intermediate/spike/anim-walk-frames \
        --supersample 2

Output: <dir>/walk-<direction>-f<frame>.png (96x128 when supersample=2)
plus timing-report.json with per-frame render times.

Direction convention: the model is built facing map SOUTH (+mapY, toward the
viewer, world -Y). The armature object is rotated +45 deg about Z per step,
which yields the direction order S, SE, E, NE, N, NW, W, SW (map compass,
N = toward map y-1, matching TERRAIN_EDGE_QUADS in core.py).

The camera never moves; world-space lighting (fixed sun direction baked into
the painterly emission ramp via world-space normals) therefore stays
consistent across directions, exactly like rotating a real model on a
turntable under a fixed studio light.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Matrix

from render_asset_lib import core
from render_asset_lib.core import (
    PX_PER_UNIT,
    add_box,
    add_mesh,
    make_material,
    reset_scene,
    setup_camera,
    setup_render,
)
from render_asset_lib.materials import make_noise_material, make_plank_material

# Canvas contract for units (see production-assets units.json).
CANVAS_W = 48
CANVAS_H = 64
ANCHOR_X = 24.0
ANCHOR_Y = 52.48

FRAME_COUNT = 8
DIRECTIONS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"]

# Walk cycle tuning (radians / world units).
LEG_SWING = math.radians(26.0)
ARM_SWING = math.radians(18.0)
SPEAR_ARM_SWING = math.radians(7.0)   # the spear hand stays quiet
TORSO_TWIST = math.radians(6.0)
HIP_BOB = 0.020                        # lowest at full stride (double support)


# --- model ------------------------------------------------------------------

def build_ashigaru_rig(scene: bpy.types.Scene) -> bpy.types.Object:
    """Spear ashigaru (~0.68 units tall, reads ~30px on the 48x64 canvas),
    built from the same box-primitive vocabulary as units.py, rigid-parented
    to a minimal armature: hips / spine / head, 2 legs, 2 arms."""

    # Materials follow the painterly factory conventions (materials.py).
    armor = make_noise_material("AshigaruArmor", (0.075, 0.080, 0.095), (0.150, 0.155, 0.175), scale=9.0)
    cloth = make_noise_material("AshigaruCloth", (0.105, 0.115, 0.160), (0.180, 0.190, 0.240), scale=8.0)
    skin = make_material("AshigaruSkin", (0.62, 0.48, 0.36, 1.0))
    hat = make_noise_material("AshigaruJingasa", (0.055, 0.048, 0.040), (0.125, 0.108, 0.085), scale=7.0)
    wood = make_plank_material("AshigaruSpearShaft", (0.075, 0.055, 0.034), (0.140, 0.105, 0.065))
    steel = make_material("AshigaruSpearHead", (0.58, 0.62, 0.68, 1.0))
    banner = make_noise_material("AshigaruBanner", (0.100, 0.150, 0.320), (0.170, 0.235, 0.430), scale=5.0)
    strap = make_material("AshigaruStrap", (0.095, 0.075, 0.048, 1.0))

    # Armature. Built at the origin, facing world -Y (= map south).
    arm_data = bpy.data.armatures.new("AshigaruRigData")
    rig = bpy.data.objects.new("AshigaruRig", arm_data)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        b = arm_data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent is not None:
            b.parent = arm_data.edit_bones[parent]
        return b

    bone("hips", (0.0, 0.0, 0.28), (0.0, 0.0, 0.36))
    bone("spine", (0.0, 0.0, 0.36), (0.0, 0.0, 0.54), parent="hips")
    bone("head", (0.0, 0.0, 0.54), (0.0, 0.0, 0.66), parent="spine")
    bone("leg.l", (0.062, 0.0, 0.295), (0.062, 0.0, 0.015), parent="hips")
    bone("leg.r", (-0.062, 0.0, 0.295), (-0.062, 0.0, 0.015), parent="hips")
    bone("arm.l", (0.125, 0.0, 0.505), (0.125, 0.0, 0.245), parent="spine")
    bone("arm.r", (-0.125, 0.0, 0.505), (-0.125, 0.0, 0.245), parent="spine")

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    def attach(obj: bpy.types.Object, bone_name: str) -> None:
        """Rigid bone parenting that keeps the object's world placement.
        Bone parents attach at the bone TAIL, so compensate with the
        parent-inverse matrix."""
        pose_bone = rig.pose.bones[bone_name]
        parent_matrix = (
            rig.matrix_world
            @ pose_bone.matrix
            @ Matrix.Translation((0.0, pose_bone.length, 0.0))
        )
        obj.parent = rig
        obj.parent_type = "BONE"
        obj.parent_bone = bone_name
        obj.matrix_parent_inverse = parent_matrix.inverted()

    def box(name, low, high, material, bone_name):
        obj = add_box(scene, name, low, high, material)
        attach(obj, bone_name)
        return obj

    # Pelvis + waist sash.
    box("Pelvis", (-0.095, -0.060, 0.265), (0.095, 0.060, 0.335), cloth, "hips")
    box("Sash", (-0.100, -0.065, 0.320), (0.100, 0.065, 0.345), strap, "hips")

    # Torso: do (cuirass) with shoulder sode plates.
    box("Torso", (-0.105, -0.068, 0.335), (0.105, 0.068, 0.515), armor, "spine")
    box("Sode.L", (0.105, -0.075, 0.430), (0.155, 0.075, 0.525), armor, "spine")
    box("Sode.R", (-0.155, -0.075, 0.430), (-0.105, 0.075, 0.525), armor, "spine")

    # Sashimono banner on the back (+Y is the character's back).
    box("BannerPole", (-0.008, 0.085, 0.30), (0.008, 0.101, 1.06), wood, "spine")
    box("BannerCross", (-0.070, 0.084, 1.010), (0.070, 0.100, 1.025), wood, "spine")
    box("Banner", (-0.065, 0.088, 0.720), (0.065, 0.098, 1.010), banner, "spine")

    # Head + jingasa.
    box("Head", (-0.055, -0.055, 0.515), (0.055, 0.055, 0.635), skin, "head")
    box("JingasaBrim", (-0.098, -0.098, 0.628), (0.098, 0.098, 0.655), hat, "head")
    box("JingasaTop", (-0.046, -0.046, 0.655), (0.046, 0.046, 0.695), hat, "head")

    # Legs: rigid single-segment legs with a forward foot block.
    for side, sign in (("L", 1.0), ("R", -1.0)):
        x0 = sign * 0.030
        x1 = sign * 0.096
        lo, hi = min(x0, x1), max(x0, x1)
        box(f"Leg.{side}", (lo, -0.048, 0.0), (hi, 0.048, 0.295), cloth, f"leg.{side.lower()}")
        box(f"Foot.{side}", (lo, -0.095, 0.0), (hi, 0.0, 0.038), strap, f"leg.{side.lower()}")

    # Arms.
    for side, sign in (("L", 1.0), ("R", -1.0)):
        x0 = sign * 0.105
        x1 = sign * 0.152
        lo, hi = min(x0, x1), max(x0, x1)
        box(f"Arm.{side}", (lo, -0.042, 0.245), (hi, 0.042, 0.505), cloth, f"arm.{side.lower()}")

    # Spear in the right hand: a slanted beam (butt low front, blade high
    # back) built from two thin slanted boxes, world coords, front = -Y.
    def slanted(name, a, b, thickness, material, bone_name):
        h = thickness / 2.0
        vertices = []
        for px, py, pz in (a, b):
            for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h)):
                vertices.append((px + dx, py + dy, pz))
        faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        obj = add_mesh(scene, name, vertices, faces, material)
        attach(obj, bone_name)
        return obj

    hand_x = -0.145
    slanted("SpearShaft", (hand_x, -0.34, 0.06), (hand_x, 0.30, 0.86), 0.024, wood, "arm.r")
    slanted("SpearHead", (hand_x, 0.30, 0.86), (hand_x, 0.365, 0.945), 0.036, steel, "arm.r")

    return rig


# --- animation ---------------------------------------------------------------

def keyframe_walk(scene: bpy.types.Scene, rig: bpy.types.Object, frame_count: int) -> None:
    """8-frame looping walk: contrapposto leg/arm counter-swing, quiet spear
    arm, torso twist, hip bob (lowest at full stride). Every frame is keyed
    with exact values so interpolation never matters."""
    scene.frame_start = 1
    scene.frame_end = frame_count

    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"

    bones = rig.pose.bones
    for f in range(1, frame_count + 1):
        phase = 2.0 * math.pi * (f - 1) / frame_count
        s = math.sin(phase)

        # Legs and arms swing in the sagittal plane (bone local X for the
        # straight-down rest bones).
        bones["leg.l"].rotation_euler = (LEG_SWING * s, 0.0, 0.0)
        bones["leg.r"].rotation_euler = (-LEG_SWING * s, 0.0, 0.0)
        bones["arm.l"].rotation_euler = (-ARM_SWING * s, 0.0, 0.0)
        bones["arm.r"].rotation_euler = (SPEAR_ARM_SWING * s, 0.0, 0.0)
        # Torso counter-twist about the vertical (bone local Y) plus a
        # constant forward walking lean (local X, sagittal).
        bones["spine"].rotation_euler = (math.radians(4.0), TORSO_TWIST * s, 0.0)
        # Head stays level against the twist.
        bones["head"].rotation_euler = (0.0, -TORSO_TWIST * s * 0.7, 0.0)
        # Hip bob along the bone axis (local Y = world up for the hips bone).
        bones["hips"].location = (0.0, -HIP_BOB * s * s, 0.0)

        for name in ("leg.l", "leg.r", "arm.l", "arm.r", "spine", "head"):
            bones[name].keyframe_insert(data_path="rotation_euler", frame=f)
        bones["hips"].keyframe_insert(data_path="location", frame=f)


# --- render loop --------------------------------------------------------------

def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="ashigaru walk-cycle spike renderer")
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--supersample", type=int, default=2)
    parser.add_argument("--samples", type=int, default=None, help="override Cycles sample count")
    parser.add_argument("--directions", type=int, default=8, help="render only the first N directions")
    parser.add_argument("--frames", type=int, default=FRAME_COUNT)
    args = parser.parse_args(argv)

    out_dir = os.path.abspath(args.output_directory)
    os.makedirs(out_dir, exist_ok=True)

    core.CURRENT_STYLE = "painterly"

    scene = reset_scene()
    rig = build_ashigaru_rig(scene)
    keyframe_walk(scene, rig, args.frames)

    ss = max(1, args.supersample)
    setup_camera(scene, CANVAS_W * ss, CANVAS_H * ss, ANCHOR_X * ss, ANCHOR_Y * ss, PX_PER_UNIT * ss)
    setup_render(scene, CANVAS_W * ss, CANVAS_H * ss, "painterly", True, 0, out_dir)
    if args.samples is not None:
        scene.cycles.samples = args.samples

    timings: list[dict] = []
    total_start = time.perf_counter()
    for d_index in range(min(args.directions, len(DIRECTIONS))):
        rig.rotation_euler = (0.0, 0.0, math.radians(45.0 * d_index))
        d_name = DIRECTIONS[d_index]
        for f in range(1, args.frames + 1):
            scene.frame_set(f)
            path = os.path.join(out_dir, f"walk-{d_name}-f{f}.png")
            scene.render.filepath = path
            start = time.perf_counter()
            bpy.ops.render.render(write_still=True)
            elapsed = time.perf_counter() - start
            timings.append({"direction": d_name, "frame": f, "seconds": round(elapsed, 3)})
            print(f"FRAME {d_name} f{f} {elapsed:.2f}s -> {path}")

    total = time.perf_counter() - total_start
    seconds = [t["seconds"] for t in timings]
    report = {
        "canvas": [CANVAS_W * ss, CANVAS_H * ss],
        "supersample": ss,
        "samples": scene.cycles.samples,
        "frameCount": len(timings),
        "totalSeconds": round(total, 2),
        "meanSecondsPerFrame": round(sum(seconds) / len(seconds), 3),
        "minSecondsPerFrame": min(seconds),
        "maxSecondsPerFrame": max(seconds),
        "blenderVersion": bpy.app.version_string,
        "frames": timings,
    }
    with open(os.path.join(out_dir, "timing-report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(f"SPIKE_DONE {json.dumps({k: report[k] for k in ('frameCount', 'totalSeconds', 'meanSecondsPerFrame')})}")


main()
