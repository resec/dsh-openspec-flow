# Tasks

## 1. Baseline contract

- [x] 1.1 Add the `baseline` parameter to the registered `openspec_review` schema and output schema, and update the tool and parameter descriptions to name the no-draft path; verify the schema declares an optional enum `draft`/`none` with `npm run test:affected -- lib/tools/review.js`.
- [x] 1.2 Resolve the baseline on apply start and resume (draft when the draft policy is enabled, none when disabled, recorded on resume), store it, refuse an explicit `none` when a draft record exists, refuse an explicit resume mismatch, and project it through status, report and legacy records; verify with new cases in `test/review-status-mode.test.mjs` and `test/review-apply.test.mjs`.
- [x] 1.3 Skip the draft-record, intent, plan-drift and waiver block when the baseline is `none`, refuse an explicit `none` at start when a draft record exists, require an explicit non-empty `base` only when the caller explicitly passes `baseline: "none"`, keep the explicit base source, and add the no-draft statement to the apply brief; verify start, resume, explicit-none missing base, draft-record refusal, draft-disabled baseline and its merge-base fallback, and the default draft-policy refusal in `test/review-apply.test.mjs`.
- [x] 1.4 Add the baseline to the apply brief header and omit the intent and plan-change sections when it is `none`; verify the brief assertions in `test/review-apply.test.mjs` and `test/review-unit.test.mjs`.

## 2. Ignore check

- [x] 2.1 Extend the review-ignore helper to accept the review directory and skip writing `openspec/.gitignore` when `git check-ignore` reports the directory already ignored; keep the write on a clean miss, a failed check and a non-git project; verify with new cases in `test/review-unit.test.mjs`.
- [x] 2.2 Pass the review directory from the policy creation, the ignore assertion and the non-git apply-lock path; verify the existing lock and apply tests still pass with `npm run test:affected -- lib/review/policy.js lib/review/apply-lock.js`.
- [x] 2.3 Add a case proving that a repository-level ignore leaves no new `openspec/.gitignore` and the worktree stays clean; verify with `test/review-unit.test.mjs` or `test/review-lock.test.mjs`.

## 3. Documentation

- [x] 3.1 Update the README `openspec_review` row with the optional `baseline`, its `draft` default and its `none` value; add the row assertion in `test/review-doc.test.mjs` and verify with `node --test test/review-doc.test.mjs test/descriptions.test.mjs`.
- [x] 3.2 Update `docs/review.md` with the no-draft apply path, the explicit base requirement, the skipped draft checks, the draft-record refusal, the draft-disabled baseline and the ignore-write behavior; add document assertions in `test/review-doc.test.mjs` and verify the suite passes.

## 4. Integration verification

- [x] 4.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` for the change; verify it reports no warnings.
- [x] 4.2 Run `npm run test:affected -- lib/tools/review.js lib/review/store.js lib/review/policy.js lib/review/apply-lock.js` and then `npm run verify` with Node 24 from `.cache/toolchain/node/bin`; verify the summary and coverage pass.
- [x] 4.3 Commit the implementation, then run the apply review and confirm it is ready before archive.

## Workflow follow-up

- Archive the change after the apply review is ready.
- Push after this change is archived and `npm run verify` passes.
