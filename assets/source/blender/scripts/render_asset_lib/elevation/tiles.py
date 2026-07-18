"""Elevation tile builders (P4c, docs/10_development/elevation-contract.md).

Cliff faces (natural rock), ishigaki revetments, SE outer corners, slopes
(dirt cutting / stone stairway) and slope side wedges.

Conventions
-----------
- One elevation step = 40 screen px = LEVEL world units of z (5*sqrt(6)/12:
  40 / (PX_PER_UNIT * sin 60deg)), matching the renderer's
  ELEVATION_PIXELS_PER_LEVEL = 40.
- Face / corner tiles: the OWNING (high) cell's top surface plane is z = 0
  and the footprint center is the origin, exactly like a flat terrain tile.
  The face descends to z = -h * LEVEL. Canvas 64 x (32 + 40h), anchor
  (32, 16): the top diamond projects where the cell's surface tile will be
  drawn afterwards, so everything at z >= 0 near the top edge may be
  overdrawn by the surface tile by design.
- Slope tiles: low edge at z = 0, high edge at z = +LEVEL. Canvas 64x72,
  anchor (32, 56) (40 px of headroom above a normal tile).
- Ishigaki walls keep their BASE on the cell boundary and lean back with a
  concave sori profile; the (hidden) physical top edge sits inside the
  diamond where the surface tile covers it. This keeps every canvas within
  the contract size (a base flaring outward would overflow 64x(32+40h)).
"""
from __future__ import annotations

import math

import bpy

from .. import core
from ..core import add_beam, add_box, add_mesh, finish_material, make_material, map_box, map_xy
from ..materials import (
    make_grass_material,
    make_noise_material,
)

LEVEL = 5.0 * math.sqrt(6.0) / 12.0  # world z per elevation step == 40 screen px
BLEED = 0.03  # seam guard along tile joins, same spirit as TERRAIN_BLEED


def _hash01(*values: float) -> float:
    """Deterministic pseudo-random in [0,1) from a few floats."""
    x = 0.0
    for index, value in enumerate(values):
        x += math.sin((value + 1.37) * (12.9898 + 7.77 * index)) * 43758.5453
    return x - math.floor(x)


# --- shared materials --------------------------------------------------------

def _rock_materials() -> list[bpy.types.Material]:
    """Stylized bedrock in three value steps: strata segments pick one each
    so the face reads as layered rock, not coursed masonry."""
    return [
        make_noise_material("CliffRockD", (0.082, 0.075, 0.064), (0.158, 0.146, 0.126), scale=4.0),
        make_noise_material("CliffRockM", (0.140, 0.128, 0.108), (0.262, 0.245, 0.212), scale=4.0),
        make_noise_material("CliffRockL", (0.188, 0.174, 0.150), (0.330, 0.310, 0.270), scale=4.0),
    ]


def _elev_ishigaki_material(name: str = "ElevIshigakiStone") -> bpy.types.Material:
    """Nozura-zumi masonry for the 1-tile revetments: same palette and seam
    treatment as the tenshu's make_ishigaki_material, but with larger stones
    (voronoi 3.4 instead of 5.5) so a 24px-per-step wall reads at the same
    boulder scale as the big keep mound it sits beside."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1.0

    voronoi = nodes.new("ShaderNodeTexVoronoi")
    voronoi.feature = "DISTANCE_TO_EDGE"
    voronoi.inputs["Scale"].default_value = 3.4

    seam_ramp = nodes.new("ShaderNodeValToRGB")
    seam_ramp.color_ramp.elements[0].position = 0.0
    seam_ramp.color_ramp.elements[0].color = (0.22, 0.20, 0.17, 1.0)
    seam_ramp.color_ramp.elements[1].position = 0.09
    seam_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(voronoi.outputs["Distance"], seam_ramp.inputs["Fac"])

    stone_noise = nodes.new("ShaderNodeTexNoise")
    stone_noise.inputs["Scale"].default_value = 2.6
    stone_ramp = nodes.new("ShaderNodeValToRGB")
    stone_ramp.color_ramp.elements[0].position = 0.3
    stone_ramp.color_ramp.elements[0].color = (0.150, 0.130, 0.100, 1.0)
    stone_ramp.color_ramp.elements[1].position = 0.8
    stone_ramp.color_ramp.elements[1].color = (0.265, 0.235, 0.185, 1.0)
    links.new(stone_noise.outputs["Fac"], stone_ramp.inputs["Fac"])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(stone_ramp.outputs["Color"], mix.inputs["A"])
    links.new(seam_ramp.outputs["Color"], mix.inputs["B"])
    if core.CURRENT_STYLE == "pbr":
        links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        finish_material(material, mix.outputs["Result"])
    return material


def _step_stone_material() -> bpy.types.Material:
    """Cut stone slabs for stairways, lighter than the rough ishigaki."""
    return make_noise_material("StepStone", (0.175, 0.165, 0.145), (0.305, 0.290, 0.258), scale=7.0)


def _step_stone_worn_material() -> bpy.types.Material:
    """Foot-polished tread stone: lighter, slightly warm (the walking line)."""
    return make_noise_material("StepStoneWorn", (0.225, 0.212, 0.185), (0.360, 0.342, 0.305), scale=7.0)


def _step_stone_dark_material() -> bpy.types.Material:
    """Damp, shaded slabs along the stair edges."""
    return make_noise_material("StepStoneDark", (0.128, 0.122, 0.106), (0.225, 0.215, 0.192), scale=7.0)


def _quoin_material() -> bpy.types.Material:
    """Dressed sangi-zumi corner stones, a touch lighter than the wall."""
    return make_noise_material("QuoinStone", (0.150, 0.140, 0.118), (0.252, 0.238, 0.205), scale=3.0)


def _moss_material() -> bpy.types.Material:
    return make_material("BaseMoss", (0.078, 0.098, 0.062, 1.0))


def _grass_lip_materials() -> tuple[bpy.types.Material, bpy.types.Material]:
    return (
        make_material("LipGrassD", (0.105, 0.150, 0.070, 1.0)),
        make_material("LipGrassL", (0.158, 0.202, 0.096, 1.0)),
    )


def _root_material() -> bpy.types.Material:
    return make_material("RootWood", (0.088, 0.066, 0.042, 1.0))


# --- face-space helpers ------------------------------------------------------
# Faces live on the S (map y=+0.5) or E (map x=+0.5) boundary of the owning
# cell. "a" runs along the edge in [-0.5, 0.5]; "o" is the inset measured
# INWARD from the boundary (o=0 on the boundary, positive into the cell).

def _face_box(scene, name: str, face: str, a0: float, a1: float,
              o0: float, o1: float, z0: float, z1: float, material) -> None:
    if face == "s":
        low, high = (a0, 0.5 - o1, z0), (a1, 0.5 - o0, z1)
    else:
        low, high = (0.5 - o1, a0, z0), (0.5 - o0, a1, z1)
    add_box(scene, name, *map_box(low, high), material)


def _face_point(face: str, a: float, o: float, z: float) -> tuple[float, float, float]:
    if face == "s":
        return (a, 0.5 - o, z)
    return (0.5 - o, a, z)


def _grass_overhang(scene, face: str, seed: float, count: int = 9, heavy: bool = True,
                    o_base: float = -0.022, z_base: float = -0.002) -> None:
    """Grass fringe drooping over the visible top of a face, plus a couple of
    exposed roots (cliff only).

    Thin slabs hugging the face just below the perceived lip. (o_base,
    z_base) anchor the fringe: vertical cliffs keep the default (cell
    boundary, just under z=0); battered ishigaki passes the sori inset at a
    z low enough not to be covered by the surface tile drawn afterwards."""
    grass_dark, grass_light = _grass_lip_materials()
    root = _root_material()
    for index in range(count):
        t = -0.46 + 0.92 * index / max(1, count - 1)
        a = t + 0.04 * (_hash01(seed, index, 1.0) - 0.5)
        width = 0.09 + 0.09 * _hash01(seed, index, 2.0)
        droop = 0.035 + 0.075 * _hash01(seed, index, 3.0)
        material = grass_dark if _hash01(seed, index, 6.0) < 0.6 else grass_light
        _face_box(scene, f"Tuft{face}{index}", face, a - width / 2.0, a + width / 2.0,
                  o_base, o_base + 0.026, z_base - droop, z_base, material)
    if heavy:
        for index in range(2):
            a = -0.25 + 0.55 * index + 0.1 * _hash01(seed, index, 4.0)
            tip_out = 0.06 + 0.03 * _hash01(seed, index, 5.0)
            start = _face_point(face, a, o_base + 0.027, z_base - 0.06)
            end = _face_point(face, a + 0.05, o_base - tip_out, z_base - 0.22)
            add_beam(scene, f"Root{face}{index}", start, end, 0.026, root, tip_thickness=0.010)


# --- cliff (natural rock) ----------------------------------------------------

def _band_layout(h: int, seed: float) -> list[tuple[float, float, float, int]]:
    """Irregular strata: list of (z0, z1, base_inset, tone) from bottom to top.

    Band heights vary, the top band hugs the cell boundary (o~0) so it meets
    the surface tile, lower bands jitter inward. Adjacent bands with
    different insets produce lit ledges (band tops) and shadowed overhangs
    under the fixed painterly light."""
    depth = h * LEVEL
    n_bands = 4 * h
    weights = [0.65 + 0.7 * _hash01(seed, band, 21.0) for band in range(n_bands)]
    total = sum(weights)
    layout: list[tuple[float, float, float, int]] = []
    z = -depth
    for band in range(n_bands):
        z0 = z
        z = min(0.0, z + depth * weights[band] / total)
        z1 = 0.0 if band == n_bands - 1 else min(0.0, z + 0.012)
        top_band = band == n_bands - 1
        base = 0.012 * _hash01(seed, band, 23.0) if top_band else 0.025 + 0.115 * _hash01(seed, band, 11.0)
        tone = int(3.0 * _hash01(seed, band, 22.0)) % 3
        layout.append((z0, z1, base, tone))
    return layout


def _cliff_wall(scene, face: str, h: int, rocks, seed: float,
                a_end_fn=None) -> None:
    """One rock wall along a face. a_end_fn(inset) clips the far (corner)
    end per band so the corner piece can interlock its two walls."""
    for band, (z0, z1, base, tone) in enumerate(_band_layout(h, seed)):
        top_band = z1 >= 0.0
        segments = 3 + int(2.0 * _hash01(seed, band, 31.0))
        a_start = -0.5 - 0.02
        a_stop = 0.5 + 0.02 if a_end_fn is None else a_end_fn(base)
        span = a_stop - a_start
        # Staggered joints: jittered per band so segments do not align in
        # columns (which would read as coursed masonry).
        offsets = sorted(_hash01(seed, band, 41.0 + k) for k in range(segments - 1))
        cuts = [a_start] + [a_start + span * o for o in offsets] + [a_stop]
        for seg in range(segments):
            a0, a1 = cuts[seg], cuts[seg + 1] + 0.004
            if a1 - a0 < 0.03:
                continue
            inset = base if top_band else max(0.012, min(0.19, base + 0.09 * (_hash01(seed, band, seg) - 0.5)))
            # Tone drifts per SEGMENT around the band's tone so joints read
            # as broken rock, not running masonry courses.
            seg_tone = tone
            roll = _hash01(seed, band, 61.0 + seg)
            if roll > 0.72:
                seg_tone = min(2, tone + 1)
            elif roll < 0.28:
                seg_tone = max(0, tone - 1)
            _face_box(scene, f"Rock{face}{band}{seg}", face, a0, a1,
                      inset, inset + 0.19, z0, z1, rocks[seg_tone])


def build_cliff_face(scene: bpy.types.Scene, face: str, h: int) -> None:
    """Natural rock cliff, S or E face, h steps tall. Canvas 64x(32+40h),
    anchor (32,16)."""
    rocks = _rock_materials()
    seed = (1.0 if face == "s" else 2.0) + 10.0 * h
    _cliff_wall(scene, face, h, rocks, seed)
    _grass_overhang(scene, face, seed)


def build_cliff_corner(scene: bpy.types.Scene, h: int) -> None:
    """SE outer corner of a rock cliff: complete replacement piece carrying
    BOTH the S and the E face of the owning cell (draw it INSTEAD of
    face.s + face.e when both edges drop by h)."""
    rocks = _rock_materials()
    seed_s, seed_e = 3.0 + 10.0 * h, 4.0 + 10.0 * h
    _cliff_wall(scene, "s", h, rocks, seed_s)
    _cliff_wall(scene, "e", h, rocks, seed_e)
    # Craggy buttress softening the arris where the two jittered walls meet.
    depth = h * LEVEL
    n_blocks = 3 * h + 1
    for block in range(n_blocks):
        z0 = -depth + depth * block / n_blocks
        z1 = min(0.0, z0 + depth / n_blocks + 0.01)
        o_s = 0.010 + 0.06 * _hash01(seed_s, block, 51.0)
        o_e = 0.010 + 0.06 * _hash01(seed_e, block, 51.0)
        size = 0.16 + 0.06 * _hash01(seed_s, block, 52.0)
        tone = int(3.0 * _hash01(seed_e, block, 53.0)) % 3
        low = (0.5 - o_e - size, 0.5 - o_s - size, z0)
        high = (0.5 - o_e, 0.5 - o_s, z1)
        add_box(scene, f"Arris{block}", *map_box(low, high), rocks[tone])
    _grass_overhang(scene, "s", seed_s, count=5)
    _grass_overhang(scene, "e", seed_e, count=5)


# --- ishigaki (castle revetment) ---------------------------------------------
# Kirikomi-hagi: precisely dressed stones laid in level courses (nuno-zumi).
# Horizontal bed joints run through, vertical joints break bond course to
# course. Each stone is its own slightly tilted quad riding proud of a dark
# joint backing, so the fixed painterly light gives every block its own tone
# and the recessed joints pick up AO as thin dark mortar lines.

ISHIGAKI_BATTER = 0.30  # top inset as a fraction of the wall height (sori)
SORI_ROWS = 6

KIRI_COURSE = LEVEL / 5.0  # one masonry course == 8 screen px
KIRI_GAP = 0.016           # vertical head joint width (~1 screen px)
KIRI_BED = 0.015           # horizontal bed joint width (~1 screen px)
KIRI_LIP = 0.012           # stones sit this far proud of the joint backing


def _kirikomi_stone_materials() -> list[bpy.types.Material]:
    """Dressed-granite palette in five close value steps (low chroma, faintly
    warm, after the tenshu mound). Stones pick one each so the wall carries
    the subtle per-block colour drift of fitted masonry."""
    specs = [
        ("KiriStone0", (0.140, 0.128, 0.106), (0.240, 0.222, 0.186)),
        ("KiriStone1", (0.162, 0.148, 0.122), (0.270, 0.250, 0.208)),
        ("KiriStone2", (0.178, 0.160, 0.130), (0.294, 0.268, 0.220)),
        ("KiriStone3", (0.194, 0.178, 0.150), (0.318, 0.296, 0.248)),
        ("KiriStone4", (0.156, 0.150, 0.134), (0.260, 0.250, 0.222)),
    ]
    return [make_noise_material(name, dark, light, scale=9.0) for name, dark, light in specs]


def _kirikomi_weathered_materials() -> tuple[bpy.types.Material, bpy.types.Material]:
    """Aging: rain-damp blocks (cool, dark) and moss-stained blocks (green
    cast) that replace ordinary stones toward the foot of the wall."""
    damp = make_noise_material("KiriDamp", (0.096, 0.096, 0.088), (0.186, 0.184, 0.168), scale=9.0)
    mossy = make_noise_material("KiriMossy", (0.094, 0.112, 0.074), (0.186, 0.202, 0.142), scale=9.0)
    return damp, mossy


def _kirikomi_joint_material() -> bpy.types.Material:
    """Deep shadow tone for the mortar backing behind the stones."""
    return make_material("KiriJoint", (0.050, 0.047, 0.041, 1.0))


def _kirikomi_quoin_material() -> bpy.types.Material:
    """Sangi-zumi corner blocks: dressed, a clear step lighter than the wall
    so the alternating long/short bond reads at 64 px."""
    return make_noise_material("KiriQuoin", (0.176, 0.166, 0.144), (0.292, 0.276, 0.240), scale=5.0)


def _sori_inset(s: float, height: float) -> float:
    """Concave ishigaki profile: vertical at the top, flaring at the base.
    s runs 0 (base, on the cell boundary) .. 1 (top)."""
    return ISHIGAKI_BATTER * height * (1.0 - (1.0 - s) ** 2)


def _ishigaki_strip(scene, name: str, face: str, h: int, stone,
                    a_start: float, a_end_fn, rows: int | None = None) -> None:
    """Battered wall strip along one face. a_end_fn(inset) gives the far end
    of each row so the corner piece can taper both walls onto the arris.
    `rows` overrides the sori subdivision: the kirikomi joint backing must
    hug the curve closely (chord error grows with h and would poke through
    the stone lip on tall walls)."""
    height = h * LEVEL
    n_rows = SORI_ROWS if rows is None else rows
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for k in range(n_rows + 1):
        s = k / n_rows
        inset = _sori_inset(s, height)
        z = -height + height * s
        p0 = _face_point(face, a_start, inset, z)
        p1 = _face_point(face, a_end_fn(inset), inset, z)
        vertices.append((*map_xy(p0[0], p0[1]), p0[2]))
        vertices.append((*map_xy(p1[0], p1[1]), p1[2]))
        if k > 0:
            base = 2 * (k - 1)
            faces.append((base, base + 1, base + 3, base + 2))
    add_mesh(scene, name, vertices, faces, stone)


def _ishigaki_base_moss(scene, face: str, h: int, a0: float, a1: float) -> None:
    """Damp moss line where the wall meets the lower ground (aging)."""
    height = h * LEVEL
    moss = _moss_material()
    _face_box(scene, f"Moss{face}", face, a0, a1, -0.008, 0.0, -height, -height + 0.06, moss)


def _ishigaki_fringe_anchor(h: int) -> tuple[float, float]:
    """(o_base, z_base) putting the grass fringe on the battered wall surface
    just below the screen line where the surface tile stops covering it."""
    height = h * LEVEL
    z_base = -0.18 * height
    o_base = _sori_inset(1.0 + z_base / height, height) - 0.022
    return o_base, z_base


def _kirikomi_stone(scene, name: str, face: str, a0: float, a1: float,
                    z0: float, z1: float, height: float, material,
                    seed: float, j: float, k: float) -> None:
    """One dressed stone: a PLANAR quad tangent to the sori surface at the
    stone's centre, pushed KIRI_LIP proud of the joint backing. The tangent
    plane is tipped a touch about both axes so each block's normal differs
    from its neighbours' — under the painterly dot(N,L) ramp that reads as
    the individual facing of every fitted stone. Planarity matters: a quad
    with independently jittered corners splits into two triangles whose
    tones diverge hard near the shading terminator (black wedge artifacts
    on the tall south faces)."""
    a_c = 0.5 * (a0 + a1)
    z_c = 0.5 * (z0 + z1)
    s_c = max(0.0, min(1.0, 1.0 + z_c / height))
    o_c = _sori_inset(s_c, height) - KIRI_LIP
    # d(inset)/dz of the sori profile at the stone centre.
    slope_z = 2.0 * ISHIGAKI_BATTER * (1.0 - s_c)
    tilt_a = 0.055 * (_hash01(seed, j, 71.0 + k) - 0.5)  # twist about vertical
    tilt_z = 0.055 * (_hash01(seed, j, 72.0 + k) - 0.5)  # pitch about horizontal
    vertices: list[tuple[float, float, float]] = []
    for a, z in ((a0, z0), (a1, z0), (a0, z1), (a1, z1)):
        o = o_c + (slope_z + tilt_z) * (z - z_c) + tilt_a * (a - a_c)
        p = _face_point(face, a, o, z)
        vertices.append((*map_xy(p[0], p[1]), p[2]))
    add_mesh(scene, name, vertices, [(0, 1, 3, 2)], material)


def _kirikomi_wall(scene, face: str, h: int, a_end_fn=None, backing=None) -> None:
    """Coursed kirikomi-hagi masonry along one battered face.

    Course heights are exact (KIRI_COURSE == 8 px) and the head-joint layout
    depends only on (face, course index), so stacked or abutting tiles of any
    h continue the same coursing without seams. a_end_fn(inset) clips each
    course at the corner arris for the corner piece; `backing` overrides the
    near-black joint backing (the tall corner's taper collapses past the
    tile edge, so its exposed backing must read as stone, not mortar)."""
    height = h * LEVEL
    stones = _kirikomi_stone_materials()
    damp, mossy = _kirikomi_weathered_materials()
    joint = backing if backing is not None else _kirikomi_joint_material()
    seed = 5.0 if face == "s" else 6.0
    _ishigaki_strip(scene, f"Joint{face}", face, h, joint, -0.5 - BLEED,
                    a_end_fn if a_end_fn is not None else (lambda inset: 0.5 + BLEED))
    n_courses = 5 * h
    a_min = -0.5 - BLEED
    for j in range(n_courses):
        z1 = -j * KIRI_COURSE
        z0 = z1 - KIRI_COURSE + KIRI_BED
        if a_end_fn is None:
            a_stop = 0.5 + BLEED
        else:
            s_mid = max(0.0, min(1.0, 1.0 + 0.5 * (z0 + z1) / height))
            a_stop = a_end_fn(_sori_inset(s_mid, height))
        # Running bond: the start shift alternates course to course so the
        # vertical joints break bond instead of stacking into columns.
        shift = 0.16 + 0.24 * _hash01(seed, j, 81.0)
        a = a_min - shift
        k = 0
        while a < a_stop - 0.02:
            width = 0.24 + 0.16 * _hash01(seed, j, 90.0 + 7.0 * k)
            a0 = max(a_min, a)
            a1 = min(a_stop, a + width - KIRI_GAP)
            if a1 - a0 > 0.03:
                roll = _hash01(seed, j, 60.0 + 5.0 * k)
                material = stones[int(roll * 5.0) % 5]
                # Aging gradient: damp then mossy blocks thicken toward the
                # foot of the wall where rain and ground moisture linger.
                depth = j / max(1, n_courses - 1)
                age = _hash01(seed, j, 70.0 + 3.0 * k)
                if depth > 0.75 and age < 0.12 + 0.30 * (depth - 0.75) / 0.25:
                    material = mossy
                elif depth > 0.5 and age > 0.85 - 0.40 * (depth - 0.5) / 0.5:
                    material = damp
                _kirikomi_stone(scene, f"Stone{face}{j}_{k}", face, a0, a1,
                                z0, z1, height, material, seed, float(j), float(k))
            a += width
            k += 1


def build_ishigaki_face(scene: bpy.types.Scene, face: str, h: int) -> None:
    """Kirikomi-hagi ishigaki, S or E face, h steps tall: dressed stones in
    level courses with breaking head joints on the sori batter of the tenshu
    mound. Canvas 64x(32+40h), anchor (32,16)."""
    _kirikomi_wall(scene, face, h)
    _ishigaki_base_moss(scene, face, h, -0.5 - BLEED, 0.5 + BLEED)
    seed = (5.0 if face == "s" else 6.0) + 10.0 * h
    o_base, z_base = _ishigaki_fringe_anchor(h)
    _grass_overhang(scene, face, seed, count=5, heavy=False, o_base=o_base, z_base=z_base)


def build_ishigaki_corner(scene: bpy.types.Scene, h: int) -> None:
    """SE outer ishigaki corner with sangi-zumi quoins: complete replacement
    piece carrying BOTH faces (draw INSTEAD of face.s + face.e)."""
    quoin = _kirikomi_quoin_material()
    height = h * LEVEL

    # Both coursed walls taper onto the shared arris (x = y = 0.5 - inset(s)).
    # Dark-stone backing: on h4/h5 the taper collapses past the tile edge and
    # exposes bare backing near the top, which must stay stone-toned.
    core_stone = make_noise_material("KiriCore", (0.098, 0.093, 0.082), (0.164, 0.156, 0.138), scale=4.0)
    _kirikomi_wall(scene, "s", h, a_end_fn=lambda inset: 0.5 - inset, backing=core_stone)
    _kirikomi_wall(scene, "e", h, a_end_fn=lambda inset: 0.5 - inset, backing=core_stone)
    _ishigaki_base_moss(scene, "s", h, -0.5 - BLEED, 0.5)
    _ishigaki_base_moss(scene, "e", h, -0.5 - BLEED, 0.5)

    # Sangi-zumi: alternating long/short dressed stones down the arris,
    # following the sori profile and protruding slightly past both faces.
    # The inset is sampled at the BOTTOM of each course so the stone never
    # floats in front of the flaring wall below it.
    n_quoins = 4 * h
    for j in range(n_quoins):
        s0 = j / n_quoins
        s1 = (j + 1) / n_quoins
        z0 = -height + height * s0
        z1 = -height + height * s1
        corner = 0.5 - _sori_inset(s0, height)
        out = corner + 0.022
        long_side = 0.23 + 0.04 * _hash01(7.0, j, h)
        if j % 2 == 0:
            low = (corner - long_side, corner - 0.11, z0)
            high = (out, out, z1 + 0.004)
        else:
            low = (corner - 0.11, corner - long_side, z0)
            high = (out, out, z1 + 0.004)
        add_box(scene, f"Quoin{j}", *map_box(low, high), quoin)

    o_base, z_base = _ishigaki_fringe_anchor(h)
    _grass_overhang(scene, "s", 8.0 + h, count=3, heavy=False, o_base=o_base, z_base=z_base)
    _grass_overhang(scene, "e", 9.0 + h, count=3, heavy=False, o_base=o_base, z_base=z_base)


# --- slopes ------------------------------------------------------------------
# Slope space: u runs 0 (low boundary) .. 1 (high boundary), v across the
# ramp in [-0.5, 0.5]. z(u) = u * LEVEL for a full 1-cell slope; gentle
# 2-cell slope halves remap z to [0, LEVEL/2] (lower) / [LEVEL/2, LEVEL]
# (upper) so the pair climbs one step over two cells (20px rise per cell).

def _slope_axes(toward: str):
    if toward == "n":
        return lambda u, v: (v, 0.5 - u)
    if toward == "s":
        return lambda u, v: (v, -0.5 + u)
    if toward == "e":
        return lambda u, v: (-0.5 + u, v)
    return lambda u, v: (0.5 - u, v)


def _slope_z_of(half: str | None):
    """z(u) along the ramp axis for a full slope or a gentle half tile."""
    if half == "lower":
        return lambda u: 0.5 * LEVEL * u
    if half == "upper":
        return lambda u: 0.5 * LEVEL * (1.0 + u)
    return lambda u: u * LEVEL


def _slope_quad(scene, name: str, pt, u0: float, u1: float, v0: float, v1: float,
                lift: float, material, z_of=None) -> None:
    """Quad following the slope surface, lifted `lift` above it."""
    if z_of is None:
        z_of = _slope_z_of(None)
    corners = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    vertices = [(*map_xy(*pt(u, v)), z_of(u) + lift) for u, v in corners]
    add_mesh(scene, name, vertices, [(0, 1, 2, 3)], material)


def _slope_relief_surface(scene, name: str, pt, seed: float, material,
                          nu: int = 9, nv: int = 7, z_of=None) -> None:
    """Slope surface as a jittered grid instead of one flat quad.

    The painterly shader tones a face purely by its normal, so a single
    plane renders as one flat facet ("polygon look"). Jittering the interior
    vertices breaks the plane into subtly tilted quads whose tones drift
    like brush patches. Boundary vertices stay exactly on the analytic
    slope so the tile still meets its neighbours flush."""
    if z_of is None:
        z_of = _slope_z_of(None)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for i in range(nu + 1):
        u = -BLEED + (1.0 + 2.0 * BLEED) * i / nu
        for j in range(nv + 1):
            v = -0.5 - BLEED + (1.0 + 2.0 * BLEED) * j / nv
            bump = 0.0
            if 0 < i < nu and 0 < j < nv:
                # Two octaves of deterministic jitter + a shallow trodden
                # dish along the walking centerline.
                bump = (
                    0.030 * (_hash01(seed, i, j) - 0.5)
                    + 0.020 * (_hash01(seed, i * 2.3, j * 3.7) - 0.5)
                    - 0.014 * max(0.0, 1.0 - (v / 0.40) ** 2)
                )
            vertices.append((*map_xy(*pt(u, v)), z_of(u) + bump))
            if i > 0 and j > 0:
                a = (i - 1) * (nv + 1) + (j - 1)
                b = (i - 1) * (nv + 1) + j
                c = i * (nv + 1) + j
                d = i * (nv + 1) + (j - 1)
                faces.append((a, b, c, d))
    add_mesh(scene, name, vertices, faces, material)


def _slope_side_walls(scene, pt, material, floor_material, z_of=None) -> None:
    """Closing geometry for the open slope wedge.

    Only the CAMERA-FACING flank (v=+0.5, which is always the S or E
    boundary for every `toward`) gets a wall: with the fixed camera the far
    flank is only ever seen from behind, and its unlit backface used to
    paint a near-black triangle over the neighbouring tile. A floor quad at
    z~0 catches the remaining sightlines under the surface sheet so nothing
    inside the wedge renders as a dark void. The flank projects into the
    slope's own diamond, so same-level neighbours drawn later cover it and
    it only shows where the terrain beside the ramp is lower. Gentle upper
    halves start above z=0, so their flank is a quad dropping to the cell's
    base level instead of the full slope's triangle."""
    if z_of is None:
        z_of = _slope_z_of(None)
    v = 0.5 + BLEED
    z_low = z_of(0.0)
    z_high = z_of(1.0)
    if z_low > 0.001:
        vertices = [
            (*map_xy(*pt(-BLEED, v)), z_low),
            (*map_xy(*pt(1.0 + BLEED, v)), z_high),
            (*map_xy(*pt(1.0 + BLEED, v)), 0.0),
            (*map_xy(*pt(-BLEED, v)), 0.0),
        ]
        add_mesh(scene, "SideWall", vertices, [(0, 1, 2, 3)], material)
        # End cap closing the raised downhill cross-section (upper half tile):
        # in game the lower half tile meets this edge flush, but the isolated
        # render must not show an open dark interior there.
        cap = [
            (*map_xy(*pt(-BLEED, -0.5 - BLEED)), 0.0),
            (*map_xy(*pt(-BLEED, 0.5 + BLEED)), 0.0),
            (*map_xy(*pt(-BLEED, 0.5 + BLEED)), z_low),
            (*map_xy(*pt(-BLEED, -0.5 - BLEED)), z_low),
        ]
        add_mesh(scene, "LowEndCap", cap, [(0, 1, 2, 3)], material)
    else:
        vertices = [
            (*map_xy(*pt(-BLEED, v)), 0.0),
            (*map_xy(*pt(1.0 + BLEED, v)), z_high),
            (*map_xy(*pt(1.0 + BLEED, v)), 0.0),
        ]
        add_mesh(scene, "SideWall", vertices, [(0, 1, 2)], material)
    floor = [
        (*map_xy(*pt(-BLEED, -0.5 - BLEED)), -0.004),
        (*map_xy(*pt(1.0 + BLEED, -0.5 - BLEED)), -0.004),
        (*map_xy(*pt(1.0 + BLEED, 0.5 + BLEED)), -0.004),
        (*map_xy(*pt(-BLEED, 0.5 + BLEED)), -0.004),
    ]
    add_mesh(scene, "WedgeFloor", floor, [(0, 1, 2, 3)], floor_material)


def build_slope_dirt(scene: bpy.types.Scene, toward: str, half: str | None = None) -> None:
    """Dirt cutting (mountain path) climbing one step toward `toward`.
    Canvas 64x72, anchor (32,56).

    `half` = None renders the legacy steep 1-cell cutting (full 40px rise).
    `half` = "lower" / "upper" renders one cell of the gentle 2-cell cutting:
    the same art language with the gradient halved (20px rise per cell);
    the lower tile melts into the meadow at its toe, the upper tile caps
    into the high ground, and the shared boundary stays bare dirt so the
    pair reads as one continuous path.

    Material layering (low→high u):
    - Slope face: warm-earth noise dirt on a JITTERED relief grid — a flat
      quad under the normal-driven painterly shader reads as one polygon
      facet; the relief breaks it into hand-painted tonal patches.
    - Shoulders: darker margin strips framing the path.
    - Erosion ribs: five footholds stepping up the incline.
    - Grass cap at the top edge + grass tongues at the low corners so both
      ends melt into the grassy terrain instead of ending on a straight cut.
    """
    pt = _slope_axes(toward)
    z_of = _slope_z_of(half)
    seed = {"n": 101.0, "e": 102.0, "s": 103.0, "w": 104.0}[toward]
    seed += {"lower": 20.0, "upper": 40.0}.get(half or "", 0.0)
    # Richer warm-earth noise: two-stop value spread.
    dirt = make_noise_material("SlopeDirt", (0.120, 0.090, 0.055), (0.295, 0.230, 0.145), scale=8.0)
    margin = make_material("SlopeMargin", (0.082, 0.062, 0.040, 1.0))
    rib = make_material("SlopeRib", (0.088, 0.066, 0.042, 1.0))
    stone = make_noise_material("SlopeStone", (0.108, 0.100, 0.090), (0.172, 0.162, 0.146), scale=6.0)
    flank = make_noise_material("SlopeFlank", (0.105, 0.085, 0.060), (0.205, 0.172, 0.126), scale=7.0)
    grass = make_grass_material()
    grass_dark, grass_light = _grass_lip_materials()

    _slope_relief_surface(scene, "Surface", pt, seed, dirt, z_of=z_of)
    _slope_side_walls(scene, pt, flank, dirt, z_of=z_of)
    # Worn shoulders framing the trodden center (broken into jittered strips
    # so the margin line does not read as a ruled edge).
    for side_index, (v0, v1) in enumerate(((-0.5 - BLEED, -0.40), (0.40, 0.5 + BLEED))):
        n_strips = 4
        for strip in range(n_strips):
            u0 = -BLEED + (1.0 + BLEED) * strip / n_strips
            u1 = -BLEED + (1.0 + BLEED) * (strip + 1) / n_strips + 0.01
            dv = 0.05 * (_hash01(seed, side_index, 40.0 + strip) - 0.5)
            _slope_quad(scene, f"Margin{side_index}_{strip}", pt, u0, u1,
                        v0 + (dv if side_index == 0 else 0.0),
                        v1 + (dv if side_index == 1 else 0.0), 0.005, margin, z_of=z_of)
    # Erosion lips across the path: thin, jittered, off-centre shadow bands
    # (not planks — just the shadow line each trodden foothold casts).
    for index, u in enumerate((0.16, 0.34, 0.52, 0.70, 0.88)):
        jitter = 0.04 * (_hash01(seed, index, 1.0) - 0.5)
        width = 0.26 + 0.14 * _hash01(seed, index, 4.0)
        v_mid = 0.10 * (_hash01(seed, index, 9.0) - 0.5)
        _slope_quad(scene, f"Rib{index}", pt, u + jitter, u + jitter + 0.032,
                    v_mid - width, v_mid + width, 0.012, rib, z_of=z_of)
    # A few half-buried stones along the shoulders.
    for index in range(4):
        u = 0.12 + 0.70 * _hash01(seed, index, 5.0)
        v = (-0.36 if index % 2 == 0 else 0.30) + 0.10 * _hash01(seed, index, 2.0)
        size = 0.035 + 0.03 * _hash01(seed, index, 3.0)
        x, y = pt(u, v)
        z = z_of(u)
        add_box(scene, f"PathStone{index}",
                *map_box((x - size, y - size, z - 0.03), (x + size, y + size, z + 0.024)), stone)
    # Grass cap: blends the top edge into the flat terrain tile above. The
    # ragged second row of tufts keeps the dirt/grass line from ruling.
    # A gentle LOWER half keeps its top edge bare dirt instead — it hands the
    # path over to the upper half tile, not to grass.
    if half != "lower":
        _slope_quad(scene, "GrassCap", pt, 0.90, 1.0 + BLEED, -0.5 - BLEED, 0.5 + BLEED, 0.008, grass, z_of=z_of)
        for index in range(6):
            v = -0.42 + 0.84 * index / 5.0 + 0.05 * (_hash01(seed, index, 6.0) - 0.5)
            depth = 0.05 + 0.06 * _hash01(seed, index, 7.0)
            _slope_quad(scene, f"CapTuft{index}", pt, 0.90 - depth, 0.92,
                        v - 0.05, v + 0.05, 0.009,
                        grass_dark if index % 2 == 0 else grass_light, z_of=z_of)
    # Grass tongues at the low corners: the path narrows into the meadow
    # instead of arriving as a full-width straight cut. Ragged inner edge.
    # A gentle UPPER half starts mid-climb on bare dirt — no meadow tongues.
    if half != "upper":
        for side_index, (v0, v1) in enumerate(((-0.5 - BLEED, -0.30), (0.30, 0.5 + BLEED))):
            depth = 0.10 + 0.08 * _hash01(seed, side_index, 8.0)
            _slope_quad(scene, f"ToeGrass{side_index}", pt, -BLEED, depth, v0, v1, 0.006, grass, z_of=z_of)
            for tuft in range(3):
                tv = v0 + (v1 - v0) * (0.15 + 0.35 * tuft)
                td = depth * (0.4 + 0.6 * _hash01(seed, side_index, 50.0 + tuft))
                _slope_quad(scene, f"ToeTuft{side_index}_{tuft}", pt, td - 0.02, td + 0.06,
                            tv - 0.05, tv + 0.05, 0.008,
                            grass_dark if (side_index + tuft) % 2 == 0 else grass_light, z_of=z_of)


def build_slope_ishigaki(scene: bpy.types.Scene, toward: str) -> None:
    """Stone stairway (登城路の石段) climbing one step toward `toward`.
    Canvas 64x72, anchor (32,56).

    Eight slab courses of 5px rise between flanking curb stones (袖石), with
    foot-polished light treads on the walking line, damp dark slabs at the
    edges, moss in the riser joints and a landing slab that bleeds onto the
    high tile so the stairhead visibly grips the upper ground."""
    pt = _slope_axes(toward)
    seed = {"n": 111.0, "e": 112.0, "s": 113.0, "w": 114.0}[toward]
    stone = _step_stone_material()
    worn = _step_stone_worn_material()
    dark = _step_stone_dark_material()
    curb = _quoin_material()
    moss = _moss_material()

    n_steps = 8
    curb_v = 0.40  # treads run between the two curb lines
    for k in range(n_steps):
        u0 = k / n_steps - (BLEED if k == 0 else 0.02)
        u1 = (k + 1) / n_steps + (BLEED if k == n_steps - 1 else 0.0)
        z_top = LEVEL * (k + 1) / n_steps
        # Each course is 3 slabs with jittered joints (aged, hand-fit).
        cuts = [-curb_v, -curb_v + 0.26 + 0.10 * _hash01(seed, k, 1.0),
                curb_v - 0.24 - 0.10 * _hash01(seed, k, 2.0), curb_v]
        for slab in range(3):
            v0, v1 = cuts[slab], cuts[slab + 1]
            if v1 - v0 < 0.05:
                continue
            du = 0.012 * (_hash01(seed, k, 3.0 + slab) - 0.5)
            # Walking line: the centre slab is foot-polished light; edge
            # slabs stay mid grey with occasional damp-dark ones.
            if slab == 1:
                material = worn if _hash01(seed, k, 9.0) > 0.25 else stone
            else:
                roll = _hash01(seed, k, 10.0 + slab)
                material = dark if roll > 0.65 else stone
            x0, y0 = pt(u0 + du, v0)
            x1, y1 = pt(u1 + du, v1)
            low = (min(x0, x1), min(y0, y1), 0.0)
            high = (max(x0, x1), max(y0, y1), z_top - 0.006 * (slab % 2))
            add_box(scene, f"Step{k}{slab}", *map_box(low, high), material)
        # Moss line hugging the base of this course's riser (skip some).
        if k > 0 and _hash01(seed, k, 20.0) > 0.45:
            mv = -0.30 + 0.55 * _hash01(seed, k, 21.0)
            mx0, my0 = pt(u0 - 0.008, mv)
            mx1, my1 = pt(u0 + 0.020, mv + 0.14 + 0.10 * _hash01(seed, k, 22.0))
            z_base = LEVEL * k / n_steps
            add_box(scene, f"StepMoss{k}",
                    *map_box((min(mx0, mx1), min(my0, my1), z_base + 0.001),
                             (max(mx0, mx1), max(my0, my1), z_base + 0.030)), moss)

    # Landing slab: overlaps the high tile's near edge so the stairhead is
    # welded onto the upper ground instead of stopping at the boundary line.
    lx0, ly0 = pt(1.0 - 0.01, -curb_v)
    lx1, ly1 = pt(1.0 + 0.06, curb_v)
    add_box(scene, "Landing",
            *map_box((min(lx0, lx1), min(ly0, ly1), LEVEL - 0.05),
                     (max(lx0, lx1), max(ly0, ly1), LEVEL + 0.004)), worn)

    # Flanking curb strips (袖石): continuous slanted stone rails framing the
    # stairway. A smooth diagonal silhouette reads as the stair's side
    # revetment; stepped blocks here would read as battlements. The top
    # follows the slope a small lip above the treads; the outer face drops
    # vertically to the ground so an exposed flank shows masonry.
    for side_index, (v_out, v_in) in enumerate(((-0.5 - BLEED, -curb_v), (0.5 + BLEED, curb_v))):
        segments = 6
        vertices: list[tuple[float, float, float]] = []
        faces: list[tuple[int, ...]] = []
        for i in range(segments + 1):
            u = -BLEED + (1.0 + 2.0 * BLEED) * i / segments
            lip = 0.028 + 0.010 * _hash01(seed, i, 30.0 + side_index)
            z_top = max(0.0, min(1.0, u)) * LEVEL + lip
            for (vv, zz) in ((v_in, z_top), (v_out, z_top), (v_out, 0.0), (v_in, 0.0)):
                vertices.append((*map_xy(*pt(u, vv)), zz))
            if i > 0:
                b = 4 * (i - 1)
                faces.append((b + 0, b + 1, b + 5, b + 4))  # top
                faces.append((b + 1, b + 2, b + 6, b + 5))  # outer wall
                faces.append((b + 3, b + 0, b + 4, b + 7))  # inner lip wall
        # End caps so the rail ends do not show hollow cross-sections.
        faces.append((0, 1, 2, 3))
        b = 4 * segments
        faces.append((b + 3, b + 2, b + 1, b + 0))
        add_mesh(scene, f"Curb{side_index}", vertices, faces, curb)
    # Moss at the curb foot on the shaded side.
    mx0, my0 = pt(0.02, -curb_v - 0.06)
    mx1, my1 = pt(0.30, -curb_v - 0.02)
    add_box(scene, "CurbMoss",
            *map_box((min(mx0, mx1), min(my0, my1), 0.001),
                     (max(mx0, mx1), max(my0, my1), 0.05)), moss)


def build_slope(scene: bpy.types.Scene, skin: str, toward: str) -> None:
    if skin == "dirt":
        build_slope_dirt(scene, toward)
    else:
        build_slope_ishigaki(scene, toward)


def build_slope_half(scene: bpy.types.Scene, skin: str, toward: str, half: str) -> None:
    """Gentle 2-cell slope half tile (20px rise per cell). Dirt only for now;
    the ishigaki stairway stays a steep 1-cell asset by design."""
    if skin != "dirt":
        raise ValueError(f"gentle slope halves are only produced for the dirt skin, got: {skin}")
    if half not in ("lower", "upper"):
        raise ValueError(f"unknown slope half: {half}")
    build_slope_dirt(scene, toward, half)


# --- slope side wedges -------------------------------------------------------

def build_slope_side(scene: bpy.types.Scene, skin: str, toward: str, side: str) -> None:
    """Triangular cheek wall under a slope's open flank (drawn when the cell
    beside the ramp sits at the slope's base level). side "e" = wall on the
    ramp's map x=+0.5 boundary, side "s" = map y=+0.5 boundary.
    Canvas 64x72, anchor (32,56)."""
    # Height profile along the boundary, in the boundary's own coordinate t.
    if side == "e":
        edge_point = lambda t, o, z: (0.5 - o, t, z)
        rising = toward == "s"  # z grows toward t=+0.5?
    else:
        edge_point = lambda t, o, z: (t, 0.5 - o, z)
        rising = toward == "e"

    def z_top(t: float) -> float:
        s = (t + 0.5) if rising else (0.5 - t)
        return LEVEL * max(0.0, min(1.0, s))

    grass_dark, grass_light = _grass_lip_materials()
    if skin == "dirt":
        # Same lightened earth as the ramp's built-in flank (the old
        # bank material rendered near-black under the painterly ramp).
        material = make_noise_material("SlopeFlank", (0.105, 0.085, 0.060), (0.205, 0.172, 0.126), scale=7.0)
        batter = 0.0
    else:
        material = _elev_ishigaki_material()
        batter = 0.22  # top inset fraction of local height, scaled so the
        # zero-height end stays exactly on the boundary corner.

    steps = 8
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for i in range(steps + 1):
        t = -0.5 - BLEED + (1.0 + 2 * BLEED) * i / steps
        height = z_top(max(-0.5, min(0.5, t)))
        top = edge_point(t, batter * height, height)
        bottom = edge_point(t, 0.0, 0.0)
        vertices.append((*map_xy(top[0], top[1]), top[2]))
        vertices.append((*map_xy(bottom[0], bottom[1]), bottom[2]))
        if i > 0:
            base = 2 * (i - 1)
            faces.append((base, base + 1, base + 3, base + 2))
    add_mesh(scene, "SideWedge", vertices, faces, material)

    # Grass lip tumbling over the slanted top edge.
    for index in range(4):
        t = -0.35 + 0.70 * index / 3.0 + 0.05 * (_hash01(40.0, index, 1.0) - 0.5)
        height = z_top(t)
        if height < 0.10:
            continue
        droop = 0.05 + 0.05 * _hash01(40.0, index, 2.0)
        o_top = batter * height
        p_low = edge_point(t - 0.045, o_top - 0.015, height - droop)
        p_high = edge_point(t + 0.045, o_top + 0.045, height - 0.002)
        low = (min(p_low[0], p_high[0]), min(p_low[1], p_high[1]), p_low[2])
        high = (max(p_low[0], p_high[0]), max(p_low[1], p_high[1]), p_high[2])
        add_box(scene, f"SideTuft{index}", *map_box(low, high),
                grass_dark if index % 2 == 0 else grass_light)
