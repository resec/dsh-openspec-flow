# Tasks

## 1. Round revision storage

- [x] 1.1 Add round revision accessors and defaults in `lib/review/record.js` so an absent `revisions` array reads as empty and a new revision gets the next padded number; verify with unit tests in `test/review-unit.test.mjs`.
- [x] 1.2 Add `lib/review/revision.js` to archive the current brief, an optional report and a `meta.json` under `round-N/revisions/MM/`, then update the round pointers; verify with a test that reads back the archived bytes and the record entries.
- [x] 1.3 Keep the review record readable across old and new layouts: a record without `revisions` loads unchanged and an archived record keeps its existing round fields; verify in `test/review-unit.test.mjs`.

## 2. Draft resume refreshes an unreported or blocked attempt

- [x] 2.1 Replace the stale-close path in `lib/tools/review.js`: when the latest attempt is unreported or blocked and the object differs or the attempt is blocked, archive it and refresh the same round without adding a `rounds` entry; verify with a draft test asserting the unchanged round number and the new brief.
- [x] 2.2 Keep a substantive report on the existing path so only `pass` or `changes-requested` opens the next round; verify with a test that the round number advances after a substantive report and not after a blocked one.
- [x] 2.3 Wake the same slot reviewer for the same round after a refresh, and keep the unchanged unreported round silent; verify both wakeup paths in `test/review-draft.test.mjs`.

## 3. Blocked submits and readiness

- [x] 3.1 In `lib/review/submit.js`, store a draft `blocked` report file without changing recorded findings, while apply review keeps its current behavior; verify with a reviewer test that a blocked report keeps its findings in the file and leaves `record.findings` unchanged.
- [x] 3.2 In `lib/review/readiness.js`, treat a latest blocked draft report as an unreported attempt and return the same-round `resume` next action; verify with readiness tests for blocked, stale and substantive reports.
- [x] 3.3 Keep the stale submit restriction (blocked only, no findings) and the unchanged-object submit path; verify both accepted and refused submissions in the reviewer tests.

## 4. Status and schema

- [x] 4.1 Project an optional `revisions` summary (round, revision, object hash, cause, archive time, brief and report paths) from the draft record; verify with a status test that names an archived attempt.
- [x] 4.2 Declare the optional `revisions` array in the `openspec_review` output schema; verify `test/descriptions.test.mjs` names the declaration and `test/review-draft.test.mjs` covers a status result with and without the array.
- [x] 4.3 Keep the tool description aligned with the result fields; verify `test/descriptions.test.mjs` passes.

## 5. Watch

- [x] 5.1 Deduplicate watch notices by object version, retain every notice with its revision, and re-arm the watch after a refresh; verify in `test/review-watch.test.mjs`.
- [x] 5.2 Stop the watch at a report, including a blocked report, and keep the late-blocked-submit round check; verify both in the watch tests.

## 6. Documentation

- [x] 6.1 Rewrite the stale-round section in `docs/review.md` to describe the blocked-attempt refresh, the revision layout and the preserved audit; verify `test/review-doc.test.mjs`.
- [x] 6.2 Update the README review section with the blocked-attempt reuse and the revision location; verify `test/review-doc.test.mjs`.
- [x] 6.3 Update the flow rule text in `lib/policy.js` to follow the flow-policy requirement in full: one watch notice per changed object version with the optional blocked submit, the archived attempt with the same-round refresh that does not advance the round number, and the readable archived brief and hashes; rewrite the `test/policy.test.mjs` assertions that name the removed close behavior to cover all three statements, and verify both the policy tests and the policy consistency test pass.

## 7. Verification

- [x] 7.1 Run `npm run test:affected` for the touched modules and the full `npm run verify` on Node 24; verify both exit zero.
- [x] 7.2 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify no findings.

## 8. Attempt cards

- [x] 8.1 Give a refreshed draft review card its own attempt-suffixed file name and marker; verify with the card-path test in `test/review-cards.test.mjs`.
- [x] 8.2 Keep the replaced attempt's card and turn binding and let the refreshed report write a separate card; verify with the blocked-resume-pass test in `test/review-draft.test.mjs`.
- [x] 8.3 Document the attempt suffix and the preserved card in `docs/review.md`; verify `test/review-doc.test.mjs`.

## Workflow follow-up

- Start and complete the draft review for this change.
- Apply the change, commit each task group separately, and complete the apply review.
- Land and archive the change, then push the landed main.
