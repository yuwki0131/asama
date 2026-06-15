# Connected Construction Assets Direction Correction Ready

`requests/main2img/2026-06-15-connected-construction-assets-correction.md` has been handled.

The 64 connected construction variants have been regenerated with mask bits mapped to map-coordinate adjacency under the app's isometric projection:

```text
n -> upper-right
e -> lower-right
s -> lower-left
w -> upper-left
```

Important examples now follow the requested visual directions:

- `1000`: center to upper-right only
- `0100`: center to lower-right only
- `0010`: center to lower-left only
- `0001`: center to upper-left only
- `1010`: upper-right to lower-left run
- `0101`: lower-right to upper-left run
- `1111`: four-way junction

`0000` variants no longer draw implied connections:

- fence: isolated post cluster
- wall: compact standalone wall block
- dry moat: isolated trench patch
- water moat: isolated water patch

Validation run:

```text
pnpm run generate:main2img
pnpm run validate:generated-assets
pnpm --filter @asama/asset-tools typecheck
vipsheader public/assets/generated/building-fence-wood-connected-1000.png ...
```

All image-pipeline checks passed. The manifest remains at 91 assets, with 64 connected variants.
