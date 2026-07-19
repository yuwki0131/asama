#!/usr/bin/env python3
"""Derive seasonal farm rasters from the hand-painted spring base.

The painterly raster assets/source/raster/building-farm.png (deep blue-green
paddy water + orderly seedling rows + textured ridges) is the quality bar.
Instead of re-rendering the paddy in Blender (which came out much coarser),
this script derives summer/autumn/winter variants purely by image processing
so brushwork, noise character and the ridge/plot structure stay identical to
the original in all four seasons.

  spring : verbatim copy of the source painting
  summer : each seedling grid point becomes a sharp blade tuft - a fountain
           of 1px strokes fanning up from the base (dark waterline foot /
           leaf body / bright pointed tip) over darkened paddy water, drawn
           back-to-front so front rows overlap the feet of the rows behind;
           the row (jo-ue) regularity of real transplanted paddies survives
  autumn : the same tuft renderer in ripe-gold styling - the tall center
           blades hook over into bright drooping ears, straw feet, drained
           field floor of dark wet soil sampled from the ridge statistics
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


def lattice_plants(inner, gen, in_row=(4, 2), row_step=(6, -3)):
    """Grown-season plant positions on a strict jo-ue (条植え) lattice.

    A transplanted paddy's signature is its row regularity, so instead of
    reusing the painterly seedling scatter, tufts sit on an isometric
    lattice: rows run along the (2,1) diamond edge (in_row spacing keeps
    the canopy closed along the row), rows repeat along the (2,-1) axis
    with a wider gap so the flooded floor glints through as row seams.
    Jitter stays sub-pixel-ish (±≤1) - enough to kill the mechanical read
    without breaking the alignment."""
    h, w = inner.shape
    out = []
    for j in range(-24, 25):
        for i in range(-40, 41):
            x = w // 2 + i * in_row[0] + j * row_step[0]
            y = h // 2 + i * in_row[1] + j * row_step[1]
            x += int(round(gen.normal(0, 0.45)))
            if 0 <= x < w and 0 <= y < h and inner[y, x]:
                out.append((x, y))
    return out


def draw_rice_tufts(out, plants, field, canvas, style, gen):
    """Paint rice as sharp blade tufts (back-to-front) for summer/autumn.

    Real rice reads as spiky, linear texture - each transplanted tuft (株) is
    a fountain of thin blades rising from one base point and fanning outward,
    every blade ending in a sharp bright tip. So instead of filled ellipses
    each tuft is 5-8 one-pixel strokes: dark at the waterline, leaf-green
    body, light sharp tip. Outer blades are shorter and lean out (the fan),
    the center blades stand tallest. Autumn adds a drooping ear: the tallest
    blades hook sideways-down at the top in bright gold (heavy panicles).
    Back-to-front drawing lets front tufts overlap the feet of the row
    behind. Strokes may land anywhere on `canvas` (eroded opaque body):
    clipping them to the paddy interior capped the rice at the ridge line
    and flattened the perceived height - a grown paddy stands ABOVE the
    ridge behind it, so blades are allowed to overlap interior ridges.
    Returns the tuft mask."""
    h, w = field.shape
    tufts = np.zeros((h, w), bool)
    base_c = np.asarray(style["base"], np.float64)
    mid_c = np.asarray(style["mid"], np.float64)
    tip_c = np.asarray(style["tip"], np.float64)
    positions = sorted(plants, key=lambda p: (p[1], p[0]))
    # Cast at most once per pixel: neighbouring tufts (6 px apart, 5 px
    # shadow) overlap, and stacked multiplications (0.66^2, 0.66^3) turn
    # the warm floor into near-black pepper speckle.
    casted = np.zeros((h, w), bool)
    for (px, py) in positions:
        tone = gen.normal(0, style["tone_jit"], 3)  # per-tuft hue drift
        # Small cast shadow at the waterline under the tuft.
        for dx in range(-2, 3):
            x, y = px + dx, py + 1
            if 0 <= x < w and 0 <= y < h and field[y, x] and not casted[y, x]:
                casted[y, x] = True
                out[y, x, :3] = np.clip(
                    out[y, x, :3].astype(np.float64) * style["cast"], 0, 255)
        nb = int(gen.integers(style["blades"][0], style["blades"][1] + 1))
        offs = np.linspace(-style["spread"], style["spread"], nb)
        gen.shuffle(offs)  # draw order varies so overlaps don't band
        for off in offs:
            length = style["len"] + int(gen.integers(-1, 2))
            if abs(off) > style["spread"] * 0.6:
                length = max(2, length - 2)  # outer blades shorter
            lean = off * style["fan"] + gen.normal(0, 0.3)
            bx = px + int(round(off * 0.5))
            for t in range(length + 1):
                u = t / max(1, length)
                x = bx + int(round(lean * u))
                y = py - t
                if not (0 <= x < w and 0 <= y < h) or not canvas[y, x]:
                    continue
                if u < 0.35:
                    c = base_c
                elif u < 0.78:
                    c = mid_c
                else:
                    c = tip_c
                out[y, x, :3] = np.clip(c + tone + gen.normal(0, style["px_jit"], 3), 0, 255)
                tufts[y, x] = True
    # Ripe panicles (autumn), drawn as a SECOND pass over the closed canopy:
    # if ears were drawn per tuft, the blades of later-drawn neighbours
    # (spacing 6 px, ears 4-7 px long) would overwrite and fragment the
    # arcs. Each ear rises from the crown, arcs over and sags under the
    # grain weight, ending in a 2 px grain cluster. A field-wide wind bias
    # (style["ear_dir"]) combs most ears the same way - the signature
    # texture of a ripe paddy - with a minority breaking against it so the
    # field doesn't go mechanical. Ear strokes stay noise-free: pixel
    # jitter breaks the 1 px arc into confetti and kills legibility.
    if style.get("ear") is not None:
        ear_c = np.asarray(style["ear"], np.float64)
        hi_c = np.asarray(style["ear_hi"], np.float64)
        for px, py in positions:
            tone = gen.normal(0, style["tone_jit"] * 0.5, 3)
            for _ in range(int(gen.integers(1, 3))):
                sx = px + int(round(gen.normal(0, 1.0)))
                sy = py - style["len"] + int(gen.integers(-1, 2))
                dirx = style["ear_dir"] if gen.random() < 0.86 else -style["ear_dir"]
                elen = int(gen.integers(4, 7))
                for k in range(elen + 1):
                    x = sx + dirx * k
                    y = sy - 1 + int(round(0.16 * k * k))  # rise, then sag
                    cluster = k >= elen - 1
                    c = ear_c * 0.88 if k < 2 else (hi_c if cluster else ear_c)
                    for yy in ((y, y + 1) if cluster else (y,)):
                        cc = ear_c if yy != y else c  # underside of the grain mass
                        if 0 <= x < w and 0 <= yy < h and canvas[yy, x]:
                            out[yy, x, :3] = np.clip(cc + tone, 0, 255)
                            tufts[yy, x] = True
    return tufts


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


def make_summer(a, field, canvas, plants, dark_pal, bright_pal, water_pal):
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
    floor_target = np.array([26.0, 46.0, 36.0])  # dark shaded water, green-leaning
    out[..., :3][field] = np.clip(
        out[..., :3][field].astype(np.float64) * 0.42 + floor_target * 0.58, 0, 255)
    # Mid-summer blade tufts anchored to the painting's green statistics.
    g_dark = dark_pal.mean(axis=0)
    g_bright = bright_pal.mean(axis=0)
    # Mid-summer canopy nearly closes ALONG the row; the wider row gap keeps
    # the flooded floor glinting through as seams (jo-ue read). Blades stand
    # tall and near-vertical: low fan/spread = the upright stance of healthy
    # mid-summer rice, len 10 so the canopy rises visibly above the ridges.
    style = {
        "blades": (9, 12), "len": 10, "spread": 2.6, "fan": 0.6,
        "base": np.array([30.0, 55.0, 34.0]),
        "mid": np.clip(g_dark * 0.35 + np.array([66, 112, 50]) * 0.65, 0, 255),
        "tip": np.clip(g_bright * 0.40 + np.array([142, 186, 76]) * 0.60, 0, 255),
        "cast": 0.62, "tone_jit": 5.0, "px_jit": 7.0,
    }
    tufts = draw_rice_tufts(out, plants, field, canvas, style, gen)
    painterly_mottle(out, tufts, gen, amp=0.06, warm=3.5)
    soften(out, tufts, blur_w=0.15)
    return out, tufts


def make_autumn(a, field, canvas, plants, soil_pal):
    gen = np.random.default_rng(12)
    out = a.copy()
    # The base painting's near-black waterline pixels are excluded from the
    # field mask, so they would survive the floor fill as pepper speckle on
    # the golden canopy. Reclaim the ones in the paddy interior (eroding
    # keeps the ridge-outline blacks intact) into the autumn field.
    nb = (a[..., 3] > 128) & (a[..., :3].max(axis=2) < 40)
    interior = ndimage.binary_erosion(field | nb, iterations=2)
    field = field | (nb & interior)
    # Field floor: a ripe paddy hides its soil completely - what shows
    # between the rows is the shaded lower straw, so the floor is a dark
    # warm gold, not damp earth. This keeps the canopy reading as one
    # continuous golden surface instead of bright dots on dark ground.
    base = np.array([112.0, 88.0, 46.0])
    noise = smooth_noise(field.shape, 6, 14.0, gen)
    jit = gen.normal(0, 4, (field.shape[0], field.shape[1], 3))
    soil_img = base[None, None, :] * (1.0 + noise[..., None] * 0.06) + jit
    out[..., :3][field] = np.clip(soil_img[field], 0, 255)
    # Ripe blade tufts: dry gold stalks, sharp tips, drooping bright ears
    # hooking off the tall center blades (heavy panicles).
    # Ripe paddy: dense straw body with the blade tips held below the ear
    # tone, so the drooping gold panicles read as the top layer of the field.
    # Value separation is what keeps a ripe paddy linear instead of a golden
    # mush: the straw body sits well below the ears in brightness, so the
    # drooping panicle arcs are the ONLY bright layer and stay legible.
    style = {
        "blades": (9, 11), "len": 10, "spread": 2.4, "fan": 0.6,
        "base": np.array([118.0, 90.0, 46.0]),   # shaded stalk foot, near the floor tone
        "mid": np.array([158.0, 120.0, 48.0]),   # ripe straw body, kept dim
        "tip": np.array([178.0, 138.0, 60.0]),   # blade tip, well under the ears
        "ear": np.array([238.0, 202.0, 100.0]),  # panicle stem and grains
        "ear_hi": np.array([252.0, 224.0, 128.0]),  # sunlit grain cluster
        "ear_dir": 1 if gen.random() < 0.5 else -1,  # field-wide wind bias
        "cast": 0.66, "tone_jit": 6.0, "px_jit": 3.5,
    }
    tufts = draw_rice_tufts(out, plants, field, canvas, style, gen)
    painterly_mottle(out, tufts, gen, amp=0.05, warm=4.5)
    soften(out, tufts, blur_w=0.15)
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
    canvas = ndimage.binary_erosion(opaque, iterations=2)
    grown = lattice_plants(inner, np.random.default_rng(21))
    print(f"plants={len(plants)} grown={len(grown)} field={int(field.sum())} soil={int(soil.sum())}")

    spring = a.copy()
    summer, _hills = make_summer(a, field, canvas, grown, dark_pal, bright_pal, water_pal)
    autumn = make_autumn(a, field, canvas, grown, soil_pal)
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
