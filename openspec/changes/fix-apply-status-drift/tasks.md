# Tasks

## 1. Share the drift judgment

- [x] 1.1 Extract the draft-versus-current comparison and the waiver coverage out of the apply start into `planDriftState` in `lib/tools/review.js`, and keep the refusal message identical.
- [x] 1.2 Run the same helper in the apply `status` branch for a `draft` baseline with the draft policy enabled, and pass the unwaived files to readiness.

## 2. Gate readiness

- [x] 2.1 Add the `unwaivedPlanFiles` option to `draftReadiness`: one reason per file and `openspec_review action=waive scope=plan-change` as the next action, after an open finding and before a stale tree.

## 3. Guard the behavior

- [x] 3.1 In `test/review-apply.test.mjs`, assert that a passed apply review stays ready, that appending an uncommitted line to `tasks.md` makes status not ready and names the file while the record bytes stay unchanged, and that the plan-change waiver makes it ready again.
- [x] 3.2 Assert that a `baseline: "none"` apply review does not gate on plan drift.
- [x] 3.3 Move the tree with an implementation file in the "names resume with the apply kind" test, so a plan artifact does not also count as unwaived drift.
- [x] 3.4 Confirm the new assertions fail with `lib/tools/review.js` and `lib/review/readiness.js` stashed.

## 4. Describe the behavior

- [x] 4.1 Document the status check in `docs/review.md` and assert it in `test/review-doc.test.mjs`.

## 5. Verify

- [x] 5.1 Run `node --test test/review-apply.test.mjs test/review-unit.test.mjs test/review-doc.test.mjs`.
- [x] 5.2 Run `/tmp/b3/gates.sh fix-apply-status-drift`: strict validate, `openspec:check`, the requirement length gate, generated skills, `check:pr` and `npm run verify`.
