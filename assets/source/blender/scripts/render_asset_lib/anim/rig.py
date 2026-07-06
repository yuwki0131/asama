"""Rig construction helpers shared by all animated unit models.

Convention (matches the static camera contract in core.py):
    - the model is built at the origin facing map SOUTH (world -Y, toward
      the viewer); +X is the character's LEFT hand side
    - the armature object is rotated about Z in 45 degree steps to bake the
      8 directions, so world-space lighting stays physically consistent
    - meshes are rigid bone-parented (no weights); the bone-tail offset is
      absorbed with matrix_parent_inverse so meshes can be authored in
      world coordinates
"""
from __future__ import annotations

import bpy
from mathutils import Matrix

from ..core import add_box, add_mesh

# Row order of every sprite sheet (map compass, N = toward map y-1).
DIRECTIONS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"]

# Default bevel for armor/cloth boxes: softens the raw-box silhouette at the
# ~30px on-canvas figure size without reading as a different shape language.
BEVEL_WIDTH = 0.010


def make_armature(scene: bpy.types.Scene, name: str, bones: list[tuple[str, tuple[float, float, float], tuple[float, float, float], str | None]]) -> bpy.types.Object:
    """Create an armature object from (name, head, tail, parent) tuples."""
    arm_data = bpy.data.armatures.new(f"{name}Data")
    rig = bpy.data.objects.new(name, arm_data)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, head, tail, parent in bones:
        bone = arm_data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        if parent is not None:
            bone.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    return rig


def attach(rig: bpy.types.Object, obj: bpy.types.Object, bone_name: str) -> None:
    """Rigid bone parenting that keeps the object's world placement.

    Bone parents attach at the bone TAIL, so compensate with the
    parent-inverse matrix (spike-validated approach)."""
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


def add_bevel(obj: bpy.types.Object, width: float = BEVEL_WIDTH, segments: int = 2) -> None:
    modifier = obj.modifiers.new("Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = 0.7854  # 45 deg


def rig_box(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    name: str,
    low: tuple[float, float, float],
    high: tuple[float, float, float],
    material: bpy.types.Material,
    bone_name: str,
    bevel: float | None = BEVEL_WIDTH,
) -> bpy.types.Object:
    obj = add_box(scene, name, low, high, material)
    if bevel is not None:
        add_bevel(obj, bevel)
    attach(rig, obj, bone_name)
    return obj


def rig_slab(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    name: str,
    top_low: tuple[float, float],
    top_high: tuple[float, float],
    bottom_low: tuple[float, float],
    bottom_high: tuple[float, float],
    z0: float,
    z1: float,
    material: bpy.types.Material,
    bone_name: str,
) -> bpy.types.Object:
    """Tapered box (different top/bottom XY rectangles): armor skirts,
    sloped shoulder plates, flared jingasa crowns."""
    vertices = [
        (bottom_low[0], bottom_low[1], z0),
        (bottom_high[0], bottom_low[1], z0),
        (bottom_high[0], bottom_high[1], z0),
        (bottom_low[0], bottom_high[1], z0),
        (top_low[0], top_low[1], z1),
        (top_high[0], top_low[1], z1),
        (top_high[0], top_high[1], z1),
        (top_low[0], top_high[1], z1),
    ]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = add_mesh(scene, name, vertices, faces, material)
    attach(rig, obj, bone_name)
    return obj


def rig_cone(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    name: str,
    center: tuple[float, float],
    radius: float,
    z0: float,
    z1: float,
    material: bpy.types.Material,
    bone_name: str,
    segments: int = 12,
    top_radius: float = 0.0,
) -> bpy.types.Object:
    """Closed cone / truncated cone, for jingasa hats and similar shapes."""
    import math

    cx, cy = center
    vertices: list[tuple[float, float, float]] = []
    for i in range(segments):
        angle = 2.0 * math.pi * i / segments
        vertices.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle), z0))
    faces: list[tuple[int, ...]] = []
    if top_radius > 0.0:
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            vertices.append((cx + top_radius * math.cos(angle), cy + top_radius * math.sin(angle), z1))
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((i, j, segments + j, segments + i))
        faces.append(tuple(range(segments - 1, -1, -1)))
        faces.append(tuple(range(segments, 2 * segments)))
    else:
        apex = len(vertices)
        vertices.append((cx, cy, z1))
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((i, j, apex))
        faces.append(tuple(range(segments - 1, -1, -1)))
    obj = add_mesh(scene, name, vertices, faces, material)
    attach(rig, obj, bone_name)
    return obj


def rig_beam(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    name: str,
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    thickness: float,
    material: bpy.types.Material,
    bone_name: str,
) -> bpy.types.Object:
    """Slanted square beam between two points (spear shafts, poles)."""
    h = thickness / 2.0
    vertices = []
    for px, py, pz in (a, b):
        for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h)):
            vertices.append((px + dx, py + dy, pz))
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = add_mesh(scene, name, vertices, faces, material)
    attach(rig, obj, bone_name)
    return obj
