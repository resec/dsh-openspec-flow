# Proposal: Push landed main explicitly

## Why

A plugin-created apply worktree finishes with `openspec_apply_worktree action=land`, which writes a landed manifest under the git common directory and never pushes. The maintainer's next step is a manual `git push`; that step has no repository-side check that the selected manifest is complete, that main is exactly the landed archive commit, or that the remote has not diverged. A mistaken push can publish a partial range or race a remote that another worker already advanced.

## What Changes

- Add a repository-side `scripts/push-landed.mjs` that discovers landed manifests, validates the selected manifest and main, and pushes `main` only when `--push` is passed. The default is a dry run.
- Add `docs/land-push.md` documenting the commands, checks, failure modes and the boundary between the plugin's land and the maintainer's push.
- Update `AGENTS.md`, `README.md`, `docs/apply-worktree.md` and `docs/apply-worktree-dev.md` to point at the script and the document, including the README publish order.
- Add `npm run push:landed` and regression tests for selection, validation, remote reconciliation and idempotency.
- Do not change plugin code, plugin state, review records or the land behavior. Pushing remains the maintainer's explicit step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: add requirements for an explicit, verified landed-main push and its documentation. Existing archive-before-push and land-sequence requirements stay unchanged.

## Impact

- New `scripts/push-landed.mjs` and `test/push-landed.test.mjs`.
- New `docs/land-push.md`; link or section updates in `AGENTS.md`, `README.md`, `docs/apply-worktree.md` and `docs/apply-worktree-dev.md`. `docs/apply-worktree.md`'s out-of-scope push sentence and the README publish order are rewritten, not only linked.
- `package.json` gains the `push:landed` script; dependency, engine and package-manager fields are unchanged.
- No plugin runtime, tool schema, review record, apply state or landed manifest format changes.
