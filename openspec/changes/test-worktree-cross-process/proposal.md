# Proposal

## Why

`openspec/specs/apply-worktree/spec.md` requires cross-process exclusion: a second apply from a different pid fails naming the change lock owner (330-338), two changes apply in parallel (354-362), and a dead owner's free lock is reacquired with the state token and pid replaced. Every existing test of those requirements ran in one process, where `heldChangeDomains` and the same-pid `reuseToken` path hid the process boundary. The three "session move fails" tests passed `agent: undefined`, so they asserted the missing-agent refusal instead of a failed move, and never checked the rollback a real failed move must trigger.

## What Changes

- Add `test/fixtures/lock-child.mjs` and `test/fixtures/lock-child-runner.mjs`: a child process that acquires the same `acquireLock`/`createOrReuseApplyWorktree` entries and reports its pid, token and worktree, with a release file so the overlap is deterministic rather than timed.
- `test/worktree-lock.test.mjs`: a child process holds the change lock; the parent's second acquisition fails naming the child pid and token, and the lock disappears when the child releases it.
- `test/worktree-create.test.mjs`:
  - A child process reacquires a dead owner's free lock and the state's `lockToken`/`lockPid` are replaced with the child's.
  - While a child is blocked inside one worktree's session move, another change reuses its worktree and a third change creates a new one, neither taking a lifecycle lock.
  - The three session-move tests now fail the move on a read-only target (a real `EACCES` from the Host's move), and assert the worktree, created branch, seal branch, seal ref, state, lock and cwd after the rollback.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `apply-worktree` already requires cross-process exclusion, dead-owner recovery and rollback on a failed move; only the tests were in-process or exercised a missing agent, so this change sets `skip_specs: true`.

## Impact

- `test/fixtures/lock-child.mjs`, `test/fixtures/lock-child-runner.mjs`: new child-process helper, not collected as a test.
- `test/worktree-lock.test.mjs`: one cross-process acquisition test.
- `test/worktree-create.test.mjs`: two cross-process tests and three rewritten session-move tests.
- No `lib/`, spec, doc, dependency, workflow, hook, coverage-baseline or `dist/` change.
