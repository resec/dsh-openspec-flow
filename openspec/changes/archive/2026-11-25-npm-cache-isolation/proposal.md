# npm cache isolation

## Why

npm exports `npm_config_cache` to every lifecycle script, so repository tooling that honors it selects the host home cache. A workspace-write sandbox denies writes there; `npm pack` then fails with EACCES and npm adds a misleading "root-owned files" hint. This blocked the pre-push `npm run verify` in DSH even though the cache was owned by the current user.

## What Changes

- Rename `LAB_NPM_CACHE` to `OPENSPEC_FLOW_NPM_CACHE` (**BREAKING**: no alias; shells that export the old name must switch).
- The lab and bootstrap resolve their npm cache from `OPENSPEC_FLOW_NPM_CACHE` only and fall back to their repository-local defaults; they no longer select it through `npm_config_cache`.
- Delete the unused `resolveNpmCache` in `scripts/worktree-env.mjs`; its `print` output exports `OPENSPEC_FLOW_NPM_CACHE` with the shared npm cache while keeping `npm_config_cache` for npm itself.
- Bootstrap propagates the resolved cache to its npm children as both variables, so `npm run verify` and `npm run test:lab` resolve the same cache.
- The CI lab job pins `OPENSPEC_FLOW_NPM_CACHE` to the setup-node cache, and the workflow test asserts the value and its position.
- Update `docs/lab.md`, the bootstrap usage, and the `apply-worktree-environment` spec.

## Capabilities

### Modified Capabilities

- `apply-worktree-environment`: the "Lab and bootstrap honor the environment" requirement selects the npm cache from `OPENSPEC_FLOW_NPM_CACHE` instead of `LAB_NPM_CACHE`/`npm_config_cache`, and the printed environment exports the renamed variable.
- `contributor-workflow`: the lab job sets `OPENSPEC_FLOW_NPM_CACHE` to the setup-node cache before any lab command, and the workflow test asserts the value and its position.

## Impact

Repository tooling only: `scripts/lab/core/paths.mjs`, `scripts/bootstrap.mjs`, `scripts/worktree-env.mjs`, their tests, `docs/lab.md`, the bootstrap usage text, the CI lab job and the workflow test. No plugin runtime, tool schema, or bundle content changes.
