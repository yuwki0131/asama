"""Model-name resolution for the isolated marsh (wetland) registry."""
from __future__ import annotations

import re

from .builders import build_marsh_base, build_marsh_tile

MARSH_MODEL_PATTERNS = [
    "terrain-marsh-base",
    "terrain-marsh-connected-<NESW mask>",
]


def resolve_model(name: str):
    if name == "terrain-marsh-base":
        return build_marsh_base
    connected = re.fullmatch(r"terrain-marsh-connected-([01]{4})", name)
    if connected is not None:
        mask = connected.group(1)
        return lambda scene: build_marsh_tile(scene, mask)
    return None
