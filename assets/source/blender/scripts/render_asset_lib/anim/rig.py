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

import math

import bpy
from mathutils import Matrix, Vector

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


def shade_smooth(obj: bpy.types.Object) -> None:
    """Mark every polygon smooth so the painterly dot(N, L) ramp grades
    continuously across curved surfaces instead of per-face facets."""
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def _axis_frame(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[Vector, Vector, Vector, float]:
    """Orthonormal frame along the segment a->b: (direction, u, v, length)."""
    start = Vector(a)
    end = Vector(b)
    axis = end - start
    length = axis.length
    direction = axis.normalized() if length > 0.0 else Vector((0.0, 0.0, 1.0))
    helper = Vector((0.0, 0.0, 1.0)) if abs(direction.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    u = direction.cross(helper).normalized()
    v = direction.cross(u).normalized()
    return direction, u, v, length


def rig_limb(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    name: str,
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    r0: float,
    r1: float,
    material: bpy.types.Material,
    bone_name: str,
    segments: int = 10,
    rings: int = 5,
    bulge: float = 0.05,
    cap: str = "round",
    scale_u: float = 1.0,
    scale_v: float = 1.0,
) -> bpy.types.Object:
    """Smooth tapered round limb (capsule-like) between two points.

    Radius runs r0 (at *a*) to r1 (at *b*) with a sine mid-bulge for a
    muscle/cloth read. ``cap="round"`` domes the ends; ``"flat"`` closes
    them flush (wheels, pole ends). scale_u / scale_v squash the section
    into an ellipse (u ~ horizontal, v ~ vertical for horizontal limbs).
    Replaces box limbs so the painterly normal ramp shades limbs as
    continuous cylinders, not facets.
    """
    direction, u, v, length = _axis_frame(a, b)
    start = Vector(a)
    vertices: list[tuple[float, float, float]] = []
    ring_indices: list[list[int]] = []
    for ring in range(rings + 1):
        t = ring / rings
        radius = (r0 + (r1 - r0) * t) * (1.0 + bulge * math.sin(math.pi * t))
        center = start + direction * (length * t)
        indices = []
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            point = center + u * (radius * scale_u * math.cos(angle)) + v * (radius * scale_v * math.sin(angle))
            indices.append(len(vertices))
            vertices.append((point.x, point.y, point.z))
        ring_indices.append(indices)
    faces: list[tuple[int, ...]] = []
    for ring in range(rings):
        lower = ring_indices[ring]
        upper = ring_indices[ring + 1]
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((lower[i], lower[j], upper[j], upper[i]))
    dome0 = r0 * (0.55 if cap == "round" else 0.0)
    dome1 = r1 * (0.55 if cap == "round" else 0.0)
    apex0 = start - direction * dome0
    apex1 = start + direction * (length + dome1)
    apex0_index = len(vertices)
    vertices.append((apex0.x, apex0.y, apex0.z))
    apex1_index = len(vertices)
    vertices.append((apex1.x, apex1.y, apex1.z))
    first = ring_indices[0]
    last = ring_indices[-1]
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((first[j], first[i], apex0_index))
        faces.append((last[i], last[j], apex1_index))
    obj = add_mesh(scene, name, vertices, faces, material)
    shade_smooth(obj)
    attach(rig, obj, bone_name)
    return obj


def rig_lathe(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    name: str,
    profile: list[tuple[float, float]],
    material: bpy.types.Material,
    bone_name: str,
    center: tuple[float, float] = (0.0, 0.0),
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    segments: int = 16,
    smooth: bool = True,
) -> bpy.types.Object:
    """Surface of revolution around a vertical axis at *center*.

    *profile* is a bottom-to-top list of (radius, z). scale_x / scale_y
    squash the circular cross-section into an ellipse (torsos, heads).
    Zero-radius entries collapse to an axis point (hat crowns, skull top).
    Open ends (radius > 0 at first/last entry) are closed with a fan.
    Replaces box torsos/heads so silhouettes and shading read organic.
    """
    cx, cy = center
    vertices: list[tuple[float, float, float]] = []
    rows: list[list[int] | int] = []
    for radius, z in profile:
        if radius <= 0.0:
            rows.append(len(vertices))
            vertices.append((cx, cy, z))
            continue
        indices = []
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            indices.append(len(vertices))
            vertices.append((
                cx + radius * scale_x * math.cos(angle),
                cy + radius * scale_y * math.sin(angle),
                z,
            ))
        rows.append(indices)
    faces: list[tuple[int, ...]] = []
    for row_a, row_b in zip(rows, rows[1:]):
        if isinstance(row_a, int) and isinstance(row_b, int):
            continue
        if isinstance(row_a, int):
            assert isinstance(row_b, list)
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((row_b[j], row_b[i], row_a))
        elif isinstance(row_b, int):
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((row_a[i], row_a[j], row_b))
        else:
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((row_a[i], row_a[j], row_b[j], row_b[i]))
    if isinstance(rows[0], list):
        faces.append(tuple(reversed(rows[0])))
    if isinstance(rows[-1], list):
        faces.append(tuple(rows[-1]))
    obj = add_mesh(scene, name, vertices, faces, material)
    if smooth:
        shade_smooth(obj)
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
