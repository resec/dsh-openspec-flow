# Tasks

## 1. Preflight classifier

- [x] 1.1 Add `lib/review/requirements.js` with the main-spec requirement index, the per-spec `to -> from` rename map and the rename-aware resolver; move `lib/review/length.js` to import them and verify `test/review-length.test.mjs` still passes with the extracted helpers.
- [x] 1.2 Add `classifyExecutionPreflight` in `lib/review/preflight.js` for the anchor check: a matching MODIFIED name, a missing MODIFIED, REMOVED or RENAMED `from`, a rename target resolved through its source, a chained rename and a missing main spec; verify the cases in `test/review-preflight.test.mjs` (add that file).
- [x] 1.3 Add the task path check to the same classifier: an existing path, a missing undeclared path, a declared create, a declared delete, a declared rename or move, a glob, an absolute path, a `..` segment, an ASCII-period clause boundary, a word-boundary verb match and the reported task line; verify all cases in `test/review-preflight.test.mjs`.
- [x] 1.4 Add the `## Execution preflight` section renderer and the blocking refusal message, including the issue rows, the draft resume action and the wait-for-an-adding-change-to-archive route; verify the rendered text in `test/review-preflight.test.mjs`.

## 2. Draft and apply gates

- [x] 2.1 Refactor `loadRequirementLength` in `lib/tools/review.js` into one plan-input read (deltas plus main specs) used by both the length classifier and the execution classifier; verify `test/review-length.test.mjs`, `test/review-draft.test.mjs` and `test/review-apply.test.mjs` pass with the same length behavior.
- [x] 2.2 Record the execution result on the draft record at `start` and `resume` and render the brief section; verify `test/review-draft.test.mjs` asserts the recorded field, the section and a cleared result after an edit.
- [x] 2.3 Add the blocking reason and the resume next action to `lib/review/readiness.js`; verify `test/review-unit.test.mjs` covers a no-finding execution block, an open finding, an unreported round and a started apply.
- [x] 2.4 Recompute the preflight at the first `openspec_apply_next` before apply starts, record it under the review lock and refuse a blocking result; verify `test/review-draft.test.mjs` covers the refusal, the record and the cleared path.
- [x] 2.5 Recompute the preflight at apply review `start` and `resume` and refuse a blocking result before the round opens; verify `test/review-apply.test.mjs` covers both entries and a cleared result.

## 3. Documentation and skill

- [x] 3.1 Add the execution preflight section to `docs/review.md`: the anchor check, the task path check, the recorded result, the blocking effect, draft `resume` for a no-finding block, the wait-for-an-adding-change-to-archive route and the two rechecks; verify `test/review-doc.test.mjs` asserts the new statements.
- [x] 3.2 Add the execution preflight to the README review section and link `docs/review.md`; verify `test/review-doc.test.mjs` asserts the README wording.
- [x] 3.3 Update `skills/openspec-propose/SKILL.md` so the no-finding block branch names the execution preflight alongside the requirement-length gate; verify `test/skills.test.mjs` asserts the wording.

## 4. Verification

- [x] 4.1 Run `npm run test:affected -- lib/review/preflight.js lib/review/requirements.js lib/tools/review.js lib/review/readiness.js lib/review/brief.js` on Node 24 and verify the selected tests pass.
- [x] 4.2 Run `npm run verify` on Node 24, `openspec_inspect` with `action: "validate"` and `strict: true`, and verify both pass.

## Workflow follow-up

- Commit the implementation in the apply worktree and run the apply review until it is ready.
- Land with `openspec_apply_worktree action=land`, then run `node scripts/push-landed.mjs` and `node scripts/push-landed.mjs --push`.
