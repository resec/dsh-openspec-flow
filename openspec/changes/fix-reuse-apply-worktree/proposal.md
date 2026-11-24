# Proposal

## Why

The reuse path in `lib/worktree/create.js` compares the recorded path and branch strings and then checks `existsSync`, but never reads the checkout's `HEAD` or status. The reuse scenario requires a clean worktree on the expected branch, so a detached or dirty checkout is reused and the session moves into it; the problem only surfaces later at land's clean-worktree check, after the agent has done more work.

## What Changes

- Before reuse, read the worktree's checked-out branch and refuse when it is not the recorded branch, including a detached `HEAD`.
- Refuse reuse when `git status --porcelain` reports anything.
- Report an actionable error for both refusals and leave the state, lock, worktree and user changes untouched: no cleanup, no overwrite, no session move.
- Cover detached, dirty and other-branch refusals, plus the clean reuse that already works.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `apply-worktree` reuse scenario already limits reuse to an active state naming a clean worktree on the expected branch; only the implementation failed to check it, so this change sets `skip_specs: true`.

## Impact

- `lib/worktree/create.js`: the reuse branch of `createOrReuseApplyWorktree`.
- `test/worktree-create.test.mjs`: refusal and reuse cases.
- `docs/apply-worktree.md`: one sentence on the reuse precondition.
- No state, lock, land, dependency, workflow, hook, coverage-baseline or `dist/` change.
