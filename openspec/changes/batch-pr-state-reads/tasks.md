# Tasks

## 1. Batched state reader

- [x] 1.1 Move the origin-remote resolver into `scripts/pr-review-watch.mjs` as an export and import it from `scripts/pr-review-owner-review.mjs`; verify `node --test test/pr-review-owner-review.test.mjs` passes.
- [x] 1.2 Add `readPullRequestStates({ root, numbers, gh })` that asks for `state` in chunks of at most 100 numbers and returns one map holding every requested number; verify new tests show one gh call for 88 numbers and two for 101.
- [x] 1.3 Resolve a number the batch left unresolved with exactly one per-number read, and fail the command when that read fails; verify tests cover a null alias resolved by one read and a failed individual read failing the command.
- [x] 1.4 Read every number individually without issuing a batch when the origin remote names no GitHub repository; verify a test asserts no GraphQL call and one read per number with the same removed and retained output.
- [x] 1.5 Apply the batch-failure policy: re-read a batch that fails for a non-transient reason one number at a time, and report a transient batch failure after its attempts; verify tests cover a rejected query falling back per number and a transient failure issuing no per-number read.
- [x] 1.6 Remove `mergedAt` from every state read; verify `grep -rn mergedAt scripts/` returns nothing.

## 2. Cleanup wiring

- [x] 2.1 `cleanupClosedPullRequests` reads the union of tracked and local numbers once and decides removals from the map the reader returns; verify the cleanup test asserts one gh call for 88 entries, unchanged removed and retained results, and that a failed individual re-read fails the command.
- [x] 2.2 `cleanupLocalEntries` accepts that map and keeps its phase rules, falling back to a per-entry read when no map is supplied; verify its existing tests pass and a new case decides a local entry from the map.
- [x] 2.3 Add an agreement test that evaluates one pull request once from a batch and once from its own read; verify both reach the same removal decision and retained report.
- [x] 2.4 Update the session-flow sentence and the batching paragraph in `docs/pr-review.md`, including the origin-remote fallback; verify `node --test test/pr-review-doc.test.mjs` passes and the documented command reproduces the same cleanup output.

## 3. Verification

- [x] 3.1 Run `npm run test:affected -- scripts/pr-review-watch.mjs scripts/pr-review-owner-review.mjs` on Node 24 and confirm every selected test file passes.
- [x] 3.2 Run `node scripts/pr-review-watch.mjs state --cleanup` on the real repository and read the last `state --cleanup` line of `.cache/pr-review/runs.jsonl`; verify one GitHub call and a duration under two seconds.
- [ ] 3.3 Run `npm run verify` on Node 24 and record the test summary and coverage verdict.
