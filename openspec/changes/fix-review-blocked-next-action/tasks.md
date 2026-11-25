# Tasks

## 1. Change the next action

- [x] 1.1 In `lib/review/readiness.js`, count a latest report with verdict `blocked` or `changes-requested` and no open finding as a state cleared by the next round, so `nextAction` names `resume`.

## 2. Guard the behaviour

- [x] 2.1 Assert the resume next action for self and reviewer modes and for draft and apply reviews in `test/review-unit.test.mjs`, `test/review-draft.test.mjs`, `test/review-wait.test.mjs` and `test/review-reviewer.test.mjs`.
- [x] 2.2 Assert the next action on the existing stale draft blocked submit in `test/review-reviewer.test.mjs`.
- [x] 2.3 Confirm the new assertions fail against the previous `needsRound` computation.

## 3. Describe the step

- [x] 3.1 Update `docs/review.md`, `README.md` and the propose and apply skills.

## 4. Verify

- [x] 4.1 Run `node --test test/review-unit.test.mjs test/review-draft.test.mjs test/review-wait.test.mjs test/review-reviewer.test.mjs test/review-doc.test.mjs test/skills.test.mjs`: 244 passed, 0 failed.
- [x] 4.2 Run `/tmp/b3/gates.sh fix-review-blocked-next-action`: strict validate, `openspec:check` (117 passed), length gate, generated skills, `check:pr` and `npm run verify` (1345 passed; plugin lines 98.63%, branches 93.59%, functions 99.21%; new code 100.00% / 100.00%) all pass.
