# Tasks

## 1. Brief content and unit tests

- [ ] 1.1 Add `baseCommit` and `baseSource` options, the `- base` header line and the five-bullet `## Base and diff` section to `buildApplyBrief`, replace only the diff/base-tree sentence in the existing Rules bullet with a pointer to that section and keep the plan-change sentence; extend `test/review-reviewer.test.mjs` with seal, explicit and merge-base labels, the fixed sentences for the committed tree and the empty diff, and assertions for the pointer and the plan-change sentence; verify `node --test test/review-reviewer.test.mjs` passes.

## 2. Base source, tool schema and integration

- [ ] 2.1 Compute `baseSource` from the trimmed `explicitBase` next to `baseCommit` in `applyReviewEntry` and pass both values to `buildApplyBrief`; add an assertion to the existing seal start test that the brief names the seal commit and identifies the source as the seal commit; verify `node --test test/review-apply.test.mjs` passes.
- [ ] 2.2 Assert `readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8') === ''` and the empty-diff warning in the existing seal start test; verify `node --test test/review-apply.test.mjs` passes.
- [ ] 2.3 Add an explicit-base brief assertion, a merge-base brief case using an `origin/main` ref and a blank-`base` case that falls back to the seal source; verify `node --test test/review-apply.test.mjs` passes.
- [ ] 2.4 Declare the optional `base` string with a description that names the apply review base in the registered `openspec_review` schema; add a catalog assertion for `type === 'string'`, a description mentioning the apply review base and absence from `required`, plus a case where a non-apply action with `base` behaves as if it were absent; verify `node --test test/review-apply.test.mjs` passes.

## 3. Documentation

- [ ] 3.1 Update the apply brief paragraph in `docs/review.md` with the three base sources, the diff scope, the empty-diff meaning and the optional `base`, update the README `openspec_review` row with the optional `base`, and add assertions to `test/review-doc.test.mjs` for both the `docs/review.md` sentence and the README row; verify `node --test test/review-doc.test.mjs` passes.

## 4. Verification

- [ ] 4.1 Run `npm run verify` on Node 24 and `openspec_inspect` with `action: "validate"` and `strict: true`; verify both pass.

## Workflow follow-up

- Apply and archive only when the user asks; this change stops after the draft review.
