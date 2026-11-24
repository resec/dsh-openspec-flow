# Tasks

## 1. Restore the change lock

- [x] 1.1 In `lib/worktree/lock.js`, let `acquireLock` publish a given owner record in the lock it creates.
- [x] 1.2 In `lib/worktree/land.js`, after a failure before the merge that leaves no fresh change lock, re-create the released change lock under its original owner without waiting.

## 2. Guard the restore

- [x] 2.1 In `test/worktree-land.test.mjs`, assert that a dead-owner lifecycle lock fails land, keeps the state `active` with its token and puts the change lock back under that token.
- [x] 2.2 Assert that a change lock missing before the handover stays missing.
- [x] 2.3 Confirm the first assertion fails against the previous `land.js`.

## 3. Document

- [x] 3.1 Describe the restore in the land paragraph of `docs/apply-worktree.md`.

## 4. Verify

- [x] 4.1 Run `openspec validate fix-land-restore-change-lock --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs` and `npm run check:pr`.
- [x] 4.2 Run `npm run verify` on Node 24.
