# Tasks

## 1. Normalizer module

- [x] 1.1 Add `lib/review/waiver.js` with `normalizeWaiverFiles(files, { changeRoot, changePath })`, returning the sorted de-duplicated change-relative POSIX paths and a `refused` list of `{ input, reason }`; verify `node --test test/review-waiver.test.mjs` covers de-duplication, sorting and an empty input.
- [x] 1.2 Cover the accepted forms in `test/review-waiver.test.mjs`: change-relative, project-relative under the change directory, absolute under the change directory, and backslash separators; verify each case asserts the same change-relative output.
- [x] 1.3 Cover the refusals in the same file: a `..` escape, an absolute path outside, another change's `openspec/changes/<other>/…`, a project-relative `openspec/specs/theme/spec.md`, and `.`; verify each refuses and names the input. Keep the tool-level empty-entry drop as a separate case: `[' tasks.md ', '']` normalizes to `tasks.md`.
- [x] 1.4 Cover the store-backed case (`changePath: undefined`): change-relative and absolute paths normalize, while `openspec/changes/<change>/proposal.md` is refused with a message naming the change-relative form; verify the test asserts both outcomes.

## 2. Write path

- [x] 2.1 Normalize the incoming `files` and normalize `existing.files` before merging in `waivePlanChange`; verify `test/review-apply.test.mjs` asserts the stored `plan-change-waiver.json` carries only change-relative paths after a project-relative waiver.
- [x] 2.2 Rewrite a legacy record: seed a waiver with `openspec/changes/<change>/proposal.md` and `proposal.md`, run a second waiver, and verify the stored set holds one `proposal.md` and no prefixed duplicate.
- [x] 2.3 Verify a refused entry fails the call and names it while the stored file is unchanged; verify an empty entry is still dropped and the call succeeds, so the existing `[' design.md ', '']` expectation keeps passing.
- [x] 2.4 Verify the write path derives `changePath` with `relativeChangePath` and that a store-backed change refuses the project-relative form; assert the error names the change directory.

## 3. Compare path

- [x] 3.1 Normalize the recorded file set in `applyReviewEntry` with the same `changePath` before building `covered`; verify a test seeds the legacy project-relative waiver and a drift of `tasks.md`, then asserts `start review=apply` succeeds.
- [x] 3.2 Assert the start error names the uncovered drift files, the change-relative basis and the `files: ["proposal.md","tasks.md"]` example; verify by regex over the error text.
- [x] 3.3 Verify `resume review=apply` uses the same normalized comparison; assert a second-round test with a legacy record resumes instead of refusing.
- [x] 3.4 Verify a legacy record with an entry that cannot be normalized does not block a start whose drift is covered by the remaining entries; assert start succeeds and the brief shows only the normalized set.

## 4. Waiver result

- [x] 4.1 Compute the uncovered drift in `waivePlanChange` when the apply record and the draft state exist, and report the uncovered files with `ready: false`; verify a test covering only `proposal.md` asserts `reasons` names `tasks.md`.
- [x] 4.2 Report `ready: false` with a coverage reason when apply started but no apply review record exists; verify the test asserts the reason mentions the apply review start.
- [x] 4.3 Report `ready: false` without calling `draftObject` when the draft review is disabled but the apply review is enabled; verify the waiver file is written and the test asserts no failure, using the existing draft-disabled apply fixture.
- [x] 4.4 Report `ready: true` only when the apply record exists, the drift is non-empty and every file is covered; verify a test asserts the covered case, and that an empty drift reports `ready: false` with the no-drift reason.
- [x] 4.5 Treat a legacy draft record without `artifactFiles` as an empty drift in the coverage result; verify a test deletes `artifactFiles`, records a waiver and asserts the result lists no artifact as uncovered.
- [x] 4.6 Verify a waiver with neither a draft record nor an apply record is still refused by the apply-started gate; assert the existing refusal test still passes.

## 5. Contract text

- [x] 5.1 Update the `files` parameter description in `lib/tools/review.js` to state the accepted forms, the change-relative recording and the refused forms; verify `node --test test/descriptions.test.mjs` passes.
- [x] 5.2 Update `README.md`, `docs/review.md`, `skills/openspec-apply-change/SKILL.md` and the plan-change sentence in `lib/policy.js` with the path basis, the accepted forms and the example; verify `test/policy.test.mjs` and `test/review-doc.test.mjs` pass after their assertions follow the text.
- [x] 5.3 Add the path basis and the `files: ["proposal.md","tasks.md"]` example to the `waive` refusal message; verify the apply test asserts the example string.

## 6. Integration

- [x] 6.1 Run `node --test test/review-waiver.test.mjs test/review-apply.test.mjs test/review-seal.test.mjs` on Node 24 and verify every test passes.
- [x] 6.2 Run `npm run verify` on Node 24 and verify the test summary and the coverage verdict both pass.
- [x] 6.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify the change passes.

## Workflow follow-up

- Commit the implementation, then run the apply review before archive.
- Archive only on user request.
