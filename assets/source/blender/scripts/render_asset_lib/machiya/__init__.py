"""Isolated machiya registry (composite lint LUM fix).

The v2 tsumairi body and the v3 itabuki roof used the shared near-black
DarkWood planks (opaque-mean luma ~42, below the 48 floor), reading as black
blobs at map scale. Brightening them inside buildings.py would invalidate the
render cache of every legacy building, so — like the fence and elevation
families — the machiya builders live here with their own entry script
(render_machiya_asset.py). The cache key for this family hashes only that
entry script, core.py, materials.py and this package.
"""
