"""Isolated fence registry (render_fence_asset.py).

Duplicates the fence builders from buildings.py with brightened weathered-wood
materials so the fence family can be re-rendered without invalidating the
legacy buildings-domain render cache (buildings.py stays byte-identical).
"""
