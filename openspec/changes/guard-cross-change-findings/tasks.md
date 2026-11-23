# Tasks

## 1. Location parser

- [ ] 1.1 Add `lib/review/scope.js` with a pure function that identifies another change from a finding location, handling a trailing line or column, backslashes, `./`, `../` and `./../` resolved against `openspec/changes/<change>/`, an interior `..`, a nested-root repository-relative path such as `apps/web/openspec/changes/other/tasks.md`, a fixture path carrying the segment, an absolute path carrying the segment and `openspec/changes/archive/`; add unit tests in `test/review-unit.test.mjs` for each refused form and for the accepted forms (the reviewed change's own project-relative path, a main spec, a code path without the segment and a section heading); verify with `npm run test:affected -- lib/review/scope.js`.

## 2. Refusal in the shared submission

- [ ] 2.1 Pass the reviewed change from `submitReport` to `assertReport` and refuse a new finding whose location names another change, keeping `outOfScope` accepted and leaving legacy records without a recorded change unchanged; add draft and apply unit tests plus a no-report-stored assertion in `test/review-unit.test.mjs` and verify with `npm run test:affected -- lib/review/report.js lib/review/submit.js`.
- [ ] 2.2 Add a self-report refusal and out-of-scope resubmission test in `test/review-draft.test.mjs` and independent-reviewer refusal tests for draft and apply in `test/review-reviewer.test.mjs`, including a nested-root location and an interior `..`; verify the test files with `npm run test:affected -- test/review-draft.test.mjs test/review-reviewer.test.mjs`.

## 3. Brief boundary

- [ ] 3.1 Add the cross-change rule line to `buildDraftBrief` and `buildApplyBrief`, stating that another change's directory is outside the review even when it appears in the tree or workspace and that the concern belongs in `outOfScope`; assert both lines in `test/review-unit.test.mjs` and verify with `npm run test:affected -- lib/review/brief.js`.

## 4. Flow rule

- [ ] 4.1 Add the reviewer boundary to the draft and apply steps in `lib/policy.js`, keeping the changer's no-edit sentence, and assert the new text in `test/policy.test.mjs`; verify with `npm run test:affected -- lib/policy.js`.

## 5. Review document

- [ ] 5.1 Update `docs/review.md` with the finding boundary, the refusal and the `outOfScope` alternative, and the open-round rule; replace the statement that fields are validated only for type and non-emptiness so it names the additional location scope check, and assert the statements in `test/review-doc.test.mjs`; verify with `npm run test:affected -- docs/review.md`.

## 6. Integration

- [ ] 6.1 Run `openspec_inspect` with `action: "validate"` and `strict: true`, then `npm run openspec:check`, `npm run check:requirement-length` and `npm run verify` on Node 24; fix every failure before the apply review.

## Workflow follow-up

- Run the apply review and fix every blocker before landing.
- Land with user approval, then push the landed commits with `node scripts/push-landed.mjs --push`.
