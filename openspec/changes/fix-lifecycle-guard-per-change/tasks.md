# Tasks

## 1. Guard by change

- [x] 1.1 In `lib/worktree/lock.js`, record the held change locks by lock path and refuse a lifecycle request only for the change it names.
- [x] 1.2 In `lib/worktree/lock.js`, remove only the released lock's entry.
- [x] 1.3 In `lib/tools/write.js` and `lib/worktree/land.js`, name the change in every lifecycle request.

## 2. Guard the behavior

- [x] 2.1 In `test/worktree-lock.test.mjs`, assert the same-change refusal, the other-change pass, the unnamed-request refusal and that a release keeps the other entries.
- [x] 2.2 In `test/review-serial.test.mjs`, assert that `openspec_archive` archives a change while this process holds another change's lock.
- [x] 2.3 In `test/worktree-land.test.mjs`, assert that land, a cleanup retry and remove proceed while this process holds another change's lock.
- [x] 2.4 Confirm the new assertions fail against the previous `lock.js`.
  - Restored `lib/worktree/lock.js` from `a30f58f` and ran the three files: `test/worktree-lock.test.mjs` failed 2 (`a lifecycle request is refused only for the change lock it names`, `releasing one change lock keeps the other change lock registered`), `test/review-serial.test.mjs` failed 1 (`archive proceeds while this process holds another change's lock`), `test/worktree-land.test.mjs` failed 2 (`a cleanup retry proceeds…`, `remove proceeds…`). The unnamed-request and cross-repository cases pass on both versions, so they pin the conservative behavior instead of the fix.

## 3. Document

- [x] 3.1 Describe the guard per change in `docs/apply-worktree.md` and `docs/review.md`.

## 4. Verify

- [x] 4.1 Run `openspec validate fix-lifecycle-guard-per-change --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs` and `npm run check:pr`.
  - `openspec validate … --strict`: valid. `npm run openspec:check`: 117 passed, 0 failed. Requirement length gate: ok. `npm run check:pr`: ok.
- [x] 4.2 Run `npm run verify` on Node 24.
  - Node v24.22.2: 1349 tests passed, 0 failed. Coverage: line 98.63%, branch 93.62%, function 99.21%; new code 100% on all three.
