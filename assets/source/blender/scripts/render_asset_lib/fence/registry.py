"""Model registry for the fence family (used only by render_fence_asset.py).

    fence-wood-connected-<NESW mask>
    fence-wood-diagonal-<nwse|nesw>
    fence-wood-diagonal-arm-<nw|ne|se|sw>
"""
from __future__ import annotations

import re

from .builders import (
    build_fence_diagonal,
    build_fence_diagonal_arm,
    build_fence_wood_mask,
)

FENCE_MODEL_PATTERNS = (
    "fence-wood-connected-[01]{4}",
    "fence-wood-diagonal-(nwse|nesw)",
    "fence-wood-diagonal-arm-(nw|ne|se|sw)",
)


def resolve_model(name: str):
    connected = re.fullmatch(r"fence-wood-connected-([01]{4})", name)
    if connected is not None:
        mask = connected.group(1)
        return lambda scene: build_fence_wood_mask(scene, mask)
    diagonal = re.fullmatch(r"fence-wood-diagonal-(nwse|nesw)", name)
    if diagonal is not None:
        orientation = diagonal.group(1)
        return lambda scene: build_fence_diagonal(scene, orientation)
    arm = re.fullmatch(r"fence-wood-diagonal-arm-(nw|ne|se|sw)", name)
    if arm is not None:
        corner = arm.group(1)
        return lambda scene: build_fence_diagonal_arm(scene, corner)
    return None
