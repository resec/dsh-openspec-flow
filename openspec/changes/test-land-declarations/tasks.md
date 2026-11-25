# Tasks

## 1. Drive the post-merge tree guard from the flow

- [x] 1.1 Add a `tree` mode to the git race wrapper that commits a new file when `rev-parse HEAD^{tree}` runs on main, so the guard after `git merge --ff-only` sees a different tree.
- [x] 1.2 Assert the refusal keeps the concurrent head, archives nothing, writes no manifest, keeps the worktree and the `landing` state, and releases the lifecycle and change locks.
- [x] 1.3 Confirm the test fails when `assertLandedTree` is removed from `lib/worktree/land.js`.

## 2. Assert land does not push

- [x] 2.1 Add a bare remote to the test fixture, push `main` and the apply branch, and snapshot every remote ref before landing.
- [x] 2.2 Assert the completed land leaves every remote ref unchanged, including `refs/heads/main` and the apply branch.
- [x] 2.3 Confirm the test fails when a `git push` is added to `finishLand`.

## 3. Assert a retry writes one manifest

- [x] 3.1 Block the landed directory with a file so the manifest write fails, and leave the count to the state after the retry; the blocked path cannot hold a manifest, so a pre-retry count asserts nothing.
- [x] 3.2 Assert exactly one manifest and an unchanged `HEAD` after the retry.
- [x] 3.3 Confirm the test fails when `finishLand` writes a second manifest.

## 4. Verify

- [x] 4.1 Run `node --test test/worktree-land.test.mjs`.
- [x] 4.2 Run `npm run verify` on Node 24 after the test commit, and record the test summary and the coverage verdict.
- [x] 4.3 Run `openspec validate test-land-declarations --strict`, `npm run openspec:check` and `npm run check:pr`.
