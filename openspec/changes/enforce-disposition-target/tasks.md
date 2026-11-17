# Tasks

## 1. Disposition target enforcement

- [x] 1.1 Add the disposition-kind check in `lib/tools/review.js` and call it from the `dispose` and finding `waive` paths before the change context loads; verify `test/review-draft.test.mjs` fails a call without `review` and the error names `draft` and `apply`.
- [x] 1.2 Add the draft freeze inside the review lock using `applyStarted`, with the message that points at the apply review status; verify a draft `dispose` and a draft finding `waive` fail after apply started and leave every finding and verification round unchanged.
- [x] 1.3 Prove the record isolation with a test whose draft and apply records both carry `R1-01`: verify `review: "draft"` changes only the draft record and `review: "apply"` changes only the apply record.
- [x] 1.4 Make `draftReadiness` return `openspec_review action=dispose review=<kind>` and remove `nextActionFor` and the dispose rewrite in `lib/review/reviewer-tool.js` while keeping its `readiness.ready ? 'openspec_archive' : nextAction` mapping; verify the status, wait and card next actions carry the kind, and add the wake-text assertion in `test/review-reviewer.test.mjs` that a passing apply submit wakes the changer with `openspec_archive`.
- [x] 1.5 Export `sealDraft` from `lib/tools/review.js` as the test seam and wrap its read-check-write in `withReviewLock`: re-read the record, recompute readiness, merge onto the fresh bytes and write only when the re-read still records no base; verify two unit tests: a record file changed after the caller's read keeps its change and gains `applyBaseCommit`, and a re-read whose readiness dropped refuses and leaves the file without a base. Also verify the existing apply tests pass.
- [x] 1.6 Carry the review kind through `assertReport` into `assertVerifications` in `lib/review/report.js`, with `submitReport` passing `record.review`, and leave `applyVerificationsTo` unchanged; verify `test/review-unit.test.mjs` asserts `openspec_review action=dispose review=draft` in the refusal and that a direct `assertReport` call with the kind passes.
- [x] 1.7 Add the missing kind to every draft disposition call site and the new next-action expectation in `test/review-draft.test.mjs`, `test/review-wait.test.mjs`, `test/review-cards-flow.test.mjs`, `test/review-reviewer.test.mjs` and `test/review-unit.test.mjs`; verify the five files pass.
- [x] 1.8 Prove the unaffected routes still write: verify an apply `dispose` after apply started disposes the apply findings, and a plan-change `waive` with `files` records the waiver.

## 2. Shipped skills name the kind

- [x] 2.1 Place `review: "draft"` immediately after every action the `## Draft review` section names (`start`, `self-report`, `wait`, `resume`, `dispose` and a finding `waive`), including clauses that do not repeat `openspec_review`; verify every action occurrence carries the kind before the next action occurrence.
- [x] 2.2 Place `review: "apply"` immediately after every action the `## Apply review` section names, including the `status` call and the `start` and `resume` clauses that do not repeat the tool name; verify every action occurrence carries the kind before the next action occurrence.
- [x] 2.3 Add the packaged-skill assertion in `test/skills.test.mjs`: isolate each section, scan every `action: "<action>"` occurrence, and require the section's kind between that occurrence and the next `action:` occurrence or the section end; verify it passes on the shipped skills and fails when the kind is removed from the propose `dispose` clause, whose next action occurrence is the `waive` clause.

## 3. Documentation

- [x] 3.1 Update the `docs/review.md` batch disposition paragraph, both dispose examples, the readiness next action and the failure table, and extend `test/review-doc.test.mjs` with the assertions that every dispose example carries `review` and the stated next action carries `review=<kind>`; verify the file passes and fails when an example loses its kind.
- [x] 3.2 Update the README review paragraph with the required kind, the draft freeze and the kind-qualified dispose next action, and add the README assertion in `test/review-doc.test.mjs`; verify the file passes and fails when either sentence or the qualification is removed.

## 4. Integration checks

- [ ] 4.1 Run `npm run test:affected -- lib/tools/review.js lib/review/readiness.js lib/review/reviewer-tool.js lib/review/report.js lib/review/submit.js skills test/skills.test.mjs test/review-doc.test.mjs` and verify the selected files pass.
- [ ] 4.2 Run `npm run verify` on Node 24 and verify the test summary and coverage verdict both pass.
- [ ] 4.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify there is no finding.

## Workflow follow-up

- Seal the ready draft with a commit that contains only this change directory, then apply when the user asks.
- Run the apply review after the last task, then archive only on request.
