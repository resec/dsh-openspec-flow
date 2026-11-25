# Tasks

## 1. Shared gh execution layer

- [ ] 1.1 Add `scripts/gh-exec.mjs` and create `test/gh-exec.test.mjs`; verify the test proves a deadline kill surfaces as a transient error carrying the command and deadline, and that `maxBufferBytes` is raised above the default
- [ ] 1.2 Extend `scripts/gh-retry.mjs` with `attempts` and `delays` options and teach `isTransientGhFailure` the deadline-kill error; verify the extended `test/gh-retry.test.mjs` covers three attempts, the 1 s / 3 s backoff and a non-transient error that is never retried
- [ ] 1.3 Implement the environment overrides and their fallback to documented defaults (`PR_REVIEW_GH_TIMEOUT_MS`, `PR_REVIEW_GH_ATTEMPTS`, `PR_REVIEW_GH_BACKOFF_MS`, `PR_REVIEW_GH_POLL_TIMEOUT_MS`, `PR_REVIEW_GH_PROBE_TIMEOUT_MS`, `PR_REVIEW_GH_FETCH_TIMEOUT_MS`); verify the execution-layer test proves an out-of-range timeout, attempt count or backoff delay (each delay 0 – 30 s) is ignored and the documented default applies

## 2. Call-site migration

- [ ] 2.1 Route the watch `gh` helper and its `git fetch` through `gh-exec` and give the fetch its 30-second deadline; verify `node --test test/pr-review-watch.test.mjs` passes with the injected-gh tests unchanged
- [ ] 2.2 Route the owner-review `ghText` reads through `ghRead` and keep label writes on `ghWrite`; verify `node --test test/pr-review-owner-review.test.mjs` shows a transient read failure retried once more than before while a label write failure stays single-shot
- [ ] 2.3 Route the landing `gh` helper through the same layer, keeping update, merge, comment and label writes single-shot and the head poll after an update single-shot under `PR_REVIEW_GH_POLL_TIMEOUT_MS` (default 5000); verify `node --test test/pr-review-land.test.mjs` passes, a simulated deadline kill on a read is retried, and a stalled head poll is not retried and stays inside the batch's 10-second per-head wait bound
- [ ] 2.4 Route the `pr-local-shared` `gh` helper through the same layer; verify `node --test test/local-pr-retarget.test.mjs` and `node --test test/pr-review-lock.test.mjs` pass

## 3. Run lock recovery

- [ ] 3.1 Record `pid`, `pidStart` (field 22 of `/proc/<pid>/stat`, parsed after the last `)`) and `command` in `run.lock/owner.json` and implement the reclaim decision table; verify `node --test test/pr-review-watch.test.mjs` covers a dead PID, a matching live PID, a reused PID, an old owner file without identity fields and a corrupt owner file on both sides of the ten-minute rule, and proves a live owner's recorded start time is stable across two reads and differs from its RSS field
- [ ] 3.2 Make the reclaim check the moved owner after the rename, restore the directory when the moved owner differs from the judged stale owner, and release the lock only when `owner.json` names this process; verify the test proves two concurrent reclaimers produce exactly one winner, a reclaimer whose decision is delayed past a fresh acquisition restores the fresh lock instead of deleting it, a displaced owner's release leaves a later owner's lock in place, the `stale-lock-reclaimed pid=<pid> at=<iso>` line appears on stderr, and a `--json` result stays parseable
- [ ] 3.3 Perform a lock-recovery drill on the real repository (start a run that takes the run lock, such as `node scripts/pr-review-watch.mjs state --cleanup`, `SIGKILL` it, then run `node scripts/pr-review-watch.mjs poll --json`) and verify the second command prints the reclaim and completes; do not use the read-only `preflight` for the drill

## 4. Batched reconcile reads

- [ ] 4.1 Add the phase-1 lightweight list and phase-0 login read to `reconcileOwnerReview`; verify `node --test test/pr-review-owner-review.test.mjs` counts one login read and one list for a 30-pull-request fixture
- [ ] 4.2 Add the chunked GraphQL detail read with a 25-pull-request bound, the per-pull-request evidence shape and the `last:10` comment window, including the full-comment fallback for a watch entry that names the same head as commented; verify the test asserts at most four detail chunks for 85 pull requests, that one chunk failure falls back to per-pull-request reads, and that a pass marker outside the last 10 comments is still found through the fallback
- [ ] 4.3 Keep the existing decider as the only decision point and add the parity test: the same fixture evaluated through the batched path and through per-pull-request reads yields identical actions, reasons and recorded heads; verify `node --test test/pr-review-owner-review.test.mjs`
- [ ] 4.4 Read `files` only for a head-changed pull request and reuse the recorded change otherwise; verify the test covers a changed head that gains a second active change and an unchanged head that reuses state
- [ ] 4.5 Measure the live `node scripts/pr-review-owner-review.mjs --reconcile --apply` twice and record the duration and GitHub call count in the change; verify the clean run finishes under 25 seconds with at most eight calls

## 5. Preflight probe

- [ ] 5.1 Replace the `gh repo view` reachability read with the bounded probe and keep the result shape; verify `node --test test/pr-review-watch.test.mjs` reports `github-unreachable` when both probe attempts are killed by the deadline
- [ ] 5.2 Bound the `git fetch origin main` deadline; verify the test reports `origin-unreachable` when the fetch is killed and leaves the rest of the preflight result populated
- [ ] 5.3 Measure the live `node scripts/pr-review-watch.mjs preflight --json` under a stalled path (block the host with a local firewall rule or an unreachable override) and record that it reports offline within about ten seconds

## 6. Run telemetry

- [ ] 6.1 Append one telemetry line from each watch, owner-review and landing command that takes the run lock, write none from a command that takes no run lock (`preflight`, the plain `state` view and the landing `state` command), and trim the file to the most recent 2000 lines during `state --cleanup`; verify `node --test test/pr-review-watch.test.mjs` covers the append, the trim, the commands without the run lock and an unchanged `--json` result
- [ ] 6.2 Verify a real `--reconcile` run appends exactly one line with a plausible `ghCalls` count and that a dry run writes the same line shape

## 7. Documentation

- [ ] 7.1 Document the deadline, retry policy, environment overrides with their documented ranges (including the head-poll deadline), lock recovery marker, batched reconcile reads, probe bound and telemetry file in `docs/pr-review.md`, and create `test/pr-review-doc.test.mjs` asserting the documented variables and defaults match the modules' defaults; verify `node --test test/pr-review-doc.test.mjs`
- [ ] 7.2 Confirm `docs/pr-review.md`'s session-flow commands still run as written in a dry run; verify by running the reconcile dry run and the preflight command and comparing the documented output shape

## 8. Integration verification

- [ ] 8.1 Run `npm run verify` on Node 24 and `openspec_inspect` with `action: "validate"` and `strict: true`; verify both pass and record the results in the change
- [ ] 8.2 Run one complete scheduled round end to end and record its wall-clock time, GitHub call count and telemetry lines; verify the round finishes within its five-minute window without a stale lock left behind

## Workflow follow-up

- Archive the change after the apply review is ready and the user asks for the archive.
- Keep the existing five-minute schedule and the fixed session unchanged.
