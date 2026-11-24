# Tasks

## 1. Prompt

- [x] 1.1 Rewrite step 3 of the scheduled prompt in `docs/pr-review.md` so the run reads the recorded phase with `state`, resumes exactly one phase and stops; give `prepared`, `reviewed`, `archive-pending`, `archive-failed`, `archived`, `push-pending`, `pushed` and `review-failed` one bullet each, move push and finish out of `archive-pending`, and report `tree-mismatch`, `failed` and `blocked` as stops. Verify every open phase from `OPEN_PHASES` appears in the block with a `then stop`.
- [x] 1.2 Update the sentence after the prompt so a run that prepares, reviews, merges, archives, pushes, retries an archive or push failure, or finishes resumes from the recorded phase.

## 2. Test

- [x] 2.1 Export `OPEN_PHASES` from `scripts/pr-review-land.mjs` and extend the documentation test in `test/pr-review-land.test.mjs` to assert the prompt bullets equal that set and each phase instruction contains `then stop`; verify `node --test test/pr-review-land.test.mjs` passes.
- [x] 2.2 Revert `docs/pr-review.md` with `git stash push -- docs/pr-review.md`, run `node --test test/pr-review-land.test.mjs`, confirm the documentation test fails, then restore it with `git stash pop`.

## 3. Verification

- [x] 3.1 Run `/tmp/b3/gates.sh fix-prompt-all-phases` on Node 24 and verify strict validation, `openspec:check`, the requirement-length gate, the generated-skill check, `check:pr` and `npm run verify` all pass.
