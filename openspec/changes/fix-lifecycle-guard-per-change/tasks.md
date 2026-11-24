# Tasks

## 1. Guard by change

- [ ] 1.1 In `lib/worktree/lock.js`, record the held change locks by lock path and refuse a lifecycle request only for the change it names.
- [ ] 1.2 In `lib/worktree/lock.js`, remove only the released lock's entry.
- [ ] 1.3 In `lib/tools/write.js` and `lib/worktree/land.js`, name the change in every lifecycle request.

## 2. Guard the behavior

- [ ] 2.1 In `test/worktree-lock.test.mjs`, assert the same-change refusal, the other-change pass, the unnamed-request refusal and that a release keeps the other entries.
- [ ] 2.2 In `test/review-serial.test.mjs`, assert that `openspec_archive` archives a change while this process holds another change's lock.
- [ ] 2.3 In `test/worktree-land.test.mjs`, assert that land, a cleanup retry and remove proceed while this process holds another change's lock.
- [ ] 2.4 Confirm the new assertions fail against the previous `lock.js`.

## 3. Document

- [ ] 3.1 Describe the guard per change in `docs/apply-worktree.md` and `docs/review.md`.

## 4. Verify

- [ ] 4.1 Run `openspec validate fix-lifecycle-guard-per-change --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs` and `npm run check:pr`.
- [ ] 4.2 Run `npm run verify` on Node 24.
