# Tasks

## 1. Scope the waiver

- [ ] 1.1 Record the round number and the object hash of the unreported round in `reviewerWaived` when `waive-reviewer` is approved.
- [ ] 1.2 Let the waiver skip only the missing report of that round on that object; run the verdict check whenever the latest round has a report.
- [ ] 1.3 Treat a later round as unwaived in readiness, in `wait` and in the wait deadline, and keep the reviewer wake and the draft round watch for it.

## 2. Guard the behavior

- [ ] 2.1 Assert in `test/review-unit.test.mjs` that the waiver covers its own round and object only, that a later `blocked` or `changes-requested` verdict and a later missing report fail readiness, and that a waiver without a recorded round keeps its scope.
- [ ] 2.2 Assert in `test/review-reviewer.test.mjs`, `test/review-wait.test.mjs` and `test/review-watch.test.mjs` that a round opened after a waiver wakes the reviewer, arms its own watch, waits and times out, and that its blocked or changes-requested report keeps `openspec_apply_next` refused.
- [ ] 2.3 Confirm the new assertions fail against the previous implementation.

## 3. Sync the documents

- [ ] 3.1 State the waiver scope in the unavailable-reviewer row of `docs/review.md` and guard it in `test/review-doc.test.mjs`.
