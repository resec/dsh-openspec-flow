# Proposal

## Why

The tool-surface path rule requires tool output paths under the resolved OpenSpec root to be relative to it, and every response that carries relative paths to carry that root: `openspec/specs/tool-surface/spec.md:131`. The worktree requirement adds that `openspec_apply_next` returns `worktree.path` relative to `root.path` and keeps `root.path` as the main root (`:1339`). Three surfaces do not follow the rule:

- `openspec_inspect` `action: "worktree"` hard-codes `root` as the session directory with `source: "nearest"`, so after an apply the root names the worktree instead of the resolved root, and `state.path`, `state.worktree`, `locks[].path` and `worktree.path` come back absolute.
- `openspec_apply_worktree` `action: "land"` and `action: "remove"` return absolute `manifest`, `worktree` and `path` values and carry no `root`, so a caller cannot place them.
- `openspec_archive` drops `root` on the validation-failure branch while its `issues[].path` values are relative, so those paths have no base.

## What Changes

- Resolve the root for the worktree inspection once, through the resolver, from the main checkout: `root.path` and `root.source` are reported, never assumed.
- Project `state.path`, `state.worktree`, `locks[].path` and `worktree.path` against that root; a path outside it stays absolute and is not rewritten with `..`.
- Add `root` to the land and remove results and project `manifest`, `worktree` and `path` the same way.
- Add `root` to the archive validation-failure result so `issues[].path` has a base.
- Declare `root` in the worktree, land and remove output schemas.
- When no OpenSpec root resolves, the response carries no `root` and keeps absolute paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `tool-surface` already requires this behavior in `Project-internal paths are relative to the resolved root` and `Apply tools expose the worktree and the session directory`; only the implementation and its tests lag, so this change sets `skip_specs: true`.

## Impact

- `lib/tools/query.js`: the worktree inspection root and path projection.
- `lib/tools/worktree.js`: the land and remove result root and path projection.
- `lib/tools/write.js`: the archive validation-failure result.
- `lib/tools/shared.js`: one shared root resolver.
- `test/worktree-inspect.test.mjs`, `test/worktree-land.test.mjs`, `test/apply-worktree.test.mjs`, `test/integration.test.mjs`, `test/apply-worktree-doc.test.mjs`.
- `docs/apply-worktree.md`: the inspection, land and remove result shapes.
- No dependency, hook, workflow, coverage-baseline or `dist/` change.
