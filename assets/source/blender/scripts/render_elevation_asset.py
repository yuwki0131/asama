"""Headless Blender entry point for ELEVATION tiles (P4c).

Twin of render_asset.py that resolves models from the isolated
render_asset_lib.elevation registry instead of the static one, so the
static pipeline (render_asset.py / registry.py and the 387 cached assets)
is untouched. Same camera rig, same CLI contract:

    blender --background --factory-startup --python render_elevation_asset.py -- \
        --model elev-cliff-face-s-h1 \
        --canvas 64x56 \
        --anchor 32,16 \
        --output-directory assets/intermediate/raw-renders \
        --render-spec painterly --supersample 2
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
from render_asset_lib.elevation.registry import resolve_model, ELEVATION_MODEL_PATTERNS


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
        raise SystemExit(
            f"unknown elevation model: {args.model}; patterns: {ELEVATION_MODEL_PATTERNS}"
        )

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
