# Tasks

## 1. Skip the draft gate for a started apply

- [x] 1.1 In `lib/tools/apply.js`, read the recorded apply state for the change before the draft gate and treat status `active` or `landing` with an existing worktree as a resync.
- [x] 1.2 Skip `assertDraftReviewReady` on that path and reuse the recorded base commit for the worktree reuse; keep the gate for every other case.

## 2. Guard the resync

- [x] 2.1 Rework `test/review-apply.test.mjs`'s "a resync tolerates a missing main planning copy" so the session returns to the main root before the second call, and compare its state and worktree with the in-worktree call.
- [x] 2.2 Add tests that an unstarted change and a state without its worktree still fail on the missing planning copy, and that a landing apply reports the land refusal.
- [x] 2.3 Confirm the reworked and the landing tests fail against the previous `lib/tools/apply.js`.

## 3. Verify

- [x] 3.1 Run `node --test test/review-apply.test.mjs`.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-apply-resync-started`.
