"""Animation asset library: rigged unit models + keyframed actions.

Deliberately isolated from the static-asset modules (registry.py, units.py,
...) so that adding or editing animated models never invalidates the SHA256
render cache of the 387 static production assets. Only core.py and
materials.py are imported (read-only); changing those invalidates both
pipelines, which is correct.
"""
