# Design

## Context

See `proposal.md` - Why. The current workflow pins four Node 20 releases:

- `actions/checkout@v4` (verify and lab)
- `actions/setup-node@v4` (verify and lab)
- `actions/cache@v4` (lab, twice)
- `pnpm/action-setup@v4` (lab)

GitHub removed the Node 20 Actions runtime on 2026-09-23 and forces these releases onto Node 24 with a deprecation annotation. Each repository's `action.yml` was checked: v7.0.1 for checkout, v7.1.0 for setup-node, v6.1.0 for cache and v6.1.1 for pnpm/action-setup all declare `runs.using: node24`. The moving major tags currently resolve to those commits: `actions/checkout v7` → `3d3c42e`, `actions/setup-node v7` → `949feb2`, `actions/cache v6` → `55cc834`, `pnpm/action-setup v6` → `73e4699`.

The workflow's usage is narrow: checkout with `fetch-depth: 0`, setup-node with `node-version` and `cache: npm`, cache with `path`/`key`, and pnpm/action-setup with `version: 12.6.0`. It runs on `pull_request` and `push` to `main`, never `pull_request_target`, and it publishes no npm package.

## Goals / Non-Goals

**Goals:**

- Move all four actions to releases that declare the Node 24 runtime.
- Keep the workflow's four existing usages unchanged apart from the version tags.
- Make a regression to a Node 20 release fail the test suite.

**Non-Goals:**

- Pinning actions to commit SHAs.
- Changing the workflow's triggers, permissions, caches or steps.
- Adding a Renovate/Dependabot configuration for action updates.

## Decisions

**Decision 1: use the moving major tags, not patch tags or commit SHAs.**

The repository already pins every action by major tag (`@v4`), so `@v7` and `@v6` keep one policy. The major tag currently resolves to the latest patch (verified by comparing the commit each tag resolves to), so it already carries the pnpm 12 support that first appeared in v6.1.0. A patch tag would be reproducible but would need manual follow-up for every security fix; a SHA would be the strictest but is not the repository's existing convention. Alternatives considered: patch tags and SHAs; rejected for inconsistency and maintenance cost.

**Decision 2: jump to the latest major versions, not the lowest Node 24 major.**

GitHub's migration notice asks workflow authors to update to the latest versions. The breaking changes in these majors do not touch the repository: checkout v7's `pull_request_target` restriction does not apply because the workflow only runs `pull_request` and `push`; setup-node v7 removes a dummy `NODE_AUTH_TOKEN` export that this repository never reads; cache v6 is an ESM migration with the same inputs and outputs. Alternative considered: the lowest Node 24 majors (v5 for checkout/setup-node/cache); rejected because the pnpm action's v5 release only moved the runtime and v6.1.0 is where pnpm 12 support is declared, and because it would shorten the interval before the next upgrade.

**Decision 3: assert all four versions in the workflow test.**

The warning covers four actions, so the test asserts each major tag rather than only the pnpm tag. The existing pnpm assertion already checks the action appears in the lab job; the new assertions check the exact major version, so a revert to v4 fails before CI runs. Alternative considered: assert only the runtime by downloading each `action.yml`; rejected because the test suite must run offline.

## Risks / Trade-offs

- [A moved major tag can bring an unreviewed patch change] → Accepted: the test asserts the major text, not the commit, so it cannot detect a retag; the next CI run is the control, and this is the same exposure the repository already accepts with `@v4`.
- [checkout v7's safer `pull_request_target` default changes behavior] → The workflow has no `pull_request_target` trigger, so the change is inert.
- [setup-node v7's ESM migration breaks an input] → Only `node-version` and `cache: npm` are used; both remain documented inputs.
- [A major-version jump fails the first CI run] → The change is a single commit with no runtime surface; revert it if either job fails.

## Migration Plan

Revert the commit. No stored data, configuration or runtime surface is involved.

## Open Questions

None.
