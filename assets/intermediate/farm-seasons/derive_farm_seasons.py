#!/usr/bin/env python3
"""Derive seasonal farm rasters from the hand-painted spring base.

The painterly raster assets/source/raster/building-farm.png (deep blue-green
paddy water + orderly seedling rows + textured ridges) is the quality bar.
Instead of re-rendering the paddy in Blender (which came out much coarser),
this script derives summer/autumn/winter variants purely by image processing
so brushwork, noise character and the ridge/plot structure stay identical to
the original in all four seasons.

  spring : verbatim copy of the source painting
  summer : each seedling grid point becomes a standing rice hill - a 2:1 iso
           ellipse shaded in three values (sunlit tip / leaf body / foot
           shadow) with a cast shadow on the darkened paddy water, drawn
           back-to-front so front rows overlap the feet of the rows behind;
           the row (jo-ue) regularity of real transplanted paddies survives
  autumn : the same hill renderer in ripe-gold styling - heavy drooping ears
           bulge the hill tops, straw-brown feet, drained field floor of dark
           wet soil sampled from the ridge statistics
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


def draw_rice_hills(out, plants, field, style, gen):
    """Paint procedurally shaded rice hills (back-to-front) for summer/autumn.

    Each hill is an ellipse elongated along the iso row axis (2,1) - real
    transplanted rows merge into ridge-like bands at this scale - with three
    value bands (sunlit crown / leaf body / dark foot), a 1px cast shadow on
    the field floor and a few 1px ticks above the crown (standing leaf tips
    in summer, nodding ear heads in autumn). Drawing back-to-front lets each
    front row overlap the feet of the row behind it, which is what sells the
    standing-plant look. Returns the hill mask."""
    h, w = field.shape
    hills = np.zeros((h, w), bool)
    hi = np.asarray(style["hi"], np.float64)
    mid = np.asarray(style["mid"], np.float64)
    lo = np.asarray(style["lo"], np.float64)
    tick_c = np.asarray(style["tick"], np.float64)
    s5 = np.sqrt(5.0)
    for (px, py) in sorted(plants, key=lambda p: (p[1], p[0])):
        ra = style["ra"] + gen.normal(0, 0.45)  # along-row half length
        rb = style["rb"] + gen.normal(0, 0.20)  # across-row half width
        # Vertical extent of the sheared ellipse (for shading / shadow).
        yext = np.sqrt((ra / s5) ** 2 + (rb * 2.0 / s5) ** 2)
        xext = np.sqrt((ra * 2.0 / s5) ** 2 + (rb / s5) ** 2)
        tone = gen.normal(0, style["tone_jit"], 3)  # per-hill hue drift
        # Cast shadow: darken the floor strip just under the hill.
        sy = py + int(round(yext))
        for dx in range(-int(xext), int(xext) + 1):
            x, y = px + dx, sy + 1
            if 0 <= x < w and 0 <= y < h and field[y, x] and abs(dx) <= xext * 0.8:
                out[y, x, :3] = np.clip(
                    out[y, x, :3].astype(np.float64) * style["cast"], 0, 255)
        # Standing leaf tips / ear heads poke above the crown.
        for _ in range(style["ticks"]):
            x = px + int(gen.integers(-1, 2))
            y = py - int(round(yext)) - int(gen.integers(1, style["tick_lift"] + 1))
            if 0 <= x < w and 0 <= y < h and field[y, x]:
                out[y, x, :3] = np.clip(tick_c + tone + gen.normal(0, 9, 3), 0, 255)
                hills[y, x] = True
        # Hill body: three value bands top-to-bottom.
        for dy in range(-int(yext) - 1, int(yext) + 2):
            for dx in range(-int(xext) - 1, int(xext) + 2):
                pa = (2.0 * dx + dy) / s5      # along the row axis
                pb = (-dx + 2.0 * dy) / s5     # across the rows
                d = (pa / ra) ** 2 + (pb / rb) ** 2
                if d > 1.0 + gen.normal(0, 0.06):
                    continue
                x, y = px + dx, py + dy
                if not (0 <= x < w and 0 <= y < h) or not field[y, x]:
                    continue
                t = dy / yext  # -1 crown .. +1 foot
                # Three-value shading with dithered band edges (crown
                # highlight / leaf body / foot shadow) - painterly, not
                # hard horizontal stripes.
                u = (t + 1.0) / 2.0 + gen.normal(0, 0.09)
                u = min(1.0, max(0.0, u))
                if u < 0.30:
                    c = hi
                elif u < 0.42:
                    k = (u - 0.30) / 0.12
                    c = hi * (1 - k) + mid * k
                elif u < 0.72:
                    c = mid
                elif u < 0.86:
                    k = (u - 0.72) / 0.14
                    c = mid * (1 - k) + lo * k
                else:
                    c = lo
                # Rim rolls darker so each hill reads as a rounded volume.
                c = c * (1.0 - 0.14 * max(0.0, d - 0.50))
                c = c + tone + gen.normal(0, style["px_jit"], 3)
                out[y, x, :3] = np.clip(c, 0, 255)
                hills[y, x] = True
    return hills


def soften(out, mask, blur_w=0.55):
    """Mild selective blur so grown pixels sit in the original brushwork."""
    rgb = out[..., :3].astype(np.float64)
    blurred = np.stack([ndimage.uniform_filter(rgb[..., i], 3) for i in range(3)], axis=-1)
    zone = ndimage.binary_dilation(mask, iterations=1)
    out[..., :3][zone] = np.clip(rgb[zone] * (1.0 - blur_w) + blurred[zone] * blur_w, 0, 255)


def painterly_mottle(out, mask, gen, amp=0.05, warm=3.0):
    """Low-frequency value/hue drift over the plant layer - keeps the hand-
    painted patchiness of the base so the hills never read as a dot matrix."""
    n = smooth_noise(mask.shape, 9, 1.0, gen)
    rgb = out[..., :3].astype(np.float64)
    drift = n[..., None] * np.array([warm, amp * 60.0, -warm * 0.6])
    out[..., :3][mask] = np.clip(
        rgb[mask] * (1.0 + n[mask, None] * amp) + drift[mask], 0, 255)


def make_summer(a, field, plants, dark_pal, bright_pal, water_pal):
    gen = np.random.default_rng(11)
    out = a.copy()
    # Field floor: flooded paddy in deep shade under the canopy. Replace the
    # April seedling dots with the painting's own water tone first, then pull
    # everything darker so the green hills pop against it.
    r, g, b = (a[..., i].astype(int) for i in range(3))
    green_px = field & (g > b + 12)
    w_mean = water_pal.mean(axis=0)
    out[..., :3][green_px] = np.clip(
        a[..., :3][green_px].astype(np.float64) * 0.30 + w_mean * 0.70, 0, 255)
    floor_target = np.array([30.0, 48.0, 44.0])  # dark shaded water
    out[..., :3][field] = np.clip(
        out[..., :3][field].astype(np.float64) * 0.42 + floor_target * 0.58, 0, 255)
    # Mid-summer rice hills anchored to the painting's green statistics.
    g_dark = dark_pal.mean(axis=0)
    g_bright = bright_pal.mean(axis=0)
    style = {
        "ra": 5.9, "rb": 2.4,
        "hi": np.clip(g_bright * 0.45 + np.array([116, 158, 62]) * 0.55, 0, 255),
        "mid": np.clip(g_dark * 0.35 + np.array([64, 108, 50]) * 0.65, 0, 255),
        "lo": np.array([28.0, 52.0, 33.0]),
        "tick": np.array([122.0, 162.0, 68.0]),
        "ticks": 2, "tick_lift": 1,
        "cast": 0.62, "tone_jit": 5.0, "px_jit": 6.0,
    }
    hills = draw_rice_hills(out, plants, field, style, gen)
    painterly_mottle(out, hills, gen, amp=0.06, warm=3.5)
    soften(out, hills, blur_w=0.35)
    return out, hills


def make_autumn(a, field, plants, soil_pal):
    gen = np.random.default_rng(12)
    out = a.copy()
    # Drained field floor: dark damp soil from the ridge statistics.
    base = soil_pal.mean(axis=0) * 0.60
    noise = smooth_noise(field.shape, 6, 14.0, gen)
    jit = gen.normal(0, 4, (field.shape[0], field.shape[1], 3))
    soil_img = base[None, None, :] * (1.0 + noise[..., None] * 0.045) + jit
    out[..., :3][field] = np.clip(soil_img[field], 0, 255)
    # Ripe rice hills: heavy ears bulge the crowns (slightly rounder than
    # summer), deep gold body, straw-brown feet on dry stalks.
    style = {
        "ra": 5.3, "rb": 2.4,
        "hi": np.array([234.0, 196.0, 96.0]),   # sunlit ear mass
        "mid": np.array([196.0, 150.0, 58.0]),  # ripe straw body
        "lo": np.array([116.0, 80.0, 38.0]),    # shaded dry stalk foot
        "tick": np.array([214.0, 168.0, 74.0]),  # nodding ear heads
        "ticks": 2, "tick_lift": 1,
        "cast": 0.66, "tone_jit": 7.0, "px_jit": 6.0,
    }
    hills = draw_rice_hills(out, plants, field, style, gen)
    painterly_mottle(out, hills, gen, amp=0.05, warm=4.5)
    soften(out, hills, blur_w=0.35)
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
    summer, _hills = make_summer(a, field, grown, dark_pal, bright_pal, water_pal)
    autumn = make_autumn(a, field, grown, soil_pal)
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
    sheet.save("/tmp/farm-rice-contact.png")
    print("wrote /tmp/farm-rice-contact.png", labels)


if __name__ == "__main__":
    main()
