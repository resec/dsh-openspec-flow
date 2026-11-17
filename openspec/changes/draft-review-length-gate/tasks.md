# Tasks

## 1. Classification module

- [x] 1.1 Add `lib/review/length.js` with the 500-character limit, the ADDED/MODIFIED/legacy classification, the rename-chain baseline lookup and the official handling text; verify `node --test test/review-length.test.mjs` covers 500 and 501 boundaries, ADDED, MODIFIED growth, unchanged legacy, shortened legacy and a rename.
- [x] 1.2 Add the brief renderer and gate-error renderer to `lib/review/length.js`; verify the unit tests assert the measured lengths, the no-compression rule, the dedicated-change split procedure and the draft-resume action in both outputs.

## 2. Draft review gate

- [x] 2.1 Load the change with `show <change> --type change --json` and each existing main spec with `show <spec> --type spec --json`, both through `withStore`; skip the spec call when the main spec does not exist and use the full nested capability id; verify tests cover a new capability, a store selection and a nested capability.
- [x] 2.2 Build the length report at draft start and resume and store it as the additive `length` field on the draft record; verify a draft integration test writes the field, a legacy record without it remains readable and a clean change records `blocking: false`.
- [x] 2.3 Pass the report to `buildDraftBrief` and render the `## Requirement length` section only when blocking or legacy entries exist, including the instruction to report a blocking length finding; verify the brief unit test contains the path, requirement, length, baseline, official handling and reviewer instruction, and omits the section on a clean change.
- [x] 2.4 Add the blocking result to `draftReadiness` reasons and return `openspec_review action=resume review=draft` only when a report exists and no finding is open; before a report, return the same `openspec_review action=wait` / `action=self-report` string as `gateAdvice` (with `review=apply` for an apply record), keep `dispose` when a finding is open, and skip the reason when the shared `applyStarted` value is true, including a store-backed change with no apply base; thread `applyStarted` through `submitReport` and every `projectReview`/status/wait path; verify tests cover both reviewer modes, the length-only action, a status-before-report, an open finding and a started apply.
- [x] 2.5 Recompute the report at the first `assertDraftReviewReady` and at apply review start or resume using the shared `applyStarted` value, but skip the recomputation once apply started; verify tests cover a legacy record at first apply entry, a changed baseline, a store-backed started apply resync and an apply review refusal.

## 3. Documentation and skill

- [x] 3.1 Add the gate, the blocking rule, the legacy exception, the draft-resume next action and the official handling to `docs/review.md`; verify `node --test test/review-doc.test.mjs` asserts the required no-compression sentence is present and no sentence instructs the author to compress.
- [x] 3.2 Add the draft length gate, the resume next action and the `docs/review.md` link to the README review section; verify the documentation test asserts all three.
- [x] 3.3 Change the propose skill's not-ready branch to resume a length-only block without disposing, carrying `review: "draft"` on every action it names; verify the skill-adaptation spec and the skill test assert the resume-without-dispose sentence and the review-kind scan passes.

## 4. Verification

- [x] 4.1 Run `npm run verify` on Node 24 and `openspec_inspect` with `action: "validate"` and `strict: true`; verify both pass and the report names the new coverage.

## Workflow follow-up

- Archive the change after the user asks and the apply review is ready.
