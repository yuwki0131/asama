"""Matsue-vegetation tree builders (isolated `trees` registry, V-07).

Design contract: docs/05_map-and-art/vegetation-design.md
- Species roster anchored to the real Matsue Castle vegetation
  (kuromatsu / akamatsu / sugi / kusunoki / keyaki / yabutsubaki).
- Size ethos: Stronghold — mature trees clearly outscale a commoner's house
  (thick, landmark-grade canopies).
- Tone: must stay inside the existing asset band (pine mean ≈ (78,73,53)).

Why a fork instead of importing vegetation.py: the default-registry builders
render as faceted low-poly (the reason raster art replaced them). This fork
raises blob resolution / pad counts / jitter for a painterly read, and edits
here re-render ONLY this registry (farm/marsh precedent).
"""
from __future__ import annotations

import math

import bpy

from ..core import add_beam, add_box, add_frustum, add_mesh, map_box, map_xy, make_material
from ..materials import make_foliage_material, make_noise_material, make_textured_material


def _rand(seed: float, k: float) -> float:
    return (math.sin(seed * 7.13 + k) * 43758.5453) % 1.0


def add_foliage_blob(
    scene: bpy.types.Scene,
    name: str,
    cx: float,
    cy: float,
    z: float,
    radius: float,
    height: float,
    material: bpy.types.Material,
    squash: float = 1.0,
    jitter_amp: float = 0.14,
) -> None:
    """Organic leaf mass. Higher-res than the legacy builder (12 segments x 5
    rings vs 8x4) with per-vertex jitter so silhouettes stop reading as
    faceted low-poly gems."""
    segments = 12
    h = height * squash
    ring_ts = (0.10, 0.32, 0.55, 0.76, 0.93)
    ring_radii = tuple(radius * math.sin(math.pi * min(t, 0.97)) ** 0.68 for t in ring_ts)
    seed = sum(ord(c) for c in name)
    vertices: list[tuple[float, float, float]] = []
    for ring, (t, r) in enumerate(zip(ring_ts, ring_radii)):
        for i in range(segments):
            angle = (i + 0.5) / segments * 2 * math.pi
            jitter = 1.0 + jitter_amp * math.sin(seed * 3.7 + ring * 12.9898 + i * 78.233)
            zj = h * 0.055 * math.sin(seed * 1.3 + ring * 7.31 + i * 41.7)
            rj = r * jitter
            vertices.append((*map_xy(cx + rj * math.cos(angle), cy + rj * math.sin(angle)), z + h * t + zj))
    bottom = len(vertices)
    vertices.append((*map_xy(cx, cy), z))
    top = len(vertices)
    vertices.append((*map_xy(cx, cy), z + h))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(ring_ts) - 1):
        a = ring * segments
        b = (ring + 1) * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((a + i, a + j, b + j, b + i))
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((bottom, i, j))
        last = (len(ring_ts) - 1) * segments
        faces.append((top, last + j, last + i))
    return add_mesh(scene, name, vertices, faces, material)


add_foliage_blob_obj = add_foliage_blob


def add_cloud_pad(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radius: float,
    lit_material: bpy.types.Material,
    shadow_material: bpy.types.Material,
    seed: float,
    mid_material: bpy.types.Material | None = None,
    highlight_material: bpy.types.Material | None = None,
) -> None:
    """Nihonga pine cloud pad: a shaded base sheet with many overlapping
    lit bumps (9 vs the legacy 6 — denser arcs, softer outline)."""
    cx, cy, cz = center
    bump_r = radius * 0.44
    mid_material = shadow_material if mid_material is None else mid_material
    add_foliage_blob(scene, f"{name}Base", cx + 0.02, cy + 0.02, cz - bump_r * 0.30,
                     radius * 0.92, bump_r * 0.72, shadow_material, squash=0.9)
    add_foliage_blob(scene, f"{name}C", cx, cy, cz + bump_r * 0.10,
                     bump_r * 0.95, bump_r * 0.95, lit_material, squash=1.0)
    # Cap bumps sit ON TOP so the pad's upper surface reads as clustered
    # puffs instead of a flat plate under the top-down camera.
    for i in range(4):
        angle = (i + 0.3 + _rand(seed, 90 + i)) / 4 * 2.0 * math.pi
        dist = bump_r * (0.30 + 0.25 * _rand(seed, 95 + i))
        size = bump_r * (0.45 + 0.22 * _rand(seed, 99 + i))
        material = lit_material if i % 2 == 0 else mid_material
        add_foliage_blob(scene, f"{name}T{i}", cx + dist * math.cos(angle),
                         cy + dist * math.sin(angle),
                         cz + bump_r * (0.55 + 0.25 * _rand(seed, 93 + i)),
                         size, size * 1.0, material, squash=1.0)
    count = 10
    for i in range(count):
        angle = (i + _rand(seed, i * 2.3) * 0.6) / count * 2.0 * math.pi
        dist = radius * (0.46 + 0.20 * _rand(seed, i * 3.7))
        bx = cx + dist * math.cos(angle)
        by = cy + dist * math.sin(angle)
        bz = cz + bump_r * (0.16 - 0.40 * _rand(seed, i * 1.9))
        size = bump_r * (0.52 + 0.30 * _rand(seed, i * 4.1))
        material = lit_material if i % 3 != 2 else mid_material
        add_foliage_blob(scene, f"{name}B{i}", bx, by, bz, size, size * 1.05,
                         material, squash=0.95)
    add_needle_cards(scene, f"{name}Ndl", (cx, cy, cz + bump_r * 0.45),
                     (radius * 0.95, radius * 0.95, bump_r * 0.95), 46,
                     [shadow_material, mid_material, lit_material, highlight_material or lit_material],
                     seed=seed + 511.0)



def add_needle_cards(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    count: int,
    materials: list[bpy.types.Material],
    seed: float,
) -> None:
    """Fine needle speckle over a pad: thin elongated cards biased to the
    upper hemisphere, giving the painterly fine-grain the smooth blobs lack."""
    cx, cy, cz = center
    rx, ry, rz = radii
    buckets: list[list[tuple[float, float, float]]] = [[] for _ in materials]
    faces_per_bucket: list[list[tuple[int, ...]]] = [[] for _ in materials]
    for i in range(count):
        u = _rand(seed, i * 3.1)
        v = _rand(seed, i * 3.1 + 1.0)
        w = _rand(seed, i * 3.1 + 2.0)
        radial = 0.80 + 0.20 * (u ** 0.5)
        theta = v * 2.0 * math.pi
        phi = math.acos(1.0 - w)  # upper hemisphere bias
        px = cx + rx * radial * math.sin(phi) * math.cos(theta)
        py = cy + ry * radial * math.sin(phi) * math.sin(theta)
        pz = cz + rz * radial * math.cos(phi)
        yaw = _rand(seed, i * 9.3) * 2.0 * math.pi
        half = 0.010 + 0.008 * _rand(seed, i * 4.9)
        long_half = half * 2.6
        tilt = (_rand(seed, i * 5.7) - 0.5) * 0.9
        ax = math.cos(yaw) * long_half
        ay = math.sin(yaw) * long_half
        bx = -math.sin(yaw) * half * math.cos(tilt)
        by = math.cos(yaw) * half * math.cos(tilt)
        bz = half * math.sin(tilt)
        t_light = 0.5 + 0.5 * ((px - cx) * 0.98 + (py - cy) * 0.196) / max(rx, 1e-5)
        t_height = 0.5 + 0.5 * (pz - cz) / max(rz, 1e-5)
        mix = 0.55 * t_height + 0.30 * t_light + 0.15 * _rand(seed, i * 6.7)
        bucket = min(len(materials) - 1, max(0, int(mix * len(materials))))
        vertices = buckets[bucket]
        base = len(vertices)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vertices.append((*map_xy(px + sx * ax + sy * bx, py + sx * ay + sy * by), pz + sy * bz))
        faces_per_bucket[bucket].append((base, base + 1, base + 2, base + 3))
    for index, material in enumerate(materials):
        if faces_per_bucket[index]:
            add_mesh(scene, f"{name}N{index}", buckets[index], faces_per_bucket[index], material)


def add_tree_base(scene: bpy.types.Scene, cx: float, cy: float, trunk_r: float,
                  bark: bpy.types.Material, seed: float = 0.0,
                  base_scale: float = 1.0) -> None:
    """Ground treatment: root flare, tufts, litter, pebbles (per-variant seed
    so bases stop being identical between variants). base_scale shrinks the
    whole ground footprint for low species (tsubaki) whose 64x72 canvas would
    otherwise be dominated by the litter pad."""
    s = base_scale
    grass_dark = make_material("BaseGrassD", (0.130, 0.165, 0.062, 1.0))
    grass_light = make_material("BaseGrassL", (0.215, 0.255, 0.100, 1.0))
    litter = make_foliage_material("BaseLitter", (0.072, 0.076, 0.040), (0.115, 0.118, 0.060))
    pebble = make_noise_material("BasePebble", (0.105, 0.102, 0.095), (0.180, 0.175, 0.160), scale=7.0)

    for index in range(5):
        angle = index / 5 * 2 * math.pi + _rand(seed, index * 1.7) * 0.9
        dist = (0.13 + 0.09 * _rand(seed, index * 2.9)) * s
        rx = dist * math.cos(angle)
        ry = dist * math.sin(angle)
        add_beam(scene, f"Root{index}", (cx + rx, cy + ry, -0.01),
                 (cx + rx * 0.2, cy + ry * 0.2, 0.11 * s), trunk_r * 0.5, bark,
                 tip_thickness=trunk_r * 0.95)
    for index in range(7):
        angle = (index + 0.5) / 7 * 2 * math.pi + _rand(seed, index * 3.3)
        dist = (0.22 + 0.09 * _rand(seed, index * 4.1)) * s
        tx = cx + dist * math.cos(angle)
        ty = cy + dist * math.sin(angle)
        height = (0.10 + 0.05 * _rand(seed, index * 5.3)) * s
        material = grass_light if index % 2 else grass_dark
        add_beam(scene, f"BaseTuft{index}", (tx, ty, 0.0), (tx + 0.025, ty - 0.02, height),
                 0.02, material, tip_thickness=0.006)
    add_foliage_blob(scene, "BaseLitterPad", cx + 0.04 * s, cy - 0.02 * s, 0.0, 0.30 * s,
                     0.035 * s, litter, squash=0.6, jitter_amp=0.22)
    for index in range(2):
        angle = _rand(seed, index * 6.7) * 2 * math.pi
        bx = cx + 0.28 * s * math.cos(angle)
        by = cy + 0.28 * s * math.sin(angle)
        size = (0.032 + 0.014 * _rand(seed, index * 7.9)) * s
        add_frustum(scene, f"BasePebble{index}", (bx - size, by - size),
                    (bx + size, by + size), 0.0, size * 1.3, size * 0.5, pebble)


# --- Stronghold-style textured needle sprigs ---------------------------------
# The believability of Stronghold's trees comes from TEXTURE-driven foliage
# (alpha cards carrying needle detail) + air between layers, not geometry.
# Each sprig is a UV-mapped quad whose shader draws fine needle stripes with
# alpha gaps; pads become sprays of sprigs around a small core blob.

def make_needle_sprig_material(name: str, dark: tuple[float, float, float],
                               light: tuple[float, float, float],
                               front_floor: float = 0.05,
                               translucent_floor: float = 0.0) -> bpy.types.Material:
    """front_floor: emission floor on the lit-side BSDF (keeps shadowed
    front-facing cards from going black). translucent_floor: same floor on the
    backfacing Translucent branch — without it, a backfacing card whose light
    is blocked by the crown renders as a pure black sliver. Defaults keep the
    approved kuromatsu graph byte-identical."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.92
    output = nodes["Material Output"]

    uv = nodes.new("ShaderNodeUVMap")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], sep.inputs["Vector"])

    # Needle stripes: bands across the card (U axis) with noisy distortion.
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 9.0
    wave.inputs["Distortion"].default_value = 2.4
    wave.inputs["Detail"].default_value = 2.0
    links.new(uv.outputs["UV"], wave.inputs["Vector"])
    stripe = nodes.new("ShaderNodeValToRGB")
    stripe.color_ramp.interpolation = "CONSTANT"
    stripe.color_ramp.elements[0].position = 0.0
    stripe.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    stripe.color_ramp.elements[1].position = 0.42
    stripe.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(wave.outputs["Fac"], stripe.inputs["Fac"])

    # Envelope: fade alpha toward the card sides and the tip (V=1).
    def chain(op, a, b=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = op
        if isinstance(a, float):
            node.inputs[0].default_value = a
        else:
            links.new(a, node.inputs[0])
        if b is not None:
            if isinstance(b, float):
                node.inputs[1].default_value = b
            else:
                links.new(b, node.inputs[1])
        return node.outputs["Value"]

    ux = chain("SUBTRACT", sep.outputs["X"], 0.5)
    ux = chain("ABSOLUTE", ux)
    ux = chain("MULTIPLY", ux, 2.0)
    ux = chain("POWER", ux, 2.2)
    env_x = chain("SUBTRACT", 1.0, ux)
    vy = chain("POWER", sep.outputs["Y"], 1.6)
    env_y = chain("SUBTRACT", 1.0, vy)
    env = chain("MULTIPLY", env_x, env_y)
    env = chain("MULTIPLY", env, 2.2)
    env = chain("MINIMUM", env, 1.0)
    alpha = chain("MULTIPLY", stripe.outputs["Color"], env)
    alpha = chain("GREATER_THAN", alpha, 0.30)

    # Color: dark base -> light tip along V, low-frequency patchiness.
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.10
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    coords = nodes.new("ShaderNodeTexCoord")
    patch = nodes.new("ShaderNodeTexNoise")
    patch.inputs["Scale"].default_value = 2.6
    links.new(coords.outputs["Object"], patch.inputs["Vector"])
    patch_map = nodes.new("ShaderNodeMapRange")
    patch_map.inputs["From Min"].default_value = 0.0
    patch_map.inputs["From Max"].default_value = 1.0
    patch_map.inputs["To Min"].default_value = 0.68
    patch_map.inputs["To Max"].default_value = 1.10
    links.new(patch.outputs["Fac"], patch_map.inputs["Value"])
    tint = nodes.new("ShaderNodeMixRGB")
    tint.blend_type = "MULTIPLY"
    tint.inputs["Fac"].default_value = 1.0
    links.new(ramp.outputs["Color"], tint.inputs["Color1"])
    links.new(patch_map.outputs["Result"], tint.inputs["Color2"])
    links.new(tint.outputs["Color"], bsdf.inputs["Base Color"])
    floor = nodes.new("ShaderNodeMixRGB")
    floor.blend_type = "MULTIPLY"
    floor.inputs["Fac"].default_value = 1.0
    floor.inputs["Color2"].default_value = (front_floor, front_floor, front_floor, 1.0)
    links.new(tint.outputs["Color"], floor.inputs["Color1"])
    links.new(floor.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0

    # Real needles transmit light: mixing a Translucent lobe keeps backlit /
    # backfacing cards green instead of collapsing to black slivers.
    translucent = nodes.new("ShaderNodeBsdfTranslucent")
    links.new(tint.outputs["Color"], translucent.inputs["Color"])
    back_shader = translucent.outputs["BSDF"]
    if translucent_floor > 0.0:
        back_floor = nodes.new("ShaderNodeMixRGB")
        back_floor.blend_type = "MULTIPLY"
        back_floor.inputs["Fac"].default_value = 1.0
        back_floor.inputs["Color2"].default_value = (translucent_floor, translucent_floor, translucent_floor, 1.0)
        links.new(tint.outputs["Color"], back_floor.inputs["Color1"])
        back_emit = nodes.new("ShaderNodeEmission")
        links.new(back_floor.outputs["Color"], back_emit.inputs["Color"])
        back_add = nodes.new("ShaderNodeAddShader")
        links.new(translucent.outputs["BSDF"], back_add.inputs[0])
        links.new(back_emit.outputs["Emission"], back_add.inputs[1])
        back_shader = back_add.outputs["Shader"]
    geometry = nodes.new("ShaderNodeNewGeometry")
    leaf_mix = nodes.new("ShaderNodeMixShader")
    links.new(geometry.outputs["Backfacing"], leaf_mix.inputs["Fac"])
    links.new(bsdf.outputs["BSDF"], leaf_mix.inputs[1])
    links.new(back_shader, leaf_mix.inputs[2])

    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(alpha, mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(leaf_mix.outputs["Shader"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def add_sprig_spray(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radius: float,
    count: int,
    material: bpy.types.Material,
    seed: float,
    droop: float = 0.35,
    length_scale: float = 1.0,
    width_scale: float = 1.0,
) -> None:
    """A spray of UV-mapped needle cards on the upper shell of a pad sphere,
    pointing outward-downward like real pine needle clusters."""
    cx, cy, cz = center
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    uvs: list[tuple[float, float]] = []
    for i in range(count):
        u = _rand(seed, i * 3.1)
        v = _rand(seed, i * 3.1 + 1.0)
        theta = u * 2.0 * math.pi
        phi = math.acos(1.0 - 0.85 * v)  # bias to upper shell
        ox = math.sin(phi) * math.cos(theta)
        oy = math.sin(phi) * math.sin(theta)
        oz = math.cos(phi)
        bx = cx + radius * 0.62 * ox
        by = cy + radius * 0.62 * oy
        bz = cz + radius * 0.55 * oz
        # Direction: outward with droop.
        dx, dy, dz = ox, oy, oz * 0.4 - droop
        norm = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
        dx, dy, dz = dx / norm, dy / norm, dz / norm
        length = radius * (0.62 + 0.35 * _rand(seed, i * 5.1)) * length_scale
        width = radius * (0.34 + 0.16 * _rand(seed, i * 7.3)) * width_scale
        # Side vector: horizontal perpendicular.
        sxv, syv = -dy, dx
        snorm = math.sqrt(sxv * sxv + syv * syv) or 1.0
        sxv, syv = sxv / snorm * width / 2, syv / snorm * width / 2
        tipx, tipy, tipz = bx + dx * length, by + dy * length, bz + dz * length
        base = len(vertices)
        vertices.append((*map_xy(bx - sxv, by - syv), bz))
        vertices.append((*map_xy(bx + sxv, by + syv), bz))
        vertices.append((*map_xy(tipx + sxv * 0.45, tipy + syv * 0.45), tipz))
        vertices.append((*map_xy(tipx - sxv * 0.45, tipy - syv * 0.45), tipz))
        faces.append((base, base + 1, base + 2, base + 3))
        uvs += [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    uv_layer = mesh.uv_layers.new()
    for loop_index, uv_co in enumerate(uvs):
        uv_layer.data[loop_index].uv = uv_co
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    obj.visible_shadow = False
    scene.collection.objects.link(obj)


def add_needle_pad(
    scene: bpy.types.Scene,
    name: str,
    center: tuple[float, float, float],
    radius: float,
    core_material: bpy.types.Material,
    sprig_material: bpy.types.Material,
    seed: float,
    count: int = 28,
    droop: float = 0.35,
    length_scale: float = 1.0,
    width_scale: float = 1.0,
    core_scale: float = 1.0,
) -> None:
    """Stronghold-style pad: a small dark core blob for depth backing, wrapped
    in a spray of textured needle cards. The alpha gaps between cards give the
    airy see-through silhouette the solid blobs lacked. core_scale shrinks the
    backing blob where sparse/droopy sprays would leave it poking through as a
    black lump (sugi tiers, tsubaki dome)."""
    cx, cy, cz = center
    core_obj = add_foliage_blob_obj(scene, f"{name}Core", cx, cy,
                                    cz - radius * 0.10 * core_scale,
                                    radius * 0.58 * core_scale,
                                    radius * 0.55 * core_scale, core_material, squash=0.9)
    core_obj.visible_shadow = False
    add_sprig_spray(scene, f"{name}Sprigs", center, radius, count, sprig_material,
                    seed=seed, droop=droop, length_scale=length_scale,
                    width_scale=width_scale)


def make_leaf_sprig_material(name: str, dark: tuple[float, float, float],
                             light: tuple[float, float, float],
                             clump_scale: float = 5.0,
                             roughness: float = 0.92,
                             front_floor: float = 0.10,
                             translucent_floor: float = 0.10) -> bpy.types.Material:
    """Broadleaf twin of make_needle_sprig_material: the card carries clumpy
    leaf masses (noise threshold) instead of needle stripes, everything else
    (V-ramp colour, patch noise, emission floor, backfacing translucency)
    keeps the vocabulary established on the kuromatsu gate."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    output = nodes["Material Output"]

    uv = nodes.new("ShaderNodeUVMap")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], sep.inputs["Vector"])

    def chain(op, a, b=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = op
        if isinstance(a, float):
            node.inputs[0].default_value = a
        else:
            links.new(a, node.inputs[0])
        if b is not None:
            if isinstance(b, float):
                node.inputs[1].default_value = b
            else:
                links.new(b, node.inputs[1])
        return node.outputs["Value"]

    # Leaf clumps: mid-frequency noise over the card with alpha holes.
    clump = nodes.new("ShaderNodeTexNoise")
    clump.inputs["Scale"].default_value = clump_scale
    clump.inputs["Detail"].default_value = 3.0
    clump.inputs["Roughness"].default_value = 0.62
    links.new(uv.outputs["UV"], clump.inputs["Vector"])

    # Envelope: radial fade from the card centre so clumps stay lobed.
    ux = chain("SUBTRACT", sep.outputs["X"], 0.5)
    ux = chain("MULTIPLY", ux, ux)
    vy = chain("SUBTRACT", sep.outputs["Y"], 0.5)
    vy = chain("MULTIPLY", vy, vy)
    dist = chain("ADD", ux, vy)
    dist = chain("SQRT", dist)
    dist = chain("MULTIPLY", dist, 2.0)
    env = chain("SUBTRACT", 1.0, chain("POWER", dist, 1.8))
    body = chain("MULTIPLY", clump.outputs["Fac"], chain("MULTIPLY", env, 2.4))
    alpha = chain("GREATER_THAN", body, 0.62)

    # Colour: dark base -> light tip along V, low-frequency patchiness.
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.10
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    coords = nodes.new("ShaderNodeTexCoord")
    patch = nodes.new("ShaderNodeTexNoise")
    patch.inputs["Scale"].default_value = 2.6
    links.new(coords.outputs["Object"], patch.inputs["Vector"])
    patch_map = nodes.new("ShaderNodeMapRange")
    patch_map.inputs["From Min"].default_value = 0.0
    patch_map.inputs["From Max"].default_value = 1.0
    patch_map.inputs["To Min"].default_value = 0.68
    patch_map.inputs["To Max"].default_value = 1.10
    links.new(patch.outputs["Fac"], patch_map.inputs["Value"])
    tint = nodes.new("ShaderNodeMixRGB")
    tint.blend_type = "MULTIPLY"
    tint.inputs["Fac"].default_value = 1.0
    links.new(ramp.outputs["Color"], tint.inputs["Color1"])
    links.new(patch_map.outputs["Result"], tint.inputs["Color2"])
    links.new(tint.outputs["Color"], bsdf.inputs["Base Color"])
    floor = nodes.new("ShaderNodeMixRGB")
    floor.blend_type = "MULTIPLY"
    floor.inputs["Fac"].default_value = 1.0
    floor.inputs["Color2"].default_value = (front_floor, front_floor, front_floor, 1.0)
    links.new(tint.outputs["Color"], floor.inputs["Color1"])
    links.new(floor.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0

    translucent = nodes.new("ShaderNodeBsdfTranslucent")
    links.new(tint.outputs["Color"], translucent.inputs["Color"])
    back_shader = translucent.outputs["BSDF"]
    if translucent_floor > 0.0:
        back_floor = nodes.new("ShaderNodeMixRGB")
        back_floor.blend_type = "MULTIPLY"
        back_floor.inputs["Fac"].default_value = 1.0
        back_floor.inputs["Color2"].default_value = (translucent_floor, translucent_floor, translucent_floor, 1.0)
        links.new(tint.outputs["Color"], back_floor.inputs["Color1"])
        back_emit = nodes.new("ShaderNodeEmission")
        links.new(back_floor.outputs["Color"], back_emit.inputs["Color"])
        back_add = nodes.new("ShaderNodeAddShader")
        links.new(translucent.outputs["BSDF"], back_add.inputs[0])
        links.new(back_emit.outputs["Emission"], back_add.inputs[1])
        back_shader = back_add.outputs["Shader"]
    geometry = nodes.new("ShaderNodeNewGeometry")
    leaf_mix = nodes.new("ShaderNodeMixShader")
    links.new(geometry.outputs["Backfacing"], leaf_mix.inputs["Fac"])
    links.new(bsdf.outputs["BSDF"], leaf_mix.inputs[1])
    links.new(back_shader, leaf_mix.inputs[2])

    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(alpha, mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(leaf_mix.outputs["Shader"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def make_core_material(name: str, dark: tuple[float, float, float],
                       light: tuple[float, float, float]) -> bpy.types.Material:
    """Pad-backing blob material with the sprig vocabulary's emission floor.
    The painterly finish (make_foliage_material) drops a sphere's shade side
    to near-black; where droopy/sparse sprays expose the core (sugi tiers,
    broadleaf crown tops) that read as black lumps. This one can't go black."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 1.0
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 4.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    floor = nodes.new("ShaderNodeMixRGB")
    floor.blend_type = "MULTIPLY"
    floor.inputs["Fac"].default_value = 1.0
    floor.inputs["Color2"].default_value = (0.09, 0.09, 0.09, 1.0)
    links.new(ramp.outputs["Color"], floor.inputs["Color1"])
    links.new(floor.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    return material


def _smooth_trunk(points):
    """Midpoint-subdivided trunk polyline (same rule as build_kuromatsu)."""
    out = [points[0]]
    for a, b in zip(points, points[1:]):
        mid = ((a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.10,
               (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.10,
               (a[2] + b[2]) / 2)
        out += [mid, b]
    return out


def _build_trunk(scene: bpy.types.Scene, prefix: str, points, bark,
                 thick: float, taper: float = 0.85) -> None:
    trunk = _smooth_trunk(points)
    for index in range(len(trunk) - 1):
        t = taper ** index
        add_beam(scene, f"{prefix}{index}", trunk[index], trunk[index + 1],
                 max(0.035, thick * t), bark,
                 tip_thickness=max(0.030, thick * t * 0.85))


# --- クロマツ (Japanese black pine) ------------------------------------------

#: Per-variant structure: trunk waypoints (x-sign, y-sign pairs are scaled by
#: the lean), pad tiers as (anchor index, offset, radius). Variants differ in
#: TRUNK SHAPE and PAD LAYOUT (the clone identifiers per Astra: 幹の曲がり・
#: 枝ぶり・根元), not just seed jitter (VAR-01).
_KUROMATSU_VARIANTS = {
    # v1: classic S-curve leaning right, layered crown.
    1: {
        "trunk": ((0.0, 0.0, 0.0), (0.18, 0.10, 0.38), (-0.08, -0.05, 0.80),
                  (0.24, 0.13, 1.22), (-0.02, 0.02, 1.62)),
        "pads": ((2, (-0.52, -0.30, 0.02), 0.30), (2, (-0.18, -0.44, 0.10), 0.22),
                 (2, (0.50, 0.30, 0.16), 0.27), (2, (0.66, 0.08, 0.06), 0.17),
                 (3, (-0.36, -0.12, 0.02), 0.23), (3, (0.30, 0.20, 0.18), 0.20),
                 (4, (0.14, 0.08, 0.00), 0.14), (4, (0.00, 0.00, 0.14), 0.23)),
        "dead": ((2, (-0.06, 0.32, 0.30)),),
    },
    # v2: reverse lean, lower spread-out crown (kasa-matsu silhouette).
    2: {
        "trunk": ((0.0, 0.0, 0.0), (-0.16, -0.09, 0.34), (0.10, 0.06, 0.72),
                  (-0.26, -0.12, 1.06), (-0.34, -0.16, 1.38)),
        "pads": ((2, (0.46, 0.26, 0.04), 0.28), (2, (0.14, 0.44, 0.12), 0.21),
                 (2, (-0.52, -0.26, 0.10), 0.25), (3, (0.34, 0.10, 0.06), 0.22),
                 (3, (-0.30, -0.28, 0.16), 0.24), (3, (-0.02, 0.20, 0.24), 0.19),
                 (4, (-0.14, -0.06, 0.02), 0.16), (4, (-0.02, 0.02, 0.16), 0.25)),
        "dead": ((3, (0.10, -0.34, 0.16)),),
    },
    # v3: forked twin trunk (株立ち), two smaller crowns.
    3: {
        "trunk": ((0.0, 0.0, 0.0), (0.10, 0.05, 0.30), (0.30, 0.16, 0.86),
                  (0.42, 0.22, 1.28)),
        "trunk2": ((0.02, 0.0, 0.16), (-0.22, -0.12, 0.62), (-0.34, -0.18, 1.04)),
        "pads": ((2, (0.16, 0.12, 0.10), 0.24), (3, (-0.08, -0.04, 0.06), 0.20),
                 (3, (0.16, 0.06, 0.20), 0.22),
                 (12, (-0.14, -0.10, 0.08), 0.22), (12, (0.10, 0.06, 0.20), 0.18),
                 (11, (-0.30, -0.02, 0.02), 0.19)),
        "dead": ((2, (0.34, -0.16, 0.18)),),
    },
}


def build_kuromatsu(scene: bpy.types.Scene, variant: int) -> None:
    """クロマツ. Canvas 64x120, anchor 32,104. The castle's signature tree:
    thick contorted trunk, dark nihonga cloud pads."""
    spec = _KUROMATSU_VARIANTS[variant]
    seed = 11.0 + variant * 53.0
    bark = make_textured_material("KuromatsuBark", (0.105, 0.062, 0.038), (0.185, 0.115, 0.068),
                                  scale=(16.0, 16.0, 3.4))
    core = make_foliage_material("KuromatsuCore", (0.036, 0.072, 0.052), (0.062, 0.108, 0.076))
    sprig = make_needle_sprig_material("KuromatsuSprig", (0.030, 0.078, 0.056), (0.088, 0.182, 0.118))

    add_tree_base(scene, 0.0, 0.0, 0.14, bark, seed=seed)

    def smooth(points):
        out = [points[0]]
        for a, b in zip(points, points[1:]):
            mid = ((a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.10,
                   (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.10,
                   (a[2] + b[2]) / 2)
            out += [mid, b]
        return out

    trunk = smooth(spec["trunk"])
    thick = 0.115
    for index in range(len(trunk) - 1):
        taper = 0.85 ** index
        add_beam(scene, f"Trunk{index}", trunk[index], trunk[index + 1],
                 max(0.045, thick * taper), bark,
                 tip_thickness=max(0.038, thick * taper * 0.85))
    anchors = list(spec["trunk"])
    if "trunk2" in spec:
        trunk2 = smooth(spec["trunk2"])
        for index in range(len(trunk2) - 1):
            taper = 0.85 ** index
            add_beam(scene, f"TrunkB{index}", trunk2[index], trunk2[index + 1],
                     max(0.04, 0.085 * taper), bark,
                     tip_thickness=max(0.034, 0.085 * taper * 0.85))
        # Anchor indices 10.. refer into the second trunk.
        anchors += [None] * (10 - len(anchors))
        anchors += list(trunk2)

    for index, (anchor_index, offset, radius) in enumerate(spec["pads"]):
        base = anchors[anchor_index]
        tip = (base[0] + offset[0], base[1] + offset[1], base[2] + offset[2])
        add_beam(scene, f"Branch{index}", base, (tip[0], tip[1], tip[2] - 0.05),
                 0.045, bark, tip_thickness=0.02)
        add_needle_pad(scene, f"Pad{index}", (tip[0], tip[1], tip[2] + 0.03), radius,
                       core, sprig, seed=seed + index * 13.7)
    for index, (anchor_index, offset) in enumerate(spec.get("dead", ())):
        base = anchors[anchor_index]
        add_beam(scene, f"DeadBranch{index}", base,
                 (base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]),
                 0.032, bark, tip_thickness=0.012)


# --- アカマツ (Japanese red pine) ---------------------------------------------

_AKAMATSU_VARIANTS = {
    # v1: gentle right lean, umbrella crown filling the upper half.
    1: {
        "trunk": ((0.0, 0.0, 0.0), (0.12, 0.07, 0.44), (0.02, -0.02, 0.92),
                  (0.20, 0.12, 1.34), (0.10, 0.04, 1.56)),
        "pads": ((2, (-0.42, -0.22, 0.10), 0.25), (3, (0.40, 0.22, 0.06), 0.25),
                 (3, (-0.26, -0.28, 0.16), 0.21), (4, (0.02, 0.02, 0.12), 0.24),
                 (4, (-0.24, 0.12, 0.04), 0.18), (4, (0.26, -0.10, 0.06), 0.17)),
        "dead": ((2, (0.24, -0.14, 0.18)),),
    },
    # v2: double curve leaning left, wind-blown but still full-crowned.
    2: {
        "trunk": ((0.0, 0.0, 0.0), (-0.14, -0.08, 0.40), (0.04, 0.03, 0.84),
                  (-0.20, -0.10, 1.24), (-0.30, -0.14, 1.50)),
        "pads": ((2, (0.38, 0.22, 0.12), 0.23), (3, (-0.38, -0.20, 0.08), 0.24),
                 (3, (0.18, 0.26, 0.18), 0.19), (4, (-0.08, -0.02, 0.14), 0.23),
                 (4, (0.18, 0.10, 0.04), 0.17)),
        "dead": ((3, (0.20, -0.18, 0.12)),),
    },
}


def build_akamatsu(scene: bpy.types.Scene, variant: int) -> None:
    """アカマツ. Canvas 64x112, anchor 32,96. Field pine along roads: brighter
    red bark, slimmer trunk, lighter and airier crown than the kuromatsu."""
    spec = _AKAMATSU_VARIANTS[variant]
    seed = 211.0 + variant * 67.0
    bark = make_textured_material("AkamatsuBark", (0.150, 0.072, 0.040), (0.245, 0.128, 0.068),
                                  scale=(16.0, 16.0, 3.4))
    core = make_core_material("AkamatsuCore", (0.040, 0.074, 0.048), (0.068, 0.112, 0.072))
    sprig = make_needle_sprig_material("AkamatsuSprig", (0.034, 0.080, 0.052), (0.100, 0.188, 0.108),
                                       front_floor=0.10, translucent_floor=0.10)

    add_tree_base(scene, 0.0, 0.0, 0.11, bark, seed=seed)
    _build_trunk(scene, "Trunk", spec["trunk"], bark, 0.088)
    anchors = list(spec["trunk"])
    for index, (anchor_index, offset, radius) in enumerate(spec["pads"]):
        base = anchors[anchor_index]
        tip = (base[0] + offset[0], base[1] + offset[1], base[2] + offset[2])
        add_beam(scene, f"Branch{index}", base, (tip[0], tip[1], tip[2] - 0.05),
                 0.038, bark, tip_thickness=0.018)
        add_needle_pad(scene, f"Pad{index}", (tip[0], tip[1], tip[2] + 0.03), radius,
                       core, sprig, seed=seed + index * 13.7, count=26,
                       core_scale=0.9)
    for index, (anchor_index, offset) in enumerate(spec.get("dead", ())):
        base = anchors[anchor_index]
        add_beam(scene, f"DeadBranch{index}", base,
                 (base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]),
                 0.026, bark, tip_thickness=0.010)


# --- スギ (Japanese cedar) ----------------------------------------------------

_SUGI_VARIANTS = {
    # v1: 壮齢 — even conical spire, tiers tight to the trunk.
    1: {
        "tiers": ((0.42, 0.30), (0.66, 0.27), (0.92, 0.245), (1.18, 0.215),
                  (1.42, 0.18), (1.62, 0.145), (1.78, 0.105)),
        "top": (0.0, 0.0, 1.92),
        "lean": (0.0, 0.0),
    },
    # v2: 老齢 — broader base tiers, gaps of bare trunk, bent top.
    2: {
        "tiers": ((0.40, 0.33), (0.70, 0.29), (1.08, 0.25),
                  (1.36, 0.20), (1.66, 0.15)),
        "top": (0.10, 0.06, 1.88),
        "lean": (0.06, 0.03),
    },
}


def build_sugi(scene: bpy.types.Scene, variant: int) -> None:
    """スギ. Canvas 64x128, anchor 32,112. Shrine/forest cedar: straight trunk,
    conical spire of dense short-needle tiers (style sheet: one-stroke cone
    with 2-3 layered horizontal shade bands)."""
    spec = _SUGI_VARIANTS[variant]
    seed = 431.0 + variant * 71.0
    bark = make_textured_material("SugiBark", (0.118, 0.066, 0.044), (0.198, 0.118, 0.078),
                                  scale=(14.0, 14.0, 4.2))
    core = make_core_material("SugiCore", (0.042, 0.080, 0.050), (0.064, 0.114, 0.068))
    sprig = make_needle_sprig_material("SugiSprig", (0.028, 0.066, 0.040), (0.076, 0.152, 0.084),
                                       front_floor=0.10, translucent_floor=0.10)

    add_tree_base(scene, 0.0, 0.0, 0.12, bark, seed=seed)
    lx, ly = spec["lean"]
    top = spec["top"]
    _build_trunk(scene, "Trunk",
                 ((0.0, 0.0, 0.0), (lx * 0.4, ly * 0.4, 0.7), (lx, ly, 1.4), top),
                 bark, 0.105, taper=0.80)
    for index, (z, radius) in enumerate(spec["tiers"]):
        t = z / top[2]
        cx = lx * min(1.0, t * 1.4)
        cy = ly * min(1.0, t * 1.4)
        jx = (0.05 + 0.05 * _rand(seed, index * 3.9)) * (1 if index % 2 else -1)
        add_needle_pad(scene, f"Tier{index}", (cx + jx, cy - jx * 0.5, z), radius,
                       core, sprig, seed=seed + index * 17.3,
                       count=30, droop=0.52, length_scale=0.85, width_scale=1.15,
                       core_scale=0.78)
    # Pointed tip sprig cluster.
    add_needle_pad(scene, "TierTop", (top[0], top[1], top[2] - 0.02), 0.085,
                   core, sprig, seed=seed + 999.0,
                   count=12, droop=0.15, length_scale=1.1, width_scale=0.8)


# --- クスノキ (camphor tree) --------------------------------------------------

_KUSUNOKI_VARIANTS = {
    # v1: symmetric landmark dome on a massive forked trunk.
    1: {
        "trunk": ((0.0, 0.0, 0.0), (0.04, 0.02, 0.42), (0.02, 0.0, 0.78)),
        "limbs": (((0.02, 0.0, 0.70), (0.48, 0.26, 1.16)),
                  ((0.02, 0.0, 0.74), (-0.44, -0.26, 1.20)),
                  ((0.02, 0.0, 0.78), (0.10, 0.30, 1.34)),
                  ((0.02, 0.0, 0.76), (-0.10, -0.32, 1.28))),
        "pads": (((0.50, 0.28, 1.22), 0.34), ((-0.46, -0.28, 1.26), 0.35),
                 ((0.10, 0.32, 1.42), 0.32), ((-0.12, -0.34, 1.36), 0.31),
                 ((0.02, 0.0, 1.52), 0.36), ((0.34, -0.10, 1.10), 0.26),
                 ((-0.30, 0.12, 1.14), 0.26)),
    },
    # v2: asymmetric spread, one heavy low limb (old-camphor habit).
    2: {
        "trunk": ((0.0, 0.0, 0.0), (-0.06, -0.03, 0.40), (0.00, 0.0, 0.74)),
        "limbs": (((0.0, 0.0, 0.60), (0.62, 0.34, 0.96)),
                  ((0.0, 0.0, 0.70), (-0.40, -0.24, 1.18)),
                  ((0.0, 0.0, 0.74), (-0.02, 0.28, 1.36))),
        "pads": (((0.66, 0.36, 1.04), 0.33), ((0.30, 0.16, 1.24), 0.30),
                 ((-0.42, -0.26, 1.26), 0.34), ((-0.04, 0.30, 1.44), 0.33),
                 ((-0.14, -0.06, 1.50), 0.32), ((-0.52, 0.04, 1.02), 0.24)),
    },
}


def build_kusunoki(scene: bpy.types.Scene, variant: int) -> None:
    """クスノキ. Canvas 96x128, anchor 48,112. The landmark broadleaf
    (Stronghold-oak grade): massive trunk, wide evergreen dome of clumpy
    leaf masses, fresh yellow-green tint."""
    spec = _KUSUNOKI_VARIANTS[variant]
    seed = 641.0 + variant * 83.0
    bark = make_textured_material("KusunokiBark", (0.108, 0.084, 0.058), (0.182, 0.148, 0.106),
                                  scale=(15.0, 15.0, 3.8))
    core = make_core_material("KusunokiCore", (0.044, 0.080, 0.042), (0.068, 0.116, 0.062))
    leaf = make_leaf_sprig_material("KusunokiLeaf", (0.038, 0.082, 0.042), (0.118, 0.196, 0.096))

    add_tree_base(scene, 0.0, 0.0, 0.20, bark, seed=seed)
    _build_trunk(scene, "Trunk", spec["trunk"], bark, 0.185, taper=0.90)
    for index, (base, tip) in enumerate(spec["limbs"]):
        add_beam(scene, f"Limb{index}", base, tip, 0.075, bark, tip_thickness=0.032)
    for index, (center, radius) in enumerate(spec["pads"]):
        add_needle_pad(scene, f"Pad{index}", center, radius, core, leaf,
                       seed=seed + index * 13.7,
                       count=34, droop=0.22, length_scale=0.80, width_scale=1.45,
                       core_scale=0.85)


# --- ケヤキ (zelkova) ---------------------------------------------------------

_KEYAKI_VARIANTS = {
    # v1: classic broom (ほうき形) — branches fan upward from one bole.
    1: {
        "bole": ((0.0, 0.0, 0.0), (0.02, 0.01, 0.34), (0.0, 0.0, 0.58)),
        "fans": (((0.0, 0.0, 0.52), (0.42, 0.22, 1.26)),
                 ((0.0, 0.0, 0.55), (-0.40, -0.22, 1.30)),
                 ((0.0, 0.0, 0.58), (0.14, 0.26, 1.44)),
                 ((0.0, 0.0, 0.58), (-0.12, -0.26, 1.40)),
                 ((0.0, 0.0, 0.58), (0.02, 0.0, 1.52))),
        "pads": (((0.44, 0.24, 1.32), 0.24), ((-0.42, -0.24, 1.36), 0.25),
                 ((0.15, 0.28, 1.50), 0.23), ((-0.13, -0.28, 1.46), 0.22),
                 ((0.02, 0.0, 1.58), 0.24), ((0.24, -0.12, 1.18), 0.18),
                 ((-0.24, 0.10, 1.22), 0.18)),
    },
    # v2: broader, slightly leaning fan.
    2: {
        "bole": ((0.0, 0.0, 0.0), (-0.04, -0.02, 0.30), (-0.02, 0.0, 0.52)),
        "fans": (((0.0, 0.0, 0.46), (0.52, 0.28, 1.16)),
                 ((0.0, 0.0, 0.50), (-0.50, -0.28, 1.22)),
                 ((0.0, 0.0, 0.52), (0.20, 0.30, 1.38)),
                 ((0.0, 0.0, 0.52), (-0.16, -0.30, 1.34))),
        "pads": (((0.54, 0.30, 1.24), 0.25), ((-0.52, -0.30, 1.30), 0.26),
                 ((0.22, 0.32, 1.44), 0.23), ((-0.18, -0.32, 1.40), 0.23),
                 ((-0.02, 0.0, 1.50), 0.22), ((0.32, -0.14, 1.10), 0.17)),
    },
}


def build_keyaki(scene: bpy.types.Scene, variant: int) -> None:
    """ケヤキ. Canvas 64x112, anchor 32,96. The deciduous mainstay replacing
    the legacy broadleaf raster: fan/broom silhouette, soft green clumps."""
    spec = _KEYAKI_VARIANTS[variant]
    seed = 863.0 + variant * 91.0
    bark = make_textured_material("KeyakiBark", (0.112, 0.092, 0.072), (0.188, 0.162, 0.132),
                                  scale=(15.0, 15.0, 4.0))
    core = make_core_material("KeyakiCore", (0.042, 0.076, 0.040), (0.064, 0.110, 0.058))
    leaf = make_leaf_sprig_material("KeyakiLeaf", (0.036, 0.076, 0.040), (0.108, 0.182, 0.092))

    add_tree_base(scene, 0.0, 0.0, 0.13, bark, seed=seed)
    _build_trunk(scene, "Bole", spec["bole"], bark, 0.125, taper=0.92)
    for index, (base, tip) in enumerate(spec["fans"]):
        add_beam(scene, f"Fan{index}", base, tip, 0.045, bark, tip_thickness=0.016)
    for index, (center, radius) in enumerate(spec["pads"]):
        add_needle_pad(scene, f"Pad{index}", center, radius, core, leaf,
                       seed=seed + index * 13.7,
                       count=26, droop=0.20, length_scale=0.78, width_scale=1.40,
                       core_scale=0.85)


# --- ヤブツバキ (camellia) ----------------------------------------------------

_TSUBAKI_VARIANTS = {
    # v1: tight round dome on twin stems.
    1: {
        "stems": (((0.0, 0.0, 0.0), (0.08, 0.05, 0.34)),
                  ((0.04, -0.02, 0.0), (-0.10, -0.06, 0.30))),
        "pads": (((0.02, 0.0, 0.54), 0.32), ((0.24, 0.13, 0.42), 0.25),
                 ((-0.24, -0.13, 0.44), 0.26), ((0.0, -0.20, 0.38), 0.22),
                 ((-0.02, 0.18, 0.40), 0.22), ((0.02, 0.0, 0.30), 0.24)),
    },
    # v2: leaning double lobe (thicket edge form).
    2: {
        "stems": (((0.0, 0.0, 0.0), (-0.12, -0.07, 0.30)),
                  ((0.05, 0.02, 0.0), (0.16, 0.09, 0.26))),
        "pads": (((-0.14, -0.08, 0.50), 0.29), ((0.22, 0.13, 0.42), 0.26),
                 ((0.02, 0.02, 0.60), 0.22), ((-0.06, 0.20, 0.36), 0.20),
                 ((0.06, -0.20, 0.36), 0.20), ((0.04, 0.02, 0.28), 0.22)),
    },
}


def build_yabutsubaki(scene: bpy.types.Scene, variant: int) -> None:
    """ヤブツバキ. Canvas 64x72, anchor 32,60. Matsue's signature understorey:
    low, dense dome of dark glossy evergreen leaves (no bloom — year-round
    texture policy), multi-stemmed like the castle-hill thickets."""
    spec = _TSUBAKI_VARIANTS[variant]
    seed = 1097.0 + variant * 101.0
    bark = make_textured_material("TsubakiBark", (0.128, 0.104, 0.078), (0.202, 0.168, 0.128),
                                  scale=(16.0, 16.0, 4.4))
    core = make_core_material("TsubakiCore", (0.032, 0.062, 0.036), (0.052, 0.094, 0.054))
    # Glossy camellia leaves: roughness 0.45 sparkled into white specks at
    # 64px — keep only a hint of sheen.
    leaf = make_leaf_sprig_material("TsubakiLeaf", (0.024, 0.058, 0.034), (0.076, 0.142, 0.080),
                                    clump_scale=6.5, roughness=0.80)

    add_tree_base(scene, 0.0, 0.0, 0.07, bark, seed=seed, base_scale=0.72)
    for index, (base, tip) in enumerate(spec["stems"]):
        add_beam(scene, f"Stem{index}", base, tip, 0.045, bark, tip_thickness=0.024)
    for index, (center, radius) in enumerate(spec["pads"]):
        add_needle_pad(scene, f"Pad{index}", center, radius, core, leaf,
                       seed=seed + index * 13.7,
                       count=30, droop=0.24, length_scale=0.68, width_scale=1.50,
                       core_scale=0.72)
