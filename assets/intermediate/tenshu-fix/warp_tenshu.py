"""Piecewise vertical warp for the tenshu paintover (candidate A).

Fixes the "vertically over-stretched" look of building-tenshu-v2.png
(overall alpha bbox h/w = 0.982) so it matches the camera feel of the
other buildings (target h/w ~= 0.88, same as building-tenshu-test.png).

Geometry contract:
  - The ground diamond / ishigaki base outline must NOT be distorted.
    The widest alpha row (the diamond's left/right corners) is at
    y = Y_BASE; everything at y >= Y_BASE is copied through unchanged
    (local scale 1.0), which also preserves the anchor
    (bottom-center, anchor y = 0.827 -> pixel y = 430).
  - Above Y_BASE the local vertical scale ramps linearly from 1.0 at
    the base up to S_MIN at the content top (y = Y_TOP), so the upper
    storeys are compressed progressively harder toward the roof.
    S_MIN is solved so the resulting overall bbox height hits the
    target h/w.

Sampling: inverse mapping per destination row, linear interpolation
between the two neighbouring source rows on premultiplied RGBA (avoids
dark halo fringes at the silhouette).

Run (from repo root):
  nix-shell -p "python3.withPackages(ps: with ps; [pillow numpy])" \
    --run "python3 assets/intermediate/tenshu-fix/warp_tenshu.py"
"""
from __future__ import annotations

import numpy as np
from PIL import Image

SRC = "assets/source/raster/building-tenshu-v2.png"
DST = "assets/intermediate/tenshu-fix/candidate-a.png"

TARGET_H_OVER_W = 0.88  # matches building-tenshu-test.png (0.8805)
ALPHA_THRESHOLD = 16


def main() -> None:
    im = np.array(Image.open(SRC).convert("RGBA"), dtype=np.float64)
    h_img, w_img = im.shape[:2]
    alpha = im[:, :, 3] > ALPHA_THRESHOLD

    ys, xs = np.where(alpha)
    y_top, y_bottom = int(ys.min()), int(ys.max())
    x_left, x_right = int(xs.min()), int(xs.max())
    bbox_w = x_right - x_left + 1

    # Widest row = ground diamond left/right corners.
    widths = np.array(
        [
            (np.ptp(np.where(alpha[y])[0]) + 1) if alpha[y].any() else 0
            for y in range(h_img)
        ]
    )
    y_base = int(np.argmax(widths))

    target_h = TARGET_H_OVER_W * bbox_w
    # Upper region (y_top .. y_base) of source height Hu must land in
    # (y_bottom - target_h + 1 .. y_base): height Hu_target.
    hu_src = y_base - y_top
    hu_dst = y_base - (y_bottom - target_h + 1)
    s_avg = hu_dst / hu_src
    # Linear ramp of local scale: 1.0 at y_base -> s_min at y_top.
    s_min = 2.0 * s_avg - 1.0
    print(
        f"bbox w={bbox_w} h={y_bottom - y_top + 1} h/w={(y_bottom - y_top + 1) / bbox_w:.4f}"
    )
    print(f"y_base={y_base} s_avg={s_avg:.4f} s_min={s_min:.4f}")

    # Forward map: dest(y) = y_base - integral_y^{y_base} s(t) dt with
    # s(t) = s_min + (1 - s_min) * (t - y_top) / (y_base - y_top).
    src_grid = np.arange(y_top, y_base + 1, dtype=np.float64)
    s_local = s_min + (1.0 - s_min) * (src_grid - y_top) / hu_src
    # cumulative dest offset measured downward from the top of the ramp
    # (trapezoid integration from y_top).
    cum = np.concatenate(([0.0], np.cumsum((s_local[1:] + s_local[:-1]) / 2.0)))
    dest_of_src = y_base - (cum[-1] - cum)  # dest row for each source row

    out = np.zeros_like(im)
    # Identity part.
    out[y_base:, :, :] = im[y_base:, :, :]

    # Premultiply for clean interpolation.
    pre = im.copy()
    pre[:, :, :3] *= pre[:, :, 3:4] / 255.0

    dst_rows = np.arange(int(np.floor(dest_of_src[0])), y_base)
    # Inverse map: source row (fractional) for each dest row.
    src_f = np.interp(dst_rows, dest_of_src, src_grid)
    y0 = np.clip(np.floor(src_f).astype(int), 0, h_img - 2)
    frac = (src_f - y0)[:, None, None]
    rows = pre[y0] * (1.0 - frac) + pre[y0 + 1] * frac
    out[dst_rows] = rows

    # Un-premultiply the warped part.
    a = out[dst_rows, :, 3:4]
    nz = a > 1e-6
    rgb = out[dst_rows, :, :3]
    out[dst_rows, :, :3] = np.where(nz, rgb / np.maximum(a / 255.0, 1e-6), 0.0)

    out = np.clip(np.round(out), 0, 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(DST)

    check = out[:, :, 3] > ALPHA_THRESHOLD
    cys, cxs = np.where(check)
    ch = cys.max() - cys.min() + 1
    cw = cxs.max() - cxs.min() + 1
    print(f"result bbox w={cw} h={ch} h/w={ch / cw:.4f} -> {DST}")


if __name__ == "__main__":
    main()
