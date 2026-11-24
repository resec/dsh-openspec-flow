# Tasks

## 1. Owner-review command and state

- [x] 1.1 Add `scripts/pr-review-owner-review.mjs` with `<n>`, `--reconcile`, `--apply` and dry-run modes, usage text and the watch run lock. Create `test/pr-review-owner-review.test.mjs` with command parsing, dry-run and lock cases; verify `node --test test/pr-review-owner-review.test.mjs` passes.
- [x] 1.2 Move the trusted-pass helper from `scripts/pr-review-land.mjs` to `scripts/pr-review-watch.mjs`, re-export it from the landing module for the existing test import, and preserve an existing `ownerReview` field when `preparePullRequest` records a new head. Add a watch regression test that prepares a new head and asserts the old owner-review head survives. Verify the watch and landing test files pass.
- [x] 1.3 Implement the eligibility and invalidation decisions against live PR state and the watch entry, including head mismatch, conflict, `UNKNOWN`, CI, trusted pass, `mergeable`, draft, base and active-change checks. Verify a decision matrix in the owner-review test suite covers add, keep and remove.
- [x] 1.4 Implement `owner-review` label writes and reconcile: inspect tracked PRs and open PRs carrying the label, add eligible labels, remove ineligible or orphaned labels, record or clear `ownerReview: { head, at }`, and leave state unchanged on a label failure. Apply the head-change sequence remove-then-add when the new head qualifies, preserve the label only for a tracked PR whose only disqualifier is `mergeable: UNKNOWN`, and remove an orphan label even when `mergeable` is `UNKNOWN`. Verify add/remove calls, state transitions, orphan removal, UNKNOWN preservation and failure retry cases.

## 2. Schedule and documentation

- [x] 2.1 Add `pr-review:owner-review` to `package.json` and update `docs/pr-review.md` with the commands, eligibility, invalidation, reconcile step, state field, revised non-goal and label-existence check (`gh label list --search owner-review`). Verify every documented command parses, the label check succeeds, and the owner-review test suite passes.
- [x] 2.2 Update `CONTRIBUTING.md` and `AGENTS.md` to describe the advisory queue label, its automatic removal and the unchanged `mergeable` authorization; extend `test/contributor-docs.test.mjs` to assert the signal and the authorization split. Verify that test file passes.
- [x] 2.3 Extend the owner-review integration tests for a head push with remove-then-add, a main-induced conflict, a `mergeable` arrival, a CI regression, an `UNKNOWN` reconcile and a reconcile-only backfill. Verify the tests exercise the scheduled order `state --cleanup`, reconcile, review, per-PR add.

## 3. Verification

- [x] 3.1 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify no warnings.
- [x] 3.2 Run `npm run test:affected -- scripts/pr-review-owner-review.mjs scripts/pr-review-watch.mjs scripts/pr-review-land.mjs` and `npm run verify` on Node 24; verify the suite and coverage pass.
- [ ] 3.3 Commit the implementation, run the apply review and fix every blocker; verify the review is ready before landing.

## Workflow follow-up

- Land the reviewed change and archive it on main.
- Push the land and archive commits and verify `origin/main`.
