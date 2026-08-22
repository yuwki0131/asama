"""Model-name resolution for the isolated wallroad registry.

Only the V-05 phase variants of the straight masks resolve here; the base
masks (and every other mask) stay on the static registry.py.
"""
from __future__ import annotations

import re

from .builders import build_road_phase, build_wall_plaster_phase

WALLROAD_MODEL_PATTERNS = [
    "wall-plaster-connected-(0101|1010)-p[123]",
    "road-connected-(0101|1010)-p[123]",
]


def resolve_model(name: str):
    wall = re.fullmatch(r"wall-plaster-connected-(0101|1010)-p([123])", name)
    if wall is not None:
        mask, phase = wall.group(1), int(wall.group(2))
        return lambda scene: build_wall_plaster_phase(scene, mask, phase)
    road = re.fullmatch(r"road-connected-(0101|1010)-p([123])", name)
    if road is not None:
        mask, phase = road.group(1), int(road.group(2))
        return lambda scene: build_road_phase(scene, mask, phase)
    return None
