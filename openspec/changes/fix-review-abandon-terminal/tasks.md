# Tasks

## 1. Refuse the abandoned record

- [x] 1.1 Add one shared assertion in `lib/tools/review.js` and use it in finding `dispose` and `waive`, `self-report`, `retry`, `replace`, `waive-reviewer` and `extend`.
- [x] 1.2 Refuse an abandoned record on the `openspec_reviewer` `submit` path in `lib/review/reviewer-tool.js` before any report is written.

## 2. Guard the behavior

- [x] 2.1 Assert in `test/review-draft.test.mjs` and `test/review-apply.test.mjs` that an abandoned record refuses a single and a batch disposition, a finding `waive`, `self-report` and `extend` with unchanged record bytes, that `resume` still refuses, and that `status` and `report` still read the record.
- [x] 2.2 Assert in `test/review-reviewer.test.mjs` that an abandoned record refuses the slot reviewer's `submit`, `retry`, `replace` and `waive-reviewer` for both review kinds, with no message, activation or wakeup.
- [x] 2.3 Confirm the four cases fail against the previous implementation.

## 3. Sync the documents

- [x] 3.1 State the terminal state in the abandoned-review row of `docs/review.md` and guard it in `test/review-doc.test.mjs`.

## 4. Verify

- [x] 4.1 Run `node --test test/review-draft.test.mjs test/review-apply.test.mjs test/review-reviewer.test.mjs` (198 pass) and `node --test test/review-doc.test.mjs` (27 pass).
- [x] 4.2 Run `openspec validate fix-review-abandon-terminal --strict`, `npm run openspec:check`, `npm run check:requirement-length` and `npm run check:pr`.
- [x] 4.3 Run `npm run verify` (1345 pass; lines 98.53%, branches 93.51%, functions 99.21%; new code 100% on all three).
