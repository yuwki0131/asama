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

## Coding Style & Naming Conventions

Use TypeScript for implementation. Keep simulation code independent of React, PixiJS, DOM, and Node APIs. Prefer data-driven definitions over hard-coded unit or building names.

Use stable IDs for content and entities. Display names are not identifiers. Planned content definitions should use JSONC during development and validated typed data at runtime.

Markdown should be concise, use descriptive headings, and avoid locking unresolved balance values into permanent rules.

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
