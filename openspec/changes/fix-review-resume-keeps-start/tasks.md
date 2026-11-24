# Tasks

## 1. Reuse keeps the round start

- [x] 1.1 In `lib/tools/review.js`, stop the draft reuse path from writing `startedAt` when `resume` reuses an unreported round with an unchanged object.
- [x] 1.2 Stop the apply normal-round reuse path and the apply extra-round reuse path from writing `startedAt`; keep the object, commit and tree fields rebinding as before.
- [x] 1.3 Keep the wake rule unchanged: a reused round sends no wake message and starts no reviewer.

## 2. Tests and documentation

- [x] 2.1 Add wait tests for a draft round, an apply round and an apply extra round: `wait` is overdue, `resume` succeeds, `wait` is still overdue and points at `extend`, and `startedAt`, `extensions` and limits are unchanged. Verify with `node --test test/review-wait.test.mjs`.
- [x] 2.2 Stash `lib/tools/review.js` and confirm the three new tests fail with `waiting` instead of `overdue`; restore the file.
- [x] 2.3 Add one sentence on the kept start to the wait timeout entry of `docs/review.md` and guard it in `test/review-doc.test.mjs`.

## 3. Verify

- [x] 3.1 Run `/tmp/b3/gates.sh fix-review-resume-keeps-start` on Node 24: strict validation, `npm run openspec:check`, the requirement length gate, the generated skills check, `check:pr` and `npm run verify`; every step exits 0.
