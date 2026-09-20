"""Model-name resolution for the isolated farm (rice paddy) registry."""
from __future__ import annotations

import re

from .builders import build_farm_paddy

FARM_MODEL_PATTERNS = [
    "farm-paddy-(spring|summer|autumn|winter)(-v[23])?",
]


def resolve_model(name: str):
    match = re.fullmatch(r"farm-paddy-(spring|summer|autumn|winter)(?:-v([23]))?", name)
    if match is not None:
        season = match.group(1)
        variant = int(match.group(2)) if match.group(2) is not None else 1
        return lambda scene: build_farm_paddy(scene, season, variant)
    return None
