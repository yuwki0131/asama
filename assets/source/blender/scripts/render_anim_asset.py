"""Headless Blender entry point for ANIMATED sprite-sheet assets.

One process renders one unit model x one action: 8 directions x N frames,
writing one PNG per frame. Sheet composition (downscale + grid layout)
happens in @asama/asset-tools so it stays unit-testable and deterministic.

Run:
    blender --background --factory-startup --python render_anim_asset.py -- \
        --model unit-spear-ashigaru-rigged \
        --action walk --frames 8 \
        --canvas 48x64 --anchor 24,52.48 \
        --render-spec painterly --supersample 2 \
        --output-directory assets/intermediate/anim-renders/...

Output files: <output-name>-<direction>-f<frame:02d>.png at supersampled
resolution. Direction order is fixed: S, SE, E, NE, N, NW, W, SW (map
compass; the armature rotates +45 deg about Z per step while camera and
world lighting stay fixed, so lighting is physically consistent).

Deliberately separate from render_asset.py: the static pipeline's SHA256
cache hashes render_asset.py + registry.py + domain modules, none of which
this file or render_asset_lib/anim/ touches.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

from render_asset_lib import core
from render_asset_lib.core import PX_PER_UNIT, parse_pair, reset_scene, setup_camera, setup_render
from render_asset_lib.anim.registry import ACTIONS, ANIM_MODEL_REGISTRY, DIRECTIONS, resolve_action, resolve_anim_model


def parse_anim_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="asama animated sprite-sheet renderer")
    parser.add_argument("--model", required=True, help="registered animated model name")
    parser.add_argument("--action", required=True, help="registered action name")
    parser.add_argument("--frames", type=int, required=True, help="frame count for the action")
    parser.add_argument("--canvas", required=True, help="per-frame cell size, e.g. 48x64")
    parser.add_argument("--anchor", required=True, help="anchor pixel in the cell, e.g. 24,52.48")
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--output-name", default=None, help="frame file prefix (default: <model>-<action>)")
    parser.add_argument("--render-spec", default="painterly")
    parser.add_argument("--transparent-background", default="true")
    parser.add_argument("--supersample", type=int, default=1)
    parser.add_argument("--directions", type=int, default=len(DIRECTIONS), help="render only the first N directions")
    parser.add_argument("--report-json", default=None)
    return parser.parse_args(argv)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parse_anim_args(argv)

    builder = resolve_anim_model(args.model)
    if builder is None:
        raise SystemExit(f"unknown animated model: {args.model}; known: {sorted(ANIM_MODEL_REGISTRY)}")
    keyframer = resolve_action(args.action)
    if keyframer is None:
        raise SystemExit(f"unknown action: {args.action}; known: {sorted(ACTIONS)}")
    if args.frames < 1:
        raise SystemExit("--frames must be >= 1")

    canvas_w, canvas_h = parse_pair(args.canvas, "x")
    anchor_x, anchor_y = parse_pair(args.anchor, ",")
    supersample = max(1, args.supersample)
    output_dir = os.path.abspath(args.output_directory)
    os.makedirs(output_dir, exist_ok=True)
    prefix = args.output_name or f"{args.model}-{args.action}"

    core.CURRENT_STYLE = {"toon-cel": "toon", "painterly": "painterly"}.get(args.render_spec, "pbr")

    scene = reset_scene()
    rig = builder(scene)
    keyframer(scene, rig, args.frames)

    setup_camera(
        scene,
        canvas_w * supersample,
        canvas_h * supersample,
        anchor_x * supersample,
        anchor_y * supersample,
        PX_PER_UNIT * supersample,
    )
    setup_render(
        scene,
        int(canvas_w * supersample),
        int(canvas_h * supersample),
        args.render_spec,
        args.transparent_background.lower() == "true",
        0,
        output_dir,
    )

    timings: list[dict] = []
    total_start = time.perf_counter()
    for d_index in range(min(args.directions, len(DIRECTIONS))):
        rig.rotation_euler = (0.0, 0.0, math.radians(45.0 * d_index))
        d_name = DIRECTIONS[d_index]
        for frame in range(1, args.frames + 1):
            scene.frame_set(frame)
            path = os.path.join(output_dir, f"{prefix}-{d_name}-f{frame:02d}.png")
            scene.render.filepath = path
            start = time.perf_counter()
            bpy.ops.render.render(write_still=True)
            timings.append({"direction": d_name, "frame": frame, "seconds": round(time.perf_counter() - start, 3)})

    report = {
        "model": args.model,
        "action": args.action,
        "frames": args.frames,
        "directions": DIRECTIONS[: min(args.directions, len(DIRECTIONS))],
        "cellCanvas": [int(canvas_w), int(canvas_h)],
        "anchor": [anchor_x, anchor_y],
        "supersample": supersample,
        "renderSpec": args.render_spec,
        "pxPerUnit": PX_PER_UNIT,
        "totalSeconds": round(time.perf_counter() - total_start, 2),
        "renderedFrames": len(timings),
        "blenderVersion": bpy.app.version_string,
        "timings": timings,
    }
    if args.report_json:
        os.makedirs(os.path.dirname(os.path.abspath(args.report_json)), exist_ok=True)
        with open(args.report_json, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
    summary = {k: report[k] for k in ("model", "action", "renderedFrames", "totalSeconds")}
    print(f"ANIM_RENDERED {json.dumps(summary)}")


main()
