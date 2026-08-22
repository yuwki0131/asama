"""Model-name resolution for the isolated shore (terrain water) registry.

Mirrors the terrain-water routing of the static registry.py so asset ids and
variant semantics stay identical — only the builder module changes.
"""
from __future__ import annotations

import re

from .builders import (
    build_water_shore_tile, build_water_transition_tile,
    build_water_transition_inner_tile,
)

SHORE_MODEL_PATTERNS = [
    "terrain-water-connected-<NESW mask>[-v1|-v2]",
    "terrain-water-transition-(ne|es|sw|wn)[-v1|-v2]",
    "terrain-water-transition-inner-(ne|es|sw|wn)[-v1|-v2]",
]


def resolve_model(name: str):
    shore = re.fullmatch(r"terrain-water-connected-([01]{4})(?:-v([12]))?", name)
    if shore is not None:
        mask = shore.group(1)
        v = 0 if shore.group(2) is None else int(shore.group(2))
        return lambda scene: build_water_shore_tile(scene, mask, variant=v)
    inner = re.fullmatch(r"terrain-water-transition-inner-(ne|es|sw|wn)(?:-v([12]))?", name)
    if inner is not None:
        corner = inner.group(1)
        v = 0 if inner.group(2) is None else int(inner.group(2))
        return lambda scene: build_water_transition_inner_tile(scene, corner, variant=v)
    transition = re.fullmatch(r"terrain-water-transition-(ne|es|sw|wn)(?:-v([12]))?", name)
    if transition is not None:
        corner = transition.group(1)
        v = 0 if transition.group(2) is None else int(transition.group(2))
        return lambda scene: build_water_transition_tile(scene, corner, variant=v)
    return None
