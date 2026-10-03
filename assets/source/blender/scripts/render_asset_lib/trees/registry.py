"""Model registry for the isolated Matsue-vegetation tree family (V-07).

Model naming:
    tree-kuromatsu-v<1..3>   tree-akamatsu-v<1..2>   tree-sugi-v<1..2>
    tree-kusunoki-v<1..2>    tree-keyaki-v<1..2>     tree-tsubaki-v<1..2>
(roster: vegetation-design.md — kuromatsu passed the style gate 2026-09-27,
 the rest are the approved mass-production batch in the same vocabulary)
"""
from __future__ import annotations

import re

from .builders import (
    build_akamatsu,
    build_bamboo,
    build_bush,
    build_keyaki,
    build_kuromatsu,
    build_kusunoki,
    build_reeds,
    build_sugi,
    build_weeds,
    build_yabutsubaki,
)

TREES_MODEL_PATTERNS = (
    "tree-kuromatsu-v[123]",
    "tree-akamatsu-v[12]",
    "tree-sugi-v[12]",
    "tree-kusunoki-v[12]",
    "tree-keyaki-v[12]",
    "tree-tsubaki-v[12]",
    "tree-bamboo-v[12]",
    "shrub-bush-v[12]",
    "shrub-weeds-v[12]",
    "shrub-reeds-v[12]",
)

_SPECIES_BUILDERS = {
    "tree-kuromatsu": (build_kuromatsu, (1, 2, 3)),
    "tree-akamatsu": (build_akamatsu, (1, 2)),
    "tree-sugi": (build_sugi, (1, 2)),
    "tree-kusunoki": (build_kusunoki, (1, 2)),
    "tree-keyaki": (build_keyaki, (1, 2)),
    "tree-tsubaki": (build_yabutsubaki, (1, 2)),
    "tree-bamboo": (build_bamboo, (1, 2)),
    "shrub-bush": (build_bush, (1, 2)),
    "shrub-weeds": (build_weeds, (1, 2)),
    "shrub-reeds": (build_reeds, (1, 2)),
}


def resolve_model(name: str):
    match = re.fullmatch(r"((?:tree|shrub)-[a-z]+)-v(\d)", name)
    if match is None:
        return None
    species, variant = match.group(1), int(match.group(2))
    entry = _SPECIES_BUILDERS.get(species)
    if entry is None or variant not in entry[1]:
        return None
    builder = entry[0]
    return lambda scene: builder(scene, variant)
