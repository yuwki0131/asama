"""Elevation tile package (P4c).

Isolated from the static pipeline on the anim/ precedent: nothing in
render_asset.py / registry.py imports this package, so the 387 static
assets keep their render-cache keys. Only render_elevation_asset.py
(and the elevation-specific cache key) reads these modules.
"""
