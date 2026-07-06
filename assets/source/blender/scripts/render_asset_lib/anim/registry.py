"""Animated-model and action registries (isolated from the static registry).

render_anim_asset.py resolves models/actions here; registry.py (static) is
untouched so the 387-asset static render cache stays valid.
"""
from __future__ import annotations

from .actions import ACTIONS
from .archer import build_archer
from .ashigaru import build_spear_ashigaru
from .cavalry import build_cavalry
from .engineer import build_engineer
from .musketeer import build_musketeer
from .rig import DIRECTIONS
from .supply_cart import build_supply_cart

ANIM_MODEL_REGISTRY = {
    "unit-spear-ashigaru-rigged": build_spear_ashigaru,
    "unit-archer-rigged":         build_archer,
    "unit-musketeer-rigged":      build_musketeer,
    "unit-cavalry-rigged":        build_cavalry,
    "unit-engineer-rigged":       build_engineer,
    "unit-supply-cart-rigged":    build_supply_cart,
}


def resolve_anim_model(name: str):
    return ANIM_MODEL_REGISTRY.get(name)


def resolve_action(name: str):
    return ACTIONS.get(name)


__all__ = ["ANIM_MODEL_REGISTRY", "ACTIONS", "DIRECTIONS", "resolve_anim_model", "resolve_action"]
