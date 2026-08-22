"""Model-name resolution for the isolated stone (rocky ridge) registry.

Mirrors the terrain-stone routing of the static registry.py so asset ids
stay identical — only the builder module changes.
"""
from __future__ import annotations

import re

from .builders import build_stone_base, build_stone_tile

STONE_MODEL_PATTERNS = [
    "terrain-stone-base",
    "terrain-stone-connected-<NESW mask>",
]


def resolve_model(name: str):
    if name == "terrain-stone-base":
        return build_stone_base
    connected = re.fullmatch(r"terrain-stone-connected-([01]{4})", name)
    if connected is not None:
        mask = connected.group(1)
        return lambda scene: build_stone_tile(scene, mask)
    return None
