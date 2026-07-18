"""Rigged spear / sword ashigaru at production quality.

The body is the shared organic humanoid (see humanoid.py): lathed cuirass
and jingasa, capsule limbs, smooth shading — replacing the earlier box
construction whose flat facets read as "polygons" at sprite size.

Unit-specific parts here:
    - sashimono back banner with clan mon
    - chest munaita cord detail
    - spear: round shaft + tapered steel point (spear variant)
    - katana: wrapped grip, tsuba, three-segment sori blade (sword variant)

Facing map SOUTH (world -Y); +X is the character's left. Total height
~0.72 units, reads ~30px on the 48x64 unit canvas.
"""
from __future__ import annotations

import bpy

from ..core import make_material
from ..materials import make_noise_material, make_plank_material
from .humanoid import HUMANOID_BONES, WEAPON_BONE_RIGHT, build_humanoid_body
from .rig import rig_beam, rig_box, rig_limb

__all__ = ["HUMANOID_BONES", "build_spear_ashigaru", "build_sword_ashigaru"]


def _ashigaru_materials() -> dict[str, bpy.types.Material]:
    return {
        "do": make_noise_material("AshigaruDo", (0.062, 0.055, 0.052), (0.135, 0.120, 0.105), scale=9.0),
        "lacing": make_material("AshigaruLacing", (0.360, 0.170, 0.060, 1.0)),
        "cloth": make_noise_material("AshigaruCloth", (0.085, 0.095, 0.150), (0.155, 0.170, 0.245), scale=8.0),
        "hakama": make_noise_material("AshigaruHakama", (0.120, 0.130, 0.185), (0.205, 0.220, 0.290), scale=8.0),
        "skin": make_material("AshigaruSkin", (0.62, 0.48, 0.36, 1.0)),
        "jingasa": make_noise_material("AshigaruJingasa", (0.050, 0.042, 0.036), (0.110, 0.095, 0.075), scale=7.0),
        "kote": make_noise_material("AshigaruKote", (0.095, 0.075, 0.050), (0.165, 0.135, 0.095), scale=8.0),
        "sandal": make_material("AshigaruSandal", (0.400, 0.320, 0.170, 1.0)),
        "strap": make_material("AshigaruStrap", (0.100, 0.080, 0.050, 1.0)),
    }


def build_spear_ashigaru(scene: bpy.types.Scene) -> bpy.types.Object:
    materials = _ashigaru_materials()
    wood = make_plank_material("AshigaruSpearShaft", (0.075, 0.055, 0.034), (0.140, 0.105, 0.065))
    steel = make_material("AshigaruSpearHead", (0.58, 0.62, 0.68, 1.0))
    banner = make_noise_material("AshigaruBanner", (0.095, 0.145, 0.310), (0.165, 0.230, 0.420), scale=5.0)
    mon = make_material("AshigaruMon", (0.85, 0.86, 0.88, 1.0))
    lacing = materials["lacing"]

    rig = build_humanoid_body(scene, "AshigaruRig", materials, WEAPON_BONE_RIGHT)

    # Chest cord across the munaita.
    rig_box(scene, rig, "MunaitaCord", (-0.055, -0.076, 0.455), (0.055, -0.058, 0.474), lacing, "spine", bevel=0.004)

    # --- sashimono banner (spine; +Y is the character's back) ---------------
    rig_limb(scene, rig, "BannerPole", (0.0, 0.082, 0.34), (0.0, 0.082, 1.02),
             0.0075, 0.006, wood, "spine", segments=8, rings=2, bulge=0.0, cap="flat")
    rig_box(scene, rig, "BannerCross", (-0.066, 0.076, 0.994), (0.066, 0.088, 1.006), wood, "spine", bevel=None)
    rig_box(scene, rig, "Banner", (-0.060, 0.078, 0.700), (0.060, 0.086, 0.994), banner, "spine", bevel=None)
    rig_box(scene, rig, "BannerMon", (-0.028, 0.0765, 0.820), (0.028, 0.0875, 0.876), mon, "spine", bevel=None)

    # --- spear (spear bone; carry pose = butt low front, blade high back) ---
    rig_limb(scene, rig, "SpearShaft", (-0.128, -0.315, 0.055), (-0.128, 0.235, 0.815),
             0.010, 0.009, wood, "spear", segments=8, rings=2, bulge=0.0, cap="flat")
    rig_limb(scene, rig, "SpearHead", (-0.128, 0.230, 0.808), (-0.128, 0.292, 0.894),
             0.016, 0.002, steel, "spear", segments=8, rings=3, bulge=0.0, cap="flat")

    return rig


def build_sword_ashigaru(scene: bpy.types.Scene) -> bpy.types.Object:
    """Build the spear ashigaru body with a one-handed curved katana.

    Reusing the production spear body keeps its proportions, armor, banner,
    and rig contract exactly aligned with the other ashigaru.  Only the two
    spear meshes are replaced; the historical ``spear`` bone name remains as
    the shared weapon-bone API used by the animation pipeline.
    """
    rig = build_spear_ashigaru(scene)
    rig.name = "SwordAshigaruRig"

    for object_name in ("SpearShaft", "SpearHead"):
        weapon_part = bpy.data.objects.get(object_name)
        if weapon_part is not None:
            bpy.data.objects.remove(weapon_part, do_unlink=True)

    wrapping = make_material("AshigaruKatanaWrapping", (0.105, 0.075, 0.045, 1.0))
    guard = make_material("AshigaruKatanaGuard", (0.16, 0.12, 0.065, 1.0))
    steel = make_material("AshigaruKatanaSteel", (0.58, 0.62, 0.68, 1.0))

    # Compact one-handed grip at the right hand, a visible tsuba, then three
    # subtly offset blade segments.  The offset produces a readable sori
    # silhouette without changing the shared rig or render contract.
    rig_limb(scene, rig, "KatanaTsuka", (-0.128, -0.115, 0.205), (-0.128, -0.045, 0.315),
             0.015, 0.014, wrapping, "spear", segments=8, rings=2, bulge=0.0, cap="round")
    rig_box(scene, rig, "KatanaTsuba", (-0.170, -0.072, 0.302), (-0.086, -0.018, 0.320), guard, "spear", bevel=0.005)
    rig_beam(scene, rig, "KatanaBlade.1", (-0.128, -0.030, 0.318), (-0.128, 0.070, 0.470), 0.022, steel, "spear")
    rig_beam(scene, rig, "KatanaBlade.2", (-0.128, 0.070, 0.470), (-0.128, 0.190, 0.610), 0.019, steel, "spear")
    rig_beam(scene, rig, "KatanaBlade.3", (-0.128, 0.190, 0.610), (-0.128, 0.330, 0.720), 0.015, steel, "spear")

    return rig
