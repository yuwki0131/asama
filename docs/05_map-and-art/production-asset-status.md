# Production Asset Status

## Classification

- `approved-production`: gameplay use approved for the current art direction.
- `approved-ai candidate`: pipeline-compatible temporary source, but not final production art.
- `procedural/debug`: overlays and diagnostic assets that may remain generated.

## Runtime Audit

As of 2026-06-19, the runtime production definition contains:

- 194 reviewed raster assets produced from image-generated or corrected production sources.
- 0 runtime-compatible candidates produced primarily by deterministic Sharp drawing rules.
- 10 generated overlay/debug assets intentionally outside production raster definitions.

Directory placement does not determine production quality. Assets generated primarily from polygons, lines, gradients, or deterministic texture rules remain candidates even when stored below `approved-production`.

## Candidate/Mock Runtime Assets

No production runtime assets are currently listed as candidates. The fortification
families, farm, terrain surfaces, and bridges were replaced with approved raster
sources on 2026-06-18.

## Intentional Generated Assets

Selection, movement, path, building-preview, demolition, blocked-cell, and debug markers remain procedural assets by policy. `building.honmaru.marker` is also a gameplay marker rather than production environment art.

## Completed Requests

See:

```text
requests/main2img/2026-06-18-production-art-terrain-units-runtime-gap.md
requests/img2main/2026-06-18-production-art-terrain-units-runtime-gap-ready.md
requests/main2img/2026-06-18-production-art-mock-removal-fortifications-surfaces.md
requests/img2main/2026-06-18-production-art-mock-removal-fortifications-surfaces-ready.md
requests/main2img/2026-06-19-wide-moat-and-surface-transitions.md
requests/img2main/2026-06-19-wide-moat-and-surface-transitions-ready.md
```

Run the explicit quality audit with:

```text
pnpm run assets:audit:production
```

The audit must pass with zero candidate findings.

## Completed Surface Correction

Wide dry/water moats and connected `N,E,S,W` terrain and road families are
integrated as approved raster production sources:

```text
requests/main2img/2026-06-19-wide-moat-and-surface-transitions.md
requests/img2main/2026-06-19-wide-moat-and-surface-transitions-ready.md
```

Directional production-scale walls and gates are integrated from:

```text
requests/main2img/2026-06-19-large-directional-wall-gates.md
requests/img2main/2026-06-19-large-directional-wall-gates-ready.md
```
