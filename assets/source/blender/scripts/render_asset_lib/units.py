"""Unit (character) builders."""
from __future__ import annotations

from .core import add_box, map_box, make_material

import bpy


def build_unit_engineer(scene: bpy.types.Scene) -> None:
    """Engineer figure, ~28px tall at unit scale. Canvas 48x64, anchor 24,52."""
    cloth = make_material("EngineerCloth", (0.30, 0.33, 0.28, 1.0))
    skin = make_material("EngineerSkin", (0.62, 0.48, 0.36, 1.0))
    hat = make_material("EngineerHat", (0.55, 0.47, 0.28, 1.0))
    tool = make_material("EngineerTool", (0.35, 0.27, 0.18, 1.0))

    add_box(scene, "Legs", *map_box((-0.09, -0.06, 0.0), (0.09, 0.06, 0.30)), cloth)
    add_box(scene, "Torso", *map_box((-0.11, -0.07, 0.30), (0.11, 0.07, 0.52)), cloth)
    add_box(scene, "Head", *map_box((-0.06, -0.06, 0.52), (0.06, 0.06, 0.64)), skin)
    add_box(scene, "HatBrim", *map_box((-0.13, -0.13, 0.63), (0.13, 0.13, 0.66)), hat)
    add_box(scene, "HatTop", *map_box((-0.06, -0.06, 0.66), (0.06, 0.06, 0.71)), hat)
    add_box(scene, "ShovelShaft", *map_box((0.10, -0.02, 0.20), (0.14, 0.02, 0.72)), tool)
    add_box(scene, "ShovelBlade", *map_box((0.08, -0.04, 0.72), (0.16, 0.04, 0.82)), tool)
