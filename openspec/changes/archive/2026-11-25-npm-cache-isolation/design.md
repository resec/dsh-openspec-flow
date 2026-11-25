# Design

## Context

See `proposal.md` for why. The current state relevant to the approach:

- `scripts/lab/core/paths.mjs` resolves `LAB_NPM_CACHE ?? npm_config_cache ?? .cache/lab/cache/npm`; `scripts/lab/core/install.mjs` and `cache.mjs` pass the result to `npm pack`, `dsh plugin add` and `npm install`.
- `scripts/bootstrap.mjs` reads `npm_config_cache` once and passes it to `npm ci`, `npm run hooks:install`, `npm run verify`, `npm run test:lab` and `npx playwright install`.
- `scripts/worktree-env.mjs` exports `LAB_NPM_CACHE` and `npm_config_cache` from `renderPrint`; its exported `resolveNpmCache` has no production caller because `resolveEnvironment` hardcodes `<shared>/npm`.
- `npm run <script>` sets `npm_config_cache` to npm's configured cache (the host home cache by default), so honoring it always selects a path outside the workspace.
- The DSH bash sandbox is `workspace-write`; writes under the host home cache fail with EACCES, and npm reports that as "root-owned files" because the failing path is under the configured cache.

## Goals / Non-Goals

Goals: one explicit selector for the repository npm cache; no repository tooling selecting the host home cache; unchanged shared-cache reuse in worktrees; unchanged CI cache reuse; no dead resolver.

Non-goals: change npm's own handling of `npm_config_cache` for its children; widen the sandbox; change plugin runtime, tool schemas or bundle contents; keep `LAB_NPM_CACHE` as an alias.

## Decisions

1. Read only `OPENSPEC_FLOW_NPM_CACHE`. The `LAB_` prefix was correct when only the lab used it; bootstrap and the worktree environment now share the knob, and the `OPENSPEC_FLOW_` prefix matches `OPENSPEC_FLOW_SHARED_ROOT`, `OPENSPEC_FLOW_MAIN` and `OPENSPEC_FLOW_SHARED`.
   - Alternative: accept `LAB_NPM_CACHE` as a deprecated fallback. Rejected to keep one name; only repository scripts read it, the host shells inspected contain no reference, and the rename ships with its docs and tests.
2. Ignore `npm_config_cache` when selecting the cache. npm injects it into every lifecycle script, so it cannot distinguish operator intent from npm's default; `OPENSPEC_FLOW_NPM_CACHE` is the explicit override.
   - Alternative: honor `npm_config_cache` when the directory is writable. Rejected: a sandbox denial is not visible to a permission probe, and a write probe inside a path resolver is surprising.
3. Keep feeding npm its own variable. Bootstrap's child environment and `renderPrint` still set `npm_config_cache`, so `npm ci` and other npm commands keep one cache; they also set `OPENSPEC_FLOW_NPM_CACHE` so lab children under `npm run verify` and `npm run test:lab` select the same directory.
4. Delete the worktree-env resolver instead of renaming it. `resolveEnvironment` never calls it and the printed environment is the only cache output; keeping it would preserve a second rule in dead code.
5. Keep CI cache reuse with one step. The lab job writes `OPENSPEC_FLOW_NPM_CACHE=$HOME/.npm` to `$GITHUB_ENV` before the lab commands, pointing the lab at the directory setup-node restores; `test/ci-workflow.test.mjs` asserts the value and that the assignment precedes `npm run lab -- doctor`.

## Risks / Trade-offs

- Existing shells that export `LAB_NPM_CACHE` stop overriding the cache and fall back to the repository default, which is sandbox-safe → `docs/lab.md` and the bootstrap usage name the new variable; there is no data migration.
- The CI lab job downloads into a cold cache until the new step lands → the step is part of this change.
- The CI verify job's pack test now writes `.cache/lab/cache/npm` → the pack is a local-directory pack that needs no registry, and the path is inside the workspace.

## Migration Plan

1. Rename the readers and the printed export; delete the unused resolver.
2. Update tests, docs, the bootstrap usage and the CI step in the same change.
3. Rollback restores the previous names and precedence; only cache locations change, so no stored data is affected.
