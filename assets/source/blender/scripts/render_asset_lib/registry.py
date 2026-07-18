"""MODEL_REGISTRY and resolve_model: maps model name strings to builder callables."""
from __future__ import annotations

import re

from .core import build_calibration_tile, build_calibration_cube, build_calibration_grid, build_calibration_chirality
from .terrain import (
    build_terrain_grass, build_terrain_macro_tile, build_water_shore_tile,
    build_water_transition_tile, build_water_transition_inner_tile,
    build_terrain_mask, build_terrain_base,
    build_road_mask, build_dry_moat_mask, build_water_moat_mask, build_trench_moat,
    build_earth_bridge, build_wood_bridge,
    build_earth_bridge_span, build_wood_bridge_span,
)
from .buildings import (
    build_storehouse_graybox, build_storehouse_showcase,
    build_market_graybox, build_barracks_graybox,
    build_samurai_residence_graybox, build_town_block_graybox,
    build_yagura_small_graybox, build_farm_paddy,
    build_gate_wood, build_wall_plaster_mask, build_fence_wood_mask,
    build_wall_ladder, build_tenshu_graybox,
)
from .vegetation import (
    build_tree_pine, build_tree_cedar, build_tree_broadleaf,
    build_bamboo, build_deco_bush, build_deco_weeds,
    build_rock, build_reeds,
)
from .units import build_unit_engineer


MODEL_REGISTRY = {
    "calibration-tile": build_calibration_tile,
    "calibration-cube": build_calibration_cube,
    "calibration-grid": build_calibration_grid,
    "calibration-chirality": build_calibration_chirality,
    "terrain-grass-base": build_terrain_grass,
    "building-storehouse-graybox": build_storehouse_graybox,
    "building-storehouse-showcase": build_storehouse_showcase,
    "building-market-graybox": build_market_graybox,
    "building-barracks-graybox": build_barracks_graybox,
    "building-samurai-residence-graybox": build_samurai_residence_graybox,
    "building-town-block-graybox": build_town_block_graybox,
    "building-yagura-small-graybox": build_yagura_small_graybox,
    "building-farm-paddy": build_farm_paddy,
    "building-tenshu-graybox": build_tenshu_graybox,
    "building-earth-bridge": build_earth_bridge,
    "building-earth-bridge-y": lambda scene: build_earth_bridge(scene, axis="y"),
    "building-wood-bridge": build_wood_bridge,
    "building-wood-bridge-y": lambda scene: build_wood_bridge(scene, axis="y"),
    "building-wood-bridge-x3": build_wood_bridge_span,
    "building-wood-bridge-y3": lambda scene: build_wood_bridge_span(scene, axis="y"),
    "building-earth-bridge-x3": build_earth_bridge_span,
    "building-earth-bridge-y3": lambda scene: build_earth_bridge_span(scene, axis="y"),
    "building-wood-bridge-x5": lambda scene: build_wood_bridge_span(scene, span_len=5),
    "building-wood-bridge-y5": lambda scene: build_wood_bridge_span(scene, axis="y", span_len=5),
    "building-earth-bridge-x5": lambda scene: build_earth_bridge_span(scene, span_len=5),
    "building-earth-bridge-y5": lambda scene: build_earth_bridge_span(scene, axis="y", span_len=5),
    "unit-engineer": build_unit_engineer,
    "wall-ladder": build_wall_ladder,
    "tree-pine": build_tree_pine,
    "tree-pine-2": lambda scene: build_tree_pine(scene, variant=1),
    "tree-cedar": build_tree_cedar,
    "tree-broadleaf": build_tree_broadleaf,
    "bamboo-cluster": build_bamboo,
    "rock-cluster": build_rock,
    "reeds": build_reeds,
    "deco-bush": build_deco_bush,
    "deco-weeds": build_deco_weeds,
}


def resolve_model(name: str):
    builder = MODEL_REGISTRY.get(name)
    if builder is not None:
        return builder
    for prefix, kit in (
        ("wall-plaster-connected-", build_wall_plaster_mask),
        ("fence-wood-connected-", build_fence_wood_mask),
        ("road-connected-", build_road_mask),
        ("dry-moat-connected-", build_dry_moat_mask),
        ("water-moat-connected-", build_water_moat_mask),
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
    gate = re.fullmatch(r"gate-wood-(closed|open)-(nw_se|ne_sw)-w([123])-([01]{4})", name)
    if gate is not None:
        state, axis, width, mask = gate.group(1), gate.group(2), int(gate.group(3)), gate.group(4)
        return lambda scene: build_gate_wood(scene, axis, width, mask, doors_closed=state == "closed")
    shore_v = re.fullmatch(r"terrain-water-connected-([01]{4})-v([12])", name)
    if shore_v is not None:
        mask, v = shore_v.group(1), int(shore_v.group(2))
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
    macro = re.fullmatch(r"terrain-(grass|dirt|water)-macro-v(\d)-(\d)-(\d)", name)
    if macro is not None:
        t, v, tx, ty = macro.group(1), int(macro.group(2)), int(macro.group(3)), int(macro.group(4))
        return lambda scene: build_terrain_macro_tile(scene, t, v, tx, ty)
    terrain = re.fullmatch(r"terrain-(grass|dirt|stone|water)-connected-([01]{4})", name)
    if terrain is not None:
        kind, mask = terrain.group(1), terrain.group(2)
        return lambda scene: build_terrain_mask(scene, kind, mask)
    flat = re.fullmatch(r"terrain-(grass|dirt|stone|water)-(base|variant)", name)
    if flat is not None:
        kind, variant = flat.group(1), flat.group(2) == "variant"
        return lambda scene: build_terrain_base(scene, kind, variant)
    return None
