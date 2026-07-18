#!/usr/bin/env python3
"""Derive seasonal farm rasters from the hand-painted spring base.

The painterly raster assets/source/raster/building-farm.png (deep blue-green
paddy water + orderly seedling rows + textured ridges) is the quality bar.
Instead of re-rendering the paddy in Blender (which came out much coarser),
this script derives summer/autumn/winter variants purely by image processing
so brushwork, noise character and the ridge/plot structure stay identical to
the original in all four seasons.

  spring : verbatim copy of the source painting
  summer : seedling dots grown into lush connected clumps (colors sampled
           from the painting's own green statistics), water mostly covered
  autumn : same clump structure hue-shifted to golden ripe rice, water
           drained to dark wet soil (sampled from the ridge soil statistics)
  winter : harvested field - interior filled with dry soil texture derived
           from the ridge palette, faint pale stubble dots on the original
           seedling grid, slightly desaturated overall

Run (from repo root):
  nix-shell -p "python3.withPackages(ps: with ps; [pillow numpy scipy])" \
    --run "python3 assets/intermediate/farm-seasons/derive_farm_seasons.py"
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
SRC = os.path.join(ROOT, "assets", "source", "raster", "building-farm.png")
OUT_DIR = os.path.join(ROOT, "assets", "source", "raster")

rng = np.random.default_rng(260718)


def smooth_noise(shape, cell, amp, generator):
    """Painterly low-frequency value noise: coarse random grid upscaled bicubically."""
    h, w = shape
    gh, gw = max(2, h // cell), max(2, w // cell)
    grid = generator.normal(0.0, 1.0, (gh, gw))
    img = Image.fromarray(((grid - grid.min()) / (np.ptp(grid) + 1e-9) * 255).astype(np.uint8))
    up = np.asarray(img.resize((w, h), Image.BICUBIC)).astype(np.float64)
    up = (up / 255.0) * 2.0 - 1.0
    return up * amp


def build_masks(a):
    r, g, b, al = (a[..., i].astype(int) for i in range(4))
    opaque = al > 0
    near_black = opaque & (a[..., :3].max(axis=2) < 40)
    soil = opaque & (r > g + 4) & (g > b + 10) & ~near_black
    field = opaque & ~soil & ~near_black
    # Keep clear of anti-aliased ridge/outline transitions so the ridge
    # geometry reads identically in every season.
    inner = ndimage.binary_erosion(field, iterations=2)
    return opaque, near_black, soil, field, inner


def detect_plants(a, field, inner):
    """Seedling grid = clusters of yellow-green sprig tips inside the field."""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    tip = inner & (g > b + 25) & (g > 65)
    lbl, n = ndimage.label(tip)
    cents = ndimage.center_of_mass(tip, lbl, range(1, n + 1))
    return [(int(round(c[1])), int(round(c[0]))) for c in cents]


def collect_palettes(a, field, soil):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    greens = a[..., :3][field & (g > b + 12)].astype(np.float64)
    water = a[..., :3][field & ~(g > b + 12)].astype(np.float64)
    soil_px = a[..., :3][soil].astype(np.float64)
    luma = greens @ [0.299, 0.587, 0.114]
    order = np.argsort(luma)
    dark = greens[order[: int(len(order) * 0.55)]]
    bright = greens[order[int(len(order) * 0.70):]]
    # Foliage highlights must stay leaf-green: drop the yellow sprig tips
    # (r ~ g) or lone bright-yellow confetti pixels appear in the clumps.
    leafy = bright[bright[:, 0] < bright[:, 1] * 0.92]
    if len(leafy) > 30:
        bright = leafy
    return dark, bright, water, soil_px


def fill_plant_gaps(plants, inner, spacing=8):
    """Synthesize extra clump seeds where tip detection left bald water
    (edge rows lose their tips to the anti-aliasing margin)."""
    h, w = inner.shape
    seeds = np.ones((h, w), bool)
    for (px, py) in plants:
        if 0 <= px < w and 0 <= py < h:
            seeds[py, px] = False
    out = list(plants)
    for _ in range(60):
        dist = ndimage.distance_transform_edt(seeds)
        dist[~inner] = 0
        far = float(dist.max())
        if far <= spacing:
            break
        y, x = np.unravel_index(int(dist.argmax()), dist.shape)
        out.append((int(x), int(y)))
        seeds[y, x] = False
    return out


def draw_clumps(out, plants, field, dark_pal, bright_pal, generator):
    """Grow each seedling into an iso-flattened clump; returns the clump mask."""
    h, w = field.shape
    clump = np.zeros((h, w), bool)
    for (px, py) in plants:
        rx = 5.4 + generator.normal(0, 0.5)
        ry = 3.1 + generator.normal(0, 0.35)
        lift = 1  # plants read slightly "up" in iso
        tone = generator.normal(0, 7)  # per-plant patchiness
        for dy in range(-5, 4):
            for dx in range(-7, 8):
                d = (dx / rx) ** 2 + ((dy + lift) / ry) ** 2
                if d > 1.0 + generator.normal(0, 0.10):
                    continue
                x, y = px + dx, py + dy
                if not (0 <= x < w and 0 <= y < h) or not field[y, x]:
                    continue
                pal = bright_pal if (dy + lift) < -1 and generator.random() < 0.80 else dark_pal
                c = pal[generator.integers(len(pal))] + tone + generator.normal(0, 5, 3)
                # Lush mid-summer lift: brighter, juicier green than the
                # sparse April sprigs while staying in the painting's hue.
                c = c + np.array([2.0, 9.0, 0.0])
                out[y, x, :3] = np.clip(c, 0, 255)
                clump[y, x] = True
    return clump


def soften(out, mask):
    """Mild selective blur so grown pixels sit in the original brushwork."""
    rgb = out[..., :3].astype(np.float64)
    blurred = np.stack([ndimage.uniform_filter(rgb[..., i], 3) for i in range(3)], axis=-1)
    zone = ndimage.binary_dilation(mask, iterations=1)
    out[..., :3][zone] = np.clip(rgb[zone] * 0.45 + blurred[zone] * 0.55, 0, 255)


def make_summer(a, field, plants, dark_pal, bright_pal):
    gen = np.random.default_rng(11)
    out = a.copy()
    # Remaining water gets lusher: pull toward green, slightly darker.
    r, g, b = (a[..., i].astype(int) for i in range(3))
    water = field & ~(g > b + 12)
    target = np.array([52.0, 90.0, 62.0])
    out[..., :3][water] = np.clip(
        a[..., :3][water].astype(np.float64) * 0.55 + target * 0.45, 0, 255
    )
    clump = draw_clumps(out, plants, field, dark_pal, bright_pal, gen)
    # Second offset pass fills row gaps -> "aotа" density without losing rows.
    offs = [(px + int(gen.integers(-2, 3)) + 4, py + int(gen.integers(-1, 2)))
            for (px, py) in plants]
    clump |= draw_clumps(out, offs, field, dark_pal, bright_pal, gen)
    soften(out, clump)
    return out, clump


def make_autumn(a, summer, clump, field, soil_pal, plants):
    gen = np.random.default_rng(12)
    out = summer.copy()
    # Golden hue mapping keeps the clump value structure (brush detail) intact.
    rgb = out[..., :3][clump].astype(np.float64)
    v = rgb @ [0.299, 0.587, 0.114]
    v = v * 1.18 + 14.0  # ripe straw is lighter than green foliage
    gold = np.stack([v * 1.42, v * 1.12, v * 0.42], axis=-1)
    out[..., :3][clump] = np.clip(rgb * 0.14 + gold * 0.86, 0, 255)
    # Ripe-ear highlights: a few warm bright ticks near clump tops.
    h, w = field.shape
    for (px, py) in plants:
        for _ in range(3):
            x = px + int(gen.integers(-3, 4))
            y = py - 2 + int(gen.integers(-1, 2))
            if 0 <= x < w and 0 <= y < h and clump[y, x]:
                c = out[y, x, :3].astype(np.float64) + np.array([38, 30, 6])
                out[y, x, :3] = np.clip(c, 0, 255)
    # Drained paddy: dark wet soil from the ridge statistics.
    wet = field & ~clump
    base = soil_pal.mean(axis=0) * 0.58
    noise = smooth_noise(field.shape, 6, 14.0, gen)
    jit = gen.normal(0, 4, (field.shape[0], field.shape[1], 3))
    soil_img = base[None, None, :] * (1.0 + noise[..., None] * 0.045) + jit
    out[..., :3][wet] = np.clip(soil_img[wet], 0, 255)
    soften(out, ndimage.binary_dilation(clump, iterations=1) & field)
    return out


def make_winter(a, field, inner, soil, plants):
    gen = np.random.default_rng(13)
    out = a.copy()
    soil_pal = a[..., :3][soil].astype(np.float64)
    mean = soil_pal.mean(axis=0)
    luma = float(mean @ [0.299, 0.587, 0.114])
    # Dry harvested earth: ridge tone pulled toward gray (low saturation, dried).
    base = mean * 0.62 + np.array([luma, luma, luma]) * 0.38
    n1 = smooth_noise(field.shape, 5, 1.0, gen)
    n2 = smooth_noise(field.shape, 14, 1.0, gen)
    jit = gen.normal(0, 3.5, (field.shape[0], field.shape[1], 3))
    tex = base[None, None, :] * (1.0 + n1[..., None] * 0.13 + n2[..., None] * 0.10) + jit
    out[..., :3][field] = np.clip(tex[field], 0, 255)
    # Faint stubble rows on the original seedling grid.
    h, w = field.shape
    straw = np.clip(base * 1.38 + np.array([14, 8, -12]), 0, 255)
    shadow = np.clip(base * 0.72, 0, 255)
    for (px, py) in plants:
        x = px + int(gen.integers(-1, 2))
        y = py + int(gen.integers(-1, 2))
        for dx in (0, 1):
            if 0 <= x + dx < w and 0 <= y < h and inner[y, x + dx]:
                c = straw + gen.normal(0, 6, 3)
                out[y, x + dx, :3] = np.clip(c, 0, 255)
            if 0 <= x + dx < w and 0 <= y + 1 < h and inner[y + 1, x + dx]:
                c = shadow + gen.normal(0, 4, 3)
                out[y + 1, x + dx, :3] = np.clip(
                    out[y + 1, x + dx, :3] * 0.65 + c * 0.35, 0, 255
                )
    # Whole sprite slightly desaturated / dried (shape untouched).
    op = a[..., 3] > 0
    rgb = out[..., :3][op].astype(np.float64)
    v = rgb @ [0.299, 0.587, 0.114]
    out[..., :3][op] = np.clip(rgb * 0.90 + v[:, None] * 0.10, 0, 255)
    return out


def main():
    im = Image.open(SRC).convert("RGBA")
    a = np.asarray(im).copy()
    opaque, near_black, soil, field, inner = build_masks(a)
    plants = detect_plants(a, field, inner)
    dark_pal, bright_pal, water_pal, soil_pal = collect_palettes(a, field, soil)
    grown = fill_plant_gaps(plants, inner)
    print(f"plants={len(plants)} grown={len(grown)} field={int(field.sum())} soil={int(soil.sum())}")

    spring = a.copy()
    summer, clump = make_summer(a, field, grown, dark_pal, bright_pal)
    autumn = make_autumn(a, summer, clump, field, soil_pal, grown)
    winter = make_winter(a, field, inner, soil, plants)

    for name, arr in (("spring", spring), ("summer", summer),
                      ("autumn", autumn), ("winter", winter)):
        arr[..., 3] = a[..., 3]  # alpha strictly preserved
        path = os.path.join(OUT_DIR, f"building-farm-{name}.png")
        Image.fromarray(arr).save(path)
        print("wrote", path)

    # Contact sheet: original + four seasons at 2x for eyeballing.
    scale = 2
    pad = 8
    tiles = [np.asarray(im)] + [spring, summer, autumn, winter]
    labels = ["base", "spring", "summer", "autumn", "winter"]
    th, tw = a.shape[0] * scale, a.shape[1] * scale
    sheet = Image.new("RGBA", (tw + pad * 2, (th + pad) * len(tiles) + pad), (30, 30, 34, 255))
    for i, t in enumerate(tiles):
        tile = Image.fromarray(t).resize((tw, th), Image.NEAREST)
        sheet.paste(tile, (pad, pad + i * (th + pad)), tile)
    sheet.save("/tmp/farm-contact.png")
    print("wrote /tmp/farm-contact.png", labels)


if __name__ == "__main__":
    main()
