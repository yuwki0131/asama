"""Headless Blender render entry point for the asama isometric asset pipeline.

Run:
    blender --background --factory-startup --python render_asset.py -- \
        --model calibration-tile \
        --canvas 64x32 \
        --anchor 32,16 \
        --output-directory assets/intermediate/raw-renders \
        --render-spec workbench-flat

Contract (docs/05_map-and-art/isometric-alignment.md):
    tile width  64px, tile height 32px (2:1 dimetric)
    screenX = (mapX - mapY) * 32
    screenY = (mapX + mapY) * 16

The camera rig guarantees the contract by construction:
    - orthographic camera, rotation (60 deg, 0, 45 deg)
    - 1 Blender unit == 1 tile side on the ground plane
    - ortho scale chosen so one tile projects to exactly 64x32 px
    - camera translated in its view plane so that world origin projects
      to the anchor pixel instead of canvas center
"""
from __future__ import annotations

import json
import os
import sys

# Make render_asset_lib importable when Blender runs this script directly.
sys.path.insert(0, os.path.dirname(__file__))

import bpy

from render_asset_lib import core
from render_asset_lib.core import (
    PX_PER_UNIT,
    parse_args, parse_pair,
    reset_scene, setup_camera, setup_render,
    add_outline_hulls,
)
from render_asset_lib.registry import resolve_model, MODEL_REGISTRY


def main() -> None:
    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1:]
    else:
        argv = []
    args = parse_args(argv)

    canvas_w, canvas_h = parse_pair(args.canvas, "x")
    anchor_x, anchor_y = parse_pair(args.anchor, ",")

    builder = resolve_model(args.model)
    if builder is None:
        raise SystemExit(f"unknown model: {args.model}; known: {sorted(MODEL_REGISTRY)} plus wall-plaster-connected-<NESW mask>")

    core.CURRENT_STYLE = {"toon-cel": "toon", "painterly": "painterly"}.get(args.render_spec, "pbr")

    scene = reset_scene()
    builder(scene)
    if core.CURRENT_STYLE == "toon":
        add_outline_hulls(scene)
    supersample = max(1, args.supersample)
    canvas_w *= supersample
    canvas_h *= supersample
    anchor_x *= supersample
    anchor_y *= supersample
    setup_camera(scene, canvas_w, canvas_h, anchor_x, anchor_y, PX_PER_UNIT * supersample)

    output_name = args.output_name or args.model
    output_path = os.path.abspath(os.path.join(args.output_directory, f"{output_name}.png"))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    setup_render(
        scene,
        int(canvas_w),
        int(canvas_h),
        args.render_spec,
        args.transparent_background.lower() == "true",
        args.render_seed,
        output_path,
    )

    bpy.ops.render.render(write_still=True)

    report = {
        "model": args.model,
        "output": output_path,
        "canvas": [int(canvas_w), int(canvas_h)],
        "anchor": [anchor_x, anchor_y],
        "renderSpec": args.render_spec,
        "pxPerUnit": PX_PER_UNIT,
        "blenderVersion": bpy.app.version_string,
    }
    if args.report_json:
        os.makedirs(os.path.dirname(os.path.abspath(args.report_json)), exist_ok=True)
        with open(args.report_json, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
    print(f"RENDERED {json.dumps(report)}")


main()
