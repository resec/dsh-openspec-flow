# Proposal

## Why

`test/pre-push-spec.test.mjs` points `CHANGE_DIR` at `openspec/changes/draft-review-length-gate`, a change that was archived long ago. The path never exists, so `splitSpec()` always reads the main spec and the test only runs `assert.match` against prose. It cannot notice a broken gate: `scripts/check-pre-push.mjs` could stop validating main specs or archived tasks, or stop requiring active changes to be `in-progress`, and the test would stay green. It reacts only when someone edits the spec text, which is not the behavior the hook needs.

## What Changes

- Rewrite `test/pre-push-spec.test.mjs` to run `scripts/check-pre-push.mjs` as the hook runs it, against a temporary project, so a broken scope decision fails the test.
- Cover the one case `test/check-pre-push.test.mjs` does not: an in-progress change whose delta the full `openspec validate --all --strict` rejects must not block the main-only gate. The test asserts the full check fails on that delta first, then asserts the gate passes and prints `pre-push gate: ok`.
- Drop the archived `draft-review-length-gate` constant and `splitSpec()`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `development-workflow` already requires a main-only push to validate main specs and archived tasks and to require every active change to report `in-progress`, and its `A main-only push ignores an in-progress change` scenario already says the hook does not validate that change. The script and `test/check-pre-push.test.mjs` already implement and cover that contract; only this stale prose test was adrift, so the change sets `skip_specs: true`.

## Impact

- `test/pre-push-spec.test.mjs`: replaced with one behavioral test.
- No implementation, hook, dependency, coverage-baseline or `dist/` change.
- The removed assertions matched spec prose only, not behavior. What they named is still guarded: the gate runs `openspec validate --specs --strict` and `--archived --strict` (asserted with the exact argv in `test/check-pre-push.test.mjs`), the coverage stamp and its skip order are covered by `test/coverage-stamp.test.mjs` and `test/hooks.test.mjs`, and OpenSpec strict validation plus review guard the spec text itself. Removing prose matching is therefore not a coverage loss, and no case from `test/check-pre-push.test.mjs` is repeated in the replacement.
