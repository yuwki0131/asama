"""Model registry for the machiya family (used only by render_machiya_asset.py).

    building-machiya-v<1|2|3>-<nw_se|ne_sw>
"""
from __future__ import annotations

import re

from .builders import build_machiya

MACHIYA_MODEL_PATTERNS = (
    "building-machiya-v[123]-(nw_se|ne_sw)",
)


def resolve_model(name: str):
    match = re.fullmatch(r"building-machiya-v([123])-(nw_se|ne_sw)", name)
    if match is not None:
        variant = int(match.group(1))
        orientation = match.group(2)
        return lambda scene: build_machiya(scene, variant=variant, orientation=orientation)
    return None
