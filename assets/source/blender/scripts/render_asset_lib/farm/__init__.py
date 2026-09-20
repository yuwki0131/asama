"""Isolated farm (rice paddy) registry — 畑の四季作り直し 2026-09-20.

Re-renders the seasonal building.farm.* sprites without touching the static
registry.py / render_asset.py pipeline or its cached assets. Perception goals
(user feedback + patrol I族):
- 稲は鋭い線的質感: blades are thin sliver fans, never round/box clumps.
- 2x2反復の解消: v2 variants shift row phase / ムラ mapping so adjacent
  paddies stop reading as pixel-identical copies.
- 春の水色: toned toward the slate water family instead of bright sky cyan.
"""
