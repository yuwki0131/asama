# Repository Guidelines

## Project Structure & Module Organization

This repository contains the game specification and technical design for a local single-player Japanese castle RTS.

- `docs/README.md`: entry point, document priority, and reading order.
- `docs/01_overview/`: concept, principles, terminology.
- `docs/02_game-rules/` through `docs/07_scenarios/`: gameplay, combat, content, map/art, UI, and scenario rules.
- `docs/08_data-model/`: conceptual data, save data, content and scenario definitions.
- `docs/09_technical-design/`: implementation architecture, simulation loop, rendering, persistence, local server, assets.
- `docs/10_development/`: MVP scope, roadmap, testing policy, unresolved issues.

Planned implementation layout is in `docs/09_technical-design/architecture.md`: `apps/game/` for client/server code and `packages/` for `simulation`, `content`, `shared`, and `asset-tools`.

## Build, Test, and Development Commands

Use pnpm workspaces from the repository root.

- `pnpm install`: install workspace dependencies.
- `pnpm run dev`: start the Vite client at `127.0.0.1:5173`.
- `pnpm --filter @asama/game dev:server`: start the local Fastify API at `127.0.0.1:3000`.
- `pnpm test`: run Vitest across packages.
- `pnpm run typecheck`: run TypeScript checks.
- `pnpm run build`: build all workspace packages and the game client.
- `pnpm run generate:assets`: generate placeholder PNG assets and a manifest.
- `pnpm run validate:assets`: validate generated asset manifest and PNG dimensions.
- `pnpm run clean:assets`: remove generated placeholder assets.

## Coding Style & Naming Conventions

Use TypeScript for implementation. Keep simulation code independent of React, PixiJS, DOM, and Node APIs. Prefer data-driven definitions over hard-coded unit or building names.

Use stable IDs for content and entities. Display names are not identifiers. Planned content definitions should use JSONC during development and validated typed data at runtime.

Markdown should be concise, use descriptive headings, and avoid locking unresolved balance values into permanent rules.

Generated image files under `public/assets/placeholders/` should not be hand-edited. Update `assets/source/placeholder-assets.json` and rerun asset generation.

## Testing Guidelines

The planned test framework is Vitest. Follow `docs/10_development/testing-policy.md` for required coverage areas, especially pathfinding, honmaru logic, food supply, construction, siege actions, and save/load.

When adding code, place tests near the relevant package or in a consistent `tests/` structure. Prefer deterministic tests using fixed seeds.

## Commit & Pull Request Guidelines

Current history uses short imperative messages, for example `init` and `add base docs`. Continue with concise, present-tense commits such as `add simulation loop design` or `implement map renderer scaffold`.

Pull requests should include:

- Summary of changed behavior or docs.
- Links to related issues or unresolved decisions.
- Test results or reason tests were not run.
- Screenshots or recordings for UI/rendering changes.

## Agent-Specific Instructions

Respect the document priority in `docs/README.md`. If a specification is unresolved, parameterize the implementation and update `docs/10_development/unresolved-issues.md` rather than making a hidden permanent decision.

## Visual QA Gate

Any change that affects rendered art (generated PNGs, manifest, Blender or
raster pipelines, renderer visuals) must pass the visual QA gate BEFORE the
result is shown to the user or a PR is opened:

- L1 machine lint: `pnpm assets:lint:art` with zero new violations.
  Known violations live in `assets/definitions/art-lint-baseline.json`;
  never hide a violation you just introduced by adding it to the baseline.
- L2 self review: fixed-viewpoint screenshots via
  `node apps/game/qa/shot.mjs --preset <name>` (presets in
  `assets/definitions/review-shots.json`), judged by a SEPARATE-context
  agent against the rule IDs in `docs/05_map-and-art/art-rulebook.md`.

When the user rejects a visual, closing the fix cycle REQUIRES adding a
rule: a checker in `packages/asset-tools/src/artLint/checks.ts` if machine
checkable, otherwise one line in `art-rulebook.md` (PROC-01).

Full procedure: `.claude/skills/art-review/SKILL.md`.


## AGENTS.md追記本文

```md
## Production Asset Policy

Before modifying asset definitions, asset generation, generated PNGs,
PixiJS sprite rendering, or files under `packages/asset-tools/`, read:

- `docs/05_map-and-art/art-direction.md`
- `docs/05_map-and-art/asset-pipeline.md`
- the relevant request under `requests/main2img/`

The TypeScript/SVG asset generator is a placeholder and debug asset
pipeline. Do not extend SVG templates as the primary way to create
production buildings, terrain, trees, vegetation, units, or vehicles.

Production assets must enter through the Blender or approved raster
pipeline while preserving:

- asset IDs
- logical footprints
- PNG canvas sizes
- anchors
- transparency
- runtime manifest compatibility
- validation
- reproducibility

The game runtime must not depend on whether an asset originated from
procedural SVG, Blender, hand-authored raster art, or an approved
AI-assisted raster source.

For production-art migration work, follow:

- `requests/main2img/2026-06-15-production-art-pipeline-migration.md`

Do not silently convert unresolved visual or historical decisions into
hard-coded permanent behavior. Parameterize them and record them in
`docs/10_development/unresolved-issues.md`.
```

---

## 推奨配置

```text
AGENTS.md

docs/05_map-and-art/
├── art-direction.md
├── asset-pipeline.md
└── references/
    └── target-gameplay-screen.png

requests/main2img/
└── 2026-06-15-production-art-pipeline-migration.md
```

Codexへの通常の依頼は次の形で十分です。

```text
AGENTS.mdと以下の依頼書を読んで実装してください。

requests/main2img/2026-06-15-production-art-pipeline-migration.md
```
