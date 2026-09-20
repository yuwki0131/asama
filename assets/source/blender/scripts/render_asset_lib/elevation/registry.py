"""Model registry for elevation tiles (used only by render_elevation_asset.py).

Model naming mirrors the runtime asset ids of the elevation contract:

    elev-<cliff|ishigaki>-face-<s|e>-h<1..5>
    elev-<cliff|ishigaki>-corner-se-h<1..5>
    elev-slope-<dirt|ishigaki>-<n|e|s|w>
    elev-slope-<dirt|ishigaki>-<n|e|s|w>-side-<s|e>
    elev-slope2-dirt-<n|e|s|w>-<lower|upper>   (gentle 2-cell dirt ramp halves)
"""
from __future__ import annotations

import re

from .tiles import (
    build_cliff_corner,
    build_cliff_face,
    build_ishigaki_corner,
    build_ishigaki_face,
    build_slope,
    build_slope_half,
    build_slope_side,
)

ELEVATION_MODEL_PATTERNS = (
    "elev-(cliff|ishigaki)-face-(s|e)-h[12345]",
    "elev-(cliff|ishigaki)-corner-se-h[12345]",
    "elev-slope-(dirt|ishigaki)-[nesw]",
    "elev-slope-ishigaki-[nesw]-(mid|cvn|cvp)",
    "elev-slope-(dirt|ishigaki)-[nesw]-side-(s|e)",
    "elev-slope2-dirt-[nesw]-(lower|upper)",
    "elev-slope2-dirt-[nesw]-(lower|upper)-side-(s|e)",
)


def resolve_model(name: str):
    face = re.fullmatch(r"elev-(cliff|ishigaki)-face-([se])-h([12345])", name)
    if face is not None:
        skin, direction, h = face.group(1), face.group(2), int(face.group(3))
        builder = build_cliff_face if skin == "cliff" else build_ishigaki_face
        return lambda scene: builder(scene, direction, h)

    corner = re.fullmatch(r"elev-(cliff|ishigaki)-corner-se-h([12345])", name)
    if corner is not None:
        skin, h = corner.group(1), int(corner.group(2))
        builder = build_cliff_corner if skin == "cliff" else build_ishigaki_corner
        return lambda scene: builder(scene, h)

    side = re.fullmatch(r"elev-slope-(dirt|ishigaki)-([nesw])-side-([se])", name)
    if side is not None:
        skin, toward, edge = side.group(1), side.group(2), side.group(3)
        return lambda scene: build_slope_side(scene, skin, toward, edge)

    slope = re.fullmatch(r"elev-slope-(dirt|ishigaki)-([nesw])", name)
    if slope is not None:
        skin, toward = slope.group(1), slope.group(2)
        return lambda scene: build_slope(scene, skin, toward)

    # Wide-ramp column variants (V-16): mid = no curbs (interior column),
    # cvn/cvp = curb only on the v-neg / v-pos flank (edge columns). Phase
    # variants were tried and removed: seed-jitter alone measured
    # meanAbsDiff 1-12 (< VAR-01's 12), i.e. 実質同一 — and with mid/cvn/cvp
    # no two columns of a width≤3 ramp share a sprite anyway.
    slope_variant = re.fullmatch(r"elev-slope-ishigaki-([nesw])-(mid|cvn|cvp)", name)
    if slope_variant is not None:
        toward, kind = slope_variant.group(1), slope_variant.group(2)
        curbs = {"mid": (False, False), "cvn": (True, False), "cvp": (False, True)}[kind]
        return lambda scene: build_slope(scene, "ishigaki", toward, 0, curbs)

    slope2_side = re.fullmatch(r"elev-slope2-(dirt)-([nesw])-(lower|upper)-side-([se])", name)
    if slope2_side is not None:
        skin, toward, half, edge = (
            slope2_side.group(1),
            slope2_side.group(2),
            slope2_side.group(3),
            slope2_side.group(4),
        )
        return lambda scene: build_slope_side(scene, skin, toward, edge, half)

    slope_half = re.fullmatch(r"elev-slope2-(dirt)-([nesw])-(lower|upper)", name)
    if slope_half is not None:
        skin, toward, half = slope_half.group(1), slope_half.group(2), slope_half.group(3)
        return lambda scene: build_slope_half(scene, skin, toward, half)

    return None
