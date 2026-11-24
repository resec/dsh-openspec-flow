# Proposal

## Why

`openspec/specs/apply-worktree/spec.md` makes three promises about `openspec_apply_worktree action=land` that no test exercises through the tool:

- "The merged tree differs" (`:440-443`) and "The main tree differs" (`:662-665`) promise that a post-fast-forward tree mismatch fails, archives nothing and never rewinds main. Only `assertLandedTree` is called directly by a unit test, so the in-flow guard at `lib/worktree/land.js:593` could be deleted without a failing test.
- "Land does not push" (`:445-448`) has no assertion at all; a `git push` added to `finishLand` would go unnoticed.
- "A retry does not write a second manifest" (`:478-481`) is only checked as "the manifest exists"; a second manifest file and a new commit on retry would go unnoticed.

A regression in any of these keeps the suite green, so the declarations are unverified.

## What Changes

- Drive the post-merge tree guard from the tool flow: a concurrent commit lands between the fast-forward and the tree check, so the check itself fails. Assert the failure keeps the concurrent head (no reset or rewind), archives nothing, writes no manifest, leaves the worktree and the `landing` state, and releases both locks.
- Add a bare remote to the fixture of a new land test, push `main` and the apply branch before landing, and assert every remote ref is byte-identical afterwards.
- Extend the manifest-write-failure retry test to count the manifest files (exactly one) and to assert the retry adds no commit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The spec already requires all three behaviors (`apply-worktree` "Land verifies both sides of the fast-forward", "Land fast-forwards and archives in one critical section", and "The landed manifest records the landed facts"); only the tests were missing, so this change sets `skip_specs: true`.

## Impact

- `test/worktree-land.test.mjs`: a `tree` mode for the existing git race wrapper, a no-push test, a flow-level tree-mismatch test, and two extra assertions in the retry test.
- No production code, spec, doc, dependency, hook, baseline or `dist/` change.
