"""Isolated WALLROAD registry (wall-plaster / road straight-run phases).

Split from the static buildings.py / terrain.py registry (trench/machiya
precedent) so the V-05 phase variants (p1..p3 of the 0101/1010 straight
masks) render without invalidating the static render cache. The base masks
stay on the static pipeline; only the new .p<n> assets resolve here.
"""
