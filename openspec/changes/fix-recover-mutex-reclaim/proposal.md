# Proposal

## Why

`recover` takes its mutex by creating `<lock>.recover.d` and writing an owner file into it, but a later run only treats the directory as busy. A recovery killed between those two steps leaves a mutex that no run ever re-reads, so every later recovery is refused with "another recovery holds", even after the recorded process is gone. `openspec_inspect` does not report that directory either, so the operator cannot see why recovery is blocked.

## What Changes

- Take the recovery mutex by creating the directory, and when it already exists, read its owner: a live owner refuses as before; a dead owner is moved aside, checked again against the observed token and pid, deleted only then, and the recovery retries once.
- Keep two concurrent recoveries from both claiming the stale mutex: the directory is renamed out of the way first, so only the caller that moved the observed owner reports a reclaim, and a changed or live owner is renamed back.
- Report an existing recovery mutex in `openspec_inspect action: "worktree"` with its own owner and state. A dead or unusable mutex becomes a `manual` repair naming the directory; the read never deletes it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `apply-worktree` already requires recovery to delete only a dead owner and inspection to report every lock's owner and liveness read-only; the mutex was not read for liveness and was not reported, so the change sets `skip_specs: true`.

## Impact

- `lib/worktree/lock.js`: inspect and reclaim the recovery mutex; expose the mutex facts from `inspectApplyLocks`.
- `lib/tools/query.js`: report a leftover mutex and its repair in the worktree inspection schema and doctor result.
- `test/worktree-lock.test.mjs`, `test/worktree-inspect.test.mjs`, `test/apply-worktree-doc.test.mjs`: cover the reclaim, the live refusal and the read-only report.
- `docs/apply-worktree.md`, `README.md`: describe the reclaim and the reported mutex.
- No dependency, workflow, hook, `dist/` or coverage-baseline change.
