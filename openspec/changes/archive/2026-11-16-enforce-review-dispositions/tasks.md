# Tasks

## 1. Dispositions argument gate

- [x] 1.1 Add failing cases in `test/review-draft.test.mjs` and `test/review-apply.test.mjs` for `start` and `resume` with a `dispositions` array (including `[]`): assert the call fails, names `action=dispose`, and leaves the record, round and findings unchanged; run both files and confirm the new cases fail.
- [x] 1.2 Implement the argument gate in `draftReviewEntry` and `applyReviewEntry` in `lib/tools/review.js`; run both review tests and confirm the new cases pass.
- [x] 1.3 Update the `dispositions` parameter description in `lib/tools/review.js` to name `dispose` and finding `waive`; verify `node --test test/descriptions.test.mjs` passes.
- [x] 1.4 Add `test/review-doc.test.mjs` assertions for the disposition ownership and `start`/`resume` rejection, then update `docs/review.md` and `README.md`; verify the new assertions fail before the document edit and pass after.

## 2. Resume gate and readiness precedence

- [x] 2.1 Add failing unit cases in `test/review-unit.test.mjs`: stale object plus an open finding names `dispose`, a fixed finding plus an open finding names `dispose`, and a stale object with no open finding still names `resume`; confirm they fail.
- [x] 2.2 Change `needsRound` in `lib/review/readiness.js` so `dispose` wins while any finding is open; run `test/review-unit.test.mjs` and confirm every case passes.
- [x] 2.3 Add failing draft and apply integration cases for the new round gate: an open finding blocks a new round with the error listing every open id and `action=dispose`, no round is recorded and no reviewer is woken; disposing every finding clears the gate; an open finding at the round cap yields the open-finding error, not the cap error. Adjust the existing `maxRounds: 1` cap cases in `test/review-draft.test.mjs` and `test/review-apply.test.mjs` to dispose the finding first so they still exercise the cap.
- [x] 2.4 Adjust `test/review-wait.test.mjs` so the new-round wake case disposes the finding before the two `resume` calls; the assertions keep testing the reviewer-service and changer-agent failures.
- [x] 2.5 Implement the open-finding gate in both `resume` paths inside the review lock, after the record re-read and before a round is written or the reviewer is woken; run `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-wait.test.mjs` and `test/review-unit.test.mjs` and confirm every case passes.
- [x] 2.6 Add `test/review-doc.test.mjs` assertions for the dispose-then-resume gate, then document the gate in `docs/review.md`; verify the new assertions fail before the document edit and pass after.

## 3. Reviewer read targets

- [x] 3.1 Add failing cases in `test/review-reviewer.test.mjs`: `own-report` with `round: 1` returns the first report, an unrecorded round and a round without a report each fail with their own message, `findings` returns ids, severities, statuses, titles, first/verification rounds, last verification and a per-round verdict/report summary, and the read leaves the record bytes unchanged; confirm the new cases fail.
- [x] 3.2 Implement the `findings` target and the `own-report` round selector in `lib/review/reviewer-tool.js`, extend `REVIEWER_OUTPUT_SCHEMA` with `findings` and `rounds`, and update the tool description and `target` parameter; run `test/review-reviewer.test.mjs` and confirm the new cases pass.
- [x] 3.3 Add `test/review-doc.test.mjs` assertions for the four read targets and the optional `round`, then update the reviewer action list in `docs/review.md`; verify the new assertions fail before the document edit and pass after.

## 4. Refused verification message

- [x] 4.1 Add failing unit cases in `test/review-unit.test.mjs`: `verified-fixed` against an `open`, a `deferred` and a `rejected` finding reports the status and `action=dispose` with `status=fixed`; against a `verified` and a `waived` finding it reports that the finding is closed and does not prescribe another disposal; confirm the new cases fail.
- [x] 4.2 Update `assertVerifications` in `lib/review/report.js` to scope the repair guidance and report the status; run `test/review-unit.test.mjs` and confirm every case passes.

## 5. Skills and version 0.6.1

- [x] 5.1 Add failing `test/skills.test.mjs` assertions for the fix, dispose, then resume order, the `dispositions` restriction and the finding `waive` route, then rewrite the review step in `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md`; verify the new assertions fail before the skill edit and pass after.
- [x] 5.2 Bump the plugin to 0.6.1 in `package.json`, both `version` fields in `package-lock.json`, the five `skills/*/SKILL.md` `metadata.generatedBy`, and `docs/upgrading-openspec-cli.md`; verify `node -e "console.log(require('./package.json').version)"` prints `0.6.1` and `node --test test/skills.test.mjs` passes.
- [x] 5.3 Finish the reviewer and disposition sentences in `README.md` and `docs/review.md`; verify `node --test test/review-doc.test.mjs` passes.

## 6. Integration

- [x] 6.1 Measure every delta requirement description and confirm none exceeds 500 characters: `node -e` over `openspec/changes/enforce-review-dispositions/specs/*/spec.md` printing each `### Requirement:` description length; confirm the MODIFIED resume body is at most 488 characters and the MODIFIED next-action body at most 397.
- [x] 6.2 Run `npm test` on Node 24 and confirm the full suite passes.
- [x] 6.3 Run `npm run coverage:check` and confirm the coverage gate passes.
- [x] 6.4 Run `openspec_inspect` with `action: "validate"` and `strict: true` and confirm the change passes.
- [x] 6.5 Run `npm run openspec:check` and confirm the active-change and main-spec checks pass.
- [x] 6.6 Commit the implementation and run the apply review; fix every blocker and confirm the review is ready.

## Workflow follow-up

- Archive the change only when the user asks, after the apply review is ready.
- Update `dist/` and reinstall the profile only in a later packaging change; this change leaves the installed 0.6.0 copy untouched.
