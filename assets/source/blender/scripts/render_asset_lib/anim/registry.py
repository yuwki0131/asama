"""Animated-model and action registries (isolated from the static registry).

render_anim_asset.py resolves models/actions here; registry.py (static) is
untouched so the 387-asset static render cache stays valid.
"""
from __future__ import annotations

from .actions import ACTIONS
from .ashigaru import build_spear_ashigaru
from .rig import DIRECTIONS

ANIM_MODEL_REGISTRY = {
    "unit-spear-ashigaru-rigged": build_spear_ashigaru,
}


def resolve_anim_model(name: str):
    return ANIM_MODEL_REGISTRY.get(name)


def resolve_action(name: str):
    return ACTIONS.get(name)


__all__ = ["ANIM_MODEL_REGISTRY", "ACTIONS", "DIRECTIONS", "resolve_anim_model", "resolve_action"]
