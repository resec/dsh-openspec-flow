# Tasks

## 1. Record the gh calls

- [x] 1.1 Make the fake gh record every argument list and expose the `pr merge` calls.

## 2. Cover the gates

- [x] 2.1 Add one plan/prepare refusal per gate: closed, draft, zero or two active changes, `mergeable`, `DIRTY`, `CONFLICTING`, `BLOCKED`.
- [x] 2.2 Add the `merge` re-check matrix over the same PR fields, asserting no merge and an unchanged phase.
- [x] 2.3 Assert the success path calls `gh pr merge <n> --rebase` exactly, without `--admin`, `--squash`, `--merge` or `--force`.
- [x] 2.4 Cover `prepare`'s single-landing guard, `reviewed`'s watch and landing head checks, `archive`'s HEAD commit check and `finish`'s pushed head check.
- [x] 2.5 Mutate the implementation six ways (`--admin`, no merge-state gate, no draft gate, no open-state gate, no `assertSingleLanding` in prepare, no pushed-head check) and confirm the new cases fail each time.

## 3. Verify

- [x] 3.1 Run `node --test test/pr-review-land.test.mjs`.
- [x] 3.2 Run `npm run verify` on Node 24 and record the test and coverage summary.
- [x] 3.3 Run `npx openspec validate test-landing-gates --strict`, `npm run openspec:check` and `node scripts/check-requirement-length.mjs`.
