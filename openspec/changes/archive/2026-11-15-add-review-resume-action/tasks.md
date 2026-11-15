# Tasks

## 1. Action surface and round advance

- [x] 1.1 Add `resume` to `REVIEW_ACTIONS`, the `action` enum and its description in `lib/tools/review.js`, and dispatch it to the draft and apply resume entries; verify the tool schema test in `test/descriptions.test.mjs` and a dispatch test show `resume` reaches the new entry.
- [x] 1.2 Guard `start` for draft and apply reviews when a record exists, and make the error name `openspec_review action=resume review=<kind>`; verify a test calls `start` twice and gets the refusal, with `intent.md` unchanged.
- [x] 1.3 Implement draft `resume`: read the policy, `intent.md` and the record, then open a new round or reuse an unreported one through one shared helper; verify tests cover a second round, an unreported round, a passed review on the same object and an abandoned record.
- [x] 1.4 Implement apply `resume` with the existing git, clean-tree and draft artifact binding checks, and return the recorded brief when a passed apply review matches the current tree; verify tests cover an apply second round, a passed apply review, the refusal when no apply record exists and the draft hash mismatch.
- [x] 1.5 Keep `intent.md` write-once: `start` writes it, `resume` reads it, refuses a non-empty `intent` argument and refuses a file whose hash differs from the recorded intent hash; verify tests cover both refusals, assert the edited-intent message names removing the review record, assert the file bytes and the recorded hash stay unchanged, and cover a resume with a record but no `policy.json` whose message names the missing policy and the record removal.

## 2. Existing call sites

- [x] 2.1 Move every test that called `start` for a non-first call to `resume`, including the abandoned-record test in `test/review.test.mjs`; assert that `start` on an abandoned record names `resume` and that `resume` reports the abandoned review; verify `npm test` passes with no remaining non-first `start` call.
- [x] 2.2 Keep the first-round tests on `start` and confirm the reviewer activation test still asserts one reviewer for the first round; verify the reviewer slot assertions pass.

## 3. Next actions and errors

- [x] 3.1 Pass the review kind into `draftReadiness` so next actions read `openspec_review action=start review=<kind>` or `action=resume review=<kind>`, choose `resume` when the object changed or a finding is fixed, update the draft and apply gate errors to say "resume the next round", make the missing-`intent.md` gate error name removing the review record, and set the abandon result's `nextAction` to `openspec_new_change` with the record-removal advice in `reasons`; verify status tests for draft and apply plus the stale-object and fixed-finding cases, and tests for the gate message and the abandon result.
- [x] 3.2 Keep the no-record paths on `openspec_review action=start review=<kind>` and name both entries in the tool descriptions; verify `test/descriptions.test.mjs` and the status tests pass.

## 4. Skills, policy and documentation

- [x] 4.1 Update `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md` to start the first round with an intent and resume later rounds without one; verify `test/skills.test.mjs` passes.
- [x] 4.2 Update the flow rule in `lib/policy.js` so the draft and apply review steps name `resume` for later rounds; verify `test/policy.test.mjs` passes.
- [x] 4.3 Update `AGENTS.md`, `README.md` and `docs/review.md` to describe `start` as the first round and `resume` as the later-round entry, state that `intent.md` is written once and name removing the review record as the recovery for a lost intent file; add `resume` to `REQUIRED_ACTIONS` in `test/review-doc.test.mjs`; verify the documentation test passes.

## 5. Integration verification

- [x] 5.1 Run `npm test` on Node 24 and confirm the plugin suite passes, including the new resume tests.
- [x] 5.2 Run `npm run coverage:check` and confirm the gate passes.
- [x] 5.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` on this change and confirm no findings.

## Workflow follow-up

- Commit the implementation, then run the apply review before archive.
- Archive the change only after the apply review is ready and the user asks, then push `main` to `origin`.
