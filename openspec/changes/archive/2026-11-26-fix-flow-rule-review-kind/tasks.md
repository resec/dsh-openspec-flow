# Tasks

## 1. Name the review kind in the flow rule

- [x] 1.1 Add `review: "draft"` to the `resume`, `self-report` and `wait` clauses of item 4, keeping the existing sentences intact.
- [x] 1.2 Add `review: "apply"` to the `resume`, `self-report` and `wait` clauses of item 6, and repeat the worktree path on `resume`.

## 2. Guard the rule

- [x] 2.1 Add a test in `test/policy.test.mjs` that splits each paragraph into clauses and fails when an `action: "x"` occurrence has no `review: "<paragraph kind>"` in its own clause; exempt a plan-change `waive`.
- [x] 2.2 Confirm the test fails against the previous text and passes against the fix.

## 3. Verify

- [x] 3.1 Run `openspec validate fix-flow-rule-review-kind --strict`.
- [x] 3.2 Run `npm test`, `npm run openspec:check` and `npm run verify` on Node 24; record the counts and the coverage verdict.
- [x] 3.3 Run `npm run layout:check` and `node scripts/check-pr-change.mjs --base origin/main`.
