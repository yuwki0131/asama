"""Model-name resolution for the isolated trench (moat/river) registry.

Mirrors the moat/river routing of the static registry.py so asset ids and
phase/variant semantics stay identical — only the builder module changes.
"""
from __future__ import annotations

import re

from .builders import (
    build_dry_moat_mask, build_water_moat_mask, build_trench_moat,
    build_trench_moat_diagonal, build_river, build_river_mask,
    build_river_diagonal,
)

TRENCH_MODEL_PATTERNS = [
    "(dry|water)-moat-connected-<NESW mask>[-p1..3|-v1]",
    "river-connected-<NESW mask>[-p1..3|-v1]",
    "(dry|water)-moat-diagonal-(nwse|nesw)",
    "river-diagonal-(nwse|nesw)",
]

STATIC_MODELS = {
    "dry-moat-diagonal-nwse": lambda scene: build_trench_moat_diagonal(scene, False, "nwse"),
    "dry-moat-diagonal-nesw": lambda scene: build_trench_moat_diagonal(scene, False, "nesw"),
    "water-moat-diagonal-nwse": lambda scene: build_trench_moat_diagonal(scene, True, "nwse"),
    "water-moat-diagonal-nesw": lambda scene: build_trench_moat_diagonal(scene, True, "nesw"),
    "river-diagonal-nwse": lambda scene: build_river_diagonal(scene, "nwse"),
    "river-diagonal-nesw": lambda scene: build_river_diagonal(scene, "nesw"),
}


def resolve_model(name: str):
    builder = STATIC_MODELS.get(name)
    if builder is not None:
        return builder
    for prefix, kit in (
        ("dry-moat-connected-", build_dry_moat_mask),
        ("water-moat-connected-", build_water_moat_mask),
        ("river-connected-", build_river_mask),
    ):
        if name.startswith(prefix):
            mask = name[len(prefix):]
            if len(mask) == 4 and set(mask) <= {"0", "1"}:
                return lambda scene, kit=kit, mask=mask: kit(scene, mask)
    moat_variant = re.fullmatch(r"(dry|water)-moat-connected-([01]{4})-(p([123])|v1)", name)
    if moat_variant is not None:
        kind, mask, suffix = moat_variant.group(1), moat_variant.group(2), moat_variant.group(3)
        is_water = kind == "water"
        if suffix.startswith("p"):
            p = float(moat_variant.group(4))
            phase = (p, 0.0) if mask == "0101" else (0.0, p)
            return lambda scene: build_trench_moat(scene, mask, is_water, phase=phase)
        return lambda scene: build_trench_moat(scene, mask, is_water, seed=1.0)
    river_variant = re.fullmatch(r"river-connected-([01]{4})-(p([123])|v1)", name)
    if river_variant is not None:
        mask, suffix = river_variant.group(1), river_variant.group(2)
        if suffix.startswith("p"):
            p = float(river_variant.group(3))
            phase = (p, 0.0) if mask == "0101" else (0.0, p)
            return lambda scene: build_river(scene, mask, phase=phase)
        return lambda scene: build_river(scene, mask, seed=1.0)
    return None
